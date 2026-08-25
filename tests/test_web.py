"""Live dashboard tests (bot/web.py): the pure status/metrics computation,
not the FastAPI HTTP layer or its background scan loop -- those are thin
wiring around already-tested pieces (Scanner, PaperExecutionProvider),
verified by hand the same way bot/cli.py's own command wiring is (this
repo has no test_cli.py either; see the scan --loop / --buy-only work for
that precedent) rather than by a heavier TestClient/lifespan integration
test.
"""

from __future__ import annotations

import json

import pytest

from bot.config import load_config
from bot.data.models import Candidate, IndicatorSnapshot, SafetyResult, Signal, SignalAction
from bot.execution.paper import PaperExecutionProvider
from bot.storage.db import Database
from bot.strategy.risk_manager import RiskConfig
from bot.web import DashboardState, _mark_to_market_prices, status_payload
from tests.conftest import make_pair


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "test.db")
    yield database
    database.close()


def _risk_cfg(**overrides) -> RiskConfig:
    base = dict(stop_loss_pct=15.0, take_profit_ladder=[(50.0, 1.0)])
    base.update(overrides)
    return RiskConfig(**base)


def _candidate(symbol: str = "DOGE", price: float = 1.0, pair_address: str = "PAIR1") -> Candidate:
    pair = make_pair(pair_address=pair_address, symbol=symbol, price_usd=price)
    return Candidate(
        pair=pair, candles=None, indicators=IndicatorSnapshot(price=price, num_candles=150),
        safety=SafetyResult(passed=True), score=None, signals=[],
    )


def _buy_signal(pair_address: str, symbol: str, strategy_name: str) -> Signal:
    return Signal(
        chain_id="solana", pair_address=pair_address, symbol=symbol, action=SignalAction.BUY,
        strategy_name=strategy_name, confidence=0.8, reason="test", price=1.0, timestamp=0.0,
    )


# -- _mark_to_market_prices ----------------------------------------------------


def test_mark_to_market_prices_keys_by_pair_address_and_skips_falsy_prices():
    candidates = [
        _candidate(pair_address="PAIR1", price=1.5),
        _candidate(pair_address="PAIR2", price=0.0),  # falsy -- Portfolio.equity()'s own fallback handles this
    ]
    assert _mark_to_market_prices(candidates) == {"PAIR1": 1.5}


# -- status_payload -------------------------------------------------------------


async def test_status_payload_on_fresh_state_has_no_trades_or_positions(db):
    cfg = load_config()
    execution = PaperExecutionProvider(db, starting_balance_usd=1000.0)
    state = DashboardState(starting_equity_usd=1000.0)

    payload = status_payload(cfg, execution, state)

    assert payload["equity_usd"] == 1000.0
    assert payload["bankroll_usd"] == 1000.0
    assert payload["open_positions"] == []
    assert payload["recent_trades"] == []
    assert payload["metrics"]["closed_trades"] == 0
    json.dumps(payload)  # must round-trip through the exact encoder the real endpoint uses


async def test_status_payload_reflects_a_closed_winning_trade(db):
    cfg = load_config()
    execution = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=0, simulated_fee_bps=0)
    position = await execution.buy("solana", "PAIR1", "MINT1", "DOGE", 100.0, 1.0, "momentum_breakout", _risk_cfg())
    await execution.sell(position, fraction=1.0, quote_price=1.5, reason="take-profit", kind="take_profit")

    state = DashboardState(starting_equity_usd=1000.0)
    state.equity_history = [(1000.0, 1000.0), (1001.0, 1050.0)]

    payload = status_payload(cfg, execution, state)

    assert payload["bankroll_usd"] == pytest.approx(1050.0)
    assert payload["equity_usd"] == pytest.approx(1050.0)
    assert payload["total_return_pct"] == pytest.approx(5.0)
    assert payload["metrics"]["closed_trades"] == 1
    assert payload["metrics"]["win_rate_pct"] == 100.0
    # Only a winning trade so far -> compute_metrics' profit_factor is inf,
    # which isn't valid JSON -- must come through sanitized to None rather
    # than breaking the endpoint or the frontend's JSON.parse.
    assert payload["metrics"]["profit_factor"] is None
    assert payload["recent_trades"][0]["side"] == "sell"  # newest first
    json.dumps(payload)


async def test_status_payload_open_position_included(db):
    cfg = load_config()
    execution = PaperExecutionProvider(db, starting_balance_usd=1000.0, simulated_slippage_bps=0, simulated_fee_bps=0)
    await execution.buy("solana", "PAIR1", "MINT1", "DOGE", 100.0, 1.0, "momentum_breakout", _risk_cfg())
    state = DashboardState(starting_equity_usd=1000.0)

    payload = status_payload(cfg, execution, state)

    assert len(payload["open_positions"]) == 1
    assert payload["open_positions"][0]["symbol"] == "DOGE"
    assert payload["bankroll_usd"] == pytest.approx(900.0)


async def test_status_payload_only_surfaces_candidates_meeting_min_agreeing_strategies(db):
    cfg = load_config()
    cfg.risk.min_agreeing_strategies = 2
    execution = PaperExecutionProvider(db, starting_balance_usd=1000.0)
    state = DashboardState(starting_equity_usd=1000.0)

    weak = _candidate(symbol="WEAK", pair_address="PAIR1")
    weak.signals = [_buy_signal("PAIR1", "WEAK", "momentum_breakout")]
    strong = _candidate(symbol="STRONG", pair_address="PAIR2")
    strong.signals = [
        _buy_signal("PAIR2", "STRONG", "momentum_breakout"),
        _buy_signal("PAIR2", "STRONG", "volume_spike_breakout"),
    ]
    state.latest_candidates = [weak, strong]

    payload = status_payload(cfg, execution, state)

    assert [c["symbol"] for c in payload["buy_candidates"]] == ["STRONG"]
    assert payload["candidates_analyzed"] == 2
