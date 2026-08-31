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
disclaimer in the page footer, and the honest self-assessment below.

## What's actually running

- **A live Solana meme coin market** (`src/lib/dexscreener.ts`,
  `src/lib/marketData.ts`) — every ~20 seconds, the browser queries
  DexScreener's public search API directly for a watchlist of 15 well-known
  meme coin tickers plus SOL itself as a market-regime reference
  (`src/lib/coins.ts`), keeps only `chainId: "solana"` results above a
  liquidity floor, and picks the highest-liquidity pair per symbol. No
  hardcoded token addresses, no backend proxy. A coin that fails to resolve
  on a given poll keeps showing its last known price, flagged stale, instead
  of disappearing.
- **A small ensemble of online-learning trading policies**
  (`src/lib/agent.ts`, `src/lib/linearModel.ts`, `src/lib/neuralModel.ts`)
  — two independently-seeded linear models plus one tiny hand-rolled neural
  net (13 → 6 → 1, trained via real backpropagation), voting together on
  every entry/exit decision. Averaging differently-initialized, differently-
  shaped models is a standard, free variance-reduction technique: each
  member's gradient-bandit update is noisy and sensitive to its own random
  start and the luck of which trades it saw first, so a committee vote is
  steadier than trusting any one model. All members train from the same 13
  features: real, exchange-reported momentum (5-minute/1-hour/6-hour price
  change), buy/sell transaction pressure, volume trend, token age, and SOL's
  own momentum as a market-wide regime signal, alongside locally-observed
  volatility/RSI/distance-from-average and this coin's strength relative to
  the rest of the watchlist — plus a light L2 weight decay so a handful of
  coincidental wins can't push any single weight to an overconfident
  extreme.
- **Held-out evaluation trades** (`EVAL_FRACTION` in `src/lib/simulation.ts`)
  — roughly 1 in 7 new positions is deliberately excluded from learning: it
  trades for real (real sizing, real P&L) but its outcome never updates the
  ensemble. That gives an honest, unbiased "win rate (held-out)" reading on
  what the current policy actually achieves, shown separately from the
  "win rate (training)" number the models were literally fit to and which
  will always look better than reality.
- **An optional pretrained starting brain** (`scripts/pretrain.ts`, run via
  `npm run pretrain`) — an offline, dev-time-only script that fetches real
  historical Solana meme coin candles from GeckoTerminal's free public API
  and replays them through this exact same feature/agent/simulation code,
  then writes the resulting trained ensemble to
  `src/data/pretrainedBrain.json`, which the live app loads as its default
  starting brain instead of a hand-picked prior. See the comment at the top
  of `scripts/pretrain.ts` for exactly what it approximates and why (no
  historical buy/sell counts exist in OHLCV data, liquidity is held at its
  current value through the replay, etc.) — it's a real backtest-style
  warm start, not magic. `.github/workflows/pretrain.yml` reruns this
  weekly (plus an on-demand "Run workflow" button) and commits the
  refreshed weights automatically, so the starting point doesn't go stale
  as meme coin regimes drift — note that GitHub only fires `schedule`
  triggers for workflow files living on the repo's default branch, so the
  weekly run won't actually fire until this is merged there.
- **Hard risk controls independent of the learned policy** — a per-trade
  stop-loss, a max concurrent position cap, and a max hold time — so a bad
  stretch of learning can't wipe the account in one trade. Position size
  also scales down for thin liquidity and up or down with whether *held-out*
  trades have actually been winning lately (not just confidence/experience),
  and the simulated swap fee includes a slippage estimate that grows with
  trade-size-vs-liquidity — so both an unproven model and an illiquid meme
  coin cost more to trade here, same as they would for real.
- **A live dashboard** — equity curve, per-coin sparklines linking out to
  each pair's real DexScreener page, a "brain" panel showing the ensemble's
  composition, training-vs-held-out win rate, and which features the linear
  members currently weigh most heavily, and a running feed of every trade
  with a plain-English reason (eval trades marked distinctly).

Progress (the portfolio, trade history, and the ensemble's learned weights)
persists to `localStorage`, so it picks up where it left off on reload. The
header's **Reset** menu offers a fresh $1,000 portfolio that keeps both the
learned brain *and* the trade history (so performance stats keep
accumulating sample size instead of resetting to near-zero every time), or a
full reset that wipes everything.

## Is the learning any good?

Be skeptical of it. It's a real, small reinforcement-learning system — the
weights genuinely update from outcomes, this isn't scripted — but "small"
matters: a session realistically produces dozens to low hundreds of trades,
which is thin for judging 13-dimensional models even with an ensemble and
held-out evaluation. Meme coin prices are driven heavily by social hype and
whale activity that no technical feature here captures. Treat the held-out
win rate as the honest number, watch it stay noisy for a good while, and
don't mistake a hot streak for a discovered edge. Even the much more
elaborate Python bot elsewhere in this repo — multi-factor scoring, several
confirmed strategies, real safety filters, real backtesting — is explicit in
its own README that no scoring model or indicator set guarantees profit on
meme coins. This is a lighter system than that one, so the same caveat
applies at least as strongly.

## Run it

```bash
cd website
npm install
npm run dev       # dev server with hot reload
npm run build     # type-checks and produces dist/
npm run preview   # serve the production build locally
npm run pretrain  # optional: regenerate src/data/pretrainedBrain.json from real historical candles
```

Requires outbound network access to `api.dexscreener.com` from the browser
(no API key needed; `npm run pretrain` additionally needs
`api.geckoterminal.com`, also keyless). If DexScreener is unreachable —
blocked by a restrictive network, an ad blocker, or DexScreener itself being
down — the header shows "Reconnecting…" and the app keeps retrying every
~20s rather than crashing; the portfolio simply won't trade until data
resolves.

## Stack

React + TypeScript + Vite + Tailwind CSS. No backend, no database — the
browser talks to DexScreener directly and everything else (ensemble,
portfolio, risk management) runs client-side, persisted to `localStorage`.
`scripts/pretrain.ts` (run via `tsx`, a dev dependency) is the one offline
exception: a Node script, not part of the shipped site, for generating the
optional pretrained starting brain.
