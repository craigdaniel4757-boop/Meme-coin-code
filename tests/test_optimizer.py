"""Weight optimizer tests: the Dirichlet sampler stays on the simplex, the
fitness function's disqualification/drawdown-penalty behavior, the local
hill-climbing refinement's core guarantee (never returns something worse
than it started with, and can actually improve toward a better region),
and an end-to-end run against small synthetic multi-pool data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from bot.analysis.indicators import IndicatorParams
from bot.analysis.safety_filters import SafetyConfig
from bot.backtest.metrics import PerformanceMetrics
from bot.backtest.optimizer import (
    WEIGHT_FIELDS,
    OptimizerRunConfig,
    PoolSpec,
    WeightCandidate,
    _local_refine,
    _sample_weights,
    _tuple_to_weights,
    fitness_score,
    optimize_weights,
)
from bot.strategy.risk_manager import RiskConfig
from tests.conftest import make_ohlcv


def _make_pool(symbol: str, seed_base: int, n_cycles: int = 4) -> PoolSpec:
    frames = []
    price = 1.0
    seed = seed_base
    for _ in range(n_cycles):
        trend = make_ohlcv(n=60, start_price=price, drift=0.005, volatility=0.015, seed=seed)
        seed += 1
        pull = make_ohlcv(n=20, start_price=float(trend["close"].iloc[-1]), drift=-0.006, volatility=0.02, seed=seed)
        seed += 1
        frames += [trend, pull]
        price = float(pull["close"].iloc[-1])
    df = pd.concat(frames, ignore_index=True)
    df["timestamp"] = np.arange(len(df)) * 60 + 1_700_000_000
    return PoolSpec(chain_id="solana", pair_address=f"POOL-{symbol}", symbol=symbol, candles=df)


def _neutral_safety_cfg() -> SafetyConfig:
    return SafetyConfig(require_solana_mint_authority_renounced=False, require_solana_freeze_authority_renounced=False)


# -- _sample_weights ------------------------------------------------------------


def test_sample_weights_are_valid_simplex_points():
    rng = np.random.default_rng(7)
    for _ in range(200):
        w = _sample_weights(rng)
        values = [getattr(w, f) for f in WEIGHT_FIELDS]
        assert all(v >= 0 for v in values)
        assert sum(values) == pytest.approx(1.0)


# -- fitness_score ----------------------------------------------------------------


def _metrics(**overrides) -> PerformanceMetrics:
    base = dict(
        total_trades=10, closed_trades=10, wins=6, losses=4, win_rate_pct=60.0,
        total_realized_pnl_usd=100.0, avg_win_usd=25.0, avg_loss_usd=12.5, profit_factor=2.0,
        expectancy_usd=10.0, max_drawdown_pct=5.0, total_return_pct=10.0, sharpe_like_ratio=1.0,
    )
    base.update(overrides)
    return PerformanceMetrics(**base)


def test_fitness_score_disqualifies_below_min_trades():
    metrics = _metrics(closed_trades=2)
    assert fitness_score(metrics, min_trades=5, drawdown_penalty=0.5) == float("-inf")


def test_fitness_score_rewards_expectancy_and_penalizes_drawdown():
    low_dd = _metrics(expectancy_usd=10.0, max_drawdown_pct=5.0)
    high_dd = _metrics(expectancy_usd=10.0, max_drawdown_pct=50.0)
    assert fitness_score(low_dd, min_trades=5, drawdown_penalty=0.5) > fitness_score(
        high_dd, min_trades=5, drawdown_penalty=0.5
    )


# -- _local_refine ----------------------------------------------------------------


def _fake_evaluate_toward(target: np.ndarray):
    def evaluate(weights) -> WeightCandidate:
        w = np.array([getattr(weights, f) for f in WEIGHT_FIELDS])
        return WeightCandidate(weights=weights, fitness=-float(np.sum((w - target) ** 2)), pool_results=[])

    return evaluate


def test_local_refine_never_returns_worse_than_start():
    target = np.array([0.5, 0.1, 0.1, 0.1, 0.1, 0.1])
    evaluate = _fake_evaluate_toward(target)
    rng = np.random.default_rng(0)
    start = evaluate(_tuple_to_weights(tuple(rng.dirichlet(np.ones(6)))))

    refined = _local_refine(rng, start, evaluate, rounds=50, step=0.05)
    assert refined.fitness >= start.fitness


def test_local_refine_improves_a_clearly_suboptimal_start():
    target = np.array([0.5, 0.1, 0.1, 0.1, 0.1, 0.1])
    evaluate = _fake_evaluate_toward(target)
    rng = np.random.default_rng(1)
    bad_start = evaluate(_tuple_to_weights((0.0, 0.2, 0.2, 0.2, 0.2, 0.2)))  # far corner from the target

    refined = _local_refine(rng, bad_start, evaluate, rounds=200, step=0.05)
    assert refined.fitness > bad_start.fitness


# -- optimize_weights end-to-end ---------------------------------------------------


def test_optimize_weights_requires_at_least_one_pool():
    cfg = OptimizerRunConfig(
        indicator_params=IndicatorParams(), strategy_params={}, active_strategies=[],
        risk_cfg=RiskConfig(), safety_cfg=_neutral_safety_cfg(),
    )
    with pytest.raises(ValueError):
        optimize_weights([], cfg)


def test_optimize_weights_end_to_end_on_synthetic_data():
    pools = [_make_pool("A", 300), _make_pool("B", 700)]
    cfg = OptimizerRunConfig(
        indicator_params=IndicatorParams(),
        strategy_params={},
        active_strategies=["momentum_breakout", "volume_spike_breakout", "trend_pullback"],
        risk_cfg=RiskConfig(),
        safety_cfg=_neutral_safety_cfg(),
        min_score_to_trade=40.0,
        min_trades_per_pool=2,
    )
    result = optimize_weights(pools, cfg, trials=25, refine_rounds=10, seed=1)

    assert result.trials_run == 25
    assert result.best.fitness >= result.baseline.fitness or result.baseline.disqualified
    weight_sum = sum(getattr(result.best.weights, f) for f in WEIGHT_FIELDS)
    assert weight_sum == pytest.approx(1.0)
    assert 0 < len(result.top_random_trials) <= 5
    assert len(result.best.pool_results) == len(pools)


def test_optimize_weights_reports_when_every_trial_is_disqualified():
    pools = [_make_pool("A", 300, n_cycles=1)]  # short series -> few possible trades
    cfg = OptimizerRunConfig(
        indicator_params=IndicatorParams(), strategy_params={}, active_strategies=["momentum_breakout"],
        risk_cfg=RiskConfig(), safety_cfg=_neutral_safety_cfg(),
        min_trades_per_pool=1000,  # impossible to reach
    )
    result = optimize_weights(pools, cfg, trials=10, refine_rounds=0, seed=2)

    assert result.trials_disqualified == result.trials_run == 10
    assert result.best.disqualified
