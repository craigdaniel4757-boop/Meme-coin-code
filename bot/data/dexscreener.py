"""Async client for DexScreener's public API.

Reference: https://docs.dexscreener.com/api/reference

DexScreener does not publish a formal SLA and has changed response shapes
before, so every model field here is `Optional` (see models.py) and this
client is written to degrade gracefully: a malformed/missing field results
in `None`/empty values rather than an exception, and a single bad item in a
batch response never takes down the rest of the batch. If DexScreener
changes an endpoint path, that's a one-line fix in `_Endpoints` below.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

from bot.data.models import BoostedToken, DexPair, TokenProfile
from bot.data.rate_limiter import AsyncRateLimiter

logger = logging.getLogger(__name__)

# DexScreener accepts at most this many comma-separated token addresses per
# /latest/dex/tokens/{addresses} call.
MAX_TOKENS_PER_BATCH = 30

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class _Endpoints:
    SEARCH = "/latest/dex/search"
    TOKENS = "/latest/dex/tokens/{addresses}"
    PAIR = "/latest/dex/pairs/{chain_id}/{pair_id}"
    LATEST_PROFILES = "/token-profiles/latest/v1"
    LATEST_BOOSTS = "/token-boosts/latest/v1"
    TOP_BOOSTS = "/token-boosts/top/v1"


class DexScreenerError(Exception):
    pass


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


@dataclass
class DexScreenerClient:
    base_url: str = "https://api.dexscreener.com"
    requests_per_minute: int = 250
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        self._limiter = AsyncRateLimiter(self.requests_per_minute)
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "DexScreenerClient":
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout_seconds,
            headers={"User-Agent": "memebot/0.1 (+https://github.com)"},
        )
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @retry(
        retry=retry_if_exception(_retryable),
        stop=stop_after_attempt(4),
        wait=wait_exponential_jitter(initial=0.5, max=8.0),
        reraise=True,
    )
    async def _get(self, path: str, params: dict | None = None) -> object:
        if self._client is None:
            raise DexScreenerError("client used outside 'async with' context")
        await self._limiter.acquire()
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _extract_pairs(payload: object) -> list[dict]:
        if isinstance(payload, dict):
            pairs = payload.get("pairs")
            if pairs is None and payload.get("pair") is not None:
                pairs = [payload["pair"]]
            return pairs or []
        if isinstance(payload, list):
            return payload
        return []

    def _parse_pairs(self, payload: object) -> list[DexPair]:
        out: list[DexPair] = []
        for raw in self._extract_pairs(payload):
            try:
                out.append(DexPair.model_validate(raw))
            except Exception:  # noqa: BLE001 - one bad item shouldn't kill the batch
                logger.debug("Skipping malformed DexScreener pair payload", exc_info=True)
        return out

    async def search_pairs(self, query: str) -> list[DexPair]:
        try:
            payload = await self._get(_Endpoints.SEARCH, params={"q": query})
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.warning("DexScreener search(%r) failed: %s", query, exc)
            return []
        return self._parse_pairs(payload)

    async def get_pairs_by_token_addresses(
        self, chain_id: str, token_addresses: list[str]
    ) -> list[DexPair]:
        """Batches automatically at MAX_TOKENS_PER_BATCH. `chain_id` is used
        only to filter the (multi-chain) response, since the endpoint itself
        is not chain-scoped."""
        results: list[DexPair] = []
        for i in range(0, len(token_addresses), MAX_TOKENS_PER_BATCH):
            batch = token_addresses[i : i + MAX_TOKENS_PER_BATCH]
            path = _Endpoints.TOKENS.format(addresses=",".join(batch))
            try:
                payload = await self._get(path)
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                logger.warning("DexScreener tokens batch failed: %s", exc)
                continue
            results.extend(self._parse_pairs(payload))
        if chain_id:
            results = [p for p in results if p.chainId == chain_id]
        return results

    async def get_pair(self, chain_id: str, pair_address: str) -> DexPair | None:
        path = _Endpoints.PAIR.format(chain_id=chain_id, pair_id=pair_address)
        try:
            payload = await self._get(path)
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.warning("DexScreener get_pair(%s,%s) failed: %s", chain_id, pair_address, exc)
            return None
        pairs = self._parse_pairs(payload)
        return pairs[0] if pairs else None

    async def get_latest_token_profiles(self) -> list[TokenProfile]:
        try:
            payload = await self._get(_Endpoints.LATEST_PROFILES)
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.warning("DexScreener latest profiles failed: %s", exc)
            return []
        items = payload if isinstance(payload, list) else []
        out = []
        for raw in items:
            try:
                out.append(TokenProfile.model_validate(raw))
            except Exception:  # noqa: BLE001
                continue
        return out

    async def _get_boosts(self, path: str) -> list[BoostedToken]:
        try:
            payload = await self._get(path)
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.warning("DexScreener boosts(%s) failed: %s", path, exc)
            return []
        items = payload if isinstance(payload, list) else []
        out = []
        for raw in items:
            try:
                out.append(BoostedToken.model_validate(raw))
            except Exception:  # noqa: BLE001
                continue
        return out

    async def get_latest_boosted_tokens(self) -> list[BoostedToken]:
        return await self._get_boosts(_Endpoints.LATEST_BOOSTS)

    async def get_top_boosted_tokens(self) -> list[BoostedToken]:
        return await self._get_boosts(_Endpoints.TOP_BOOSTS)
