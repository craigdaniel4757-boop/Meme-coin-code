"""Shared fixtures and synthetic-data builders for the test suite.

Everything here is synthetic and seeded -- no network calls, no real
market data -- so the suite is fast and fully deterministic.
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd
import pytest

from bot.data.models import (
    DexPair,
    Liquidity,
    PairInfo,
    SocialLink,
    TokenRef,
    Txns,
    TxnWindow,
    WindowedFloats,
)

OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def make_ohlcv(
    n: int = 200,
    start_price: float = 1.0,
    drift: float = 0.0,
    volatility: float = 0.01,
    start_ts: int = 1_700_000_000,
    interval_seconds: int = 60,
    seed: int = 42,
    volume: float = 1000.0,
) -> pd.DataFrame:
    """A reproducible synthetic OHLCV series: a simple random walk with a
    configurable per-bar drift, used anywhere a test needs "some plausible
    price history" rather than one specific shape."""
    rng = np.random.default_rng(seed)
    closes = [start_price]
    for _ in range(n - 1):
        change = drift + rng.normal(0, volatility)
        closes.append(max(closes[-1] * (1 + change), 1e-12))
    closes = np.array(closes)

    highs = closes * (1 + np.abs(rng.normal(0, volatility / 2, size=n)))
    lows = closes * (1 - np.abs(rng.normal(0, volatility / 2, size=n)))
    opens = np.concatenate([[closes[0]], closes[:-1]])
    volumes = np.full(n, volume) * (1 + np.abs(rng.normal(0, 0.2, size=n)))
    timestamps = start_ts + np.arange(n) * interval_seconds

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": opens,
            "high": np.maximum.reduce([highs, opens, closes]),
            "low": np.minimum.reduce([lows, opens, closes]),
            "close": closes,
            "volume": volumes,
        }
    )[OHLCV_COLUMNS]


def make_breakout_df() -> pd.DataFrame:
    """A flat consolidation range followed by a sharp breakout on a volume
    spike -- exactly the setup momentum_breakout / volume_spike_breakout
    are designed to catch."""
    base = make_ohlcv(n=100, start_price=1.0, drift=0.0, volatility=0.003, seed=4)
    breakout = make_ohlcv(
        n=20, start_price=float(base["close"].iloc[-1]), drift=0.03, volatility=0.01, seed=5, volume=1000.0
    )
    breakout["volume"] = breakout["volume"] * 6
    breakout["timestamp"] = base["timestamp"].iloc[-1] + (np.arange(20) + 1) * 60
    return pd.concat([base, breakout], ignore_index=True)


def make_pair(
    chain_id: str = "solana",
    pair_address: str = "PAIR1111111111111111111111111111111111111",
    base_address: str = "TOKEN111111111111111111111111111111111111",
    symbol: str = "DOGETEST",
    price_usd: float = 1.0,
    liquidity_usd: float = 50_000.0,
    volume_24h_usd: float = 100_000.0,
    fdv: float = 500_000.0,
    age_minutes: float = 120.0,
    buys_5m: int = 30,
    sells_5m: int = 10,
    buys_24h: int = 500,
    sells_24h: int = 400,
    price_change_5m: float = 2.0,
    has_socials: bool = True,
    boosts_active: int = 0,
) -> DexPair:
    created_at_ms = int((time.time() - age_minutes * 60) * 1000)
    pair = DexPair(
        chainId=chain_id,
        dexId="raydium",
        pairAddress=pair_address,
        baseToken=TokenRef(address=base_address, name=symbol, symbol=symbol),
        quoteToken=TokenRef(
            address="So11111111111111111111111111111111111111112", name="Wrapped SOL", symbol="SOL"
        ),
        priceUsd=str(price_usd),
        liquidity=Liquidity(usd=liquidity_usd),
        volume=WindowedFloats(
            h24=volume_24h_usd, h6=volume_24h_usd / 4, h1=volume_24h_usd / 24, m5=volume_24h_usd / 288
        ),
        priceChange=WindowedFloats(
            m5=price_change_5m, h1=price_change_5m, h6=price_change_5m, h24=price_change_5m
        ),
        fdv=fdv,
        marketCap=fdv,
        pairCreatedAt=created_at_ms,
        txns=Txns(
            m5=TxnWindow(buys=buys_5m, sells=sells_5m),
            h24=TxnWindow(buys=buys_24h, sells=sells_24h),
        ),
        boosts_active=boosts_active,
    )
    if has_socials:
        pair.info = PairInfo(
            socials=[SocialLink(type="twitter", url="https://twitter.com/example")],
            websites=[SocialLink(label="Website", url="https://example.com")],
        )
    return pair


@pytest.fixture
def uptrend_df() -> pd.DataFrame:
    return make_ohlcv(n=150, start_price=1.0, drift=0.006, volatility=0.01, seed=1)


@pytest.fixture
def downtrend_df() -> pd.DataFrame:
    return make_ohlcv(n=150, start_price=1.0, drift=-0.006, volatility=0.01, seed=2)


@pytest.fixture
def flat_df() -> pd.DataFrame:
    return make_ohlcv(n=150, start_price=1.0, drift=0.0, volatility=0.0005, seed=3)


@pytest.fixture
def breakout_df() -> pd.DataFrame:
    return make_breakout_df()
