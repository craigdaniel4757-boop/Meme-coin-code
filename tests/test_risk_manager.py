"""Risk manager tests: position sizing, stop-loss/take-profit/trailing-stop
mechanics, and the daily-loss circuit breaker.

`evaluate_exits` takes an explicit `now`, so these tests never need to
mock wall-clock time -- they compute `entry_time + N seconds` relative to
whatever the position's real entry_time happens to be.
"""

from __future__ import annotations

import pytest

from bot.analysis.liquidity_guard import LiquidityTrend
from bot.strategy.risk_manager import (
    RiskConfig,
    can_open_new_position,
    check_circuit_breaker,
    create_position,
    evaluate_exits,
    size_position,
)


def _cfg(**overrides) -> RiskConfig:
    base = dict(
        starting_bankroll_usd=1000.0,
        risk_per_trade_pct=2.0,
        max_concurrent_positions=6,
        max_allocation_pct_per_token=15.0,
        stop_loss_pct=15.0,
        take_profit_ladder=[(50.0, 0.25), (100.0, 0.25), (200.0, 0.25)],
        trailing_stop_activate_pct=40.0,
        trailing_stop_distance_pct=18.0,
        max_hold_minutes=720.0,
        max_daily_loss_pct=8.0,
    )
    base.update(overrides)
    return RiskConfig(**base)


def _position(cfg: RiskConfig, entry_price: float = 1.0, quantity: float = 100.0):
    return create_position("solana", "PAIR", "MINT", "DOGE", entry_price, quantity, "test", cfg)


def test_size_position_basic_risk_math():
    cfg = _cfg(risk_per_trade_pct=2.0, stop_loss_pct=15.0, max_allocation_pct_per_token=50.0)
    result = size_position(bankroll_usd=1000.0, price=2.0, cfg=cfg)

    assert result.risk_usd == pytest.approx(20.0)  # 2% of 1000
    assert result.notional_usd == pytest.approx(20.0 / 0.15)  # risk / stop distance
    assert not result.capped_by_allocation_limit
    assert result.quantity == pytest.approx(result.notional_usd / 2.0)


def test_size_position_capped_by_allocation_limit():
    cfg = _cfg(risk_per_trade_pct=10.0, stop_loss_pct=2.0, max_allocation_pct_per_token=15.0)
    result = size_position(bankroll_usd=1000.0, price=1.0, cfg=cfg)

    assert result.capped_by_allocation_limit
    assert result.notional_usd == pytest.approx(150.0)  # 15% of 1000


def test_size_position_zero_on_invalid_inputs():
    cfg = _cfg()
    assert size_position(0.0, 1.0, cfg).notional_usd == 0.0
    assert size_position(1000.0, 0.0, cfg).notional_usd == 0.0


def test_create_position_sets_stop_and_ladder():
    cfg = _cfg(stop_loss_pct=15.0, take_profit_ladder=[(50.0, 0.25), (100.0, 0.5)])
    pos = _position(cfg)

    assert pos.stop_loss_price == pytest.approx(0.85)
    assert [lvl.gain_pct for lvl in pos.take_profit_levels] == [50.0, 100.0]
    assert all(not lvl.filled for lvl in pos.take_profit_levels)
    assert pos.remaining_fraction == 1.0
    assert pos.high_water_mark == 1.0


def test_evaluate_exits_stop_loss_triggers_full_exit():
    cfg = _cfg(stop_loss_pct=15.0)
    pos = _position(cfg)

    actions = evaluate_exits(pos, current_price=0.84, cfg=cfg, now=pos.entry_time)
    assert len(actions) == 1
    assert actions[0].kind == "stop_loss"
    assert actions[0].fraction == pytest.approx(1.0)


def test_evaluate_exits_take_profit_ladder_partial():
    cfg = _cfg(trailing_stop_activate_pct=1000.0)
    pos = _position(cfg)

    actions = evaluate_exits(pos, current_price=1.55, cfg=cfg, now=pos.entry_time)  # +55% -> first rung only
    assert len(actions) == 1
    assert actions[0].kind == "take_profit"
    assert actions[0].fraction == pytest.approx(0.25)
    assert pos.take_profit_levels[0].filled
    assert not pos.take_profit_levels[1].filled
    # evaluate_exits never touches remaining_fraction itself -- that's the
    # caller's job once the sell actually executes.
    assert pos.remaining_fraction == pytest.approx(1.0)


