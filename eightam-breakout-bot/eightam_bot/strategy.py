"""The 8am break-and-retest state machine.

Implements the strategy exactly as described in the source video: mark the
New York 8:00-8:15am candle range, wait for a 1-minute candle to CLOSE
beyond it at or after 9:30am (the video's stated volume cutoff -- a break
before then is explicitly ignored), treat that as the day's directional
bias, and arm a limit-style entry at the range's midpoint. If price retraces
to the midpoint before the trade window closes, the trade fills there with
a stop just beyond the range's opposite boundary and a target derived from
it (see risk_manager.py); if price never comes back, the setup is abandoned
for the day with no trade taken. At most one trade is taken per symbol per
day, matching the video's own "we are scalpers, we follow the plan"
discipline -- there is no re-arming after a trade closes or a setup times
out.

Every phase handler is a pure transformation of an explicit `DayState` plus
one new `Candle` (plus config and, only where genuinely needed, an explicit
bankroll figure and circuit-breaker flag) -- no I/O, no wall-clock reads, no
knowledge of the data feed or execution layer. That's what lets the exact
same code drive the live/paper runner and the backtester one bar at a time,
identically -- the same "replay the exact same logic used live" principle
the sibling memebot project's backtest engine is built on.

Fill/exit prices computed here are *ideal*: no slippage, no fees. The
execution layer is responsible for adjusting a `TradeClosed` event's numbers
to reflect real-world fill friction before journaling it -- see
docs/STRATEGY.md #4 for exactly which fills get slippage applied and why
(short version: resting limit orders -- the entry and the take-profit --
don't; stop-loss and force-close, both effectively market orders once
triggered, do).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time
from enum import Enum
from zoneinfo import ZoneInfo

from eightam_bot.models import Bias, BreakoutEvent, Candle, SessionRange, Trade
from eightam_bot.risk_manager import RiskConfig, compute_trade_levels, create_trade, new_trade_id, size_position
from eightam_bot.timeutils import ny_date, ny_time


@dataclass(slots=True)
class StrategyConfig:
    tz: ZoneInfo
    range_start: time
    range_end: time
    trade_window_start: time
    trade_window_end: time
    force_close_time: time
    trading_days: frozenset[int] = field(default_factory=lambda: frozenset({0, 1, 2, 3, 4}))
    breakout_confirmation: str = "close"  # "close" (filters wicks) | "wick" (any touch counts)


class Phase(str, Enum):
    WAITING_FOR_RANGE = "waiting_for_range"
    WAITING_FOR_BREAK = "waiting_for_break"
    WAITING_FOR_RETEST = "waiting_for_retest"
    IN_TRADE = "in_trade"
    DONE = "done"


@dataclass(slots=True)
class DayState:
    symbol: str
    session_date: date
    phase: Phase = Phase.WAITING_FOR_RANGE
    range_high: float = float("-inf")
    range_low: float = float("inf")
    range_start_ts: int | None = None
    session_range: SessionRange | None = None
    breakout: BreakoutEvent | None = None
    trade: Trade | None = None
    done_reason: str = ""


# --- events emitted by process_candle / SymbolSessionRunner ----------------


@dataclass(slots=True)
class RangeBuilt:
    symbol: str
    range: SessionRange


@dataclass(slots=True)
class BreakoutDetected:
    symbol: str
    breakout: BreakoutEvent
    range: SessionRange


@dataclass(slots=True)
class EntryFilled:
    symbol: str
    trade: Trade


@dataclass(slots=True)
class TradeClosed:
    symbol: str
    trade: Trade


@dataclass(slots=True)
class SetupInvalidated:
    symbol: str
    session_date: date
    reason: str


@dataclass(slots=True)
class NoTradeToday:
    symbol: str
    session_date: date
    reason: str


StrategyEvent = RangeBuilt | BreakoutDetected | EntryFilled | TradeClosed | SetupInvalidated | NoTradeToday


def new_day_state(symbol: str, session_date: date) -> DayState:
    return DayState(symbol=symbol, session_date=session_date)


def _finalize_range(state: DayState, end_ts: int) -> SessionRange | None:
    if state.range_start_ts is None or state.range_high == float("-inf") or state.range_low == float("inf"):
        return None
    return SessionRange(
        session_date=state.session_date,
        high=state.range_high,
        low=state.range_low,
        start_ts=state.range_start_ts,
        end_ts=end_ts,
    )


def _breakout_bias(candle: Candle, range_: SessionRange, cfg: StrategyConfig) -> Bias | None:
    high_ref = candle.close if cfg.breakout_confirmation == "close" else candle.high
    low_ref = candle.close if cfg.breakout_confirmation == "close" else candle.low
    if high_ref > range_.high:
        return Bias.LONG
    if low_ref < range_.low:
        return Bias.SHORT
    return None


def _process_waiting_for_range(state: DayState, candle: Candle, cfg: StrategyConfig, t: time) -> list[StrategyEvent]:
    if cfg.range_start <= t < cfg.range_end:
        if state.range_start_ts is None:
            state.range_start_ts = candle.timestamp
        state.range_high = max(state.range_high, candle.high)
        state.range_low = min(state.range_low, candle.low)
        return []

    if t < cfg.range_start:
        return []  # still before the range window opens today

    # t >= range_end: the range window has just closed -- finalize it, or
    # give up for the day if no candle ever fell inside [range_start,
    # range_end), e.g. a gap in the data feed right at the open.
    range_ = _finalize_range(state, end_ts=candle.timestamp)
    if range_ is None:
        state.phase = Phase.DONE
        state.done_reason = "no candles observed during the 8:00-8:15 range window"
        return [NoTradeToday(state.symbol, state.session_date, state.done_reason)]

    state.session_range = range_
    state.phase = Phase.WAITING_FOR_BREAK
    return [RangeBuilt(state.symbol, range_)]


def _process_waiting_for_break(state: DayState, candle: Candle, cfg: StrategyConfig, t: time) -> list[StrategyEvent]:
    if t >= cfg.trade_window_end:
        state.phase = Phase.DONE
        state.done_reason = "no qualifying breakout before the trade window closed"
        return [NoTradeToday(state.symbol, state.session_date, state.done_reason)]

    if t < cfg.trade_window_start:
        return []  # a break before 9:30 doesn't have enough volume behind it yet, per the strategy

    range_ = state.session_range
    assert range_ is not None
    bias = _breakout_bias(candle, range_, cfg)
    if bias is None:
        return []

    state.breakout = BreakoutEvent(bias=bias, breakout_ts=candle.timestamp, breakout_price=candle.close)
    state.phase = Phase.WAITING_FOR_RETEST
    return [BreakoutDetected(state.symbol, state.breakout, range_)]


def _process_waiting_for_retest(
    state: DayState,
    candle: Candle,
    cfg: StrategyConfig,
    risk_cfg: RiskConfig,
    bankroll_usd: float,
    halt_reason: str,
    t: time,
) -> list[StrategyEvent]:
    if t >= cfg.trade_window_end:
        state.phase = Phase.DONE
        state.done_reason = "breakout never retested before the trade window closed"
        return [SetupInvalidated(state.symbol, state.session_date, state.done_reason)]

    range_ = state.session_range
    breakout = state.breakout
    assert range_ is not None and breakout is not None
    levels = compute_trade_levels(range_, breakout.bias, risk_cfg)

    # Entry is a resting limit order at the midpoint. The state-machine
    # invariant "price was still above the midpoint (long) / below it
    # (short) as of the end of the previous candle" (else we'd already have
    # filled and left this phase) means a single-sided touch test is enough
    # to know the order was reached -- no need to also bound the far side of
    # the candle's range. This also correctly treats a violent single-candle
    # move that blows straight through the midpoint AND the stop as a fill
    # (a real resting limit order would have been hit on the way through),
    # which then resolves as a same-setup stop-out on a later candle rather
    # than as some separate "invalidated without trading" case -- there
    # isn't one: the only way this setup produces no trade is time (the
    # trade window closing before a retest ever happens).
    touched = candle.low <= levels.entry_price if breakout.bias is Bias.LONG else candle.high >= levels.entry_price
    if not touched:
        return []

    if halt_reason:
        state.phase = Phase.DONE
        state.done_reason = f"retest filled but new entries are halted: {halt_reason}"
        return [NoTradeToday(state.symbol, state.session_date, state.done_reason)]

    sizing = size_position(bankroll_usd, levels, risk_cfg)
    if sizing.quantity <= 0:
        state.phase = Phase.DONE
        state.done_reason = "retest filled but position sizing produced zero quantity (bankroll depleted?)"
        return [NoTradeToday(state.symbol, state.session_date, state.done_reason)]

    trade = create_trade(new_trade_id(), state.symbol, range_, breakout.bias, levels, sizing, candle.timestamp)
    state.trade = trade
    state.phase = Phase.IN_TRADE
    return [EntryFilled(state.symbol, trade)]


def _process_in_trade(state: DayState, candle: Candle, cfg: StrategyConfig, t: time) -> list[StrategyEvent]:
    trade = state.trade
    assert trade is not None

    exit_price: float | None = None
    exit_reason = ""
    if trade.bias is Bias.LONG:
        # Stop checked before target: if a single volatile candle's range
        # spans both levels, which was actually hit first intra-bar is
        # ambiguous from OHLC alone -- assuming the worse outcome is the
        # standard, conservative backtesting convention, so results don't
        # overstate performance. See docs/STRATEGY.md #4.
        if candle.low <= trade.stop_price:
            exit_price, exit_reason = trade.stop_price, "stop_loss"
        elif candle.high >= trade.target_price:
            exit_price, exit_reason = trade.target_price, "take_profit"
    else:
        if candle.high >= trade.stop_price:
            exit_price, exit_reason = trade.stop_price, "stop_loss"
        elif candle.low <= trade.target_price:
            exit_price, exit_reason = trade.target_price, "take_profit"

    if exit_price is None and t >= cfg.force_close_time:
        # Crypto trades 24/7, unlike the futures/equities session the video
        # trades, which just ends -- a runaway hold needs an explicit cutoff.
        exit_price, exit_reason = candle.close, "force_close"

    if exit_price is None:
        return []

    trade.exit_price = exit_price
    trade.exit_ts = candle.timestamp
    trade.exit_reason = exit_reason
    pnl_per_unit = (exit_price - trade.entry_price) if trade.bias is Bias.LONG else (trade.entry_price - exit_price)
    trade.realized_pnl_usd = pnl_per_unit * trade.quantity  # ideal fill, no fees/slippage -- see module docstring
    state.phase = Phase.DONE
    state.done_reason = f"trade closed: {exit_reason}"
    return [TradeClosed(state.symbol, trade)]


def process_candle(
    state: DayState,
    candle: Candle,
    cfg: StrategyConfig,
    risk_cfg: RiskConfig,
    bankroll_usd: float = 0.0,
    halt_reason: str = "",
) -> list[StrategyEvent]:
    """Advance `state` (mutated in place) by exactly one candle and return
    whatever events happened on it. `bankroll_usd`/`halt_reason` are only
    consulted at the moment a retest fills -- `bankroll_usd` for position
    sizing, `halt_reason` (non-empty means halted, e.g. from
    risk_manager.py's `check_daily_loss_limit`, or from the optional ML
    confidence filter rejecting this specific setup) to skip taking the
    trade even though price reached the entry. Both are the caller's
    responsibility to supply fresh each call, the same way the sibling
    memebot project's `evaluate_exits` takes `now` and `liquidity_trend` as
    explicit parameters rather than reading them itself.
    """
    t = ny_time(candle.timestamp, cfg.tz)

    if state.phase is Phase.WAITING_FOR_RANGE:
        return _process_waiting_for_range(state, candle, cfg, t)
    if state.phase is Phase.WAITING_FOR_BREAK:
        return _process_waiting_for_break(state, candle, cfg, t)
    if state.phase is Phase.WAITING_FOR_RETEST:
        return _process_waiting_for_retest(state, candle, cfg, risk_cfg, bankroll_usd, halt_reason, t)
    if state.phase is Phase.IN_TRADE:
        return _process_in_trade(state, candle, cfg, t)
    return []  # Phase.DONE -- nothing left to do for this symbol today


class SymbolSessionRunner:
    """Feeds one symbol's candles into the state machine bar by bar,
    handling New York day rollover (resets to a fresh `DayState`) and the
    Mon-Fri trading-day filter -- the "institutions positioning before the
    NY open" premise this strategy is built on doesn't really apply on a
    weekend, even though crypto itself keeps trading. Used identically by
    the live/paper runner and the backtester.
    """

    def __init__(self, symbol: str, cfg: StrategyConfig) -> None:
        self.symbol = symbol
        self.cfg = cfg
        self.state: DayState | None = None
        self.completed_days: list[DayState] = []

    def on_candle(
        self,
        candle: Candle,
        risk_cfg: RiskConfig,
        bankroll_usd: float = 0.0,
        halt_reason: str = "",
    ) -> list[StrategyEvent]:
        local_date = ny_date(candle.timestamp, self.cfg.tz)
        if self.state is None or self.state.session_date != local_date:
            if self.state is not None:
                self.completed_days.append(self.state)
            self.state = new_day_state(self.symbol, local_date)
            if local_date.weekday() not in self.cfg.trading_days:
                self.state.phase = Phase.DONE
                self.state.done_reason = "not a configured trading day"

        if self.state.phase is Phase.DONE:
            return []
        return process_candle(self.state, candle, self.cfg, risk_cfg, bankroll_usd, halt_reason)

    def all_days(self) -> list[DayState]:
        """`completed_days` plus today-in-progress (or today-just-finished)
        -- `completed_days` alone would silently drop the most recent day,
        since a day is only archived there once a *later* day's first
        candle arrives to push it out. Used by ml_filter.py to build a
        training set after a backtest run."""
        return self.completed_days + ([self.state] if self.state is not None else [])
