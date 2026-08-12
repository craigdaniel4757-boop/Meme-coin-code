"""Shared types for entry-signal strategies.

A strategy is a pure function `StrategyContext -> Signal | None`. It gets a
read-only view of the candidate (pair stats, candles, indicator snapshot)
plus its own config sub-section, and either returns a BUY signal or `None`.
Strategies never see the portfolio, bankroll, or other open positions --
that's the risk manager's job, kept deliberately separate so "is this a
good setup" and "can/should I actually take it right now" don't get tangled
together.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import pandas as pd

from bot.data.models import DexPair, IndicatorSnapshot, Signal


@dataclass(slots=True)
class StrategyContext:
    pair: DexPair
    candles: pd.DataFrame
    indicators: IndicatorSnapshot
    params: dict


StrategyFn = Callable[[StrategyContext], Optional[Signal]]
