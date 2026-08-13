"""Backtest engine tests: the candle-derived pair-stat approximations, the
simulated-age fix, and the optional scoring/safety gate.
"""

from __future__ import annotations

import time

import pandas as pd
import pytest

from bot.analysis.indicators import IndicatorParams
from bot.analysis.safety_filters import SafetyConfig
from bot.analysis.scoring import ScoringWeights
from bot.backtest.engine import (
    _pair_stats_from_row,
    _synthetic_pair,
    compute_pair_stats_series,
    infer_interval_seconds,
    run_backtest,
)
from bot.strategy.risk_manager import RiskConfig
from tests.conftest import make_breakout_df


def _risk_cfg() -> RiskConfig:
    return RiskConfig(stop_loss_pct=15.0, take_profit_ladder=[(50.0, 1.0)])


# -- infer_interval_seconds ----------------------------------------------------


def test_infer_interval_seconds_from_regular_spacing():
    df = pd.DataFrame({"timestamp": [0, 60, 120, 180, 240]})
    assert infer_interval_seconds(df) == 60


def test_infer_interval_seconds_fallback_on_too_short_df():
    assert infer_interval_seconds(pd.DataFrame({"timestamp": [0]})) == 60


# -- compute_pair_stats_series --------------------------------------------------


def test_pair_stats_series_counts_up_down_bars_as_buys_sells():
    df = pd.DataFrame(
        {
            "open": [1.0, 1.0, 1.2, 1.0, 1.3],
            "close": [1.1, 1.2, 1.0, 1.3, 1.1],  # up, up, down, up, down
            "volume": [10.0, 20.0, 30.0, 40.0, 50.0],
        }
    )
    series = compute_pair_stats_series(df, interval_seconds=60)  # bars_5m == 5, bars_24h == 1440
    last = _pair_stats_from_row(series, len(df) - 1)

    assert last["buys_5m"] + last["sells_5m"] == 5
    assert last["buys_5m"] == 3
    assert last["sells_5m"] == 2
    assert last["volume_24h"] == pytest.approx(150.0)  # window shorter than 24h -> whole window counted


def test_pair_stats_series_price_change_5m_matches_window_move():
    df = pd.DataFrame(
        {
            "open": [1.0, 1.0, 1.0, 1.0, 1.0],
            "close": [1.0, 1.0, 1.0, 1.0, 1.1],
            "volume": [1.0] * 5,
        }
    )
    series = compute_pair_stats_series(df, interval_seconds=60)
    last = _pair_stats_from_row(series, len(df) - 1)
    assert last["price_change_5m_pct"] == pytest.approx(10.0)


def test_pair_stats_series_matches_growing_window_recompute():
    """The whole point of precomputing this vectorized, whole-series
    version is that it's numerically identical to recomputing from a
    growing window at every bar (each stat is a rolling sum/count that
    never looks ahead) -- this is what makes it safe for the optimizer to
    compute once per pool and reuse across every trial instead of
    recomputing per bar per trial."""
    df = make_breakout_df()
    interval_seconds = infer_interval_seconds(df)
    fast_series = compute_pair_stats_series(df, interval_seconds)

    for i in (10, 50, 99, len(df) - 1):
        fast = _pair_stats_from_row(fast_series, i)
        slow_series = compute_pair_stats_series(df.iloc[: i + 1].reset_index(drop=True), interval_seconds)
        slow = _pair_stats_from_row(slow_series, i)
        assert fast["buys_5m"] == slow["buys_5m"]
        assert fast["sells_5m"] == slow["sells_5m"]
        assert fast["buys_24h"] == slow["buys_24h"]
        assert fast["sells_24h"] == slow["sells_24h"]
        assert fast["volume_24h"] == pytest.approx(slow["volume_24h"])
        assert fast["price_change_5m_pct"] == pytest.approx(slow["price_change_5m_pct"])


# -- _synthetic_pair age simulation ----------------------------------------------


