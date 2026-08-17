"""Optional ML confidence filter tests: feature extraction and a small
train/predict/save/load smoke test. This filter is off by default and
never required for the strategy to work -- these tests just confirm the
mechanics are correct, not that the model is predictive.
"""

from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

import pytest

from eightam_bot.ml_filter import RetestFilter, build_training_set, extract_features
from eightam_bot.models import Bias, BreakoutEvent, SessionRange, Trade
from eightam_bot.strategy import DayState, Phase
from tests.conftest import ny_ts

NY = ZoneInfo("America/New_York")
MONDAY = date(2024, 1, 8)


def _range(high: float = 110.0, low: float = 100.0, d: date = MONDAY) -> SessionRange:
    return SessionRange(session_date=d, high=high, low=low, start_ts=ny_ts(d, 8, 0), end_ts=ny_ts(d, 8, 15))


def test_extract_features_long_breakout():
    range_ = _range(110.0, 100.0)
    breakout = BreakoutEvent(bias=Bias.LONG, breakout_ts=ny_ts(MONDAY, 9, 45), breakout_price=112.0)

    feats = extract_features(range_, breakout, MONDAY, NY)

    assert feats is not None
    assert feats.range_width_pct == pytest.approx(10.0 / 105.0 * 100)
    assert feats.breakout_strength_pct == pytest.approx(2.0 / 110.0 * 100)  # |112-110| / 110
    assert feats.minutes_to_breakout == pytest.approx(15.0)  # 9:45 is 15 minutes after 9:30
    assert feats.bias_is_long == 1.0
    assert feats.day_of_week == 0.0  # Monday


def test_extract_features_short_breakout():
    range_ = _range(110.0, 100.0)
    breakout = BreakoutEvent(bias=Bias.SHORT, breakout_ts=ny_ts(MONDAY, 9, 30), breakout_price=97.0)

    feats = extract_features(range_, breakout, MONDAY, NY)

    assert feats.bias_is_long == 0.0
    assert feats.breakout_strength_pct == pytest.approx(3.0 / 100.0 * 100)  # |97-100| / 100
    assert feats.minutes_to_breakout == pytest.approx(0.0)


def test_extract_features_none_on_degenerate_range():
    range_ = SessionRange(session_date=MONDAY, high=0.0, low=0.0, start_ts=0, end_ts=1)
    breakout = BreakoutEvent(bias=Bias.LONG, breakout_ts=ny_ts(MONDAY, 9, 45), breakout_price=1.0)
    assert extract_features(range_, breakout, MONDAY, NY) is None


def _day_with_trade(symbol: str, pnl: float, breakout_strength: float = 2.0) -> DayState:
    range_ = _range()
    breakout = BreakoutEvent(bias=Bias.LONG, breakout_ts=ny_ts(MONDAY, 9, 45), breakout_price=110.0 + breakout_strength)
    trade = Trade(
        id="t", symbol=symbol, session_date=MONDAY, bias=Bias.LONG, entry_price=105.0, entry_ts=0,
        stop_price=99.0, target_price=115.0, quantity=1.0, risk_usd=6.0,
        exit_price=105.0 + pnl, exit_ts=100, exit_reason="take_profit" if pnl > 0 else "stop_loss",
        realized_pnl_usd=pnl,
    )
    return DayState(
        symbol=symbol, session_date=MONDAY, phase=Phase.DONE, session_range=range_, breakout=breakout, trade=trade
    )


def test_build_training_set_labels_wins_and_losses():
    days = [
        _day_with_trade("BTC/USDT", 100.0),
        _day_with_trade("BTC/USDT", -50.0),
        DayState(symbol="BTC/USDT", session_date=MONDAY, phase=Phase.DONE),  # no trade -- excluded
    ]

    features, labels = build_training_set(days, NY)

    assert len(features) == 2
    assert labels == [1, 0]


def test_retest_filter_train_predict_save_load(tmp_path):
    days = [
        _day_with_trade("BTC/USDT", 100.0 if i % 2 == 0 else -50.0, breakout_strength=3.0 if i % 2 == 0 else 0.5)
        for i in range(20)
    ]
    features, labels = build_training_set(days, NY)

    model = RetestFilter.train(features, labels)
    confidence = model.predict_confidence(features[0])
    assert 0.0 <= confidence <= 1.0

    path = tmp_path / "model.joblib"
    model.save(str(path))
    assert path.exists()

    reloaded = RetestFilter.load(str(path))
    assert reloaded.predict_confidence(features[0]) == pytest.approx(confidence)


def test_retest_filter_train_rejects_single_class_labels():
    days = [_day_with_trade("BTC/USDT", 100.0) for _ in range(5)]
    features, labels = build_training_set(days, NY)
    with pytest.raises(ValueError):
        RetestFilter.train(features, labels)


def test_predict_confidence_without_a_loaded_model_raises():
    days = [_day_with_trade("BTC/USDT", 1.0)]
    features, _ = build_training_set(days, NY)
    with pytest.raises(RuntimeError):
        RetestFilter().predict_confidence(features[0])
