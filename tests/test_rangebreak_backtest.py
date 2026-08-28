from datetime import date

from rangebreak.backtest import run_backtest, summarize
from rangebreak.data.synthetic import SyntheticProvider
from rangebreak.models import BacktestConfig, DayOutcome


def test_run_backtest_covers_every_weekday_and_summary_is_consistent():
    provider = SyntheticProvider()
    cfg = BacktestConfig()
    start, end = date(2026, 3, 2), date(2026, 3, 27)  # 4 full weeks
    records = run_backtest(provider, "SPY", start, end, cfg)

    assert len(records) == 20  # 4 weeks * 5 weekdays
    assert all(r.ticker == "SPY" for r in records)

    summary = summarize(records)
    assert summary.days_analyzed == 20
    traded_outcomes = {DayOutcome.TARGET, DayOutcome.STOP, DayOutcome.EOD}
    assert summary.trades_taken == sum(1 for r in records if r.outcome in traded_outcomes)
    assert summary.wins + summary.losses == summary.trades_taken
    if summary.trades_taken:
        assert summary.win_rate_pct is not None
        assert summary.total_r is not None


def test_trade_record_json_round_trips_key_fields():
    provider = SyntheticProvider()
    cfg = BacktestConfig()
    records = run_backtest(provider, "SPY", date(2026, 3, 2), date(2026, 3, 13), cfg)
    traded = [r for r in records if r.outcome.value in ("target", "stop", "eod")]
    assert traded, "expected at least one traded day in this window"
    payload = traded[0].to_json()
    for key in (
        "date", "ticker", "range_high", "range_low", "sweep_direction", "sweep_price",
        "entry_time", "entry_price", "stop_price", "target_price", "exit_time", "exit_price",
        "result_r", "first_hit",
    ):
        assert key in payload
    assert isinstance(payload["entry_time"], str) and "T" in payload["entry_time"]  # isoformat, not a datetime object
