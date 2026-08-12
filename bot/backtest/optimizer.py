"""Search for scoring weights (see bot/analysis/scoring.py::ScoringWeights)
that historically performed well, by running many backtests with
different weight vectors against one or more pools' historical candles
and keeping whichever weights did best.

This directly optimizes for what you actually care about -- the realized
performance of the same score-gate -> strategy -> risk-manager pipeline
used live -- rather than some indirect statistical proxy like correlating
individual factors with forward returns.

It inherits every limitation of backtesting (see bot/backtest/engine.py),
sharpened: searching over many weight combinations against a small amount
of historical data is a classic recipe for overfitting to that data's
specific noise. Two things push back on that here:

  1. A minimum-trade-count floor (`min_trades_per_pool`) disqualifies any
     trial that didn't generate enough trades to be statistically
     meaningful -- a single lucky trade can't "win" the search.
  2. Testing against *multiple* pools and requiring every one of them to
     clear that floor, with fitness averaged across all of them, rewards
     weights that work reasonably broadly rather than weights that are
     perfectly fit to one specific coin's idiosyncrasies.

Neither eliminates overfitting risk. More and longer history, across more
pools, is the only real fix. Treat the result as a reasonable, data-backed
starting point worth continuing to validate -- not a finished answer. See
docs/STRATEGY.md.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from bot.analysis.indicators import IndicatorParams, compute_indicator_series
from bot.analysis.safety_filters import SafetyConfig
from bot.analysis.scoring import ScoringWeights
from bot.backtest.engine import compute_pair_stats_series, infer_interval_seconds, run_backtest
from bot.backtest.metrics import PerformanceMetrics, compute_metrics
from bot.strategy.risk_manager import RiskConfig

WEIGHT_FIELDS = ("trend", "momentum", "volume", "volatility", "liquidity_safety", "social")


def _weights_to_tuple(w: ScoringWeights) -> tuple[float, ...]:
    return tuple(getattr(w, f) for f in WEIGHT_FIELDS)


def _tuple_to_weights(t: tuple[float, ...]) -> ScoringWeights:
    return ScoringWeights(**dict(zip(WEIGHT_FIELDS, t)))


def _sample_weights(rng: np.random.Generator) -> ScoringWeights:
    """Dirichlet(1,...,1) is the uniform distribution over the probability
    simplex -- exactly "a random set of non-negative weights that sum to
    1," with no bias toward the center or the corners."""
    raw = rng.dirichlet(np.ones(len(WEIGHT_FIELDS)))
    return _tuple_to_weights(tuple(raw))


@dataclass(slots=True)
class PoolSpec:
    chain_id: str
    pair_address: str
    symbol: str
    candles: pd.DataFrame


@dataclass(slots=True)
class PoolResult:
    pool: PoolSpec
    metrics: PerformanceMetrics
    disqualified: bool


@dataclass(slots=True)
class WeightCandidate:
    weights: ScoringWeights
    fitness: float
    pool_results: list[PoolResult]

    @property
    def disqualified(self) -> bool:
        return self.fitness == float("-inf")


@dataclass(slots=True)
class OptimizationResult:
    best: WeightCandidate
    baseline: WeightCandidate
    top_random_trials: list[WeightCandidate]
    trials_run: int
    trials_disqualified: int
    min_trades_per_pool: int


@dataclass(slots=True)
class OptimizerRunConfig:
    indicator_params: IndicatorParams
    strategy_params: dict
    active_strategies: list[str]
    risk_cfg: RiskConfig
    safety_cfg: SafetyConfig
    min_score_to_trade: float = 0.0
    min_trades_per_pool: int = 5
    drawdown_penalty: float = 0.5
    starting_bankroll_usd: float = 1000.0
    simulated_slippage_bps: float = 60.0
    simulated_fee_bps: float = 30.0


def fitness_score(metrics: PerformanceMetrics, min_trades: int, drawdown_penalty: float) -> float:
    """Expectancy per trade, penalized for drawdown, disqualified entirely
    (`-inf`) below a minimum sample size."""
    if metrics.closed_trades < min_trades:
        return float("-inf")
    return metrics.expectancy_usd - drawdown_penalty * metrics.max_drawdown_pct


