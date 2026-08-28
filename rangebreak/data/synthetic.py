"""Deterministic, seeded synthetic 1-minute data for demo use and for
testing the strategy engine without any network access.

This is clearly-labeled fake data (the UI never presents it as real prices
for a real ticker) -- its only jobs are (1) letting the whole app be tried
out with zero setup and no API keys, and (2) giving the test suite a way
to mechanically verify every branch of the strategy against a known-good
answer. Each (ticker, date) pair deterministically maps to one of seven
scripted scenarios cycling through every outcome the engine can produce;
`generate_day_with_meta` exposes the intended outcome so tests can assert
against it directly instead of re-deriving it.

Every price the script cares about (range bounds, the pre-sweep swing
point, the sweep extreme, the entry-trigger level) is placed with enough
headroom from the randomized filler bands around it that the random walk
cannot cross a decision boundary early -- see the inline band comments.
`_mk()` is a last-line defensive clamp (high >= open/close, low <=
open/close) so no arithmetic slip anywhere below can ever emit an invalid
candle, but the scripted values are chosen to make that clamp a no-op in
the paths that matter for correctness.
"""

from __future__ import annotations

import hashlib
import random
from datetime import date, datetime, time, timedelta

from ..models import Candle
from ..timeutils import ET
from .provider import MarketDataProvider

SCENARIOS = (
    "bullish_target",
    "bullish_stop",
    "bearish_target",
    "bearish_stop",
    "invalid_sweep",
    "no_sweep",
    "no_entry_trigger",
)

