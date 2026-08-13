"""Liquidity-crash detector tests -- pure computation over ticks recorded
in a real temp-file SQLite database (Database is cheap enough to use
directly rather than mock, matching tests/test_paper_execution.py).
"""

from __future__ import annotations

import time

import pytest

from bot.analysis.liquidity_guard import compute_liquidity_trend
from bot.storage.db import Database

CHAIN = "solana"
PAIR = "PAIR1111111111111111111111111111111111111"


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "test.db")
    yield database
    database.close()


def _seed_ticks(db: Database, liquidities: list[float], start_ts: int, step_seconds: int = 60) -> None:
    for i, liq in enumerate(liquidities):
        db.insert_tick(CHAIN, PAIR, start_ts + i * step_seconds, price_usd=1.0, volume_24h_usd=1000.0, liquidity_usd=liq)


def test_insufficient_observations_reports_no_data(db):
    now = int(time.time())
    _seed_ticks(db, [10_000.0], start_ts=now - 120)  # only 1 tick, default min_observations=3

    trend = compute_liquidity_trend(db, CHAIN, PAIR)

    assert trend.have_data is False
    assert trend.drawdown_exceeds(1.0) is False  # can't exceed anything without data


def test_stable_liquidity_reports_near_zero_drawdown(db):
    now = int(time.time())
    _seed_ticks(db, [10_000.0, 10_100.0, 9_950.0, 10_050.0], start_ts=now - 240)

    trend = compute_liquidity_trend(db, CHAIN, PAIR)

    assert trend.have_data is True
    assert trend.drawdown_pct < 5.0
    assert trend.drawdown_exceeds(40.0) is False


def test_crashed_liquidity_reports_large_drawdown(db):
    now = int(time.time())
    # peaks at 20k, craters to 5k -- a 75% drawdown from the recent peak.
    _seed_ticks(db, [15_000.0, 20_000.0, 18_000.0, 5_000.0], start_ts=now - 240)

    trend = compute_liquidity_trend(db, CHAIN, PAIR)

    assert trend.have_data is True
    assert trend.current_liquidity_usd == 5_000.0
    assert trend.recent_peak_liquidity_usd == 20_000.0
    assert trend.drawdown_pct == pytest.approx(75.0)
    assert trend.drawdown_exceeds(40.0) is True
    assert trend.drawdown_exceeds(90.0) is False


def test_lookback_window_excludes_old_ticks(db):
    now = int(time.time())
    # An old, much higher peak outside the lookback window shouldn't count
    # against a pair whose liquidity has been perfectly flat recently.
    db.insert_tick(CHAIN, PAIR, now - 10_000, price_usd=1.0, volume_24h_usd=1000.0, liquidity_usd=100_000.0)
    _seed_ticks(db, [10_000.0, 10_050.0, 9_980.0], start_ts=now - 180)

    trend = compute_liquidity_trend(db, CHAIN, PAIR, lookback_seconds=3600)

    assert trend.have_data is True
    assert trend.recent_peak_liquidity_usd == pytest.approx(10_050.0)
    assert trend.drawdown_exceeds(40.0) is False


def test_no_ticks_at_all_reports_no_data(db):
    trend = compute_liquidity_trend(db, CHAIN, "NEVER_SEEN_PAIR")
    assert trend.have_data is False
