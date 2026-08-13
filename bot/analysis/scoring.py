"""Composite 0-100 scoring model combining trend, momentum, volume,
volatility, liquidity/safety, and social factors into a single ranked
signal, with a full per-factor breakdown for transparency.

This is deliberately explainable rather than a black box: every sub-score
returns human-readable notes explaining *why* it landed where it did, so a
`scan` report shows not just "score 74" but "why 74." See
docs/STRATEGY.md for the reasoning behind each factor and its default
weight.

Missing data (a coin too new to have enough candle history, or an indicator
that needs more bars than are available) resolves to a neutral 50 for that
sub-score rather than 0 -- a brand-new coin shouldn't be scored as if it
were actively bearish just because history is thin. It also won't score
artificially high: neutral pulls the composite toward the middle, not the top.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from bot.data.models import DexPair, IndicatorSnapshot, SafetyResult, ScoreBreakdown
from bot.data.solana_safety import HolderConcentration


@dataclass(slots=True)
class ScoringWeights:
    trend: float = 0.25
    momentum: float = 0.20
    volume: float = 0.20
    volatility: float = 0.10
    liquidity_safety: float = 0.15
    social: float = 0.10

    def normalized(self) -> "ScoringWeights":
        total = (
            self.trend + self.momentum + self.volume + self.volatility
            + self.liquidity_safety + self.social
        )
        if total <= 0:
            raise ValueError("scoring weights must sum to a positive number")
        return ScoringWeights(
            trend=self.trend / total,
            momentum=self.momentum / total,
            volume=self.volume / total,
            volatility=self.volatility / total,
            liquidity_safety=self.liquidity_safety / total,
            social=self.social / total,
        )


def _linear_scale(
    value: float | None,
    lo: float,
    hi: float,
    out_lo: float = 0.0,
    out_hi: float = 100.0,
    default: float = 50.0,
) -> float:
    """Map value from [lo, hi] to [out_lo, out_hi], clamped at the ends.
    Works when hi < lo too (inverted scales). `value=None` -> `default`."""
    if value is None or hi == lo:
        return default
    t = (value - lo) / (hi - lo)
    t = max(0.0, min(1.0, t))
    return out_lo + t * (out_hi - out_lo)


def _trend_score(ind: IndicatorSnapshot) -> tuple[float, list[str]]:
    if ind.ema_fast is None or ind.ema_mid is None or ind.ema_slow is None:
        return 50.0, ["trend: insufficient history"]

    notes: list[str] = []
    alignment_points = sum(
        [ind.price > ind.ema_fast, ind.ema_fast > ind.ema_mid, ind.ema_mid > ind.ema_slow]
    )
    alignment_score = alignment_points / 3 * 60
    slope_score = _linear_scale(ind.ema_fast_slope, lo=-8.0, hi=8.0, out_lo=0.0, out_hi=40.0, default=20.0)

    if alignment_points == 3:
        notes.append("full bullish EMA stack (price > fast > mid > slow)")
    elif alignment_points == 0:
        notes.append("bearish EMA stack")

    if ind.vwap is not None:
        notes.append("price above rolling VWAP" if ind.price > ind.vwap else "price below rolling VWAP")

    return alignment_score + slope_score, notes


def _momentum_score(ind: IndicatorSnapshot) -> tuple[float, list[str]]:
    notes: list[str] = []

    if ind.rsi is None:
        rsi_score = 50.0
        notes.append("momentum: insufficient RSI history")
    else:
        if ind.rsi >= 80:
            rsi_score = _linear_scale(ind.rsi, 80, 100, out_lo=55, out_hi=15)
            notes.append(f"RSI {ind.rsi:.0f} overbought")
        elif ind.rsi >= 50:
            rsi_score = _linear_scale(ind.rsi, 50, 80, out_lo=60, out_hi=100)
        elif ind.rsi >= 35:
            rsi_score = _linear_scale(ind.rsi, 35, 50, out_lo=40, out_hi=60)
        else:
            rsi_score = _linear_scale(ind.rsi, 0, 35, out_lo=10, out_hi=40)
            notes.append(f"RSI {ind.rsi:.0f} weak")

    if ind.macd_hist is None or not ind.price:
        macd_score = 50.0
    else:
        macd_hist_pct = ind.macd_hist / ind.price * 100
        macd_score = _linear_scale(macd_hist_pct, -2.0, 2.0, 0.0, 100.0)
        if ind.macd_hist_prev is not None:
            if ind.macd_hist > ind.macd_hist_prev:
                macd_score = min(100.0, macd_score + 10.0)
                notes.append("MACD histogram rising")
            elif ind.macd_hist < ind.macd_hist_prev:
                notes.append("MACD histogram falling")

    return rsi_score * 0.55 + macd_score * 0.45, notes


def _volume_score(pair: DexPair, ind: IndicatorSnapshot) -> tuple[float, list[str]]:
    notes: list[str] = []

    zscore_component = _linear_scale(ind.volume_zscore, -1.0, 3.0, 20.0, 100.0)
    if ind.volume_zscore is not None and ind.volume_zscore >= 2.0:
        notes.append(f"volume spike (z={ind.volume_zscore:.1f})")

    m5 = pair.txns.m5
    m5_total = m5.buys + m5.sells
    if m5_total >= 5:
        buy_ratio = m5.buys / m5_total
        pressure_component = _linear_scale(buy_ratio, 0.3, 0.75, 0.0, 100.0)
        if buy_ratio >= 0.65:
            notes.append(f"strong buy pressure ({buy_ratio:.0%} buys, 5m)")
        elif buy_ratio <= 0.35:
            notes.append(f"heavy sell pressure ({buy_ratio:.0%} buys, 5m)")
    else:
        pressure_component = 50.0

    liq = pair.liquidity.usd or 0.0
    vol24 = pair.volume.h24 or 0.0
    if liq > 0:
        ratio = vol24 / liq
        if ratio <= 15:
            health_component = _linear_scale(ratio, 0.05, 3.0, 20.0, 100.0)
        else:
            health_component = max(20.0, 100 - (ratio - 15) * 2)
            notes.append("volume/liquidity ratio extreme (possible wash trading)")
    else:
        health_component = 30.0

    # A second, independent wash-trading signal: the volume/liquidity ratio
    # above can look "healthy" even when that volume comes from a handful
    # of abnormally large trades rather than many organic ones (real retail
    # activity on a meme coin is typically lots of *small* trades). Average
    # trade size that's a large slice of the whole pool's liquidity is a
    # much stronger tell of self-dealing or a couple of wash trades than
    # the raw ratio alone.
    txns24 = pair.txns.h24
    txns24_total = txns24.buys + txns24.sells
    if liq > 0 and vol24 > 0 and txns24_total > 0:
        avg_trade_pct_of_liquidity = (vol24 / txns24_total) / liq * 100
        if avg_trade_pct_of_liquidity > 10.0:
            health_component = max(20.0, health_component - min(40.0, (avg_trade_pct_of_liquidity - 10.0) * 3))
            notes.append(
                f"avg trade size unusually large ({avg_trade_pct_of_liquidity:.0f}% of liquidity per trade "
                f"-- possible wash trading)"
            )

    total = zscore_component * 0.40 + pressure_component * 0.35 + health_component * 0.25
    return total, notes


def _volatility_score(ind: IndicatorSnapshot) -> tuple[float, list[str]]:
    if ind.atr_pct is None:
        return 50.0, ["volatility: insufficient ATR history"]

    notes: list[str] = []
    # Meme coins need *some* volatility to be worth trading; the sweet spot
    # is enough range to profit from without stops being unmanageably wide.
    if ind.atr_pct < 3:
        score = _linear_scale(ind.atr_pct, 0, 3, 30, 70)
    elif ind.atr_pct <= 12:
        score = _linear_scale(ind.atr_pct, 3, 12, 70, 100)
    elif ind.atr_pct <= 25:
        score = _linear_scale(ind.atr_pct, 12, 25, 100, 40)
    else:
        score = 20.0
        notes.append(f"extreme volatility (ATR {ind.atr_pct:.1f}% of price per bar)")
    return score, notes


def _liquidity_safety_score(
    pair: DexPair, safety: SafetyResult, holder_concentration: HolderConcentration | None
) -> tuple[float, list[str]]:
    notes: list[str] = []

    liq = pair.liquidity.usd or 0.0
    liq_component = _linear_scale(liq, 5_000, 150_000, 20.0, 100.0)

    fdv = pair.fdv or 0.0
    ratio_component = 60.0
    if liq > 0 and fdv > 0:
        ratio = fdv / liq
        ratio_component = _linear_scale(ratio, 2, 40, 100, 20)
        if ratio > 60:
            notes.append(f"FDV/liquidity ratio high ({ratio:.0f}x)")

    age = pair.age_minutes
    age_component = 50.0
    if age is not None:
        if age < 60:
            age_component = _linear_scale(age, 15, 60, 30, 55)
        elif age < 24 * 60:
            age_component = _linear_scale(age, 60, 24 * 60, 55, 90)
        elif age < 14 * 24 * 60:
            age_component = 85.0
        else:
            age_component = 60.0

    checks_total = max(len(safety.checks), 1)
    checks_passed = sum(1 for v in safety.checks.values() if v)
    safety_component = checks_passed / checks_total * 100

    # Degree, not just the hard gate's pass/fail: even concentration well
    # under the gate's cutoff is worth scoring worse than concentration
    # near zero. `holder_concentration` is Solana-only and best-effort
    # (see bot/data/solana_safety.py), so this stays neutral without it.
    concentration_component = 60.0
    if holder_concentration is not None:
        pct = holder_concentration.top_holders_excluding_largest_pct
        if pct is not None:
            concentration_component = _linear_scale(pct, 10, 70, 100, 20)
            if pct > 50:
                notes.append(f"holder concentration elevated ({pct:.0f}% ex-pool)")

    total = (
        liq_component * 0.30
        + ratio_component * 0.20
        + age_component * 0.15
        + safety_component * 0.20
        + concentration_component * 0.15
    )
    return total, notes


def _social_score(pair: DexPair) -> tuple[float, list[str]]:
    notes: list[str] = []
    score = 30.0
    if pair.info.websites:
        score += 20
    if pair.info.socials:
        score += 30
    if pair.boosts_active:
        score += min(20, pair.boosts_active * 4)
        notes.append(f"{pair.boosts_active} active DexScreener boost(s)")
    return min(score, 100.0), notes


def compute_score(
    pair: DexPair,
    indicators: IndicatorSnapshot,
    safety: SafetyResult,
    weights: ScoringWeights,
    holder_concentration: HolderConcentration | None = None,
) -> ScoreBreakdown:
    w = weights.normalized()

    trend, n1 = _trend_score(indicators)
    momentum, n2 = _momentum_score(indicators)
    volume, n3 = _volume_score(pair, indicators)
    volatility, n4 = _volatility_score(indicators)
    liquidity_safety, n5 = _liquidity_safety_score(pair, safety, holder_concentration)
    social, n6 = _social_score(pair)

    total = (
        trend * w.trend
        + momentum * w.momentum
        + volume * w.volume
        + volatility * w.volatility
        + liquidity_safety * w.liquidity_safety
        + social * w.social
    )

    notes = [*n1, *n2, *n3, *n4, *n5, *n6]
    if not safety.passed:
        notes.append("FAILED hard safety gate(s): " + "; ".join(safety.reasons))

    return ScoreBreakdown(
        trend=round(trend, 1),
        momentum=round(momentum, 1),
        volume=round(volume, 1),
        volatility=round(volatility, 1),
        liquidity_safety=round(liquidity_safety, 1),
        social=round(social, 1),
        total=round(total, 1),
        notes=notes,
    )
