"""Risk manager tests: trade-level (entry/stop/target) calculation,
position sizing, and the daily-loss circuit breaker.
"""

from __future__ import annotations

from datetime import date

import pytest

from eightam_bot.models import Bias, SessionRange
from eightam_bot.risk_manager import (
    RiskConfig,
    TradeLevels,
    check_daily_loss_limit,
    compute_trade_levels,
    create_trade,
    size_position,
)


def _range(high: float = 110.0, low: float = 100.0) -> SessionRange:
    return SessionRange(session_date=date(2024, 1, 8), high=high, low=low, start_ts=0, end_ts=900)


def _cfg(**overrides) -> RiskConfig:
    base = dict(
        stop_buffer_type="points", stop_buffer_value=1.0,
        take_profit_mode="points", take_profit_value=10.0,
        risk_per_trade_pct=1.0, max_daily_loss_pct=4.0, starting_bankroll_usd=10_000.0,
    )
    base.update(overrides)
    return RiskConfig(**base)


# --- compute_trade_levels ---------------------------------------------------


def test_levels_long_points_mode():
    levels = compute_trade_levels(_range(110, 100), Bias.LONG, _cfg())
    assert levels.entry_price == pytest.approx(105.0)  # midpoint
    assert levels.stop_price == pytest.approx(99.0)  # range low - 1 point
    assert levels.target_price == pytest.approx(115.0)  # entry + 10 points


def test_levels_short_points_mode():
    levels = compute_trade_levels(_range(110, 100), Bias.SHORT, _cfg())
    assert levels.entry_price == pytest.approx(105.0)
    assert levels.stop_price == pytest.approx(111.0)  # range high + 1 point
    assert levels.target_price == pytest.approx(95.0)  # entry - 10 points


def test_levels_percent_stop_buffer():
    cfg = _cfg(stop_buffer_type="percent", stop_buffer_value=2.0)  # 2% of the boundary price
    levels = compute_trade_levels(_range(210, 200), Bias.LONG, cfg)  # boundary = 200 -> buffer = 4
    assert levels.stop_price == pytest.approx(196.0)


def test_levels_r_multiple_take_profit():
    cfg = _cfg(take_profit_mode="r_multiple", take_profit_value=3.0)
    levels = compute_trade_levels(_range(110, 100), Bias.LONG, cfg)
    risk = levels.entry_price - levels.stop_price  # 105 - 99 = 6
    assert levels.target_price == pytest.approx(levels.entry_price + risk * 3.0)


def test_levels_percent_take_profit():
    cfg = _cfg(take_profit_mode="percent", take_profit_value=5.0)
    levels = compute_trade_levels(_range(110, 100), Bias.SHORT, cfg)
    assert levels.target_price == pytest.approx(105.0 * (1 - 0.05))


# --- size_position -----------------------------------------------------------


def test_size_position_basic_risk_math():
    levels = TradeLevels(entry_price=105.0, stop_price=99.0, target_price=115.0)
    result = size_position(10_000.0, levels, _cfg(risk_per_trade_pct=1.0))

    assert result.risk_usd == pytest.approx(100.0)  # 1% of 10,000
    assert result.quantity == pytest.approx(100.0 / 6.0)  # risk / (entry - stop)
    assert result.notional_usd == pytest.approx(result.quantity * 105.0)


def test_size_position_capped_at_bankroll():
    # A very tight stop with a large risk_per_trade_pct would otherwise size
    # a notional far bigger than the account -- this assumes spot,
    # unleveraged sizing, so it's capped at 100% of bankroll instead.
    levels = TradeLevels(entry_price=100.0, stop_price=99.9, target_price=101.0)
    cfg = _cfg(risk_per_trade_pct=50.0)
    result = size_position(1_000.0, levels, cfg)

    assert result.notional_usd == pytest.approx(1_000.0)
    assert result.quantity == pytest.approx(10.0)  # 1000 / 100


@pytest.mark.parametrize(
    "bankroll,entry,stop",
    [(0.0, 105.0, 99.0), (-100.0, 105.0, 99.0), (10_000.0, 0.0, -1.0), (10_000.0, 105.0, 105.0)],
)
def test_size_position_zero_on_invalid_inputs(bankroll, entry, stop):
    levels = TradeLevels(entry_price=entry, stop_price=stop, target_price=entry + 10)
    result = size_position(bankroll, levels, _cfg())
    assert result.quantity == 0.0
    assert result.notional_usd == 0.0


# --- create_trade --------------------------------------------------------------


def test_create_trade_wires_fields_through():
    from eightam_bot.risk_manager import PositionSizeResult

    range_ = _range(110, 100)
    levels = compute_trade_levels(range_, Bias.LONG, _cfg())
    sizing = PositionSizeResult(quantity=16.0, notional_usd=1680.0, risk_usd=96.0)

    trade = create_trade("trade-1", "BTC/USDT", range_, Bias.LONG, levels, sizing, entry_ts=1234)

    assert trade.id == "trade-1"
    assert trade.symbol == "BTC/USDT"
    assert trade.session_date == range_.session_date
    assert trade.bias is Bias.LONG
    assert trade.entry_price == levels.entry_price
    assert trade.stop_price == levels.stop_price
    assert trade.target_price == levels.target_price
    assert trade.quantity == 16.0
    assert trade.risk_usd == 96.0
    assert trade.entry_ts == 1234
    assert not trade.is_closed


# --- check_daily_loss_limit -----------------------------------------------------


def test_circuit_breaker_halts_after_daily_loss_limit():
    cfg = _cfg(max_daily_loss_pct=4.0, starting_bankroll_usd=10_000.0)

    halted, reason = check_daily_loss_limit(-450.0, cfg)  # 4.5% loss
    assert halted
    assert "4.0%" in reason or "circuit" in reason

    not_halted, reason2 = check_daily_loss_limit(-300.0, cfg)  # 3% loss
    assert not not_halted
    assert reason2 == ""


def test_circuit_breaker_halts_on_depleted_bankroll():
    cfg = _cfg(starting_bankroll_usd=0.0)
    halted, reason = check_daily_loss_limit(0.0, cfg)
    assert halted
    assert "depleted" in reason


def test_circuit_breaker_ignores_profitable_days():
    cfg = _cfg(max_daily_loss_pct=4.0, starting_bankroll_usd=10_000.0)
    halted, reason = check_daily_loss_limit(500.0, cfg)  # a gain, not a loss
    assert not halted
    assert reason == ""