def test_evaluate_exits_multiple_ladder_rungs_in_one_jump():
    cfg = _cfg(trailing_stop_activate_pct=1000.0)
    pos = _position(cfg)

    actions = evaluate_exits(pos, current_price=2.5, cfg=cfg, now=pos.entry_time)  # +150% -> first two rungs
    tp_actions = [a for a in actions if a.kind == "take_profit"]
    assert len(tp_actions) == 2
    assert sum(a.fraction for a in tp_actions) == pytest.approx(0.5)


def test_trailing_stop_arms_and_triggers():
    cfg = _cfg(trailing_stop_activate_pct=40.0, trailing_stop_distance_pct=18.0, take_profit_ladder=[])
    pos = _position(cfg)

    evaluate_exits(pos, current_price=1.60, cfg=cfg, now=pos.entry_time)
    assert pos.trailing_stop_price == pytest.approx(1.60 * (1 - 0.18))
    assert pos.high_water_mark == pytest.approx(1.60)

    actions = evaluate_exits(pos, current_price=1.30, cfg=cfg, now=pos.entry_time)
    assert len(actions) == 1
    assert actions[0].kind == "trailing_stop"


def test_trailing_stop_does_not_loosen_on_pullback():
    cfg = _cfg(trailing_stop_activate_pct=40.0, trailing_stop_distance_pct=18.0, take_profit_ladder=[])
    pos = _position(cfg)

    evaluate_exits(pos, current_price=2.0, cfg=cfg, now=pos.entry_time)
    armed_stop = pos.trailing_stop_price
    assert armed_stop is not None

    # Pull back (but not far enough to trigger the stop) -- the stop must
    # not move down just because price did.
    evaluate_exits(pos, current_price=1.9, cfg=cfg, now=pos.entry_time)
    assert pos.trailing_stop_price == pytest.approx(armed_stop)
    assert pos.high_water_mark == pytest.approx(2.0)  # high-water mark also doesn't fall


def test_max_hold_time_exits_remaining_position():
    cfg = _cfg(max_hold_minutes=60.0, take_profit_ladder=[], trailing_stop_activate_pct=1000.0)
    pos = _position(cfg)

    too_soon = evaluate_exits(pos, current_price=1.02, cfg=cfg, now=pos.entry_time + 30 * 60)
    assert too_soon == []

    late = evaluate_exits(pos, current_price=1.02, cfg=cfg, now=pos.entry_time + 61 * 60)
    assert len(late) == 1
    assert late[0].kind == "max_hold"
    assert late[0].fraction == pytest.approx(1.0)


def test_can_open_new_position_respects_max_concurrent():
    cfg = _cfg(max_concurrent_positions=3)
    assert can_open_new_position(2, cfg)
    assert not can_open_new_position(3, cfg)


def test_circuit_breaker_halts_after_daily_loss_limit():
    cfg = _cfg(max_daily_loss_pct=8.0)

    halted, reason = check_circuit_breaker(daily_realized_pnl_usd=-90.0, bankroll_usd=1000.0, cfg=cfg)
    assert halted
    assert "8.0%" in reason or "circuit-breaker" in reason

    not_halted, reason2 = check_circuit_breaker(daily_realized_pnl_usd=-50.0, bankroll_usd=1000.0, cfg=cfg)
    assert not not_halted
    assert reason2 == ""


def test_circuit_breaker_halts_on_depleted_bankroll():
    cfg = _cfg()
    halted, reason = check_circuit_breaker(daily_realized_pnl_usd=0.0, bankroll_usd=0.0, cfg=cfg)
    assert halted
    assert "depleted" in reason


def test_liquidity_crash_triggers_emergency_exit_before_stop_loss():
    # Price hasn't even hit the stop-loss (entry 1.0, stop 0.85, current
    # 0.95) -- the liquidity crash should still force a full exit, overriding
    # every other exit rule since price can lag behind a liquidity pull.
    cfg = _cfg(stop_loss_pct=15.0, emergency_exit_liquidity_drawdown_pct=60.0)
    pos = _position(cfg)
    crashed = LiquidityTrend(
        have_data=True, current_liquidity_usd=8_000, recent_peak_liquidity_usd=25_000, drawdown_pct=68.0
    )

    actions = evaluate_exits(pos, current_price=0.95, cfg=cfg, now=pos.entry_time, liquidity_trend=crashed)

    assert len(actions) == 1
    assert actions[0].kind == "liquidity_crash"
    assert actions[0].fraction == pytest.approx(1.0)


