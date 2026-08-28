from datetime import date, datetime, timedelta

import pytest

from rangebreak import strategy
from rangebreak.data.synthetic import SCENARIOS, generate_day_with_meta
from rangebreak.models import BacktestConfig, Candle, DayOutcome, SweepDirection
from rangebreak.strategy import run_day
from rangebreak.timeutils import ET

TICK = 0.01
DAY = date(2026, 3, 2)  # a Monday


def mk(ts, o, h, l, c):
    return Candle(ts=ts, open=o, high=h, low=l, close=c, volume=1000.0)


def t(day, hh, mm):
    return datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET)


# ---------- whitebox: sweep detection ----------


def test_breach_exactly_at_boundary_does_not_count():
    bars = [mk(t(DAY, 9, 0), 99.50, 99.60, 99.00, 99.20)]  # low == range_low exactly, not below it
    direction, *_ = strategy._detect_sweep(bars, 101.00, 99.00, TICK)
    assert direction is None


def test_breach_one_tick_below_counts_and_reclaims_next_bar():
    bars = [
        mk(t(DAY, 9, 0), 99.05, 99.06, 98.99, 99.00),  # breach: low = range_low - 1 tick; close AT range_low, not above it
        mk(t(DAY, 9, 1), 99.00, 99.30, 99.00, 99.10),  # reclaim: close back above range_low
    ]
    direction, sweep_price, breach_time, reclaim_time = strategy._detect_sweep(bars, 101.00, 99.00, TICK)
    assert direction == SweepDirection.BULLISH
    assert sweep_price == 98.99
    assert breach_time == t(DAY, 9, 0)
    assert reclaim_time == t(DAY, 9, 1)


def test_same_bar_breach_and_reclaim():
    bars = [mk(t(DAY, 9, 0), 99.20, 99.30, 98.90, 99.15)]  # wicks below then closes back above range_low
    direction, sweep_price, breach_time, reclaim_time = strategy._detect_sweep(bars, 101.00, 99.00, TICK)
    assert direction == SweepDirection.BULLISH
    assert sweep_price == 98.90
    assert breach_time == reclaim_time == t(DAY, 9, 0)


def test_sweep_extreme_tracks_the_whole_excursion_not_just_first_breach_bar():
    bars = [
        mk(t(DAY, 9, 0), 99.10, 99.20, 98.95, 98.97),  # breach, still outside
        mk(t(DAY, 9, 1), 98.97, 99.00, 98.80, 98.85),  # makes a LOWER low, still outside
        mk(t(DAY, 9, 2), 98.85, 99.10, 98.85, 99.05),  # reclaims
    ]
    direction, sweep_price, _, reclaim_time = strategy._detect_sweep(bars, 101.00, 99.00, TICK)
    assert direction == SweepDirection.BULLISH
    assert sweep_price == 98.80  # lowest point of the whole excursion
    assert reclaim_time == t(DAY, 9, 2)


def test_breach_without_reclaim_in_window_is_no_sweep():
    bars = [mk(t(DAY, 9, 0), 99.10, 99.20, 98.90, 98.92)]  # breaches, never comes back
    direction, *_ = strategy._detect_sweep(bars, 101.00, 99.00, TICK)
    assert direction is None


def test_bearish_breach_and_reclaim():
    bars = [
        mk(t(DAY, 9, 0), 100.80, 101.02, 100.70, 100.95),  # breach: high >= range_high + 1 tick
        mk(t(DAY, 9, 1), 100.95, 101.00, 100.80, 100.85),  # reclaim: close back below range_high
    ]
    direction, sweep_price, *_ = strategy._detect_sweep(bars, 101.00, 99.00, TICK)
    assert direction == SweepDirection.BEARISH
    assert sweep_price == 101.02


# ---------- whitebox: pre-sweep swing point ----------


def test_swing_high_rejects_a_tie_with_its_neighbor():
    breach_time = t(DAY, 9, 5)
    candles = [
        mk(t(DAY, 8, 58), 100.05, 100.20, 99.95, 100.02),  # high ties the pivot -> pivot isn't strictly greater
        mk(t(DAY, 9, 0), 100.02, 100.20, 100.00, 100.15),  # candidate pivot, high=100.20
        mk(t(DAY, 9, 1), 100.15, 100.12, 100.05, 100.08),
    ]
    price, _ = strategy._find_pre_sweep_swing(candles, breach_time, SweepDirection.BULLISH, TICK)
    assert price is None


def test_swing_high_finds_most_recent_qualifying_pivot():
    breach_time = t(DAY, 9, 10)
    candles = [
        mk(t(DAY, 8, 0), 100.0, 100.50, 99.90, 100.10),  # earlier, higher swing high -- must be ignored (not most recent)
        mk(t(DAY, 8, 1), 100.10, 100.20, 100.00, 100.05),
        mk(t(DAY, 8, 30), 100.05, 100.15, 99.95, 100.10),
        mk(t(DAY, 8, 31), 100.10, 100.30, 100.05, 100.20),  # most recent pivot, high=100.30
        mk(t(DAY, 8, 32), 100.20, 100.25, 100.10, 100.15),
    ]
    price, ts = strategy._find_pre_sweep_swing(candles, breach_time, SweepDirection.BULLISH, TICK)
    assert price == 100.30
    assert ts == t(DAY, 8, 31)


