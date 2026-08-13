"""Multi-timeframe trend confirmation: a final check, right before entry,
that a higher timeframe's trend hasn't already turned against a signal
fired on the base timeframe.

This is a well-established piece of professional discretionary and
systematic practice -- a breakout on a 1-minute chart against a falling
1-hour trend is a much weaker trade than the same breakout with the
1-hour trend still pointed up. It catches a class of false positive nose-
diving straight into a bigger-picture reversal that a single-timeframe
view cannot see at all.

Deliberately checked only at the point of actually entering a trade, not
for every scanned candidate: on the live path this means one extra candle
fetch per prospective entry rather than per candidate scanned, keeping
load on the (already carefully rate-limited, see bot/data/rate_limiter.py)
GeckoTerminal API bounded to the rare case of a real signal instead of
hundreds of candidates every cycle.

Fails *open*, not closed: a coin too young to have a meaningful higher-
timeframe history yet (most of what this bot trades) reports `None`
("unknown") rather than blocking the trade. That's a deliberate asymmetry
with the safety gates in bot/analysis/safety_filters.py -- those guard
against outright scams/rugs, where a false "safe" risks real money, so
they fail closed. This is a trade *quality/timing* filter, not a safety
gate; a false "confirmed" here risks a somewhat worse-timed entry, not a
scam, and requiring deep higher-timeframe history for every coin would
disqualify a lot of the very-early opportunities this bot exists to catch.
"""

from __future__ import annotations

import pandas as pd

from bot.analysis.indicators import IndicatorParams, compute_indicator_series, snapshot_from_series_row

OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def resample_ohlcv(df: pd.DataFrame, bars_per_group: int) -> pd.DataFrame:
    """Aggregate consecutive groups of `bars_per_group` bars into coarser
    OHLCV bars (first open, highest high, lowest low, last close, summed
    volume) -- a local approximation of a higher timeframe when there's no
    live API to fetch the real thing from, e.g. inside a backtest replaying
    a single fixed-timeframe series."""
    if df is None or df.empty or bars_per_group <= 1:
        return df.reset_index(drop=True) if df is not None else df

    df = df.reset_index(drop=True)
    group = df.index // bars_per_group
    out = df.groupby(group).agg(
        timestamp=("timestamp", "first"),
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        volume=("volume", "sum"),
    )
    return out.reset_index(drop=True)[OHLCV_COLUMNS]


def higher_timeframe_confirms_uptrend(df_higher: pd.DataFrame, params: IndicatorParams) -> bool | None:
    """`df_higher` is an already-fetched (or already-resampled) coarser
    OHLCV series for the same pair. Returns `None` if there isn't enough
    higher-timeframe history to judge yet, otherwise whether price is
    still above a short EMA that is itself above a medium EMA -- a partial
    bullish stack, not the full 3-EMA alignment `_trend_score` looks for
    on the base timeframe, since the higher timeframe naturally has far
    fewer bars available and demanding the full stack (needing the slow
    EMA's lookback too) would make this fail open almost always."""
    if df_higher is None or df_higher.empty:
        return None
    series = compute_indicator_series(df_higher, params)
    snapshot = snapshot_from_series_row(series, len(series) - 1)
    if snapshot.ema_fast is None or snapshot.ema_mid is None:
        return None
    return snapshot.price > snapshot.ema_fast >= snapshot.ema_mid


def compute_higher_timeframe_trend_series(
    df: pd.DataFrame, bars_per_group: int, params: IndicatorParams
) -> list[bool | None]:
    """Backtest counterpart of `higher_timeframe_confirms_uptrend`: for
    every bar `i` of the *base*-timeframe `df`, whether the last *fully
    closed* higher-timeframe bar (formed by grouping every
    `bars_per_group` base bars together) showed a bullish partial EMA
    stack. `None` where there isn't a fully-closed higher-timeframe bar
    yet, or it doesn't have enough history to compute EMAs.

    Computed once for the whole series rather than by resampling a
    growing window on every bar, for the same reason
    `compute_indicator_series` and `compute_pair_stats_series` are (see
    their docstrings in bot/analysis/indicators.py and
    bot/backtest/engine.py) -- this keeps repeated backtesting (the
    weight optimizer runs hundreds of trials per pool) from paying an
    O(bars^2) resampling cost.

    Deliberately always uses the *previous* higher-timeframe group,
    never the one bar `i` itself falls in -- that group is still forming
    as of bar `i`, and using it would leak bar `i`'s own future close
    into what's supposed to be an independent, already-settled reading.
    """
    n = len(df) if df is not None else 0
    if n == 0 or bars_per_group < 1:
        return [None] * n

    higher_df = resample_ohlcv(df, bars_per_group) if bars_per_group > 1 else df.reset_index(drop=True)
    higher_series = compute_indicator_series(higher_df, params)

    out: list[bool | None] = []
    for i in range(n):
        h_idx = (i // bars_per_group) - 1 if bars_per_group > 1 else i - 1
        if h_idx < 0 or h_idx >= len(higher_series):
            out.append(None)
            continue
        snapshot = snapshot_from_series_row(higher_series, h_idx)
        if snapshot.ema_fast is None or snapshot.ema_mid is None:
            out.append(None)
        else:
            out.append(bool(snapshot.price > snapshot.ema_fast >= snapshot.ema_mid))
    return out
