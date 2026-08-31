// Minimal client for DexScreener's public API
// (https://docs.dexscreener.com/api/reference), called directly from the
// browser -- no backend, no API key. Every field is optional and every
// failure is caught per-symbol so one bad/missing token never breaks the
// rest of the watchlist -- same "degrade gracefully" philosophy as the
// Python client in bot/data/dexscreener.py.

export interface RawTxnWindow {
  buys?: number;
  sells?: number;
}

export interface RawPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  txns?: { m5?: RawTxnWindow; h1?: RawTxnWindow; h6?: RawTxnWindow; h24?: RawTxnWindow };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
}

interface SearchResponse {
  pairs?: RawPair[] | null;
}

const API_BASE = 'https://api.dexscreener.com';
const FETCH_TIMEOUT_MS = 8000;

// Ignore any resolved pair below this liquidity so a thin/decoy pool never
// gets tracked as if it were the real, established coin we searched for.
const MIN_LIQUIDITY_USD = 20_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

export class DexScreenerError extends Error {}

// Resolves a search term (e.g. "BONK") to the highest-liquidity live
// Solana pair DexScreener currently returns for it. No hardcoded token
// addresses -- whatever real pair is most liquid right now wins.
export async function searchSolanaPair(query: string): Promise<RawPair | null> {
  const url = `${API_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new DexScreenerError(`DexScreener search failed (${res.status})`);
  const data = (await res.json()) as SearchResponse;
  const pairs = (data.pairs ?? []).filter(
    (p) => p.chainId === 'solana' && (p.liquidity?.usd ?? 0) >= MIN_LIQUIDITY_USD && !!p.priceUsd,
  );
  if (pairs.length === 0) return null;
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return pairs[0];
}

export interface WatchlistResult {
  query: string;
  pair: RawPair | null;
}

export async function fetchWatchlist(queries: string[]): Promise<WatchlistResult[]> {
  return Promise.all(
    queries.map(async (query) => {
      try {
        const pair = await searchSolanaPair(query);
        return { query, pair };
      } catch {
        return { query, pair: null };
      }
    }),
  );
}
