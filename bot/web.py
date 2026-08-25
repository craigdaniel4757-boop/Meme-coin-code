"""Local live dashboard: a browser view of the exact same paper-trading
engine `python -m bot run --paper` uses, so portfolio value and buy-signal
accuracy are something you watch build up in real time instead of reading
off a scrolling terminal. See `python -m bot web --help`.

Deliberately paper-only and local-only, on purpose, not as a placeholder:
- Always constructs a PaperExecutionProvider, regardless of what
  execution.mode says in config -- there is no code path from this module
  to live trading, not even accidentally. Want live execution? Use
  `python -m bot run --i-understand-the-risk`; this module doesn't support
  it at all.
- `python -m bot web` defaults to binding 127.0.0.1, not 0.0.0.0, so
  nothing outside your own machine can reach it unless you deliberately
  pass a different --host.

The "is this actually working" numbers (win rate, profit factor,
expectancy, drawdown) reuse `bot.backtest.metrics.compute_metrics` --
the exact same math already used to judge a backtest, applied to the live
trade log instead of a replayed one, so "does this look good" means the
same thing whether the trades came from history or from watching it happen.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

from bot.backtest.engine import BacktestResult
from bot.backtest.metrics import compute_metrics
from bot.config import AppConfig
from bot.data.models import Candidate, Position, SignalAction, Trade
from bot.execution.paper import PaperExecutionProvider
from bot.scanner.screener import Scanner
from bot.storage.db import Database

logger = logging.getLogger(__name__)

# ~11 hours of history at the default 20s scan interval -- bounds memory on
# a dashboard left running for a long stretch rather than growing forever.
MAX_EQUITY_POINTS = 2000


@dataclass
class DashboardState:
    starting_equity_usd: float
    equity_history: list[tuple[float, float]] = field(default_factory=list)  # (unix ts, equity_usd)
    latest_candidates: list[Candidate] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    last_cycle_at: float | None = None
    last_error: str | None = None


def _mark_to_market_prices(candidates: list[Candidate]) -> dict[str, float]:
    """`Portfolio.equity()` keys prices by pair_address alone and falls
    back to a position's own entry price when a pair isn't present here
    (see bot/execution/portfolio.py) -- so this only needs to cover
    whatever the current scan cycle actually saw, not guarantee a fresh
    price for every open position. That fallback is an approximation
    (an open position can fall out of the discovery/pre-filter set the
    same way bot/scanner/screener.py's manage_open_positions docstring
    already notes), acceptable for a live-updating dashboard number, not
    for anything that needs to be exact -- `report`'s trade log is the
    source of truth for realized numbers."""
    prices: dict[str, float] = {}
    for c in candidates:
        price = c.pair.price_usd
        if price:
            prices[c.pair.pairAddress] = price
    return prices


def _serialize_position(p: Position) -> dict:
    return {
        "symbol": p.symbol,
        "chain_id": p.chain_id,
        "entry_price": p.entry_price,
        "quantity": p.quantity,
        "remaining_fraction": p.remaining_fraction,
        "stop_loss_price": p.stop_loss_price,
        "trailing_stop_price": p.trailing_stop_price,
        "strategy_name": p.strategy_name,
        "entry_time": p.entry_time,
    }


def _serialize_trade(t: Trade) -> dict:
    return {
        "symbol": t.symbol,
        "side": t.side,
        "price": t.price,
        "quantity": t.quantity,
        "realized_pnl_usd": t.realized_pnl_usd,
        "reason": t.reason,
        "kind": t.kind,
        "timestamp": t.timestamp,
    }


def _serialize_candidate(c: Candidate) -> dict:
    return {
        "symbol": c.pair.symbol,
        "chain_id": c.pair.chainId,
        "price_usd": c.pair.price_usd,
        "score": c.score.total if c.score else None,
        "safety_passed": c.safety.passed,
        "signals": [s.strategy_name for s in c.signals],
        "url": c.pair.url,
    }


def _live_metrics(state: DashboardState, execution: PaperExecutionProvider) -> dict:
    equity_curve = state.equity_history or [(state.started_at, state.starting_equity_usd)]
    result = BacktestResult(
        trades=list(execution.portfolio.trade_log),
        equity_curve=[(int(ts), eq) for ts, eq in equity_curve],
        starting_equity_usd=state.starting_equity_usd,
        final_equity_usd=equity_curve[-1][1],
    )
    m = compute_metrics(result)
    return {
        "win_rate_pct": m.win_rate_pct,
        "closed_trades": m.closed_trades,
        # inf isn't valid JSON (no losing trades yet) -- None reads as
        # "not enough data" on the frontend instead of breaking JSON.parse.
        "profit_factor": None if m.profit_factor in (float("inf"), float("-inf")) else m.profit_factor,
        "expectancy_usd": m.expectancy_usd,
        "max_drawdown_pct": m.max_drawdown_pct,
        "total_return_pct": m.total_return_pct,
    }


def status_payload(cfg: AppConfig, execution: PaperExecutionProvider, state: DashboardState) -> dict:
    current_equity = state.equity_history[-1][1] if state.equity_history else state.starting_equity_usd
    metrics = _live_metrics(state, execution)

    candidates = sorted(
        state.latest_candidates, key=lambda c: c.score.total if c.score else -1.0, reverse=True
    )
    buy_candidates = [
        _serialize_candidate(c)
        for c in candidates
        if sum(1 for s in c.signals if s.action == SignalAction.BUY) >= cfg.risk.min_agreeing_strategies
    ][:20]

    trades = execution.portfolio.trade_log
    return {
        "mode": "paper",
        "started_at": state.started_at,
        "last_cycle_at": state.last_cycle_at,
        "last_error": state.last_error,
        "starting_equity_usd": state.starting_equity_usd,
        "bankroll_usd": execution.get_bankroll_usd(),
        "equity_usd": current_equity,
        "total_return_pct": metrics["total_return_pct"],
        "equity_history": [[ts, eq] for ts, eq in state.equity_history],
        "open_positions": [_serialize_position(p) for p in execution.get_open_positions()],
        "recent_trades": [_serialize_trade(t) for t in reversed(trades[-50:])],
        "metrics": metrics,
        "buy_candidates": buy_candidates,
        "candidates_analyzed": len(state.latest_candidates),
        "active_strategies": cfg.strategy.active,
        "chains": cfg.scanner.chains,
    }


def build_app(cfg: AppConfig, db: Database) -> FastAPI:
    execution = PaperExecutionProvider(
        db=db,
        starting_balance_usd=cfg.execution.paper.starting_balance_usd,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
    )
    state = DashboardState(starting_equity_usd=execution.get_bankroll_usd())

    def on_cycle_complete(candidates: list[Candidate]) -> None:
        state.latest_candidates = candidates
        state.last_cycle_at = time.time()
        prices = _mark_to_market_prices(candidates)
        equity = execution.portfolio.equity(prices)
        state.equity_history.append((state.last_cycle_at, equity))
        if len(state.equity_history) > MAX_EQUITY_POINTS:
            del state.equity_history[: len(state.equity_history) - MAX_EQUITY_POINTS]

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with Scanner(cfg, db, execution) as scanner:

            async def _loop() -> None:
                try:
                    await scanner.run_forever(on_cycle_complete=on_cycle_complete)
                except asyncio.CancelledError:
                    raise
                except Exception:  # noqa: BLE001 - surface it on the dashboard, don't take the server down
                    logger.exception("Dashboard scan loop crashed")
                    state.last_error = "Scan loop crashed -- check the server's terminal output for details."

            task = asyncio.create_task(_loop())
            try:
                yield
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(title="memebot dashboard", lifespan=lifespan)

    @app.get("/api/status")
    def api_status() -> JSONResponse:
        return JSONResponse(status_payload(cfg, execution, state))

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return DASHBOARD_HTML

    return app


DASHBOARD_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>memebot dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --green: #3fb950; --red: #f85149; --accent: #58a6ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: var(--bg); color: var(--text);
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 14px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: var(--dim); font-size: 12px; margin-bottom: 20px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .card .label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .card .value { font-size: 20px; font-weight: 600; margin-top: 4px; }
  .up { color: var(--green); } .down { color: var(--red); } .neutral { color: var(--text); }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 20px; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dim); margin: 0 0 12px; }
  canvas { width: 100%; height: 220px; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { color: var(--dim); font-weight: 500; font-size: 11px; text-transform: uppercase; }
  tr:last-child td { border-bottom: none; }
  .empty { color: var(--dim); padding: 8px 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; }
  .pill.buy { background: rgba(63,185,80,0.15); color: var(--green); }
  .pill.sell { background: rgba(248,81,73,0.15); color: var(--red); }
  footer { color: var(--dim); font-size: 12px; margin-top: 20px; }
  #conn-warning { display: none; color: var(--red); margin-bottom: 12px; }
</style>
</head>
<body>
  <h1>memebot -- live paper trading dashboard</h1>
  <div class="sub" id="subtitle">loading...</div>
  <div id="conn-warning">Connection to the bot lost -- still retrying every few seconds. The dashboard server may have stopped; check its terminal window.</div>

  <div class="stats">
    <div class="card"><div class="label">Equity</div><div class="value" id="s-equity">-</div></div>
    <div class="card"><div class="label">Total return</div><div class="value" id="s-return">-</div></div>
    <div class="card"><div class="label">Cash</div><div class="value" id="s-cash">-</div></div>
    <div class="card"><div class="label">Open positions</div><div class="value" id="s-positions">-</div></div>
    <div class="card"><div class="label">Win rate</div><div class="value" id="s-winrate">-</div></div>
    <div class="card"><div class="label">Profit factor</div><div class="value" id="s-pf">-</div></div>
    <div class="card"><div class="label">Closed trades</div><div class="value" id="s-closed">-</div></div>
    <div class="card"><div class="label">Max drawdown</div><div class="value" id="s-dd">-</div></div>
  </div>

  <div class="panel">
    <h2>Equity over time</h2>
    <canvas id="chart" width="1000" height="220"></canvas>
  </div>

  <div class="panel">
    <h2>Live BUY signals (this cycle)</h2>
    <div id="buy-candidates"><div class="empty">waiting for the first scan cycle...</div></div>
  </div>

  <div class="panel">
    <h2>Open positions</h2>
    <div id="open-positions"><div class="empty">none</div></div>
  </div>

  <div class="panel">
    <h2>Recent trades</h2>
    <div id="recent-trades"><div class="empty">none yet</div></div>
  </div>

  <footer>
    Paper trading only -- simulated fills, no real funds, ever. This dashboard has no path to live execution.
    Backed by the same scan/score/strategy/risk engine as <code>python -m bot run --paper</code>; see
    <a href="https://github.com/craigdaniel4757-boop/Meme-coin-code" target="_blank">docs/STRATEGY.md</a>
    for how every number here is actually computed. Not financial advice.
  </footer>

<script>
function fmtUsd(v) {
  if (v === null || v === undefined) return "-";
  return "$" + v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
function fmtPct(v) {
  if (v === null || v === undefined) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function signClass(v) {
  if (v === null || v === undefined) return "neutral";
  return v > 0 ? "up" : (v < 0 ? "down" : "neutral");
}
function timeAgo(ts) {
  if (!ts) return "-";
  const secs = Math.max(0, (Date.now() / 1000) - ts);
  if (secs < 60) return Math.floor(secs) + "s ago";
  if (secs < 3600) return Math.floor(secs / 60) + "m ago";
  return Math.floor(secs / 3600) + "h ago";
}

function drawChart(points, startingEquity) {
  const canvas = document.getElementById("chart");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1000, cssH = 220;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!points || points.length < 2) {
    ctx.fillStyle = "#8b949e";
    ctx.font = "13px monospace";
    ctx.fillText("Waiting for enough scan cycles to plot a line...", 12, cssH / 2);
    return;
  }
  const values = points.map(p => p[1]);
  const minV = Math.min.apply(null, values.concat([startingEquity]));
  const maxV = Math.max.apply(null, values.concat([startingEquity]));
  const pad = (maxV - minV) * 0.1 || Math.max(1, startingEquity * 0.02);
  const lo = minV - pad, hi = maxV + pad;
  const x = i => 10 + (i / (points.length - 1)) * (cssW - 20);
  const y = v => cssH - 10 - ((v - lo) / (hi - lo || 1)) * (cssH - 20);

  ctx.strokeStyle = "#30363d";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y(startingEquity));
  ctx.lineTo(cssW, y(startingEquity));
  ctx.stroke();
  ctx.setLineDash([]);

  const last = values[values.length - 1];
  ctx.strokeStyle = last >= startingEquity ? "#3fb950" : "#f85149";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = x(i), py = y(p[1]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function renderCandidates(list) {
  const el = document.getElementById("buy-candidates");
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="empty">No BUY signals this cycle.</div>';
    return;
  }
  let html = "<table><tr><th>Symbol</th><th>Chain</th><th>Score</th><th>Price</th><th>Signals</th><th></th></tr>";
  for (const c of list) {
    html += `<tr><td>${c.symbol}</td><td>${c.chain_id}</td><td>${c.score !== null ? c.score.toFixed(0) : "-"}</td>` +
            `<td>${c.price_usd ? "$" + c.price_usd.toPrecision(4) : "-"}</td><td>${c.signals.join(", ")}</td>` +
            `<td>${c.url ? `<a href="${c.url}" target="_blank">view</a>` : ""}</td></tr>`;
  }
  el.innerHTML = html + "</table>";
}

function renderPositions(list) {
  const el = document.getElementById("open-positions");
  if (!list || list.length === 0) { el.innerHTML = '<div class="empty">none</div>'; return; }
  let html = "<table><tr><th>Symbol</th><th>Chain</th><th>Entry</th><th>Qty</th><th>Remaining</th><th>Stop</th><th>Strategy</th></tr>";
  for (const p of list) {
    html += `<tr><td>${p.symbol}</td><td>${p.chain_id}</td><td>${fmtUsd(p.entry_price)}</td>` +
            `<td>${p.quantity.toPrecision(6)}</td><td>${(p.remaining_fraction * 100).toFixed(0)}%</td>` +
            `<td>${fmtUsd(p.stop_loss_price)}</td><td>${p.strategy_name || "-"}</td></tr>`;
  }
  el.innerHTML = html + "</table>";
}

function renderTrades(list) {
  const el = document.getElementById("recent-trades");
  if (!list || list.length === 0) { el.innerHTML = '<div class="empty">none yet</div>'; return; }
  let html = "<table><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Price</th><th>PnL</th><th>Reason</th></tr>";
  for (const t of list) {
    const when = new Date(t.timestamp * 1000).toLocaleTimeString();
    const pillClass = t.side === "buy" ? "buy" : "sell";
    const pnl = t.realized_pnl_usd !== null && t.realized_pnl_usd !== undefined
      ? `<span class="${signClass(t.realized_pnl_usd)}">${fmtUsd(t.realized_pnl_usd)}</span>` : "-";
    html += `<tr><td>${when}</td><td>${t.symbol}</td><td><span class="pill ${pillClass}">${t.side}</span></td>` +
            `<td>${fmtUsd(t.price)}</td><td>${pnl}</td><td>${t.reason}</td></tr>`;
  }
  el.innerHTML = html + "</table>";
}

async function refresh() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("bad response");
    const d = await res.json();
    document.getElementById("conn-warning").style.display = "none";

    document.getElementById("subtitle").textContent =
      `${d.chains.join(", ")} -- ${d.active_strategies.join(", ")} -- last cycle ${timeAgo(d.last_cycle_at)}` +
      (d.last_error ? ` -- ${d.last_error}` : "");

    document.getElementById("s-equity").textContent = fmtUsd(d.equity_usd);
    const retEl = document.getElementById("s-return");
    retEl.textContent = fmtPct(d.total_return_pct);
    retEl.className = "value " + signClass(d.total_return_pct);
    document.getElementById("s-cash").textContent = fmtUsd(d.bankroll_usd);
    document.getElementById("s-positions").textContent = d.open_positions.length;
    document.getElementById("s-winrate").textContent = d.metrics.closed_trades > 0 ? d.metrics.win_rate_pct.toFixed(0) + "%" : "-";
    document.getElementById("s-pf").textContent = d.metrics.profit_factor !== null ? d.metrics.profit_factor.toFixed(2) : "-";
    document.getElementById("s-closed").textContent = d.metrics.closed_trades;
    document.getElementById("s-dd").textContent = d.metrics.max_drawdown_pct.toFixed(1) + "%";

    drawChart(d.equity_history, d.starting_equity_usd);
    renderCandidates(d.buy_candidates);
    renderPositions(d.open_positions);
    renderTrades(d.recent_trades);
  } catch (e) {
    document.getElementById("conn-warning").style.display = "block";
  }
}

refresh();
setInterval(refresh, 4000);
window.addEventListener("resize", refresh);
</script>
</body>
</html>
"""
