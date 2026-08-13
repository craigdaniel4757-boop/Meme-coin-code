"""Typed configuration loaded from a YAML file (config/default.yaml by
default), with environment variables layered on top for secrets that must
never be committed to a config file. See .env.example for the full list.

This module also owns the small "adapter" functions that turn the loaded
YAML config into the plain dataclasses each engine module actually
consumes (`IndicatorParams`, `ScoringWeights`, `SafetyConfig`,
`RiskConfig`), so those modules stay decoupled from the YAML schema.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from bot.analysis.indicators import IndicatorParams
from bot.analysis.market_regime import MarketRegimeConfig
from bot.analysis.safety_filters import SafetyConfig
from bot.analysis.scoring import ScoringWeights
from bot.strategy.risk_manager import RiskConfig


class GeneralConfig(BaseModel):
    log_level: str = "INFO"
    timezone: str = "UTC"


class DexScreenerConfig(BaseModel):
    base_url: str = "https://api.dexscreener.com"
    requests_per_minute: int = 250


class GeckoTerminalConfig(BaseModel):
    enabled: bool = True
    base_url: str = "https://api.geckoterminal.com/api/v2"
    requests_per_minute: int = 28


class SolanaRpcConfig(BaseModel):
    url: str = "https://api.mainnet-beta.solana.com"
    requests_per_minute: int = 100


class JupiterConfig(BaseModel):
    base_url: str = "https://quote-api.jup.ag/v6"
    requests_per_minute: int = 30


class CandlesConfig(BaseModel):
    fallback_interval_seconds: int = 60
    max_local_candles: int = 2000


class DataConfig(BaseModel):
    dexscreener: DexScreenerConfig = Field(default_factory=DexScreenerConfig)
    geckoterminal: GeckoTerminalConfig = Field(default_factory=GeckoTerminalConfig)
    solana_rpc: SolanaRpcConfig = Field(default_factory=SolanaRpcConfig)
    jupiter: JupiterConfig = Field(default_factory=JupiterConfig)
    candles: CandlesConfig = Field(default_factory=CandlesConfig)
    cache_ttl_seconds: int = 20


class DiscoveryConfig(BaseModel):
    use_latest_boosted: bool = True
    use_top_boosted: bool = True
    use_latest_profiles: bool = True
    search_terms: list[str] = Field(default_factory=list)
    watchlist: list[str] = Field(default_factory=list)


class ScannerConfig(BaseModel):
    chains: list[str] = Field(default_factory=lambda: ["solana"])
    discovery: DiscoveryConfig = Field(default_factory=DiscoveryConfig)
    scan_interval_seconds: int = 60
    max_candidates_per_cycle: int = 300
    max_concurrent_requests: int = 12
    min_liquidity_usd: float = 8000.0
    min_volume_24h_usd: float = 15000.0
    min_pair_age_minutes: float = 15.0
    max_pair_age_days: float = 45.0
    min_txns_24h: int = 50


class SafetyYamlConfig(BaseModel):
    require_solana_mint_authority_renounced: bool = True
    require_solana_freeze_authority_renounced: bool = True
    max_fdv_to_liquidity_ratio: float = 25.0
    min_buy_ratio_5m: float = 0.35
    max_liquidity_drawdown_pct: float = 40.0
    require_liquidity_stability_check: bool = True
    max_top_holder_concentration_pct: float = 70.0
    require_holder_concentration_check: bool = True
    require_sellable: bool = True
    blacklist_tokens: list[str] = Field(default_factory=list)


class ScoringYamlConfig(BaseModel):
    weights: dict[str, float] = Field(default_factory=dict)
    min_score_to_trade: float = 68.0
    watchlist_score: float = 55.0


class IndicatorsYamlConfig(BaseModel):
    rsi_period: int = 14
    ema_fast: int = 9
    ema_mid: int = 21
    ema_slow: int = 50
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    bollinger_period: int = 20
    bollinger_std: float = 2.0
    atr_period: int = 14
    volume_zscore_period: int = 20
    swing_lookback: int = 20


class StrategyYamlConfig(BaseModel):
    active: list[str] = Field(default_factory=lambda: ["momentum_breakout", "volume_spike_breakout", "trend_pullback"])
    momentum_breakout: dict = Field(default_factory=dict)
    volume_spike_breakout: dict = Field(default_factory=dict)
    trend_pullback: dict = Field(default_factory=dict)

    def params_dict(self) -> dict:
        return {
            "momentum_breakout": self.momentum_breakout,
            "volume_spike_breakout": self.volume_spike_breakout,
            "trend_pullback": self.trend_pullback,
        }


class RiskYamlConfig(BaseModel):
    starting_bankroll_usd: float = 1000.0
    risk_per_trade_pct: float = 2.0
    max_concurrent_positions: int = 6
    max_allocation_pct_per_token: float = 15.0
    stop_loss_pct: float = 15.0
    take_profit_ladder: list[tuple[float, float]] = Field(
        default_factory=lambda: [(50.0, 0.25), (100.0, 0.25), (200.0, 0.25)]
    )
    trailing_stop_activate_pct: float = 40.0
    trailing_stop_distance_pct: float = 18.0
    max_hold_minutes: float = 720.0
    max_daily_loss_pct: float = 8.0
    max_slippage_bps: float = 150.0
    emergency_exit_liquidity_drawdown_pct: float = 60.0
    min_agreeing_strategies: int = 1
    require_higher_timeframe_confirmation: bool = True
    higher_timeframe_seconds: int = 3600


class MarketRegimeYamlConfig(BaseModel):
    enabled: bool = True
    max_drop_pct_1h: float = 7.0
    reference_tokens: dict[str, str] = Field(default_factory=dict)


class PaperExecConfig(BaseModel):
    starting_balance_usd: float = 1000.0
    simulated_slippage_bps: float = 60.0
    simulated_fee_bps: float = 30.0


class LiveExecConfig(BaseModel):
    dex_aggregator: str = "jupiter"
    priority_fee_lamports: int = 200_000
    max_slippage_bps: int = 150
    required_confirm_phrase: str = "I UNDERSTAND THE RISK"


class ExecutionConfig(BaseModel):
    mode: str = "paper"
    paper: PaperExecConfig = Field(default_factory=PaperExecConfig)
    live: LiveExecConfig = Field(default_factory=LiveExecConfig)


class NotificationsConfig(BaseModel):
    telegram_enabled: bool = False
    discord_enabled: bool = False
    notify_on_signal: bool = True
    notify_on_trade: bool = True
    notify_on_circuit_breaker: bool = True


class StorageConfig(BaseModel):
    sqlite_path: str = "data/memebot.db"


class AppConfig(BaseModel):
    general: GeneralConfig = Field(default_factory=GeneralConfig)
    data: DataConfig = Field(default_factory=DataConfig)
    scanner: ScannerConfig = Field(default_factory=ScannerConfig)
    safety: SafetyYamlConfig = Field(default_factory=SafetyYamlConfig)
    scoring: ScoringYamlConfig = Field(default_factory=ScoringYamlConfig)
    indicators: IndicatorsYamlConfig = Field(default_factory=IndicatorsYamlConfig)
    strategy: StrategyYamlConfig = Field(default_factory=StrategyYamlConfig)
    risk: RiskYamlConfig = Field(default_factory=RiskYamlConfig)
    market_regime: MarketRegimeYamlConfig = Field(default_factory=MarketRegimeYamlConfig)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    notifications: NotificationsConfig = Field(default_factory=NotificationsConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)


def load_config(path: str | Path = "config/default.yaml") -> AppConfig:
    load_dotenv()  # fills os.environ from .env for keys not already set there
    with open(path) as f:
        raw = yaml.safe_load(f) or {}
    cfg = AppConfig.model_validate(raw)

    rpc_override = os.environ.get("SOLANA_RPC_URL")
    if rpc_override:
        cfg.data.solana_rpc.url = rpc_override

    return cfg


# --- adapters: YAML config -> plain dataclasses each engine module uses ----


def build_indicator_params(cfg: AppConfig) -> IndicatorParams:
    ic = cfg.indicators
    return IndicatorParams(
        rsi_period=ic.rsi_period,
        ema_fast=ic.ema_fast,
        ema_mid=ic.ema_mid,
        ema_slow=ic.ema_slow,
        macd_fast=ic.macd_fast,
        macd_slow=ic.macd_slow,
        macd_signal=ic.macd_signal,
        bollinger_period=ic.bollinger_period,
        bollinger_std=ic.bollinger_std,
        atr_period=ic.atr_period,
        volume_zscore_period=ic.volume_zscore_period,
        swing_lookback=ic.swing_lookback,
    )


def build_scoring_weights(cfg: AppConfig) -> ScoringWeights:
    w = cfg.scoring.weights
    d = ScoringWeights()
    return ScoringWeights(
        trend=w.get("trend", d.trend),
        momentum=w.get("momentum", d.momentum),
        volume=w.get("volume", d.volume),
        volatility=w.get("volatility", d.volatility),
        liquidity_safety=w.get("liquidity_safety", d.liquidity_safety),
        social=w.get("social", d.social),
    )


def build_safety_config(cfg: AppConfig) -> SafetyConfig:
    s, sc = cfg.safety, cfg.scanner
    return SafetyConfig(
        min_liquidity_usd=sc.min_liquidity_usd,
        min_volume_24h_usd=sc.min_volume_24h_usd,
        min_pair_age_minutes=sc.min_pair_age_minutes,
        max_pair_age_days=sc.max_pair_age_days,
        min_txns_24h=sc.min_txns_24h,
        require_solana_mint_authority_renounced=s.require_solana_mint_authority_renounced,
        require_solana_freeze_authority_renounced=s.require_solana_freeze_authority_renounced,
        max_fdv_to_liquidity_ratio=s.max_fdv_to_liquidity_ratio,
        min_buy_ratio_5m=s.min_buy_ratio_5m,
        max_liquidity_drawdown_pct=s.max_liquidity_drawdown_pct,
        require_liquidity_stability_check=s.require_liquidity_stability_check,
        max_top_holder_concentration_pct=s.max_top_holder_concentration_pct,
        require_holder_concentration_check=s.require_holder_concentration_check,
        require_sellable=s.require_sellable,
        blacklist_tokens=list(s.blacklist_tokens),
    )


def build_risk_config(cfg: AppConfig) -> RiskConfig:
    r = cfg.risk
    return RiskConfig(
        starting_bankroll_usd=r.starting_bankroll_usd,
        risk_per_trade_pct=r.risk_per_trade_pct,
        max_concurrent_positions=r.max_concurrent_positions,
        max_allocation_pct_per_token=r.max_allocation_pct_per_token,
        stop_loss_pct=r.stop_loss_pct,
        take_profit_ladder=[tuple(x) for x in r.take_profit_ladder],
        trailing_stop_activate_pct=r.trailing_stop_activate_pct,
        trailing_stop_distance_pct=r.trailing_stop_distance_pct,
        max_hold_minutes=r.max_hold_minutes,
        max_daily_loss_pct=r.max_daily_loss_pct,
        max_slippage_bps=r.max_slippage_bps,
        emergency_exit_liquidity_drawdown_pct=r.emergency_exit_liquidity_drawdown_pct,
        min_agreeing_strategies=r.min_agreeing_strategies,
        require_higher_timeframe_confirmation=r.require_higher_timeframe_confirmation,
        higher_timeframe_seconds=r.higher_timeframe_seconds,
    )


def build_market_regime_config(cfg: AppConfig) -> MarketRegimeConfig:
    m = cfg.market_regime
    return MarketRegimeConfig(
        enabled=m.enabled,
        max_drop_pct_1h=m.max_drop_pct_1h,
        reference_tokens=dict(m.reference_tokens),
    )
