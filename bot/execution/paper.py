"""Simulated execution -- the default mode, and what `python -m bot run`
uses unless `execution.mode` is explicitly set to `"live"`.

Fills happen instantly at the quoted price plus configurable simulated
slippage and fee, against an in-memory `Portfolio` that is persisted to
SQLite after every trade so `report` reflects current state and open
positions survive a restart within the same paper-trading run.
"""

from __future__ import annotations

import logging

from bot.data.models import Position, Trade
from bot.execution.base import ExecutionProvider
from bot.execution.portfolio import Portfolio, position_from_row, position_to_row, trade_to_row
from bot.storage.db import Database
from bot.strategy.risk_manager import RiskConfig, create_position

logger = logging.getLogger(__name__)


class PaperExecutionProvider(ExecutionProvider):
    def __init__(
        self,
        db: Database,
        starting_balance_usd: float = 1000.0,
        simulated_slippage_bps: float = 60.0,
        simulated_fee_bps: float = 30.0,
    ) -> None:
        self.db = db
        self.simulated_slippage_bps = simulated_slippage_bps
        self.simulated_fee_bps = simulated_fee_bps
        self.portfolio = Portfolio(cash_usd=starting_balance_usd, mode="paper")
        for row in self.db.get_open_positions():
            position = position_from_row(row)
            self.portfolio.positions[position.id] = position

    async def buy(
        self,
        chain_id: str,
        pair_address: str,
        base_token_address: str,
        symbol: str,
        notional_usd: float,
        quote_price: float,
        strategy_name: str,
        risk_cfg: RiskConfig,
    ) -> Position | None:
        if notional_usd <= 0 or quote_price <= 0:
            return None
        if notional_usd > self.portfolio.cash_usd:
            logger.info("Paper buy skipped for %s: insufficient simulated cash", symbol)
            return None

        fill_price = quote_price * (1 + self.simulated_slippage_bps / 10_000)
        fee_usd = notional_usd * self.simulated_fee_bps / 10_000
        quantity = notional_usd / fill_price

        position = create_position(
            chain_id, pair_address, base_token_address, symbol, fill_price, quantity, strategy_name, risk_cfg
        )
        trade = self.portfolio.apply_buy(position, cost_usd=notional_usd, fee_usd=fee_usd)
        self.db.upsert_position(position_to_row(position))
        self.db.insert_trade(trade_to_row(trade, mode="paper"))
        logger.info(
            "[PAPER] BUY %s: %.6g units @ $%.8g ($%.2f notional, %s)",
            symbol, quantity, fill_price, notional_usd, strategy_name,
        )
        return position

    async def sell(
        self, position: Position, fraction: float, quote_price: float, reason: str, kind: str = ""
    ) -> Trade | None:
        if position.id not in self.portfolio.positions or quote_price <= 0:
            return None

        fill_price = quote_price * (1 - self.simulated_slippage_bps / 10_000)
        qty = position.quantity * min(fraction, position.remaining_fraction)
        fee_usd = qty * fill_price * self.simulated_fee_bps / 10_000

        trade = self.portfolio.apply_sell(position, fraction, fill_price, fee_usd, reason, kind=kind)
        self.db.upsert_position(position_to_row(position))
        self.db.insert_trade(trade_to_row(trade, mode="paper"))
        logger.info(
            "[PAPER] SELL %s: %.6g units @ $%.8g (%s, realized PnL $%.2f)",
            position.symbol, trade.quantity, fill_price, reason, trade.realized_pnl_usd or 0.0,
        )
        return trade

    def get_bankroll_usd(self) -> float:
        return self.portfolio.cash_usd

    def get_open_positions(self) -> list[Position]:
        return list(self.portfolio.positions.values())

    def get_daily_realized_pnl_usd(self, since_ts: float) -> float:
        return self.portfolio.daily_realized_pnl(since_ts)
