"""Performance metrics computed from a `BacktestResult` -- the numbers that
actually answer "is this strategy any good," rather than taking an equity
curve, or a YouTube P&L screenshot, on faith.

`avg_r_multiple` is the one metric specific to this project: since risk is
explicitly defined in R (a trade's realized P&L divided by the dollar risk
taken at entry -- see `Trade.r_multiple` in models.py), it's a more directly
comparable summary across different symbols/instruments than win rate or
raw dollar P&L alone, for a strategy whose stop and, by default, target are
both risk multiples of each other.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from eightam_bot.backtest.engine import BacktestResult


@dataclass(slots=True)
class PerformanceMetrics:
    total_trades: int
    wins: int
    losses: int
    win_rate_pct: float
    total_realized_pnl_usd: float
    avg_win_usd: float
    avg_loss_usd: float
    profit_factor: float
    expectancy_usd: float
    avg_r_multiple: float
    max_drawdown_pct: float
    total_return_pct: float
    sharpe_like_ratio: float


def _max_drawdown_pct(equity_curve: list[tuple[int, float]]) -> float:
    if not equity_curve:
        return 0.0
    peak = equity_curve[0][1]
    max_dd = 0.0
    for _, equity in equity_curve:
        peak = max(peak, equity)
        if peak > 0:
            max_dd = max(max_dd, (peak - equity) / peak * 100)
    return max_dd


def _sharpe_like_ratio(equity_curve: list[tuple[int, float]]) -> float:
    """A simplified, *not* annualized Sharpe-style ratio: mean bar-over-bar
    return divided by its standard deviation. Useful for comparing parameter
    sets against each other on the same data, not as an absolute, annualized
    risk-adjusted-return figure."""
    if len(equity_curve) < 3:
        return 0.0
    returns = [(c - p) / p for (_, p), (_, c) in zip(equity_curve, equity_curve[1:]) if p > 0]
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    std = math.sqrt(variance)
    return (mean / std) if std > 0 else 0.0


def compute_metrics(result: BacktestResult) -> PerformanceMetrics:
    closed = [t for t in result.trades if t.realized_pnl_usd is not None]
    wins = [t for t in closed if t.realized_pnl_usd > 0]
    losses = [t for t in closed if t.realized_pnl_usd <= 0]

    total_realized = sum(t.realized_pnl_usd for t in closed)
    gross_profit = sum(t.realized_pnl_usd for t in wins)
    gross_loss = -sum(t.realized_pnl_usd for t in losses)  # positive number

    win_rate = (len(wins) / len(closed) * 100) if closed else 0.0
    avg_win = (gross_profit / len(wins)) if wins else 0.0
    avg_loss = (gross_loss / len(losses)) if losses else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else 0.0)
    expectancy = (total_realized / len(closed)) if closed else 0.0

    r_multiples = [t.r_multiple for t in closed if t.r_multiple is not None]
    avg_r = (sum(r_multiples) / len(r_multiples)) if r_multiples else 0.0

    total_return = (
        (result.final_equity_usd / result.starting_equity_usd - 1) * 100 if result.starting_equity_usd > 0 else 0.0
    )

    return PerformanceMetrics(
        total_trades=len(closed),
        wins=len(wins),
        losses=len(losses),
        win_rate_pct=round(win_rate, 2),
        total_realized_pnl_usd=round(total_realized, 2),
        avg_win_usd=round(avg_win, 2),
        avg_loss_usd=round(avg_loss, 2),
        profit_factor=round(profit_factor, 3),
        expectancy_usd=round(expectancy, 2),
        avg_r_multiple=round(avg_r, 3),
        max_drawdown_pct=round(_max_drawdown_pct(result.equity_curve), 2),
        total_return_pct=round(total_return, 2),
        sharpe_like_ratio=round(_sharpe_like_ratio(result.equity_curve), 3),
    )
