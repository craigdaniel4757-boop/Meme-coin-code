"""Common execution interface driven by the live/paper runner (cli.py) and
implemented by both `PaperExecutionProvider` (default) and
`CcxtLiveExecutionProvider` (opt-in). Keeping this interface identical for
both means the runner never needs to know or care which mode is active.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from eightam_bot.models import Trade


class ExecutionProvider(ABC):
    @abstractmethod
    async def enter(self, trade: Trade) -> Trade:
        """Fill `trade`'s entry at (as close as possible to) its ideal
        entry_price, computed by strategy.py. Returns the same trade with
        entry fee (and for a live provider, the real fill price) applied."""

    @abstractmethod
    async def exit(self, trade: Trade) -> Trade:
        """Fill `trade`'s already-decided exit (exit_price/exit_reason, as
        set by strategy.py) with real-world fill economics applied, and
        finalize `realized_pnl_usd`. Also responsible for journaling the
        closed trade."""

    @abstractmethod
    def get_bankroll_usd(self) -> float:
        """Total account equity (realized), independent of what's currently
        committed to any open trade -- callers subtract open notional
        themselves before sizing a new entry, since only the orchestration
        layer (running potentially several symbols at once) has visibility
        into all of them at once. See risk_manager.size_position."""

    @abstractmethod
    def get_daily_realized_pnl_usd(self, since_ts: float) -> float: ...

    async def close(self) -> None:
        """Release any underlying connection. No-op unless overridden."""
