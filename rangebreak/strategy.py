"""The mechanical 8-9am ET opening-range liquidity-sweep strategy.

Rules implemented exactly as specified (see repo root README.md,
"Range Breakout Web App" section, for the full write-up and for the
handful of places the natural-language spec was genuinely ambiguous and
had to be nailed down to something mechanical -- each such choice is
called out in a comment at the point it's made, not just in the docs).

`run_day` is the only entry point most callers need: give it one trading
day's worth of 1-minute candles (spanning at least `fetch_start` through
`session_close` from `timeutils.session_windows`) and a cost config, get
back one fully-resolved TradeRecord. It never looks at a candle later than
the point in the simulation that would legitimately know about it, with
one deliberate, documented exception (see "VALIDITY" below).

Candles must be sorted ascending by `ts` and tz-aware in America/New_York
(or any tz -- they're normalized here, but consistently ordered).
"""

from __future__ import annotations

from datetime import date

from .costs import eod_fill, entry_fill, round_to_tick, stop_fill, target_fill, to_ticks
from .models import BacktestConfig, Candle, DayOutcome, SweepDirection, TradeRecord
from .timeutils import session_windows


def _slice(candles: list[Candle], start, end):
    """Half-open [start, end): `ts` is each bar's OPEN time, so a bar
    opening exactly at `end` belongs to the following window, not this one."""
    return [c for c in candles if start <= c.ts < end]


def _compute_range(range_candles: list[Candle]) -> tuple[float, float]:
    return max(c.high for c in range_candles), min(c.low for c in range_candles)


def _detect_sweep(monitor_candles: list[Candle], range_high: float, range_low: float, tick_size: float):
    """Walk the 9:00-10:00 candles chronologically looking for the first
    breach-then-reclaim excursion on either side.

    Returns (direction, extreme_price, breach_time, reclaim_time) for the
    first sweep found, or (None, None, None, None) if price never both
    breached a side by >=1 tick AND closed back inside on that side within
    the window (a breach with no reclaim by 10:00 counts as "not swept and
    reclaimed" per the spec, same as no breach at all -> NO_SWEEP).
    """
    rh_ticks, rl_ticks = to_ticks(range_high, tick_size), to_ticks(range_low, tick_size)
    breach_side: str | None = None  # "low" or "high"
    breach_time = None

    for bar in monitor_candles:
        low_t, high_t, close_t = (to_ticks(bar.low, tick_size), to_ticks(bar.high, tick_size), to_ticks(bar.close, tick_size))
        if breach_side is None:
            low_breach = low_t <= rl_ticks - 1
            high_breach = high_t >= rh_ticks + 1
            if not low_breach and not high_breach:
                continue
            if low_breach and high_breach:
                # A single bar breached both sides (wide/gappy bar) -- pick
                # whichever side moved further beyond its threshold as the
                # "active" excursion. Deterministic tie-break for a rare edge case.
                low_extent = rl_ticks - low_t
                high_extent = high_t - rh_ticks
                breach_side = "low" if low_extent >= high_extent else "high"
            else:
                breach_side = "low" if low_breach else "high"
            breach_time = bar.ts
            # Same-bar reclaim: the bar that breaches can also be the bar
            # that closes back inside (a long lower/upper wick).
            if breach_side == "low" and close_t > rl_ticks:
                return SweepDirection.BULLISH, bar.low, breach_time, bar.ts
            if breach_side == "high" and close_t < rh_ticks:
                return SweepDirection.BEARISH, bar.high, breach_time, bar.ts
        else:
            reclaimed = (close_t > rl_ticks) if breach_side == "low" else (close_t < rh_ticks)
            if reclaimed:
                excursion = [c for c in monitor_candles if breach_time <= c.ts <= bar.ts]
                if breach_side == "low":
                    return SweepDirection.BULLISH, min(c.low for c in excursion), breach_time, bar.ts
                return SweepDirection.BEARISH, max(c.high for c in excursion), breach_time, bar.ts

    return None, None, None, None


