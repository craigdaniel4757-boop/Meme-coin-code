# MemeMind AI

A standalone, single-page web app: an AI agent that paper-trades a basket of
**real, live Solana meme coins** — real tickers, real prices, real liquidity,
pulled directly from DexScreener's public API — starting from a simulated
**$1,000** balance, with one objective: grow that balance as much as
possible. It is completely separate from the `memebot` Python trading bot
elsewhere in this repository — different stack, no shared code or data.

**Real market data, 100% paper trading, entirely in your browser.** There is
no backend, no connected wallet, and no on-chain transaction anywhere in this
app — every buy and sell is simulated bookkeeping against a $1,000 balance
that lives only in `localStorage`. Nothing here is investment advice. See the
disclaimer in the page footer.

## What's actually running

- **A live Solana meme coin market** (`src/lib/dexscreener.ts`,
  `src/lib/marketData.ts`) — every ~20 seconds, the browser queries
  DexScreener's public search API directly for a watchlist of well-known
  meme coin tickers (`src/lib/coins.ts`), keeps only `chainId: "solana"`
  results above a liquidity floor, and picks the highest-liquidity pair per
  symbol. No hardcoded token addresses, no backend proxy — whatever DexScreener
  currently returns as the real top pair for that symbol is what gets traded.
  A coin that fails to resolve on a given poll keeps showing its last known
  price, flagged stale, instead of disappearing.
- **A real online-learning trading agent** (`src/lib/agent.ts`,
  `src/lib/simulation.ts`) — not a scripted demo. Two linear policies (entry
  and exit) score each coin from real, exchange-reported features (5-minute
  / 1-hour / 6-hour price change, buy/sell transaction pressure, liquidity)
  plus locally-observed volatility/RSI/distance-from-average built from the
  price samples this session has actually polled. They start from a simple
  momentum/mean-reversion prior and are updated after **every closed trade**
  with a gradient-bandit-style rule: weights move toward the features that
  were present before a profitable trade and away from the features present
  before a loss. Exploration and the learning rate both decay as the model
  accumulates trades. Position size scales with the model's confidence, its
  overall experience, and the pair's liquidity depth, and the simulated swap
  fee includes a slippage estimate that grows for thinner pools — so trading
  an illiquid meme coin costs more here too, same as it would for real.
- **Hard risk controls independent of the learned policy** — a per-trade
  stop-loss, a max concurrent position cap, and a max hold time — so a bad
  stretch of learning can't wipe the account in one trade.
- **A live dashboard** — equity curve, per-coin sparklines linking out to
  each pair's real DexScreener page, a "brain" panel visualizing which
  features the model currently weighs most heavily, and a running feed of
  every trade with a plain-English reason. The header shows live connection
  status and when the market data was last refreshed.

Progress (the portfolio, trade history, and the AI's learned weights)
persists to `localStorage`, so it picks up where it left off on reload.
The header's **Reset** menu offers a fresh $1,000 portfolio that keeps the
AI's learned brain, or a full reset that wipes both.

## Run it

```bash
cd website
npm install
npm run dev       # dev server with hot reload
npm run build     # type-checks and produces dist/
npm run preview   # serve the production build locally
```

Requires outbound network access to `api.dexscreener.com` from the browser
(no API key needed). If that host is unreachable — blocked by a restrictive
network, an ad blocker, or DexScreener itself being down — the header shows
"Reconnecting…" and the app keeps retrying every ~20s rather than crashing;
the portfolio simply won't trade until data resolves.

## Stack

React + TypeScript + Vite + Tailwind CSS. No backend, no database — the
browser talks to DexScreener directly and everything else (agent, portfolio,
risk management) runs client-side, persisted to `localStorage`.
