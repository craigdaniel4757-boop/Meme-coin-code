"""Timezone conversion + config-string parsing tests. Uses one EST date and
one EDT date to confirm the DST switch is handled automatically via
zoneinfo, not hardcoded to a fixed UTC offset.
"""

from __future__ import annotations

from datetime import date, time, timezone
from zoneinfo import ZoneInfo

import pytest

from eightam_bot.timeutils import ny_date, ny_time, parse_hhmm, to_ny

NY = ZoneInfo("America/New_York")


def utc_ts(y: int, m: int, d: int, hh: int, mm: int) -> int:
    from datetime import datetime

    return int(datetime(y, m, d, hh, mm, tzinfo=timezone.utc).timestamp())


def test_to_ny_est_offset():
    # Jan 15 2024: EST, UTC-5. 13:00 UTC -> 8:00am NY.
    ts = utc_ts(2024, 1, 15, 13, 0)
    local = to_ny(ts, NY)
    assert local.hour == 8 and local.minute == 0
    assert local.date() == date(2024, 1, 15)


def test_to_ny_edt_offset():
    # Jul 15 2024: EDT, UTC-4. 13:00 UTC -> 9:00am NY (not 8:00 -- confirms
    # this isn't just a fixed -5 offset).
    ts = utc_ts(2024, 7, 15, 13, 0)
    local = to_ny(ts, NY)
    assert local.hour == 9 and local.minute == 0


def test_ny_date_can_differ_from_utc_date():
    # 02:30 UTC on Jan 2 is still 21:30 NY on Jan 1 (EST, UTC-5).
    ts = utc_ts(2024, 1, 2, 2, 30)
    assert ny_date(ts, NY) == date(2024, 1, 1)


def test_ny_time_matches_to_ny():
    ts = utc_ts(2024, 1, 15, 14, 45)
    assert ny_time(ts, NY) == to_ny(ts, NY).time()


@pytest.mark.parametrize(
    "value,expected",
    [("08:00", time(8, 0)), ("08:15", time(8, 15)), ("23:59", time(23, 59)), ("00:00", time(0, 0))],
)
def test_parse_hhmm(value, expected):
    assert parse_hhmm(value) == expected


def test_parse_hhmm_rejects_malformed_input():
    with pytest.raises(ValueError):
        parse_hhmm("not-a-time")