def _hour_closes_inside_range(monitor_candles: list[Candle], range_high: float, range_low: float, tick_size: float) -> bool:
    """VALIDITY: 'the 9:00-10:00 AM candle eventually closes back inside the
    original range' is evaluated against the *full hour's* close (the last
    1-minute bar before 10:00 ET) -- i.e. the same close a native 1-hour
    9:00-10:00 candle would have, since a 1-hour bar's close is just its
    last constituent minute's close.

    This is the one place this backtest deliberately looks past the moment
    a trade might already have triggered: if entry happens at, say, 9:20,
    this day's validity (and therefore whether the trade counts at all) is
    still decided by the 9:00-10:00 hour's eventual close at 10:00. That's
    what the spec explicitly asks for ("for the backtest, define...");
    a live version of this exact rule would need to treat any signal before
    10:00 as provisional until the hour closes. Entry price/time/stop are
    never affected by this -- they only ever use data up to their own bar.
    """
    if not monitor_candles:
        return False
    hour_close = monitor_candles[-1].close
    hc = to_ticks(hour_close, tick_size)
    return to_ticks(range_low, tick_size) <= hc <= to_ticks(range_high, tick_size)


def _find_pre_sweep_swing(candles: list[Candle], breach_time, direction: SweepDirection, tick_size: float):
    """Most recent 3-bar fractal swing point strictly before the sweep.

    A swing candle at index i needs both neighbors (i-1, i+1) to already
    exist and to sit before the sweep began, so the whole pattern -- pivot
    included -- is fully established prior to the sweep. Scans backward
    from just before the breach so "most recent" is the first match found.
    """
    pre = [c for c in candles if c.ts < breach_time]
    for i in range(len(pre) - 2, 0, -1):
        left, mid, right = pre[i - 1], pre[i], pre[i + 1]
        if direction == SweepDirection.BULLISH:
            if to_ticks(mid.high, tick_size) > to_ticks(left.high, tick_size) and to_ticks(mid.high, tick_size) > to_ticks(right.high, tick_size):
                return mid.high, mid.ts
        else:
            if to_ticks(mid.low, tick_size) < to_ticks(left.low, tick_size) and to_ticks(mid.low, tick_size) < to_ticks(right.low, tick_size):
                return mid.low, mid.ts
    return None, None


def _find_entry_trigger(candles: list[Candle], reclaim_time, direction: SweepDirection, swing_price: float, session_close, tick_size: float):
    """First 1-minute candle (starting from, and including, the reclaim bar)
    whose close breaks the pre-sweep swing point."""
    swing_ticks = to_ticks(swing_price, tick_size)
    for bar in candles:
        if bar.ts < reclaim_time or bar.ts >= session_close:
            continue
        close_t = to_ticks(bar.close, tick_size)
        if direction == SweepDirection.BULLISH and close_t > swing_ticks:
            return bar
        if direction == SweepDirection.BEARISH and close_t < swing_ticks:
            return bar
    return None


def _simulate_exit(candles: list[Candle], entry_bar: Candle, is_long: bool, stop_price: float, target_price: float, session_close, tick_size: float):
    """Forward-simulate from the bar *after* entry (the entry bar's own
    high/low happened before/queued with the close that triggered entry,
    so it isn't used to also resolve the exit on the same bar) looking for
    whichever of stop/target is touched first.

    If a single 1-minute bar's range covers both levels, which happened
    first genuinely can't be known from OHLC bars alone (no tick data) --
    the standard conservative backtesting convention is applied: the stop
    is assumed to have been hit first, never the more favorable outcome.
    """
    stop_t, target_t = to_ticks(stop_price, tick_size), to_ticks(target_price, tick_size)
    remaining = [c for c in candles if entry_bar.ts < c.ts < session_close]
    for bar in remaining:
        low_t, high_t = to_ticks(bar.low, tick_size), to_ticks(bar.high, tick_size)
        hit_stop = low_t <= stop_t if is_long else high_t >= stop_t
        hit_target = high_t >= target_t if is_long else low_t <= target_t
        if hit_stop:
            return DayOutcome.STOP, bar.ts, stop_price
        if hit_target:
            return DayOutcome.TARGET, bar.ts, target_price
    last = remaining[-1] if remaining else entry_bar
    return DayOutcome.EOD, last.ts, last.close


