"""Async client for GeckoTerminal's public OHLCV API.

DexScreener does not expose historical candle data through its public API
(only rolling aggregate stats like 24h volume / price change), so real
technical analysis needs a second source of actual OHLCV bars. GeckoTerminal
covers the same pools (same on-chain pool/pair address) DexScreener does and
offers free, keyless OHLCV history at minute/hour/day granularity.

Reference: https://apiguide.geckoterminal.com/

This is intentionally a secondary, best-effort source: if a pool is too new
to exist on GeckoTerminal yet, or the request fails, callers fall back to
locally resampled ticks (see bot/data/candles.py). Nothing else in the bot
depends on GeckoTerminal being reachable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential_jitter

from bot.data.models import Candle
from bot.data.rate_limiter import AsyncRateLimiter

logger = logging.getLogger(__name__)

# DexScreener chainId -> GeckoTerminal network id. GeckoTerminal's ids don't
# always match DexScreener's (notably "ethereum" -> "eth"). Extend this map
# as needed; an unmapped chain simply skips GeckoTerminal enrichment.
CHAIN_ID_MAP: dict[str, str] = {
    "solana": "solana",
    "ethereum": "eth",
    "bsc": "bsc",
    "base": "base",
    "polygon": "polygon_pos",
    "arbitrum": "arbitrum",
    "avalanche": "avax",
    "optimism": "optimism",
}

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# (timeframe, max_aggregate_options) supported by the GeckoTerminal OHLCV endpoint.
_TIMEFRAME_AGGREGATES: list[tuple[str, int]] = [
    ("minute", 1),
    ("minute", 5),
    ("minute", 15),
    ("hour", 1),
    ("hour", 4),
    ("hour", 12),
    ("day", 1),
]


def pick_timeframe(interval_seconds: int) -> tuple[str, int]:
    """Pick the (timeframe, aggregate) pair whose duration is closest to
    the requested interval, without exceeding it by too much."""
    target = max(interval_seconds, 60)
    best = _TIMEFRAME_AGGREGATES[0]
    best_diff = float("inf")
    for timeframe, aggregate in _TIMEFRAME_AGGREGATES:
        seconds = aggregate * {"minute": 60, "hour": 3600, "day": 86400}[timeframe]
        diff = abs(seconds - target)
        if diff < best_diff:
            best_diff = diff
            best = (timeframe, aggregate)
    return best


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


@dataclass
class GeckoTerminalClient:
    base_url: str = "https://api.geckoterminal.com/api/v2"
    requests_per_minute: int = 28
    timeout_seconds: float = 10.0
    api_key: str | None = None

    def __post_init__(self) -> None:
        self._limiter = AsyncRateLimiter(self.requests_per_minute)
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GeckoTerminalClient":
        headers = {"Accept": "application/json;version=20230302"}
        if self.api_key:
            headers["x-cg-pro-api-key"] = self.api_key
        self._client = httpx.AsyncClient(
            base_url=self.base_url, timeout=self.timeout_seconds, headers=headers
        )
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def network_for_chain(chain_id: str) -> str | None:
        return CHAIN_ID_MAP.get(chain_id)

    @retry(
        retry=retry_if_exception(_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1.0, max=10.0),
        reraise=True,
    )
    async def _get(self, path: str, params: dict | None = None) -> dict:
        if self._client is None:
            raise RuntimeError("client used outside 'async with' context")
        await self._limiter.acquire()
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_ohlcv(
        self,
        chain_id: str,
        pool_address: str,
        interval_seconds: int,
        limit: int = 300,
    ) -> list[Candle]:
        network = self.network_for_chain(chain_id)
        if not network:
            return []
        timeframe, aggregate = pick_timeframe(interval_seconds)
        path = f"/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}"
        try:
            payload = await self._get(
                path,
                params={"aggregate": aggregate, "limit": min(max(limit, 1), 1000), "currency": "usd"},
            )
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.info("GeckoTerminal OHLCV unavailable for %s:%s (%s)", chain_id, pool_address, exc)
            return []

        try:
            rows = payload["data"]["attributes"]["ohlcv_list"]
        except (KeyError, TypeError):
            return []

        candles: list[Candle] = []
        for row in rows:
            try:
                ts, o, h, l, c, v = row  # noqa: E741
                candles.append(
                    Candle(
                        timestamp=int(ts),
                        open=float(o),
                        high=float(h),
                        low=float(l),
                        close=float(c),
                        volume=float(v),
                    )
                )
            except (ValueError, TypeError):
                continue
        candles.sort(key=lambda c: c.timestamp)
        return candles
