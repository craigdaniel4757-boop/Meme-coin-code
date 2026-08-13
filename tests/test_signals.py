"""Entry-signal strategy tests.

Most cases use hand-built `IndicatorSnapshot`s rather than generated
candles, so each assertion is checking one precise, obviously-correct
condition rather than hoping a random walk happens to land in the right
zone. One end-to-end test exercises real candle generation -> real
indicator computation -> strategy, as a sanity check that the pieces
actually connect.

Note on that end-to-end check: it looks a few bars *into* a synthetic
breakout, not at the very end of one. A rolling volume z-score measures
deviation from its own trailing window's mean/std, so once that window has
fully absorbed a sustained volume increase, the "spike" is no longer
unusual relative to itself -- which is correct z-score behavior, but means
the clearest signal is near the onset of a move, not deep into it.
"""

from __future__ import annotations

from bot.data.models import IndicatorSnapshot, SignalAction
from bot.strategy.base import StrategyContext
from bot.strategy.signals import (
    STRATEGIES,
    bollinger_squeeze_breakout,
    momentum_breakout,
    run_strategies,
    trend_pullback,
    volume_spike_breakout,
)
from tests.conftest import make_breakout_df, make_ohlcv, make_pair


def _ctx(indicators: IndicatorSnapshot, pair=None, params=None) -> StrategyContext:
    return StrategyContext(pair=pair or make_pair(), candles=make_ohlcv(n=60), indicators=indicators, params=params or {})


# -- momentum_breakout --------------------------------------------------------


def test_momentum_breakout_fires_on_breakout_snapshot():
    ind = IndicatorSnapshot(price=1.15, swing_high=1.05, volume_zscore=2.2, macd_hist=0.02, num_candles=150)
    signal = momentum_breakout(_ctx(ind))
    assert signal is not None
    assert signal.action == SignalAction.BUY
    assert signal.strategy_name == "momentum_breakout"
    assert 0.0 <= signal.confidence <= 1.0


def test_momentum_breakout_requires_price_above_swing_high():
    ind = IndicatorSnapshot(price=1.0, swing_high=1.05, volume_zscore=2.2, macd_hist=0.02, num_candles=150)
    assert momentum_breakout(_ctx(ind)) is None


def test_momentum_breakout_requires_volume_confirmation():
    ind = IndicatorSnapshot(price=1.15, swing_high=1.05, volume_zscore=0.5, macd_hist=0.02, num_candles=150)
    assert momentum_breakout(_ctx(ind)) is None


def test_momentum_breakout_rejects_negative_macd_histogram():
    ind = IndicatorSnapshot(price=1.15, swing_high=1.05, volume_zscore=2.2, macd_hist=-0.01, num_candles=150)
    assert momentum_breakout(_ctx(ind)) is None


def test_momentum_breakout_end_to_end_on_synthetic_breakout():
    df = make_breakout_df().iloc[:104].reset_index(drop=True)  # base range + first few breakout bars
    from bot.analysis.indicators import IndicatorParams, compute_indicator_snapshot

    ind = compute_indicator_snapshot(df, IndicatorParams())
    signal = momentum_breakout(StrategyContext(pair=make_pair(), candles=df, indicators=ind, params={}))
    assert signal is not None


# -- volume_spike_breakout ----------------------------------------------------


def test_volume_spike_breakout_fires_with_spike_and_positive_move():
    ind = IndicatorSnapshot(price=1.1, rsi=60.0, volume_zscore=3.0, num_candles=150)
    pair = make_pair(price_change_5m=8.0)
    signal = volume_spike_breakout(_ctx(ind, pair=pair))
    assert signal is not None
    assert signal.strategy_name == "volume_spike_breakout"


def test_volume_spike_breakout_requires_positive_5m_move():
    ind = IndicatorSnapshot(price=1.1, rsi=60.0, volume_zscore=3.0, num_candles=150)
    pair = make_pair(price_change_5m=-3.0)
    assert volume_spike_breakout(_ctx(ind, pair=pair)) is None


def test_volume_spike_breakout_rejects_extreme_overbought_rsi():
    ind = IndicatorSnapshot(price=1.1, rsi=95.0, volume_zscore=3.0, num_candles=150)
    pair = make_pair(price_change_5m=8.0)
    assert volume_spike_breakout(_ctx(ind, pair=pair)) is None


# -- trend_pullback ------------------------------------------------------------


