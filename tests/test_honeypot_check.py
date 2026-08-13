"""Pre-trade sellability ("honeypot") check tests -- mocked Jupiter quote
API via respx. The critical property under test is that every failure mode
(no route, unreachable API, degenerate probe amount) resolves to
`can_sell=False` rather than being silently treated as sellable.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from bot.data.honeypot_check import HoneypotCheckClient

BASE_URL = "https://quote-api.jup.ag/v6"
MINT = "SomeTokenMintAddress111111111111111111111"


@respx.mock
async def test_sellable_token_returns_can_sell_true():
    respx.get(f"{BASE_URL}/quote").mock(
        return_value=httpx.Response(200, json={"outAmount": "990000", "priceImpactPct": "0.015"})
    )

    async with HoneypotCheckClient(base_url=BASE_URL) as client:
        result = await client.check_sellable(MINT, token_decimals=6, probe_ui_amount=1.0)

    assert result.checked is True
    assert result.can_sell is True
    assert result.price_impact_pct == pytest.approx(1.5)


@respx.mock
async def test_zero_out_amount_is_not_sellable():
    respx.get(f"{BASE_URL}/quote").mock(return_value=httpx.Response(200, json={"outAmount": "0"}))

    async with HoneypotCheckClient(base_url=BASE_URL) as client:
        result = await client.check_sellable(MINT, token_decimals=6)

    assert result.checked is True
    assert result.can_sell is False
    assert "no sell route" in result.reason


@respx.mock
async def test_missing_out_amount_is_not_sellable():
    respx.get(f"{BASE_URL}/quote").mock(return_value=httpx.Response(200, json={}))

    async with HoneypotCheckClient(base_url=BASE_URL) as client:
        result = await client.check_sellable(MINT, token_decimals=6)

    assert result.checked is True
    assert result.can_sell is False


@respx.mock
async def test_unreachable_quote_api_fails_closed():
    respx.get(f"{BASE_URL}/quote").mock(side_effect=httpx.ConnectError("connection refused"))

    async with HoneypotCheckClient(base_url=BASE_URL) as client:
        result = await client.check_sellable(MINT, token_decimals=6)

    assert result.checked is False
    assert result.can_sell is False  # unknown must fail closed, never "assumed sellable"


@respx.mock
async def test_server_error_fails_closed():
    respx.get(f"{BASE_URL}/quote").mock(return_value=httpx.Response(500))

    async with HoneypotCheckClient(base_url=BASE_URL) as client:
        result = await client.check_sellable(MINT, token_decimals=6)

    assert result.checked is False
    assert result.can_sell is False


async def test_degenerate_probe_amount_fails_closed_without_network_call():
    # 0 decimals + a tiny probe amount rounds to zero raw units -- nothing
    # to quote, so this must short-circuit rather than send a zero-amount
    # request upstream.
    async with HoneypotCheckClient(base_url=BASE_URL) as client:
        result = await client.check_sellable(MINT, token_decimals=0, probe_ui_amount=0.4)

    assert result.checked is False
    assert result.can_sell is False
