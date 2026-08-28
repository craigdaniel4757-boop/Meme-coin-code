from datetime import date

from rangebreak.timeutils import each_weekday, session_windows


def test_session_windows_est_offset_in_january():
    windows = session_windows(date(2026, 1, 15))  # EST, UTC-5
    assert windows.range_start.utcoffset().total_seconds() / 3600 == -5
    assert windows.range_start.hour == 8 and windows.range_start.minute == 0
    assert windows.range_end.hour == 9
    assert windows.monitor_end.hour == 10


def test_session_windows_edt_offset_in_july():
    windows = session_windows(date(2026, 7, 15))  # EDT, UTC-4
    assert windows.range_start.utcoffset().total_seconds() / 3600 == -4
    assert windows.range_start.hour == 8 and windows.range_start.minute == 0


def test_session_windows_8am_et_is_correct_utc_instant_across_dst():
    jan = session_windows(date(2026, 1, 15)).range_start.astimezone(__import__("zoneinfo").ZoneInfo("UTC"))
    jul = session_windows(date(2026, 7, 15)).range_start.astimezone(__import__("zoneinfo").ZoneInfo("UTC"))
    # 8:00 AM ET is 13:00 UTC in winter (EST) and 12:00 UTC in summer (EDT) --
    # a fixed UTC offset would get one of these wrong.
    assert jan.hour == 13
    assert jul.hour == 12


def test_lookback_and_close_configurable():
    windows = session_windows(date(2026, 3, 2), session_close_hour=15, session_close_minute=30, lookback_hours=2)
    assert windows.session_close.hour == 15 and windows.session_close.minute == 30
    assert (windows.range_start - windows.fetch_start).total_seconds() == 2 * 3600


def test_each_weekday_skips_weekends():
    days = list(each_weekday(date(2026, 8, 24), date(2026, 8, 30)))  # Mon 8/24 .. Sun 8/30
    assert days == [date(2026, 8, 24), date(2026, 8, 25), date(2026, 8, 26), date(2026, 8, 27), date(2026, 8, 28)]
