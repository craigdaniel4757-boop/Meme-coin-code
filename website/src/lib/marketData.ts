import { Coin, PriceChange } from '../types';
import { RawPair, WatchlistResult } from './dexscreener';
import { WatchlistEntry } from './coins';

const HISTORY_CAP = 200;

function toPriceChange(pair: RawPair): PriceChange {
  return {
    m5: pair.priceChange?.m5 ?? 0,
    h1: pair.priceChange?.h1 ?? 0,
    h6: pair.priceChange?.h6 ?? 0,
    h24: pair.priceChange?.h24 ?? 0,
  };
}

function pushCapped(arr: number[], value: number): number[] {
  if (arr.length >= HISTORY_CAP) return [...arr.slice(1), value];
  return [...arr, value];
}

function coinFromPair(entry: WatchlistEntry, pair: RawPair, now: number): Coin {
  const price = Number(pair.priceUsd ?? 0) || 0;
  return {
    id: entry.query,
    address: pair.baseToken?.address ?? '',
    name: pair.baseToken?.name || entry.query,
    ticker: pair.baseToken?.symbol || entry.query,
    color: entry.color,
    dexId: pair.dexId ?? '',
    pairUrl: pair.url ?? null,
    price,
    prevPrice: price,
    history: [price],
    liquidityUsd: pair.liquidity?.usd ?? 0,
    fdv: pair.fdv ?? pair.marketCap ?? null,
    priceChange: toPriceChange(pair),
    buys1h: pair.txns?.h1?.buys ?? 0,
    sells1h: pair.txns?.h1?.sells ?? 0,
    volumeH1: pair.volume?.h1 ?? 0,
    volumeH24: pair.volume?.h24 ?? 0,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    lastUpdated: now,
    stale: false,
  };
}

// Folds one poll's worth of fresh DexScreener results into the previous
// coin list: known coins get a new price sample appended to their local
// history (used for RSI/SMA/volatility), newly-resolved coins are created
// fresh, and a coin whose query failed to resolve this cycle keeps
// showing its last known data, flagged `stale`, rather than disappearing.
export function mergeMarketUpdate(
  prevCoins: Coin[],
  entries: WatchlistEntry[],
  results: WatchlistResult[],
  now: number,
): Coin[] {
  const byQuery = new Map(results.map((r) => [r.query, r]));
  const byId = new Map(prevCoins.map((c) => [c.id, c]));

  const merged: Coin[] = [];
  for (const entry of entries) {
    const prev = byId.get(entry.query);
    const pair = byQuery.get(entry.query)?.pair;

    if (pair) {
      const price = Number(pair.priceUsd ?? 0) || prev?.price || 0;
      if (!prev) {
        merged.push(coinFromPair(entry, pair, now));
        continue;
      }
      merged.push({
        ...prev,
        prevPrice: prev.price,
        price,
        history: pushCapped(prev.history, price),
        address: pair.baseToken?.address || prev.address,
        name: pair.baseToken?.name || prev.name,
        ticker: pair.baseToken?.symbol || prev.ticker,
        dexId: pair.dexId ?? prev.dexId,
        pairUrl: pair.url ?? prev.pairUrl,
        liquidityUsd: pair.liquidity?.usd ?? prev.liquidityUsd,
        fdv: pair.fdv ?? pair.marketCap ?? prev.fdv,
        priceChange: toPriceChange(pair),
        buys1h: pair.txns?.h1?.buys ?? 0,
        sells1h: pair.txns?.h1?.sells ?? 0,
        volumeH1: pair.volume?.h1 ?? 0,
        volumeH24: pair.volume?.h24 ?? 0,
        pairCreatedAt: pair.pairCreatedAt ?? prev.pairCreatedAt,
        lastUpdated: now,
        stale: false,
      });
    } else if (prev) {
      merged.push({ ...prev, stale: true });
    }
  }
  return merged;
}
