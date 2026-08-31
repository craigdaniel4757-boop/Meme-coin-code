export interface WatchlistEntry {
  query: string;
  color: string;
  // false = fetched and tracked like any other coin, but never traded and
  // never shown in the market grid -- used for SOL as a market-regime
  // reference only. Defaults to true (tradeable) when omitted.
  tradeable?: boolean;
}

// Search seeds for well-known, established, liquid Solana meme coins.
// Each poll resolves a query to the highest-liquidity *live* Solana pair
// DexScreener currently returns for it (see lib/dexscreener.ts) -- real
// tickers, real prices, no hardcoded token addresses to go stale.
export const WATCHLIST: WatchlistEntry[] = [
  { query: 'BONK', color: '#f2994a' },
  { query: 'WIF', color: '#2f80ed' },
  { query: 'POPCAT', color: '#eb5757' },
  { query: 'PNUT', color: '#bb6bd9' },
  { query: 'MEW', color: '#56ccf2' },
  { query: 'BOME', color: '#f2c94c' },
  { query: 'SAMO', color: '#6fcf97' },
  { query: 'MYRO', color: '#e0e0e0' },
  { query: 'GIGA', color: '#27ae60' },
  { query: 'PENGU', color: '#9b51e0' },
  // Reference asset only, for the solRegime feature -- never traded.
  { query: 'SOL', color: '#9945ff', tradeable: false },
];

export const TRADEABLE_WATCHLIST = WATCHLIST.filter((w) => w.tradeable !== false);
