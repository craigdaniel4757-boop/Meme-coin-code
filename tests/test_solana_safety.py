"""Solana on-chain mint/freeze authority check tests -- mocked JSON-RPC via
respx. The critical property under test is that every failure mode (RPC
error, missing account, unparseable account) resolves to "not confirmed
renounced" rather than being silently treated as safe.
"""

from __future__ import annotations

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
