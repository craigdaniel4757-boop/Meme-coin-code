"""Historical replay: run the same indicators -> strategies -> risk-manager
logic used live, bar-by-bar over recorded/fetched OHLCV history for a
single pair, and produce a trade log + equity curve. This is how claims
about a strategy's win rate should be checked -- against data, not vibes.

Stated plainly, the limitations: this fills signals at the *current* bar's
close (not a future bar's open, so there's no execution lag modeled),
applies a flat simulated slippage/fee instead of a real order book, and
cannot account for the price impact the bot's own hypothetical order would
have had, or for a token's liquidity having been pulled entirely (a rug)
in ways that differ from what the recorded price series shows. Treat
results as a relative comparison between strategies/parameters, not a
promise of live performance -- see docs/STRATEGY.md.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from bot.analysis.indicators import IndicatorParams, compute_indicator_series, snapshot_from_series_row
from bot.data.models import DexPair, Liquidity, TokenRef, Trade, WindowedFloats
from bot.strategy.base import StrategyContext
from bot.strategy.risk_manager import RiskConfig, create_position, evaluate_exits, size_position
from bot.strategy.signals import run_strategies


@dataclass(slots=True)
class BacktestResult:
    trades: list[Trade]
    equity_curve: list[tuple[int, float]]  # (timestamp, equity_usd)
    starting_equity_usd: float
    final_equity_usd: float


def _synthetic_pair(symbol: str, chain_id: str, price: float) -> DexPair:
    """Strategies read `ctx.pair` for a couple of fields DexScreener
    provides but a bare OHLCV history doesn't (5m price change, boosts,
    socials). A backtest has no historical feed for those, so they're
    fixed placeholders here -- only the candle-driven indicators (which do
    vary bar to bar) drive entries in a backtest. `volume_spike_breakout`
    in particular needs `priceChange.m5`, which is approximated from the
    bar's own move; treat single-strategy backtests with that caveat, and
    prefer `momentum_breakout`/`trend_pullback` (purely candle-driven) for
    the most trustworthy backtest results.
    """
    return DexPair(
        chainId=chain_id,
        dexId="backtest",
        pairAddress="backtest",
        baseToken=TokenRef(address="backtest", name=symbol, symbol=symbol),
        quoteToken=TokenRef(address="", name="", symbol=""),
        priceUsd=str(price),
        liquidity=Liquidity(usd=50_000.0),
        volume=WindowedFloats(h24=50_000.0),
    )


def run_backtest(
    df: pd.DataFrame,
    symbol: str,
    chain_id: str,
    indicator_params: IndicatorParams,
    strategy_params: dict,
    active_strategies: list[str],
    risk_cfg: RiskConfig,
    starting_bankroll_usd: float = 1000.0,
    simulated_slippage_bps: float = 60.0,
    simulated_fee_bps: float = 30.0,
    warmup_bars: int = 50,
) -> BacktestResult:
    if df is None or len(df) < warmup_bars + 2:
        return BacktestResult([], [], starting_bankroll_usd, starting_bankroll_usd)

    df = df.reset_index(drop=True)
    series = compute_indicator_series(df, indicator_params)

    cash = starting_bankroll_usd
    open_position = None
    trades: list[Trade] = []
    equity_curve: list[tuple[int, float]] = []

    for i in range(warmup_bars, len(df)):
        bar = df.iloc[i]
        ts = int(bar["timestamp"])
        price = float(bar["close"])
        if price <= 0:
            continue
        indicators = snapshot_from_series_row(series, i)

        if open_position is not None:
            for action in evaluate_exits(open_position, price, risk_cfg, now=ts):
                fill_price = price * (1 - simulated_slippage_bps / 10_000)
                qty = open_position.quantity * action.fraction
                proceeds = qty * fill_price
                fee = proceeds * simulated_fee_bps / 10_000
                realized = proceeds - qty * open_position.entry_price - fee
                cash += proceeds - fee
                open_position.remaining_fraction -= action.fraction
                trades.append(
                    Trade(
                        id=f"bt-sell-{len(trades)}",
                        position_id=open_position.id,
                        chain_id=chain_id,
                        pair_address="backtest",
                        symbol=symbol,
                        side="sell",
                        price=fill_price,
                        quantity=qty,
                        fee_usd=fee,
                        timestamp=ts,
                        reason=action.reason,
                        realized_pnl_usd=realized,
                    )
                )
                if open_position.remaining_fraction <= 1e-6:
                    open_position = None

        elif indicators.num_candles >= warmup_bars:
            pair = _synthetic_pair(symbol, chain_id, price)
            ctx = StrategyContext(pair=pair, candles=df.iloc[: i + 1], indicators=indicators, params=strategy_params)
            signals = run_strategies(ctx, active_strategies)
            if signals:
                sizing = size_position(cash, price, risk_cfg)
                if sizing.notional_usd > 0:
                    fill_price = price * (1 + simulated_slippage_bps / 10_000)
                    fee = sizing.notional_usd * simulated_fee_bps / 10_000
                    quantity = sizing.notional_usd / fill_price
                    cash -= sizing.notional_usd + fee
                    open_position = create_position(
                        chain_id, "backtest", "backtest", symbol, fill_price, quantity,
                        signals[0].strategy_name, risk_cfg,
                    )
                    trades.append(
                        Trade(
                            id=f"bt-buy-{len(trades)}",
                            position_id=open_position.id,
                            chain_id=chain_id,
                            pair_address="backtest",
                            symbol=symbol,
                            side="buy",
                            price=fill_price,
                            quantity=quantity,
                            fee_usd=fee,
                            timestamp=ts,
                            reason=signals[0].reason,
                        )
                    )

        held_value = 0.0
        if open_position is not None:
            held_value = open_position.quantity * open_position.remaining_fraction * price
        equity_curve.append((ts, cash + held_value))

    final_equity = equity_curve[-1][1] if equity_curve else starting_bankroll_usd
    return BacktestResult(
        trades=trades,
        equity_curve=equity_curve,
        starting_equity_usd=starting_bankroll_usd,
        final_equity_usd=final_equity,
    )
