"""Stop/target calculation, position sizing, and the daily-loss circuit
breaker. Pure functions over explicit numbers (a `SessionRange`, a `Bias`, an
account bankroll) -- no I/O, no knowledge of the data feed or execution
layer -- so this is trivial to unit test and is exactly what both the
live/paper runner and the backtester call to turn a retest fill into a
sized trade. Slippage and fees are deliberately NOT applied here -- these
functions produce the *ideal* fill; the execution layer (execution/paper.py,
execution/ccxt_live.py, backtest/engine.py) is what turns an ideal price
into a realistic one, the same split the sibling memebot project uses
between its risk manager and its execution providers.

Stop placement uses the *zone boundary* (the opposite side of the 8am range
from the breakout), not a fixed points offset from the midpoint entry, even
though the video demonstrates both inconsistently across its five examples.
The zone-boundary version is the one it actually gives a reason for --
"Asia low will often act as a magnet for price... a clear zone of
invalidation" -- so that's the one implemented as the default, configurable
rule here. See docs/STRATEGY.md #3.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from eightam_bot.models import Bias, SessionRange, Trade


@dataclass(slots=True)
class RiskConfig:
    stop_buffer_type: str = "percent"  # "percent" (of the boundary price) | "points" (raw price units)
    stop_buffer_value: float = 0.12
    take_profit_mode: str = "r_multiple"  # "r_multiple" | "percent" | "points"
    take_profit_value: float = 3.0
    risk_per_trade_pct: float = 1.0
    max_daily_loss_pct: float = 4.0
    starting_bankroll_usd: float = 10_000.0


@dataclass(slots=True)
class TradeLevels:
    entry_price: float
    stop_price: float
    target_price: float


@dataclass(slots=True)
class PositionSizeResult:
    quantity: float
    notional_usd: float
    risk_usd: float


def compute_trade_levels(range_: SessionRange, bias: Bias, cfg: RiskConfig) -> TradeLevels:
    """Entry is always the range midpoint. Stop sits just beyond whichever
    boundary is *opposite* the breakout direction (the range low for a long,
    the range high for a short) -- the "Asia low as a magnet" invalidation
    level from the video. Target is derived from the resulting risk distance
    by default (`take_profit_mode: "r_multiple"`, default 3R -- close to the
    video's own 5-point-stop / 15-point-target examples), or set directly in
    price units/percent for instruments where a fixed target makes more
    sense than a risk multiple.
    """
    entry = range_.midpoint
    boundary = range_.low if bias is Bias.LONG else range_.high

    buffer = cfg.stop_buffer_value if cfg.stop_buffer_type == "points" else boundary * cfg.stop_buffer_value / 100
    stop = boundary - buffer if bias is Bias.LONG else boundary + buffer
    risk_per_unit = abs(entry - stop)

    if cfg.take_profit_mode == "points":
        reward_per_unit = cfg.take_profit_value
    elif cfg.take_profit_mode == "percent":
        reward_per_unit = entry * cfg.take_profit_value / 100
    else:  # "r_multiple"
        reward_per_unit = risk_per_unit * cfg.take_profit_value

    target = entry + reward_per_unit if bias is Bias.LONG else entry - reward_per_unit
    return TradeLevels(entry_price=entry, stop_price=stop, target_price=target)


def size_position(bankroll_usd: float, levels: TradeLevels, cfg: RiskConfig) -> PositionSizeResult:
    """Fixed-fractional sizing: risk exactly `risk_per_trade_pct` of bankroll
    on the entry-to-stop distance, hard-capped so notional never exceeds the
    bankroll itself. That cap assumes spot-style, unleveraged sizing -- if
    you're trading this on a margined/leveraged account, treat this as a
    conservative floor and adapt sizing to your own margin rules rather than
    relying on this cap to reflect your actual buying power."""
    if bankroll_usd <= 0 or levels.entry_price <= 0:
        return PositionSizeResult(0.0, 0.0, 0.0)

    risk_per_unit = abs(levels.entry_price - levels.stop_price)
    if risk_per_unit <= 0:
        return PositionSizeResult(0.0, 0.0, 0.0)

    risk_usd = bankroll_usd * cfg.risk_per_trade_pct / 100
    quantity = risk_usd / risk_per_unit
    notional = quantity * levels.entry_price

    if notional > bankroll_usd:
        quantity = bankroll_usd / levels.entry_price
        notional = bankroll_usd
        risk_usd = quantity * risk_per_unit

    return PositionSizeResult(quantity=quantity, notional_usd=notional, risk_usd=risk_usd)


def new_trade_id() -> str:
    return str(uuid.uuid4())


def create_trade(
    trade_id: str,
    symbol: str,
    range_: SessionRange,
    bias: Bias,
    levels: TradeLevels,
    sizing: PositionSizeResult,
    entry_ts: int,
) -> Trade:
    return Trade(
        id=trade_id,
        symbol=symbol,
        session_date=range_.session_date,
        bias=bias,
        entry_price=levels.entry_price,
        entry_ts=entry_ts,
        stop_price=levels.stop_price,
        target_price=levels.target_price,
        quantity=sizing.quantity,
        risk_usd=sizing.risk_usd,
    )


def check_daily_loss_limit(daily_realized_pnl_usd: float, cfg: RiskConfig) -> tuple[bool, str]:
    """Returns (halted, reason). Halts new entries for the rest of the day
    once realized losses reach `max_daily_loss_pct` of the *starting*
    bankroll -- a fixed baseline rather than shrinking current equity, so the
    breaker's dollar threshold doesn't get more lenient as a bad day
    compounds. At most one trade is taken per symbol per day (see
    strategy.py), so this mostly matters when running several symbols at
    once: each gets its own independent setup, but losses still stack across
    them against one shared daily limit."""
    if cfg.starting_bankroll_usd <= 0:
        return True, "bankroll depleted"
    loss_pct = -daily_realized_pnl_usd / cfg.starting_bankroll_usd * 100
    if loss_pct >= cfg.max_daily_loss_pct:
        return True, f"daily loss {loss_pct:.1f}% has reached the {cfg.max_daily_loss_pct:.1f}% circuit-breaker limit"
    return False, ""