DEMO_TICKERS = ("RY.TO", "RY", "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "IWM")


def _seed_int(*parts: str) -> int:
    h = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(h[:16], 16)


def scenario_for(ticker: str, day: date) -> str:
    return SCENARIOS[_seed_int(ticker.upper(), day.isoformat()) % len(SCENARIOS)]


def _base_price(ticker: str) -> float:
    seed = _seed_int(ticker.upper(), "base-price")
    return round(20.0 + (seed % 40000) / 100.0, 2)  # deterministic, in [20, 420)


def _ts(day: date, offset_minutes: int) -> datetime:
    base = datetime.combine(day, time(7, 0), tzinfo=ET)
    return base + timedelta(minutes=offset_minutes)


def _mk(ts: datetime, o: float, h: float, l: float, c: float, rng: random.Random) -> Candle:
    h = max(h, o, c)
    l = min(l, o, c)
    return Candle(ts=ts, open=round(o, 2), high=round(h, 2), low=round(l, 2), close=round(c, 2), volume=float(round(rng.uniform(200, 6000))))


def _filler(rng: random.Random, day: date, start_offset: int, n: int, prev_close: float, lo: float, hi: float, noise: float = 0.03):
    bars = []
    for k in range(n):
        o = prev_close
        c = min(max(o + rng.uniform(-noise, noise), lo), hi)
        wick = noise * 0.5
        h = min(max(o, c) + rng.uniform(0, wick), hi)
        l = max(min(o, c) - rng.uniform(0, wick), lo)
        bar = _mk(_ts(day, start_offset + k), o, h, l, c, rng)
        bars.append(bar)
        prev_close = bar.close
    return bars, prev_close


def _trend(rng: random.Random, day: date, start_offset: int, n: int, prev_close: float, target: float, noise: float = 0.015):
    """Walks prev_close toward `target` over n bars -- used to send price
    through the take-profit or the stop after entry, or to fail an
    intrabar-valid sweep back out of the range before the hour closes."""
    bars = []
    for k in range(n):
        remaining = n - k
        o = prev_close
        step = (target - o) / remaining
        c = o + step + rng.uniform(-noise, noise)
        wick = noise * 0.6
        h = max(o, c) + rng.uniform(0, wick)
        l = min(o, c) - rng.uniform(0, wick)
        bar = _mk(_ts(day, start_offset + k), o, h, l, c, rng)
        bars.append(bar)
        prev_close = bar.close
    return bars, prev_close


def generate_day_with_meta(ticker: str, day: date) -> tuple[list[Candle], dict]:
    scenario = scenario_for(ticker, day)
    rng = random.Random(_seed_int(ticker.upper(), day.isoformat(), "candles"))
    base_price = _base_price(ticker)
    range_low = round(base_price - 0.50, 2)
    range_high = round(base_price + 0.50, 2)
    meta = {"scenario": scenario, "ticker": ticker, "date": day.isoformat(), "range_high": range_high, "range_low": range_low}

    bars: list[Candle] = []
    prev_close = base_price

    # PREMARKET, offsets 0-59 (07:00-07:59): cosmetic only, nothing below
    # 09:00 depends on prices before the range hour.
    seg, prev_close = _filler(rng, day, 0, 60, prev_close, range_low + 0.10, range_high - 0.10)
    bars += seg

    # RANGE HOUR, offsets 60-119 (08:00-08:59): two explicit bars touch the
    # exact range bounds; everything else stays strictly inside them, so
    # the aggregated hour high/low are exactly range_high/range_low.
    seg, prev_close = _filler(rng, day, 60, 15, prev_close, range_low + 0.05, range_high - 0.05)
    bars += seg
    touch_high = _mk(_ts(day, 75), prev_close, range_high, min(prev_close, range_high - 0.05) - 0.01, range_high - 0.05, rng)
    bars.append(touch_high)
    prev_close = touch_high.close
    seg, prev_close = _filler(rng, day, 76, 24, prev_close, range_low + 0.05, range_high - 0.05)
    bars += seg
    touch_low = _mk(_ts(day, 100), prev_close, max(prev_close, range_low + 0.05) + 0.01, range_low, range_low + 0.05, rng)
    bars.append(touch_low)
    prev_close = touch_low.close
    seg, prev_close = _filler(rng, day, 101, 19, prev_close, range_low + 0.05, range_high - 0.05)
    bars += seg

    if scenario == "no_sweep":
        # Stay strictly inside the range for the whole monitor hour --
        # margin from both bounds is well over 1 tick, so no breach ever registers.
        seg, prev_close = _filler(rng, day, 120, 60, prev_close, range_low + 0.05, range_high - 0.05)
        bars += seg
        seg, _ = _filler(rng, day, 180, 360, prev_close, range_low - 0.05, range_high + 0.05)
        bars += seg
        meta["expected_outcome"] = "no_sweep"
        return bars, meta

    bullish = scenario in ("bullish_target", "bullish_stop", "no_entry_trigger", "invalid_sweep")
    swing_high_ref = round(range_low + 0.70, 2)  # comfortably inside (range spans range_low..range_low+1.00)
    swing_low_ref = round(range_high - 0.70, 2)

    if bullish:
        # Narrow pre-fractal band keeps the incoming price well below
        # swing_high_ref so the scripted 3-bar fractal that follows is an
        # unambiguous local max, not accidentally dwarfed by filler noise.
        seg, prev_close = _filler(rng, day, 120, 1, prev_close, range_low + 0.15, range_low + 0.45)
        bars += seg
        left = _mk(_ts(day, 121), prev_close, swing_high_ref - 0.02, min(prev_close, range_low + 0.30) - 0.01, range_low + 0.30, rng)
        bars.append(left)
        pivot = _mk(_ts(day, 122), left.close, swing_high_ref, min(left.close, range_low + 0.32) - 0.01, range_low + 0.32, rng)
        bars.append(pivot)
        right = _mk(_ts(day, 123), pivot.close, swing_high_ref - 0.03, min(pivot.close, range_low + 0.28) - 0.01, range_low + 0.28, rng)
        bars.append(right)
        # BREACH: trades below range_low by 3 ticks, closes still outside (no same-bar reclaim).
        breach = _mk(_ts(day, 124), right.close, max(right.close, range_low - 0.02) + 0.01, range_low - 0.05, range_low - 0.02, rng)
        bars.append(breach)
        # RECLAIM: closes back above range_low the very next minute.
        reclaim = _mk(_ts(day, 125), breach.close, max(breach.close, range_low + 0.03) + 0.01, min(breach.close, range_low + 0.03) - 0.01, range_low + 0.03, rng)
        bars.append(reclaim)
        prev_close = reclaim.close

        safe_lo, safe_hi = range_low + 0.05, swing_high_ref - 0.05

        if scenario == "invalid_sweep":
            seg, prev_close = _filler(rng, day, 126, 40, prev_close, safe_lo, safe_hi)
            bars += seg
            # Fails back out of the range before the 9:00-10:00 hour closes.
            seg, prev_close = _trend(rng, day, 166, 14, prev_close, range_low - 0.04)
            bars += seg
            seg, _ = _filler(rng, day, 180, 360, prev_close, range_low - 0.20, range_high + 0.20)
            bars += seg
            meta.update(expected_outcome="invalid_sweep", sweep_direction="bullish")
            return bars, meta

        seg, prev_close = _filler(rng, day, 126, 54, prev_close, safe_lo, safe_hi)
        bars += seg

        if scenario == "no_entry_trigger":
            seg, _ = _filler(rng, day, 180, 360, prev_close, safe_lo, safe_hi)
            bars += seg
            meta.update(expected_outcome="no_entry_trigger", sweep_direction="bullish")
            return bars, meta

        seg, prev_close = _filler(rng, day, 180, 5, prev_close, safe_lo, safe_hi)
        bars += seg
        cross = _mk(_ts(day, 185), prev_close, max(prev_close, swing_high_ref + 0.03) + 0.01, min(prev_close, swing_high_ref + 0.03) - 0.01, swing_high_ref + 0.03, rng)
        bars.append(cross)
        prev_close = cross.close

        if scenario == "bullish_target":
            seg, prev_close = _trend(rng, day, 186, 34, prev_close, range_high + 0.02)
            bars += seg
            seg, _ = _filler(rng, day, 220, 320, prev_close, range_high - 0.10, range_high + 0.10)
            bars += seg
            meta.update(expected_outcome="target", sweep_direction="bullish")
        else:
            seg, prev_close = _trend(rng, day, 186, 44, prev_close, range_low - 0.10)
            bars += seg
            seg, _ = _filler(rng, day, 230, 310, prev_close, range_low - 0.20, range_low)
            bars += seg
            meta.update(expected_outcome="stop", sweep_direction="bullish")
        return bars, meta

    # BEARISH family: bearish_target, bearish_stop (mirror image of the above).
    seg, prev_close = _filler(rng, day, 120, 1, prev_close, range_high - 0.45, range_high - 0.15)
    bars += seg
    left = _mk(_ts(day, 121), prev_close, max(prev_close, range_high - 0.30) + 0.01, swing_low_ref + 0.02, range_high - 0.30, rng)
    bars.append(left)
    pivot = _mk(_ts(day, 122), left.close, max(left.close, range_high - 0.32) + 0.01, swing_low_ref, range_high - 0.32, rng)
    bars.append(pivot)
    right = _mk(_ts(day, 123), pivot.close, max(pivot.close, range_high - 0.28) + 0.01, swing_low_ref + 0.03, range_high - 0.28, rng)
    bars.append(right)
    breach = _mk(_ts(day, 124), right.close, range_high + 0.05, min(right.close, range_high + 0.02) - 0.01, range_high + 0.02, rng)
    bars.append(breach)
    reclaim = _mk(_ts(day, 125), breach.close, max(breach.close, range_high - 0.03) + 0.01, min(breach.close, range_high - 0.03) - 0.01, range_high - 0.03, rng)
    bars.append(reclaim)
    prev_close = reclaim.close

    safe_lo, safe_hi = swing_low_ref + 0.05, range_high - 0.05
    seg, prev_close = _filler(rng, day, 126, 54, prev_close, safe_lo, safe_hi)
    bars += seg
    seg, prev_close = _filler(rng, day, 180, 5, prev_close, safe_lo, safe_hi)
    bars += seg
    cross = _mk(_ts(day, 185), prev_close, max(prev_close, swing_low_ref - 0.03) + 0.01, min(prev_close, swing_low_ref - 0.03) - 0.01, swing_low_ref - 0.03, rng)
    bars.append(cross)
    prev_close = cross.close

    if scenario == "bearish_target":
        seg, prev_close = _trend(rng, day, 186, 34, prev_close, range_low - 0.02)
        bars += seg
        seg, _ = _filler(rng, day, 220, 320, prev_close, range_low - 0.10, range_low + 0.10)
        bars += seg
        meta.update(expected_outcome="target", sweep_direction="bearish")
    else:
        seg, prev_close = _trend(rng, day, 186, 44, prev_close, range_high + 0.10)
        bars += seg
        seg, _ = _filler(rng, day, 230, 310, prev_close, range_high, range_high + 0.20)
        bars += seg
        meta.update(expected_outcome="stop", sweep_direction="bearish")
    return bars, meta


def generate_range(ticker: str, start: date, end: date) -> list[Candle]:
    out: list[Candle] = []
    d = start
    one_day = timedelta(days=1)
    while d <= end:
        if d.weekday() < 5:
            bars, _ = generate_day_with_meta(ticker, d)
            out += bars
        d += one_day
    return out


class SyntheticProvider(MarketDataProvider):
    name = "synthetic"

    def get_1m_candles(self, ticker: str, start: datetime, end: datetime) -> list[Candle]:
        bars = generate_range(ticker, start.date(), end.date())
        return [c for c in bars if start <= c.ts <= end]
