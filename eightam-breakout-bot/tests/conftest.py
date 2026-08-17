"""Shared fixtures and synthetic-candle builders for the test suite.

Everything here is synthetic and hand-constructed -- no network calls, no
real market data -- so the suite is fast and fully deterministic. Candle
timestamps are built from explicit New York wall-clock times via `ny_ts`
rather than raw UTC math, so test cases read the same way the strategy's
own rules are described (e.g. "a candle at 9:31am").
"""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from eightam_bot.models import Candle
from eightam_bot.risk_manager import RiskConfig
from eightam_bot.strategy import StrategyConfig

NY = ZoneInfo("America/New_York")

# A fixed Monday with no DST ambiguity (EST, UTC-5), used as the default
# session date across most tests unless a test specifically cares about a
# different weekday or a DST boundary.
MONDAY = date(2024, 1, 8)
SATURDAY = date(2024, 1, 6)


def ny_ts(d: date, hh: int, mm: int, tz: ZoneInfo = NY) -> int:
    """Build a unix timestamp from an explicit New York wall-clock time."""
    return int(datetime(d.year, d.month, d.day, hh, mm, tzinfo=tz).timestamp())


def mk_candle(ts: int, o: float, h: float, l: float, c: float, v: float = 100.0) -> Candle:
    return Candle(timestamp=ts, open=o, high=h, low=l, close=c, volume=v)


def flat_candle(ts: int, price: float, v: float = 100.0) -> Candle:
    return Candle(timestamp=ts, open=price, high=price, low=price, close=price, volume=v)


def make_range_candles(
    d: date, high: float, low: float, start: tuple[int, int] = (8, 0), count: int = 15, tz: ZoneInfo = NY
) -> list[Candle]:
    """`count` consecutive 1-minute candles starting at `start` NY time. The
    first candle's high/low are exactly `high`/`low`; the rest sit flat at
    the midpoint -- so the range the strategy builds from all of them is
    exactly (high, low), deterministically, regardless of `count`."""
    mid = (high + low) / 2
    start_ts = ny_ts(d, *start, tz)
    candles = [mk_candle(start_ts, mid, high, low, mid)]
    for i in range(1, count):
        candles.append(flat_candle(start_ts + i * 60, mid))
    return candles


def filler_candles(d: date, price: float, start: tuple[int, int], end: tuple[int, int], tz: ZoneInfo = NY) -> list[Candle]:
    """One flat candle per minute from `start` (inclusive) to `end`
    (exclusive), all at `price` -- "nothing happening" filler between the
    interesting candles a test constructs explicitly."""
    start_ts = ny_ts(d, *start, tz)
    end_ts = ny_ts(d, *end, tz)
    return [flat_candle(ts, price) for ts in range(start_ts, end_ts, 60)]


@pytest.fixture
def tz() -> ZoneInfo:
    return NY


@pytest.fixture
def strategy_cfg(tz: ZoneInfo) -> StrategyConfig:
    return StrategyConfig(
        tz=tz,
        range_start=time(8, 0),
        range_end=time(8, 15),
        trade_window_start=time(9, 30),
        trade_window_end=time(11, 0),
        force_close_time=time(12, 0),
        trading_days=frozenset({0, 1, 2, 3, 4}),
        breakout_confirmation="close",
    )


@pytest.fixture
def risk_cfg() -> RiskConfig:
    """Points-based stop/target so expected numbers are simple to hand
    verify in assertions: range 100-110 (mid 105) -> stop 1 point beyond
    the opposite boundary, target 10 points from entry."""
    return RiskConfig(
        stop_buffer_type="points",
        stop_buffer_value=1.0,
        take_profit_mode="points",
        take_profit_value=10.0,
        risk_per_trade_pct=1.0,
        max_daily_loss_pct=4.0,
        starting_bankroll_usd=10_000.0,
    )
