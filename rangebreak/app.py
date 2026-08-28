"""FastAPI app: serves the frontend and two JSON endpoints.

`GET /api/backtest` runs the strategy over a date range and returns one
summary row per trading day (for the results table + aggregate stats).
`GET /api/day` returns one day's full 1-minute candle series plus the
resolved trade annotations, for the chart view.

Both endpoints take the same cost-model query params so the UI's
"Advanced" panel can drive either call identically.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .backtest import run_backtest, summarize
from .data.provider import MarketDataProvider
from .data.synthetic import DEMO_TICKERS, SyntheticProvider
from .data.yahoo import YahooDataError, YahooProvider
from .models import BacktestConfig
from .strategy import run_day
from .timeutils import session_windows

STATIC_DIR = Path(__file__).parent / "static"

MAX_SYNTHETIC_SPAN_DAYS = 400
MAX_YAHOO_SPAN_DAYS = 10  # a hair over the provider's own ~8 trading day cap, so the provider's error message is the one the user sees


def _provider(source: str) -> MarketDataProvider:
    if source == "synthetic":
        return SyntheticProvider()
    if source == "yahoo":
        return YahooProvider()
    raise HTTPException(400, f"Unknown data source '{source}' (expected 'synthetic' or 'yahoo').")


def _cfg(
    tick_size: float = Query(0.01, gt=0),
    spread_ticks: float = Query(2.0, ge=0),
    slippage_ticks: float = Query(2.0, ge=0),
    commission_per_share: float = Query(0.0, ge=0),
    session_close: str = Query("16:00"),
    lookback_hours: float = Query(1.0, ge=0, le=8),
) -> BacktestConfig:
    try:
        hh, mm = (int(p) for p in session_close.split(":", 1))
        assert 0 <= hh <= 23 and 0 <= mm <= 59
    except (ValueError, AssertionError) as exc:
        raise HTTPException(400, "session_close must be 'HH:MM' in 24-hour time.") from exc
    return BacktestConfig(
        tick_size=tick_size, spread_ticks=spread_ticks, slippage_ticks=slippage_ticks,
        commission_per_share=commission_per_share, session_close_hour=hh, session_close_minute=mm,
        lookback_hours=lookback_hours,
    )


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, f"Invalid {field} '{value}'; expected YYYY-MM-DD.") from exc


def build_app() -> FastAPI:
    app = FastAPI(title="rangebreak -- ORB liquidity-sweep backtester")

    @app.get("/api/instruments")
    def api_instruments() -> JSONResponse:
        return JSONResponse({"demo_tickers": list(DEMO_TICKERS)})

    @app.get("/api/backtest")
    def api_backtest(
        ticker: str = Query(..., min_length=1, max_length=10),
        start: str = Query(...),
        end: str = Query(...),
        source: str = Query("synthetic"),
        tick_size: float = Query(0.01, gt=0),
        spread_ticks: float = Query(2.0, ge=0),
        slippage_ticks: float = Query(2.0, ge=0),
        commission_per_share: float = Query(0.0, ge=0),
        session_close: str = Query("16:00"),
        lookback_hours: float = Query(1.0, ge=0, le=8),
    ) -> JSONResponse:
        ticker = ticker.strip().upper()
        start_d, end_d = _parse_date(start, "start"), _parse_date(end, "end")
        if end_d < start_d:
            raise HTTPException(400, "end must not be before start.")
        span_cap = MAX_SYNTHETIC_SPAN_DAYS if source == "synthetic" else MAX_YAHOO_SPAN_DAYS
        if (end_d - start_d).days > span_cap:
            raise HTTPException(400, f"Date range too wide for source='{source}' (max {span_cap} days). Narrow it and try again.")

        cfg = _cfg(tick_size, spread_ticks, slippage_ticks, commission_per_share, session_close, lookback_hours)
        provider = _provider(source)
        try:
            records = run_backtest(provider, ticker, start_d, end_d, cfg)
        except YahooDataError as exc:
            raise HTTPException(502, str(exc)) from exc

        return JSONResponse({
            "ticker": ticker, "source": source, "start": start, "end": end,
            "days": [r.to_json() for r in records],
            "summary": summarize(records).to_json(),
        })

    @app.get("/api/day")
    def api_day(
        ticker: str = Query(..., min_length=1, max_length=10),
        date_: str = Query(..., alias="date"),
        source: str = Query("synthetic"),
        tick_size: float = Query(0.01, gt=0),
        spread_ticks: float = Query(2.0, ge=0),
        slippage_ticks: float = Query(2.0, ge=0),
        commission_per_share: float = Query(0.0, ge=0),
        session_close: str = Query("16:00"),
        lookback_hours: float = Query(1.0, ge=0, le=8),
    ) -> JSONResponse:
        ticker = ticker.strip().upper()
        day = _parse_date(date_, "date")
        cfg = _cfg(tick_size, spread_ticks, slippage_ticks, commission_per_share, session_close, lookback_hours)
        windows = session_windows(day, cfg.session_close_hour, cfg.session_close_minute, cfg.lookback_hours)
        provider = _provider(source)
        try:
            candles = provider.get_1m_candles(ticker, windows.fetch_start, windows.session_close)
        except YahooDataError as exc:
            raise HTTPException(502, str(exc)) from exc

        trade = run_day(ticker, day, candles, cfg)  # run_day itself reports INSUFFICIENT_DATA when candles is empty

        return JSONResponse({
            "trade": trade.to_json(),
            "windows": {
                "fetch_start": windows.fetch_start.isoformat(),
                "range_start": windows.range_start.isoformat(),
                "range_end": windows.range_end.isoformat(),
                "monitor_end": windows.monitor_end.isoformat(),
                "session_close": windows.session_close.isoformat(),
            },
            "candles": [
                {"t": int(c.ts.timestamp()), "o": c.open, "h": c.high, "l": c.low, "c": c.close, "v": c.volume}
                for c in sorted(candles, key=lambda c: c.ts)
            ],
        })

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(str(STATIC_DIR / "index.html"))

    return app


app = build_app()
