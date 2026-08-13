"""Market-regime filter tests -- pure computation over an already-resolved
reference pair (the DexScreener lookup itself lives in
bot/scanner/screener.py's `_resolve_market_regime`, not tested here directly
since Scanner has no dedicated test module, consistent with the rest of
this project's testing depth)."""

from __future__ import annotations

from bot.analysis.market_regime import MarketRegimeStatus, evaluate_market_regime
from tests.conftest import make_pair


def test_sharp_drop_is_downtrend():
    pair = make_pair()
    pair.priceChange.h1 = -12.0
    status = evaluate_market_regime("solana", pair)

    assert status.have_data
    assert status.price_change_pct_1h == -12.0
    assert status.is_downtrend(max_drop_pct_1h=7.0) is True


def test_mild_move_is_not_downtrend():
    pair = make_pair()
    pair.priceChange.h1 = -2.0
    status = evaluate_market_regime("solana", pair)

    assert status.is_downtrend(max_drop_pct_1h=7.0) is False


def test_uptrend_is_not_downtrend():
    pair = make_pair()
    pair.priceChange.h1 = 15.0
    status = evaluate_market_regime("solana", pair)

    assert status.is_downtrend(max_drop_pct_1h=7.0) is False


def test_exactly_at_threshold_counts_as_downtrend():
    pair = make_pair()
    pair.priceChange.h1 = -7.0
    status = evaluate_market_regime("solana", pair)

    assert status.is_downtrend(max_drop_pct_1h=7.0) is True


def test_missing_reference_pair_has_no_data():
    status = evaluate_market_regime("solana", None)

    assert not status.have_data
    assert status.is_downtrend(max_drop_pct_1h=7.0) is False  # unknown must never read as "downtrend"


def test_missing_price_change_field_has_no_data():
    pair = make_pair()
    pair.priceChange.h1 = None
    status = evaluate_market_regime("solana", pair)

    assert not status.have_data
    assert status.is_downtrend(max_drop_pct_1h=7.0) is False


def test_status_is_downtrend_never_true_without_data():
    status = MarketRegimeStatus(chain_id="solana", have_data=False, price_change_pct_1h=-50.0)
    assert status.is_downtrend(max_drop_pct_1h=7.0) is False
