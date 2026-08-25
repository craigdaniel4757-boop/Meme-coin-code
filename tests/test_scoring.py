"""Scoring model tests -- monotonicity and boundary checks rather than
exact magic numbers, since the weights are explicitly configurable and
there is no single "correct" score for a given input.
"""

from __future__ import annotations

import dataclasses

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


def test_normal_trade_sizes_no_wash_trading_note():
    # $50k liquidity, $300k 24h volume, 500 24h txns -> ~$600 average
    # trade, a small fraction of liquidity.
    pair = make_pair(volume_24h_usd=300_000.0, buys_24h=300, sells_24h=200)
    safety = _neutral_safety(pair)
    score = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    assert not any("wash trading" in note for note in score.notes)


def test_large_average_trade_size_flags_wash_trading():
    # Same $50k liquidity and $300k volume, but only 50 24h transactions
    # (still enough to clear the unrelated min-activity safety floor) --
    # each averaging $6k, 12% of the entire pool's liquidity.
    pair = make_pair(volume_24h_usd=300_000.0, buys_24h=30, sells_24h=20)
    safety = _neutral_safety(pair)
    score = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    assert any("wash trading" in note for note in score.notes)


def test_large_average_trade_size_scores_worse_than_normal():
    normal = make_pair(volume_24h_usd=300_000.0, buys_24h=300, sells_24h=200)
    suspicious = make_pair(volume_24h_usd=300_000.0, buys_24h=30, sells_24h=20)
    safety_normal = _neutral_safety(normal)
    safety_suspicious = _neutral_safety(suspicious)

    normal_score = compute_score(normal, _bullish_indicators(), safety_normal, ScoringWeights())
    suspicious_score = compute_score(suspicious, _bullish_indicators(), safety_suspicious, ScoringWeights())

    assert suspicious_score.volume < normal_score.volume


def test_bearish_divergence_lowers_momentum_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    diverging = compute_score(
        pair, dataclasses.replace(_bullish_indicators(), bearish_divergence=True), safety, ScoringWeights()
    )

    assert diverging.momentum < plain.momentum
    assert any("bearish RSI divergence" in note for note in diverging.notes)


def test_bullish_divergence_raises_momentum_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _bearish_indicators(), safety, ScoringWeights())
    diverging = compute_score(
        pair, dataclasses.replace(_bearish_indicators(), bullish_divergence=True), safety, ScoringWeights()
    )

    assert diverging.momentum > plain.momentum
    assert any("bullish RSI divergence" in note for note in diverging.notes)


def test_bearish_obv_divergence_lowers_momentum_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    diverging = compute_score(
        pair, dataclasses.replace(_bullish_indicators(), bearish_obv_divergence=True), safety, ScoringWeights()
    )

    assert diverging.momentum < plain.momentum
    assert any("bearish OBV divergence" in note for note in diverging.notes)


def test_bullish_obv_divergence_raises_momentum_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _bearish_indicators(), safety, ScoringWeights())
    diverging = compute_score(
        pair, dataclasses.replace(_bearish_indicators(), bullish_obv_divergence=True), safety, ScoringWeights()
    )

    assert diverging.momentum > plain.momentum
    assert any("bullish OBV divergence" in note for note in diverging.notes)


def test_rsi_and_obv_divergence_compound_rather_than_override():
    """Both are independent signals (price-derived vs. volume-flow-derived,
    see bot/analysis/indicators.py) -- when they agree, both should count,
    not just whichever the code happens to check first."""
    pair = make_pair()
    safety = _neutral_safety(pair)
    only_rsi = compute_score(
        pair, dataclasses.replace(_bullish_indicators(), bearish_divergence=True), safety, ScoringWeights()
    )
    both = compute_score(
        pair,
        dataclasses.replace(_bullish_indicators(), bearish_divergence=True, bearish_obv_divergence=True),
        safety, ScoringWeights(),
    )
    assert both.momentum < only_rsi.momentum


