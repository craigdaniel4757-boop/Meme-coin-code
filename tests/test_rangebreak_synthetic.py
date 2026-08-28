from datetime import date, timedelta

import pytest

from rangebreak.data.synthetic import DEMO_TICKERS, SCENARIOS, generate_day_with_meta, scenario_for


@pytest.mark.parametrize("ticker", DEMO_TICKERS)
def test_generated_candles_are_ohlc_valid_and_chronological(ticker):
    day = date(2026, 4, 6)  # a Monday
    candles, meta = generate_day_with_meta(ticker, day)
    assert len(candles) == 540  # 07:00-15:59 ET, one bar per minute
    assert meta["scenario"] in SCENARIOS

    prev_ts = None
    seen_ts = set()
    for c in candles:
        assert c.ts.tzinfo is not None
        assert c.high >= c.open and c.high >= c.close and c.high >= c.low
        assert c.low <= c.open and c.low <= c.close and c.low <= c.high
        assert c.volume >= 0
        assert c.ts not in seen_ts
        seen_ts.add(c.ts)
        if prev_ts is not None:
            assert c.ts > prev_ts
        prev_ts = c.ts


def test_is_deterministic_for_same_ticker_and_date():
    day = date(2026, 5, 4)
    c1, m1 = generate_day_with_meta("SPY", day)
    c2, m2 = generate_day_with_meta("SPY", day)
    assert m1 == m2
    assert [c.__dict__ for c in c1] == [c.__dict__ for c in c2]


def test_different_tickers_are_not_identical():
    day = date(2026, 5, 4)
    c1, _ = generate_day_with_meta("SPY", day)
    c2, _ = generate_day_with_meta("QQQ", day)
    assert [c.close for c in c1] != [c.close for c in c2]


def test_scenario_cycles_through_all_seven_within_a_reasonable_window():
    seen = set()
    day = date(2026, 1, 5)
    for _ in range(90):
        seen.add(scenario_for("SPY", day))
        day += timedelta(days=1)
    assert seen == set(SCENARIOS)
