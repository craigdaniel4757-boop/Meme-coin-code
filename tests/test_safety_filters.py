"""Hard safety gate tests. Every check should fail *closed* when the data
needed to evaluate it is missing, except the two documented exceptions
(FDV/liquidity ratio and buy/sell pressure, which pass when the underlying
numbers are simply absent rather than present-and-bad) -- see the module
docstring in bot/analysis/safety_filters.py.
"""

from __future__ import annotations

from bot.analysis.liquidity_guard import LiquidityTrend
from bot.analysis.safety_filters import SafetyConfig, evaluate_safety
from bot.data.honeypot_check import SellCheckResult
from bot.data.solana_safety import HolderAccount, HolderConcentration, MintAuthorityInfo
from tests.conftest import make_pair

NO_SOLANA_CHECKS = SafetyConfig(
    require_solana_mint_authority_renounced=False,
    require_solana_freeze_authority_renounced=False,
    require_liquidity_stability_check=False,
    require_holder_concentration_check=False,
    require_sellable=False,
)


def test_healthy_pair_passes():
    pair = make_pair()
    result = evaluate_safety(pair, NO_SOLANA_CHECKS)
    assert result.passed
    assert result.reasons == []


def test_low_liquidity_fails():
    pair = make_pair(liquidity_usd=500.0)
    cfg = SafetyConfig(
        min_liquidity_usd=8000.0,
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["min_liquidity"] is False


def test_low_volume_fails():
    pair = make_pair(volume_24h_usd=100.0)
    cfg = SafetyConfig(
        min_volume_24h_usd=15000.0,
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["min_volume"] is False


def test_too_young_fails():
    pair = make_pair(age_minutes=2.0)
    cfg = SafetyConfig(
        min_pair_age_minutes=15.0,
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["min_age"] is False


def test_too_old_fails():
    pair = make_pair(age_minutes=999_999.0)
    cfg = SafetyConfig(
        max_pair_age_days=45.0,
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["max_age"] is False


def test_high_fdv_to_liquidity_ratio_fails():
    pair = make_pair(liquidity_usd=10_000.0, fdv=10_000_000.0)  # 1000x
    cfg = SafetyConfig(
        max_fdv_to_liquidity_ratio=25.0,
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["fdv_liquidity_ratio"] is False


def test_heavy_sell_pressure_fails():
    pair = make_pair(buys_5m=5, sells_5m=45)  # 10% buys
    cfg = SafetyConfig(
        min_buy_ratio_5m=0.35,
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["buy_sell_pressure"] is False


def test_blacklisted_token_fails_regardless_of_stats():
    pair = make_pair(chain_id="solana", pair_address="BADPAIR")
    cfg = SafetyConfig(
        blacklist_tokens=["solana:BADPAIR"],
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
    )
    result = evaluate_safety(pair, cfg)
    assert not result.passed
    assert result.checks["not_blacklisted"] is False


def test_solana_missing_mint_info_fails_closed():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(require_solana_mint_authority_renounced=True, require_solana_freeze_authority_renounced=True)
    result = evaluate_safety(pair, cfg, mint_info=None)
    assert not result.passed
    assert result.checks["mint_authority_renounced"] is False
    assert result.checks["freeze_authority_renounced"] is False


def test_solana_renounced_authorities_pass():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=True,
        require_solana_freeze_authority_renounced=True,
        require_liquidity_stability_check=False,
        require_holder_concentration_check=False,
        require_sellable=False,
    )
    mint_info = MintAuthorityInfo(
        mint_address="x", parsed_ok=True, mint_authority=None, freeze_authority=None, decimals=6, supply=10**9
    )
    result = evaluate_safety(pair, cfg, mint_info=mint_info)
    assert result.checks["mint_authority_renounced"] is True
    assert result.checks["freeze_authority_renounced"] is True
    assert result.passed


def test_solana_retained_mint_authority_fails():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(require_solana_mint_authority_renounced=True, require_solana_freeze_authority_renounced=False)
    mint_info = MintAuthorityInfo(
        mint_address="x", parsed_ok=True, mint_authority="DeployerWallet111", freeze_authority=None,
        decimals=6, supply=1,
    )
    result = evaluate_safety(pair, cfg, mint_info=mint_info)
    assert not result.passed
    assert result.checks["mint_authority_renounced"] is False


def test_non_solana_chain_skips_solana_checks():
    pair = make_pair(chain_id="ethereum")
    cfg = SafetyConfig(require_solana_mint_authority_renounced=True, require_solana_freeze_authority_renounced=True)
    result = evaluate_safety(pair, cfg, mint_info=None)
    assert "mint_authority_renounced" not in result.checks
    assert "freeze_authority_renounced" not in result.checks
    assert result.passed


# -- Liquidity-crash (stability) check --------------------------------------

def test_liquidity_crash_fails():
    pair = make_pair()
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_holder_concentration_check=False,
        require_sellable=False,
        max_liquidity_drawdown_pct=40.0,
    )
    trend = LiquidityTrend(have_data=True, current_liquidity_usd=5_000, recent_peak_liquidity_usd=20_000, drawdown_pct=75.0)
    result = evaluate_safety(pair, cfg, liquidity_trend=trend)
    assert not result.passed
    assert result.checks["liquidity_stable"] is False


def test_liquidity_stable_passes():
    pair = make_pair()
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_holder_concentration_check=False,
        require_sellable=False,
        max_liquidity_drawdown_pct=40.0,
    )
    trend = LiquidityTrend(have_data=True, current_liquidity_usd=19_500, recent_peak_liquidity_usd=20_000, drawdown_pct=2.5)
    result = evaluate_safety(pair, cfg, liquidity_trend=trend)
    assert result.passed
    assert result.checks["liquidity_stable"] is True


def test_liquidity_trend_without_data_does_not_block():
    """A pair the bot has only just started watching hasn't been observed
    long enough to know whether liquidity dropped -- `have_data=False`
    should not count against it (distinct from a confirmed crash)."""
    pair = make_pair()
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_holder_concentration_check=False,
        require_sellable=False,
    )
    result = evaluate_safety(pair, cfg, liquidity_trend=LiquidityTrend(have_data=False))
    assert result.passed
    assert "liquidity_stable" not in result.checks


# -- Holder concentration check ----------------------------------------------

def test_holder_concentration_healthy_spread_passes():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_sellable=False,
        max_top_holder_concentration_pct=70.0,
    )
    concentration = HolderConcentration(
        mint_address="MINT",
        fetched_ok=True,
        top_holders=[
            HolderAccount(address="PoolVault", ui_amount=600_000.0),
            HolderAccount(address="Holder2", ui_amount=50_000.0),
            HolderAccount(address="Holder3", ui_amount=30_000.0),
        ],
        total_supply_ui=1_000_000.0,
    )
    result = evaluate_safety(pair, cfg, holder_concentration=concentration)
    assert result.passed
    assert result.checks["holder_concentration"] is True


def test_holder_concentration_concentrated_fails():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_sellable=False,
        max_top_holder_concentration_pct=50.0,
    )
    concentration = HolderConcentration(
        mint_address="MINT",
        fetched_ok=True,
        top_holders=[
            # The pool must stay the single *largest* holder for the
            # "exclude the largest" heuristic to exclude it -- see the
            # matching comment in tests/test_scoring.py.
            HolderAccount(address="PoolVault", ui_amount=340_000.0),
            HolderAccount(address="Whale", ui_amount=335_000.0),
            HolderAccount(address="Whale2", ui_amount=325_000.0),
        ],
        total_supply_ui=1_000_000.0,
    )
    result = evaluate_safety(pair, cfg, holder_concentration=concentration)
    assert not result.passed
    assert result.checks["holder_concentration"] is False


