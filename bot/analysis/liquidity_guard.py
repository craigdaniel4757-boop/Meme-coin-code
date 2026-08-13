"""Detects an in-progress or just-happened liquidity crash from the price/
liquidity ticks the bot already records on every scan cycle (see
bot/data/candles.py's `record_tick` and the `price_ticks` table).

This exists as a practical, verifiable substitute for directly checking
"is the LP locked": reliably determining that requires decoding each AMM
program's own on-chain account layout (Raydium, Orca, pump.fun, etc. all
differ), which isn't something that can be done generically and correctly
without live verification against each protocol -- and a wrong byte-offset
guess would silently produce an incorrect safety verdict rather than a
clean failure, which is worse than not having the check. Watching
liquidity itself for a sudden drop catches the same underlying danger --
a rug in progress -- via a mechanism that only depends on data the bot is
already collecting correctly, with no protocol-specific guessing at all.

It's used two ways (see bot/analysis/safety_filters.py and
bot/strategy/risk_manager.py): as a hard gate against *entering* a pool
whose liquidity just cratered, and -- more importantly, since it protects
money already at risk rather than just filtering candidates -- as an
emergency exit for anything already held if its liquidity craters while
open.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from bot.storage.db import Database


@dataclass(slots=True)
class LiquidityTrend:
    have_data: bool
    current_liquidity_usd: float | None = None
    recent_peak_liquidity_usd: float | None = None
    drawdown_pct: float | None = None  # % below the recent peak; 0 = at peak

    def drawdown_exceeds(self, threshold_pct: float) -> bool:
        return self.have_data and self.drawdown_pct is not None and self.drawdown_pct >= threshold_pct


def compute_liquidity_trend(
    db: Database,
    chain_id: str,
    pair_address: str,
    lookback_seconds: int = 3600,
    min_observations: int = 3,
) -> LiquidityTrend:
    """Compares the most recently observed liquidity to the highest
    liquidity seen for this pair within `lookback_seconds`. Needs at least
    `min_observations` ticks to say anything -- a pair the bot has only
    just started watching hasn't been observed long enough to know whether
    a drop happened, so this reports `have_data=False` rather than a
    potentially misleading verdict from a single data point."""
    since = int(time.time()) - lookback_seconds
    rows = db.get_ticks(chain_id, pair_address, since_ts=since, limit=2000)
    liquidities = [
        row["liquidity_usd"] for row in rows if row["liquidity_usd"] is not None and row["liquidity_usd"] > 0
    ]

    if len(liquidities) < min_observations:
        return LiquidityTrend(have_data=False)

    current = liquidities[-1]
    peak = max(liquidities)
    drawdown = ((peak - current) / peak * 100) if peak > 0 else 0.0
    return LiquidityTrend(
        have_data=True,
        current_liquidity_usd=current,
        recent_peak_liquidity_usd=peak,
        drawdown_pct=max(drawdown, 0.0),
    )