# -- ADX ---------------------------------------------------------------------


def _moderate_uptrend_indicators(**overrides) -> IndicatorSnapshot:
    """alignment_points == 2 (price > fast > mid, but mid < slow) with a
    flat slope -- deliberately mid-range trend score (60, not near 0 or
    100) so ADX adjustments below are checked without floor/ceiling
    clamping masking whether the adjustment actually applied."""
    base = dict(price=1.1, ema_fast=1.05, ema_mid=1.0, ema_slow=1.02, ema_fast_slope=0.0, num_candles=150)
    base.update(overrides)
    return IndicatorSnapshot(**base)


def _moderate_downtrend_indicators(**overrides) -> IndicatorSnapshot:
    """alignment_points == 1 -- a bullish-leaning EMA stack, but not
    aligned enough to count as "confirmed" by the ADX logic in
    bot/analysis/scoring.py's _trend_score."""
    base = dict(price=1.1, ema_fast=1.0, ema_mid=1.05, ema_slow=1.1, ema_fast_slope=0.0, num_candles=150)
    base.update(overrides)
    return IndicatorSnapshot(**base)


def test_high_adx_confirming_the_ema_stack_raises_trend_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _moderate_uptrend_indicators(), safety, ScoringWeights())
    confirmed = compute_score(
        pair, _moderate_uptrend_indicators(adx=30.0), safety, ScoringWeights()
    )
    assert confirmed.trend > plain.trend
    assert any("confirms a real trend" in note for note in confirmed.notes)


def test_high_adx_against_a_weakly_aligned_stack_lowers_trend_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _moderate_downtrend_indicators(), safety, ScoringWeights())
    against = compute_score(
        pair, _moderate_downtrend_indicators(adx=30.0), safety, ScoringWeights()
    )
    assert against.trend < plain.trend
    assert any("trending, but against the EMA stack" in note for note in against.notes)


def test_low_adx_choppy_market_lowers_trend_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _moderate_uptrend_indicators(), safety, ScoringWeights())
    choppy = compute_score(pair, _moderate_uptrend_indicators(adx=8.0), safety, ScoringWeights())
    assert choppy.trend < plain.trend
    assert any("weak/choppy" in note for note in choppy.notes)


def test_mid_range_adx_is_ambiguous_and_does_not_adjust_trend_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _moderate_uptrend_indicators(), safety, ScoringWeights())
    ambiguous = compute_score(pair, _moderate_uptrend_indicators(adx=20.0), safety, ScoringWeights())
    assert ambiguous.trend == plain.trend


def test_missing_adx_does_not_adjust_trend_score():
    """A pair too new for ADX to have computed yet (None) must fail open --
    same asymmetry as higher-timeframe confirmation, not a safety gate."""
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _moderate_uptrend_indicators(), safety, ScoringWeights())
    missing = compute_score(pair, _moderate_uptrend_indicators(adx=None), safety, ScoringWeights())
    assert missing.trend == plain.trend


# -- anchored VWAP ------------------------------------------------------------


def test_price_above_anchored_vwap_raises_trend_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    above = compute_score(
        pair, dataclasses.replace(_bullish_indicators(), anchored_vwap=_bullish_indicators().price - 0.5),
        safety, ScoringWeights(),
    )
    assert above.trend > plain.trend
    assert any("above anchored VWAP" in note for note in above.notes)


def test_price_below_anchored_vwap_lowers_trend_score():
    pair = make_pair()
    safety = _neutral_safety(pair)
    plain = compute_score(pair, _bullish_indicators(), safety, ScoringWeights())
    below = compute_score(
        pair, dataclasses.replace(_bullish_indicators(), anchored_vwap=_bullish_indicators().price + 0.5),
        safety, ScoringWeights(),
    )
    assert below.trend < plain.trend
    assert any("below anchored VWAP" in note for note in below.notes)
