"""New York/Eastern session-window helpers.

Every boundary in the strategy ("8:00 AM ET", "9:00 AM ET", "10:00 AM ET")
is a *local wall-clock* time in America/New_York, which shifts between
EST (UTC-5) and EDT (UTC-4) twice a year. Using `zoneinfo.ZoneInfo` instead
of a fixed UTC offset means these boundaries stay correct across the DST
transition instead of silently drifting by an hour for part of the year.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")


@dataclass(frozen=True)
class SessionWindows:
    day: date
    fetch_start: datetime  # start of the 1-minute data pull (buffer for pre-sweep swing lookback)
    range_start: datetime  # 08:00 ET -- opens the range candle
    range_end: datetime  # 09:00 ET -- closes the range candle / opens the monitor window
    monitor_end: datetime  # 10:00 ET -- end of the sweep/reclaim monitoring window
    session_close: datetime  # EOD cutoff for unresolved trades


def session_windows(
    day: date,
    session_close_hour: int = 16,
    session_close_minute: int = 0,
    lookback_hours: int = 1,
) -> SessionWindows:
    """Session boundaries for one trading day, all tz-aware in America/New_York.

    `lookback_hours` extends the data-fetch start before 08:00 ET so there
    are enough 1-minute bars on hand to locate a qualifying pre-sweep swing
    point even for a sweep that occurs in the first minutes of the 9:00-10:00
    window (the 8:00-9:00 hour alone almost always supplies one, but the
    buffer guards against a thin/gappy tape).
    """

    def at(hour: int, minute: int) -> datetime:
        return datetime.combine(day, time(hour, minute), tzinfo=ET)

    range_start = at(8, 0)
    return SessionWindows(
        day=day,
        fetch_start=range_start - timedelta(hours=lookback_hours),
        range_start=range_start,
        range_end=at(9, 0),
        monitor_end=at(10, 0),
        session_close=at(session_close_hour, session_close_minute),
    )


def to_et(dt: datetime) -> datetime:
    """Convert any tz-aware datetime to America/New_York wall-clock time."""
    if dt.tzinfo is None:
        raise ValueError("to_et requires a tz-aware datetime")
    return dt.astimezone(ET)


def each_weekday(start: date, end: date):
    """Yield each Mon-Fri date in [start, end] inclusive. Doesn't know about
    market holidays -- a holiday simply yields no candles from the data
    provider and shows up as an insufficient-data day, which is a fine
    (and simple) way to handle it without a hardcoded holiday calendar."""
    d = start
    one_day = timedelta(days=1)
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += one_day
