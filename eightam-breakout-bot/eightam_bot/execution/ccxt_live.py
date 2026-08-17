"""Live execution via ccxt -- opt-in, and off unless `execution.mode:
"live"` in config AND `--i-understand-the-risk` is passed on the CLI (see
cli.py). Read docs/RISK_DISCLAIMER.md before ever using this.

Every fill here is a MARKET order placed the moment the bot's own candle
polling detects the condition strategy.py already computed (retest touch,
stop/target/force-close) -- there is no resting exchange-side limit order
for the entry or take-profit the way paper mode idealizes. That's a
deliberate simplicity/robustness tradeoff: an unattended resting limit order
that would need to be tracked, potentially partially filled, and cancelled
on a setup timing out is a meaningfully bigger and riskier surface than
"detect the condition, then market-fill immediately" -- at the cost of real
slippage paper mode's numbers don't reflect. Expect live results to run
somewhat worse than a backtest or paper session, especially given this
bot's 1-minute polling granularity. This code path has not been exercised
against real funds by its authors; verify its behavior yourself, in small
size, before trusting it further.

Shorting requires `execution.live.market_type` to be `"swap"` or `"future"`
with an exchange/account actually configured for margin trading -- most
exchanges cannot sell short on a plain spot market. See the README's Live
trading section.
"""

from __future__ import annotations

import logging

from eightam_bot.execution.base import ExecutionProvider
from eightam_bot.journal import TradeJournal
from eightam_bot.models import Bias, Trade

logger = logging.getLogger(__name__)


class LiveTradingError(RuntimeError):
    pass


class CcxtLiveExecutionProvider(ExecutionProvider):
    def __init__(
        self,
        exchange_id: str,
        credentials: dict[str, str | None],
        journal: TradeJournal,
        market_type: str = "spot",
        max_slippage_bps: float = 30.0,
    ) -> None:
        if not credentials.get("apiKey") or not credentials.get("secret"):
            raise LiveTradingError(
                "execution.mode is 'live' but EXCHANGE_API_KEY/EXCHANGE_API_SECRET are not set -- see .env.example"
            )

        import ccxt.async_support as ccxt_async

        exchange_cls = getattr(ccxt_async, exchange_id, None)
        if exchange_cls is None:
            raise LiveTradingError(f"Unknown ccxt exchange id: {exchange_id!r}")

        config = {
            "enableRateLimit": True,
            "options": {"defaultType": market_type},
            **{k: v for k, v in credentials.items() if v},
        }
        self.exchange = exchange_cls(config)
        self.market_type = market_type
        self.max_slippage_bps = max_slippage_bps
        self.journal = journal
        self._bankroll_cache: float | None = None

    async def _market_order(self, symbol: str, side: str, quantity: float) -> tuple[float, float]:
        """Places a market order and returns (avg_fill_price, fee_usd)."""
        order = await self.exchange.create_order(symbol, "market", side, quantity)
        avg_price = order.get("average") or order.get("price")
        if not avg_price:
            trades = order.get("trades") or []
            filled = sum(t["amount"] for t in trades)
            if trades and filled:
                avg_price = sum(t["price"] * t["amount"] for t in trades) / filled
        if not avg_price:
            raise LiveTradingError(f"Could not determine a fill price for order {order.get('id')} on {symbol}")

        # Fee currency assumption: this treats the reported fee cost as
        # already USD-equivalent, which holds for USD-stablecoin-quoted
        # pairs (the common case) but not for e.g. a BTC/ETH pair whose fee
        # is charged in ETH -- adapt this if you trade non-stablecoin quotes.
        fee = order.get("fee") or {}
        fee_usd = float(fee.get("cost") or 0.0)
        return float(avg_price), fee_usd

    async def enter(self, trade: Trade) -> Trade:
        side = "buy" if trade.bias is Bias.LONG else "sell"
        fill_price, fee_usd = await self._market_order(trade.symbol, side, trade.quantity)

        slippage_bps = abs(fill_price - trade.entry_price) / trade.entry_price * 10_000
        if slippage_bps > self.max_slippage_bps:
            logger.warning(
                "%s entry filled %.1fbps away from the ideal midpoint (configured limit %.1fbps) -- "
                "accepted since the order was already filled; consider a tighter `execution.live.max_slippage_bps` "
                "or lower `market.candle_timeframe` if this recurs often",
                trade.symbol, slippage_bps, self.max_slippage_bps,
            )

        trade.entry_price = fill_price
        trade.fee_usd += fee_usd
        logger.info(
            "[LIVE] ENTER %s %s: %.6g units @ $%.6g", trade.bias.value.upper(), trade.symbol, trade.quantity, fill_price
        )
        return trade

    async def exit(self, trade: Trade) -> Trade:
        assert trade.exit_price is not None, "strategy.py must set exit_price before execution.exit() is called"
        side = "sell" if trade.bias is Bias.LONG else "buy"
        fill_price, fee_usd = await self._market_order(trade.symbol, side, trade.quantity)

        trade.exit_price = fill_price
        trade.fee_usd += fee_usd
        pnl_per_unit = (fill_price - trade.entry_price) if trade.bias is Bias.LONG else (trade.entry_price - fill_price)
        trade.realized_pnl_usd = pnl_per_unit * trade.quantity - trade.fee_usd

        self.journal.record_trade(trade)
        logger.info(
            "[LIVE] EXIT %s %s: %s @ $%.6g -- realized PnL $%.2f (%.2fR)",
            trade.bias.value.upper(), trade.symbol, trade.exit_reason, fill_price,
            trade.realized_pnl_usd, trade.r_multiple or 0.0,
        )
        return trade

    def get_bankroll_usd(self) -> float:
        if self._bankroll_cache is None:
            raise LiveTradingError("Bankroll not yet fetched -- call refresh_bankroll() at least once after connecting")
        return self._bankroll_cache

    async def refresh_bankroll(self, quote_currency: str = "USDT") -> float:
        """The live runner calls this once per polling cycle, before sizing
        any new entry, so `get_bankroll_usd()` reflects real available
        balance rather than a stale snapshot from connection time."""
        balance = await self.exchange.fetch_balance()
        free = (balance.get(quote_currency) or {}).get("free")
        self._bankroll_cache = float(free or 0.0)
        return self._bankroll_cache

    def get_daily_realized_pnl_usd(self, since_ts: float) -> float:
        return self.journal.realized_pnl_since(since_ts)

    async def close(self) -> None:
        await self.exchange.close()
