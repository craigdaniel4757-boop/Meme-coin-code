from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


@dataclass(frozen=True)
class Candle:
    ts: datetime  # tz-aware; the candle's OPEN time
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class SweepDirection(str, Enum):
    BULLISH = "bullish"  # swept the range low -> long setup
    BEARISH = "bearish"  # swept the range high -> short setup


class DayOutcome(str, Enum):
    NO_SWEEP = "no_sweep"  # neither side swept AND reclaimed by 10:00 ET
    INVALID_SWEEP = "invalid_sweep"  # swept+reclaimed intrabar, but the 9-10 hour didn't close back inside the range
    NO_PRIOR_SWING = "no_prior_swing"  # valid sweep, but no qualifying 1m swing point exists before it
    NO_ENTRY_TRIGGER = "no_entry_trigger"  # valid sweep, swing point found, but no 1m close ever broke it
    TARGET = "target"  # trade taken, take-profit hit first
    STOP = "stop"  # trade taken, stop-loss hit first
    EOD = "eod"  # trade taken, neither hit -- closed at the session-close cutoff
    INSUFFICIENT_DATA = "insufficient_data"  # no/partial market data for this date (holiday, gap, etc.)


TRADE_OUTCOMES = (DayOutcome.TARGET, DayOutcome.STOP, DayOutcome.EOD)


@dataclass
class BacktestConfig:
    """Everything needed to turn a mechanical trigger into a realistic fill.

    Defaults are deliberately conservative for the 8-9am ET pre-market /
    early-session window this strategy operates in (spread and slippage are
    both wider there than during the 9:30-16:00 regular session for most
    names) -- see the rangebreak README section for the reasoning. Every
    field is user-adjustable in the UI.
    """

    tick_size: float = 0.01  # US equities/ETFs trade in $0.01 increments (Reg NMS) for the vast majority of names
    spread_ticks: float = 2.0  # assumed full bid/ask spread, in ticks; half is charged on each side of a marketable fill
    slippage_ticks: float = 2.0  # additional adverse slippage on marketable (entry/stop/EOD) fills, in ticks
    commission_per_share: float = 0.0  # round-trip commission, in $/share, subtracted from realized P&L
    session_close_hour: int = 16  # EOD cutoff (ET) for trades that hit neither stop nor target
    session_close_minute: int = 0
    lookback_hours: int = 1  # extra 1m history fetched before 08:00 ET for pre-sweep swing lookback


@dataclass
class TradeRecord:
    date: str
    ticker: str
    outcome: DayOutcome
    range_high: float | None = None
    range_low: float | None = None
    sweep_direction: SweepDirection | None = None
    sweep_price: float | None = None
    sweep_time: datetime | None = None
    reclaim_time: datetime | None = None
    swing_price: float | None = None
    swing_time: datetime | None = None
    entry_time: datetime | None = None
    entry_price: float | None = None
    stop_price: float | None = None
    target_price: float | None = None
    exit_time: datetime | None = None
    exit_price: float | None = None
    result_r: float | None = None
    first_hit: str | None = None  # "target" | "stop" | "eod" | None (mirrors `outcome` for traded days)
    notes: str = ""

    def to_json(self) -> dict:
        def t(v: datetime | None) -> str | None:
            return v.isoformat() if v is not None else None

        return {
            "date": self.date,
            "ticker": self.ticker,
            "outcome": self.outcome.value,
            "range_high": self.range_high,
            "range_low": self.range_low,
            "sweep_direction": self.sweep_direction.value if self.sweep_direction else None,
            "sweep_price": self.sweep_price,
            "sweep_time": t(self.sweep_time),
            "reclaim_time": t(self.reclaim_time),
            "swing_price": self.swing_price,
            "swing_time": t(self.swing_time),
            "entry_time": t(self.entry_time),
            "entry_price": self.entry_price,
            "stop_price": self.stop_price,
            "target_price": self.target_price,
            "exit_time": t(self.exit_time),
            "exit_price": self.exit_price,
            "result_r": self.result_r,
            "first_hit": self.first_hit,
            "notes": self.notes,
        }
