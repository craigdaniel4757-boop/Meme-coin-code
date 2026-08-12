"""Entry-signal strategies.

Three independent, well-established patterns rather than one "magic"
model -- each captures a different, well-documented reason a meme coin
moves. All three can fire on the same candidate; the scanner treats any one
BUY signal (combined with a passing composite score) as tradeable. See
docs/STRATEGY.md for the full rationale and known failure modes of each.

- `momentum_breakout`: price breaks above its recent trading range on a
  volume spike -- the classic "something just happened" breakout entry.
- `volume_spike_breakout`: an even more sensitive volume-first trigger for
  the earliest, sharpest part of a move, before a clean range breakout has
  necessarily formed.
- `trend_pullback`: buy a shallow dip within an already-confirmed uptrend,
  rather than chasing strength -- usually the better risk/reward of the
  three, at the cost of firing less often.
"""

from __future__ import annotations

import time

from bot.data.models import Signal, SignalAction
from bot.strategy.base import StrategyContext, StrategyFn


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def momentum_breakout(ctx: StrategyContext) -> Signal | None:
    ind = ctx.indicators
    p = ctx.params.get("momentum_breakout", {})
    lookback = p.get("breakout_lookback", 20)
    min_z = p.get("min_volume_zscore", 1.5)

    if ind.swing_high is None or ind.volume_zscore is None:
        return None
    if ind.price <= ind.swing_high:
        return None
    if ind.volume_zscore < min_z:
        return None
    if ind.macd_hist is not None and ind.macd_hist < 0:
        return None

    breakout_strength_pct = (ind.price / ind.swing_high - 1) * 100
    confidence = _clamp01(0.45 + min(breakout_strength_pct, 10) / 25 + min(ind.volume_zscore, 5) / 20)

    return Signal(
        chain_id=ctx.pair.chainId,
        pair_address=ctx.pair.pairAddress,
        symbol=ctx.pair.symbol,
        action=SignalAction.BUY,
        strategy_name="momentum_breakout",
        confidence=confidence,
        reason=(
            f"broke above {lookback}-bar swing high (+{breakout_strength_pct:.1f}%) "
            f"on a volume spike (z={ind.volume_zscore:.1f})"
        ),
        price=ind.price,
        timestamp=time.time(),
    )


def volume_spike_breakout(ctx: StrategyContext) -> Signal | None:
    ind = ctx.indicators
    p = ctx.params.get("volume_spike_breakout", {})
    min_z = p.get("min_volume_zscore", 2.5)
    max_rsi = p.get("max_rsi", 85)

    if ind.volume_zscore is None or ind.volume_zscore < min_z:
        return None
    if ind.rsi is not None and ind.rsi > max_rsi:
        return None
    price_change_5m = ctx.pair.priceChange.m5
    if price_change_5m is None or price_change_5m <= 0:
        return None

    confidence = _clamp01(0.40 + min(ind.volume_zscore, 6) / 12 + min(price_change_5m, 20) / 100)

    return Signal(
        chain_id=ctx.pair.chainId,
        pair_address=ctx.pair.pairAddress,
        symbol=ctx.pair.symbol,
        action=SignalAction.BUY,
        strategy_name="volume_spike_breakout",
        confidence=confidence,
        reason=f"volume spike (z={ind.volume_zscore:.1f}) with +{price_change_5m:.1f}% move in 5m",
        price=ind.price,
        timestamp=time.time(),
    )


def trend_pullback(ctx: StrategyContext) -> Signal | None:
    ind = ctx.indicators
    p = ctx.params.get("trend_pullback", {})
    rsi_lo = p.get("rsi_pullback_low", 38)
    rsi_hi = p.get("rsi_pullback_high", 52)

    if None in (ind.ema_fast, ind.ema_mid, ind.ema_slow, ind.rsi):
        return None
    uptrend = ind.ema_fast > ind.ema_mid > ind.ema_slow
    if not uptrend:
        return None
    if ind.price < ind.ema_slow:
        return None  # trend structure broken -- this is no longer a pullback
    if not (rsi_lo <= ind.rsi <= rsi_hi):
        return None

    confidence = _clamp01(0.5 + (ind.ema_fast_slope or 0.0) / 40)

    return Signal(
        chain_id=ctx.pair.chainId,
        pair_address=ctx.pair.pairAddress,
        symbol=ctx.pair.symbol,
        action=SignalAction.BUY,
        strategy_name="trend_pullback",
        confidence=confidence,
        reason=f"pullback to RSI {ind.rsi:.0f} within a confirmed uptrend (bullish EMA stack intact)",
        price=ind.price,
        timestamp=time.time(),
    )


STRATEGIES: dict[str, StrategyFn] = {
    "momentum_breakout": momentum_breakout,
    "volume_spike_breakout": volume_spike_breakout,
    "trend_pullback": trend_pullback,
}


def run_strategies(ctx: StrategyContext, active: list[str]) -> list[Signal]:
    signals: list[Signal] = []
    for name in active:
        fn = STRATEGIES.get(name)
        if fn is None:
            continue
        signal = fn(ctx)
        if signal is not None:
            signals.append(signal)
    return signals
