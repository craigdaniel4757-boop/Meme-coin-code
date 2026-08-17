"""Historical replay: run the exact same strategy state machine used live,
bar-by-bar, over historical 1-minute candles for one or more symbols, and
produce a trade log + equity curve. This is how claims about the strategy's
win rate should be checked -- against data, not a YouTube P&L screenshot.

Reuses `SymbolSessionRunner`/`process_candle` (strategy.py) and
`apply_entry_fill`/`apply_exit_fill` (execution/paper.py) completely
unmodified, so a backtest result reflects the exact same range/breakout/
retest/stop/target logic and fill economics a paper or live run would
apply -- not a separate, possibly-drifted reimplementation. See
docs/STRATEGY.md #4 for what this does and doesn't model realistically
(no execution lag beyond one bar, flat slippage/fee assumptions, no
partial fills).

Symbols are replayed on a single shared, merged timeline (every symbol's
candles sorted together by timestamp) rather than one at a time, so that
`risk.starting_bankroll_usd` and the daily-loss circuit breaker are shared
across all of them exactly as they would be in a live multi-symbol run --
see risk_manager.check_daily_loss_limit's docstring for why that sharing
matters.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from eightam_bot.execution.paper import apply_entry_fill, apply_exit_fill
from eightam_bot.models import Candle, Trade
from eightam_bot.risk_manager import RiskConfig, check_daily_loss_limit
from eightam_bot.strategy import EntryFilled, Phase, StrategyConfig, SymbolSessionRunner, TradeClosed
from eightam_bot.timeutils import ny_date


@dataclass(slots=True)
class BacktestResult:
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[tuple[int, float]] = field(default_factory=list)  # (timestamp, equity_usd)
    starting_equity_usd: float = 0.0
    final_equity_usd: float = 0.0
    runners: dict[str, SymbolSessionRunner] = field(default_factory=dict)


def _open_notional(runners: dict[str, SymbolSessionRunner]) -> float:
    total = 0.0
    for runner in runners.values():
        state = runner.state
        if state is not None and state.phase is Phase.IN_TRADE and state.trade is not None:
            total += state.trade.quantity * state.trade.entry_price
    return total


def run_backtest(
    candles_by_symbol: dict[str, list[Candle]],
    strategy_cfg: StrategyConfig,
    risk_cfg: RiskConfig,
    simulated_slippage_bps: float = 5.0,
    simulated_fee_bps: float = 4.0,
) -> BacktestResult:
    runners = {symbol: SymbolSessionRunner(symbol, strategy_cfg) for symbol in candles_by_symbol}
    if not candles_by_symbol or not any(candles_by_symbol.values()):
        return BacktestResult(
            starting_equity_usd=risk_cfg.starting_bankroll_usd,
            final_equity_usd=risk_cfg.starting_bankroll_usd,
            runners=runners,
        )

    timeline: list[tuple[str, Candle]] = [
        (symbol, candle) for symbol, candles in candles_by_symbol.items() for candle in candles
    ]
    timeline.sort(key=lambda pair: pair[1].timestamp)

    realized_pnl_total = 0.0
    trades: list[Trade] = []
    equity_curve: list[tuple[int, float]] = []
    daily_realized_pnl: dict = {}  # NY date -> realized PnL so far that day, across every symbol

    for symbol, candle in timeline:
        runner = runners[symbol]
        today = ny_date(candle.timestamp, strategy_cfg.tz)
        halted, halt_reason = check_daily_loss_limit(daily_realized_pnl.get(today, 0.0), risk_cfg)

        bankroll = max(risk_cfg.starting_bankroll_usd + realized_pnl_total - _open_notional(runners), 0.0)
        events = runner.on_candle(candle, risk_cfg, bankroll_usd=bankroll, halt_reason=halt_reason if halted else "")

        for event in events:
            if isinstance(event, EntryFilled):
                apply_entry_fill(event.trade, simulated_fee_bps)
            elif isinstance(event, TradeClosed):
                apply_exit_fill(event.trade, simulated_slippage_bps, simulated_fee_bps)
                trades.append(event.trade)
                pnl = event.trade.realized_pnl_usd or 0.0
                realized_pnl_total += pnl
                daily_realized_pnl[today] = daily_realized_pnl.get(today, 0.0) + pnl

        equity_curve.append((candle.timestamp, risk_cfg.starting_bankroll_usd + realized_pnl_total))

    final_equity = equity_curve[-1][1] if equity_curve else risk_cfg.starting_bankroll_usd
    return BacktestResult(
        trades=trades,
        equity_curve=equity_curve,
        starting_equity_usd=risk_cfg.starting_bankroll_usd,
        final_equity_usd=final_equity,
        runners=runners,
    )
