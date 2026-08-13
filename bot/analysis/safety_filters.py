"""Hard safety gates: rug-pull / honeypot / dead-pair heuristics.

Anything that fails one of these is dropped before it ever reaches the
scoring model, no matter how good its chart looks -- a beautiful breakout
on a token where the deployer can mint infinite supply or freeze your
wallet is not a trade, it's a trap. See docs/STRATEGY.md for the reasoning
behind each gate.

Every check fails *safe*: if a data point needed to evaluate a gate isn't
available (e.g. an RPC or API call failed), the gate counts as failed
rather than being silently skipped, with one deliberate exception --
FDV/liquidity and buy/sell pressure, where DexScreener sometimes omits the
underlying numbers for very new pairs. Those default to "pass" only when
the data is genuinely absent, not when it's present and bad. The
fail-safe rule applies even when the *reason* a check couldn't complete is
mundane infrastructure flakiness rather than something about the token
itself: a false "safe" verdict risks real money, a false "unsafe" verdict
only risks a missed trade, and that asymmetry is worth erring on the
cautious side for every single time.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from bot.analysis.liquidity_guard import LiquidityTrend
from bot.data.honeypot_check import SellCheckResult
from bot.data.models import DexPair, SafetyResult
from bot.data.solana_safety import HolderConcentration, MintAuthorityInfo


@dataclass(slots=True)
class SafetyConfig:
    min_liquidity_usd: float = 8000.0
    min_volume_24h_usd: float = 15000.0
    min_pair_age_minutes: float = 15.0
    max_pair_age_days: float = 45.0
    min_txns_24h: int = 50
    require_solana_mint_authority_renounced: bool = True
    require_solana_freeze_authority_renounced: bool = True
    max_fdv_to_liquidity_ratio: float = 25.0
    min_buy_ratio_5m: float = 0.35
    max_liquidity_drawdown_pct: float = 40.0
    require_liquidity_stability_check: bool = True
    max_top_holder_concentration_pct: float = 70.0
    require_holder_concentration_check: bool = True
    require_sellable: bool = True
    blacklist_tokens: list[str] = field(default_factory=list)


def evaluate_safety(
    pair: DexPair,
    cfg: SafetyConfig,
    mint_info: MintAuthorityInfo | None = None,
    liquidity_trend: LiquidityTrend | None = None,
    holder_concentration: HolderConcentration | None = None,
    sell_check: SellCheckResult | None = None,
) -> SafetyResult:
    checks: dict[str, bool] = {}
    reasons: list[str] = []

    blacklisted = pair.key in cfg.blacklist_tokens or (
        f"{pair.chainId}:{pair.baseToken.address}" in cfg.blacklist_tokens
    )
    checks["not_blacklisted"] = not blacklisted
    if blacklisted:
        reasons.append("token is on the blacklist")

    liq = pair.liquidity.usd or 0.0
    checks["min_liquidity"] = liq >= cfg.min_liquidity_usd
    if not checks["min_liquidity"]:
        reasons.append(f"liquidity ${liq:,.0f} below floor ${cfg.min_liquidity_usd:,.0f}")

    vol24 = pair.volume.h24 or 0.0
    checks["min_volume"] = vol24 >= cfg.min_volume_24h_usd
    if not checks["min_volume"]:
        reasons.append(f"24h volume ${vol24:,.0f} below floor ${cfg.min_volume_24h_usd:,.0f}")

    age = pair.age_minutes
    checks["min_age"] = age is not None and age >= cfg.min_pair_age_minutes
    if not checks["min_age"]:
        reasons.append("pair younger than the minimum age floor (still in launch chaos)")

    checks["max_age"] = age is None or age <= cfg.max_pair_age_days * 24 * 60
    if not checks["max_age"]:
        reasons.append("pair older than the max age ceiling (likely already played out)")

    txns24 = pair.txns.h24
    checks["min_activity"] = (txns24.buys + txns24.sells) >= cfg.min_txns_24h
    if not checks["min_activity"]:
        reasons.append("too few 24h transactions to establish real activity")

    fdv = pair.fdv or 0.0
    if liq > 0 and fdv > 0:
        ratio = fdv / liq
        checks["fdv_liquidity_ratio"] = ratio <= cfg.max_fdv_to_liquidity_ratio
        if not checks["fdv_liquidity_ratio"]:
            reasons.append(f"FDV/liquidity ratio {ratio:.1f}x exceeds max {cfg.max_fdv_to_liquidity_ratio:.0f}x")
    else:
        checks["fdv_liquidity_ratio"] = True

    m5 = pair.txns.m5
    m5_total = m5.buys + m5.sells
    if m5_total >= 5:
        buy_ratio = m5.buys / m5_total
        checks["buy_sell_pressure"] = buy_ratio >= cfg.min_buy_ratio_5m
        if not checks["buy_sell_pressure"]:
            reasons.append(f"heavy 5m sell-off ({buy_ratio:.0%} of txns are buys)")
    else:
        checks["buy_sell_pressure"] = True

    if pair.chainId == "solana" and (
        cfg.require_solana_mint_authority_renounced or cfg.require_solana_freeze_authority_renounced
    ):
        if cfg.require_solana_mint_authority_renounced:
            renounced = mint_info is not None and mint_info.mint_authority_renounced
            checks["mint_authority_renounced"] = renounced
            if not renounced:
                reasons.append("mint authority not confirmed renounced (supply could be inflated)")
        if cfg.require_solana_freeze_authority_renounced:
            renounced = mint_info is not None and mint_info.freeze_authority_renounced
            checks["freeze_authority_renounced"] = renounced
            if not renounced:
                reasons.append("freeze authority not confirmed renounced (wallets could be frozen)")

    # Liquidity-crash check: not chain-specific (built purely from this
    # bot's own recorded price/liquidity ticks), and doesn't penalize a
    # pair the bot hasn't watched long enough yet to know either way.
    if cfg.require_liquidity_stability_check and liquidity_trend is not None and liquidity_trend.have_data:
        checks["liquidity_stable"] = not liquidity_trend.drawdown_exceeds(cfg.max_liquidity_drawdown_pct)
        if not checks["liquidity_stable"]:
            reasons.append(
                f"liquidity down {liquidity_trend.drawdown_pct:.0f}% from its recent peak "
                f"(possible rug in progress)"
            )

    # Holder concentration and sellability are both Solana/Jupiter-specific.
    if pair.chainId == "solana" and cfg.require_holder_concentration_check:
        concentration_pct = (
            holder_concentration.top_holders_excluding_largest_pct
            if holder_concentration is not None and holder_concentration.fetched_ok
            else None
        )
        if concentration_pct is not None:
            checks["holder_concentration"] = concentration_pct <= cfg.max_top_holder_concentration_pct
            if not checks["holder_concentration"]:
                reasons.append(
                    f"top holders (excl. likely pool) control {concentration_pct:.0f}% of supply"
                )
        else:
            checks["holder_concentration"] = False
            reasons.append("could not verify holder concentration on-chain")

    if pair.chainId == "solana" and cfg.require_sellable:
        if sell_check is not None and sell_check.checked:
            checks["sellable"] = sell_check.can_sell
            if not checks["sellable"]:
                reasons.append(f"no confirmed sell route ({sell_check.reason})")
        else:
            checks["sellable"] = False
            reasons.append("could not verify a sell route exists (possible honeypot)")

    passed = all(checks.values())
    return SafetyResult(passed=passed, reasons=reasons, checks=checks)
