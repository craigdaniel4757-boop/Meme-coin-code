"""Position sizing, stop-loss/take-profit/trailing-stop management, the
daily-loss circuit breaker, and a couple of final "is this actually worth
entering" gates (strategy agreement, higher-timeframe confirmation).
Applies identically whether execution is paper or live -- risk discipline
shouldn't change just because the money is fake.

This module never talks to the network or a portfolio object directly; it's
pure functions over explicit numbers (bankroll, prices, position state), so
it's trivial to unit test and equally usable from the live scanner loop and
the backtester. The two entry-gate fields live here rather than in their
own config object because both bot/scanner/screener.py and
bot/backtest/engine.py already thread a `RiskConfig` through end to end --
reusing that instead of adding a third parallel config path.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from bot.analysis.liquidity_guard import LiquidityTrend
from bot.data.models import Position, TakeProfitLevel


@dataclass(slots=True)
class RiskConfig:
    starting_bankroll_usd: float = 1000.0
    risk_per_trade_pct: float = 2.0
    max_concurrent_positions: int = 6
    max_allocation_pct_per_token: float = 15.0
    stop_loss_pct: float = 15.0
    take_profit_ladder: list[tuple[float, float]] = field(
        default_factory=lambda: [(50.0, 0.25), (100.0, 0.25), (200.0, 0.25)]
    )
    trailing_stop_activate_pct: float = 40.0
    trailing_stop_distance_pct: float = 18.0
    max_hold_minutes: float = 720.0
    max_daily_loss_pct: float = 8.0
    max_slippage_bps: float = 150.0
    # Deliberately higher than SafetyConfig.max_liquidity_drawdown_pct (the
    # entry gate): a moderate liquidity wobble shouldn't panic-sell an open
    # position, but a severe one should override every other exit rule,
    # including the stop-loss, since price can lag a liquidity pull.
    emergency_exit_liquidity_drawdown_pct: float = 60.0
    # Require at least this many independently-agreeing strategies (see
    # bot/strategy/signals.py) before a candidate is entered -- the default
    # of 1 preserves the original "any one signal is enough" behavior;
    # raising it trades fewer, higher-conviction entries for a lower win
    # rate on any single strategy's known false positives (see
    # docs/STRATEGY.md section 4, e.g. volume_spike_breakout on its own).
    min_agreeing_strategies: int = 1
    # See bot/analysis/higher_timeframe.py -- a final check, only at the
    # point of actually entering, that a higher timeframe's trend hasn't
    # already turned against the base-timeframe signal.
    require_higher_timeframe_confirmation: bool = True
    higher_timeframe_seconds: int = 3600
    # Exit on a bearish reversal pattern (engulfing candle or RSI
    # divergence -- see bot/analysis/indicators.py) once a position is up
    # at least this much, protecting real gains against a sharp reversal
    # instead of riding it all the way back down to the stop-loss or
    # giving it all back before the trailing stop even arms.
    require_reversal_exit: bool = True
    reversal_exit_min_gain_pct: float = 15.0


@dataclass(slots=True)
class PositionSizeResult:
    notional_usd: float
    quantity: float
    risk_usd: float
    capped_by_allocation_limit: bool


@dataclass(slots=True)
class ExitAction:
    fraction: float  # fraction of the position's *original* quantity to sell now
    reason: str
    kind: str  # "liquidity_crash" | "stop_loss" | "trailing_stop" | "reversal" | "take_profit" | "max_hold"


def can_open_new_position(open_positions_count: int, cfg: RiskConfig) -> bool:
    return open_positions_count < cfg.max_concurrent_positions


def check_circuit_breaker(
    daily_realized_pnl_usd: float, bankroll_usd: float, cfg: RiskConfig
) -> tuple[bool, str]:
    """Returns (halted, reason). Halts new entries for the day once realized
    losses reach `max_daily_loss_pct` of bankroll. Existing positions are
    still managed (stops/take-profits keep working) -- only new entries stop."""
    if bankroll_usd <= 0:
        return True, "bankroll depleted"
    loss_pct = -daily_realized_pnl_usd / bankroll_usd * 100
    if loss_pct >= cfg.max_daily_loss_pct:
        return True, f"daily loss {loss_pct:.1f}% has reached the {cfg.max_daily_loss_pct:.1f}% circuit-breaker limit"
    return False, ""


def size_position(bankroll_usd: float, price: float, cfg: RiskConfig) -> PositionSizeResult:
    """Fixed-fractional sizing: risk exactly `risk_per_trade_pct` of bankroll
    on the distance to the stop-loss, then hard-cap at
    `max_allocation_pct_per_token` of bankroll regardless of how tight the
    stop is -- a tight stop should not be an excuse to over-concentrate."""
    if price <= 0 or bankroll_usd <= 0:
        return PositionSizeResult(0.0, 0.0, 0.0, False)

    risk_usd = bankroll_usd * cfg.risk_per_trade_pct / 100
    stop_distance = cfg.stop_loss_pct / 100
    notional = risk_usd / stop_distance if stop_distance > 0 else 0.0

    cap = bankroll_usd * cfg.max_allocation_pct_per_token / 100
    capped = notional > cap
    notional = min(notional, cap)

    return PositionSizeResult(
        notional_usd=notional,
        quantity=notional / price,
        risk_usd=risk_usd,
        capped_by_allocation_limit=capped,
    )


def create_position(
    chain_id: str,
    pair_address: str,
    base_token_address: str,
    symbol: str,
    entry_price: float,
    quantity: float,
    strategy_name: str,
    cfg: RiskConfig,
) -> Position:
    stop_loss_price = entry_price * (1 - cfg.stop_loss_pct / 100)
    levels = [TakeProfitLevel(gain_pct=g, fraction=f) for g, f in cfg.take_profit_ladder]
    return Position(
        id=str(uuid.uuid4()),
        chain_id=chain_id,
        pair_address=pair_address,
        base_token_address=base_token_address,
        symbol=symbol,
        entry_price=entry_price,
        quantity=quantity,
        entry_time=time.time(),
        stop_loss_price=stop_loss_price,
        take_profit_levels=levels,
        strategy_name=strategy_name,
    )


def evaluate_exits(
    position: Position,
    current_price: float,
    cfg: RiskConfig,
    now: float | None = None,
    liquidity_trend: LiquidityTrend | None = None,
    bearish_reversal: bool = False,
) -> list[ExitAction]:
    """Check liquidity crash, stop-loss, trailing stop, bearish-reversal,
    take-profit ladder, and max-hold timer, in that priority order, and
    return the exit actions to execute this cycle.

    `bearish_reversal` is a single pre-combined signal (bearish engulfing
    candle OR bearish RSI divergence, see bot/analysis/indicators.py) --
    deliberately passed in as one bool rather than a full IndicatorSnapshot
    so this module stays decoupled from the indicators module's surface,
    the same way `liquidity_trend` is a narrow, purpose-built value rather
    than the whole DexPair.

    Mutates `position` in place: updates `high_water_mark`, arms/tightens
    `trailing_stop_price`, and marks ladder rungs `filled` as they trigger.
    Callers are expected to actually execute the returned actions and then
    decrement `position.remaining_fraction` accordingly -- this function
    does not touch `remaining_fraction` itself so a failed/partial fill
    doesn't desync the bookkeeping.
    """
    now = now if now is not None else time.time()
    if current_price > position.high_water_mark:
        position.high_water_mark = current_price

    gain_pct = (current_price / position.entry_price - 1) * 100
    remaining = position.remaining_fraction
    if remaining <= 1e-9:
        return []

    # Checked before even the stop-loss: a severe liquidity pull can crater
    # a position's effective exit price faster than the price feed reflects
    # it, so this overrides every other exit rule rather than waiting for
    # price to "catch down" to a normal stop.
    if liquidity_trend is not None and liquidity_trend.drawdown_exceeds(cfg.emergency_exit_liquidity_drawdown_pct):
        return [
            ExitAction(
                fraction=remaining,
                reason=f"liquidity crashed {liquidity_trend.drawdown_pct:.0f}% from its recent peak -- emergency exit",
                kind="liquidity_crash",
            )
        ]

    if current_price <= position.stop_loss_price:
        return [ExitAction(fraction=remaining, reason=f"stop-loss hit ({gain_pct:.1f}%)", kind="stop_loss")]

    if position.trailing_stop_price is not None and current_price <= position.trailing_stop_price:
        return [
            ExitAction(fraction=remaining, reason=f"trailing stop hit ({gain_pct:.1f}%)", kind="trailing_stop")
        ]

    if gain_pct >= cfg.trailing_stop_activate_pct:
        candidate = position.high_water_mark * (1 - cfg.trailing_stop_distance_pct / 100)
        if position.trailing_stop_price is None or candidate > position.trailing_stop_price:
            position.trailing_stop_price = candidate

    # A confirmed reversal pattern warrants exiting the *full* remaining
    # position immediately, same severity as a trailing-stop hit -- worth
    # taking a real, already-earned gain off the table rather than betting
    # it survives back-and-forth against a specific bearish pattern.
    # Gated on a minimum gain so this doesn't whipsaw out of a trade on
    # noise right after entry, before the position has proven itself.
    if cfg.require_reversal_exit and bearish_reversal and gain_pct >= cfg.reversal_exit_min_gain_pct:
        return [
            ExitAction(
                fraction=remaining,
                reason=f"bearish reversal pattern while up {gain_pct:.1f}%",
                kind="reversal",
            )
        ]

    actions: list[ExitAction] = []
    for level in position.take_profit_levels:
        if level.filled or remaining <= 1e-9:
            continue
        if gain_pct >= level.gain_pct:
            level.filled = True
            take = min(level.fraction, remaining)
            remaining -= take
            actions.append(
                ExitAction(
                    fraction=take,
                    reason=f"take-profit rung at +{level.gain_pct:.0f}% (price +{gain_pct:.1f}%)",
                    kind="take_profit",
                )
            )

    held_minutes = (now - position.entry_time) / 60
    if held_minutes >= cfg.max_hold_minutes and remaining > 1e-9:
        actions.append(
            ExitAction(fraction=remaining, reason=f"max hold time reached ({held_minutes:.0f}m)", kind="max_hold")
        )

    return actions