def _uptrend_snapshot(**overrides) -> IndicatorSnapshot:
    base = dict(
        price=1.0, rsi=45.0, ema_fast=1.0, ema_mid=0.95, ema_slow=0.85,
        macd=0.01, macd_signal=0.005, macd_hist=0.005, macd_hist_prev=0.004,
        ema_fast_slope=3.0, num_candles=150,
    )
    base.update(overrides)
    return IndicatorSnapshot(**base)


def test_trend_pullback_fires_on_dip_within_confirmed_uptrend():
    signal = trend_pullback(_ctx(_uptrend_snapshot()))
    assert signal is not None
    assert signal.strategy_name == "trend_pullback"
    assert signal.action == SignalAction.BUY


def test_trend_pullback_requires_price_above_slow_ema():
    ind = _uptrend_snapshot(price=0.80)  # below ema_slow (0.85) -- structure broken
    assert trend_pullback(_ctx(ind)) is None


def test_trend_pullback_requires_rsi_in_pullback_zone():
    ind = _uptrend_snapshot(rsi=75.0)  # too strong, not a pullback
    assert trend_pullback(_ctx(ind)) is None


def test_trend_pullback_requires_bullish_ema_stack():
    ind = _uptrend_snapshot(ema_fast=0.90, ema_mid=0.95, ema_slow=0.85)  # fast < mid -- not aligned
    assert trend_pullback(_ctx(ind)) is None


# -- bollinger_squeeze_breakout ------------------------------------------------


def test_bollinger_squeeze_breakout_fires_on_expansion_above_upper_band():
    ind = IndicatorSnapshot(
        price=1.20, bb_upper=1.15, bb_bandwidth=12.0, bb_bandwidth_min_recent=5.0,
        volume_zscore=1.5, num_candles=150,
    )
    signal = bollinger_squeeze_breakout(_ctx(ind))
    assert signal is not None
    assert signal.action == SignalAction.BUY
    assert signal.strategy_name == "bollinger_squeeze_breakout"
    assert 0.0 <= signal.confidence <= 1.0


def test_bollinger_squeeze_breakout_requires_sufficient_expansion():
    ind = IndicatorSnapshot(
        # bandwidth only 1.2x its recent low -- below the default 1.8x expansion_multiple
        price=1.20, bb_upper=1.15, bb_bandwidth=6.0, bb_bandwidth_min_recent=5.0,
        volume_zscore=1.5, num_candles=150,
    )
    assert bollinger_squeeze_breakout(_ctx(ind)) is None


def test_bollinger_squeeze_breakout_requires_price_above_upper_band():
    ind = IndicatorSnapshot(
        price=1.10, bb_upper=1.15, bb_bandwidth=12.0, bb_bandwidth_min_recent=5.0,
        volume_zscore=1.5, num_candles=150,
    )
    assert bollinger_squeeze_breakout(_ctx(ind)) is None


def test_bollinger_squeeze_breakout_requires_recent_squeeze_data():
    ind = IndicatorSnapshot(
        price=1.20, bb_upper=1.15, bb_bandwidth=12.0, bb_bandwidth_min_recent=None, num_candles=150
    )
    assert bollinger_squeeze_breakout(_ctx(ind)) is None


def test_bollinger_squeeze_breakout_respects_custom_params():
    ind = IndicatorSnapshot(
        price=1.20, bb_upper=1.15, bb_bandwidth=6.0, bb_bandwidth_min_recent=5.0,
        volume_zscore=1.5, num_candles=150,
    )
    # 1.2x expansion fails the default 1.8x bar but passes a relaxed 1.1x one
    signal = bollinger_squeeze_breakout(_ctx(ind, params={"bollinger_squeeze_breakout": {"expansion_multiple": 1.1}}))
    assert signal is not None


# -- run_strategies -------------------------------------------------------------


def test_run_strategies_only_runs_the_requested_strategies():
    ind = IndicatorSnapshot(
        price=1.15, swing_high=1.05, volume_zscore=2.5, macd_hist=0.02, rsi=60.0, num_candles=150
    )
    pair = make_pair(price_change_5m=5.0)
    ctx = _ctx(ind, pair=pair)

    assert run_strategies(ctx, active=["trend_pullback"]) == []  # ema fields unset -> never fires

    breakout_only = run_strategies(ctx, active=["momentum_breakout"])
    assert [s.strategy_name for s in breakout_only] == ["momentum_breakout"]

    names = {s.strategy_name for s in run_strategies(ctx, active=list(STRATEGIES.keys()))}
    assert {"momentum_breakout", "volume_spike_breakout"} <= names
