"""State machine tests: range construction, breakout confirmation, retest
fill/timeout, stop/target/force-close management, one-trade-per-day
discipline, and day/weekday handling. This is the most important file in
the suite -- these tests are the actual specification of the strategy.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from eightam_bot.models import Bias
from eightam_bot.strategy import (
    BreakoutDetected,
    EntryFilled,
    NoTradeToday,
    Phase,
    RangeBuilt,
    SetupInvalidated,
    SymbolSessionRunner,
    TradeClosed,
)
from tests.conftest import MONDAY, SATURDAY, filler_candles, flat_candle, make_range_candles, mk_candle, ny_ts

SYMBOL = "BTC/USDT"


def _build_range(runner: SymbolSessionRunner, risk_cfg, d: date = MONDAY, high: float = 110.0, low: float = 100.0):
    for c in make_range_candles(d, high=high, low=low):
        runner.on_candle(c, risk_cfg)
    events = runner.on_candle(flat_candle(ny_ts(d, 8, 15), (high + low) / 2), risk_cfg)
    return events[0].range


def _build_range_and_reach_930(runner: SymbolSessionRunner, risk_cfg, d: date = MONDAY):
    _build_range(runner, risk_cfg, d=d)
    for c in filler_candles(d, 105.0, (8, 15), (9, 31)):
        runner.on_candle(c, risk_cfg)


# --- range construction ------------------------------------------------------


def test_range_building_and_finalization(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    events = []
    for c in make_range_candles(MONDAY, high=110.0, low=100.0):
        events += runner.on_candle(c, risk_cfg)
    assert events == []
    assert runner.state.phase is Phase.WAITING_FOR_RANGE

    events = runner.on_candle(flat_candle(ny_ts(MONDAY, 8, 15), 105.0), risk_cfg)
    assert len(events) == 1 and isinstance(events[0], RangeBuilt)
    rng = events[0].range
    assert rng.high == pytest.approx(110.0)
    assert rng.low == pytest.approx(100.0)
    assert rng.midpoint == pytest.approx(105.0)
    assert runner.state.phase is Phase.WAITING_FOR_BREAK


def test_no_candles_in_range_window_gives_no_trade(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    events = runner.on_candle(flat_candle(ny_ts(MONDAY, 7, 59), 105.0), risk_cfg)
    assert events == []

    events = runner.on_candle(flat_candle(ny_ts(MONDAY, 8, 16), 105.0), risk_cfg)
    assert len(events) == 1 and isinstance(events[0], NoTradeToday)
    assert "no candles" in events[0].reason
    assert runner.state.phase is Phase.DONE


# --- breakout confirmation ----------------------------------------------------


def test_breakout_before_930_is_ignored(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range(runner, risk_cfg)

    events = []
    for c in filler_candles(MONDAY, 105.0, (8, 15), (9, 0)):
        events += runner.on_candle(c, risk_cfg)
    early_break = mk_candle(ny_ts(MONDAY, 9, 0), 105.0, 112.0, 105.0, 112.0)
    events += runner.on_candle(early_break, risk_cfg)

    assert events == []
    assert runner.state.phase is Phase.WAITING_FOR_BREAK


def test_breakout_confirmed_long_at_931(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)

    breakout_candle = mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0)
    events = runner.on_candle(breakout_candle, risk_cfg)

    assert len(events) == 1 and isinstance(events[0], BreakoutDetected)
    assert events[0].breakout.bias is Bias.LONG
    assert events[0].breakout.breakout_price == pytest.approx(112.0)
    assert runner.state.phase is Phase.WAITING_FOR_RETEST


def test_wick_beyond_range_does_not_confirm_in_close_mode(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)

    # wicks to 112 (above the 110 high) but closes back inside the range
    wick_candle = mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 107.0, 108.0)
    events = runner.on_candle(wick_candle, risk_cfg)

    assert events == []
    assert runner.state.phase is Phase.WAITING_FOR_BREAK


def test_wick_beyond_range_confirms_in_wick_mode(strategy_cfg, risk_cfg):
    wick_cfg = replace(strategy_cfg, breakout_confirmation="wick")
    runner = SymbolSessionRunner(SYMBOL, wick_cfg)
    _build_range_and_reach_930(runner, risk_cfg)

    wick_candle = mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 107.0, 108.0)
    events = runner.on_candle(wick_candle, risk_cfg)

    assert len(events) == 1 and isinstance(events[0], BreakoutDetected)
    assert events[0].breakout.bias is Bias.LONG


def test_no_breakout_gives_no_trade_after_window_closes(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range(runner, risk_cfg)

    events = []
    for c in filler_candles(MONDAY, 105.0, (8, 15), (11, 0)):
        events += runner.on_candle(c, risk_cfg)
    events += runner.on_candle(flat_candle(ny_ts(MONDAY, 11, 0), 105.0), risk_cfg)

    no_trade = [e for e in events if isinstance(e, NoTradeToday)]
    assert len(no_trade) == 1
    assert "breakout" in no_trade[0].reason
    assert runner.state.phase is Phase.DONE


# --- retest fill / timeout -----------------------------------------------------


def test_retest_fill_long(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)
    assert runner.state.phase is Phase.WAITING_FOR_RETEST

    retest_candle = mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0)  # low touches the 105 midpoint
    events = runner.on_candle(retest_candle, risk_cfg, bankroll_usd=10_000.0)

    assert len(events) == 1 and isinstance(events[0], EntryFilled)
    trade = events[0].trade
    assert trade.bias is Bias.LONG
    assert trade.entry_price == pytest.approx(105.0)
    assert trade.stop_price == pytest.approx(99.0)
    assert trade.target_price == pytest.approx(115.0)
    assert trade.quantity == pytest.approx(100.0 / 6.0)  # 1% of $10,000 risk / 6 points risk-per-unit
    assert runner.state.phase is Phase.IN_TRADE


def test_retest_never_happens_times_out(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)

    events = []
    for c in filler_candles(MONDAY, 112.0, (9, 32), (11, 0)):  # stays well above the entry the whole time
        events += runner.on_candle(c, risk_cfg)
    events += runner.on_candle(flat_candle(ny_ts(MONDAY, 11, 0), 112.0), risk_cfg)

    invalidated = [e for e in events if isinstance(e, SetupInvalidated)]
    assert len(invalidated) == 1
    assert "retest" in invalidated[0].reason
    assert runner.state.phase is Phase.DONE


def test_halt_reason_blocks_entry_even_when_touched(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)

    retest_candle = mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0)
    events = runner.on_candle(
        retest_candle, risk_cfg, bankroll_usd=10_000.0, halt_reason="daily loss circuit-breaker limit"
    )

    assert len(events) == 1 and isinstance(events[0], NoTradeToday)
    assert "circuit-breaker" in events[0].reason
    assert runner.state.phase is Phase.DONE
    assert runner.state.trade is None


def test_zero_bankroll_gives_no_trade(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)

    retest_candle = mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0)
    events = runner.on_candle(retest_candle, risk_cfg, bankroll_usd=0.0)

    assert len(events) == 1 and isinstance(events[0], NoTradeToday)
    assert "sizing" in events[0].reason


# --- in-trade management: stop / target / force-close -------------------------


def test_stop_loss_hit_after_entry(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)
    fill_events = runner.on_candle(
        mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0), risk_cfg, bankroll_usd=10_000.0
    )
    trade = fill_events[0].trade

    stop_candle = mk_candle(ny_ts(MONDAY, 9, 33), 104.0, 105.0, 97.0, 98.0)  # low below the 99 stop
    events = runner.on_candle(stop_candle, risk_cfg)

    assert len(events) == 1 and isinstance(events[0], TradeClosed)
    closed = events[0].trade
    assert closed is trade
    assert closed.exit_reason == "stop_loss"
    assert closed.exit_price == pytest.approx(99.0)
    assert closed.realized_pnl_usd == pytest.approx((99.0 - 105.0) * trade.quantity)
    assert closed.realized_pnl_usd < 0
    assert runner.state.phase is Phase.DONE


def test_take_profit_hit_after_entry(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)
    fill_events = runner.on_candle(
        mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0), risk_cfg, bankroll_usd=10_000.0
    )
    trade = fill_events[0].trade

    tp_candle = mk_candle(ny_ts(MONDAY, 9, 33), 110.0, 116.0, 109.0, 115.0)  # high above the 115 target
    events = runner.on_candle(tp_candle, risk_cfg)

    assert len(events) == 1
    closed = events[0].trade
    assert closed.exit_reason == "take_profit"
    assert closed.exit_price == pytest.approx(115.0)
    assert closed.realized_pnl_usd == pytest.approx((115.0 - 105.0) * trade.quantity)
    assert closed.realized_pnl_usd > 0


def test_stop_and_target_in_same_candle_assumes_stop(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0), risk_cfg, bankroll_usd=10_000.0)

    wild_candle = mk_candle(ny_ts(MONDAY, 9, 33), 105.0, 120.0, 90.0, 100.0)  # spans both stop(99) and target(115)
    events = runner.on_candle(wild_candle, risk_cfg)

    assert events[0].trade.exit_reason == "stop_loss"


def test_force_close_when_neither_stop_nor_target_hit(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0), risk_cfg, bankroll_usd=10_000.0)

    events = []
    for c in filler_candles(MONDAY, 106.0, (9, 33), (12, 0)):  # stays comfortably between stop and target
        events += runner.on_candle(c, risk_cfg)
    events += runner.on_candle(flat_candle(ny_ts(MONDAY, 12, 0), 106.0), risk_cfg)

    closed_events = [e for e in events if isinstance(e, TradeClosed)]
    assert len(closed_events) == 1
    assert closed_events[0].trade.exit_reason == "force_close"
    assert closed_events[0].trade.exit_price == pytest.approx(106.0)


def test_no_reentry_after_trade_closes_same_day(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0), risk_cfg)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0), risk_cfg, bankroll_usd=10_000.0)
    runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 33), 106.0, 116.0, 105.0, 115.0), risk_cfg)  # take-profit
    assert runner.state.phase is Phase.DONE

    # A wild candle that would otherwise look like a fresh breakout+retest does nothing -- one trade per day.
    events = runner.on_candle(
        mk_candle(ny_ts(MONDAY, 9, 34), 105.0, 130.0, 90.0, 105.0), risk_cfg, bankroll_usd=10_000.0
    )
    assert events == []
    assert runner.state.phase is Phase.DONE


# --- short bias mirrors long ---------------------------------------------------


def test_short_breakout_retest_and_stop(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range_and_reach_930(runner, risk_cfg)

    breakout_events = runner.on_candle(mk_candle(ny_ts(MONDAY, 9, 31), 102.0, 102.0, 96.0, 97.0), risk_cfg)
    assert breakout_events[0].breakout.bias is Bias.SHORT

    retest_candle = mk_candle(ny_ts(MONDAY, 9, 32), 100.0, 106.0, 99.0, 101.0)  # high touches the 105 midpoint
    fill_events = runner.on_candle(retest_candle, risk_cfg, bankroll_usd=10_000.0)
    trade = fill_events[0].trade
    assert trade.bias is Bias.SHORT
    assert trade.entry_price == pytest.approx(105.0)
    assert trade.stop_price == pytest.approx(111.0)
    assert trade.target_price == pytest.approx(95.0)

    stop_candle = mk_candle(ny_ts(MONDAY, 9, 33), 106.0, 112.0, 105.0, 111.0)  # high above the 111 stop
    events = runner.on_candle(stop_candle, risk_cfg)
    closed = events[0].trade
    assert closed.exit_reason == "stop_loss"
    assert closed.exit_price == pytest.approx(111.0)
    assert closed.realized_pnl_usd == pytest.approx((105.0 - 111.0) * trade.quantity)
    assert closed.realized_pnl_usd < 0


# --- day rollover / weekday handling -------------------------------------------


def test_weekend_is_skipped(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    events = runner.on_candle(flat_candle(ny_ts(SATURDAY, 8, 0), 105.0), risk_cfg)

    assert events == []
    assert runner.state.phase is Phase.DONE
    assert runner.state.done_reason == "not a configured trading day"


def test_day_rollover_archives_completed_days(strategy_cfg, risk_cfg):
    runner = SymbolSessionRunner(SYMBOL, strategy_cfg)
    _build_range(runner, risk_cfg, d=MONDAY)
    assert runner.completed_days == []
    assert runner.all_days() == [runner.state]

    tuesday = date(2024, 1, 9)
    runner.on_candle(flat_candle(ny_ts(tuesday, 7, 0), 105.0), risk_cfg)

    assert len(runner.completed_days) == 1
    assert runner.completed_days[0].session_date == MONDAY
    assert runner.state.session_date == tuesday
    assert len(runner.all_days()) == 2
