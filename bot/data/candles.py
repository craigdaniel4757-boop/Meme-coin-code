"""Unified OHLCV access: GeckoTerminal history first, local resampled ticks
as a fallback/supplement for pairs too new to have GeckoTerminal history.

Local candles are built by resampling repeated point-in-time price
observations gathered while scanning (see `record_tick`). Because
DexScreener only reports a rolling 24h volume figure rather than
per-trade volume, the per-bar volume for locally-built candles is a proxy:
the clipped-at-zero delta of that rolling figure between consecutive
observations. It is an approximation, not exchange-grade trade volume, and
it is only used when GeckoTerminal has too little (or no) real history for
a pool -- see docs/STRATEGY.md for how this affects confidence in the
volume factor of the scoring model.
"""

from __future__ import annotations

import logging
import time

import pandas as pd

from bot.data.geckoterminal import GeckoTerminalClient
from bot.data.models import Candle
from bot.storage.db import Database

logger = logging.getLogger(__name__)

OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]

# Below this many bars, technical indicators are unreliable, so the provider
# prefers falling back to (or topping up with) local candles instead.
MIN_BARS_FOR_ANALYSIS = 30


def _empty_ohlcv_df() -> pd.DataFrame:
    return pd.DataFrame(columns=OHLCV_COLUMNS)


def candles_to_df(candles: list[Candle]) -> pd.DataFrame:
    if not candles:
        return _empty_ohlcv_df()
    return pd.DataFrame(
        {
            "timestamp": [c.timestamp for c in candles],
            "open": [c.open for c in candles],
            "high": [c.high for c in candles],
            "low": [c.low for c in candles],
            "close": [c.close for c in candles],
            "volume": [c.volume for c in candles],
        }
    )


def resample_ticks_to_ohlcv(rows: list, interval_seconds: int) -> pd.DataFrame:
    """`rows` are sqlite3.Row objects with columns (ts, price_usd, volume_24h_usd, liquidity_usd)."""
    if not rows:
        return _empty_ohlcv_df()

    frame = pd.DataFrame(
        [(r["ts"], r["price_usd"], r["volume_24h_usd"]) for r in rows],
        columns=["ts", "price", "volume_24h"],
    )
    frame["volume_delta"] = frame["volume_24h"].diff().clip(lower=0).fillna(0.0)
    frame["dt"] = pd.to_datetime(frame["ts"], unit="s", utc=True)
    frame = frame.set_index("dt").sort_index()

    rule = f"{int(interval_seconds)}s"
    ohlc = frame["price"].resample(rule).ohlc()
    volume = frame["volume_delta"].resample(rule).sum().rename("volume")
    bars = ohlc.join(volume).dropna(subset=["close"])
    for col in ("open", "high", "low"):
        bars[col] = bars[col].fillna(bars["close"])
    bars = bars.reset_index()
    bars["timestamp"] = bars["dt"].astype("int64") // 10**9
    return bars[OHLCV_COLUMNS].reset_index(drop=True)


class CandleProvider:
    def __init__(
        self,
        db: Database,
        gecko_client: GeckoTerminalClient | None,
        fallback_interval_seconds: int = 60,
        max_local_candles: int = 2000,
    ) -> None:
        self.db = db
        self.gecko_client = gecko_client
        self.fallback_interval_seconds = fallback_interval_seconds
        self.max_local_candles = max_local_candles

    def record_tick(
        self,
        chain_id: str,
        pair_address: str,
        ts: int,
        price_usd: float | None,
        volume_24h_usd: float | None,
        liquidity_usd: float | None,
    ) -> None:
        if price_usd is None or price_usd <= 0:
            return
        self.db.insert_tick(chain_id, pair_address, ts, price_usd, volume_24h_usd, liquidity_usd)

    def local_candles(
        self,
        chain_id: str,
        pair_address: str,
        interval_seconds: int | None = None,
        limit: int | None = None,
    ) -> pd.DataFrame:
        interval = interval_seconds or self.fallback_interval_seconds
        lim = limit or self.max_local_candles
        since_ts = int(time.time()) - interval * lim * 3
        rows = self.db.get_ticks(chain_id, pair_address, since_ts=since_ts, limit=lim * 20)
        df = resample_ticks_to_ohlcv(rows, interval)
        return df.tail(lim).reset_index(drop=True)

    async def get_candles(
        self,
        chain_id: str,
        pair_address: str,
        interval_seconds: int | None = None,
        limit: int = 300,
    ) -> pd.DataFrame:
        interval = interval_seconds or self.fallback_interval_seconds
        remote_df = _empty_ohlcv_df()
        if self.gecko_client is not None:
            try:
                candles = await self.gecko_client.get_ohlcv(chain_id, pair_address, interval, limit)
                remote_df = candles_to_df(candles)
            except Exception:  # noqa: BLE001 - OHLCV enrichment is best-effort
                logger.debug("GeckoTerminal OHLCV fetch failed for %s:%s", chain_id, pair_address, exc_info=True)

        if len(remote_df) >= MIN_BARS_FOR_ANALYSIS:
            return remote_df.tail(limit).reset_index(drop=True)

        local_df = self.local_candles(chain_id, pair_address, interval, limit)
        return local_df if len(local_df) > len(remote_df) else remote_df

    def prune(self, retention_seconds: int) -> int:
        return self.db.prune_ticks(int(time.time()) - retention_seconds)
