"""Historical + live OHLCV access.

Three implementations, all returning the same `Candle` objects so the
strategy engine and backtester never need to know which one supplied them:

- `CCXTDataFeed` -- any ccxt-supported exchange. Crypto only, but works
  identically for historical backtesting and live/paper polling, and is
  the only feed with any order-execution counterpart (see execution/).
- `CSVDataFeed` -- a local OHLCV file, for backtesting against data ccxt
  can't provide at all (e.g. the source video's actual futures instrument).
- `YFinanceDataFeed` -- free historical stock/ETF data via Yahoo Finance,
  for backtesting equities (e.g. a bank stock like Royal Bank of Canada,
  ticker RY on NYSE) that no crypto exchange lists. Read-only: there is no
  order-placement capability behind it at all, so it only ever makes sense
  for `backtest`/`train-filter`, never `paper`/`live` -- see cli.py's guard.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone

import pandas as pd

from eightam_bot.models import Candle

logger = logging.getLogger(__name__)

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


def _yf_frame_to_candles(df: pd.DataFrame) -> list[Candle]:
    if df is None or df.empty:
        return []
    return [
        Candle(
            timestamp=int(idx.timestamp()), open=float(row["Open"]), high=float(row["High"]),
            low=float(row["Low"]), close=float(row["Close"]), volume=float(row.get("Volume", 0.0) or 0.0),
        )
        for idx, row in df.iterrows()
    ]


class YFinanceDataFeed(DataFeed):
    """Free stock/ETF OHLCV via Yahoo Finance (the `yfinance` package) --
    read-only, backtest-only (see the module docstring). Two limits that
    matter in practice:

    - Yahoo's free 1-minute data only goes back ~30 days, and any single
      request window is capped at 7 days -- `fetch_historical_candles`
      chunks into `CHUNK_DAYS` windows and stitches them together, but
      still can't reach further back than `MAX_1M_HISTORY_DAYS` on a
      1-minute timeframe no matter how far back `since_ts` asks for. Use a
      coarser `market.candle_timeframe` (5m/15m/1h/1d all have much longer
      available history) if you need more than a month.
    - `prepost=True` is not optional: the strategy's 8:00-8:15am range
      falls entirely in the pre-market session (the regular session starts
      9:30am), so without it Yahoo would return zero candles for that
      window and every single day would silently look like "no range
      formed" -- not a real absence of a setup, just missing data.
    """

    MAX_1M_HISTORY_DAYS = 30
    CHUNK_DAYS = 7

    def __init__(self, request_delay_seconds: float = 0.5) -> None:
        # Imported lazily so the rest of this package works without
        # yfinance installed unless this feed is actually used.
        import yfinance as yf

        self._yf = yf
        self.request_delay_seconds = request_delay_seconds

    async def fetch_recent_candles(self, symbol: str, timeframe: str, limit: int) -> list[Candle]:
        ticker = self._yf.Ticker(symbol)
        df = await asyncio.to_thread(ticker.history, period="5d", interval=timeframe, prepost=True)
        return _yf_frame_to_candles(df)[-limit:]

    async def fetch_historical_candles(
        self, symbol: str, timeframe: str, since_ts: int, until_ts: int
    ) -> list[Candle]:
        ticker = self._yf.Ticker(symbol)

        if timeframe != "1m":
            # The 7-day-per-request cap (below) is specific to 1-minute
            # data -- coarser intervals support much longer single-request
            # ranges on Yahoo's side, so there's no reason to chunk them at
            # all; doing so would just fire off dozens of mostly-empty
            # requests for, say, a year of daily bars.
            df = await asyncio.to_thread(
                ticker.history,
                start=datetime.fromtimestamp(since_ts, tz=timezone.utc),
                end=datetime.fromtimestamp(until_ts, tz=timezone.utc),
                interval=timeframe,
                prepost=True,
            )
            return _yf_frame_to_candles(df)

        earliest_available = int(time.time()) - self.MAX_1M_HISTORY_DAYS * 86400
        if since_ts < earliest_available:
            logger.warning(
                "%s: requested history from %s, but Yahoo Finance only keeps about %d days of "
                "1-minute data -- starting from %s instead. Use a coarser market.candle_timeframe "
                "for a longer backtest window.",
                symbol,
                datetime.fromtimestamp(since_ts, tz=timezone.utc).date(),
                self.MAX_1M_HISTORY_DAYS,
                datetime.fromtimestamp(earliest_available, tz=timezone.utc).date(),
            )
            since_ts = earliest_available

        chunk_seconds = self.CHUNK_DAYS * 86400
        all_candles: list[Candle] = []
        seen_ts: set[int] = set()
        chunk_start = since_ts

        while chunk_start < until_ts:
            chunk_end = min(chunk_start + chunk_seconds, until_ts)
            df = await asyncio.to_thread(
                ticker.history,
                start=datetime.fromtimestamp(chunk_start, tz=timezone.utc),
                end=datetime.fromtimestamp(chunk_end, tz=timezone.utc),
                interval=timeframe,
                prepost=True,
            )
            for candle in _yf_frame_to_candles(df):
                if candle.timestamp not in seen_ts:
                    seen_ts.add(candle.timestamp)
                    all_candles.append(candle)

            chunk_start = chunk_end
            if chunk_start < until_ts:
                await asyncio.sleep(self.request_delay_seconds)  # be polite to Yahoo's undocumented API

        all_candles.sort(key=lambda c: c.timestamp)
        return all_candles

    async def close(self) -> None:
        pass  # yfinance has no persistent connection to release
