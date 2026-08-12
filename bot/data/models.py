"""Typed models shared across every layer of the bot.

Models that parse external JSON (DexScreener, GeckoTerminal) are pydantic
models with defensive `Optional` fields, because third-party API responses
are not contractually stable and a single missing/renamed field should
degrade gracefully rather than crash a whole scan cycle. Everything computed
internally (candles, indicator snapshots, scores, signals, positions) is a
plain dataclass for speed and simplicity.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# External API models (DexScreener)
# ---------------------------------------------------------------------------


class TokenRef(BaseModel):
    model_config = ConfigDict(extra="ignore")

    address: str = ""
    name: str = ""
    symbol: str = ""


class TxnWindow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    buys: int = 0
    sells: int = 0


class Txns(BaseModel):
    model_config = ConfigDict(extra="ignore")

    m5: TxnWindow = Field(default_factory=TxnWindow)
    h1: TxnWindow = Field(default_factory=TxnWindow)
    h6: TxnWindow = Field(default_factory=TxnWindow)
    h24: TxnWindow = Field(default_factory=TxnWindow)


class WindowedFloats(BaseModel):
    model_config = ConfigDict(extra="ignore")

    m5: Optional[float] = None
    h1: Optional[float] = None
    h6: Optional[float] = None
    h24: Optional[float] = None


class Liquidity(BaseModel):
    model_config = ConfigDict(extra="ignore")

    usd: Optional[float] = None
    base: Optional[float] = None
    quote: Optional[float] = None


class SocialLink(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Optional[str] = None
    label: Optional[str] = None
    url: Optional[str] = None


class PairInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    imageUrl: Optional[str] = None
    websites: list[SocialLink] = Field(default_factory=list)
    socials: list[SocialLink] = Field(default_factory=list)


class DexPair(BaseModel):
    """One DexScreener pair object, defensively parsed."""

    model_config = ConfigDict(extra="ignore")

    chainId: str = ""
    dexId: str = ""
    url: Optional[str] = None
    pairAddress: str = ""
    labels: list[str] = Field(default_factory=list)
    baseToken: TokenRef = Field(default_factory=TokenRef)
    quoteToken: TokenRef = Field(default_factory=TokenRef)
    priceNative: Optional[str] = None
    priceUsd: Optional[str] = None
    txns: Txns = Field(default_factory=Txns)
    volume: WindowedFloats = Field(default_factory=WindowedFloats)
    priceChange: WindowedFloats = Field(default_factory=WindowedFloats)
    liquidity: Liquidity = Field(default_factory=Liquidity)
    fdv: Optional[float] = None
    marketCap: Optional[float] = None
    pairCreatedAt: Optional[int] = None  # epoch millis
    info: PairInfo = Field(default_factory=PairInfo)
    boosts_active: int = 0

    @property
    def price_usd(self) -> Optional[float]:
        try:
            return float(self.priceUsd) if self.priceUsd is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def pair_created_at_dt(self) -> Optional[datetime]:
        if not self.pairCreatedAt:
            return None
        return datetime.fromtimestamp(self.pairCreatedAt / 1000, tz=timezone.utc)

    @property
    def age_minutes(self) -> Optional[float]:
        dt = self.pair_created_at_dt
        if dt is None:
            return None
        return (datetime.now(timezone.utc) - dt).total_seconds() / 60.0

    @property
    def key(self) -> str:
        return f"{self.chainId}:{self.pairAddress}"

    @property
    def symbol(self) -> str:
        return self.baseToken.symbol or self.baseToken.address[:8]

    @property
    def has_socials(self) -> bool:
        return bool(self.info.socials) or bool(self.info.websites)


class TokenProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    url: Optional[str] = None
    chainId: str = ""
    tokenAddress: str = ""
    icon: Optional[str] = None
    header: Optional[str] = None
    description: Optional[str] = None
    links: list[SocialLink] = Field(default_factory=list)


class BoostedToken(BaseModel):
    model_config = ConfigDict(extra="ignore")

    url: Optional[str] = None
    chainId: str = ""
    tokenAddress: str = ""
    amount: Optional[float] = None
    totalAmount: Optional[float] = None
    description: Optional[str] = None
    links: list[SocialLink] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal computed models
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class Candle:
    timestamp: int  # unix seconds, bar open time
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(slots=True)
class IndicatorSnapshot:
    price: float
    rsi: Optional[float] = None
    ema_fast: Optional[float] = None
    ema_mid: Optional[float] = None
    ema_slow: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    macd_hist_prev: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_mid: Optional[float] = None
    bb_lower: Optional[float] = None
    bb_bandwidth: Optional[float] = None
    atr: Optional[float] = None
    atr_pct: Optional[float] = None
    volume_zscore: Optional[float] = None
    swing_high: Optional[float] = None
    swing_low: Optional[float] = None
    ema_fast_slope: Optional[float] = None
    vwap: Optional[float] = None
    num_candles: int = 0


class SignalAction(str, Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


@dataclass(slots=True)
class SafetyResult:
    passed: bool
    reasons: list[str] = field(default_factory=list)
    checks: dict[str, bool] = field(default_factory=dict)


@dataclass(slots=True)
class ScoreBreakdown:
    trend: float
    momentum: float
    volume: float
    volatility: float
    liquidity_safety: float
    social: float
    total: float
    notes: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Signal:
    chain_id: str
    pair_address: str
    symbol: str
    action: SignalAction
    strategy_name: str
    confidence: float  # 0-1
    reason: str
    price: float
    timestamp: float


@dataclass(slots=True)
class Candidate:
    """A pair that survived pre-filters + safety gates, ready to be scored."""

    pair: DexPair
    candles: object  # pandas.DataFrame, kept untyped here to avoid importing pandas
    indicators: IndicatorSnapshot
    safety: SafetyResult
    score: Optional[ScoreBreakdown] = None
    signals: list[Signal] = field(default_factory=list)


@dataclass(slots=True)
class TakeProfitLevel:
    gain_pct: float
    fraction: float
    filled: bool = False


@dataclass(slots=True)
class Position:
    id: str
    chain_id: str
    pair_address: str
    base_token_address: str
    symbol: str
    entry_price: float
    quantity: float
    entry_time: float
    stop_loss_price: float
    take_profit_levels: list[TakeProfitLevel]
    trailing_stop_price: Optional[float] = None
    high_water_mark: float = 0.0
    remaining_fraction: float = 1.0
    strategy_name: str = ""
    status: str = "open"  # open | closed

    def __post_init__(self) -> None:
        if self.high_water_mark <= 0:
            self.high_water_mark = self.entry_price


@dataclass(slots=True)
class Trade:
    id: str
    position_id: str
    chain_id: str
    pair_address: str
    symbol: str
    side: str  # buy | sell
    price: float
    quantity: float
    fee_usd: float
    timestamp: float
    reason: str
    realized_pnl_usd: Optional[float] = None
