"""Simulated execution -- the default mode, and what `python -m eightam_bot
paper` uses unless `execution.mode` is explicitly set to `"live"`.

Slippage is applied only to fills that are realistically market orders once
triggered (stop-loss, force-close); the entry and take-profit are resting
limit orders and fill at their exact ideal price. Fees apply to every fill.
See strategy.py's module docstring for the full reasoning. Bankroll is
simply `starting_balance_usd + total realized P&L from the journal` -- see
`ExecutionProvider.get_bankroll_usd`'s docstring for why this deliberately
ignores capital currently committed to an open trade.

`apply_entry_fill`/`apply_exit_fill` are plain, synchronous functions
(not methods) specifically so `backtest/engine.py` can reuse the exact same
fill economics without going through the journal-writing side effect a real
paper-trading run needs -- the same "one implementation, two callers"
principle strategy.py's module docstring describes for the state machine
itself.
"""

from __future__ import annotations

import logging

from eightam_bot.execution.base import ExecutionProvider
from eightam_bot.journal import TradeJournal
from eightam_bot.models import Bias, Trade

logger = logging.getLogger(__name__)

# Fills that are effectively market orders once triggered -- these get
# simulated slippage. The entry and take-profit are resting limit orders and
# don't.
SLIPPAGE_EXIT_REASONS = frozenset({"stop_loss", "force_close"})


def apply_entry_fill(trade: Trade, fee_bps: float) -> Trade:
    trade.fee_usd += trade.quantity * trade.entry_price * fee_bps / 10_000
    return trade


def apply_exit_fill(trade: Trade, slippage_bps: float, fee_bps: float) -> Trade:
    assert trade.exit_price is not None, "strategy.py must set exit_price before a fill can be applied"
    fill_price = trade.exit_price

    if trade.exit_reason in SLIPPAGE_EXIT_REASONS:
        slip = fill_price * slippage_bps / 10_000
        # Slippage always works against the trader: a long exits lower, a short exits higher.
        fill_price = fill_price - slip if trade.bias is Bias.LONG else fill_price + slip

    trade.fee_usd += trade.quantity * fill_price * fee_bps / 10_000
    trade.exit_price = fill_price
    pnl_per_unit = (fill_price - trade.entry_price) if trade.bias is Bias.LONG else (trade.entry_price - fill_price)
    trade.realized_pnl_usd = pnl_per_unit * trade.quantity - trade.fee_usd
    return trade


class PaperExecutionProvider(ExecutionProvider):
    def __init__(
        self,
        journal: TradeJournal,
        starting_balance_usd: float = 10_000.0,
        simulated_slippage_bps: float = 5.0,
        simulated_fee_bps: float = 4.0,
    ) -> None:
        self.journal = journal
        self.starting_balance_usd = starting_balance_usd
        self.simulated_slippage_bps = simulated_slippage_bps
        self.simulated_fee_bps = simulated_fee_bps

    async def enter(self, trade: Trade) -> Trade:
        apply_entry_fill(trade, self.simulated_fee_bps)
        logger.info(
            "[PAPER] ENTER %s %s: %.6g units @ $%.6g (risk $%.2f)",
            trade.bias.value.upper(), trade.symbol, trade.quantity, trade.entry_price, trade.risk_usd,
        )
        return trade

    async def exit(self, trade: Trade) -> Trade:
        apply_exit_fill(trade, self.simulated_slippage_bps, self.simulated_fee_bps)
        self.journal.record_trade(trade)
        logger.info(
            "[PAPER] EXIT %s %s: %s @ $%.6g -- realized PnL $%.2f (%.2fR)",
            trade.bias.value.upper(), trade.symbol, trade.exit_reason, trade.exit_price,
            trade.realized_pnl_usd, trade.r_multiple or 0.0,
        )
        return trade

    def get_bankroll_usd(self) -> float:
        return self.starting_balance_usd + self.journal.total_realized_pnl_usd()

    def get_daily_realized_pnl_usd(self, since_ts: float) -> float:
        return self.journal.realized_pnl_since(since_ts)
