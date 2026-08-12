"""Backtest performance metrics tests -- hand-constructed trade lists and
equity curves with known-correct answers, so these check the metrics math
itself independent of the backtest engine that normally produces them.
"""

from __future__ import annotations

import pytest

from bot.backtest.engine import BacktestResult
from bot.backtest.metrics import compute_metrics
from bot.data.models import Trade


def _trade(side: str, pnl: float | None, ts: float = 0.0) -> Trade:
    return Trade(
        id=f"t-{ts}-{side}-{pnl}", position_id="p1", chain_id="solana", pair_address="PAIR",
        symbol="DOGE", side=side, price=1.0, quantity=10.0, fee_usd=0.0, timestamp=ts,
        reason="test", realized_pnl_usd=pnl,
    )


def test_win_rate_and_profit_factor():
    trades = [
        _trade("buy", None, ts=0),
        _trade("sell", 100.0, ts=1),  # win
        _trade("buy", None, ts=2),
        _trade("sell", -40.0, ts=3),  # loss
        _trade("buy", None, ts=4),
        _trade("sell", 60.0, ts=5),  # win
    ]
    result = BacktestResult(
        trades=trades, equity_curve=[(0, 1000.0), (5, 1120.0)], starting_equity_usd=1000.0, final_equity_usd=1120.0
    )
    metrics = compute_metrics(result)

    assert metrics.closed_trades == 3
    assert metrics.wins == 2
    assert metrics.losses == 1
    assert metrics.win_rate_pct == pytest.approx(200 / 3, rel=1e-3)
    assert metrics.total_realized_pnl_usd == pytest.approx(120.0)
    assert metrics.avg_win_usd == pytest.approx(80.0)
    assert metrics.avg_loss_usd == pytest.approx(40.0)
    assert metrics.profit_factor == pytest.approx(4.0)
    assert metrics.expectancy_usd == pytest.approx(40.0)
    assert metrics.total_return_pct == pytest.approx(12.0)


def test_no_trades_returns_zeroed_metrics():
    result = BacktestResult(trades=[], equity_curve=[(0, 1000.0)], starting_equity_usd=1000.0, final_equity_usd=1000.0)
    metrics = compute_metrics(result)

    assert metrics.closed_trades == 0
    assert metrics.win_rate_pct == 0.0
    assert metrics.profit_factor == 0.0
    assert metrics.total_return_pct == 0.0


def test_all_wins_profit_factor_is_infinite():
    trades = [_trade("sell", 10.0, ts=0), _trade("sell", 20.0, ts=1)]
    result = BacktestResult(
        trades=trades, equity_curve=[(0, 1000.0), (1, 1030.0)], starting_equity_usd=1000.0, final_equity_usd=1030.0
    )
    metrics = compute_metrics(result)
    assert metrics.profit_factor == float("inf")


def test_max_drawdown_pct():
    # equity: 1000 -> 1200 (peak) -> 900 (trough) -> 1100 (partial recovery)
    curve = [(0, 1000.0), (1, 1200.0), (2, 900.0), (3, 1100.0)]
    result = BacktestResult(trades=[], equity_curve=curve, starting_equity_usd=1000.0, final_equity_usd=1100.0)
    metrics = compute_metrics(result)
    assert metrics.max_drawdown_pct == pytest.approx(25.0)  # (1200-900)/1200


def test_sharpe_like_ratio_zero_for_flat_equity():
    curve = [(0, 1000.0), (1, 1000.0), (2, 1000.0)]
    result = BacktestResult(trades=[], equity_curve=curve, starting_equity_usd=1000.0, final_equity_usd=1000.0)
    metrics = compute_metrics(result)
    assert metrics.sharpe_like_ratio == 0.0
