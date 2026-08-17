"""Paper execution tests: fill economics (`apply_entry_fill`/`apply_exit_fill`)
and the provider's bankroll/journal bookkeeping.
"""

from __future__ import annotations

from datetime import date

import pytest

from eightam_bot.execution.paper import PaperExecutionProvider, apply_entry_fill, apply_exit_fill
from eightam_bot.journal import TradeJournal
from eightam_bot.models import Bias, Trade


def _trade(bias: Bias = Bias.LONG, entry: float = 100.0, quantity: float = 10.0) -> Trade:
    return Trade(
        id="t1", symbol="BTC/USDT", session_date=date(2024, 1, 8), bias=bias,
        entry_price=entry, entry_ts=0, stop_price=95.0 if bias is Bias.LONG else 105.0,
        target_price=110.0 if bias is Bias.LONG else 90.0, quantity=quantity, risk_usd=50.0,
    )


# --- apply_entry_fill / apply_exit_fill ----------------------------------------


def test_entry_fill_applies_fee_only_no_slippage():
    trade = _trade(entry=100.0, quantity=10.0)
    apply_entry_fill(trade, fee_bps=4.0)
    assert trade.entry_price == pytest.approx(100.0)  # unchanged -- a resting limit order fills at its price
    assert trade.fee_usd == pytest.approx(10.0 * 100.0 * 4.0 / 10_000)


@pytest.mark.parametrize("reason", ["stop_loss", "force_close"])
def test_exit_fill_applies_slippage_against_a_long_for_market_exits(reason):
    trade = _trade(bias=Bias.LONG, entry=100.0, quantity=10.0)
    trade.exit_price = 95.0
    trade.exit_reason = reason

    apply_exit_fill(trade, slippage_bps=10.0, fee_bps=0.0)

    # Slippage works against the trader: a long's exit price should be adjusted DOWN.
    assert trade.exit_price == pytest.approx(95.0 * (1 - 10.0 / 10_000))
    assert trade.exit_price < 95.0


@pytest.mark.parametrize("reason", ["stop_loss", "force_close"])
def test_exit_fill_applies_slippage_against_a_short(reason):
    trade = _trade(bias=Bias.SHORT, entry=100.0, quantity=10.0)
    trade.exit_price = 105.0
    trade.exit_reason = reason

    apply_exit_fill(trade, slippage_bps=10.0, fee_bps=0.0)

    # A short's exit price should be adjusted UP (worse for the trader).
    assert trade.exit_price == pytest.approx(105.0 * (1 + 10.0 / 10_000))
    assert trade.exit_price > 105.0


def test_take_profit_exit_gets_no_slippage():
    trade = _trade(bias=Bias.LONG, entry=100.0, quantity=10.0)
    trade.exit_price = 110.0
    trade.exit_reason = "take_profit"

    apply_exit_fill(trade, slippage_bps=50.0, fee_bps=0.0)

    assert trade.exit_price == pytest.approx(110.0)  # a resting limit order -- no slippage


def test_exit_fill_computes_realized_pnl_net_of_fees():
    trade = _trade(bias=Bias.LONG, entry=100.0, quantity=10.0)
    trade.entry_price = 100.0
    trade.fee_usd = 1.0  # pretend the entry already charged $1
    trade.exit_price = 110.0
    trade.exit_reason = "take_profit"

    apply_exit_fill(trade, slippage_bps=0.0, fee_bps=10.0)  # 10bps fee on the exit notional

    exit_fee = 10.0 * 110.0 * 10.0 / 10_000
    expected_pnl = (110.0 - 100.0) * 10.0 - (1.0 + exit_fee)
    assert trade.realized_pnl_usd == pytest.approx(expected_pnl)


# --- PaperExecutionProvider ------------------------------------------------------


@pytest.mark.asyncio
async def test_paper_provider_bankroll_reflects_journaled_trades(tmp_path):
    journal = TradeJournal(tmp_path / "trades.csv")
    provider = PaperExecutionProvider(journal, starting_balance_usd=10_000.0, simulated_slippage_bps=0.0, simulated_fee_bps=0.0)

    assert provider.get_bankroll_usd() == pytest.approx(10_000.0)

    trade = _trade(bias=Bias.LONG, entry=100.0, quantity=10.0)
    await provider.enter(trade)
    assert provider.get_bankroll_usd() == pytest.approx(10_000.0)  # unrealized -- entering alone doesn't move it

    trade.exit_price = 110.0
    trade.exit_reason = "take_profit"
    await provider.exit(trade)

    assert trade.realized_pnl_usd == pytest.approx(100.0)  # (110-100)*10, no fees/slippage configured
    assert provider.get_bankroll_usd() == pytest.approx(10_100.0)
    assert journal.load_trades()[0].id == trade.id


@pytest.mark.asyncio
async def test_paper_provider_daily_realized_pnl(tmp_path):
    journal = TradeJournal(tmp_path / "trades.csv")
    provider = PaperExecutionProvider(journal, simulated_slippage_bps=0.0, simulated_fee_bps=0.0)

    trade = _trade(bias=Bias.LONG, entry=100.0, quantity=10.0)
    trade.exit_price = 90.0
    trade.exit_reason = "stop_loss"
    trade.exit_ts = 5_000
    await provider.exit(trade)

    assert provider.get_daily_realized_pnl_usd(since_ts=0) == pytest.approx(-100.0)
    assert provider.get_daily_realized_pnl_usd(since_ts=10_000) == pytest.approx(0.0)