def test_liquidity_crash_overrides_stop_loss_when_both_trigger():
    cfg = _cfg(stop_loss_pct=15.0, emergency_exit_liquidity_drawdown_pct=60.0)
    pos = _position(cfg)
    crashed = LiquidityTrend(
        have_data=True, current_liquidity_usd=5_000, recent_peak_liquidity_usd=25_000, drawdown_pct=80.0
    )

    # Price is also below the stop-loss (0.80 < 0.85) -- the liquidity
    # crash action should still be the *only* action returned, not stacked
    # with a separate stop-loss action.
    actions = evaluate_exits(pos, current_price=0.80, cfg=cfg, now=pos.entry_time, liquidity_trend=crashed)

    assert len(actions) == 1
    assert actions[0].kind == "liquidity_crash"


def test_liquidity_drawdown_below_emergency_threshold_does_not_trigger():
    cfg = _cfg(stop_loss_pct=15.0, emergency_exit_liquidity_drawdown_pct=60.0)
    pos = _position(cfg)
    wobble = LiquidityTrend(
        have_data=True, current_liquidity_usd=20_000, recent_peak_liquidity_usd=25_000, drawdown_pct=20.0
    )

    # Price hasn't hit the stop either -- nothing should fire.
    actions = evaluate_exits(pos, current_price=0.95, cfg=cfg, now=pos.entry_time, liquidity_trend=wobble)

    assert actions == []


def test_liquidity_trend_without_data_does_not_affect_normal_exits():
    cfg = _cfg(stop_loss_pct=15.0)
    pos = _position(cfg)

    actions = evaluate_exits(
        pos, current_price=0.84, cfg=cfg, now=pos.entry_time, liquidity_trend=LiquidityTrend(have_data=False)
    )

    assert len(actions) == 1
    assert actions[0].kind == "stop_loss"


def test_bearish_reversal_exits_full_position_above_min_gain():
    cfg = _cfg(reversal_exit_min_gain_pct=15.0)
    pos = _position(cfg)  # entry 1.0

    actions = evaluate_exits(pos, current_price=1.20, cfg=cfg, now=pos.entry_time, bearish_reversal=True)

    assert len(actions) == 1
    assert actions[0].kind == "reversal"
    assert actions[0].fraction == pytest.approx(1.0)


def test_bearish_reversal_does_not_trigger_below_min_gain():
    cfg = _cfg(reversal_exit_min_gain_pct=15.0, trailing_stop_activate_pct=1000.0, take_profit_ladder=[])
    pos = _position(cfg)  # entry 1.0

    actions = evaluate_exits(pos, current_price=1.05, cfg=cfg, now=pos.entry_time, bearish_reversal=True)

    assert actions == []


def test_bearish_reversal_ignored_when_flag_is_false():
    cfg = _cfg(reversal_exit_min_gain_pct=15.0, trailing_stop_activate_pct=1000.0, take_profit_ladder=[])
    pos = _position(cfg)  # entry 1.0

    actions = evaluate_exits(pos, current_price=1.20, cfg=cfg, now=pos.entry_time, bearish_reversal=False)

    assert actions == []


def test_bearish_reversal_disabled_by_config_even_when_flagged():
    cfg = _cfg(
        reversal_exit_min_gain_pct=15.0, require_reversal_exit=False,
        trailing_stop_activate_pct=1000.0, take_profit_ladder=[],
    )
    pos = _position(cfg)  # entry 1.0

    actions = evaluate_exits(pos, current_price=1.20, cfg=cfg, now=pos.entry_time, bearish_reversal=True)

    assert actions == []


def test_bearish_reversal_overrides_take_profit_ladder():
    """A confirmed reversal exits the *full* remaining position, not just
    whichever take-profit rung price happens to have crossed."""
    cfg = _cfg(reversal_exit_min_gain_pct=15.0, take_profit_ladder=[(50.0, 0.25)], trailing_stop_activate_pct=1000.0)
    pos = _position(cfg)  # entry 1.0

    actions = evaluate_exits(pos, current_price=1.60, cfg=cfg, now=pos.entry_time, bearish_reversal=True)  # +60%, past the +50% rung

    assert len(actions) == 1
    assert actions[0].kind == "reversal"
    assert actions[0].fraction == pytest.approx(1.0)
