"""Indicator correctness tests -- deterministic, no network."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from bot.analysis import indicators as ind
from tests.conftest import OHLCV_COLUMNS, make_ohlcv


def test_ema_converges_to_constant_value():
    s = pd.Series([5.0] * 50)
    result = ind.ema(s, period=10)
    assert result.iloc[-1] == pytest.approx(5.0, abs=1e-6)


def test_rsi_bounded_and_trend_extremes():
    up = pd.Series(np.linspace(1, 2, 60))
    down = pd.Series(np.linspace(2, 1, 60))

    rsi_up = ind.rsi(up, period=14)
    rsi_down = ind.rsi(down, period=14)

    assert rsi_up.dropna().between(0, 100).all()
    assert rsi_down.dropna().between(0, 100).all()
    assert rsi_up.iloc[-1] == pytest.approx(100.0, abs=0.5)
    assert rsi_down.iloc[-1] < 5.0


def test_rsi_flat_series_is_neutral_fifty():
    s = pd.Series([3.0] * 40)
    result = ind.rsi(s, period=14)
    assert result.iloc[-1] == pytest.approx(50.0, abs=1e-6)


def test_bollinger_bands_ordering_and_mid_is_sma():
    df = make_ohlcv(n=100, seed=7)
    upper, mid, lower = ind.bollinger_bands(df["close"], period=20, num_std=2.0)
    tail = pd.concat([upper, mid, lower], axis=1).dropna()
    assert (tail.iloc[:, 0] >= tail.iloc[:, 1]).all()
    assert (tail.iloc[:, 1] >= tail.iloc[:, 2]).all()

    sma20 = ind.sma(df["close"], 20)
    pd.testing.assert_series_equal(mid, sma20, check_names=False)


def test_atr_is_non_negative():
    df = make_ohlcv(n=100, seed=9, volatility=0.02)
    result = ind.atr(df["high"], df["low"], df["close"], period=14)
    assert (result.dropna() >= 0).all()


def test_macd_flat_series_is_near_zero():
    s = pd.Series([2.0] * 80)
    macd_line, _, hist = ind.macd(s, fast=12, slow=26, signal=9)
    assert abs(macd_line.iloc[-1]) < 1e-9
    assert abs(hist.iloc[-1]) < 1e-9


def test_rolling_vwap_is_between_low_and_high_and_reacts_to_volume_weighting():
    df = pd.DataFrame(
        {
            "high": [1.0, 1.0, 1.0, 2.0],
            "low": [1.0, 1.0, 1.0, 2.0],
            "close": [1.0, 1.0, 1.0, 2.0],
            "volume": [1.0, 1.0, 1.0, 1000.0],  # last bar dominates the volume weighting
        }
    )
    vwap = ind.rolling_vwap(df, period=4)
    # heavily volume-weighted toward the last bar's price of 2.0
    assert vwap.iloc[-1] == pytest.approx(2.0, abs=0.01)
    assert 1.0 <= vwap.iloc[-1] <= 2.0


def test_rolling_vwap_nan_when_window_has_zero_volume():
    df = pd.DataFrame({"high": [1.0] * 5, "low": [1.0] * 5, "close": [1.0] * 5, "volume": [0.0] * 5})
    vwap = ind.rolling_vwap(df, period=5)
    assert vwap.isna().all()


def test_rolling_swing_high_excludes_current_bar():
    df = pd.DataFrame({"high": [1, 2, 3, 10, 4], "low": [1, 2, 3, 10, 4]})
    swing_high = ind.rolling_swing_high(df, lookback=3)
    # at index 3 (value 10), the swing high should be the max of the prior
    # 3 bars (1, 2, 3) = 3 -- NOT including the 10 itself.
    assert swing_high.iloc[3] == 3


def test_compute_indicator_snapshot_uptrend_is_bullish():
    df = make_ohlcv(n=150, start_price=1.0, drift=0.006, volatility=0.01, seed=1)
    snap = ind.compute_indicator_snapshot(df, ind.IndicatorParams())

    assert snap.num_candles == 150
    assert snap.ema_fast is not None and snap.ema_slow is not None
    assert snap.ema_fast > snap.ema_slow
    assert snap.ema_fast_slope is not None and snap.ema_fast_slope > 0


def test_compute_indicator_snapshot_downtrend_is_bearish():
    df = make_ohlcv(n=150, start_price=1.0, drift=-0.006, volatility=0.01, seed=2)
    snap = ind.compute_indicator_snapshot(df, ind.IndicatorParams())

    assert snap.ema_fast is not None and snap.ema_slow is not None
    assert snap.ema_fast < snap.ema_slow
    assert snap.ema_fast_slope is not None and snap.ema_fast_slope < 0


def test_compute_indicator_snapshot_empty_df_is_safe():
    empty = pd.DataFrame(columns=OHLCV_COLUMNS)
    snap = ind.compute_indicator_snapshot(empty, ind.IndicatorParams())
    assert snap.num_candles == 0
    assert snap.rsi is None
    assert snap.price == 0.0


def test_vectorized_series_matches_recompute_on_truncated_window():
    """compute_indicator_series precomputes every indicator over the whole
    series so the backtester can look up row i in O(1) instead of
    recomputing from scratch on a growing window (O(n) vs O(n^2)). That
    optimization is only valid because every indicator is strictly causal
    -- this test checks the equivalence it depends on actually holds."""
    df = make_ohlcv(n=120, seed=11)
    params = ind.IndicatorParams()
    full_series = ind.compute_indicator_series(df, params)

    for i in (60, 90, 119):
        fast = ind.snapshot_from_series_row(full_series, i)
        slow = ind.compute_indicator_snapshot(df.iloc[: i + 1], params)
        assert fast.num_candles == slow.num_candles
        assert fast.rsi == pytest.approx(slow.rsi, rel=1e-9, abs=1e-9)
        assert fast.ema_fast == pytest.approx(slow.ema_fast, rel=1e-9, abs=1e-9)
        assert fast.macd_hist == pytest.approx(slow.macd_hist, rel=1e-9, abs=1e-9)
        assert fast.atr == pytest.approx(slow.atr, rel=1e-9, abs=1e-9)
        assert fast.swing_high == pytest.approx(slow.swing_high, rel=1e-9, abs=1e-9)
        assert fast.vwap == pytest.approx(slow.vwap, rel=1e-9, abs=1e-9)
        assert fast.bb_bandwidth_min_recent == pytest.approx(slow.bb_bandwidth_min_recent, rel=1e-9, abs=1e-9)
        assert fast.bearish_divergence == slow.bearish_divergence
        assert fast.bullish_divergence == slow.bullish_divergence
        assert fast.bearish_engulfing == slow.bearish_engulfing


# -- rolling_bandwidth_min -------------------------------------------------------


def test_rolling_bandwidth_min_excludes_current_bar():
    bandwidth = pd.Series([10.0, 8.0, 5.0, 3.0, 20.0])
    result = ind.rolling_bandwidth_min(bandwidth, lookback=4)
    # at index 4 (value 20), the min of the prior 4 bars (10, 8, 5, 3) = 3
    # -- not including the 20 itself.
    assert result.iloc[4] == 3.0


# -- bearish_engulfing ------------------------------------------------------------


def test_bearish_engulfing_detects_classic_pattern():
    df = pd.DataFrame(
        {
            "open": [1.00, 1.05],
            "high": [1.06, 1.06],
            "low": [0.99, 0.94],
            "close": [1.05, 0.98],  # bar0 green, bar1 red and fully engulfs bar0's body
        }
    )
    result = ind.bearish_engulfing(df)
    assert bool(result.iloc[1]) is True


def test_bearish_engulfing_false_when_body_not_fully_engulfed():
    df = pd.DataFrame(
        {
            "open": [1.00, 1.02],
            "high": [1.06, 1.06],
            "low": [0.99, 0.99],
            "close": [1.05, 1.00],  # bar1 is red but its open doesn't clear bar0's close
        }
    )
    result = ind.bearish_engulfing(df)
    assert bool(result.iloc[1]) is False


def test_bearish_engulfing_false_when_prior_bar_not_bullish():
    df = pd.DataFrame(
        {
            "open": [1.05, 1.05],
            "high": [1.06, 1.06],
            "low": [0.94, 0.94],
            "close": [1.00, 0.95],  # both bars red -- no bullish bar to engulf
        }
    )
    result = ind.bearish_engulfing(df)
    assert bool(result.iloc[1]) is False


# -- rsi_divergence -----------------------------------------------------------


def test_rsi_divergence_flags_bearish_case():
    lookback = 5
    close = pd.Series([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.08, 1.10, 1.12, 1.15])
    rsi_series = pd.Series([50.0, 50.0, 50.0, 50.0, 50.0, 70.0, 68.0, 66.0, 64.0, 62.0, 60.0])

    bearish, bullish = ind.rsi_divergence(close, rsi_series, lookback=lookback)

    assert bool(bearish.iloc[10]) is True
    assert bool(bullish.iloc[10]) is False


def test_rsi_divergence_flags_bullish_case():
    lookback = 5
    close = pd.Series([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.92, 0.90, 0.88, 0.85])
    rsi_series = pd.Series([50.0, 50.0, 50.0, 50.0, 50.0, 30.0, 32.0, 34.0, 36.0, 38.0, 40.0])

    bearish, bullish = ind.rsi_divergence(close, rsi_series, lookback=lookback)

    assert bool(bullish.iloc[10]) is True
    assert bool(bearish.iloc[10]) is False


def test_rsi_divergence_no_signal_when_price_and_rsi_agree():
    """A healthy trend -- price and RSI both making fresh highs together
    -- is not divergence and must not be flagged as such."""
    lookback = 5
    close = pd.Series([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.08, 1.10, 1.12, 1.15])
    rsi_series = pd.Series([50.0, 50.0, 50.0, 50.0, 50.0, 55.0, 58.0, 61.0, 64.0, 67.0, 70.0])

    bearish, bullish = ind.rsi_divergence(close, rsi_series, lookback=lookback)

    assert bool(bearish.iloc[10]) is False
    assert bool(bullish.iloc[10]) is False
