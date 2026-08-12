"""Live execution: real on-chain swaps on Solana, routed through the
Jupiter aggregator. This path is opt-in and off by default. To enable it:

  1. `pip install -r requirements-live.txt`
  2. set `execution.mode: "live"` in your config
  3. set `SOLANA_PRIVATE_KEY` (base58) in the environment
  4. run with the CLI's `--i-understand-the-risk` flag

All trades are quoted and settled in USDC for simplicity: `notional_usd`
is spent as USDC-in on buys and received as USDC-out on sells, regardless
of which token the pair is actually pooled against on-chain -- Jupiter's
routing handles that internally. This means the wallet needs to hold USDC
for trading capital *and* a small amount of native SOL to pay network and
priority fees, since fees are always paid in SOL and are not deducted from
`notional_usd`/tracked in the USD P&L here.

The private key is read once from the environment and used only to sign
transactions locally with `solders`; it is never sent anywhere, and
Jupiter's API only ever returns an *unsigned* transaction for us to sign.

This module has not been exercised against real funds by its authors. Read
it before trusting it, start with a trivially small bankroll, and watch
your first several trades closely. Fill prices/quantities are derived from
Jupiter's quote response (`outAmount`), not from an independent on-chain
balance check, so treat recorded fills as a close estimate rather than a
certified reconciliation -- for anything that matters, verify against a
block explorer.
"""

from __future__ import annotations

import base64
import logging
import os
import time

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential_jitter

from bot.data.models import Position, Trade
from bot.data.solana_safety import SolanaSafetyClient
from bot.execution.base import ExecutionProvider
from bot.execution.portfolio import Portfolio, position_to_row, trade_to_row
from bot.storage.db import Database
from bot.strategy.risk_manager import RiskConfig, create_position

logger = logging.getLogger(__name__)

USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
USDC_DECIMALS = 6

JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote"
JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap"

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_CONFIRM_POLL_ATTEMPTS = 20
_CONFIRM_POLL_INTERVAL_SECONDS = 1.5


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


class LiveTradingError(Exception):
    pass


def _load_keypair():
    try:
        import base58
        from solders.keypair import Keypair
    except ImportError as exc:
        raise LiveTradingError(
            "Live trading needs the optional dependencies in requirements-live.txt: "
            "run `pip install -r requirements-live.txt`."
        ) from exc

    raw = os.environ.get("SOLANA_PRIVATE_KEY", "").strip()
    if not raw:
        raise LiveTradingError("SOLANA_PRIVATE_KEY is not set -- refusing to start live trading.")
    try:
        secret = base58.b58decode(raw)
        return Keypair.from_bytes(secret)
    except Exception as exc:  # noqa: BLE001
        raise LiveTradingError("Could not decode SOLANA_PRIVATE_KEY as a base58 secret key.") from exc


