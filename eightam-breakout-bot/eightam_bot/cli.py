"""Command-line entrypoint: `python -m eightam_bot <command>`.

Live trading requires two independent, explicit opt-ins before a single
real order can be placed: `execution.mode: "live"` in the config file, AND
the `--i-understand-the-risk` flag on `live`. Either alone is not enough --
deliberate friction, see README.md "Live trading".
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console
from rich.table import Table

from eightam_bot.backtest.engine import run_backtest
from eightam_bot.backtest.metrics import PerformanceMetrics, compute_metrics
from eightam_bot.config import AppConfig, build_risk_config, build_strategy_config, exchange_credentials, load_config
from eightam_bot.data_feed import CCXTDataFeed, CSVDataFeed, DataFeed, YFinanceDataFeed
from eightam_bot.execution.base import ExecutionProvider
from eightam_bot.execution.ccxt_live import CcxtLiveExecutionProvider, LiveTradingError
from eightam_bot.execution.paper import PaperExecutionProvider
from eightam_bot.journal import TradeJournal
from eightam_bot.logging_setup import setup_logging
from eightam_bot.ml_filter import RetestFilter, build_training_set
from eightam_bot.models import Candle
from eightam_bot.runner import LiveRunner

console = Console()


def _load(config_path: str) -> AppConfig:
    cfg = load_config(config_path)
    setup_logging(cfg.general.log_level)
    return cfg


def _resolve_backtest_window(args: argparse.Namespace) -> tuple[int, int]:
    """`--days` (the default) is relative to *now* -- right for backtesting
    a live exchange via ccxt, but meaningless against a `data.csv_paths`
    file whose data is from an arbitrary, possibly long-past date range.
    `--start`/`--end` (ISO dates) override it for exactly that case."""
    until_ts = (
        int(datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc).timestamp())
        if args.end
        else int(time.time())
    )
    since_ts = (
        int(datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc).timestamp())
        if args.start
        else until_ts - args.days * 86400
    )
    return since_ts, until_ts


async def _fetch_backtest_candles(cfg: AppConfig, since_ts: int, until_ts: int) -> dict[str, list[Candle]]:
    """A per-symbol `data.csv_paths` entry always wins; otherwise falls back
    to whichever of the two live data sources `market.data_source` names.
    Both `CCXTDataFeed` and `YFinanceDataFeed` are created at most once and
    shared across every symbol that needs them, mirroring how a single
    exchange/API connection naturally serves several symbols."""
    out: dict[str, list[Candle]] = {}
    ccxt_feed: CCXTDataFeed | None = None
    yfinance_feed: YFinanceDataFeed | None = None
    try:
        for symbol in cfg.market.symbols:
            csv_path = cfg.data.csv_paths.get(symbol)
            feed: DataFeed
            if csv_path:
                feed = CSVDataFeed(csv_path)
            elif cfg.market.data_source == "yfinance":
                if yfinance_feed is None:
                    yfinance_feed = YFinanceDataFeed()
                feed = yfinance_feed
            else:
                if ccxt_feed is None:
                    ccxt_feed = CCXTDataFeed(cfg.market.exchange, market_type=cfg.execution.live.market_type)
                feed = ccxt_feed
            out[symbol] = await feed.fetch_historical_candles(symbol, cfg.market.candle_timeframe, since_ts, until_ts)
    finally:
        if ccxt_feed is not None:
            await ccxt_feed.close()
        if yfinance_feed is not None:
            await yfinance_feed.close()
    return out


def _print_metrics_table(metrics: PerformanceMetrics, symbols: list[str], since_ts: int, until_ts: int) -> None:
    start_str = datetime.fromtimestamp(since_ts, tz=timezone.utc).date().isoformat()
    end_str = datetime.fromtimestamp(until_ts, tz=timezone.utc).date().isoformat()
    table = Table(title=f"Backtest: {', '.join(symbols)} -- {start_str} to {end_str}")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for name, value in [
        ("Total closed trades", str(metrics.total_trades)),
        ("Wins / Losses", f"{metrics.wins} / {metrics.losses}"),
        ("Win rate", f"{metrics.win_rate_pct:.1f}%"),
        ("Total realized PnL", f"${metrics.total_realized_pnl_usd:,.2f}"),
        ("Avg win / Avg loss", f"${metrics.avg_win_usd:,.2f} / ${metrics.avg_loss_usd:,.2f}"),
        ("Profit factor", f"{metrics.profit_factor:.2f}"),
        ("Expectancy / trade", f"${metrics.expectancy_usd:,.2f}"),
        ("Avg R multiple", f"{metrics.avg_r_multiple:.2f}R"),
        ("Max drawdown", f"{metrics.max_drawdown_pct:.1f}%"),
        ("Total return", f"{metrics.total_return_pct:.1f}%"),
        ("Sharpe-like ratio", f"{metrics.sharpe_like_ratio:.2f}"),
    ]:
        table.add_row(name, value)
    console.print(table)
    console.print(
        "\n[dim]A backtest is a sanity check against historical data, not a promise of future "
        "performance -- see docs/STRATEGY.md.[/dim]"
    )


def _save_equity_curve_chart(equity_curve: list[tuple[int, float]], path: str) -> None:
    if not equity_curve:
        return
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    xs = [datetime.fromtimestamp(ts, tz=timezone.utc) for ts, _ in equity_curve]
    ys = [eq for _, eq in equity_curve]
    Path(path).parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(xs, ys)
    ax.set_title("eightam-breakout-bot equity curve")
    ax.set_ylabel("Account equity (USD)")
    ax.grid(True, alpha=0.3)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    console.print(f"Saved equity curve chart to {path}")


def cmd_backtest(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    strategy_cfg = build_strategy_config(cfg)
    risk_cfg = build_risk_config(cfg)

    since_ts, until_ts = _resolve_backtest_window(args)

    candles_by_symbol = asyncio.run(_fetch_backtest_candles(cfg, since_ts, until_ts))
    for symbol, candles in candles_by_symbol.items():
        if len(candles) < 200:
            console.print(
                f"[yellow]{symbol}: only {len(candles)} candles fetched for the requested window -- "
                "results may not be meaningful. If backtesting a CSV file, check --start/--end match "
                "the data it actually contains.[/yellow]"
            )

    result = run_backtest(
        candles_by_symbol, strategy_cfg, risk_cfg,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
    )
    metrics = compute_metrics(result)
    _print_metrics_table(metrics, cfg.market.symbols, since_ts, until_ts)

    if args.report_dir:
        report_journal = TradeJournal(f"{args.report_dir}/trades.csv")
        for trade in result.trades:
            report_journal.record_trade(trade)
        _save_equity_curve_chart(result.equity_curve, f"{args.report_dir}/equity_curve.png")
        console.print(f"Saved {len(result.trades)} trade(s) to {args.report_dir}/trades.csv")


def cmd_train_filter(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    strategy_cfg = build_strategy_config(cfg)
    risk_cfg = build_risk_config(cfg)

    since_ts, until_ts = _resolve_backtest_window(args)
    candles_by_symbol = asyncio.run(_fetch_backtest_candles(cfg, since_ts, until_ts))

    result = run_backtest(
        candles_by_symbol, strategy_cfg, risk_cfg,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
    )
    all_days = [day for runner in result.runners.values() for day in runner.all_days()]
    features, labels = build_training_set(all_days, strategy_cfg.tz)

    if not features:
        console.print(
            "[red]No closed trades in this window to train on -- widen --days or configure more symbols.[/red]"
        )
        return

    model = RetestFilter.train(features, labels)
    model.save(cfg.ml_filter.model_path)
    console.print(f"[green]Trained the retest filter on {len(features)} closed trade(s).[/green]")
    console.print(f"Saved to {cfg.ml_filter.model_path}. Set ml_filter.enabled: true in your config to use it.")


def _build_execution(cfg: AppConfig, journal: TradeJournal, live_confirmed: bool) -> ExecutionProvider:
    if cfg.execution.mode == "live":
        if not live_confirmed:
            console.print(
                "[red]execution.mode is 'live' but --i-understand-the-risk was not passed. "
                "Refusing to start live trading.[/red]"
            )
            sys.exit(1)
        try:
            return CcxtLiveExecutionProvider(
                exchange_id=cfg.market.exchange,
                credentials=exchange_credentials(),
                journal=journal,
                market_type=cfg.execution.live.market_type,
                max_slippage_bps=cfg.execution.live.max_slippage_bps,
            )
        except LiveTradingError as exc:
            console.print(f"[red]Cannot start live trading: {exc}[/red]")
            sys.exit(1)
    return PaperExecutionProvider(
        journal=journal,
        starting_balance_usd=cfg.risk.starting_bankroll_usd,
        simulated_slippage_bps=cfg.execution.paper.simulated_slippage_bps,
        simulated_fee_bps=cfg.execution.paper.simulated_fee_bps,
    )


def _load_retest_filter(cfg: AppConfig) -> RetestFilter | None:
    if not cfg.ml_filter.enabled:
        return None
    try:
        model = RetestFilter.load(cfg.ml_filter.model_path)
        console.print(f"Loaded retest filter model from {cfg.ml_filter.model_path}")
        return model
    except FileNotFoundError:
        console.print(
            f"[yellow]ml_filter.enabled is true but no model found at {cfg.ml_filter.model_path} -- "
            "run `train-filter` first. Continuing without it.[/yellow]"
        )
        return None


async def _run(cfg: AppConfig, live_confirmed: bool) -> None:
    if cfg.market.data_source != "ccxt":
        console.print(
            f"[red]market.data_source is '{cfg.market.data_source}', but paper/live trading needs both "
            "real-time data AND order execution -- only 'ccxt' (a crypto exchange) provides both right "
            "now. yfinance is read-only and backtest-only (`backtest`/`train-filter`). Set "
            "market.data_source: \"ccxt\" and market.symbols to a crypto pair to run paper/live.[/red]"
        )
        sys.exit(1)

    strategy_cfg = build_strategy_config(cfg)
    risk_cfg = build_risk_config(cfg)
    journal = TradeJournal(cfg.storage.journal_csv_path)
    execution = _build_execution(cfg, journal, live_confirmed)
    retest_filter = _load_retest_filter(cfg)

    # Live/paper polling always needs a real exchange connection for
    # up-to-the-minute candles, regardless of `data.csv_paths` -- CSV is a
    # static historical file and can't answer "what just happened."  One
    # connection serves every configured symbol.
    live_feed = CCXTDataFeed(cfg.market.exchange, market_type=cfg.execution.live.market_type)
    feeds = {symbol: live_feed for symbol in cfg.market.symbols}

    runner = LiveRunner(cfg, strategy_cfg, risk_cfg, execution, feeds, retest_filter)
    try:
        await runner.run_forever()
    finally:
        await live_feed.close()
        await execution.close()


def cmd_paper(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    cfg.execution.mode = "paper"  # the `paper` subcommand always simulates, regardless of config
    try:
        asyncio.run(_run(cfg, live_confirmed=False))
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped.[/yellow]")


def cmd_live(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    if cfg.execution.mode != "live":
        console.print(
            "[red]You ran the `live` subcommand, but execution.mode in your config is still "
            f"'{cfg.execution.mode}'. Set execution.mode: \"live\" in your config file (in addition to "
            "--i-understand-the-risk) to actually place real orders.[/red]"
        )
        sys.exit(1)
    try:
        asyncio.run(_run(cfg, live_confirmed=args.i_understand_the_risk))
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped.[/yellow]")


def cmd_report(args: argparse.Namespace) -> None:
    cfg = _load(args.config)
    journal = TradeJournal(cfg.storage.journal_csv_path)
    trades = journal.load_trades()
    bankroll = cfg.risk.starting_bankroll_usd + journal.total_realized_pnl_usd()

    console.print(f"[bold]Bankroll:[/bold] ${bankroll:,.2f} (started at ${cfg.risk.starting_bankroll_usd:,.2f})")
    console.print(f"[bold]Closed trades:[/bold] {len(trades)}\n")
    if not trades:
        return

    table = Table()
    for col in ["Date", "Symbol", "Bias", "Entry", "Exit", "Reason", "PnL", "R"]:
        table.add_column(col)
    for t in trades[-args.limit :]:
        pnl_txt = f"${t.realized_pnl_usd:,.2f}" if t.realized_pnl_usd is not None else "-"
        r_txt = f"{t.r_multiple:.2f}R" if t.r_multiple is not None else "-"
        table.add_row(
            t.session_date.isoformat(), t.symbol, t.bias.value.upper(), f"{t.entry_price:.6g}",
            f"{t.exit_price:.6g}" if t.exit_price is not None else "-", t.exit_reason or "-", pnl_txt, r_txt,
        )
    console.print(table)


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", default="config/default.yaml", help="Path to YAML config file")

    window = argparse.ArgumentParser(add_help=False)
    window.add_argument(
        "--days", type=int, default=60,
        help="Lookback window in days, relative to now (ignored if --start is given)",
    )
    window.add_argument(
        "--start", default=None,
        help="ISO date (e.g. 2024-01-01), UTC. Overrides --days -- use this instead when backtesting a "
        "data.csv_paths file, since its data is unlikely to be from the last --days days of wall-clock time",
    )
    window.add_argument("--end", default=None, help="ISO date (e.g. 2024-06-01), UTC. Defaults to now")

    parser = argparse.ArgumentParser(
        prog="eightam_bot", description="8am break-and-retest strategy bot", parents=[common]
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_bt = sub.add_parser(
        "backtest", help="Backtest the strategy against historical candles", parents=[common, window]
    )
    p_bt.add_argument("--report-dir", default=None, help="If set, save a trades CSV + equity curve chart here")
    p_bt.set_defaults(func=cmd_backtest)

    p_train = sub.add_parser(
        "train-filter",
        help="Backtest, then train the optional ML retest-confidence filter on the results",
        parents=[common, window],
    )
    p_train.set_defaults(func=cmd_train_filter, days=180)  # more history than the `backtest` default -- more trades to train on

    p_paper = sub.add_parser(
        "paper", help="Run the continuous paper-trading loop (simulated fills, no real funds)", parents=[common]
    )
    p_paper.set_defaults(func=cmd_paper)

    p_live = sub.add_parser("live", help="Run the continuous LIVE trading loop (real funds)", parents=[common])
    p_live.add_argument(
        "--i-understand-the-risk",
        action="store_true",
        help="Required in addition to execution.mode: \"live\" in config to actually start live trading",
    )
    p_live.set_defaults(func=cmd_live)

    p_report = sub.add_parser("report", help="Show bankroll and recent closed trades", parents=[common])
    p_report.add_argument("--limit", type=int, default=30, help="Max recent trades to show")
    p_report.set_defaults(func=cmd_report)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
