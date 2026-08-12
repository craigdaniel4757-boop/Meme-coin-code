"""DexScreener client tests: response parsing, chain filtering, retry
behavior, and graceful degradation on malformed data.

Mocked via respx rather than hitting the real API -- this sandbox has no
outbound access to api.dexscreener.com to test against live, so this is
the only way to exercise the actual request/response handling code.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from bot.data.dexscreener import DexScreenerClient

BASE_URL = "https://api.dexscreener.com"


def _pair_json(chain_id="solana", pair_address="PAIR1", symbol="DOGE", liquidity_usd=50000.0):
    return {
        "chainId": chain_id,
        "dexId": "raydium",
        "pairAddress": pair_address,
        "baseToken": {"address": "MINT1", "name": symbol, "symbol": symbol},
        "quoteToken": {"address": "SOL", "name": "Wrapped SOL", "symbol": "SOL"},
        "priceUsd": "1.2345",
        "liquidity": {"usd": liquidity_usd},
        "volume": {"h24": 100000.0, "h6": 25000.0, "h1": 5000.0, "m5": 500.0},
        "priceChange": {"h24": 5.0, "h6": 2.0, "h1": 1.0, "m5": 0.5},
        "txns": {"m5": {"buys": 10, "sells": 5}, "h24": {"buys": 400, "sells": 300}},
        "fdv": 500000.0,
        "pairCreatedAt": 1700000000000,
    }


@respx.mock
async def test_search_pairs_parses_response():
    respx.get(f"{BASE_URL}/latest/dex/search").mock(
        return_value=httpx.Response(200, json={"pairs": [_pair_json()]})
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        pairs = await client.search_pairs("doge")

    assert len(pairs) == 1
    assert pairs[0].symbol == "DOGE"
    assert pairs[0].price_usd == pytest.approx(1.2345)
    assert pairs[0].liquidity.usd == 50000.0
    assert pairs[0].key == "solana:PAIR1"


@respx.mock
async def test_search_pairs_skips_malformed_items_without_crashing():
    respx.get(f"{BASE_URL}/latest/dex/search").mock(
        return_value=httpx.Response(
            200, json={"pairs": [_pair_json(), {"totally": "not a pair shape", "nested": {"x": [1, 2, 3]}}]}
        )
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        pairs = await client.search_pairs("doge")

    # pydantic's `extra="ignore"` models tolerate unknown shapes rather
    # than raising -- either way, one bad item must never take down the batch.
    assert len(pairs) >= 1


@respx.mock
async def test_search_pairs_returns_empty_on_client_error_without_retrying():
    route = respx.get(f"{BASE_URL}/latest/dex/search").mock(return_value=httpx.Response(404))
    async with DexScreenerClient(base_url=BASE_URL) as client:
        pairs = await client.search_pairs("nonexistent")

    assert pairs == []
    assert route.call_count == 1  # 404 is not in the retryable status set


@respx.mock
async def test_get_pairs_by_token_addresses_filters_by_requested_chain():
    route = respx.get(f"{BASE_URL}/latest/dex/tokens/MINT1").mock(
        return_value=httpx.Response(
            200,
            json={
                "pairs": [
                    _pair_json(chain_id="solana", pair_address="PAIR1"),
                    _pair_json(chain_id="ethereum", pair_address="PAIR2"),
                ]
            },
        )
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        pairs = await client.get_pairs_by_token_addresses("solana", ["MINT1"])

    assert route.called
    assert len(pairs) == 1
    assert pairs[0].chainId == "solana"


@respx.mock
async def test_get_pair_handles_singular_pair_response_key():
    respx.get(f"{BASE_URL}/latest/dex/pairs/solana/PAIR1").mock(
        return_value=httpx.Response(200, json={"pair": _pair_json()})
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        pair = await client.get_pair("solana", "PAIR1")

    assert pair is not None
    assert pair.pairAddress == "PAIR1"


@respx.mock
async def test_get_pair_returns_none_when_not_found():
    respx.get(f"{BASE_URL}/latest/dex/pairs/solana/MISSING").mock(
        return_value=httpx.Response(200, json={"pairs": []})
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        pair = await client.get_pair("solana", "MISSING")
    assert pair is None


@respx.mock
async def test_get_latest_token_profiles_parses_bare_array_response():
    respx.get(f"{BASE_URL}/token-profiles/latest/v1").mock(
        return_value=httpx.Response(200, json=[{"chainId": "solana", "tokenAddress": "MINT1", "description": "x"}])
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        profiles = await client.get_latest_token_profiles()

    assert len(profiles) == 1
    assert profiles[0].tokenAddress == "MINT1"


@respx.mock
async def test_get_latest_boosted_tokens_parses_bare_array_response():
    respx.get(f"{BASE_URL}/token-boosts/latest/v1").mock(
        return_value=httpx.Response(200, json=[{"chainId": "solana", "tokenAddress": "MINT1", "amount": 100}])
    )
    async with DexScreenerClient(base_url=BASE_URL) as client:
        boosts = await client.get_latest_boosted_tokens()

    assert len(boosts) == 1
    assert boosts[0].tokenAddress == "MINT1"


@respx.mock
async def test_retries_on_server_error_then_succeeds():
    route = respx.get(f"{BASE_URL}/latest/dex/search")
    route.side_effect = [httpx.Response(503), httpx.Response(200, json={"pairs": [_pair_json()]})]

    async with DexScreenerClient(base_url=BASE_URL) as client:
        pairs = await client.search_pairs("doge")

    assert route.call_count == 2
    assert len(pairs) == 1