def test_synthetic_pair_age_reflects_simulated_time_not_real_history_date():
    """created_at_ms is deliberately computed from wall-clock now() minus
    simulated elapsed time, NOT the real historical date the candle data
    happens to carry -- DexPair.age_minutes is always computed relative to
    real now(), so anchoring to the real historical date would make every
    bar of a real dataset show as "years old," regardless of which point
    in the backtest is being evaluated. This is what makes an age-based
    safety gate meaningful inside a backtest at all."""
    stats = {
        "volume_24h": 0.0, "buys_24h": 0, "sells_24h": 0,
        "buys_5m": 0, "sells_5m": 0, "price_change_5m_pct": 0.0,
    }
    early = _synthetic_pair(
        "X", "solana", 1.0, created_at_ms=int((time.time() - 5 * 60) * 1000),
        stats=stats, assumed_liquidity_usd=50_000.0, assumed_fdv_usd=None,
    )
    late = _synthetic_pair(
        "X", "solana", 1.0, created_at_ms=int((time.time() - 500 * 60) * 1000),
        stats=stats, assumed_liquidity_usd=50_000.0, assumed_fdv_usd=None,
    )
    assert early.age_minutes == pytest.approx(5.0, abs=0.05)
    assert late.age_minutes == pytest.approx(500.0, abs=0.05)


# -- run_backtest: optional scoring/safety gate ----------------------------------


def test_run_backtest_without_scoring_weights_ignores_score_gate():
    df = make_breakout_df()
    result = run_backtest(
        df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg(),
        scoring_weights=None,
    )
    assert len(result.trades) > 0


def test_run_backtest_score_gate_can_block_all_entries():
    df = make_breakout_df()
    result = run_backtest(
        df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg(),
        scoring_weights=ScoringWeights(), min_score_to_trade=1000.0,  # unreachable -- max score is 100
    )
    assert len(result.trades) == 0


def test_run_backtest_score_gate_trades_with_default_safety_cfg():
    """Regression test: the default `effective_safety_cfg` built internally
    when no `safety_cfg` is passed must disable the holder-concentration,
    sellability, and liquidity-stability checks the same way it already
    disables the mint/freeze authority checks -- none of those can be
    computed from historical OHLCV alone, and since they fail *closed*
    with no data ever supplied in a backtest, leaving them enabled would
    silently zero out every solana-chain backtest that uses the scoring
    gate, not just the ones the safety thresholds are actually meant to
    reject."""
    df = make_breakout_df()
    result = run_backtest(
        df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg(),
        scoring_weights=ScoringWeights(), min_score_to_trade=0.0,
    )
    assert len(result.trades) > 0


def test_run_backtest_score_gate_can_reject_on_failed_safety():
    df = make_breakout_df()
    strict_safety = SafetyConfig(
        min_liquidity_usd=10_000_000.0,  # far above the fixed placeholder liquidity -> always fails
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = run_backtest(
        df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg(),
        scoring_weights=ScoringWeights(), min_score_to_trade=0.0, safety_cfg=strict_safety,
    )
    assert len(result.trades) == 0


def test_volume_spike_breakout_can_fire_in_backtest():
    """Regression test: the original synthetic pair never set priceChange
    at all, so volume_spike_breakout (which requires a positive 5m move)
    could never fire in a backtest, silently, regardless of the data."""
    df = make_breakout_df()
    result = run_backtest(df, "SMOKE", "solana", IndicatorParams(), {}, ["volume_spike_breakout"], _risk_cfg())
    fired = [t for t in result.trades if t.side == "buy" and "volume spike" in t.reason]
    assert fired, "volume_spike_breakout should be able to fire in a backtest"


def test_run_backtest_is_deterministic():
    df = make_breakout_df()
    r1 = run_backtest(df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg())
    r2 = run_backtest(df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg())
    assert [t.timestamp for t in r1.trades] == [t.timestamp for t in r2.trades]
    assert r1.final_equity_usd == pytest.approx(r2.final_equity_usd)


def test_run_backtest_precomputed_stats_series_matches_internal_computation():
    """Passing a precomputed pair_stats_series (what the optimizer does
    across many trials) must produce identical trades to letting
    run_backtest compute it internally -- otherwise reusing it across
    trials would be reusing something silently wrong."""
    df = make_breakout_df()
    interval_seconds = infer_interval_seconds(df)
    precomputed = compute_pair_stats_series(df, interval_seconds)

    internal = run_backtest(
        df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg(),
        scoring_weights=ScoringWeights(), min_score_to_trade=40.0,
    )
    reused = run_backtest(
        df, "SMOKE", "solana", IndicatorParams(), {}, ["momentum_breakout"], _risk_cfg(),
        scoring_weights=ScoringWeights(), min_score_to_trade=40.0, pair_stats_series=precomputed,
    )
    assert [t.timestamp for t in internal.trades] == [t.timestamp for t in reused.trades]
