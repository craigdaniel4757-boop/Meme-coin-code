// Offline, dev-time only -- NOT part of the live site build or runtime.
//
// Fetches real historical Solana meme coin price candles (GeckoTerminal's
// free public OHLCV API, the same source bot/data/geckoterminal.py uses)
// for the same watchlist the live site trades, replays them through the
// exact same feature/agent/simulation code the live site uses (this is
// the whole point of writing it in TS: no separate backtesting engine to
// keep in sync), and writes the resulting trained ensemble to
// src/data/pretrainedBrain.json -- which the live app loads as its
// default starting brain instead of the hand-picked prior + noise.
//
// Run with: npm run pretrain
// Needs outbound network access to api.dexscreener.com and
// api.geckoterminal.com. Safe to re-run any time to refresh the seed
// weights against more recent history -- each run starts from a fresh
// ensemble and replays independently; it is not incremental.
//
// Known simplifications, all a direct consequence of what OHLCV candles
// alone can and can't tell you (documented rather than hidden):
// - No historical buy/sell transaction counts are available from OHLCV,
//   so `buyPressure` is neutral (0) throughout replay; live trading is
//   what actually teaches that weight.
// - Liquidity/FDV are held at their current snapshot value for the whole
//   replay window rather than their true historical value at each point.
// - `chg5m` is approximated by the most recent single candle's return
//   (a 15-minute return standing in for a 5-minute one) since GeckoTerminal
//   candles at finer granularity don't cover enough history in one request.
// - One replay "tick" is one historical candle (~15 minutes of market
//   time), not the live 20-second poll cadence, so MAX_HOLD_TICKS-style
//   constants play out over a longer wall-clock span during replay than
//   they do live. The relationships being learned (momentum, RSI,
//   liquidity-aware sizing, etc.) transfer regardless; live online
//   learning keeps refining from there.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { AgentWeights, Coin } from '../src/types';
import { TRADEABLE_WATCHLIST, WatchlistEntry } from '../src/lib/coins';
import { searchSolanaPair } from '../src/lib/dexscreener';
import { createInitialState, stepDecisions, computeEquity } from '../src/lib/simulation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '../src/data/pretrainedBrain.json');

const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const CANDLE_TIMEFRAME = 'minute';
const CANDLE_AGGREGATE = 15;
const CANDLE_LIMIT = 1000;
const GECKOTERMINAL_MIN_GAP_MS = 2_200; // ~27/min, under the free tier's ~28/min limit
const HISTORY_CAP = 200;

export interface RawCandle {
  timestampMs: number;
  close: number;
  volume: number;
}

export interface ResolvedCoin {
  entry: WatchlistEntry;
  liquidityUsd: number;
  fdv: number | null;
  pairCreatedAt: number | null;
  candles: RawCandle[];
}

let lastGeckoCall = 0;
async function throttledFetch(url: string): Promise<Response> {
  const wait = GECKOTERMINAL_MIN_GAP_MS - (Date.now() - lastGeckoCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeckoCall = Date.now();
  return fetch(url, { headers: { Accept: 'application/json;version=20230302' } });
}

async function fetchCandles(poolAddress: string): Promise<RawCandle[]> {
  const url = `${GECKOTERMINAL_BASE}/networks/solana/pools/${poolAddress}/ohlcv/${CANDLE_TIMEFRAME}?aggregate=${CANDLE_AGGREGATE}&limit=${CANDLE_LIMIT}&currency=usd`;
  const res = await throttledFetch(url);
  if (!res.ok) {
    console.warn(`  GeckoTerminal OHLCV failed (HTTP ${res.status})`);
    return [];
  }
  const payload = await res.json();
  const rows: unknown[] = payload?.data?.attributes?.ohlcv_list ?? [];
  const candles: RawCandle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [ts, , , , close, volume] = row as number[];
    if (typeof ts === 'number' && typeof close === 'number') {
      candles.push({ timestampMs: ts * 1000, close, volume: typeof volume === 'number' ? volume : 0 });
    }
  }
  candles.sort((a, b) => a.timestampMs - b.timestampMs);
  return candles;
}

async function resolveCoin(entry: WatchlistEntry): Promise<ResolvedCoin | null> {
  console.log(`Resolving ${entry.query}...`);
  const pair = await searchSolanaPair(entry.query);
  if (!pair?.pairAddress) {
    console.warn(`  Could not resolve a live Solana pair for ${entry.query}, skipping.`);
    return null;
  }
  const candles = await fetchCandles(pair.pairAddress);
  if (candles.length < 30) {
    console.warn(`  Only ${candles.length} candles, skipping (too little history to be useful).`);
    return null;
  }
  console.log(`  ${candles.length} candles, liquidity $${Math.round(pair.liquidity?.usd ?? 0).toLocaleString()}`);
  return {
    entry,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    fdv: pair.fdv ?? pair.marketCap ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    candles,
  };
}

