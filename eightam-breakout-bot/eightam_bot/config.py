"""Typed configuration loaded from a YAML file (config/default.yaml by
default), with environment variables layered on top for secrets that must
never be committed to a config file. See .env.example for the full list.

This module also owns the small "adapter" functions that turn the loaded
YAML config into the plain dataclasses the strategy/risk engine actually
consumes (`StrategyConfig`, `RiskConfig`), so those modules stay decoupled
from the YAML schema -- the same split the sibling memebot project's
bot/config.py uses.
"""

from __future__ import annotations

import os
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from eightam_bot.risk_manager import RiskConfig
from eightam_bot.strategy import StrategyConfig
from eightam_bot.timeutils import parse_hhmm


class GeneralConfig(BaseModel):
    log_level: str = "INFO"


class MarketConfig(BaseModel):
    exchange: str = "binance"
    symbols: list[str] = Field(default_factory=lambda: ["BTC/USDT"])
    candle_timeframe: str = "1m"


class DataConfig(BaseModel):
    csv_paths: dict[str, str] = Field(default_factory=dict)


class SessionYamlConfig(BaseModel):
    timezone: str = "America/New_York"
    range_start: str = "08:00"
    range_end: str = "08:15"
    trade_window_start: str = "09:30"
    trade_window_end: str = "11:00"
    force_close_time: str = "12:00"
    trading_days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])


class BreakoutYamlConfig(BaseModel):
    confirmation: str = "close"


class RiskYamlConfig(BaseModel):
    stop_buffer_type: str = "percent"
    stop_buffer_value: float = 0.12
    take_profit_mode: str = "r_multiple"
    take_profit_value: float = 3.0
    risk_per_trade_pct: float = 1.0
    max_daily_loss_pct: float = 4.0
    starting_bankroll_usd: float = 10_000.0


class MlFilterConfig(BaseModel):
    enabled: bool = False
    model_path: str = "models/retest_filter.joblib"
    min_confidence: float = 0.55


class PaperExecConfig(BaseModel):
    simulated_slippage_bps: float = 5.0
    simulated_fee_bps: float = 4.0


class LiveExecConfig(BaseModel):
    market_type: str = "spot"
    max_slippage_bps: float = 30.0
    required_confirm_phrase: str = "I UNDERSTAND THE RISK"


class ExecutionConfig(BaseModel):
    mode: str = "paper"
    paper: PaperExecConfig = Field(default_factory=PaperExecConfig)
    live: LiveExecConfig = Field(default_factory=LiveExecConfig)


class NotificationsConfig(BaseModel):
    telegram_enabled: bool = False
    discord_enabled: bool = False
    notify_on_range: bool = False
    notify_on_breakout: bool = True
    notify_on_trade: bool = True


class StorageConfig(BaseModel):
    journal_csv_path: str = "data/trade_journal.csv"


class AppConfig(BaseModel):
    general: GeneralConfig = Field(default_factory=GeneralConfig)
    market: MarketConfig = Field(default_factory=MarketConfig)
    data: DataConfig = Field(default_factory=DataConfig)
    session: SessionYamlConfig = Field(default_factory=SessionYamlConfig)
    breakout: BreakoutYamlConfig = Field(default_factory=BreakoutYamlConfig)
    risk: RiskYamlConfig = Field(default_factory=RiskYamlConfig)
    ml_filter: MlFilterConfig = Field(default_factory=MlFilterConfig)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    notifications: NotificationsConfig = Field(default_factory=NotificationsConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)


def load_config(path: str | Path = "config/default.yaml") -> AppConfig:
    load_dotenv()  # fills os.environ from .env for keys not already set there
    with open(path) as f:
        raw = yaml.safe_load(f) or {}
    return AppConfig.model_validate(raw)


# --- adapters: YAML config -> plain dataclasses the engine modules use -----


def build_strategy_config(cfg: AppConfig) -> StrategyConfig:
    s = cfg.session
    return StrategyConfig(
        tz=ZoneInfo(s.timezone),
        range_start=parse_hhmm(s.range_start),
        range_end=parse_hhmm(s.range_end),
        trade_window_start=parse_hhmm(s.trade_window_start),
        trade_window_end=parse_hhmm(s.trade_window_end),
        force_close_time=parse_hhmm(s.force_close_time),
        trading_days=frozenset(s.trading_days),
        breakout_confirmation=cfg.breakout.confirmation,
    )


def build_risk_config(cfg: AppConfig) -> RiskConfig:
    r = cfg.risk
    return RiskConfig(
        stop_buffer_type=r.stop_buffer_type,
        stop_buffer_value=r.stop_buffer_value,
        take_profit_mode=r.take_profit_mode,
        take_profit_value=r.take_profit_value,
        risk_per_trade_pct=r.risk_per_trade_pct,
        max_daily_loss_pct=r.max_daily_loss_pct,
        starting_bankroll_usd=r.starting_bankroll_usd,
    )


def exchange_credentials() -> dict[str, str | None]:
    """Read once from the environment (see .env.example) and passed straight
    into ccxt -- never logged, never written to the YAML config."""
    return {
        "apiKey": os.environ.get("EXCHANGE_API_KEY") or None,
        "secret": os.environ.get("EXCHANGE_API_SECRET") or None,
        "password": os.environ.get("EXCHANGE_API_PASSPHRASE") or None,
    }