def test_holder_concentration_missing_data_fails_closed():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_sellable=False,
    )
    result = evaluate_safety(pair, cfg, holder_concentration=None)
    assert not result.passed
    assert result.checks["holder_concentration"] is False

    unfetched = HolderConcentration(mint_address="MINT", fetched_ok=False)
    result2 = evaluate_safety(pair, cfg, holder_concentration=unfetched)
    assert not result2.passed
    assert result2.checks["holder_concentration"] is False


def test_holder_concentration_skipped_on_non_solana_chain():
    pair = make_pair(chain_id="ethereum")
    cfg = SafetyConfig(require_solana_mint_authority_renounced=False, require_solana_freeze_authority_renounced=False)
    result = evaluate_safety(pair, cfg, holder_concentration=None)
    assert "holder_concentration" not in result.checks


# -- Sellability (honeypot) check --------------------------------------------

def test_sellable_token_passes():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_holder_concentration_check=False,
    )
    sell_check = SellCheckResult(checked=True, can_sell=True, price_impact_pct=1.2)
    result = evaluate_safety(pair, cfg, sell_check=sell_check)
    assert result.passed
    assert result.checks["sellable"] is True


def test_honeypot_token_fails():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_holder_concentration_check=False,
    )
    sell_check = SellCheckResult(checked=True, can_sell=False, reason="no sell route found")
    result = evaluate_safety(pair, cfg, sell_check=sell_check)
    assert not result.passed
    assert result.checks["sellable"] is False


def test_unverifiable_sell_route_fails_closed():
    pair = make_pair(chain_id="solana")
    cfg = SafetyConfig(
        require_solana_mint_authority_renounced=False,
        require_solana_freeze_authority_renounced=False,
        require_liquidity_stability_check=False,
        require_holder_concentration_check=False,
    )
    result = evaluate_safety(pair, cfg, sell_check=None)
    assert not result.passed
    assert result.checks["sellable"] is False

    unchecked = SellCheckResult(checked=False, can_sell=False, reason="quote unavailable")
    result2 = evaluate_safety(pair, cfg, sell_check=unchecked)
    assert not result2.passed
    assert result2.checks["sellable"] is False


def test_sellable_skipped_on_non_solana_chain():
    pair = make_pair(chain_id="ethereum")
    cfg = SafetyConfig(require_solana_mint_authority_renounced=False, require_solana_freeze_authority_renounced=False)
    result = evaluate_safety(pair, cfg, sell_check=None)
    assert "sellable" not in result.checks