export function buildCoinSnapshots(resolved: ResolvedCoin[]): Map<string, Coin[]> {
  const snapshotsByCoin = new Map<string, Coin[]>();
  for (const r of resolved) {
    const snapshots: Coin[] = [];
    const history: number[] = [];
    for (let i = 0; i < r.candles.length; i++) {
      const c = r.candles[i];
      history.push(c.close);
      if (history.length > HISTORY_CAP) history.shift();

      const returnOver = (lag: number): number => {
        const j = history.length - 1 - lag;
        if (j < 0 || history[j] <= 0) return 0;
        return (c.close - history[j]) / history[j];
      };
      const trailingAvgVolume = (n: number): number => {
        const start = Math.max(0, i - n + 1);
        const slice = r.candles.slice(start, i + 1);
        return slice.reduce((s, x) => s + x.volume, 0) / slice.length;
      };

      snapshots.push({
        id: r.entry.query,
        address: '',
        name: r.entry.query,
        ticker: r.entry.query,
        color: r.entry.color,
        dexId: '',
        pairUrl: null,
        price: c.close,
        prevPrice: history.length > 1 ? history[history.length - 2] : c.close,
        history: [...history],
        liquidityUsd: r.liquidityUsd,
        fdv: r.fdv,
        priceChange: {
          m5: returnOver(1) * 100,
          h1: returnOver(4) * 100,
          h6: returnOver(24) * 100,
          h24: returnOver(96) * 100,
        },
        buys1h: 0,
        sells1h: 0,
        volumeH1: c.volume * 4,
        volumeH24: trailingAvgVolume(96) * 96,
        pairCreatedAt: r.pairCreatedAt,
        lastUpdated: c.timestampMs,
        stale: false,
      });
    }
    snapshotsByCoin.set(r.entry.query, snapshots);
  }
  return snapshotsByCoin;
}

export function buildReplayTimeline(resolved: ResolvedCoin[], snapshotsByCoin: Map<string, Coin[]>): Coin[][] {
  const allTimestamps = new Set<number>();
  for (const r of resolved) for (const c of r.candles) allTimestamps.add(c.timestampMs);
  const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

  const cursors = new Map(resolved.map((r) => [r.entry.query, 0]));
  const latestSnapshot = new Map<string, Coin>();

  const timeline: Coin[][] = [];
  for (const ts of sortedTimestamps) {
    for (const r of resolved) {
      const snaps = snapshotsByCoin.get(r.entry.query);
      if (!snaps) continue;
      let cursor = cursors.get(r.entry.query) ?? 0;
      while (cursor < r.candles.length && r.candles[cursor].timestampMs <= ts) {
        latestSnapshot.set(r.entry.query, snaps[cursor]);
        cursor++;
      }
      cursors.set(r.entry.query, cursor);
    }
    const coinsNow = [...latestSnapshot.values()];
    if (coinsNow.length > 0) timeline.push(coinsNow);
  }
  return timeline;
}

async function main(): Promise<void> {
  const allEntries: WatchlistEntry[] = [...TRADEABLE_WATCHLIST, { query: 'SOL', color: '#9945ff', tradeable: false }];
  console.log(`Resolving ${allEntries.length} coins (watchlist + SOL reference) and fetching ${CANDLE_AGGREGATE}-minute candle history...\n`);

  const resolved: ResolvedCoin[] = [];
  for (const entry of allEntries) {
    const r = await resolveCoin(entry);
    if (r) resolved.push(r);
  }

  if (resolved.length < 3) {
    console.error('\nToo few coins resolved to produce a meaningful pretrained brain. Aborting without writing output.');
    process.exit(1);
  }

  const snapshotsByCoin = buildCoinSnapshots(resolved);
  const timeline = buildReplayTimeline(resolved, snapshotsByCoin);
  console.log(`\nReplaying ${timeline.length} historical ticks across ${resolved.length} resolved coins...`);

  let state = createInitialState();
  for (const coins of timeline) {
    state = stepDecisions(state, coins);
  }

  const finalEquity = computeEquity(state.coins, state.cash, state.positions);
  const closedTrades = state.events.filter((e) => e.kind === 'close');
  const wins = closedTrades.filter((e) => e.win).length;
  const winRate = closedTrades.length ? wins / closedTrades.length : 0;

  console.log(
    `\nReplay complete: ${closedTrades.length} closed trades, ${wins} wins (${(winRate * 100).toFixed(1)}%), ` +
      `final paper equity $${finalEquity.toFixed(2)} from a $1,000 start.`,
  );
  console.log(`Ensemble now carries ${state.agent.updates} learning updates from real historical replay.`);

  const output = {
    pretrained: true,
    note:
      'Ensemble weights trained by replaying real historical Solana meme coin candles via scripts/pretrain.ts. ' +
      'Re-run `npm run pretrain` to refresh against more recent history.',
    generatedAt: new Date().toISOString(),
    meta: {
      coinsUsed: resolved.map((r) => r.entry.query),
      ticksReplayed: timeline.length,
      closedTrades: closedTrades.length,
      winRate,
      finalEquity,
    },
    agent: state.agent satisfies AgentWeights,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

// Only run when this file is executed directly (`npm run pretrain`), not
// when its helpers (buildCoinSnapshots, buildReplayTimeline, ...) are
// imported elsewhere -- e.g. for testing the replay logic against
// synthetic candles without triggering a live network scrape.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Pretraining failed:', err);
    process.exit(1);
  });
}
