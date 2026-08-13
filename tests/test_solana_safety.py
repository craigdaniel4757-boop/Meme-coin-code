"""Solana on-chain mint/freeze authority and holder-concentration check
tests -- mocked JSON-RPC via respx. The critical property under test is
that every failure mode (RPC error, missing account, unparseable account)
resolves to "not confirmed renounced" / "not fetched" rather than being
silently treated as safe.
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from bot.data.solana_safety import SolanaSafetyClient

RPC_URL = "https://api.mainnet-beta.solana.com"


def _rpc_ok(result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": 1, "result": result}


@respx.mock
async def test_get_mint_info_parses_renounced_authorities():
    value = {
        "data": {
            "parsed": {
                "type": "mint",
                "info": {"mintAuthority": None, "freezeAuthority": None, "decimals": 6, "supply": "1000000000"},
            }
        }
    }
    respx.post(RPC_URL).mock(return_value=httpx.Response(200, json=_rpc_ok({"value": value})))

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        info = await client.get_mint_info("SomeMintAddress")

    assert info.parsed_ok
    assert info.mint_authority_renounced
    assert info.freeze_authority_renounced
    assert info.decimals == 6
    assert info.supply == 1_000_000_000


@respx.mock
async def test_get_mint_info_parses_retained_authority():
    value = {
        "data": {
            "parsed": {
                "type": "mint",
                "info": {"mintAuthority": "DeployerWallet111", "freezeAuthority": None, "decimals": 9, "supply": "1"},
            }
        }
    }
    respx.post(RPC_URL).mock(return_value=httpx.Response(200, json=_rpc_ok({"value": value})))

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        info = await client.get_mint_info("SomeMintAddress")

    assert info.parsed_ok
    assert not info.mint_authority_renounced  # retained -> NOT renounced
    assert info.freeze_authority_renounced


@respx.mock
async def test_get_mint_info_fails_closed_on_missing_account():
    respx.post(RPC_URL).mock(return_value=httpx.Response(200, json=_rpc_ok({"value": None})))
    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        info = await client.get_mint_info("DoesNotExist")

    assert not info.parsed_ok
    assert not info.mint_authority_renounced  # unknown must fail closed, never "assumed safe"
    assert not info.freeze_authority_renounced


@respx.mock
async def test_get_mint_info_fails_closed_on_rpc_error():
    respx.post(RPC_URL).mock(
        return_value=httpx.Response(
            200, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32602, "message": "invalid param"}}
        )
    )
    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        info = await client.get_mint_info("SomeMint")

    assert not info.parsed_ok
    assert not info.mint_authority_renounced


@respx.mock
async def test_get_mint_info_fails_closed_on_unparseable_account():
    # account exists but isn't jsonParsed-able (e.g. not an SPL mint) --
    # data comes back as a raw base64 tuple instead of a parsed dict.
    value = {"data": ["base64garbage==", "base64"]}
    respx.post(RPC_URL).mock(return_value=httpx.Response(200, json=_rpc_ok({"value": value})))

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        info = await client.get_mint_info("NotAMint")

    assert not info.parsed_ok
    assert not info.mint_authority_renounced


def _largest_accounts_route(holders: list[dict]) -> dict:
    return _rpc_ok({"value": holders})


def _supply_route(ui_amount: float) -> dict:
    return _rpc_ok({"value": {"uiAmount": ui_amount, "amount": str(int(ui_amount)), "decimals": 6}})


def _dual_rpc_router(largest_accounts_json: dict, supply_json: dict):
    """getTokenLargestAccounts and getTokenSupply both POST to the same RPC
    URL, so routing between their mocked responses has to inspect the
    JSON-RPC `method` field in the request body rather than the URL."""

    def _route(request: httpx.Request) -> httpx.Response:
        method = json.loads(request.content)["method"]
        if method == "getTokenLargestAccounts":
            return httpx.Response(200, json=largest_accounts_json)
        if method == "getTokenSupply":
            return httpx.Response(200, json=supply_json)
        return httpx.Response(400, json={"error": f"unexpected method {method}"})

    return _route


@respx.mock
async def test_get_holder_concentration_excludes_largest_holder():
    holders = [
        {"address": "PoolVault1111111111111111111111111111111", "uiAmount": 600_000.0},
        {"address": "Holder2", "uiAmount": 150_000.0},
        {"address": "Holder3", "uiAmount": 50_000.0},
    ]
    respx.post(RPC_URL).mock(
        side_effect=_dual_rpc_router(_largest_accounts_route(holders), _supply_route(1_000_000.0))
    )

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        result = await client.get_holder_concentration("SomeMint")

    assert result.fetched_ok
    # Largest holder (the presumed AMM pool, 600k) is excluded; the rest
    # (150k + 50k) / 1,000,000 total supply = 20%.
    assert result.top_holders_excluding_largest_pct == pytest.approx(20.0)


@respx.mock
async def test_get_holder_concentration_flags_concentrated_supply():
    holders = [
        # The pool must stay the single *largest* holder for the "exclude
        # the largest" heuristic to actually exclude it -- a whale bigger
        # than the pool itself is the documented edge case where the
        # heuristic breaks down, not what this fixture means to test.
        {"address": "PoolVault1111111111111111111111111111111", "uiAmount": 340_000.0},
        {"address": "WhaleHolder1", "uiAmount": 335_000.0},
        {"address": "WhaleHolder2", "uiAmount": 325_000.0},
    ]
    respx.post(RPC_URL).mock(
        side_effect=_dual_rpc_router(_largest_accounts_route(holders), _supply_route(1_000_000.0))
    )

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        result = await client.get_holder_concentration("SomeMint")

    assert result.fetched_ok
    assert result.top_holders_excluding_largest_pct == pytest.approx(66.0)


@respx.mock
async def test_get_holder_concentration_fails_closed_on_rpc_error():
    respx.post(RPC_URL).mock(
        return_value=httpx.Response(
            200, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32602, "message": "invalid param"}}
        )
    )

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        result = await client.get_holder_concentration("SomeMint")

    assert not result.fetched_ok
    assert result.top_holders_excluding_largest_pct is None


@respx.mock
async def test_get_holder_concentration_fails_closed_on_transport_error():
    respx.post(RPC_URL).mock(side_effect=httpx.ConnectError("connection refused"))

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        result = await client.get_holder_concentration("SomeMint")

    assert not result.fetched_ok


@respx.mock
async def test_get_holder_concentration_fails_closed_on_unparseable_response():
    respx.post(RPC_URL).mock(
        side_effect=_dual_rpc_router({"jsonrpc": "2.0", "id": 1, "result": {"value": "not-a-list"}}, _supply_route(1_000_000.0))
    )

    async with SolanaSafetyClient(rpc_url=RPC_URL) as client:
        result = await client.get_holder_concentration("SomeMint")

    assert not result.fetched_ok
