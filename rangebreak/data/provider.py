from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from ..models import Candle


class MarketDataProvider(ABC):
    """Source of 1-minute OHLCV candles. The strategy engine only ever asks
    for 1-minute bars (even the 8-9am and 9-10am "hourly" candles are
    derived by aggregating 60 of them) so every provider needs to implement
    just this one method."""

    name: str

    @abstractmethod
    def get_1m_candles(self, ticker: str, start: datetime, end: datetime) -> list[Candle]:
        """1-minute candles for `ticker` covering [start, end] (tz-aware).
        May return fewer bars than requested -- thin pre-market liquidity,
        provider history limits, holidays -- callers must tolerate gaps."""
        raise NotImplementedError
