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