def test_swing_low_mirrors_swing_high():
    breach_time = t(DAY, 9, 10)
    candles = [
        mk(t(DAY, 8, 30), 100.15, 100.20, 100.05, 100.10),
        mk(t(DAY, 8, 31), 100.10, 100.15, 99.90, 99.95),  # pivot, low=99.90
        mk(t(DAY, 8, 32), 99.95, 100.05, 99.95, 100.00),
    ]
    price, ts = strategy._find_pre_sweep_swing(candles, breach_time, SweepDirection.BEARISH, TICK)
    assert price == 99.90
    assert ts == t(DAY, 8, 31)


# ---------- whitebox: exit simulation ----------


def test_conservative_stop_priority_when_both_levels_touch_in_one_bar():
    entry_bar = mk(t(DAY, 9, 15), 100.00, 100.05, 99.95, 100.00)
    next_bar = mk(t(DAY, 9, 16), 100.00, 101.50, 98.50, 100.50)  # spans both stop (99.00) and target (101.00)
    outcome, exit_time, exit_price = strategy._simulate_exit(
        [entry_bar, next_bar], entry_bar, is_long=True, stop_price=99.00, target_price=101.00,
        session_close=t(DAY, 16, 0), tick_size=TICK,
    )
    assert outcome == DayOutcome.STOP
    assert exit_price == 99.00
    assert exit_time == t(DAY, 9, 16)


def test_exit_falls_back_to_eod_when_neither_level_is_touched():
    entry_bar = mk(t(DAY, 9, 15), 100.00, 100.05, 99.95, 100.00)
    later = mk(t(DAY, 15, 59), 100.10, 100.15, 100.05, 100.12)
    outcome, exit_time, exit_price = strategy._simulate_exit(
        [entry_bar, later], entry_bar, is_long=True, stop_price=90.00, target_price=110.00,
        session_close=t(DAY, 16, 0), tick_size=TICK,
    )
    assert outcome == DayOutcome.EOD
    assert exit_price == 100.12


# ---------- end-to-end: every synthetic scenario resolves as scripted ----------

EXPECTED_BY_SCENARIO = {
    "bullish_target": DayOutcome.TARGET,
    "bullish_stop": DayOutcome.STOP,
    "bearish_target": DayOutcome.TARGET,
    "bearish_stop": DayOutcome.STOP,
    "invalid_sweep": DayOutcome.INVALID_SWEEP,
    "no_sweep": DayOutcome.NO_SWEEP,
    "no_entry_trigger": DayOutcome.NO_ENTRY_TRIGGER,
}


@pytest.mark.parametrize("ticker", ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "IWM", "DEMO1", "DEMO2"])
def test_synthetic_scenarios_resolve_as_scripted(ticker):
    cfg = BacktestConfig()
    seen = set()
    day = DAY
    checked = 0
    while len(seen) < len(SCENARIOS) and checked < 60:
        if day.weekday() < 5:
            candles, meta = generate_day_with_meta(ticker, day)
            record = run_day(ticker, day, candles, cfg)
            assert record.outcome == EXPECTED_BY_SCENARIO[meta["scenario"]], (
                f"{ticker} {day} scenario={meta['scenario']} expected "
                f"{EXPECTED_BY_SCENARIO[meta['scenario']]} got {record.outcome} notes={record.notes!r}"
            )
            assert record.range_high == meta["range_high"]
            assert record.range_low == meta["range_low"]
            if "sweep_direction" in meta:
                assert record.sweep_direction.value == meta["sweep_direction"]
            seen.add(meta["scenario"])
            checked += 1
        day = day + timedelta(days=1)
    assert seen == set(SCENARIOS), f"never saw scenarios {set(SCENARIOS) - seen} for {ticker} in {checked} weekdays"


@pytest.mark.parametrize(
    "scenario,expect_positive_r",
    [("bullish_target", True), ("bearish_target", True), ("bullish_stop", False), ("bearish_stop", False)],
)
def test_traded_scenarios_have_correctly_signed_r_and_sane_levels(scenario, expect_positive_r):
    cfg = BacktestConfig()
    day = DAY
    for _ in range(60):
        if day.weekday() < 5:
            candles, meta = generate_day_with_meta("SPY", day)
            if meta["scenario"] == scenario:
                record = run_day("SPY", day, candles, cfg)
                assert record.result_r is not None
                assert (record.result_r > 0) == expect_positive_r
                assert record.first_hit == record.outcome.value
                if meta["sweep_direction"] == "bullish":
                    assert record.stop_price < record.entry_price < record.target_price
                else:
                    assert record.stop_price > record.entry_price > record.target_price
                return
        day = day + timedelta(days=1)
    pytest.fail(f"scenario {scenario} not found for SPY within range scanned")


def test_only_first_setup_of_the_day_is_considered():
    """A day is fully decided by the first breach+reclaim event in the
    9:00-10:00 window; nothing after it (even a further, opposite-side
    breach) creates a second candidate."""
    range_high, range_low = 101.00, 99.00
    monitor = [
        mk(t(DAY, 9, 0), 99.20, 99.30, 98.99, 99.05),  # first: low breach
        mk(t(DAY, 9, 1), 99.05, 99.30, 99.00, 99.10),  # reclaims -> this is THE sweep
        mk(t(DAY, 9, 2), 99.10, 101.05, 99.05, 100.90),  # a later high-side breach must be ignored
        mk(t(DAY, 9, 3), 100.90, 100.95, 100.80, 100.85),
    ] + [mk(t(DAY, 9, m), 100.0, 100.1, 99.9, 100.0) for m in range(4, 60)]
    direction, *_ = strategy._detect_sweep(monitor, range_high, range_low, TICK)
    assert direction == SweepDirection.BULLISH