def run_day(ticker: str, day: date, candles: list[Candle], cfg: BacktestConfig) -> TradeRecord:
    windows = session_windows(day, cfg.session_close_hour, cfg.session_close_minute, cfg.lookback_hours)
    candles = sorted(candles, key=lambda c: c.ts)

    range_candles = _slice(candles, windows.range_start, windows.range_end)
    if not range_candles:
        return TradeRecord(date=day.isoformat(), ticker=ticker, outcome=DayOutcome.INSUFFICIENT_DATA, notes="No 1-minute data for the 8:00-9:00 ET range candle.")
    range_high, range_low = _compute_range(range_candles)
    range_high, range_low = round_to_tick(range_high, cfg.tick_size), round_to_tick(range_low, cfg.tick_size)

    # Half-open on purpose: `ts` is each bar's OPEN time, so the bar opening
    # at exactly 10:00 is the first minute of the *next* hour, not part of
    # the 9:00-10:00 window (whose last bar opens at 09:59).
    monitor_candles = _slice(candles, windows.range_end, windows.monitor_end)
    if not monitor_candles:
        return TradeRecord(
            date=day.isoformat(), ticker=ticker, outcome=DayOutcome.INSUFFICIENT_DATA,
            range_high=range_high, range_low=range_low, notes="No 1-minute data for the 9:00-10:00 ET monitor window.",
        )

    direction, sweep_price, breach_time, reclaim_time = _detect_sweep(monitor_candles, range_high, range_low, cfg.tick_size)
    if direction is None:
        return TradeRecord(
            date=day.isoformat(), ticker=ticker, outcome=DayOutcome.NO_SWEEP,
            range_high=range_high, range_low=range_low,
            notes="Neither side of the range was swept by >=1 tick and reclaimed inside the 9:00-10:00 ET window.",
        )
    sweep_price = round_to_tick(sweep_price, cfg.tick_size)

    # Fields common to every remaining outcome, from here on this day always
    # has a real sweep to report even if it never becomes a trade.
    common = dict(
        date=day.isoformat(), ticker=ticker, range_high=range_high, range_low=range_low,
        sweep_direction=direction, sweep_price=sweep_price, sweep_time=breach_time, reclaim_time=reclaim_time,
    )

    if not _hour_closes_inside_range(monitor_candles, range_high, range_low, cfg.tick_size):
        return TradeRecord(
            outcome=DayOutcome.INVALID_SWEEP,
            notes="Swept and reclaimed intrabar, but the 9:00-10:00 ET hour didn't close back inside the 8-9am range.",
            **common,
        )

    swing_price, swing_time = _find_pre_sweep_swing(candles, breach_time, direction, cfg.tick_size)
    if swing_price is None:
        return TradeRecord(
            outcome=DayOutcome.NO_PRIOR_SWING,
            notes="Valid sweep, but no qualifying 1-minute swing point exists in the fetched history before it.",
            **common,
        )
    swing_price = round_to_tick(swing_price, cfg.tick_size)
    common["swing_price"], common["swing_time"] = swing_price, swing_time

    entry_bar = _find_entry_trigger(candles, reclaim_time, direction, swing_price, windows.session_close, cfg.tick_size)
    if entry_bar is None:
        return TradeRecord(
            outcome=DayOutcome.NO_ENTRY_TRIGGER,
            notes="Valid sweep and swing point, but no 1-minute candle closed beyond the swing point before the session close.",
            **common,
        )

    is_long = direction == SweepDirection.BULLISH
    entry_price = entry_fill(entry_bar.close, is_long, cfg)
    stop_nominal = sweep_price - cfg.tick_size if is_long else sweep_price + cfg.tick_size
    stop_price = round_to_tick(stop_nominal, cfg.tick_size)
    target_price = range_high if is_long else range_low

    risk = abs(entry_price - stop_price)
    if risk <= 0:
        return TradeRecord(
            outcome=DayOutcome.NO_ENTRY_TRIGGER,
            notes="Entry and stop coincided after cost adjustment (degenerate risk) -- no trade taken.",
            **common,
        )

    outcome, exit_time, exit_nominal = _simulate_exit(candles, entry_bar, is_long, stop_price, target_price, windows.session_close, cfg.tick_size)
    if outcome == DayOutcome.STOP:
        exit_price = stop_fill(exit_nominal, is_long, cfg)
    elif outcome == DayOutcome.TARGET:
        exit_price = target_fill(exit_nominal, cfg)
    else:
        exit_price = eod_fill(exit_nominal, is_long, cfg)

    pnl_per_share = (exit_price - entry_price) if is_long else (entry_price - exit_price)
    net_pnl_per_share = pnl_per_share - cfg.commission_per_share
    result_r = round(net_pnl_per_share / risk, 4)

    return TradeRecord(
        outcome=outcome, entry_time=entry_bar.ts, entry_price=entry_price, stop_price=stop_price,
        target_price=target_price, exit_time=exit_time, exit_price=exit_price, result_r=result_r,
        first_hit=outcome.value, **common,
    )