def _evaluate(
    weights: ScoringWeights,
    pools: list[PoolSpec],
    indicator_series_by_pool: list[pd.DataFrame],
    pair_stats_series_by_pool: list[pd.DataFrame],
    cfg: OptimizerRunConfig,
) -> WeightCandidate:
    pool_results: list[PoolResult] = []
    for pool, series, stats_series in zip(pools, indicator_series_by_pool, pair_stats_series_by_pool):
        result = run_backtest(
            df=pool.candles,
            symbol=pool.symbol,
            chain_id=pool.chain_id,
            indicator_params=cfg.indicator_params,
            strategy_params=cfg.strategy_params,
            active_strategies=cfg.active_strategies,
            risk_cfg=cfg.risk_cfg,
            starting_bankroll_usd=cfg.starting_bankroll_usd,
            simulated_slippage_bps=cfg.simulated_slippage_bps,
            simulated_fee_bps=cfg.simulated_fee_bps,
            scoring_weights=weights,
            min_score_to_trade=cfg.min_score_to_trade,
            safety_cfg=cfg.safety_cfg,
            indicator_series=series,
            pair_stats_series=stats_series,
        )
        metrics = compute_metrics(result)
        disqualified = metrics.closed_trades < cfg.min_trades_per_pool
        pool_results.append(PoolResult(pool=pool, metrics=metrics, disqualified=disqualified))

    if any(pr.disqualified for pr in pool_results):
        fitness = float("-inf")
    else:
        fitness = sum(
            fitness_score(pr.metrics, cfg.min_trades_per_pool, cfg.drawdown_penalty) for pr in pool_results
        ) / len(pool_results)

    return WeightCandidate(weights=weights, fitness=fitness, pool_results=pool_results)


def _local_refine(
    rng: np.random.Generator,
    start: WeightCandidate,
    evaluate_fn,
    rounds: int = 20,
    step: float = 0.08,
) -> WeightCandidate:
    """Coordinate-wise hill climbing around the best random sample: move a
    small amount of weight from one random factor to another (renormalized
    by construction, since the move is subtracted from one and added to
    another), keep the change only if it improves fitness. Cheap, and
    often meaningfully sharpens a random-search result without needing a
    real numerical optimization library."""
    best = start
    n = len(WEIGHT_FIELDS)
    for _ in range(rounds):
        i, j = rng.choice(n, size=2, replace=False)
        current = np.array(_weights_to_tuple(best.weights))
        move = min(step, current[i])
        current[i] -= move
        current[j] += move
        candidate = evaluate_fn(_tuple_to_weights(tuple(current)))
        if candidate.fitness > best.fitness:
            best = candidate
    return best


def optimize_weights(
    pools: list[PoolSpec],
    cfg: OptimizerRunConfig,
    baseline_weights: ScoringWeights | None = None,
    trials: int = 150,
    refine_rounds: int = 20,
    seed: int | None = None,
) -> OptimizationResult:
    if not pools:
        raise ValueError("optimize_weights needs at least one pool")

    rng = np.random.default_rng(seed)
    indicator_series_by_pool = [compute_indicator_series(p.candles, cfg.indicator_params) for p in pools]
    interval_seconds_by_pool = [infer_interval_seconds(p.candles) for p in pools]
    pair_stats_series_by_pool = [
        compute_pair_stats_series(p.candles, interval)
        for p, interval in zip(pools, interval_seconds_by_pool)
    ]

    def evaluate(weights: ScoringWeights) -> WeightCandidate:
        return _evaluate(weights, pools, indicator_series_by_pool, pair_stats_series_by_pool, cfg)

    baseline = evaluate(baseline_weights or ScoringWeights())
    candidates = [evaluate(_sample_weights(rng)) for _ in range(trials)]

    disqualified_count = sum(1 for c in candidates if c.disqualified)
    qualified = [c for c in candidates if not c.disqualified]

    if qualified:
        best_random = max(qualified, key=lambda c: c.fitness)
        best = _local_refine(rng, best_random, evaluate, rounds=refine_rounds)
    else:
        best = candidates[0]  # all disqualified; report the first so the CLI has something to explain

    top_random_trials = sorted(qualified or candidates, key=lambda c: c.fitness, reverse=True)[:5]

    return OptimizationResult(
        best=best,
        baseline=baseline,
        top_random_trials=top_random_trials,
        trials_run=trials,
        trials_disqualified=disqualified_count,
        min_trades_per_pool=cfg.min_trades_per_pool,
    )
