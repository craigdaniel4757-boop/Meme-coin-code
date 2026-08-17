"""Historical + live OHLCV access.

Two implementations: `CCXTDataFeed` (any ccxt-supported exchange -- crypto
only, but works identically for historical backtesting and live/paper
polling with no separate data vendor needed) and `CSVDataFeed` (a local
OHLCV file). CSV is the only way to backtest this strategy against the
*exact* instrument the source video trades -- index futures -- since ccxt
only covers crypto exchanges. Both return the same `Candle` objects so the
strategy engine and backtester never need to know which one supplied them.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from eightam_bot.models import Candle

OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


class DataFeed(ABC):
    @abstractmethod
    async def fetch_recent_candles(self, symbol: str, timeframe: str, limit: int) -> list[Candle]:
        """The most recent `limit` candles, oldest first -- used by the
        live/paper runner's polling loop."""

    @abstractmethod
    async def fetch_historical_candles(
        self, symbol: str, timeframe: str, since_ts: int, until_ts: int
    ) -> list[Candle]:
        """Every candle from `since_ts` to `until_ts` (unix seconds, UTC),
        oldest first -- used by the backtester."""

    async def close(self) -> None:
        """Release any underlying connection. No-op unless overridden."""


def _row_to_candle(ts_ms: float, o: float, hi: float, lo: float, c: float, v: float) -> Candle:
    return Candle(
        timestamp=int(ts_ms) // 1000, open=float(o), high=float(hi), low=float(lo), close=float(c),
        volume=float(v or 0.0),
    )


class CCXTDataFeed(DataFeed):
    def __init__(
        self,
        exchange_id: str,
        api_key: str | None = None,
        api_secret: str | None = None,
        api_passphrase: str | None = None,
        market_type: str = "spot",
        max_candles_per_request: int = 1000,
    ) -> None:
        # Imported lazily so unit tests / pure-strategy usage of this package
        # never need ccxt installed just to import the module.
        import ccxt.async_support as ccxt_async

        exchange_cls = getattr(ccxt_async, exchange_id, None)
        if exchange_cls is None:
            raise ValueError(f"Unknown ccxt exchange id: {exchange_id!r}")

        config: dict = {"enableRateLimit": True, "options": {"defaultType": market_type}}
        if api_key:
            config["apiKey"] = api_key
        if api_secret:
            config["secret"] = api_secret
        if api_passphrase:
            config["password"] = api_passphrase

        self.exchange = exchange_cls(config)
        self.max_candles_per_request = max_candles_per_request

    async def fetch_recent_candles(self, symbol: str, timeframe: str, limit: int) -> list[Candle]:
        raw = await self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        return [_row_to_candle(*row) for row in raw]

    async def fetch_historical_candles(
        self, symbol: str, timeframe: str, since_ts: int, until_ts: int
    ) -> list[Candle]:
        """Paginates `fetch_ohlcv` forward from `since_ts` until `until_ts`
        is reached or the exchange stops returning new bars. ccxt's own
        rate limiter (`enableRateLimit`) paces the requests -- no manual
        throttling needed here."""
        candles: list[Candle] = []
        since_ms = since_ts * 1000
        until_ms = until_ts * 1000
        seen_ts: set[int] = set()

        while since_ms < until_ms:
            batch = await self.exchange.fetch_ohlcv(
                symbol, timeframe=timeframe, since=since_ms, limit=self.max_candles_per_request
            )
            if not batch:
                break

            new_count = 0
            for row in batch:
                candle = _row_to_candle(*row)
                if candle.timestamp * 1000 > until_ms:
                    break
                if candle.timestamp not in seen_ts:
                    seen_ts.add(candle.timestamp)
                    candles.append(candle)
                    new_count += 1
            if new_count == 0:
                break

            since_ms = int(batch[-1][0]) + 1
            if len(batch) < self.max_candles_per_request:
                break

        candles.sort(key=lambda c: c.timestamp)
        return candles

    async def close(self) -> None:
        await self.exchange.close()


class CSVDataFeed(DataFeed):
    """Loads OHLCV from a local CSV (columns: timestamp,open,high,low,close,
    volume -- timestamp in unix seconds, UTC). See config/default.yaml's
    `data.csv_paths`.
    """

    def __init__(self, path: str) -> None:
        df = pd.read_csv(path)
        missing = [c for c in OHLCV_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"{path}: missing required column(s) {missing}")
        df = df.sort_values("timestamp").reset_index(drop=True)
        self._candles = [
            Candle(
                timestamp=int(row.timestamp), open=float(row.open), high=float(row.high),
                low=float(row.low), close=float(row.close), volume=float(row.volume),
            )
            for row in df.itertuples(index=False)
        ]

    async def fetch_recent_candles(self, symbol: str, timeframe: str, limit: int) -> list[Candle]:
        return self._candles[-limit:]

    async def fetch_historical_candles(
        self, symbol: str, timeframe: str, since_ts: int, until_ts: int
    ) -> list[Candle]:
        return [c for c in self._candles if since_ts <= c.timestamp <= until_ts]
