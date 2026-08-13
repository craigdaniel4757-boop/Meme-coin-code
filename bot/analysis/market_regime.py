"""Market-regime filter: don't buy into an active broad-market selloff.

Meme coins are highly correlated with the broader sentiment of the chain
they trade on -- when SOL itself is dropping hard, most Solana meme coins
drop with it regardless of how good any individual coin's own chart looks.
Nothing else in this bot's safety/scoring model looks beyond each
candidate's own numbers, so this fills a real gap: a simple check of
whether a chain's reference token is in a sharp short-term downtrend,
computed once per scan cycle and used to pause *new* entries on that
chain until it recovers -- the same "halt new entries, keep managing
what's already open" pattern the daily-loss circuit breaker already uses
(see bot/strategy/risk_manager.py's `check_circuit_breaker`).

Deliberately conservative about which chains this applies to: it needs a
reliable token mint/contract address to look up the chain's reference
pair, and getting that wrong (a stale, wrong, or fabricated address)
would silently produce a meaningless or misleading signal -- worse than
not having the check at all. `config/default.yaml` only pre-fills Solana's
Wrapped SOL mint, since that's the one address this project's own code
already relies on elsewhere (see `quoteToken` in bot/data/models.py's
synthetic/test pairs) -- add others yourself if you want the same
protection on other chains, and verify the address independently first.

Live-only: not evaluated in backtests, for the same reason the on-chain
safety checks aren't (see docs/STRATEGY.md section 6) -- there's no
historical reference-token series aligned to a backtest's own timestamps
without materially more plumbing than this is worth.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from bot.data.models import DexPair


@dataclass(slots=True)
class MarketRegimeConfig:
    enabled: bool = True
    max_drop_pct_1h: float = 7.0
    reference_tokens: dict[str, str] = field(default_factory=dict)  # chain_id -> token mint/contract address


@dataclass(slots=True)
class MarketRegimeStatus:
    chain_id: str
    have_data: bool
    reference_symbol: str | None = None
    price_change_pct_1h: float | None = None

    def is_downtrend(self, max_drop_pct_1h: float) -> bool:
        return (
            self.have_data
            and self.price_change_pct_1h is not None
            and self.price_change_pct_1h <= -max_drop_pct_1h
        )


def evaluate_market_regime(chain_id: str, reference_pair: DexPair | None) -> MarketRegimeStatus:
    """Pure function: `reference_pair` is whatever the caller already
    resolved as the chain's most-liquid pair for its configured reference
    token (see `Scanner._resolve_market_regime_pairs` in
    bot/scanner/screener.py for the actual DexScreener lookup). `have_data
    =False` when there's no resolved pair yet or DexScreener hasn't
    reported a 1h price change for it -- callers should treat that as
    "unknown," not "downtrend," matching every other best-effort check in
    this project."""
    if reference_pair is None or reference_pair.priceChange.h1 is None:
        return MarketRegimeStatus(chain_id=chain_id, have_data=False)
    return MarketRegimeStatus(
        chain_id=chain_id,
        have_data=True,
        reference_symbol=reference_pair.symbol,
        price_change_pct_1h=reference_pair.priceChange.h1,
    )
