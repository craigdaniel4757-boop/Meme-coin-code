import { Coin, CoinId, FeedEvent, Position, SimState } from '../types';
import { createMarket, tickMarket } from './market';
import { computeFeatures } from './indicators';
import { createAgent, decide, learn, nextEpsilon, nextLearningRate } from './agent';
import { explainEntry, explainExit, explainMaxHold, explainStop } from './reasoning';

export const STARTING_CASH = 1000;
export const MAX_POSITIONS = 4;
export const FEE_RATE = 0.006;
export const STOP_LOSS_PCT = -0.28;
export const MAX_HOLD_TICKS = 280;
export const ENTRY_THRESHOLD = 0.62;
export const EXIT_THRESHOLD = 0.58;

const EQUITY_CAP = 600;
const EVENT_LOG_CAP = 150;

let eventCounter = 0;
function nextEventId(): string {
  eventCounter += 1;
  return `e${eventCounter}`;
}

export function computeEquity(coins: Coin[], cash: number, positions: Record<CoinId, Position>): number {
  let total = cash;
  for (const coin of coins) {
    const pos = positions[coin.id];
    if (pos) total += pos.quantity * coin.price;
  }
  return total;
}

export function createInitialState(): SimState {
  return {
    tick: 0,
    coins: createMarket(),
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

export function stepSimulation(prev: SimState): SimState {
  const tick = prev.tick + 1;
  const coins = tickMarket(prev.coins);
  const positions: Record<CoinId, Position> = { ...prev.positions };
  const events = prev.events.slice();
  let cash = prev.cash;
  let agent = prev.agent;
  let totalFeesPaid = prev.totalFeesPaid;

  const coinById = new Map(coins.map((c) => [c.id, c]));

  function closeTrade(coin: Coin, pos: Position, reasoning: string, confidence: number): void {
    const grossProceeds = pos.quantity * coin.price;
    const fee = grossProceeds * FEE_RATE;
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
    if (!coin) continue;
    const unrealizedPct = (coin.price - pos.entryPrice) / pos.entryPrice;

    if (unrealizedPct <= STOP_LOSS_PCT) {
      closeTrade(coin, pos, explainStop(coin.ticker, unrealizedPct), 1);
      continue;
    }
    if (tick - pos.entryTick >= MAX_HOLD_TICKS) {
      closeTrade(coin, pos, explainMaxHold(coin.ticker), 0.5);
      continue;
    }

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
      .filter((coin) => !positions[coin.id])
      .map((coin) => ({ coin, d: decide(agent.entry, computeFeatures(coin, 0), agent.epsilon) }))
      .filter(({ d }) => (d.explore ? Math.random() < 0.3 : d.probability > ENTRY_THRESHOLD))
      .sort((a, b) => b.d.probability - a.d.probability)
      .slice(0, slots);

    // Position size scales with both this signal's confidence and the
    // model's overall experience -- small, cautious bets while it's still
    // finding its footing, sizing up toward the full 22%-of-equity risk
    // budget once it has a track record of closed trades to learn from.
    const experienceFactor = Math.min(1, 0.4 + agent.updates / 50);

    for (const { coin, d } of candidates) {
      const equity = computeEquity(coins, cash, positions);
      const confidenceFactor = 0.6 + 0.4 * d.confidence;
      const targetSize = Math.min(cash * 0.9, equity * 0.22 * experienceFactor * confidenceFactor);
      if (targetSize < 10) continue;

      const fee = targetSize * FEE_RATE;
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
