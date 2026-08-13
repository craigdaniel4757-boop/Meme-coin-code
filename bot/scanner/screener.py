"""The continuous scan -> filter -> score -> signal -> execute loop.

`Scanner` owns every client (DexScreener, GeckoTerminal, Solana RPC,
Jupiter) and runs a bounded-concurrency pipeline over however many
candidates discovery turns up each cycle:

  discover (boosts/profiles/search/watchlist)
    -> cheap pre-filter (liquidity/volume/age/activity, no network)
    -> per-candidate: candles -> indicators -> on-chain/liquidity/sellability
       checks -> safety gate -> composite score -> strategies
    -> rank by score
    -> [only in `run`, not `scan`] manage existing positions, then size and
       enter new ones for whatever passed both the safety gate and the
       score threshold with a live BUY signal

`scan_once()` is used by the read-only `scan` CLI command (no execution
provider needed). `run_forever()` is used by `run` and drives execution.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from typing import Callable

from bot.analysis.indicators import compute_indicator_snapshot
from bot.analysis.liquidity_guard import compute_liquidity_trend
from bot.analysis.safety_filters import evaluate_safety
from bot.analysis.scoring import compute_score
from bot.config import (
    AppConfig,
    build_indicator_params,
    build_risk_config,
    build_safety_config,
    build_scoring_weights,
)
from bot.data.candles import CandleProvider
from bot.data.dexscreener import DexScreenerClient
from bot.data.geckoterminal import GeckoTerminalClient
from bot.data.honeypot_check import HoneypotCheckClient
from bot.data.models import Candidate, DexPair, SignalAction
from bot.data.solana_safety import SolanaSafetyClient
from bot.execution.base import ExecutionProvider
from bot.notify.alerts import notify
from bot.storage.db import Database
from bot.strategy.base import StrategyContext
from bot.strategy.risk_manager import (
    can_open_new_position,
    check_circuit_breaker,
    evaluate_exits,
    size_position,
)
from bot.strategy.signals import run_strategies

logger = logging.getLogger(__name__)


def _start_of_day_ts() -> float:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


class Scanner:
    def __init__(self, cfg: AppConfig, db: Database, execution: ExecutionProvider | None = None) -> None:
        self.cfg = cfg
        self.db = db
        self.execution = execution

        self.dex_client = DexScreenerClient(
            base_url=cfg.data.dexscreener.base_url,
            requests_per_minute=cfg.data.dexscreener.requests_per_minute,
        )
        self.gecko_client = (
            GeckoTerminalClient(
                base_url=cfg.data.geckoterminal.base_url,
                requests_per_minute=cfg.data.geckoterminal.requests_per_minute,
                api_key=os.environ.get("GECKOTERMINAL_API_KEY") or None,
            )
            if cfg.data.geckoterminal.enabled
            else None
        )
        self.solana_client = SolanaSafetyClient(
            rpc_url=cfg.data.solana_rpc.url,
            requests_per_minute=cfg.data.solana_rpc.requests_per_minute,
        )
        self.honeypot_client = HoneypotCheckClient(
            base_url=cfg.data.jupiter.base_url,
            requests_per_minute=cfg.data.jupiter.requests_per_minute,
        )
        self.candle_provider = CandleProvider(
            db=db,
            gecko_client=self.gecko_client,
            fallback_interval_seconds=cfg.data.candles.fallback_interval_seconds,
            max_local_candles=cfg.data.candles.max_local_candles,
        )

        self.indicator_params = build_indicator_params(cfg)
        self.scoring_weights = build_scoring_weights(cfg)
        self.safety_cfg = build_safety_config(cfg)
        self.risk_cfg = build_risk_config(cfg)

        self._sem = asyncio.Semaphore(max(cfg.scanner.max_concurrent_requests, 1))
        self._stack: AsyncExitStack | None = None

    async def __aenter__(self) -> "Scanner":
        self._stack = AsyncExitStack()
        await self._stack.enter_async_context(self.dex_client)
        if self.gecko_client is not None:
            await self._stack.enter_async_context(self.gecko_client)
        await self._stack.enter_async_context(self.solana_client)
        await self._stack.enter_async_context(self.honeypot_client)
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._stack is not None:
            await self._stack.aclose()
            self._stack = None

    # -- discovery ----------------------------------------------------------

    async def _resolve_token_refs(self, refs: list[tuple[str, str]]) -> list[DexPair]:
        chains = set(self.cfg.scanner.chains)
        by_chain: dict[str, list[str]] = {}
        for chain_id, address in refs:
            if chain_id in chains and address:
                by_chain.setdefault(chain_id, []).append(address)

        out: list[DexPair] = []
        for chain_id, addresses in by_chain.items():
            unique = list(dict.fromkeys(addresses))
            out.extend(await self.dex_client.get_pairs_by_token_addresses(chain_id, unique))
        return out

    async def _discover_from_boosts(self, fetch_fn) -> list[DexPair]:
        items = await fetch_fn()
        return await self._resolve_token_refs([(b.chainId, b.tokenAddress) for b in items])

    async def _discover_from_profiles(self) -> list[DexPair]:
        items = await self.dex_client.get_latest_token_profiles()
        return await self._resolve_token_refs([(p.chainId, p.tokenAddress) for p in items])

    async def discover_candidates(self) -> list[DexPair]:
        disc = self.cfg.scanner.discovery
        chains = set(self.cfg.scanner.chains)
        seen: dict[str, DexPair] = {}

        def add_pairs(pairs: list[DexPair]) -> None:
            for p in pairs:
                if p.chainId in chains and p.pairAddress:
                    seen.setdefault(p.key, p)

        tasks = []
        if disc.use_latest_boosted:
            tasks.append(self._discover_from_boosts(self.dex_client.get_latest_boosted_tokens))
        if disc.use_top_boosted:
            tasks.append(self._discover_from_boosts(self.dex_client.get_top_boosted_tokens))
        if disc.use_latest_profiles:
            tasks.append(self._discover_from_profiles())
        for term in disc.search_terms:
            tasks.append(self.dex_client.search_pairs(term))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, BaseException):
                logger.warning("Discovery source failed: %s", r)
                continue
            add_pairs(r)

        for entry in disc.watchlist:
            if ":" not in entry:
                continue
            chain_id, pair_address = entry.split(":", 1)
            pair = await self.dex_client.get_pair(chain_id, pair_address)
            if pair is not None:
                add_pairs([pair])

        return list(seen.values())[: self.cfg.scanner.max_candidates_per_cycle]

    def _passes_prefilter(self, pair: DexPair) -> bool:
        sc = self.cfg.scanner
        liq = pair.liquidity.usd or 0.0
        vol24 = pair.volume.h24 or 0.0
        age = pair.age_minutes
        txns24 = pair.txns.h24

        if liq < sc.min_liquidity_usd:
            return False
        if vol24 < sc.min_volume_24h_usd:
            return False
        if age is not None and age < sc.min_pair_age_minutes:
            return False
        if (txns24.buys + txns24.sells) < sc.min_txns_24h:
            return False
        return True

    # -- per-candidate analysis ----------------------------------------------

    async def _analyze_pair(self, pair: DexPair) -> Candidate:
        async with self._sem:
            df = await self.candle_provider.get_candles(
                pair.chainId, pair.pairAddress, self.cfg.data.candles.fallback_interval_seconds
            )

            price = pair.price_usd
            if price is not None:
                self.candle_provider.record_tick(
                    pair.chainId, pair.pairAddress, int(time.time()), price, pair.volume.h24, pair.liquidity.usd
                )

            indicators = compute_indicator_snapshot(df, self.indicator_params)
            if indicators.num_candles == 0 and price:
                indicators.price = price

            is_solana = pair.chainId == "solana" and bool(pair.baseToken.address)

            # mint_info is also the source of `decimals` for the sellability
            # probe below, so fetch it whenever either consumer needs it --
            # avoids a second RPC round-trip just to look up decimals.
            mint_info = None
            needs_mint_info = (
                self.safety_cfg.require_solana_mint_authority_renounced
                or self.safety_cfg.require_solana_freeze_authority_renounced
                or self.safety_cfg.require_sellable
            )
            if is_solana and needs_mint_info:
                mint_info = await self.solana_client.get_mint_info(pair.baseToken.address)

            holder_concentration = None
            if is_solana and self.safety_cfg.require_holder_concentration_check:
                holder_concentration = await self.solana_client.get_holder_concentration(pair.baseToken.address)

            sell_check = None
            if is_solana and self.safety_cfg.require_sellable and mint_info is not None and mint_info.decimals is not None:
                sell_check = await self.honeypot_client.check_sellable(pair.baseToken.address, mint_info.decimals)

            # Chain-agnostic and network-free (a pure read over ticks this
            # bot already recorded), so always computed regardless of chain
            # or which Solana-specific checks are enabled.
            liquidity_trend = compute_liquidity_trend(self.db, pair.chainId, pair.pairAddress)

            safety = evaluate_safety(
                pair,
                self.safety_cfg,
                mint_info,
                liquidity_trend=liquidity_trend,
                holder_concentration=holder_concentration,
                sell_check=sell_check,
            )
            score = compute_score(pair, indicators, safety, self.scoring_weights, holder_concentration)

            signals = []
            if safety.passed and score.total >= self.cfg.scoring.min_score_to_trade:
                ctx = StrategyContext(
                    pair=pair, candles=df, indicators=indicators, params=self.cfg.strategy.params_dict()
                )
                signals = run_strategies(ctx, self.cfg.strategy.active)

            return Candidate(pair=pair, candles=df, indicators=indicators, safety=safety, score=score, signals=signals)

    async def scan_once(self) -> list[Candidate]:
        raw_pairs = await self.discover_candidates()
        prefiltered = [p for p in raw_pairs if self._passes_prefilter(p)]
        logger.info("Discovered %d candidates, %d passed pre-filters", len(raw_pairs), len(prefiltered))

        candidates = list(await asyncio.gather(*(self._analyze_pair(p) for p in prefiltered)))
        candidates.sort(key=lambda c: c.score.total if c.score else -1.0, reverse=True)

        now = int(time.time())
        for c in candidates:
            self.db.insert_scan_result(
                ts=now,
                chain_id=c.pair.chainId,
                pair_address=c.pair.pairAddress,
                symbol=c.pair.symbol,
                score=c.score.total if c.score else None,
                passed_safety=c.safety.passed,
                signals=[s.strategy_name for s in c.signals],
                details={"notes": c.score.notes if c.score else [], "reasons": c.safety.reasons},
            )
        return candidates

    # -- position management + execution (used by `run`, not `scan`) --------

    async def _fetch_prices(self, keys: set[tuple[str, str]]) -> dict[tuple[str, str], float]:
        out: dict[tuple[str, str], float] = {}
        for chain_id, pair_address in keys:
            pair = await self.dex_client.get_pair(chain_id, pair_address)
            if pair is not None and pair.price_usd is not None:
                out[(chain_id, pair_address)] = pair.price_usd
                # An open position's pair may have fallen out of the
                # discovery/pre-filter set that drives `_analyze_pair` (e.g.
                # its liquidity just cratered, which is exactly the case the
                # emergency exit needs to catch) -- record a tick here too so
                # compute_liquidity_trend always has fresh data for it.
                self.candle_provider.record_tick(
                    chain_id, pair_address, int(time.time()), pair.price_usd, pair.volume.h24, pair.liquidity.usd
                )
        return out

    async def manage_open_positions(self) -> None:
        if self.execution is None:
            return
        positions = self.execution.get_open_positions()
        if not positions:
            return

        prices = await self._fetch_prices({(p.chain_id, p.pair_address) for p in positions})
        for position in positions:
            price = prices.get((position.chain_id, position.pair_address))
            if not price or price <= 0:
                continue
            liquidity_trend = compute_liquidity_trend(self.db, position.chain_id, position.pair_address)
            for action in evaluate_exits(position, price, self.risk_cfg, liquidity_trend=liquidity_trend):
                trade = await self.execution.sell(position, action.fraction, price, action.reason)
                if trade is not None and self.cfg.notifications.notify_on_trade:
                    await notify(
                        f"SELL {position.symbol}: {action.reason} | qty {trade.quantity:.4g} @ "
                        f"${trade.price:.8g} | realized PnL ${trade.realized_pnl_usd or 0:.2f}",
                        self.cfg.notifications,
                    )

    async def enter_new_positions(self, candidates: list[Candidate]) -> None:
        if self.execution is None:
            return

        daily_pnl = self.execution.get_daily_realized_pnl_usd(_start_of_day_ts())
        halted, reason = check_circuit_breaker(daily_pnl, self.risk_cfg.starting_bankroll_usd, self.risk_cfg)
        if halted:
            logger.warning("Circuit breaker active: %s -- skipping new entries this cycle", reason)
            if self.cfg.notifications.notify_on_circuit_breaker:
                await notify(f"Circuit breaker active: {reason}", self.cfg.notifications)
            return

        open_positions = self.execution.get_open_positions()
        open_pair_keys = {(p.chain_id, p.pair_address) for p in open_positions}

        for candidate in candidates:
            if not can_open_new_position(len(open_positions), self.risk_cfg):
                break
            buy_signals = [s for s in candidate.signals if s.action == SignalAction.BUY]
            if not buy_signals:
                continue
            key = (candidate.pair.chainId, candidate.pair.pairAddress)
            if key in open_pair_keys:
                continue

            price = candidate.indicators.price or candidate.pair.price_usd
            if not price:
                continue

            sizing = size_position(self.execution.get_bankroll_usd(), price, self.risk_cfg)
            if sizing.notional_usd <= 0:
                continue

            best_signal = max(buy_signals, key=lambda s: s.confidence)
            position = await self.execution.buy(
                candidate.pair.chainId,
                candidate.pair.pairAddress,
                candidate.pair.baseToken.address,
                candidate.pair.symbol,
                sizing.notional_usd,
                price,
                best_signal.strategy_name,
                self.risk_cfg,
            )
            if position is not None:
                open_positions.append(position)
                open_pair_keys.add(key)
                if self.cfg.notifications.notify_on_trade:
                    score_txt = f"{candidate.score.total:.0f}" if candidate.score else "n/a"
                    await notify(
                        f"BUY {position.symbol} ({candidate.pair.chainId}): {best_signal.reason} | "
                        f"${sizing.notional_usd:.2f} @ ${price:.8g} | score {score_txt}",
                        self.cfg.notifications,
                    )

    async def run_forever(self, on_cycle_complete: Callable[[list[Candidate]], None] | None = None) -> None:
        """`on_cycle_complete`, if given, is called with each cycle's
        ranked candidate list right after scanning -- this is how the CLI
        prints a live table each cycle without this module (which stays
        presentation-agnostic, logging only) needing to know anything
        about rich/console output."""
        interval = self.cfg.scanner.scan_interval_seconds
        retention = (
            self.cfg.data.candles.max_local_candles * self.cfg.data.candles.fallback_interval_seconds * 3
        )
        while True:
            cycle_start = time.monotonic()
            try:
                await self.manage_open_positions()
                candidates = await self.scan_once()

                if on_cycle_complete is not None:
                    on_cycle_complete(candidates)

                actionable = [c for c in candidates if c.signals]
                if actionable and self.cfg.notifications.notify_on_signal:
                    top = actionable[0]
                    score_txt = f"{top.score.total:.0f}" if top.score else "n/a"
                    await notify(
                        f"Signal: {top.pair.symbol} ({top.pair.chainId}) score {score_txt} - "
                        + ", ".join(s.strategy_name for s in top.signals),
                        self.cfg.notifications,
                    )

                await self.enter_new_positions(candidates)
                self.candle_provider.prune(retention_seconds=retention)
            except Exception:  # noqa: BLE001 - a bad cycle must not kill a long-running bot
                logger.exception("Scan cycle failed; will retry next cycle")

            elapsed = time.monotonic() - cycle_start
            await asyncio.sleep(max(interval - elapsed, 1.0))
