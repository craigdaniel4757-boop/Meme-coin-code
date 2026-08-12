"""GeckoTerminal OHLCV client tests -- mocked via respx (no outbound
network access to the real API from this sandbox)."""

from __future__ import annotations

import httpx
import pytest
import respx

from bot.data.geckoterminal import GeckoTerminalClient, pick_timeframe

BASE_URL = "https://api.geckoterminal.com/api/v2"


def test_pick_timeframe_selects_closest_supported_aggregate():
    assert pick_timeframe(60) == ("minute", 1)
    assert pick_timeframe(300) == ("minute", 5)
    assert pick_timeframe(3600) == ("hour", 1)
    assert pick_timeframe(86400) == ("day", 1)


@respx.mock
async def test_get_ohlcv_parses_and_sorts_ascending_by_timestamp():
    payload = {
        "data": {
            "attributes": {
                "ohlcv_list": [
                    [200, 1.2, 1.3, 1.1, 1.25, 1000],  # GeckoTerminal returns newest-first
                    [100, 1.0, 1.1, 0.9, 1.05, 900],
                ]
            }
        }
    }
    respx.get(f"{BASE_URL}/networks/solana/pools/POOL1/ohlcv/minute").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with GeckoTerminalClient(base_url=BASE_URL) as client:
        candles = await client.get_ohlcv("solana", "POOL1", interval_seconds=60, limit=10)

    assert len(candles) == 2
    assert candles[0].timestamp == 100  # re-sorted ascending regardless of API order
    assert candles[1].timestamp == 200
    assert candles[0].close == pytest.approx(1.05)


@respx.mock
async def test_get_ohlcv_returns_empty_on_unmapped_chain_without_a_network_call():
    async with GeckoTerminalClient(base_url=BASE_URL) as client:
        candles = await client.get_ohlcv("some_unmapped_chain", "POOL1", interval_seconds=60)
    assert candles == []


@respx.mock
async def test_get_ohlcv_returns_empty_on_http_error():
    respx.get(f"{BASE_URL}/networks/solana/pools/MISSING/ohlcv/minute").mock(return_value=httpx.Response(404))
    async with GeckoTerminalClient(base_url=BASE_URL) as client:
        candles = await client.get_ohlcv("solana", "MISSING", interval_seconds=60)
    assert candles == []


@respx.mock
async def test_get_ohlcv_returns_empty_on_malformed_payload():
    respx.get(f"{BASE_URL}/networks/solana/pools/POOL1/ohlcv/minute").mock(
        return_value=httpx.Response(200, json={"data": {"attributes": {}}})
    )
    async with GeckoTerminalClient(base_url=BASE_URL) as client:
        candles = await client.get_ohlcv("solana", "POOL1", interval_seconds=60)
    assert candles == []


@respx.mock
async def test_get_ohlcv_does_not_retry_on_429():
    """Regression test: 429 used to be in the retryable set, so a single
    rate-limited pool burned 3 requests (with backoff sleeps) against a
    server that had just said "too many requests" -- worsening exactly the
    problem it was trying to recover from. A 429 should fail this one
    fetch immediately and let the caller fall back, not retry in place."""
    route = respx.get(f"{BASE_URL}/networks/solana/pools/POOL1/ohlcv/minute").mock(
        return_value=httpx.Response(429)
    )
    async with GeckoTerminalClient(base_url=BASE_URL) as client:
        candles = await client.get_ohlcv("solana", "POOL1", interval_seconds=60)

    assert candles == []
    assert route.call_count == 1  # no retries


@respx.mock
async def test_get_ohlcv_still_retries_on_server_error():
    route = respx.get(f"{BASE_URL}/networks/solana/pools/POOL1/ohlcv/minute")
    route.side_effect = [
        httpx.Response(503),
        httpx.Response(200, json={"data": {"attributes": {"ohlcv_list": [[100, 1.0, 1.1, 0.9, 1.05, 900]]}}}),
    ]
    async with GeckoTerminalClient(base_url=BASE_URL) as client:
        candles = await client.get_ohlcv("solana", "POOL1", interval_seconds=60)

    assert route.call_count == 2
    assert len(candles) == 1