class JupiterLiveExecutionProvider(ExecutionProvider):
    """Solana-only. The scanner must not route non-Solana candidates here."""

    def __init__(
        self,
        db: Database,
        rpc_url: str,
        starting_bankroll_usd: float,
        max_slippage_bps: int = 150,
        priority_fee_lamports: int = 200_000,
    ) -> None:
        self.db = db
        self.rpc_url = rpc_url
        self.max_slippage_bps = max_slippage_bps
        self.priority_fee_lamports = priority_fee_lamports
        self.keypair = _load_keypair()
        self.portfolio = Portfolio(cash_usd=starting_bankroll_usd, mode="live")
        self._decimals_cache: dict[str, int] = {USDC_MINT: USDC_DECIMALS}
        self._http = httpx.AsyncClient(timeout=20.0)
        logger.warning(
            "LIVE TRADING ENABLED for wallet %s -- real funds will be used for real swaps.",
            str(self.keypair.pubkey()),
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    # -- Jupiter + RPC plumbing -------------------------------------------------

    @retry(
        retry=retry_if_exception(_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1, max=8),
        reraise=True,
    )
    async def _get_quote(self, input_mint: str, output_mint: str, amount: int) -> dict:
        resp = await self._http.get(
            JUPITER_QUOTE_URL,
            params={
                "inputMint": input_mint,
                "outputMint": output_mint,
                "amount": amount,
                "slippageBps": self.max_slippage_bps,
            },
        )
        resp.raise_for_status()
        return resp.json()

    @retry(
        retry=retry_if_exception(_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1, max=8),
        reraise=True,
    )
    async def _get_swap_transaction(self, quote: dict) -> str:
        resp = await self._http.post(
            JUPITER_SWAP_URL,
            json={
                "quoteResponse": quote,
                "userPublicKey": str(self.keypair.pubkey()),
                "wrapAndUnwrapSol": True,
                "prioritizationFeeLamports": self.priority_fee_lamports,
            },
        )
        resp.raise_for_status()
        return resp.json()["swapTransaction"]

    def _sign_transaction(self, swap_transaction_b64: str):
        from solders.transaction import VersionedTransaction

        raw = base64.b64decode(swap_transaction_b64)
        unsigned = VersionedTransaction.from_bytes(raw)
        return VersionedTransaction(unsigned.message, [self.keypair])

    async def _send_and_confirm(self, signed_tx) -> str:
        raw_b64 = base64.b64encode(bytes(signed_tx)).decode("ascii")
        resp = await self._http.post(
            self.rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "sendTransaction",
                "params": [raw_b64, {"encoding": "base64", "skipPreflight": False, "maxRetries": 3}],
            },
        )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("error"):
            raise LiveTradingError(f"sendTransaction failed: {payload['error']}")
        signature = payload["result"]

        for _ in range(_CONFIRM_POLL_ATTEMPTS):
            status_resp = await self._http.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignatureStatuses",
                    "params": [[signature], {"searchTransactionHistory": True}],
                },
            )
            status_resp.raise_for_status()
            values = status_resp.json().get("result", {}).get("value") or [None]
            status = values[0]
            if status is not None:
                if status.get("err"):
                    raise LiveTradingError(f"transaction {signature} failed on-chain: {status['err']}")
                if status.get("confirmationStatus") in ("confirmed", "finalized"):
                    return signature
            time.sleep(_CONFIRM_POLL_INTERVAL_SECONDS)

        raise LiveTradingError(f"transaction {signature} was not confirmed within the timeout")

    async def _get_mint_decimals(self, mint_address: str) -> int:
        if mint_address in self._decimals_cache:
            return self._decimals_cache[mint_address]
        async with SolanaSafetyClient(rpc_url=self.rpc_url) as client:
            info = await client.get_mint_info(mint_address)
        decimals = info.decimals if info.parsed_ok and info.decimals is not None else 9
        self._decimals_cache[mint_address] = decimals
        return decimals

    # -- ExecutionProvider interface --------------------------------------------

    async def buy(
        self,
        chain_id: str,
        pair_address: str,
        base_token_address: str,
        symbol: str,
        notional_usd: float,
        quote_price: float,
        strategy_name: str,
        risk_cfg: RiskConfig,
    ) -> Position | None:
        if chain_id != "solana":
            logger.warning("Live execution only supports Solana right now; skipping %s on %s", symbol, chain_id)
            return None
        if notional_usd <= 0 or quote_price <= 0 or not base_token_address:
            return None

        amount_in = int(round(notional_usd * 10**USDC_DECIMALS))
        if amount_in <= 0:
            return None

        try:
            quote = await self._get_quote(USDC_MINT, base_token_address, amount_in)
            token_decimals = await self._get_mint_decimals(base_token_address)
            swap_tx_b64 = await self._get_swap_transaction(quote)
            signed = self._sign_transaction(swap_tx_b64)
            signature = await self._send_and_confirm(signed)
        except (httpx.TransportError, httpx.HTTPStatusError, LiveTradingError) as exc:
            logger.error("Live BUY failed for %s: %s", symbol, exc)
            return None

        out_amount_raw = int(quote.get("outAmount", 0))
        quantity = out_amount_raw / (10**token_decimals)
        if quantity <= 0:
            logger.error("Live BUY for %s produced zero quantity from the quote; not recording a position", symbol)
            return None
        fill_price = notional_usd / quantity

        position = create_position(
            chain_id, pair_address, base_token_address, symbol, fill_price, quantity, strategy_name, risk_cfg
        )
        trade = self.portfolio.apply_buy(position, cost_usd=notional_usd, fee_usd=0.0)
        trade.reason = f"entry ({strategy_name}) tx={signature}"
        self.db.upsert_position(position_to_row(position))
        self.db.insert_trade(trade_to_row(trade, mode="live"))
        logger.warning(
            "[LIVE] BUY %s: %.6g units @ ~$%.8g ($%.2f notional) tx=%s",
            symbol, quantity, fill_price, notional_usd, signature,
        )
        return position

    async def sell(self, position: Position, fraction: float, quote_price: float, reason: str) -> Trade | None:
        fraction = min(fraction, position.remaining_fraction)
        if fraction <= 0:
            return None
        if not position.base_token_address:
            logger.error(
                "Position %s (%s) has no recorded base token mint; cannot sell live", position.id, position.symbol
            )
            return None

        qty_to_sell = position.quantity * fraction
        try:
            token_decimals = await self._get_mint_decimals(position.base_token_address)
            amount_in = int(round(qty_to_sell * 10**token_decimals))
            if amount_in <= 0:
                return None
            quote = await self._get_quote(position.base_token_address, USDC_MINT, amount_in)
            swap_tx_b64 = await self._get_swap_transaction(quote)
            signed = self._sign_transaction(swap_tx_b64)
            signature = await self._send_and_confirm(signed)
        except (httpx.TransportError, httpx.HTTPStatusError, LiveTradingError) as exc:
            logger.error("Live SELL failed for %s: %s", position.symbol, exc)
            return None

        usdc_out = int(quote.get("outAmount", 0)) / (10**USDC_DECIMALS)
        fill_price = usdc_out / qty_to_sell if qty_to_sell else 0.0

        trade = self.portfolio.apply_sell(position, fraction, fill_price, fee_usd=0.0, reason=f"{reason} tx={signature}")
        self.db.upsert_position(position_to_row(position))
        self.db.insert_trade(trade_to_row(trade, mode="live"))
        logger.warning(
            "[LIVE] SELL %s: %.6g units @ ~$%.8g (%s) tx=%s",
            position.symbol, trade.quantity, fill_price, reason, signature,
        )
        return trade

    def get_bankroll_usd(self) -> float:
        return self.portfolio.cash_usd

    def get_open_positions(self) -> list[Position]:
        return list(self.portfolio.positions.values())

    def get_daily_realized_pnl_usd(self, since_ts: float) -> float:
        return self.portfolio.daily_realized_pnl(since_ts)
