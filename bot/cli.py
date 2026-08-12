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

from bot.backtest.engine import run_backtest
from bot.backtest.metrics import compute_metrics
from bot.config import AppConfig, build_indicator_params, build_risk_config, load_config
from bot.data.candles import CandleProvider
from bot.data.dexscreener import DexScreenerClient
from bot.data.geckoterminal import GeckoTerminalClient
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


def cmd_scan(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    db = Database(cfg.storage.sqlite_path)
    try:
        candidates = asyncio.run(_run_scan_once(cfg, db))
    finally:
        db.close()

    table = Table(title=f"memebot scan -- {len(candidates)} candidates analyzed")
    for col, justify in [
        ("Symbol", None), ("Chain", None), ("Score", "right"), ("Safety", None),
        ("Price", "right"), ("Liquidity", "right"), ("24h Vol", "right"), ("Signals", None),
    ]:
        table.add_column(col, justify=justify or "left")

    shown = 0
    for c in candidates:
        if args.min_score is not None and (not c.score or c.score.total < args.min_score):
            continue
        score_txt = f"{c.score.total:.0f}" if c.score else "-"
        safety_txt = "[green]OK[/green]" if c.safety.passed else "[red]FAIL[/red]"
        price_txt = f"${c.pair.price_usd:.8g}" if c.pair.price_usd else "-"
        liq_txt = f"${c.pair.liquidity.usd:,.0f}" if c.pair.liquidity.usd else "-"
        vol_txt = f"${c.pair.volume.h24:,.0f}" if c.pair.volume.h24 else "-"
        signals_txt = ", ".join(s.strategy_name for s in c.signals) or "-"
        table.add_row(
            c.pair.symbol, c.pair.chainId, score_txt, safety_txt, price_txt, liq_txt, vol_txt, signals_txt
        )
        shown += 1
        if shown >= args.limit:
            break

    console.print(table)
    if candidates and candidates[0].score:
        top = candidates[0]
        console.print(f"\n[bold]Top candidate:[/bold] {top.pair.symbol} ({top.pair.chainId}) -- score {top.score.total:.1f}")
        for note in top.score.notes:
            console.print(f"  - {note}")


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


async def _run_forever(cfg: AppConfig, db: Database, live_confirmed: bool) -> None:
    execution = _build_execution(cfg, db, live_confirmed)
    mode = "LIVE (real funds)" if cfg.execution.mode == "live" else "paper (simulated)"
    console.print(
        f"[bold]Starting memebot in {mode} mode.[/bold] "
        f"Scan interval: {cfg.scanner.scan_interval_seconds}s. Ctrl+C to stop."
    )
    async with Scanner(cfg, db, execution) as scanner:
        await scanner.run_forever()


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


async def _fetch_backtest_candles(cfg: AppConfig, chain_id: str, pair_address: str, days: int):
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

    interval = 3600 if days > 3 else 300  # coarser bars for longer windows keeps bar counts sane
    limit = min(int(days * 86400 / interval), 1000)  # GeckoTerminal caps a single request at 1000 bars

    symbol = pair_address[:8]
    async with dex, gecko:
        pair = await dex.get_pair(chain_id, pair_address)
        if pair is not None and pair.symbol:
            symbol = pair.symbol
        df = await provider.get_candles(chain_id, pair_address, interval_seconds=interval, limit=limit)
    db.close()
    return df, symbol


def cmd_backtest(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    df, symbol = asyncio.run(_fetch_backtest_candles(cfg, args.chain, args.pair, args.days))
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
        "\n[dim]A backtest is a sanity check against historical data, not a promise of "
        "future performance -- see docs/STRATEGY.md.[/dim]"
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

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
