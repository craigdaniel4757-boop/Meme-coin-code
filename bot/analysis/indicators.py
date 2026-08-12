"""Technical indicators computed from an OHLCV DataFrame.

Every function takes/returns plain `pandas.Series`/`DataFrame` and has no
side effects, so each one is independently unit-testable against hand
checkable sequences. `compute_indicator_snapshot` is the single entry point
the rest of the bot uses: it runs the full indicator set once per candidate
per scan cycle and returns an immutable snapshot of "the latest reading of
everything."

All periods are configurable via `IndicatorParams` (see config/default.yaml
`indicators:` section) rather than hard-coded, since the "right" period for
a coin trading 100x more volatile than a large-cap is a judgment call, not
a universal constant.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from bot.data.models import IndicatorSnapshot

MIN_BARS_FOR_ANALYSIS = 30


@dataclass(slots=True)
class IndicatorParams:
    rsi_period: int = 14
    ema_fast: int = 9
    ema_mid: int = 21
    ema_slow: int = 50
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    bollinger_period: int = 20
    bollinger_std: float = 2.0
    atr_period: int = 14
    volume_zscore_period: int = 20
    swing_lookback: int = 20
    vwap_period: int = 20


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's RSI. 100 when there have been no losses in the lookback,
    50 (neutral) when price hasn't moved at all."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + rs))

    no_losses = (avg_loss == 0) & (avg_gain > 0)
    flat = (avg_loss == 0) & (avg_gain == 0)
    result[no_losses] = 100.0
    result[flat] = 50.0
    return result


def macd(
    series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    macd_line = ema(series, fast) - ema(series, slow)
    signal_line = macd_line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def bollinger_bands(
    series: pd.Series, period: int = 20, num_std: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = sma(series, period)
    std = series.rolling(period).std(ddof=0)
    upper = mid + num_std * std
    lower = mid - num_std * std
    return upper, mid, lower


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    true_range = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def zscore(series: pd.Series, period: int = 20) -> pd.Series:
    mean = series.rolling(period).mean()
    std = series.rolling(period).std(ddof=0)
    return (series - mean) / std.replace(0, np.nan)


def rolling_swing_high(df: pd.DataFrame, lookback: int = 20) -> pd.Series:
    """Highest high of the `lookback` bars *preceding* the current one --
    i.e. the level the current bar needs to close above to be a breakout."""
    return df["high"].shift(1).rolling(lookback).max()


def rolling_swing_low(df: pd.DataFrame, lookback: int = 20) -> pd.Series:
    return df["low"].shift(1).rolling(lookback).min()


def slope_pct(series: pd.Series, lookback: int = 5) -> pd.Series:
    """% change of `series` over `lookback` bars -- a simple, comparable-
    across-tokens measure of trend strength/direction."""
    base = series.shift(lookback)
    return (series - base) / base.replace(0, np.nan) * 100


def rolling_vwap(df: pd.DataFrame, period: int = 20) -> pd.Series:
    """Rolling (not session-based -- meme coins trade 24/7 with no natural
    session open) volume-weighted average price over `period` bars: a
    volume-informed fair-value benchmark, distinct from the plain SMA/EMA
    used elsewhere. Falls back to NaN wherever the window has zero total
    volume."""
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    pv = typical_price * df["volume"]
    return pv.rolling(period).sum() / df["volume"].rolling(period).sum().replace(0, np.nan)


def compute_indicator_series(df: pd.DataFrame, params: IndicatorParams) -> pd.DataFrame:
    """Vectorized indicator computation over the *entire* series at once.

    Every indicator here is strictly causal -- built only from
    `.rolling()`/`.ewm()`/`.shift()`, which never look ahead -- so the
    value this produces at row `i` is identical to what you'd get calling
    `compute_indicator_snapshot(df.iloc[:i+1], params)` and reading its
    last row. That means a backtester can call this ONCE per candidate
    (O(n)) and look up each bar's row, instead of recomputing from scratch
    on a growing window for every bar (O(n^2)) -- see `snapshot_from_series_row`
    and bot/backtest/engine.py.
    """
    if df is None or df.empty:
        return pd.DataFrame()

    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    volume = df["volume"].astype(float)

    ema_f = ema(close, params.ema_fast)
    macd_line, signal_line, hist = macd(close, params.macd_fast, params.macd_slow, params.macd_signal)
    bb_upper, bb_mid, bb_lower = bollinger_bands(close, params.bollinger_period, params.bollinger_std)
    atr_s = atr(high, low, close, params.atr_period)

    out = pd.DataFrame(index=df.index)
    out["price"] = close
    out["rsi"] = rsi(close, params.rsi_period)
    out["ema_fast"] = ema_f
    out["ema_mid"] = ema(close, params.ema_mid)
    out["ema_slow"] = ema(close, params.ema_slow)
    out["macd"] = macd_line
    out["macd_signal"] = signal_line
    out["macd_hist"] = hist
    out["macd_hist_prev"] = hist.shift(1)
    out["bb_upper"] = bb_upper
    out["bb_mid"] = bb_mid
    out["bb_lower"] = bb_lower
    out["bb_bandwidth"] = (bb_upper - bb_lower) / bb_mid.replace(0, np.nan) * 100
    out["atr"] = atr_s
    out["atr_pct"] = atr_s / close.replace(0, np.nan) * 100
    out["volume_zscore"] = zscore(volume, params.volume_zscore_period)
    out["swing_high"] = rolling_swing_high(df, params.swing_lookback)
    out["swing_low"] = rolling_swing_low(df, params.swing_lookback)
    out["ema_fast_slope"] = slope_pct(ema_f, lookback=5)
    out["vwap"] = rolling_vwap(df, params.vwap_period)
    out["num_candles"] = np.arange(1, len(df) + 1)
    return out


def snapshot_from_series_row(series_df: pd.DataFrame, i: int) -> IndicatorSnapshot:
    row = series_df.iloc[i]

    def val(name: str) -> float | None:
        v = row.get(name)
        return float(v) if v is not None and pd.notna(v) else None

    return IndicatorSnapshot(
        price=float(row["price"]),
        rsi=val("rsi"),
        ema_fast=val("ema_fast"),
        ema_mid=val("ema_mid"),
        ema_slow=val("ema_slow"),
        macd=val("macd"),
        macd_signal=val("macd_signal"),
        macd_hist=val("macd_hist"),
        macd_hist_prev=val("macd_hist_prev"),
        bb_upper=val("bb_upper"),
        bb_mid=val("bb_mid"),
        bb_lower=val("bb_lower"),
        bb_bandwidth=val("bb_bandwidth"),
        atr=val("atr"),
        atr_pct=val("atr_pct"),
        volume_zscore=val("volume_zscore"),
        swing_high=val("swing_high"),
        swing_low=val("swing_low"),
        ema_fast_slope=val("ema_fast_slope"),
        vwap=val("vwap"),
        num_candles=int(row["num_candles"]),
    )


def compute_indicator_snapshot(df: pd.DataFrame, params: IndicatorParams) -> IndicatorSnapshot:
    """Compute every indicator and return the latest reading of each.

    Safe to call with fewer than `MIN_BARS_FOR_ANALYSIS` rows -- indicators
    that need more history than is available simply come back as `None`
    rather than raising, and callers (scoring.py) treat missing factors as
    neutral rather than penalizing a coin just for being too new to have
    deep history yet.
    """
    if df is None or df.empty:
        return IndicatorSnapshot(price=0.0, num_candles=0)
    series = compute_indicator_series(df, params)
    return snapshot_from_series_row(series, len(series) - 1)
