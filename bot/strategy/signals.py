"""Entry-signal strategies.

Four independent, well-established patterns rather than one "magic"
model -- each captures a different, well-documented reason a meme coin
moves. All four can fire on the same candidate; the scanner treats
`risk.min_agreeing_strategies` of them agreeing (default 1 -- any one) as
tradeable. See docs/STRATEGY.md for the full rationale and known failure
modes of each.

- `momentum_breakout`: price breaks above its recent trading range on a
  volume spike -- the classic "something just happened" breakout entry.
- `volume_spike_breakout`: an even more sensitive volume-first trigger for
  the earliest, sharpest part of a move, before a clean range breakout has
  necessarily formed.
- `trend_pullback`: buy a shallow dip within an already-confirmed uptrend,
  rather than chasing strength -- usually the better risk/reward of the
  three, at the cost of firing less often.
- `bollinger_squeeze_breakout`: enters on the *initial* expansion out of a
  low-volatility squeeze, rather than a move already underway -- a
  volatility contraction (tight Bollinger bands) frequently precedes a
  sharp directional move, and catching it right as it starts is a higher-
  quality setup than the other two breakout strategies' "already moving"
  entries, at the cost of needing a genuine prior squeeze to fire at all.
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
    require_retest = p.get("require_retest", False)
    min_adx = p.get("min_adx", 0.0)

    if ind.swing_high is None or ind.volume_zscore is None:
        return None
    if ind.price <= ind.swing_high:
        return None
    if ind.volume_zscore < min_z:
        return None
    if ind.macd_hist is not None and ind.macd_hist < 0:
        return None
    # Optional, stricter mode: instead of buying the initial break, require
    # price to have pulled back near the level and reclaimed it -- see
    # `breakout_retest_confirmed` in bot/analysis/indicators.py. Off by
    # default (preserves "buy the initial break"); fewer signals when on,
    # since a straight-line breakout that never looks back won't qualify.
    if require_retest and not ind.breakout_retest_confirmed:
        return None
    # Optional trend-strength gate: ADX measures how strong the current
    # trend is, independent of direction (bot/analysis/indicators.py).
    # Off by default (min_adx=0.0 always passes). Fails *open*, not
    # closed, when ADX isn't computable yet (too little history) -- the
    # same asymmetry higher-timeframe confirmation uses: this is a trade-
    # quality filter, not a safety gate, so "can't confirm yet" shouldn't
    # block a young coin's first real signal.
    if min_adx > 0 and ind.adx is not None and ind.adx < min_adx:
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


def bollinger_squeeze_breakout(ctx: StrategyContext) -> Signal | None:
    ind = ctx.indicators
    p = ctx.params.get("bollinger_squeeze_breakout", {})
    expansion_multiple = p.get("expansion_multiple", 1.8)
    min_volume_zscore = p.get("min_volume_zscore", 1.0)

    if ind.bb_bandwidth is None or ind.bb_bandwidth_min_recent is None or ind.bb_bandwidth_min_recent <= 0:
        return None
    if ind.bb_upper is None:
        return None

    expansion_ratio = ind.bb_bandwidth / ind.bb_bandwidth_min_recent
    if expansion_ratio < expansion_multiple:
        return None  # bandwidth hasn't actually expanded out of the recent squeeze yet
    if ind.price <= ind.bb_upper:
        return None  # expansion alone isn't a signal -- require a genuine break above the upper band
    if ind.volume_zscore is not None and ind.volume_zscore < min_volume_zscore:
        return None

    confidence = _clamp01(0.4 + min(expansion_ratio, 4.0) / 10 + min(ind.volume_zscore or 0.0, 5) / 20)

    return Signal(
        chain_id=ctx.pair.chainId,
        pair_address=ctx.pair.pairAddress,
        symbol=ctx.pair.symbol,
        action=SignalAction.BUY,
        strategy_name="bollinger_squeeze_breakout",
        confidence=confidence,
        reason=(
            f"broke above the upper Bollinger band on a volatility expansion out of a squeeze "
            f"({expansion_ratio:.1f}x the recent low bandwidth)"
        ),
        price=ind.price,
        timestamp=time.time(),
    )


STRATEGIES: dict[str, StrategyFn] = {
    "momentum_breakout": momentum_breakout,
    "volume_spike_breakout": volume_spike_breakout,
    "trend_pullback": trend_pullback,
    "bollinger_squeeze_breakout": bollinger_squeeze_breakout,
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
