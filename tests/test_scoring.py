"""Scoring model tests -- monotonicity and boundary checks rather than
exact magic numbers, since the weights are explicitly configurable and
there is no single "correct" score for a given input.
"""

from __future__ import annotations

import pytest

from bot.analysis.safety_filters import SafetyConfig, evaluate_safety
from bot.analysis.scoring import ScoringWeights, compute_score
from bot.data.models import IndicatorSnapshot, SafetyResult
from bot.data.solana_safety import HolderAccount, HolderConcentration
from tests.conftest import make_pair


def _bullish_indicators() -> IndicatorSnapshot:
    return IndicatorSnapshot(
        price=1.5, rsi=65, ema_fast=1.5, ema_mid=1.4, ema_slow=1.2, macd=0.05, macd_signal=0.02,
        macd_hist=0.03, macd_hist_prev=0.02, bb_upper=1.6, bb_mid=1.4, bb_lower=1.2, bb_bandwidth=15,
        atr=0.08, atr_pct=6.0, volume_zscore=2.5, swing_high=1.4, swing_low=1.1, ema_fast_slope=5.0,
        num_candles=150,
    )


def _bearish_indicators() -> IndicatorSnapshot:
    return IndicatorSnapshot(
        price=0.8, rsi=25, ema_fast=0.8, ema_mid=0.9, ema_slow=1.1, macd=-0.05, macd_signal=-0.01,
        macd_hist=-0.04, macd_hist_prev=-0.02, bb_upper=1.1, bb_mid=0.95, bb_lower=0.8, bb_bandwidth=25,
        atr=0.3, atr_pct=30.0, volume_zscore=-0.5, swing_high=1.0, swing_low=0.75, ema_fast_slope=-6.0,
        num_candles=150,
    )


def _neutral_safety(pair) -> SafetyResult:
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_holder_concentration_check=False,
        require_sellable=False,
    )
    return evaluate_safety(pair, cfg)


def test_score_within_bounds():
    pair = make_pair()
    safety = _neutral_safety(pair)
    for indicators in (_bullish_indicators(), _bearish_indicators()):
        score = compute_score(pair, indicators, safety, ScoringWeights())
        for value in (score.total, score.trend, score.momentum, score.volume, score.volatility, score.liquidity_safety, score.social):
            assert 0.0 <= value <= 100.0


def test_bullish_indicators_score_higher_than_bearish():
    pair = make_pair()
    safety = _neutral_safety(pair)
    bullish = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    bearish = compute_score(pair, _bearish_indicators(), safety, ScoringWeights())

    assert bullish.trend > bearish.trend
    assert bullish.momentum > bearish.momentum
    assert bullish.total > bearish.total


def test_missing_indicator_data_is_neutral_not_zero():
    """A coin too new to have deep candle history shouldn't be scored as
    if it were actively bearish -- purely indicator-derived sub-scores
    should land on a neutral midpoint, not collapse to 0."""
    pair = make_pair()
    safety = _neutral_safety(pair)
    empty_indicators = IndicatorSnapshot(price=1.0)  # every indicator field defaults to None

    score = compute_score(pair, empty_indicators, safety, ScoringWeights())

    assert score.trend == 50.0
    assert score.momentum == 50.0
    assert score.volatility == 50.0


def test_failed_safety_is_noted_but_score_still_computed():
    pair = make_pair(liquidity_usd=100.0)  # far below any reasonable floor
    cfg = SafetyConfig(min_liquidity_usd=8000.0)
    safety = evaluate_safety(pair, cfg)
    assert not safety.passed

    score = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    assert 0.0 <= score.total <= 100.0
    assert any("FAILED" in note for note in score.notes)


def test_weights_normalize_even_if_not_summing_to_one():
    w = ScoringWeights(trend=2, momentum=2, volume=2, volatility=2, liquidity_safety=2, social=2)
    n = w.normalized()
    total = n.trend + n.momentum + n.volume + n.volatility + n.liquidity_safety + n.social
    assert total == pytest.approx(1.0)
    assert n.trend == pytest.approx(1 / 6)


def test_holder_concentration_omitted_defaults_to_neutral_and_no_note():
    pair = make_pair()
    safety = _neutral_safety(pair)
    score = compute_score(pair, _bullish_indicators(), safety, ScoringWeights(), holder_concentration=None)

    assert 0.0 <= score.liquidity_safety <= 100.0
    assert not any("concentration" in note for note in score.notes)


def test_healthy_holder_concentration_scores_better_than_concentrated():
    pair = make_pair()
    safety = _neutral_safety(pair)
    healthy = HolderConcentration(
        mint_address="MINT",
        fetched_ok=True,
        top_holders=[
            HolderAccount(address="PoolVault", ui_amount=600_000.0),  # largest -> excluded as the presumed pool
            HolderAccount(address="Holder2", ui_amount=20_000.0),
        ],
        total_supply_ui=1_000_000.0,
    )
    concentrated = HolderConcentration(
        mint_address="MINT",
        fetched_ok=True,
        top_holders=[
            # The pool must stay the single *largest* holder for the "exclude
            # the largest" heuristic to actually exclude it -- a whale
            # bigger than the pool itself is the documented edge case where
            # the heuristic breaks down, not what this fixture means to test.
            HolderAccount(address="PoolVault", ui_amount=340_000.0),
            HolderAccount(address="Whale", ui_amount=335_000.0),
            HolderAccount(address="Whale2", ui_amount=325_000.0),
        ],
        total_supply_ui=1_000_000.0,
    )

    healthy_score = compute_score(pair, _bullish_indicators(), safety, ScoringWeights(), holder_concentration=healthy)
    concentrated_score = compute_score(
        pair, _bullish_indicators(), safety, ScoringWeights(), holder_concentration=concentrated
    )

    assert healthy_score.liquidity_safety > concentrated_score.liquidity_safety
    assert any("concentration" in note for note in concentrated_score.notes)
