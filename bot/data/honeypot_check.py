"""Pre-trade sellability ("honeypot") check via Jupiter's free, keyless
swap-routing quote API.

Confirms a token can actually be quoted for a sell back to USDC *before*
ever buying it. If Jupiter can't find any route to sell it -- no
liquidity path, transfer restrictions, an extreme tax that eats the
entire trade -- that's a strong, direct signal the token may be a
honeypot, independent of anything DexScreener's own stats show (a
honeypot can have perfectly normal-looking price/volume/liquidity numbers
right up until you try to sell). This only ever requests a *quote* -- a
hypothetical price, no transaction built or signed -- so it works
identically in paper mode and needs no wallet or private key. Solana only,
since Jupiter is a Solana-specific aggregator.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential_jitter

from bot.data.rate_limiter import AsyncRateLimiter

logger = logging.getLogger(__name__)

JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

# Deliberately excludes 429 -- same reasoning as bot/data/geckoterminal.py:
# retrying a rate-limit rejection within a few seconds rarely helps and
# just spends more of an already-exhausted budget.
_RETRYABLE_STATUS = {500, 502, 503, 504}


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


@dataclass(slots=True)
class SellCheckResult:
    checked: bool  # False if the check itself could not be completed (e.g. Jupiter unreachable)
    can_sell: bool
    price_impact_pct: float | None = None
    reason: str = ""


@dataclass
class HoneypotCheckClient:
    base_url: str = "https://quote-api.jup.ag/v6"
    requests_per_minute: int = 30
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        self._limiter = AsyncRateLimiter(self.requests_per_minute)
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "HoneypotCheckClient":
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_seconds)
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
    async def _get_quote(self, input_mint: str, output_mint: str, amount: int) -> dict:
        if self._client is None:
            raise RuntimeError("client used outside 'async with' context")
        await self._limiter.acquire()
        resp = await self._client.get(
            "/quote",
            params={"inputMint": input_mint, "outputMint": output_mint, "amount": amount, "slippageBps": 500},
        )
        resp.raise_for_status()
        return resp.json()

    async def check_sellable(
        self, token_mint: str, token_decimals: int, probe_ui_amount: float = 1.0
    ) -> SellCheckResult:
        """Ask Jupiter for a quote selling `probe_ui_amount` of the token
        back to USDC. `probe_ui_amount` should be a small, plausible
        holding size for the token in question -- not the actual position
        size, which isn't known yet at this point in the pipeline."""
        amount_raw = int(probe_ui_amount * 10**token_decimals)
        if amount_raw <= 0:
            return SellCheckResult(checked=False, can_sell=False, reason="probe amount rounds to zero, skipped")

        try:
            quote = await self._get_quote(token_mint, USDC_MINT, amount_raw)
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            logger.info("Jupiter sell-quote unavailable for %s: %s", token_mint, exc)
            return SellCheckResult(checked=False, can_sell=False, reason=f"quote unavailable ({exc})")

        out_amount = quote.get("outAmount")
        try:
            out_amount_int = int(out_amount) if out_amount is not None else 0
        except (TypeError, ValueError):
            out_amount_int = 0

        if out_amount_int <= 0:
            return SellCheckResult(checked=True, can_sell=False, reason="no sell route found")

        price_impact_pct = None
        raw_impact = quote.get("priceImpactPct")
        if raw_impact is not None:
            try:
                price_impact_pct = float(raw_impact) * 100
            except (TypeError, ValueError):
                price_impact_pct = None

        return SellCheckResult(checked=True, can_sell=True, price_impact_pct=price_impact_pct)
