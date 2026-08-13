"""Multi-timeframe confirmation tests: resampling correctness, the "fails
open on insufficient history" contract, and -- most importantly -- that
`compute_higher_timeframe_trend_series` never leaks a future bar's data
into an earlier bar's reading (the same causality property
`compute_indicator_series` guarantees, and for the same reason: this is
precomputed once and reused across every bar/trial rather than recomputed
on a growing window).
"""

from __future__ import annotations

from bot.analysis.higher_timeframe import (
    compute_higher_timeframe_trend_series,
    higher_timeframe_confirms_uptrend,
    resample_ohlcv,
)
from bot.analysis.indicators import IndicatorParams
from tests.conftest import make_ohlcv


def test_resample_aggregates_ohlcv_correctly():
    df = make_ohlcv(n=10, start_price=1.0, volatility=0.0, seed=1)
    out = resample_ohlcv(df, bars_per_group=5)

    assert len(out) == 2
    assert out.loc[0, "timestamp"] == df.loc[0, "timestamp"]
    assert out.loc[0, "open"] == df.loc[0, "open"]
    assert out.loc[0, "close"] == df.loc[4, "close"]
    assert out.loc[0, "high"] == df.loc[:4, "high"].max()
    assert out.loc[0, "low"] == df.loc[:4, "low"].min()
    assert out.loc[0, "volume"] == df.loc[:4, "volume"].sum()


def test_resample_partial_trailing_group_included():
    df = make_ohlcv(n=12, start_price=1.0, seed=2)
    out = resample_ohlcv(df, bars_per_group=5)
    assert len(out) == 3  # groups of 5, 5, 2 -- the short trailing group still counts


def test_resample_bars_per_group_one_is_passthrough():
    df = make_ohlcv(n=10, seed=3)
    out = resample_ohlcv(df, bars_per_group=1)
    assert len(out) == len(df)
    assert list(out["close"]) == list(df["close"])


def test_resample_empty_df():
    df = make_ohlcv(n=10, seed=4).iloc[:0]
    out = resample_ohlcv(df, bars_per_group=5)
    assert out.empty


def test_higher_timeframe_confirms_uptrend_on_bullish_data():
    df = make_ohlcv(n=100, start_price=1.0, drift=0.01, volatility=0.005, seed=5)
    result = higher_timeframe_confirms_uptrend(df, IndicatorParams())
    assert result is True


def test_higher_timeframe_confirms_uptrend_false_on_bearish_data():
    df = make_ohlcv(n=100, start_price=1.0, drift=-0.01, volatility=0.005, seed=6)
    result = higher_timeframe_confirms_uptrend(df, IndicatorParams())
    assert result is False


def test_higher_timeframe_confirms_uptrend_none_on_insufficient_history():
    df = make_ohlcv(n=5, seed=7)  # far fewer bars than ema_mid's period needs
    assert higher_timeframe_confirms_uptrend(df, IndicatorParams()) is None


def test_higher_timeframe_confirms_uptrend_none_on_empty_df():
    df = make_ohlcv(n=5, seed=8).iloc[:0]
    assert higher_timeframe_confirms_uptrend(df, IndicatorParams()) is None


def test_trend_series_length_matches_input():
    df = make_ohlcv(n=200, seed=9)
    series = compute_higher_timeframe_trend_series(df, bars_per_group=15, params=IndicatorParams())
    assert len(series) == len(df)


def test_trend_series_early_bars_are_none():
    # Before the first higher-timeframe group has even fully closed, every
    # bar must report "unknown," never a guessed True/False.
    df = make_ohlcv(n=200, seed=10)
    bars_per_group = 15
    series = compute_higher_timeframe_trend_series(df, bars_per_group, IndicatorParams())
    assert all(v is None for v in series[:bars_per_group])


def test_trend_series_eventually_confirms_on_strong_uptrend():
    df = make_ohlcv(n=400, start_price=1.0, drift=0.01, volatility=0.004, seed=11)
    series = compute_higher_timeframe_trend_series(df, bars_per_group=15, params=IndicatorParams())
    assert series[-1] is True


def test_trend_series_never_looks_ahead():
    """Causality check: truncating the series to its first k bars must not
    change any already-computed reading for indices < k -- otherwise a
    bar's "higher timeframe" verdict would be leaking information from
    bars that, at that point in a live scan or backtest, haven't happened
    yet. Every index i < k always resolves to a higher-timeframe group
    that ends strictly before k (since `i // g * g <= i < k`), so the
    match must hold across the *entire* truncated range, not just some
    conservative prefix of it."""
    df = make_ohlcv(n=300, start_price=1.0, drift=0.003, volatility=0.01, seed=12)
    bars_per_group = 15
    params = IndicatorParams()

    full_series = compute_higher_timeframe_trend_series(df, bars_per_group, params)

    truncate_at = 200
    truncated_df = df.iloc[:truncate_at].reset_index(drop=True)
    truncated_series = compute_higher_timeframe_trend_series(truncated_df, bars_per_group, params)

    assert full_series[:truncate_at] == truncated_series
