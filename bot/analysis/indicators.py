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
    retest_lookback: int = 10
    retest_tolerance_pct: float = 3.0


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


def rolling_bandwidth_min(bandwidth: pd.Series, lookback: int = 20) -> pd.Series:
    """Lowest Bollinger bandwidth of the `lookback` bars *preceding* the
    current one -- how tight the most recent volatility squeeze was,
    excluding the current bar itself so a strategy can compare "now" against
    "the squeeze that just happened" rather than against itself."""
    return bandwidth.shift(1).rolling(lookback).min()


def rsi_divergence(close: pd.Series, rsi_series: pd.Series, lookback: int = 20) -> tuple[pd.Series, pd.Series]:
    """Bearish/bullish RSI divergence, as boolean series.

    A simplified, fully vectorizable approximation of textbook divergence
    (which compares price/RSI at two *confirmed swing points*, needing a
    peak-finding pass): this instead compares the current bar directly
    against the bar exactly `lookback` bars back, gated on the current bar
    being at -- or within a hair of -- a fresh extreme over that same
    window. Close enough to "the current vs. the prior swing" for a scan-
    time filter without a full peak-finding algorithm, at the cost of not
    handling multiple intermediate peaks as precisely as the textbook
    version would.

    Bearish: price makes a higher high than `lookback` bars ago while RSI
    reads *lower* than it did then, both while RSI is still in a bullish
    zone (>55) -- momentum fading even as price pushes to a fresh high.
    Bullish: the mirror image on the downside (fresh low, RSI higher than
    then, both <45).
    """
    price_prior = close.shift(lookback)
    rsi_prior = rsi_series.shift(lookback)
    rolling_high = close.rolling(lookback).max()
    rolling_low = close.rolling(lookback).min()
    near_high = close >= rolling_high * 0.999
    near_low = close <= rolling_low * 1.001

    bearish = near_high & (close > price_prior) & (rsi_series < rsi_prior) & (rsi_series > 55) & (rsi_prior > 55)
    bullish = near_low & (close < price_prior) & (rsi_series > rsi_prior) & (rsi_series < 45) & (rsi_prior < 45)
    return bearish.fillna(False), bullish.fillna(False)


def bearish_engulfing(df: pd.DataFrame) -> pd.Series:
    """True at bar i if it's a bearish (red) candle whose body fully
    engulfs the prior bar's bullish (green) body -- a classic single-bar-
    confirmed reversal pattern, used as one of the reversal-exit triggers
    in bot/strategy/risk_manager.py."""
    open_ = df["open"].astype(float)
    close = df["close"].astype(float)
    prev_open = open_.shift(1)
    prev_close = close.shift(1)
    prev_bullish = prev_close > prev_open
    current_bearish = close < open_
    engulfs = (open_ >= prev_close) & (close <= prev_open)
    return (prev_bullish & current_bearish & engulfs).fillna(False)


def breakout_retest_confirmed(
    close: pd.Series, low: pd.Series, swing_high: pd.Series,
    retest_lookback: int = 10, retest_tolerance_pct: float = 3.0,
) -> pd.Series:
    """True at bar i if, within the trailing `retest_lookback` bars: (a) a
    breakout above `swing_high` happened at some point, (b) price pulled
    back to within `retest_tolerance_pct` of that level at some point, and
    (c) the current bar has reclaimed the level. Used as an optional,
    stricter alternative to buying the initial break (see
    `bot/strategy/signals.py`'s `momentum_breakout`) -- a lot of
    technical trading practice waits for a level to be retested and hold
    before entering, since the initial break is where most false
    breakouts get chopped out and immediately reverse. The tradeoff is
    fewer signals: this only fires if a genuine pullback-and-reclaim
    happens, not on a straight-line breakout that never looks back.

    A simplified approximation, in the same spirit as `rsi_divergence`:
    rather than precisely tracking "the specific breakout bar, then the
    specific pullback low after it, then the reclaim," this checks that
    all three conditions are individually satisfiable within the trailing
    window, and measures the pullback against the *current* `swing_high`
    reading rather than its value back at the actual breakout bar. That
    reading tends to be stable across a genuine consolidation-after-
    breakout (price isn't making fresh highs, so the trailing high barely
    moves), which is exactly the scenario this is meant to catch.

    The pullback is deliberately checked over a *shorter*, more recent
    sub-window (half of `retest_lookback`, excluding the current bar) than
    the breakout itself: a breakout bar's own low commonly sits right at
    the level it just broke (that's what breaking out from below means),
    so checking the full window for "a low near the level" would trivially
    match the breakout bar itself even when nothing pulled back afterward.
    Restricting the pullback check to the more recent half forces an
    actual subsequent pullback for anything but a very fresh breakout.
    """
    pullback_window = max(2, retest_lookback // 2)
    had_recent_breakout = (
        (close > swing_high).shift(1).rolling(retest_lookback).max().fillna(0) > 0
    )
    pulled_back_near_level = (
        low.shift(1).rolling(pullback_window).min() <= swing_high * (1 + retest_tolerance_pct / 100)
    )
    reclaimed_now = close > swing_high
    return (had_recent_breakout & pulled_back_near_level & reclaimed_now).fillna(False)


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
    bandwidth = (bb_upper - bb_lower) / bb_mid.replace(0, np.nan) * 100
    out["bb_bandwidth"] = bandwidth
    out["bb_bandwidth_min_recent"] = rolling_bandwidth_min(bandwidth, params.bollinger_period)
    out["atr"] = atr_s
    out["atr_pct"] = atr_s / close.replace(0, np.nan) * 100
    out["volume_zscore"] = zscore(volume, params.volume_zscore_period)
    out["swing_high"] = rolling_swing_high(df, params.swing_lookback)
    out["swing_low"] = rolling_swing_low(df, params.swing_lookback)
    out["ema_fast_slope"] = slope_pct(ema_f, lookback=5)
    out["vwap"] = rolling_vwap(df, params.vwap_period)

    rsi_s = out["rsi"]
    bearish_div, bullish_div = rsi_divergence(close, rsi_s, params.swing_lookback)
    out["bearish_divergence"] = bearish_div
    out["bullish_divergence"] = bullish_div
    out["bearish_engulfing"] = bearish_engulfing(df)
    out["breakout_retest_confirmed"] = breakout_retest_confirmed(
        close, low, out["swing_high"], params.retest_lookback, params.retest_tolerance_pct
    )

    out["num_candles"] = np.arange(1, len(df) + 1)
    return out


def snapshot_from_series_row(series_df: pd.DataFrame, i: int) -> IndicatorSnapshot:
    row = series_df.iloc[i]

    def val(name: str) -> float | None:
        v = row.get(name)
        return float(v) if v is not None and pd.notna(v) else None

    def bool_val(name: str) -> bool:
        v = row.get(name)
        return bool(v) if v is not None and pd.notna(v) else False

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
        bb_bandwidth_min_recent=val("bb_bandwidth_min_recent"),
        atr=val("atr"),
        atr_pct=val("atr_pct"),
        volume_zscore=val("volume_zscore"),
        swing_high=val("swing_high"),
        swing_low=val("swing_low"),
        ema_fast_slope=val("ema_fast_slope"),
        vwap=val("vwap"),
        bearish_divergence=bool_val("bearish_divergence"),
        bullish_divergence=bool_val("bullish_divergence"),
        bearish_engulfing=bool_val("bearish_engulfing"),
        breakout_retest_confirmed=bool_val("breakout_retest_confirmed"),
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
