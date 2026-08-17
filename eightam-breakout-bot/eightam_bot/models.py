"""Shared value types used across the data feed, strategy engine, execution,
backtest, and journal layers. Plain dataclasses, not pydantic -- none of
these are parsed from untrusted external JSON, they're built internally from
OHLCV data the data feed layer already normalizes on the way in (see
data_feed.py). State-machine-internal types (`Phase`, `DayState`) and the
events the strategy emits live in strategy.py instead, next to the logic
that produces them -- the same split the sibling memebot project uses for
`ExitAction`/`RiskConfig` in `bot/strategy/risk_manager.py`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


@dataclass(slots=True)
class Candle:
    timestamp: int  # unix seconds, bar OPEN time, UTC
    open: float
    high: float
    low: float
    close: float
    volume: float


class Bias(str, Enum):
    LONG = "long"
    SHORT = "short"


@dataclass(slots=True)
class SessionRange:
    """The 8:00-8:15am New York candle: the final positioning of the day's
    institutional money ahead of the New York equity open, per the strategy
    this bot implements (see docs/STRATEGY.md #1). `midpoint` is where every
    entry happens, on a retest after a confirmed break of `high`/`low`."""

    session_date: date
    high: float
    low: float
    start_ts: int
    end_ts: int

    @property
    def midpoint(self) -> float:
        return (self.high + self.low) / 2

    @property
    def width(self) -> float:
        return self.high - self.low


@dataclass(slots=True)
class BreakoutEvent:
    bias: Bias
    breakout_ts: int
    breakout_price: float


@dataclass(slots=True)
class Trade:
    id: str
    symbol: str
    session_date: date
    bias: Bias
    entry_price: float
    entry_ts: int
    stop_price: float
    target_price: float
    quantity: float
    risk_usd: float
    exit_price: Optional[float] = None
    exit_ts: Optional[int] = None
    exit_reason: str = ""  # "take_profit" | "stop_loss" | "force_close"
    fee_usd: float = 0.0
    realized_pnl_usd: Optional[float] = None
    ml_confidence: Optional[float] = None

    @property
    def is_closed(self) -> bool:
        return self.exit_price is not None

    @property
    def r_multiple(self) -> Optional[float]:
        """Realized P&L expressed as a multiple of the dollar risk taken at
        entry -- the natural unit for a strategy whose stop and target are
        both defined relative to risk (see risk_manager.py). None until the
        trade closes."""
        if self.realized_pnl_usd is None or self.risk_usd <= 0:
            return None
        return self.realized_pnl_usd / self.risk_usd
