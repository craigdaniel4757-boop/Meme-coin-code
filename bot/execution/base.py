"""Common execution interface driven by the scanner, implemented by both
`PaperExecutionProvider` (default) and `JupiterLiveExecutionProvider`
(opt-in). Keeping this interface identical for both means the scanner
loop, backtester-adjacent code, and CLI reporting never need to know or
care which mode is active.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from bot.data.models import Position, Trade
from bot.strategy.risk_manager import RiskConfig


class ExecutionProvider(ABC):
    @abstractmethod
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
        """Attempt to open a position sized at ~notional_usd at (approximately)
        quote_price. Returns the resulting Position with its actual fill
        price/quantity, or None if the order could not be filled."""

    @abstractmethod
    async def sell(
        self, position: Position, fraction: float, quote_price: float, reason: str, kind: str = ""
    ) -> Trade | None:
        """Sell `fraction` of a position's original quantity at
        (approximately) quote_price. Returns the resulting Trade, or None
        if the order could not be filled. `kind` is the structured
        counterpart to `reason` (see `ExitAction.kind` in
        bot/strategy/risk_manager.py), recorded on the Trade for the
        same-token cooldown to query later."""

    @abstractmethod
    def get_bankroll_usd(self) -> float:
        """Uninvested capital available for new position sizing."""

    @abstractmethod
    def get_open_positions(self) -> list[Position]: ...

    @abstractmethod
    def get_daily_realized_pnl_usd(self, since_ts: float) -> float: ...
