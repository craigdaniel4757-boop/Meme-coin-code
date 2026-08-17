"""Backtest engine tests: single-symbol trade production, and multi-symbol
shared-bankroll sizing (an already-open trade on one symbol reduces the
notional available to size a new entry on another -- see
`run_backtest`/`_open_notional` in backtest/engine.py).
"""

from __future__ import annotations

import pytest

from eightam_bot.backtest.engine import run_backtest
from eightam_bot.models import Bias
from eightam_bot.risk_manager import RiskConfig
from eightam_bot.strategy import Phase
from tests.conftest import MONDAY, filler_candles, make_range_candles, mk_candle, ny_ts


def _range_and_filler_to_930(d=MONDAY, high: float = 110.0, low: float = 100.0):
    mid = (high + low) / 2
    return make_range_candles(d, high=high, low=low) + filler_candles(d, mid, (8, 15), (9, 31))


def test_single_symbol_backtest_produces_one_trade(strategy_cfg, risk_cfg):
    candles = _range_and_filler_to_930()
    candles.append(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0))  # breakout
    candles.append(mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0))  # retest fill
    candles.append(mk_candle(ny_ts(MONDAY, 9, 33), 110.0, 116.0, 109.0, 115.0))  # take-profit

    result = run_backtest(
        {"BTC/USDT": candles}, strategy_cfg, risk_cfg, simulated_slippage_bps=0.0, simulated_fee_bps=0.0
    )

    assert len(result.trades) == 1
    trade = result.trades[0]
    assert trade.symbol == "BTC/USDT"
    assert trade.bias is Bias.LONG
    assert trade.exit_reason == "take_profit"
    assert trade.realized_pnl_usd > 0
    assert result.final_equity_usd == pytest.approx(result.starting_equity_usd + trade.realized_pnl_usd)
    assert result.equity_curve[-1][1] == pytest.approx(result.final_equity_usd)


def test_empty_candles_returns_flat_result(strategy_cfg, risk_cfg):
    result = run_backtest({}, strategy_cfg, risk_cfg)
    assert result.trades == []
    assert result.equity_curve == []
    assert result.starting_equity_usd == pytest.approx(risk_cfg.starting_bankroll_usd)
    assert result.final_equity_usd == pytest.approx(risk_cfg.starting_bankroll_usd)


def test_multi_symbol_shares_bankroll_for_sizing(strategy_cfg):
    # 50% risk on a 6-point stop distance sizes far bigger than a $1,000
    # account -- BTC's fill will get capped at ~100% of the bankroll,
    # leaving nothing for ETH to size against while BTC is still open.
    tight_cfg = RiskConfig(
        stop_buffer_type="points", stop_buffer_value=1.0,
        take_profit_mode="points", take_profit_value=10.0,
        risk_per_trade_pct=50.0, max_daily_loss_pct=90.0, starting_bankroll_usd=1_000.0,
    )

    btc = _range_and_filler_to_930()
    btc.append(mk_candle(ny_ts(MONDAY, 9, 31), 108.0, 112.0, 108.0, 112.0))  # breakout
    btc.append(mk_candle(ny_ts(MONDAY, 9, 32), 110.0, 111.0, 104.0, 106.0))  # retest fill -- consumes ~all bankroll
    btc += filler_candles(MONDAY, 106.0, (9, 33), (9, 36))  # stays open, between stop and target
    btc.append(mk_candle(ny_ts(MONDAY, 9, 37), 110.0, 116.0, 109.0, 115.0))  # eventually takes profit

    eth = _range_and_filler_to_930()
    eth += filler_candles(MONDAY, 105.0, (9, 31), (9, 35))
    eth.append(mk_candle(ny_ts(MONDAY, 9, 35), 108.0, 112.0, 108.0, 112.0))  # breakout, while BTC is still open
    eth.append(mk_candle(ny_ts(MONDAY, 9, 36), 110.0, 111.0, 104.0, 106.0))  # retest touches, but no bankroll left

    result = run_backtest(
        {"BTC/USDT": btc, "ETH/USDT": eth}, strategy_cfg, tight_cfg, simulated_slippage_bps=0.0, simulated_fee_bps=0.0
    )

    symbols_traded = {t.symbol for t in result.trades}
    assert symbols_traded == {"BTC/USDT"}

    eth_state = result.runners["ETH/USDT"].state
    assert eth_state.phase is Phase.DONE
    assert "sizing" in eth_state.done_reason
