import { Coin, CoinId, FeatureContext, FeedEvent, Position, SimState } from '../types';
import { computeFeatures } from './indicators';
import { createAgent, decide, learnFromTrade } from './agent';
import { explainEntry, explainExit, explainMaxHold, explainStop } from './reasoning';
import { TRADEABLE_WATCHLIST } from './coins';

export const STARTING_CASH = 1000;
export const MAX_POSITIONS = 4;
export const BASE_FEE_RATE = 0.005;
export const SLIPPAGE_COEFF = 2;
export const MAX_FEE_RATE = 0.06;
export const STOP_LOSS_PCT = -0.28;
export const MAX_HOLD_TICKS = 180; // ~1 hour at the 20s poll cadence
export const ENTRY_THRESHOLD = 0.62;
export const EXIT_THRESHOLD = 0.58;
export const FULL_SIZE_LIQUIDITY_USD = 150_000;
// Fraction of new entries held out from learning, so their outcomes are an
// unbiased read on the ensemble's *current* skill rather than a number
// the ensemble was fit to. See lib/stats.ts for how this is reported.
export const EVAL_FRACTION = 0.15;
export const PERFORMANCE_WINDOW = 20;
export const MIN_HELD_OUT_FOR_SIGNAL = 5;

const EQUITY_CAP = 600;
export const EVENT_LOG_CAP = 500;

const TRADEABLE_IDS = new Set(TRADEABLE_WATCHLIST.map((w) => w.query));

