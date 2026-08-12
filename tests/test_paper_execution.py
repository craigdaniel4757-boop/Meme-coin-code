"""Paper execution provider tests: portfolio bookkeeping (cash, realized
PnL, position lifecycle) and DB persistence/restoration -- against a real
temp-file SQLite database, since Database is cheap enough to just use
directly rather than mock.
"""

from __future__ import annotations

import time

import pytest

from bot.execution.paper import PaperExecutionProvider
from bot.storage.db import Database
from bot.strategy.risk_manager import RiskConfig


def _risk_cfg(**overrides) -> RiskConfig:
    base = dict(stop_loss_pct=15.0, take_profit_ladder=[(50.0, 0.5)], trailing_stop_activate_pct=1000.0)
    base.update(overrides)
    return RiskConfig(**base)


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "test.db")
    yield database
    database.close()


async def test_buy_reduces_cash_and_creates_position(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=0, simulated_fee_bps=0)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())

    assert position is not None
    assert position.quantity == pytest.approx(100.0)
    assert provider.get_bankroll_usd() == pytest.approx(900.0)
    assert len(provider.get_open_positions()) == 1


async def test_buy_applies_slippage_and_fee(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=100, simulated_fee_bps=50)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())

    assert position.entry_price == pytest.approx(1.01)  # 1% slippage on the buy side
    assert position.quantity == pytest.approx(100.0 / 1.01)
    assert provider.get_bankroll_usd() == pytest.approx(1000.0 - 100.0 - 0.5)  # notional + 0.5% fee


async def test_buy_rejected_when_insufficient_cash(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=50.0)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())
    assert position is None
    assert provider.get_open_positions() == []


async def test_sell_partial_realizes_pnl_and_keeps_position_open(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=0, simulated_fee_bps=0)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())

    trade = await provider.sell(position, fraction=0.5, quote_price=2.0, reason="take-profit")
    assert trade is not None
    assert trade.quantity == pytest.approx(50.0)
    assert trade.realized_pnl_usd == pytest.approx(50.0 * (2.0 - 1.0))
    assert position.remaining_fraction == pytest.approx(0.5)
    assert len(provider.get_open_positions()) == 1


async def test_sell_full_closes_and_removes_position(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=0, simulated_fee_bps=0)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())

    trade = await provider.sell(position, fraction=1.0, quote_price=0.5, reason="stop-loss")
    assert trade.realized_pnl_usd == pytest.approx(100.0 * (0.5 - 1.0))
    assert provider.get_open_positions() == []
    assert position.status == "closed"


async def test_open_positions_survive_provider_restart(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=1000.0)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())

    # A fresh provider instance backed by the same DB should recover the
    # open position (though not the exact cash balance across restarts --
    # see PaperExecutionProvider's docstring on why that's out of scope).
    restarted = PaperExecutionProvider(db, starting_balance_usd=1000.0)
    restored = restarted.get_open_positions()

    assert len(restored) == 1
    assert restored[0].id == position.id
    assert restored[0].symbol == "DOGE"
    assert restored[0].base_token_address == "MINT"


async def test_daily_realized_pnl_sums_only_sells_in_window(db):
    provider = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=0, simulated_fee_bps=0)
    position = await provider.buy("solana", "PAIR", "MINT", "DOGE", 100.0, 1.0, "test", _risk_cfg())
    await provider.sell(position, fraction=1.0, quote_price=1.2, reason="take-profit")

    pnl = provider.get_daily_realized_pnl_usd(since_ts=time.time() - 3600)
    assert pnl == pytest.approx(100.0 * (1.2 - 1.0))

    pnl_future_window = provider.get_daily_realized_pnl_usd(since_ts=time.time() + 3600)
    assert pnl_future_window == pytest.approx(0.0)
