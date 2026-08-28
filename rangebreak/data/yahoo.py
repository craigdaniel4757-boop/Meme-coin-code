"""Real intraday data via Yahoo Finance's unofficial public chart API.

No API key required, which is why it's the default "live" data source, but
it comes with real limitations worth knowing before trusting a backtest
built on it:

- 1-minute history is only available for roughly the last 7-8 days. A
  longer `--start` with `source=yahoo` will silently come back thin/empty
  for the older portion -- those days surface as `insufficient_data`
  rather than a fabricated result.
- This strategy's 08:00-10:00 ET window is *before* the 9:30 ET regular
  session open, so the request has to explicitly ask for pre-market data
  (`includePrePost=true`) or the 8-9am range would come back empty.
  Pre-market liquidity is thinner and spreads wider than during regular
  hours for most names -- lean on liquid ETFs/large caps and keep the
  spread/slippage assumptions in the cost model realistic for that.
- This is an unofficial endpoint (no SLA, can change shape without
  notice). It's implemented defensively (skips null bars, raises a clear
  error on an unexpected response) but isn't guaranteed to stay working.

Swap in a paid provider (Polygon.io, Alpaca, Twelve Data, etc.) by writing
another `MarketDataProvider` -- nothing else in this app depends on Yahoo
specifically.
"""

from __future__ import annotations

from datetime import datetime

import httpx

from ..models import Candle
from ..timeutils import ET
from .provider import MarketDataProvider

_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_MAX_SPAN_DAYS = 8  # Yahoo's practical ceiling for interval=1m


class YahooDataError(RuntimeError):
    pass


class YahooProvider(MarketDataProvider):
    name = "yahoo"

    def __init__(self, timeout_seconds: float = 15.0):
        self._timeout = timeout_seconds

    def get_1m_candles(self, ticker: str, start: datetime, end: datetime) -> list[Candle]:
        if (end - start).days > _MAX_SPAN_DAYS:
            raise YahooDataError(
                f"Requested span is {(end - start).days} days; Yahoo's free 1-minute history "
                f"only reliably covers the last ~{_MAX_SPAN_DAYS} days. Narrow the date range."
            )
        params = {
            "interval": "1m",
            "period1": int(start.timestamp()),
            "period2": int(end.timestamp()),
            "includePrePost": "true",
            "events": "none",
        }
        headers = {"User-Agent": "Mozilla/5.0 (compatible; rangebreak-backtester/1.0)"}
        url = _BASE_URL.format(symbol=ticker.upper())
        try:
            resp = httpx.get(url, params=params, headers=headers, timeout=self._timeout)
            resp.raise_for_status()
            payload = resp.json()
        except httpx.HTTPError as exc:
            raise YahooDataError(f"Could not reach Yahoo Finance for {ticker}: {exc}") from exc

        chart = payload.get("chart", {})
        if chart.get("error"):
            raise YahooDataError(f"Yahoo Finance error for {ticker}: {chart['error']}")
        results = chart.get("result") or []
        if not results:
            return []

        result = results[0]
        timestamps = result.get("timestamp") or []
        quote = (result.get("indicators", {}).get("quote") or [{}])[0]
        opens, highs = quote.get("open") or [], quote.get("high") or []
        lows, closes = quote.get("low") or [], quote.get("close") or []
        volumes = quote.get("volume") or []

        candles: list[Candle] = []
        for i, ts in enumerate(timestamps):
            o, h, l, c = (opens[i] if i < len(opens) else None, highs[i] if i < len(highs) else None,
                          lows[i] if i < len(lows) else None, closes[i] if i < len(closes) else None)
            if None in (o, h, l, c):
                continue  # Yahoo emits nulls for minutes with no trades -- skip rather than fabricate
            v = volumes[i] if i < len(volumes) and volumes[i] is not None else 0.0
            candles.append(Candle(ts=datetime.fromtimestamp(ts, tz=ET), open=float(o), high=float(h), low=float(l), close=float(c), volume=float(v)))
        candles.sort(key=lambda c: c.ts)
        return candles
