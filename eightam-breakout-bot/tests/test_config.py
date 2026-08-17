"""Config loading + adapter tests against the real config/default.yaml, so a
schema drift between the YAML and its pydantic model is caught immediately."""

from __future__ import annotations

from datetime import time

from eightam_bot.config import build_risk_config, build_strategy_config, load_config


def test_load_default_config():
    cfg = load_config("config/default.yaml")
    assert cfg.market.exchange == "binance"
    assert cfg.market.symbols == ["BTC/USDT"]
    assert cfg.execution.mode == "paper"
    assert cfg.ml_filter.enabled is False


def test_build_strategy_config_from_default_yaml():
    cfg = load_config("config/default.yaml")
    strategy_cfg = build_strategy_config(cfg)

    assert str(strategy_cfg.tz) == "America/New_York"
    assert strategy_cfg.range_start == time(8, 0)
    assert strategy_cfg.range_end == time(8, 15)
    assert strategy_cfg.trade_window_start == time(9, 30)
    assert strategy_cfg.trade_window_end == time(11, 0)
    assert strategy_cfg.force_close_time == time(12, 0)
    assert strategy_cfg.trading_days == frozenset({0, 1, 2, 3, 4})
    assert strategy_cfg.breakout_confirmation == "close"


def test_build_risk_config_from_default_yaml():
    cfg = load_config("config/default.yaml")
    risk_cfg = build_risk_config(cfg)

    assert risk_cfg.stop_buffer_type == "percent"
    assert risk_cfg.take_profit_mode == "r_multiple"
    assert risk_cfg.take_profit_value == 3.0
    assert risk_cfg.starting_bankroll_usd == 10_000.0


def test_unknown_yaml_keys_do_not_crash(tmp_path):
    # pydantic's default is to ignore unknown fields rather than error --
    # confirm a config with an extra, unrecognized top-level key still loads.
    path = tmp_path / "custom.yaml"
    path.write_text("market:\n  exchange: kraken\n  symbols: [ETH/USDT]\nsome_future_section:\n  foo: bar\n")

    cfg = load_config(str(path))
    assert cfg.market.exchange == "kraken"
    assert cfg.market.symbols == ["ETH/USDT"]
