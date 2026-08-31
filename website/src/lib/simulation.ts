import { Coin, CoinId, FeedEvent, Position, SimState } from '../types';
import { computeFeatures } from './indicators';
import { createAgent, decide, learn, nextEpsilon, nextLearningRate } from './agent';
import { explainEntry, explainExit, explainMaxHold, explainStop } from './reasoning';

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

const EQUITY_CAP = 600;
const EVENT_LOG_CAP = 150;

let eventCounter = 0;
function nextEventId(): string {
  eventCounter += 1;
  return `e${eventCounter}`;
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

    const exitFeatures = computeFeatures(coin, pnlPct);
    const updates = agent.updates + 1;
    agent = {
      entry: learn(agent.entry, pos.entryFeatures, pnlPct, agent.learningRate),
      exit: learn(agent.exit, exitFeatures, pnlPct, agent.learningRate),
      updates,
      epsilon: nextEpsilon(updates),
      learningRate: nextLearningRate(updates),
    };

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

    const features = computeFeatures(coin, unrealizedPct);
    const d = decide(agent.exit, features, agent.epsilon);
    const shouldExit = d.explore ? Math.random() < 0.12 : d.probability > EXIT_THRESHOLD;
    if (shouldExit) {
      closeTrade(coin, pos, explainExit(d.dominant, coin.ticker, unrealizedPct), d.confidence);
    }
  }

  // 2. Look for new entries among coins the bot isn't currently holding.
  const openCount = Object.keys(positions).length;
  const slots = MAX_POSITIONS - openCount;
  if (slots > 0 && cash > 15) {
    const candidates = coins
      .filter((coin) => !positions[coin.id] && !coin.stale)
      .map((coin) => ({ coin, d: decide(agent.entry, computeFeatures(coin, 0), agent.epsilon) }))
      .filter(({ d }) => (d.explore ? Math.random() < 0.3 : d.probability > ENTRY_THRESHOLD))
      .sort((a, b) => b.d.probability - a.d.probability)
      .slice(0, slots);

    // Position size scales with signal confidence, the model's overall
    // experience, and this pair's liquidity depth -- small, cautious bets
    // on illiquid or unproven setups, sizing up toward the full 22%-of-
    // equity risk budget for liquid pairs once the model has a track record.
    const experienceFactor = Math.min(1, 0.4 + agent.updates / 50);

    for (const { coin, d } of candidates) {
      const equity = computeEquity(coins, cash, positions);
      const confidenceFactor = 0.6 + 0.4 * d.confidence;
      const liquidityFactor = Math.max(0.3, Math.min(1, coin.liquidityUsd / FULL_SIZE_LIQUIDITY_USD));
      const targetSize = Math.min(cash * 0.9, equity * 0.22 * experienceFactor * confidenceFactor * liquidityFactor);
      if (targetSize < 10) continue;

      const feeRate = estimatedFeeRate(targetSize, coin.liquidityUsd);
      const fee = targetSize * feeRate;
      const quantity = (targetSize - fee) / coin.price;
      if (!isFinite(quantity) || quantity <= 0) continue;

      cash -= targetSize;
      totalFeesPaid += fee;
      const entryFeatures = computeFeatures(coin, 0);
      positions[coin.id] = {
        coinId: coin.id,
        entryPrice: coin.price,
        quantity,
        entryTick: tick,
        entryTime: Date.now(),
        entryFeatures,
        entryConfidence: d.confidence,
        costBasis: targetSize,
      };

      pushEvent(events, {
        id: nextEventId(),
        kind: 'open',
        coinId: coin.id,
        ticker: coin.ticker,
        time: Date.now(),
        reasoning: explainEntry(d.dominant, coin.ticker, d.confidence),
        confidence: d.confidence,
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
