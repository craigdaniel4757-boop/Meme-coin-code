"""The continuous live/paper polling loop: poll each configured symbol's
latest closed candles, feed them into that symbol's strategy state machine,
and execute whatever it decides through the configured `ExecutionProvider`.
Kept separate from cli.py the same way the sibling memebot project keeps its
own scan/trade loop (`bot/scanner/screener.py`) separate from argument
parsing and table printing (`bot/cli.py`).
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, datetime
from zoneinfo import ZoneInfo

from rich.console import Console

from eightam_bot.config import AppConfig
from eightam_bot.data_feed import DataFeed
from eightam_bot.execution.base import ExecutionProvider
from eightam_bot.ml_filter import RetestFilter, extract_features
from eightam_bot.notify import notify
from eightam_bot.risk_manager import RiskConfig, check_daily_loss_limit
from eightam_bot.strategy import (
    BreakoutDetected,
    EntryFilled,
    NoTradeToday,
    Phase,
    RangeBuilt,
    SetupInvalidated,
    StrategyConfig,
    SymbolSessionRunner,
    TradeClosed,
)
from eightam_bot.timeutils import ny_date

logger = logging.getLogger(__name__)
console = Console()

POLL_INTERVAL_SECONDS = 15
CANDLES_PER_POLL = 40


def _timeframe_seconds(timeframe: str) -> int:
    unit = timeframe[-1]
    n = int(timeframe[:-1])
    mult = {"s": 1, "m": 60, "h": 3600, "d": 86400}.get(unit)
    if mult is None:
        raise ValueError(f"Unsupported timeframe unit in {timeframe!r}")
    return n * mult


def _start_of_ny_day_ts(tz: ZoneInfo) -> float:
    now_ny = datetime.now(tz)
    return now_ny.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


class LiveRunner:
    def __init__(
        self,
        cfg: AppConfig,
        strategy_cfg: StrategyConfig,
        risk_cfg: RiskConfig,
        execution: ExecutionProvider,
        feeds: dict[str, DataFeed],
        retest_filter: RetestFilter | None = None,
    ) -> None:
        self.cfg = cfg
        self.strategy_cfg = strategy_cfg
        self.risk_cfg = risk_cfg
        self.execution = execution
        self.feeds = feeds
        self.retest_filter = retest_filter

        self.runners = {symbol: SymbolSessionRunner(symbol, strategy_cfg) for symbol in cfg.market.symbols}
        self.last_seen_ts: dict[str, int] = {}
        # Per symbol: (session_date, reason) -- an ML rejection only holds
        # for the day it was computed on, cleared implicitly once the date
        # no longer matches "today".
        self.ml_skip_today: dict[str, tuple[date, str]] = {}
        self.tf_seconds = _timeframe_seconds(cfg.market.candle_timeframe)

    def _open_notional(self) -> float:
        total = 0.0
        for runner in self.runners.values():
            state = runner.state
            if state is not None and state.phase is Phase.IN_TRADE and state.trade is not None:
                total += state.trade.quantity * state.trade.entry_price
        return total

    async def _handle_entry(self, symbol: str, event: EntryFilled) -> None:
        try:
            await self.execution.enter(event.trade)
        except Exception as exc:  # noqa: BLE001 - a failed live order must not desync the state machine
            logger.error("Live entry FAILED for %s -- forcing today's setup to done: %s", symbol, exc, exc_info=True)
            runner = self.runners[symbol]
            if runner.state is not None:
                runner.state.phase = Phase.DONE
                runner.state.done_reason = f"live entry order failed: {exc}"
                runner.state.trade = None
            if self.cfg.notifications.notify_on_trade:
                await notify(f"{symbol}: LIVE ENTRY FAILED -- {exc}", self.cfg.notifications)
            return

        if self.cfg.notifications.notify_on_trade:
            await notify(
                f"ENTER {event.trade.bias.value.upper()} {symbol} @ {event.trade.entry_price:.6g} "
                f"(risk ${event.trade.risk_usd:.2f})",
                self.cfg.notifications,
            )
        console.print(
            f"[bold green]ENTER {event.trade.bias.value.upper()} {symbol}[/bold green] @ {event.trade.entry_price:.6g}"
        )

    async def _handle_exit(self, symbol: str, event: TradeClosed) -> None:
        try:
            await self.execution.exit(event.trade)
        except Exception as exc:  # noqa: BLE001 - the exchange position may still be open; surface loudly, don't crash
            logger.error(
                "Live exit order FAILED for %s (%s) -- MANUAL INTERVENTION MAY BE NEEDED, the exchange "
                "position may still be open: %s",
                symbol, event.trade.exit_reason, exc, exc_info=True,
            )
            if self.cfg.notifications.notify_on_trade:
                await notify(
                    f"{symbol}: LIVE EXIT FAILED -- check your exchange position manually -- {exc}",
                    self.cfg.notifications,
                )
            return

        if self.cfg.notifications.notify_on_trade:
            pnl = event.trade.realized_pnl_usd or 0.0
            await notify(
                f"EXIT {symbol}: {event.trade.exit_reason} @ {event.trade.exit_price:.6g} -- "
                f"PnL ${pnl:.2f} ({event.trade.r_multiple or 0.0:.2f}R)",
                self.cfg.notifications,
            )
        pnl = event.trade.realized_pnl_usd or 0.0
        color = "green" if pnl >= 0 else "red"
        console.print(f"[bold {color}]EXIT {symbol}: {event.trade.exit_reason} -- PnL ${pnl:.2f}[/bold {color}]")

    async def _handle_breakout(self, symbol: str, event: BreakoutDetected) -> None:
        console.print(
            f"[bold]{symbol}: breakout {event.breakout.bias.value.upper()}[/bold] @ {event.breakout.breakout_price:.6g}"
        )
        if self.retest_filter is not None:
            feats = extract_features(event.range, event.breakout, event.range.session_date, self.strategy_cfg.tz)
            if feats is not None:
                confidence = self.retest_filter.predict_confidence(feats)
                console.print(
                    f"[dim]{symbol}: ML confidence {confidence:.2f} "
                    f"(threshold {self.cfg.ml_filter.min_confidence:.2f})[/dim]"
                )
                if confidence < self.cfg.ml_filter.min_confidence:
                    self.ml_skip_today[symbol] = (
                        event.range.session_date,
                        f"ML confidence {confidence:.2f} below threshold {self.cfg.ml_filter.min_confidence:.2f}",
                    )
        if self.cfg.notifications.notify_on_breakout:
            await notify(
                f"{symbol}: breakout {event.breakout.bias.value.upper()} @ {event.breakout.breakout_price:.6g} "
                "-- watching for a retest of the midpoint",
                self.cfg.notifications,
            )

    async def _handle_event(self, symbol: str, event) -> None:
        if isinstance(event, RangeBuilt):
            console.print(
                f"[dim]{symbol}: 8am range {event.range.low:.6g}-{event.range.high:.6g} "
                f"(mid {event.range.midpoint:.6g})[/dim]"
            )
            if self.cfg.notifications.notify_on_range:
                await notify(
                    f"{symbol}: 8am range built {event.range.low:.6g}-{event.range.high:.6g}",
                    self.cfg.notifications,
                )
        elif isinstance(event, BreakoutDetected):
            await self._handle_breakout(symbol, event)
        elif isinstance(event, EntryFilled):
            await self._handle_entry(symbol, event)
        elif isinstance(event, TradeClosed):
            await self._handle_exit(symbol, event)
        elif isinstance(event, (SetupInvalidated, NoTradeToday)):
            logger.info("%s: %s", symbol, event.reason)

    async def poll_once(self) -> None:
        if hasattr(self.execution, "refresh_bankroll"):
            await self.execution.refresh_bankroll()

        today_ts = _start_of_ny_day_ts(self.strategy_cfg.tz)
        daily_pnl = self.execution.get_daily_realized_pnl_usd(today_ts)
        halted, breaker_reason = check_daily_loss_limit(daily_pnl, self.risk_cfg)

        for symbol in self.cfg.market.symbols:
            feed = self.feeds[symbol]
            now = time.time()
            recent = await feed.fetch_recent_candles(symbol, self.cfg.market.candle_timeframe, limit=CANDLES_PER_POLL)
            # Only feed candles whose implied close time has already
            # passed -- the most recent bar `fetch_ohlcv` returns is
            # usually still forming, and treating it as final would let the
            # strategy react to a range/breakout/retest that hasn't
            # actually happened yet.
            closed = sorted(
                (
                    c for c in recent
                    if c.timestamp + self.tf_seconds <= now and c.timestamp > self.last_seen_ts.get(symbol, 0)
                ),
                key=lambda c: c.timestamp,
            )
            for candle in closed:
                self.last_seen_ts[symbol] = candle.timestamp
                today = ny_date(candle.timestamp, self.strategy_cfg.tz)
                ml_entry = self.ml_skip_today.get(symbol)
                ml_reason = ml_entry[1] if ml_entry and ml_entry[0] == today else ""
                halt_reason = breaker_reason if halted else ml_reason

                bankroll = max(self.execution.get_bankroll_usd() - self._open_notional(), 0.0)
                events = self.runners[symbol].on_candle(
                    candle, self.risk_cfg, bankroll_usd=bankroll, halt_reason=halt_reason
                )
                for event in events:
                    await self._handle_event(symbol, event)

    async def run_forever(self) -> None:
        console.print(
            f"[bold]Watching {', '.join(self.cfg.market.symbols)} on {self.cfg.market.exchange} "
            f"({self.cfg.market.candle_timeframe}). Ctrl+C to stop.[/bold]"
        )
        while True:
            cycle_start = time.monotonic()
            try:
                await self.poll_once()
            except Exception:  # noqa: BLE001 - a bad cycle must not kill a long-running bot
                logger.exception("Polling cycle failed; will retry next cycle")
            elapsed = time.monotonic() - cycle_start
            await asyncio.sleep(max(POLL_INTERVAL_SECONDS - elapsed, 1.0))
