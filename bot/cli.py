"""Command-line entrypoint: `python -m bot <command>`.

Live trading requires two independent, explicit opt-ins before a single
real order can be placed: `execution.mode: "live"` in the config file, AND
the `--i-understand-the-risk` flag on `run`. Either one alone is not
enough. This is deliberate friction -- see README.md "Live trading".
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from rich.console import Console
from rich.table import Table

from bot.analysis.safety_filters import SafetyConfig
from bot.backtest.engine import run_backtest
from bot.backtest.metrics import compute_metrics
from bot.backtest.optimizer import OptimizerRunConfig, PoolSpec, optimize_weights
from bot.config import (
    AppConfig,
    build_indicator_params,
    build_risk_config,
    build_safety_config,
    build_scoring_weights,
    load_config,
)
from bot.data.candles import CandleProvider
from bot.data.dexscreener import DexScreenerClient
from bot.data.geckoterminal import GeckoTerminalClient
from bot.data.models import SignalAction
from bot.execution.jupiter_live import JupiterLiveExecutionProvider, LiveTradingError
from bot.execution.paper import PaperExecutionProvider
from bot.logging_setup import setup_logging
from bot.scanner.screener import Scanner
from bot.storage.db import Database

console = Console()


def _load(config_path: str) -> AppConfig:
    cfg = load_config(config_path)
    setup_logging(cfg.general.log_level)
    return cfg


def cmd_init_db(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    db = Database(cfg.storage.sqlite_path)
    console.print(f"[green]Initialized database at {cfg.storage.sqlite_path}[/green]")
    db.close()


async def _run_scan_once(cfg: AppConfig, db: Database):
    async with Scanner(cfg, db) as scanner:
        return await scanner.scan_once()


async def _run_scan_loop(cfg: AppConfig, db: Database) -> None:
    """Same continuous cadence as `run`, minus execution entirely: a
    Scanner with no execution provider makes `manage_open_positions`/
    `enter_new_positions` no-ops (see bot/scanner/screener.py), so this is
    a live-updating table only -- no portfolio, no trades, paper or live."""
    async with Scanner(cfg, db) as scanner:
        await scanner.run_forever(
            on_cycle_complete=lambda candidates: _print_cycle_table(candidates, cfg.risk.min_agreeing_strategies)
        )


def _print_scan_table(
    candidates: list,
    limit: int = 25,
    min_score: float | None = None,
    show_top_notes: bool = True,
    min_agreeing_strategies: int = 1,
) -> None:
    table = Table(title=f"memebot scan -- {len(candidates)} candidates analyzed")
    for col, justify, overflow in [
        ("Symbol", None, None), ("Chain", None, None), ("Score", "right", None), ("Safety", None, None),
        ("Action", None, None), ("Price", "right", None), ("Liquidity", "right", None),
        ("24h Vol", "right", None), ("Signals", None, "fold"),
    ]:
        # "fold" wraps long content (e.g. several strategy names) onto extra
        # lines within the cell instead of truncating it with an ellipsis.
        table.add_column(col, justify=justify or "left", overflow=overflow or "ellipsis")

    shown = 0
    any_buy = False
    links: list[tuple[str, str]] = []
    for c in candidates:
        if min_score is not None and (not c.score or c.score.total < min_score):
            continue
        score_txt = f"{c.score.total:.0f}" if c.score else "-"
        safety_txt = "[green]OK[/green]" if c.safety.passed else "[red]FAIL[/red]"
        buy_count = sum(1 for s in c.signals if s.action == SignalAction.BUY)
        is_buy = buy_count >= min_agreeing_strategies
        any_buy = any_buy or is_buy
        action_txt = "[bold green]BUY[/bold green]" if is_buy else "[dim]HOLD[/dim]"
        price_txt = f"${c.pair.price_usd:.8g}" if c.pair.price_usd else "-"
        liq_txt = f"${c.pair.liquidity.usd:,.0f}" if c.pair.liquidity.usd else "-"
        vol_txt = f"${c.pair.volume.h24:,.0f}" if c.pair.volume.h24 else "-"
        signals_txt = ", ".join(s.strategy_name for s in c.signals) or "-"
        table.add_row(
            c.pair.symbol, c.pair.chainId, score_txt, safety_txt, action_txt,
            price_txt, liq_txt, vol_txt, signals_txt,
        )
        if c.pair.url:
            links.append((c.pair.symbol, c.pair.url))
        shown += 1
        if shown >= limit:
            break

    console.print(table)
    if any_buy:
        console.print(
            "[dim]BUY reflects strategy agreement, safety, and score -- three more checks (higher-timeframe "
            "trend, market regime, same-token cooldown) are only applied right before the bot actually "
            "places a trade, and can still hold one back.[/dim]"
        )
    # Printed as a plain list rather than a table column: a DexScreener URL
    # is ~60 characters, which would force multi-line wrapping inside a
    # bordered cell (interleaved with box-drawing characters) that's awkward
    # to select and copy correctly. One clean line per coin is not.
    if links:
        console.print("\n[bold]Links:[/bold]")
        for symbol, url in links:
            console.print(f"  {symbol}: {url}")
    if show_top_notes and candidates and candidates[0].score:
        top = candidates[0]
        console.print(f"\n[bold]Top candidate:[/bold] {top.pair.symbol} ({top.pair.chainId}) -- score {top.score.total:.1f}")
        for note in top.score.notes:
            console.print(f"  - {note}")


def cmd_scan(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    db = Database(cfg.storage.sqlite_path)

    if args.loop:
        console.print(
            f"[bold]Continuous scan (read-only -- no trades, paper or live).[/bold] "
            f"Scan interval: {cfg.scanner.scan_interval_seconds}s. Ctrl+C to stop."
        )
        try:
            asyncio.run(_run_scan_loop(cfg, db))
        except KeyboardInterrupt:
            console.print("\n[yellow]Stopped.[/yellow]")
        finally:
            db.close()
        return

    try:
        candidates = asyncio.run(_run_scan_once(cfg, db))
    finally:
        db.close()

    _print_scan_table(
        candidates, limit=args.limit, min_score=args.min_score,
        min_agreeing_strategies=cfg.risk.min_agreeing_strategies,
    )


def _build_execution(cfg: AppConfig, db: Database, live_confirmed: bool):
    if cfg.execution.mode == "live":
        if not live_confirmed:
            console.print(
                "[red]execution.mode is 'live' but --i-understand-the-risk was not passed. "
                "Refusing to start live trading.[/red]"
            )
            sys.exit(1)
        try:
            return JupiterLiveExecutionProvider(
                db=db,
                rpc_url=cfg.data.solana_rpc.url,
                starting_bankroll_usd=cfg.risk.starting_bankroll_usd,
                max_slippage_bps=cfg.execution.live.max_slippage_bps,
                priority_fee_lamports=cfg.execution.live.priority_fee_lamports,
            )
        except LiveTradingError as exc:
            console.print(f"[red]Cannot start live trading: {exc}[/red]")
            sys.exit(1)
    return PaperExecutionProvider(
        db=db,
        starting_balance_usd=cfg.execution.paper.starting_balance_usd,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
    )


def _print_cycle_table(candidates: list, min_agreeing_strategies: int) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    console.print(f"\n[dim]── scan cycle: {stamp} UTC ──[/dim]")
    _print_scan_table(candidates, limit=15, show_top_notes=False, min_agreeing_strategies=min_agreeing_strategies)


async def _run_forever(cfg: AppConfig, db: Database, live_confirmed: bool) -> None:
    execution = _build_execution(cfg, db, live_confirmed)
    mode = "LIVE (real funds)" if cfg.execution.mode == "live" else "paper (simulated)"
    console.print(
        f"[bold]Starting memebot in {mode} mode.[/bold] "
        f"Scan interval: {cfg.scanner.scan_interval_seconds}s. Ctrl+C to stop."
    )
    async with Scanner(cfg, db, execution) as scanner:
        await scanner.run_forever(
            on_cycle_complete=lambda candidates: _print_cycle_table(candidates, cfg.risk.min_agreeing_strategies)
        )


def cmd_run(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    if args.paper:
        cfg.execution.mode = "paper"
    db = Database(cfg.storage.sqlite_path)
    try:
        asyncio.run(_run_forever(cfg, db, args.i_understand_the_risk))
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped.[/yellow]")
    finally:
        db.close()


def _interval_and_limit(days: int) -> tuple[int, int]:
    interval = 3600 if days > 3 else 300  # coarser bars for longer windows keeps bar counts sane
    limit = min(int(days * 86400 / interval), 1000)  # GeckoTerminal caps a single request at 1000 bars
    return interval, limit


def _backtest_safety_cfg(cfg: AppConfig) -> SafetyConfig:
    """Backtesting has no live RPC/Jupiter feed to check on-chain mint/freeze
    authority state, holder concentration, or sellability historically, so
    those checks (which live scanning enforces) are disabled regardless of
    config; every other threshold (liquidity/volume/age/FDV-ratio/buy-pressure
    floors) still reflects your configured values."""
    safety = build_safety_config(cfg)
    safety.require_solana_mint_authority_renounced = False
    safety.require_solana_freeze_authority_renounced = False
    safety.require_liquidity_stability_check = False
    safety.require_holder_concentration_check = False
    safety.require_sellable = False
    return safety


async def _fetch_pools(cfg: AppConfig, chain_id: str, pair_addresses: list[str], days: int) -> list[PoolSpec]:
    db = Database(cfg.storage.sqlite_path)
    dex = DexScreenerClient(
        base_url=cfg.data.dexscreener.base_url, requests_per_minute=cfg.data.dexscreener.requests_per_minute
    )
    gecko = GeckoTerminalClient(
        base_url=cfg.data.geckoterminal.base_url, requests_per_minute=cfg.data.geckoterminal.requests_per_minute
    )
    provider = CandleProvider(
        db=db, gecko_client=gecko, fallback_interval_seconds=cfg.data.candles.fallback_interval_seconds
    )
    interval, limit = _interval_and_limit(days)

    async def fetch_one(pair_address: str) -> PoolSpec:
        symbol = pair_address[:8]
        pair = await dex.get_pair(chain_id, pair_address)
        if pair is not None and pair.symbol:
            symbol = pair.symbol
        df = await provider.get_candles(chain_id, pair_address, interval_seconds=interval, limit=limit)
        return PoolSpec(chain_id=chain_id, pair_address=pair_address, symbol=symbol, candles=df)

    async with dex, gecko:
        pools = list(await asyncio.gather(*(fetch_one(addr) for addr in pair_addresses)))
    db.close()
    return pools


def cmd_backtest(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    pool = asyncio.run(_fetch_pools(cfg, args.chain, [args.pair], args.days))[0]
    df, symbol = pool.candles, pool.symbol
    if df.empty or len(df) < 60:
        console.print(
            f"[red]Not enough historical candle data for {args.chain}:{args.pair} "
            f"({len(df)} bars). GeckoTerminal may not index this pool yet, or it's too new.[/red]"
        )
        return

    result = run_backtest(
        df=df,
        symbol=symbol,
        chain_id=args.chain,
        indicator_params=build_indicator_params(cfg),
        strategy_params=cfg.strategy.params_dict(),
        active_strategies=cfg.strategy.active,
        risk_cfg=build_risk_config(cfg),
        starting_bankroll_usd=cfg.risk.starting_bankroll_usd,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
        scoring_weights=build_scoring_weights(cfg),
        min_score_to_trade=cfg.scoring.min_score_to_trade,
        safety_cfg=_backtest_safety_cfg(cfg),
    )
    metrics = compute_metrics(result)

    table = Table(title=f"Backtest: {symbol} on {args.chain} ({len(df)} bars)")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for name, value in [
        ("Total trades", str(metrics.total_trades)),
        ("Closed trades", str(metrics.closed_trades)),
        ("Win rate", f"{metrics.win_rate_pct:.1f}%"),
        ("Wins / Losses", f"{metrics.wins} / {metrics.losses}"),
        ("Total realized PnL", f"${metrics.total_realized_pnl_usd:,.2f}"),
        ("Avg win", f"${metrics.avg_win_usd:,.2f}"),
        ("Avg loss", f"${metrics.avg_loss_usd:,.2f}"),
        ("Profit factor", f"{metrics.profit_factor:.2f}"),
        ("Expectancy / trade", f"${metrics.expectancy_usd:,.2f}"),
        ("Max drawdown", f"{metrics.max_drawdown_pct:.1f}%"),
        ("Total return", f"{metrics.total_return_pct:.1f}%"),
        ("Sharpe-like ratio", f"{metrics.sharpe_like_ratio:.2f}"),
    ]:
        table.add_row(name, value)
    console.print(table)
    console.print(
        "\n[dim]Entries are gated by your configured composite score/safety threshold, same as live "
        "scanning. A backtest is a sanity check against historical data, not a promise of future "
        "performance -- see docs/STRATEGY.md.[/dim]"
    )


def cmd_optimize_weights(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    pools = asyncio.run(_fetch_pools(cfg, args.chain, args.pair, args.days))

    usable_pools = []
    for p in pools:
        if p.candles.empty or len(p.candles) < 60:
            console.print(
                f"[yellow]Skipping {p.symbol} ({args.chain}:{p.pair_address}): only "
                f"{len(p.candles)} bars of history.[/yellow]"
            )
            continue
        usable_pools.append(p)

    if not usable_pools:
        console.print("[red]No pool had enough historical data to optimize against.[/red]")
        return

    opt_cfg = OptimizerRunConfig(
        indicator_params=build_indicator_params(cfg),
        strategy_params=cfg.strategy.params_dict(),
        active_strategies=cfg.strategy.active,
        risk_cfg=build_risk_config(cfg),
        safety_cfg=_backtest_safety_cfg(cfg),
        min_score_to_trade=cfg.scoring.min_score_to_trade,
        min_trades_per_pool=args.min_trades,
        drawdown_penalty=args.drawdown_penalty,
        starting_bankroll_usd=cfg.risk.starting_bankroll_usd,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
    )

    console.print(
        f"Optimizing scoring weights across {len(usable_pools)} pool(s) "
        f"({', '.join(p.symbol for p in usable_pools)}), {args.trials} trials...\n"
    )
    result = optimize_weights(
        usable_pools,
        opt_cfg,
        baseline_weights=build_scoring_weights(cfg),
        trials=args.trials,
        seed=args.seed,
    )

    if result.trials_disqualified == result.trials_run:
        console.print(
            f"[red]All {result.trials_run} trials were disqualified: fewer than {args.min_trades} "
            "closed trades on at least one pool for every weight combination tried. Try a longer "
            "window (--days), fewer/different pools, or a lower --min-trades.[/red]"
        )
        return
    if result.trials_disqualified:
        console.print(
            f"[dim]{result.trials_disqualified}/{result.trials_run} trials disqualified "
            f"(fewer than {args.min_trades} closed trades on at least one pool).[/dim]\n"
        )

    def fmt_fitness(c) -> str:
        return "disqualified (too few trades)" if c.disqualified else f"{c.fitness:.2f}"

    table = Table(title="Baseline (current config) vs. best found")
    table.add_column("")
    table.add_column("Baseline", justify="right")
    table.add_column("Best found", justify="right")
    table.add_row("Fitness (expectancy - drawdown penalty)", fmt_fitness(result.baseline), fmt_fitness(result.best))
    for field_name in ("trend", "momentum", "volume", "volatility", "liquidity_safety", "social"):
        table.add_row(
            f"  weight: {field_name}",
            f"{getattr(result.baseline.weights, field_name):.3f}",
            f"{getattr(result.best.weights, field_name):.3f}",
        )
    console.print(table)

    pool_table = Table(title="Per-pool performance with the best-found weights")
    for col in ["Pool", "Closed trades", "Win rate", "Expectancy", "Max drawdown"]:
        pool_table.add_column(col)
    for pr in result.best.pool_results:
        pool_table.add_row(
            pr.pool.symbol,
            str(pr.metrics.closed_trades),
            f"{pr.metrics.win_rate_pct:.1f}%",
            f"${pr.metrics.expectancy_usd:.2f}",
            f"{pr.metrics.max_drawdown_pct:.1f}%",
        )
    console.print(pool_table)

    w = result.best.weights
    snippet = (
        "scoring:\n"
        "  weights:\n"
        f"    trend: {w.trend:.3f}\n"
        f"    momentum: {w.momentum:.3f}\n"
        f"    volume: {w.volume:.3f}\n"
        f"    volatility: {w.volatility:.3f}\n"
        f"    liquidity_safety: {w.liquidity_safety:.3f}\n"
        f"    social: {w.social:.3f}\n"
    )
    console.print("\n[bold]To use these weights, paste this into your config (e.g. config/local.yaml):[/bold]")
    console.print(snippet, highlight=False)
    console.print(
        "[dim]This searched a limited amount of historical data across a handful of pools -- treat "
        "it as a data-backed starting point worth continuing to validate (different pools, different "
        "date ranges), not a finished answer. See docs/STRATEGY.md.[/dim]"
    )


def cmd_report(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    db = Database(cfg.storage.sqlite_path)
    try:
        positions = db.get_open_positions()
        trades = db.get_trades(limit=args.limit)

        console.print(f"[bold]Open positions ({len(positions)}):[/bold]")
        if positions:
            table = Table()
            for col in ["Symbol", "Chain", "Entry", "Qty", "Remaining", "Stop", "Trailing", "Strategy"]:
                table.add_column(col)
            for p in positions:
                table.add_row(
                    p["symbol"],
                    p["chain_id"],
                    f"${p['entry_price']:.8g}",
                    f"{p['quantity']:.6g}",
                    f"{(p['remaining_fraction'] if p['remaining_fraction'] is not None else 1.0):.0%}",
                    f"${p['stop_loss_price']:.8g}" if p["stop_loss_price"] else "-",
                    f"${p['trailing_stop_price']:.8g}" if p["trailing_stop_price"] else "-",
                    p["strategy_name"] or "-",
                )
            console.print(table)
        else:
            console.print("[dim]none[/dim]")

        console.print(f"\n[bold]Recent trades (showing up to {args.limit}):[/bold]")
        if trades:
            table = Table()
            for col in ["Time (UTC)", "Symbol", "Side", "Price", "Qty", "Realized PnL", "Reason"]:
                table.add_column(col)
            for t in trades:
                ts_txt = datetime.fromtimestamp(t["ts"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
                pnl_txt = f"${t['realized_pnl_usd']:.2f}" if t["realized_pnl_usd"] is not None else "-"
                table.add_row(
                    ts_txt, t["symbol"], t["side"], f"${t['price']:.8g}", f"{t['quantity']:.6g}", pnl_txt,
                    t["reason"] or "",
                )
            console.print(table)
            realized_total = sum(t["realized_pnl_usd"] or 0 for t in trades)
            console.print(f"\n[bold]Realized PnL (shown trades):[/bold] ${realized_total:,.2f}")
        else:
            console.print("[dim]none[/dim]")
    finally:
        db.close()


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", default="config/default.yaml", help="Path to YAML config file")

    parser = argparse.ArgumentParser(
        prog="memebot", description="AI-assisted meme coin trading bot for DexScreener", parents=[common]
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init-db", help="Initialize the SQLite database", parents=[common])
    p_init.set_defaults(func=cmd_init_db)

    p_scan = sub.add_parser(
        "scan", help="Run one discovery+scoring pass and print a ranked report (read-only)", parents=[common]
    )
    p_scan.add_argument("--limit", type=int, default=25, help="Max rows to display")
    p_scan.add_argument("--min-score", type=float, default=None, help="Only show candidates at/above this score")
    p_scan.add_argument(
        "--loop", action="store_true",
        help="Keep scanning forever on the configured interval instead of running once (Ctrl+C to stop). "
        "Never executes trades, paper or live -- a live-updating read-only report only.",
    )
    p_scan.set_defaults(func=cmd_scan)

    p_run = sub.add_parser("run", help="Run the continuous scan/trade loop", parents=[common])
    p_run.add_argument("--paper", action="store_true", help="Force paper mode regardless of config")
    p_run.add_argument(
        "--i-understand-the-risk",
        action="store_true",
        help="Required in addition to execution.mode: 'live' in config to actually start live trading",
    )
    p_run.set_defaults(func=cmd_run)

    p_bt = sub.add_parser(
        "backtest", help="Backtest the active strategies against a pool's historical candles", parents=[common]
    )
    p_bt.add_argument("--chain", required=True, help="DexScreener chain id, e.g. solana")
    p_bt.add_argument("--pair", required=True, help="Pool/pair address")
    p_bt.add_argument("--days", type=int, default=14, help="Lookback window in days (capped at 1000 bars)")
    p_bt.set_defaults(func=cmd_backtest)

    p_report = sub.add_parser("report", help="Show current open positions and recent trades", parents=[common])
    p_report.add_argument("--limit", type=int, default=50, help="Max recent trades to show")
    p_report.set_defaults(func=cmd_report)

    p_opt = sub.add_parser(
        "optimize-weights",
        help="Search for scoring weights that historically performed best, via repeated backtests",
        parents=[common],
    )
    p_opt.add_argument("--chain", required=True, help="DexScreener chain id, e.g. solana")
    p_opt.add_argument(
        "--pair", required=True, action="append",
        help="Pool/pair address to test against (repeat --pair for multiple pools; strongly recommended, "
        "since optimizing against a single pool risks fitting its specific noise)",
    )
    p_opt.add_argument("--days", type=int, default=14, help="Lookback window in days per pool (capped at 1000 bars)")
    p_opt.add_argument(
        "--trials", type=int, default=150,
        help="Number of random weight combinations to try -- runtime scales with trials x pools x bars; "
        "the defaults (150 trials, --days 14) typically take well under a minute per pool, but a long "
        "--days with many --pair values can take several minutes",
    )
    p_opt.add_argument(
        "--min-trades", type=int, default=5,
        help="Minimum closed trades required on EVERY pool for a weight combination to count",
    )
    p_opt.add_argument(
        "--drawdown-penalty", type=float, default=0.5,
        help="Fitness penalty subtracted per 1%% of max drawdown (higher = more risk-averse search)",
    )
    p_opt.add_argument("--seed", type=int, default=42, help="Random seed -- fixed by default for reproducible results")
    p_opt.set_defaults(func=cmd_optimize_weights)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
