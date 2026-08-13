"""On-chain safety checks for Solana SPL token mints via JSON-RPC.

The single highest-signal rug-pull check available for a brand-new Solana
meme coin is whether the deployer retained *mint authority* (can print
unlimited new supply) or *freeze authority* (can freeze your token account
so you can never sell) on the token's mint account. Both are queryable from
any public Solana RPC endpoint with no API key, via `getAccountInfo` +
`jsonParsed` encoding, which the SPL Token program (and Token-2022) natively
supports.

This module also checks holder concentration via `getTokenLargestAccounts`
-- another standard, keyless Solana RPC method that works identically for
any SPL token regardless of which DEX/AMM it trades on (unlike verifying
*which* pool holds the liquidity or whether its LP tokens are locked,
which needs decoding each AMM program's own account layout and isn't
attempted here -- see bot/analysis/liquidity_guard.py for how this
project substitutes a liquidity-drawdown check for that instead).

This module fails *safe*: if an RPC call fails, or an account can't be
parsed as expected, callers get `parsed_ok=False` / `fetched_ok=False`
rather than a guessed answer, and `safety_filters.py` treats "unknown" as
a failing check (when the check was actually requested) rather than
assuming the token is safe.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

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


@dataclass(slots=True)
class HolderAccount:
    address: str
    ui_amount: float


@dataclass(slots=True)
class HolderConcentration:
    mint_address: str
    fetched_ok: bool
    top_holders: list[HolderAccount] = field(default_factory=list)
    total_supply_ui: float | None = None

    @property
    def top_holders_excluding_largest_pct(self) -> float | None:
        """% of total supply held by the largest holders *after* excluding
        the single biggest one. For a freshly launched pool, the #1 holder
        by raw balance is almost always the AMM's own liquidity vault --
        the pool is supposed to hold a big share of supply, that's what
        liquidity means -- so including it would flag every healthy pool
        as "dangerously concentrated." This is a heuristic, not a
        guarantee: it can occasionally exclude a genuine large individual
        holder if they happen to hold more than the pool itself. See
        docs/STRATEGY.md.
        """
        if not self.fetched_ok or not self.total_supply_ui or self.total_supply_ui <= 0:
            return None
        if not self.top_holders:
            return None
        ranked = sorted(self.top_holders, key=lambda h: h.ui_amount, reverse=True)
        rest = ranked[1:]
        return sum(h.ui_amount for h in rest) / self.total_supply_ui * 100


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

    async def get_holder_concentration(self, mint_address: str) -> HolderConcentration:
        try:
            largest = await self._rpc("getTokenLargestAccounts", [mint_address])
            supply = await self._rpc("getTokenSupply", [mint_address])
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.info("Solana RPC holder lookup failed for %s: %s", mint_address, exc)
            return HolderConcentration(mint_address=mint_address, fetched_ok=False)

        if largest.get("error") or supply.get("error"):
            logger.info(
                "Solana RPC error fetching holders for %s: %s",
                mint_address, largest.get("error") or supply.get("error"),
            )
            return HolderConcentration(mint_address=mint_address, fetched_ok=False)

        try:
            raw_holders = (largest.get("result") or {}).get("value") or []
            holders = [
                HolderAccount(address=h["address"], ui_amount=float(h.get("uiAmount") or 0.0))
                for h in raw_holders
                if h.get("address")
            ]
            total_supply_ui = float((supply.get("result") or {}).get("value", {}).get("uiAmount") or 0.0)
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            # AttributeError included alongside the more obvious KeyError/
            # TypeError/ValueError: a malformed-but-200-status payload (e.g.
            # "value" coming back as a string or a list of non-dict items)
            # calls `.get()` on something that isn't a dict, which raises
            # AttributeError rather than one of the "expected" exceptions --
            # still just an unparseable response, not something that should
            # crash the scan cycle.
            logger.info("Could not parse holder data for %s: %s", mint_address, exc)
            return HolderConcentration(mint_address=mint_address, fetched_ok=False)

        return HolderConcentration(
            mint_address=mint_address,
            fetched_ok=True,
            top_holders=holders,
            total_supply_ui=total_supply_ui,
        )
