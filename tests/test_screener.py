"""Scanner discovery tests: the multi-pool consolidation helper (a pure
function, no network/Scanner-instance dependency), plus a check that
running a Scanner with no execution provider attached -- the `scan --loop`
CLI mode -- never touches position management or entry logic, no matter
what candidates it's given (see bot/scanner/screener.py's
`manage_open_positions`/`enter_new_positions`, and bot/cli.py's
`_run_scan_loop`)."""

from __future__ import annotations

from bot.config import load_config
from bot.data.models import Candidate, IndicatorSnapshot, SafetyResult, Signal, SignalAction
from bot.scanner.screener import Scanner, _consolidate_by_token
from bot.storage.db import Database
from tests.conftest import make_pair


def test_keeps_only_the_most_liquid_pool_per_token():
    low = make_pair(pair_address="POOL_LOW", base_address="TOKEN_A", liquidity_usd=10_000.0)
    high = make_pair(pair_address="POOL_HIGH", base_address="TOKEN_A", liquidity_usd=90_000.0)

    result = _consolidate_by_token([low, high])

    assert len(result) == 1
    assert result[0].pairAddress == "POOL_HIGH"


def test_keeps_all_pools_for_distinct_tokens():
    a = make_pair(pair_address="POOL_A", base_address="TOKEN_A", liquidity_usd=10_000.0)
    b = make_pair(pair_address="POOL_B", base_address="TOKEN_B", liquidity_usd=20_000.0)

    result = _consolidate_by_token([a, b])

    assert {p.pairAddress for p in result} == {"POOL_A", "POOL_B"}


def test_order_of_input_does_not_matter():
    low = make_pair(pair_address="POOL_LOW", base_address="TOKEN_A", liquidity_usd=10_000.0)
    high = make_pair(pair_address="POOL_HIGH", base_address="TOKEN_A", liquidity_usd=90_000.0)

    result = _consolidate_by_token([high, low])

    assert len(result) == 1
    assert result[0].pairAddress == "POOL_HIGH"


def test_missing_base_token_address_falls_back_to_per_pair_keying():
    """Pairs with no baseToken.address must never be merged together --
    that would silently drop unrelated tokens under a shared empty key."""
    a = make_pair(pair_address="POOL_A", base_address="", liquidity_usd=10_000.0)
    b = make_pair(pair_address="POOL_B", base_address="", liquidity_usd=90_000.0)

    result = _consolidate_by_token([a, b])

    assert {p.pairAddress for p in result} == {"POOL_A", "POOL_B"}


def test_different_chains_are_not_merged():
    solana = make_pair(pair_address="POOL_A", base_address="TOKEN_A", chain_id="solana", liquidity_usd=10_000.0)
    ethereum = make_pair(pair_address="POOL_B", base_address="TOKEN_A", chain_id="ethereum", liquidity_usd=90_000.0)

    result = _consolidate_by_token([solana, ethereum])

    assert {p.pairAddress for p in result} == {"POOL_A", "POOL_B"}


def test_empty_input():
    assert _consolidate_by_token([]) == []


# -- Scanner with no execution provider: the `scan --loop` safety property --


def _buy_candidate() -> Candidate:
    """A candidate that looks fully tradeable -- passed safety, carries a
    live BUY signal -- specifically so the test below proves the
    execution-is-None guard holds even under the case most likely to slip
    past it, not just on an empty/boring candidate list."""
    pair = make_pair()
    return Candidate(
        pair=pair,
        candles=None,
        indicators=IndicatorSnapshot(price=1.0, num_candles=150),
        safety=SafetyResult(passed=True),
        score=None,
        signals=[
            Signal(
                chain_id=pair.chainId, pair_address=pair.pairAddress, symbol=pair.symbol,
                action=SignalAction.BUY, strategy_name="momentum_breakout", confidence=0.9,
                reason="test", price=1.0, timestamp=0.0,
            )
        ],
    )


async def test_scanner_with_no_execution_provider_never_manages_or_enters_positions(tmp_path):
    """The exact safety property `scan --loop` (bot/cli.py's
    `_run_scan_loop`) relies on: a Scanner built without an execution
    provider must stay a pure, read-only reporter -- even when handed a
    candidate carrying a live BUY signal, it must never touch a portfolio,
    paper or live. manage_open_positions/enter_new_positions both bail out
    on `self.execution is None` before touching the DB or any network
    client, so this needs no mocking to verify."""
    cfg = load_config()
    db = Database(tmp_path / "test.db")
    try:
        async with Scanner(cfg, db) as scanner:
            assert scanner.execution is None
            await scanner.manage_open_positions()
            await scanner.enter_new_positions([_buy_candidate()])
    finally:
        db.close()
