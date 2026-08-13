"""Historical replay: run the same indicators -> strategies -> risk-manager
logic used live, bar-by-bar over recorded/fetched OHLCV history for a
single pair, and produce a trade log + equity curve. This is how claims
about a strategy's win rate should be checked -- against data, not vibes.

Optionally (via `scoring_weights`) this also applies the same composite
score + safety gate live scanning uses before a strategy signal is allowed
to trade, so a backtest reflects what the bot would actually have done --
not just "does this strategy pattern ever appear in the data." Because a
bare OHLCV history carries no transaction counts, liquidity, or FDV time
series, the pair stats those gates read are a mix of real (derived from
the candles -- see `compute_pair_stats_series`) and fixed placeholder
values; which is which is documented on `_synthetic_pair`.

Stated plainly, the limitations: this fills signals at the *current* bar's
close (not a future bar's open, so there's no execution lag modeled),
applies a flat simulated slippage/fee instead of a real order book, and
cannot account for the price impact the bot's own hypothetical order would
have had, or for a token's liquidity having been pulled entirely (a rug)
in ways that differ from what the recorded price series shows. Treat
results as a relative comparison between strategies/parameters, not a
promise of live performance -- see docs/STRATEGY.md.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
import pandas as pd

from bot.analysis.higher_timeframe import compute_higher_timeframe_trend_series
from bot.analysis.indicators import IndicatorParams, compute_indicator_series, snapshot_from_series_row
from bot.analysis.safety_filters import SafetyConfig, evaluate_safety
from bot.analysis.scoring import ScoringWeights, compute_score
from bot.data.models import DexPair, Liquidity, SignalAction, TokenRef, Trade, Txns, TxnWindow, WindowedFloats
from bot.strategy.base import StrategyContext
from bot.strategy.risk_manager import RiskConfig, create_position, evaluate_exits, size_position
from bot.strategy.signals import run_strategies


@dataclass(slots=True)
class BacktestResult:
    trades: list[Trade]
    equity_curve: list[tuple[int, float]]  # (timestamp, equity_usd)
    starting_equity_usd: float
    final_equity_usd: float


def infer_interval_seconds(df: pd.DataFrame) -> int:
    if len(df) < 2:
        return 60
    diffs = df["timestamp"].diff().dropna()
    if diffs.empty:
        return 60
    inferred = int(diffs.median())
    return inferred if inferred > 0 else 60


def compute_pair_stats_series(df: pd.DataFrame, interval_seconds: int) -> pd.DataFrame:
    """Vectorized, whole-series version of the candle-derived pair-stat
    approximations (see `_pair_stats_from_row`), for the same reason
    `compute_indicator_series` exists: every one of these is a rolling
    sum/count that never looks ahead, so precomputing once and indexing by
    row is equivalent to recomputing on a growing window for every bar --
    and turns many-trial weight optimization from O(bars * lookback) into
    O(bars). `run_backtest` falls back to computing this itself if it
    isn't passed a precomputed one; callers running many backtests against
    the same candles (the optimizer) should compute it once per pool and
    reuse it, exactly like `indicator_series`.

    A bare OHLCV window carries no transaction counts or short-term
    price-change figures, so this approximates them: each bar is treated
    as one "transaction" classified buy/sell by whether it closed up or
    down (crude -- real counts are per-trade, not per-bar -- but it's the
    only signal a bar-level series offers), and 24h volume / 5m price
    change are read directly off the trailing window. This exists so the
    volume/activity-driven parts of the scoring model and safety gate have
    *something* real to vary against bar to bar in a backtest, instead of
    being frozen constants for the whole run.
    """
    bars_24h = max(int(86400 / interval_seconds), 1)
    bars_5m = max(int(300 / interval_seconds), 1)

    is_up = (df["close"] >= df["open"]).astype(int)
    count_24h = is_up.rolling(bars_24h, min_periods=1).count()
    up_24h = is_up.rolling(bars_24h, min_periods=1).sum()
    count_5m = is_up.rolling(bars_5m, min_periods=1).count()
    up_5m = is_up.rolling(bars_5m, min_periods=1).sum()

    # "Open of the bar at the start of the trailing 5m window" -- a fixed
    # lookback of (bars_5m - 1), clamped to the first available bar for
    # the rows too early to have a full window yet (matching what
    # `window.tail(bars_5m)` would give on a still-growing window).
    window_start_open = df["open"].shift(bars_5m - 1)
    if bars_5m > 1 and len(df) > 0:
        window_start_open = window_start_open.fillna(df["open"].iloc[0])
    price_change_5m_pct = (df["close"] / window_start_open.replace(0, np.nan) - 1) * 100
    price_change_5m_pct = price_change_5m_pct.fillna(0.0)
    if len(price_change_5m_pct) > 0:
        price_change_5m_pct.iloc[0] = 0.0  # a single-bar "window" has no change to speak of

    out = pd.DataFrame(index=df.index)
    out["buys_24h"] = up_24h.astype(int)
    out["sells_24h"] = (count_24h - up_24h).astype(int)
    out["buys_5m"] = up_5m.astype(int)
    out["sells_5m"] = (count_5m - up_5m).astype(int)
    out["volume_24h"] = df["volume"].rolling(bars_24h, min_periods=1).sum()
    out["price_change_5m_pct"] = price_change_5m_pct
    return out


def _pair_stats_from_row(stats_series: pd.DataFrame, i: int) -> dict:
    row = stats_series.iloc[i]
    return {
        "volume_24h": float(row["volume_24h"]),
        "buys_24h": int(row["buys_24h"]),
        "sells_24h": int(row["sells_24h"]),
        "buys_5m": int(row["buys_5m"]),
        "sells_5m": int(row["sells_5m"]),
        "price_change_5m_pct": float(row["price_change_5m_pct"]),
    }


def _synthetic_pair(
    symbol: str,
    chain_id: str,
    price: float,
    *,
    created_at_ms: int,
    stats: dict,
    assumed_liquidity_usd: float,
    assumed_fdv_usd: float | None,
) -> DexPair:
    """Strategies and the scoring model read `ctx.pair` for fields a bare
    OHLCV history doesn't carry. `stats` (from `compute_pair_stats_series`)
    supplies the ones that can be reasonably approximated from the candles
    themselves; liquidity and FDV have no historical time series available
    at all from OHLCV alone, so they stay fixed for the whole backtest --
    meaning the liquidity/FDV-ratio parts of the safety gate and
    liquidity_safety score never change bar to bar here, only the age and
    activity-derived parts do. `created_at_ms` is deliberately computed
    from wall-clock "now" minus simulated elapsed time (not the real
    historical date), so that `DexPair.age_minutes` -- which is always
    computed relative to real "now" -- correctly reflects "how old was
    this pair at this point in the backtest" instead of "how many months
    ago did this historical data actually happen."
    """
    return DexPair(
        chainId=chain_id,
        dexId="backtest",
        pairAddress="backtest",
        baseToken=TokenRef(address="backtest", name=symbol, symbol=symbol),
        quoteToken=TokenRef(address="", name="", symbol=""),
        priceUsd=str(price),
        liquidity=Liquidity(usd=assumed_liquidity_usd),
        volume=WindowedFloats(h24=stats["volume_24h"]),
        priceChange=WindowedFloats(m5=stats["price_change_5m_pct"]),
        fdv=assumed_fdv_usd,
        pairCreatedAt=created_at_ms,
        txns=Txns(
            m5=TxnWindow(buys=stats["buys_5m"], sells=stats["sells_5m"]),
            h24=TxnWindow(buys=stats["buys_24h"], sells=stats["sells_24h"]),
        ),
    )


def run_backtest(
    df: pd.DataFrame,
    symbol: str,
    chain_id: str,
    indicator_params: IndicatorParams,
    strategy_params: dict,
    active_strategies: list[str],
    risk_cfg: RiskConfig,
    starting_bankroll_usd: float = 1000.0,
    simulated_slippage_bps: float = 60.0,
    simulated_fee_bps: float = 30.0,
    warmup_bars: int = 50,
    scoring_weights: ScoringWeights | None = None,
    min_score_to_trade: float = 0.0,
    safety_cfg: SafetyConfig | None = None,
    assumed_liquidity_usd: float = 50_000.0,
    assumed_fdv_usd: float | None = None,
    indicator_series: pd.DataFrame | None = None,
    pair_stats_series: pd.DataFrame | None = None,
    higher_tf_series: list | None = None,
) -> BacktestResult:
    """`scoring_weights=None` (the default) skips the composite-score gate
    entirely, so every strategy signal is tradeable -- useful for asking
    "does this strategy have any edge at all." Pass `scoring_weights` (and
    optionally `min_score_to_trade`) to gate entries the same way live
    scanning does, which is what bot/backtest/optimizer.py does to measure
    how a given set of weights actually performs. `risk_cfg.min_agreeing_
    strategies` and `risk_cfg.require_higher_timeframe_confirmation` (see
    bot/strategy/risk_manager.py) are likewise only applied in that gated
    mode -- raw mode exists specifically to see a strategy's unfiltered
    edge, so it skips every filter, not just the score gate.

    `indicator_series` / `pair_stats_series` / `higher_tf_series`, if
    provided, skip recomputing those from `df` -- callers running many
    backtests against the same candles (e.g. the optimizer trying hundreds
    of weight combinations) should compute each once with
    `compute_indicator_series` / `compute_pair_stats_series` /
    `compute_higher_timeframe_trend_series` and pass them in every time,
    since none of them depend on scoring weights at all.
    """
    if df is None or len(df) < warmup_bars + 2:
        return BacktestResult([], [], starting_bankroll_usd, starting_bankroll_usd)

    df = df.reset_index(drop=True)
    series = indicator_series if indicator_series is not None else compute_indicator_series(df, indicator_params)
    interval_seconds = infer_interval_seconds(df)
    stats_series = (
        pair_stats_series if pair_stats_series is not None else compute_pair_stats_series(df, interval_seconds)
    )
    higher_tf_trend = higher_tf_series
    if higher_tf_trend is None and risk_cfg.require_higher_timeframe_confirmation:
        bars_per_group = max(1, risk_cfg.higher_timeframe_seconds // interval_seconds)
        higher_tf_trend = compute_higher_timeframe_trend_series(df, bars_per_group, indicator_params)
    first_ts = int(df["timestamp"].iloc[0])
    effective_safety_cfg = safety_cfg or SafetyConfig(
        # Backtesting has no live RPC/Jupiter feed to check on-chain
        # authority state, holder concentration, or sellability
        # historically -- only checks computable purely from the OHLCV
        # window itself (liquidity/volume/age/FDV/etc.) apply here. All are
        # validated in live scanning, not in a backtest.
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_holder_concentration_check=False,
        require_sellable=False,
    )

    cash = starting_bankroll_usd
    open_position = None
    trades: list[Trade] = []
    equity_curve: list[tuple[int, float]] = []

    for i in range(warmup_bars, len(df)):
        bar = df.iloc[i]
        ts = int(bar["timestamp"])
        price = float(bar["close"])
        if price <= 0:
            continue
        indicators = snapshot_from_series_row(series, i)

        if open_position is not None:
            for action in evaluate_exits(open_position, price, risk_cfg, now=ts):
                fill_price = price * (1 - simulated_slippage_bps / 10_000)
                qty = open_position.quantity * action.fraction
                proceeds = qty * fill_price
                fee = proceeds * simulated_fee_bps / 10_000
                realized = proceeds - qty * open_position.entry_price - fee
                cash += proceeds - fee
                open_position.remaining_fraction -= action.fraction
                trades.append(
                    Trade(
                        id=f"bt-sell-{len(trades)}",
                        position_id=open_position.id,
                        chain_id=chain_id,
                        pair_address="backtest",
                        symbol=symbol,
                        side="sell",
                        price=fill_price,
                        quantity=qty,
                        fee_usd=fee,
                        timestamp=ts,
                        reason=action.reason,
                        realized_pnl_usd=realized,
                    )
                )
                if open_position.remaining_fraction <= 1e-6:
                    open_position = None

        elif indicators.num_candles >= warmup_bars:
            window = df.iloc[: i + 1]
            stats = _pair_stats_from_row(stats_series, i)
            simulated_age_seconds = max(ts - first_ts, 0)
            pair = _synthetic_pair(
                symbol, chain_id, price,
                created_at_ms=int((time.time() - simulated_age_seconds) * 1000),
                stats=stats,
                assumed_liquidity_usd=assumed_liquidity_usd,
                assumed_fdv_usd=assumed_fdv_usd,
            )

            tradeable = True
            if scoring_weights is not None:
                safety = evaluate_safety(pair, effective_safety_cfg, mint_info=None)
                score = compute_score(pair, indicators, safety, scoring_weights)
                tradeable = safety.passed and score.total >= min_score_to_trade

            if tradeable:
                ctx = StrategyContext(pair=pair, candles=window, indicators=indicators, params=strategy_params)
                signals = run_strategies(ctx, active_strategies)
                buy_signals = [s for s in signals if s.action == SignalAction.BUY]

                # Confluence and higher-timeframe confirmation are quality
                # filters on top of the score gate, not independent gates --
                # raw mode (scoring_weights=None) skips every filter, not
                # just the score, to show a strategy's unfiltered edge.
                if scoring_weights is not None and buy_signals:
                    if len(buy_signals) < risk_cfg.min_agreeing_strategies:
                        buy_signals = []
                    elif (
                        risk_cfg.require_higher_timeframe_confirmation
                        and higher_tf_trend is not None
                        and higher_tf_trend[i] is False
                    ):
                        buy_signals = []

                if buy_signals:
                    sizing = size_position(cash, price, risk_cfg)
                    if sizing.notional_usd > 0:
                        fill_price = price * (1 + simulated_slippage_bps / 10_000)
                        fee = sizing.notional_usd * simulated_fee_bps / 10_000
                        quantity = sizing.notional_usd / fill_price
                        cash -= sizing.notional_usd + fee
                        open_position = create_position(
                            chain_id, "backtest", "backtest", symbol, fill_price, quantity,
                            buy_signals[0].strategy_name, risk_cfg,
                        )
                        trades.append(
                            Trade(
                                id=f"bt-buy-{len(trades)}",
                                position_id=open_position.id,
                                chain_id=chain_id,
                                pair_address="backtest",
                                symbol=symbol,
                                side="buy",
                                price=fill_price,
                                quantity=quantity,
                                fee_usd=fee,
                                timestamp=ts,
                                reason=buy_signals[0].reason,
                            )
                        )

        held_value = 0.0
        if open_position is not None:
            held_value = open_position.quantity * open_position.remaining_fraction * price
        equity_curve.append((ts, cash + held_value))

    final_equity = equity_curve[-1][1] if equity_curve else starting_bankroll_usd
    return BacktestResult(
        trades=trades,
        equity_curve=equity_curve,
        starting_equity_usd=starting_bankroll_usd,
        final_equity_usd=final_equity,
    )
