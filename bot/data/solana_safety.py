"""On-chain safety checks for Solana SPL token mints via JSON-RPC.

The single highest-signal rug-pull check available for a brand-new Solana
meme coin is whether the deployer retained *mint authority* (can print
unlimited new supply) or *freeze authority* (can freeze your token account
so you can never sell) on the token's mint account. Both are queryable from
any public Solana RPC endpoint with no API key, via `getAccountInfo` +
`jsonParsed` encoding, which the SPL Token program (and Token-2022) natively
supports.

This module fails *safe*: if the RPC call fails, or the account can't be
parsed as a token mint, callers get `parsed_ok=False` rather than a
guessed answer, and `safety_filters.py` treats "unknown" as a failing
check rather than assuming the token is safe.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential_jitter

from bot.data.rate_limiter import AsyncRateLimiter

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


@dataclass(slots=True)
class MintAuthorityInfo:
    mint_address: str
    parsed_ok: bool
    mint_authority: str | None = None
    freeze_authority: str | None = None
    decimals: int | None = None
    supply: int | None = None

    @property
    def mint_authority_renounced(self) -> bool:
        return self.parsed_ok and self.mint_authority is None

    @property
    def freeze_authority_renounced(self) -> bool:
        return self.parsed_ok and self.freeze_authority is None


@dataclass
class SolanaSafetyClient:
    rpc_url: str = "https://api.mainnet-beta.solana.com"
    requests_per_minute: int = 100
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        self._limiter = AsyncRateLimiter(self.requests_per_minute)
        self._client: httpx.AsyncClient | None = None
        self._request_id = 0

    async def __aenter__(self) -> "SolanaSafetyClient":
        self._client = httpx.AsyncClient(timeout=self.timeout_seconds)
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @retry(
        retry=retry_if_exception(_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1.0, max=8.0),
        reraise=True,
    )
    async def _rpc(self, method: str, params: list) -> dict:
        if self._client is None:
            raise RuntimeError("client used outside 'async with' context")
        await self._limiter.acquire()
        self._request_id += 1
        body = {"jsonrpc": "2.0", "id": self._request_id, "method": method, "params": params}
        resp = await self._client.post(self.rpc_url, json=body)
        resp.raise_for_status()
        return resp.json()

    async def get_mint_info(self, mint_address: str) -> MintAuthorityInfo:
        try:
            payload = await self._rpc(
                "getAccountInfo", [mint_address, {"encoding": "jsonParsed"}]
            )
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.info("Solana RPC getAccountInfo(%s) failed: %s", mint_address, exc)
            return MintAuthorityInfo(mint_address=mint_address, parsed_ok=False)

        if payload.get("error"):
            logger.info("Solana RPC error for %s: %s", mint_address, payload["error"])
            return MintAuthorityInfo(mint_address=mint_address, parsed_ok=False)

        value = (payload.get("result") or {}).get("value")
        if not value:
            return MintAuthorityInfo(mint_address=mint_address, parsed_ok=False)

        data = value.get("data")
        if not isinstance(data, dict):
            # Not jsonParsed-able (e.g. unrecognized program) -> raw base64 data.
            return MintAuthorityInfo(mint_address=mint_address, parsed_ok=False)

        parsed = data.get("parsed") or {}
        if parsed.get("type") != "mint":
            return MintAuthorityInfo(mint_address=mint_address, parsed_ok=False)

        info = parsed.get("info") or {}
        supply_raw = info.get("supply")
        try:
            supply = int(supply_raw) if supply_raw is not None else None
        except (TypeError, ValueError):
            supply = None

        return MintAuthorityInfo(
            mint_address=mint_address,
            parsed_ok=True,
            mint_authority=info.get("mintAuthority"),
            freeze_authority=info.get("freezeAuthority"),
            decimals=info.get("decimals"),
            supply=supply,
        )
