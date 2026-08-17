"""Performance metrics tests against a hand-built `BacktestResult` with
known trades, so every number can be verified by hand.
"""

from __future__ import annotations

from datetime import date

import pytest

from eightam_bot.backtest.engine import BacktestResult
from eightam_bot.backtest.metrics import compute_metrics
from eightam_bot.models import Bias, Trade


def _closed_trade(id_: str, pnl: float, risk_usd: float = 100.0) -> Trade:
    return Trade(
        id=id_, symbol="BTC/USDT", session_date=date(2024, 1, 8), bias=Bias.LONG,
        entry_price=100.0, entry_ts=0, stop_price=94.0, target_price=118.0,
        quantity=1.0, risk_usd=risk_usd, exit_price=100.0 + pnl, exit_ts=100,
        exit_reason="take_profit" if pnl > 0 else "stop_loss", realized_pnl_usd=pnl,
    )


def test_metrics_on_two_wins_one_loss():
    trades = [_closed_trade("t1", 300.0), _closed_trade("t2", 300.0), _closed_trade("t3", -100.0)]
    result = BacktestResult(
        trades=trades,
        equity_curve=[(0, 10_000.0), (1, 10_300.0), (2, 10_600.0), (3, 10_500.0)],
        starting_equity_usd=10_000.0,
        final_equity_usd=10_500.0,
    )

    m = compute_metrics(result)
    assert m.total_trades == 3
    assert m.wins == 2
    assert m.losses == 1
    assert m.win_rate_pct == pytest.approx(66.67, abs=0.01)
    assert m.total_realized_pnl_usd == pytest.approx(500.0)
    assert m.avg_win_usd == pytest.approx(300.0)
    assert m.avg_loss_usd == pytest.approx(100.0)
    assert m.profit_factor == pytest.approx(600.0 / 100.0)
    assert m.expectancy_usd == pytest.approx(500.0 / 3, abs=0.01)  # compute_metrics rounds to 2dp
    assert m.avg_r_multiple == pytest.approx((3.0 + 3.0 - 1.0) / 3, abs=0.001)  # each trade risked $100
    assert m.total_return_pct == pytest.approx(5.0)


def test_metrics_on_empty_result():
    result = BacktestResult(starting_equity_usd=10_000.0, final_equity_usd=10_000.0)
    m = compute_metrics(result)

    assert m.total_trades == 0
    assert m.win_rate_pct == 0.0
    assert m.profit_factor == 0.0
    assert m.expectancy_usd == 0.0
    assert m.avg_r_multiple == 0.0
    assert m.max_drawdown_pct == 0.0
    assert m.total_return_pct == 0.0


def test_profit_factor_is_infinite_with_no_losses():
    trades = [_closed_trade("t1", 100.0)]
    result = BacktestResult(trades=trades, equity_curve=[(0, 10_000.0), (1, 10_100.0)], starting_equity_usd=10_000.0, final_equity_usd=10_100.0)

    m = compute_metrics(result)
    assert m.profit_factor == float("inf")


def test_max_drawdown_measures_peak_to_trough():
    curve = [(0, 10_000.0), (1, 12_000.0), (2, 9_000.0), (3, 11_000.0)]
    result = BacktestResult(equity_curve=curve, starting_equity_usd=10_000.0, final_equity_usd=11_000.0)

    m = compute_metrics(result)
    assert m.max_drawdown_pct == pytest.approx((12_000.0 - 9_000.0) / 12_000.0 * 100)


def test_open_trades_are_excluded_from_metrics():
    open_trade = Trade(
        id="open", symbol="BTC/USDT", session_date=date(2024, 1, 8), bias=Bias.LONG,
        entry_price=100.0, entry_ts=0, stop_price=94.0, target_price=118.0, quantity=1.0, risk_usd=100.0,
    )
    closed = _closed_trade("t1", 200.0)
    result = BacktestResult(trades=[open_trade, closed], equity_curve=[(0, 10_000.0)], starting_equity_usd=10_000.0, final_equity_usd=10_200.0)

    m = compute_metrics(result)
    assert m.total_trades == 1  # the still-open trade doesn't count
