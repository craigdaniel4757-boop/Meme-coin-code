"""Scanner discovery tests -- currently just the multi-pool consolidation
helper, which is a pure function with no network/Scanner-instance
dependency (see bot/scanner/screener.py's `_consolidate_by_token`)."""

from __future__ import annotations

from bot.scanner.screener import _consolidate_by_token
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
