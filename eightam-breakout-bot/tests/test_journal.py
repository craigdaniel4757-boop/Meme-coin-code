"""CSV trade journal round-trip tests."""

from __future__ import annotations

from datetime import date

import pytest

from eightam_bot.journal import TradeJournal
from eightam_bot.models import Bias, Trade


def _trade(id_: str, symbol: str = "BTC/USDT", pnl: float | None = 25.0, exit_ts: int | None = 1_000) -> Trade:
    return Trade(
        id=id_, symbol=symbol, session_date=date(2024, 1, 8), bias=Bias.LONG,
        entry_price=100.0, entry_ts=900, stop_price=95.0, target_price=110.0,
        quantity=5.0, risk_usd=25.0, exit_price=105.0, exit_ts=exit_ts,
        exit_reason="take_profit", fee_usd=1.5, realized_pnl_usd=pnl, ml_confidence=0.72,
    )


def test_record_and_load_round_trips_all_fields(tmp_path):
    journal = TradeJournal(tmp_path / "trades.csv")
    original = _trade("t1")
    journal.record_trade(original)

    [loaded] = journal.load_trades()
    assert loaded.id == original.id
    assert loaded.symbol == original.symbol
    assert loaded.session_date == original.session_date
    assert loaded.bias is Bias.LONG
    assert loaded.entry_price == original.entry_price
    assert loaded.stop_price == original.stop_price
    assert loaded.target_price == original.target_price
    assert loaded.quantity == original.quantity
    assert loaded.risk_usd == original.risk_usd
    assert loaded.exit_price == original.exit_price
    assert loaded.exit_ts == original.exit_ts
    assert loaded.exit_reason == original.exit_reason
    assert loaded.fee_usd == original.fee_usd
    assert loaded.realized_pnl_usd == original.realized_pnl_usd
    assert loaded.ml_confidence == original.ml_confidence


def test_multiple_trades_append_with_single_header(tmp_path):
    journal = TradeJournal(tmp_path / "trades.csv")
    journal.record_trade(_trade("t1"))
    journal.record_trade(_trade("t2"))

    contents = (tmp_path / "trades.csv").read_text()
    assert contents.count("realized_pnl_usd") == 1  # header written exactly once
    assert len(journal.load_trades()) == 2


def test_load_trades_on_missing_file_returns_empty_list(tmp_path):
    journal = TradeJournal(tmp_path / "does_not_exist.csv")
    assert journal.load_trades() == []
    assert journal.total_realized_pnl_usd() == 0.0


def test_total_and_since_realized_pnl(tmp_path):
    journal = TradeJournal(tmp_path / "trades.csv")
    journal.record_trade(_trade("t1", pnl=100.0, exit_ts=1_000))
    journal.record_trade(_trade("t2", pnl=-40.0, exit_ts=2_000))
    journal.record_trade(_trade("t3", pnl=None, exit_ts=None))  # still-open trade, shouldn't count

    assert journal.total_realized_pnl_usd() == pytest.approx(60.0)
    assert journal.realized_pnl_since(1_500) == pytest.approx(-40.0)
    assert journal.realized_pnl_since(0) == pytest.approx(60.0)


def test_creates_parent_directory(tmp_path):
    nested = tmp_path / "nested" / "dir" / "trades.csv"
    journal = TradeJournal(nested)
    journal.record_trade(_trade("t1"))
    assert nested.exists()