let eventCounter = 0;
function nextEventId(): string {
  eventCounter += 1;
  return `e${eventCounter}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeEquity(coins: Coin[], cash: number, positions: Record<CoinId, Position>): number {
  const byId = new Map(coins.map((c) => [c.id, c]));
  let total = cash;
  for (const coinId of Object.keys(positions)) {
    const pos = positions[coinId];
    const coin = byId.get(coinId);
    if (coin) total += pos.quantity * coin.price;
  }
  return total;
}

// SOL's own momentum (market-wide regime) and the tradeable watchlist's
// average 1h move (so a coin's strength can be judged relative to the
// rest of the market, not just in isolation) -- computed once per tick.
export function computeContext(coins: Coin[]): FeatureContext {
  const sol = coins.find((c) => c.id === 'SOL');
  const solChg1h = sol ? clamp(sol.priceChange.h1 / 100, -1, 1) : 0;

  const tradeable = coins.filter((c) => TRADEABLE_IDS.has(c.id) && !c.stale);
  const avgChg1h =
    tradeable.length > 0
      ? tradeable.reduce((s, c) => s + clamp(c.priceChange.h1 / 100, -1, 1), 0) / tradeable.length
      : 0;

  return { solChg1h, avgChg1h };
}

export function createInitialState(): SimState {
  return {
    tick: 0,
    coins: [],
    cash: STARTING_CASH,
    positions: {},
    events: [],
    equityCurve: [{ t: 0, equity: STARTING_CASH }],
    agent: createAgent(),
    totalFeesPaid: 0,
  };
}

function pushEvent(events: FeedEvent[], event: FeedEvent): void {
  events.unshift(event);
  if (events.length > EVENT_LOG_CAP) events.length = EVENT_LOG_CAP;
}

// Scales position size by whether the *unbiased* held-out trades have
// actually been making money lately -- not confidence, not experience,
// the real thing: recent realized P&L on trades the model never got to
// learn from. Neutral (1x) until there's enough held-out history to say
// anything; before that this factor shouldn't make new users' sizing any
// more cautious than it already was. Once there's signal, a positive
// recent edge sizes up (modestly, capped well short of doubling), a
// negative one shrinks toward the floor -- so realized results improve
// over time by trading less during demonstrably bad stretches, even on
// sessions where the underlying prediction accuracy never gets better.
export function performanceFactor(events: FeedEvent[]): number {
  const recentHeldOut = events.filter((e) => e.kind === 'close' && e.isEval).slice(0, PERFORMANCE_WINDOW);
  if (recentHeldOut.length < MIN_HELD_OUT_FOR_SIGNAL) return 1;
  const avgPnlPct = recentHeldOut.reduce((s, e) => s + (e.pnlPct ?? 0), 0) / recentHeldOut.length;
  return clamp(0.65 + avgPnlPct * 4, 0.3, 1.2);
}

// Approximates real DEX swap cost: a flat base fee plus a slippage
// estimate that grows with how large the trade is relative to the pool's
// liquidity -- trading a thin pool costs meaningfully more than trading a
// deep one, same as it would through a real Jupiter-routed swap.
function estimatedFeeRate(tradeUsd: number, liquidityUsd: number): number {
  const slippage = liquidityUsd > 0 ? (tradeUsd / liquidityUsd) * SLIPPAGE_COEFF : MAX_FEE_RATE;
  return Math.min(MAX_FEE_RATE, BASE_FEE_RATE + Math.max(0, slippage));
}

// Runs one decision step against an already-updated coin list (the caller
// is responsible for fetching fresh DexScreener data and folding it into
// `coins` via lib/marketData.ts -- this function only manages risk,
// entries/exits, and learning).
export function stepDecisions(prev: SimState, coins: Coin[]): SimState {
  const tick = prev.tick + 1;
  const positions: Record<CoinId, Position> = { ...prev.positions };
  const events = prev.events.slice();
  let cash = prev.cash;
  let agent = prev.agent;
  let totalFeesPaid = prev.totalFeesPaid;

  const coinById = new Map(coins.map((c) => [c.id, c]));
  const context = computeContext(coins);
  const perf = performanceFactor(prev.events);

  function closeTrade(coin: Coin, pos: Position, reasoning: string, confidence: number): void {
    const grossProceeds = pos.quantity * coin.price;
    const feeRate = estimatedFeeRate(grossProceeds, coin.liquidityUsd);
    const fee = grossProceeds * feeRate;
    const netProceeds = grossProceeds - fee;
    cash += netProceeds;
    totalFeesPaid += fee;

    const pnlUsd = netProceeds - pos.costBasis;
    const pnlPct = pnlUsd / pos.costBasis;
    delete positions[coin.id];

    if (!pos.isEval) {
      const exitFeatures = computeFeatures(coin, pnlPct, context);
      agent = learnFromTrade(agent, pos.entryFeatures, exitFeatures, pnlPct);
    }

    pushEvent(events, {
      id: nextEventId(),
      kind: 'close',
      coinId: coin.id,
      ticker: coin.ticker,
      time: Date.now(),
      reasoning,
      confidence,
      pnlUsd,
      pnlPct,
      win: pnlPct >= 0,
      isEval: pos.isEval,
    });
  }

  // 1. Manage open positions: hard risk controls first, then the learned exit policy.
  for (const coinId of Object.keys(positions)) {
    const pos = positions[coinId];
    const coin = coinById.get(coinId);
    if (!coin) continue; // fell out of the watchlist entirely this cycle -- re-evaluate next poll

    const unrealizedPct = (coin.price - pos.entryPrice) / pos.entryPrice;

    if (unrealizedPct <= STOP_LOSS_PCT) {
      closeTrade(coin, pos, explainStop(coin.ticker, unrealizedPct), 1);
      continue;
    }
    if (tick - pos.entryTick >= MAX_HOLD_TICKS) {
      closeTrade(coin, pos, explainMaxHold(coin.ticker), 0.5);
      continue;
    }
    if (coin.stale) continue; // don't let the learned policy act on a stale snapshot

    const features = computeFeatures(coin, unrealizedPct, context);
    const d = decide(agent.members, 'exit', features, agent.epsilon);
    const shouldExit = d.explore ? Math.random() < 0.12 : d.probability > EXIT_THRESHOLD;
    if (shouldExit) {
      closeTrade(coin, pos, explainExit(d.dominant, coin.ticker, unrealizedPct), d.confidence);
    }
  }

  // 2. Look for new entries among tradeable coins the bot isn't currently holding.
  const openCount = Object.keys(positions).length;
  const slots = MAX_POSITIONS - openCount;
  if (slots > 0 && cash > 15) {
    const candidates = coins
      .filter((coin) => TRADEABLE_IDS.has(coin.id) && !positions[coin.id] && !coin.stale)
      .map((coin) => ({ coin, d: decide(agent.members, 'entry', computeFeatures(coin, 0, context), agent.epsilon) }))
      .filter(({ d }) => (d.explore ? Math.random() < 0.3 : d.probability > ENTRY_THRESHOLD))
      .sort((a, b) => b.d.probability - a.d.probability)
      .slice(0, slots);

    // Position size scales with signal confidence, the model's overall
    // experience, this pair's liquidity depth, and -- via `perf` -- whether
    // the unbiased held-out trades have actually been winning lately.
    // Small, cautious bets on illiquid, unproven, or currently-underperforming
    // setups; full size only once the model has both a track record and a
    // recent real edge to back it up.
    const experienceFactor = Math.min(1, 0.4 + agent.updates / 50);

    for (const { coin, d } of candidates) {
      const equity = computeEquity(coins, cash, positions);
      const confidenceFactor = 0.6 + 0.4 * d.confidence;
      const liquidityFactor = Math.max(0.3, Math.min(1, coin.liquidityUsd / FULL_SIZE_LIQUIDITY_USD));
      const targetSize = Math.min(
        cash * 0.9,
        equity * 0.22 * experienceFactor * confidenceFactor * liquidityFactor * perf,
      );
      if (targetSize < 10) continue;

      const feeRate = estimatedFeeRate(targetSize, coin.liquidityUsd);
      const fee = targetSize * feeRate;
      const quantity = (targetSize - fee) / coin.price;
      if (!isFinite(quantity) || quantity <= 0) continue;

      cash -= targetSize;
      totalFeesPaid += fee;
      const entryFeatures = computeFeatures(coin, 0, context);
      const isEval = Math.random() < EVAL_FRACTION;
      positions[coin.id] = {
        coinId: coin.id,
        entryPrice: coin.price,
        quantity,
        entryTick: tick,
        entryTime: Date.now(),
        entryFeatures,
        entryConfidence: d.confidence,
        costBasis: targetSize,
        isEval,
      };

      pushEvent(events, {
        id: nextEventId(),
        kind: 'open',
        coinId: coin.id,
        ticker: coin.ticker,
        time: Date.now(),
        reasoning: explainEntry(d.dominant, coin.ticker, d.confidence),
        confidence: d.confidence,
        isEval,
      });
    }
  }

  const equity = computeEquity(coins, cash, positions);
  const equityCurve =
    prev.equityCurve.length >= EQUITY_CAP
      ? [...prev.equityCurve.slice(1), { t: tick, equity }]
      : [...prev.equityCurve, { t: tick, equity }];

  return { tick, coins, cash, positions, events, equityCurve, agent, totalFeesPaid };
}
