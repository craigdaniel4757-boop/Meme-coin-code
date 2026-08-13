"""Database tests -- currently just `has_recent_negative_exit`, the query
the same-token cooldown (bot/scanner/screener.py, bot/backtest/engine.py)
uses. Against a real temp-file SQLite database, same pattern as
tests/test_paper_execution.py."""

from __future__ import annotations

import time
import uuid

import pytest

from bot.storage.db import Database

CHAIN = "solana"
PAIR = "PAIR1111111111111111111111111111111111111"


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "test.db")
    yield database
    database.close()


def _insert_sell(db: Database, ts: float, kind: str, chain_id: str = CHAIN, pair_address: str = PAIR) -> None:
    db.insert_trade(
        {
            "id": str(uuid.uuid4()),
            "position_id": "pos-1",
            "chain_id": chain_id,
            "pair_address": pair_address,
            "symbol": "DOGE",
            "side": "sell",
            "price": 1.0,
            "quantity": 100.0,
            "fee_usd": 0.1,
            "ts": ts,
            "reason": f"{kind} exit",
            "realized_pnl_usd": -5.0,
            "mode": "paper",
            "kind": kind,
        }
    )


def test_no_trades_reports_no_recent_negative_exit(db):
    assert db.has_recent_negative_exit(CHAIN, PAIR, ["stop_loss"], since_ts=0) is False


def test_recent_stop_loss_is_detected(db):
    now = time.time()
    _insert_sell(db, ts=now, kind="stop_loss")
    assert db.has_recent_negative_exit(CHAIN, PAIR, ["stop_loss", "liquidity_crash", "reversal"], since_ts=now - 60)


def test_old_stop_loss_outside_window_is_not_detected(db):
    now = time.time()
    _insert_sell(db, ts=now - 3600, kind="stop_loss")
    assert not db.has_recent_negative_exit(CHAIN, PAIR, ["stop_loss"], since_ts=now - 60)


def test_take_profit_does_not_count_as_negative_exit(db):
    now = time.time()
    _insert_sell(db, ts=now, kind="take_profit")
    assert not db.has_recent_negative_exit(CHAIN, PAIR, ["stop_loss", "liquidity_crash", "reversal"], since_ts=now - 60)


def test_different_pair_does_not_match(db):
    now = time.time()
    _insert_sell(db, ts=now, kind="stop_loss", pair_address="SOME_OTHER_PAIR")
    assert not db.has_recent_negative_exit(CHAIN, PAIR, ["stop_loss"], since_ts=now - 60)


def test_different_chain_does_not_match(db):
    now = time.time()
    _insert_sell(db, ts=now, kind="stop_loss", chain_id="ethereum")
    assert not db.has_recent_negative_exit(CHAIN, PAIR, ["stop_loss"], since_ts=now - 60)


def test_empty_kinds_list_never_matches(db):
    now = time.time()
    _insert_sell(db, ts=now, kind="stop_loss")
    assert db.has_recent_negative_exit(CHAIN, PAIR, [], since_ts=now - 60) is False
