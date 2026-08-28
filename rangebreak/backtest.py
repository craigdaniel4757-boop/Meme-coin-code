"""Multi-day orchestration: pull one contiguous span of 1-minute candles from
a provider, slice it into trading days, and run the strategy on each."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from .data.provider import MarketDataProvider
from .models import TRADE_OUTCOMES, BacktestConfig, DayOutcome, TradeRecord
from .strategy import run_day
from .timeutils import each_weekday, session_windows, to_et


@dataclass
class BacktestSummary:
    days_analyzed: int
    trades_taken: int
    wins: int
    losses: int
    eod_exits: int
    no_sweep_days: int
    invalid_sweep_days: int
    no_entry_trigger_days: int
    no_prior_swing_days: int
    insufficient_data_days: int
    win_rate_pct: float | None
    avg_r: float | None
    total_r: float | None
    profit_factor: float | None

    def to_json(self) -> dict:
        return {
            "days_analyzed": self.days_analyzed,
            "trades_taken": self.trades_taken,
            "wins": self.wins,
            "losses": self.losses,
            "eod_exits": self.eod_exits,
            "no_sweep_days": self.no_sweep_days,
            "invalid_sweep_days": self.invalid_sweep_days,
            "no_entry_trigger_days": self.no_entry_trigger_days,
            "no_prior_swing_days": self.no_prior_swing_days,
            "insufficient_data_days": self.insufficient_data_days,
            "win_rate_pct": self.win_rate_pct,
            "avg_r": self.avg_r,
            "total_r": self.total_r,
            "profit_factor": self.profit_factor,
        }


def summarize(records: list[TradeRecord]) -> BacktestSummary:
    traded = [r for r in records if r.outcome in TRADE_OUTCOMES and r.result_r is not None]
    wins = [r for r in traded if r.result_r > 0]
    losses = [r for r in traded if r.result_r <= 0]
    gains = sum(r.result_r for r in wins)
    draws = -sum(r.result_r for r in losses)

    def count(outcome: DayOutcome) -> int:
        return sum(1 for r in records if r.outcome == outcome)

    return BacktestSummary(
        days_analyzed=len(records),
        trades_taken=len(traded),
        wins=len(wins),
        losses=len(losses),
        eod_exits=count(DayOutcome.EOD),
        no_sweep_days=count(DayOutcome.NO_SWEEP),
        invalid_sweep_days=count(DayOutcome.INVALID_SWEEP),
        no_entry_trigger_days=count(DayOutcome.NO_ENTRY_TRIGGER),
        no_prior_swing_days=count(DayOutcome.NO_PRIOR_SWING),
        insufficient_data_days=count(DayOutcome.INSUFFICIENT_DATA),
        win_rate_pct=round(100 * len(wins) / len(traded), 1) if traded else None,
        avg_r=round(sum(r.result_r for r in traded) / len(traded), 3) if traded else None,
        total_r=round(sum(r.result_r for r in traded), 3) if traded else None,
        profit_factor=round(gains / draws, 3) if draws > 0 else (None if gains == 0 else float("inf")),
    )


def run_backtest(provider: MarketDataProvider, ticker: str, start: date, end: date, cfg: BacktestConfig) -> list[TradeRecord]:
    days = list(each_weekday(start, end))
    if not days:
        return []
    first_windows = session_windows(days[0], cfg.session_close_hour, cfg.session_close_minute, cfg.lookback_hours)
    last_windows = session_windows(days[-1], cfg.session_close_hour, cfg.session_close_minute, cfg.lookback_hours)

    all_candles = provider.get_1m_candles(ticker, first_windows.fetch_start, last_windows.session_close)
    by_day = defaultdict(list)
    for c in all_candles:
        by_day[to_et(c.ts).date()].append(c)

    records = []
    for day in days:
        day_candles = by_day.get(day, [])
        if not day_candles:
            records.append(TradeRecord(date=day.isoformat(), ticker=ticker, outcome=DayOutcome.INSUFFICIENT_DATA, notes="No market data for this date."))
            continue
        records.append(run_day(ticker, day, day_candles, cfg))
    return records
