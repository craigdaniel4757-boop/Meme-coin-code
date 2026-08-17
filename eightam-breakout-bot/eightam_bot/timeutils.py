"""New York session time helpers.

Every strategy timing rule (the 8:00-8:15 range, the 9:30-11:00 trade
window, the force-close cutoff) is defined in wall-clock New York time,
since that's what the strategy's underlying premise -- institutional
positioning ahead of the New York equity open -- is actually about, not
whatever timezone an exchange happens to report candle timestamps in.
`zoneinfo` handles the EST/EDT switch automatically; nothing here needs to
know or care which one currently applies.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo


def to_ny(timestamp: int | float, tz: ZoneInfo) -> datetime:
    """Convert a unix-seconds UTC timestamp to an aware datetime in `tz`."""
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).astimezone(tz)


def ny_date(timestamp: int | float, tz: ZoneInfo) -> date:
    return to_ny(timestamp, tz).date()


def ny_time(timestamp: int | float, tz: ZoneInfo) -> time:
    return to_ny(timestamp, tz).time()


def parse_hhmm(value: str) -> time:
    """Parse a "HH:MM" 24-hour config string into a `time`."""
    hour, minute = value.split(":")
    return time(int(hour), int(minute))
