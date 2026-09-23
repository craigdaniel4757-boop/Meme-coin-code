# SOL Paper Desk: live Solana memecoin trading simulator

A static website that paper-trades **real Solana memecoins with real live data**
using a **fake $1,000 portfolio**. It scans trending Solana tokens on DexScreener
every few seconds and scores each one BUY / HOLD / SELL / AVOID. With auto-trade
on, it opens and closes positions by rule, and **every order is priced with a
real Jupiter swap quote**: the exact amount a real swap would get at that moment.
Portfolio value and P/L update live on every price tick.

No wallet and no signing. No transaction is ever sent on-chain.

## Run it

It's plain HTML/CSS/JS with no build step and no dependencies:

```bash
# any static server works; opening index.html directly also works
cd sol-sim && python3 -m http.server 8000
# → http://localhost:8000
```

To host it, drop the `sol-sim/` folder on GitHub Pages, Netlify, Vercel or any
static host.

- `?mode=demo` or `?mode=live` in the URL forces a data source.
- If the live API can't be reached (offline, blocked network), the app switches
  to a **synthetic demo market** with a banner. You can switch back from the
  top-bar dropdown. The live and demo portfolios are kept separately.
- State (cash, positions, trade log, equity curve, settings) is saved in
  `localStorage`. **Reset to $1,000** starts over.

## Order fills: real Jupiter quotes

To test whether the strategies work on real coins, each simulated order is
priced the way a real one would be:

1. **Buy:** the simulator asks Jupiter, Solana's swap aggregator, for a
   USDC → token quote for the exact dollar amount. The quote's output (after
   pool fees, price impact and multi-hop routing) is the number of tokens you
   get. The route (e.g. `Raydium → Meteora DLMM`) is shown in the trade log.
2. **Sell-back check:** before committing, it quotes selling those tokens
   straight back to USDC.
   - **No sell route** means a honeypot or untradable token. The buy is
     rejected, logged as `REJECTED`, and the coin shows AVOID for 10 minutes.
   - **Round-trip cost above your limit** (default 15%) means the pool is too
     illiquid, so the buy is also rejected.
3. **Sell:** each exit (stop, take-profit, trailing stop, manual) is a
   token → USDC quote for the exact on-chain amount you hold.

The trade log marks each fill **JUP** (real quote) or **EST** (estimated). It also
shows the fill's cost against the screen price ("vs screen"). The KPI row shows
total trading costs (fees plus slippage) and how many fills were priced by Jupiter.

**Jupiter API key:** Jupiter retired its keyless endpoint (`lite-api.jup.ag`) in
2026. Get a free key at [portal.jup.ag](https://portal.jup.ag) and paste it into
the **Order fills** panel. It's stored only in your browser's localStorage and sent
only to `api.jup.ag` (in the `x-api-key` header). The simulator tries
`/swap/v1/quote`, then `/swap/v2/order`. Without a working key (or if Jupiter is
unreachable), fills fall back to the estimate model and are labeled **EST** with
the reason, so you always know which results used real quotes. Quotes are spaced
at least 1.1s apart to stay within free-tier rate limits.

**What quotes still don't capture:** the delay between quote and landing,
MEV/sandwich attacks, failed transactions and priority-fee spikes. Real results
will usually be somewhat worse than quoted ones.

## Data

| What | Source | How often |
|---|---|---|
| Coin discovery | DexScreener `token-boosts/latest`, `token-boosts/top`, `token-profiles/latest` (Solana only) plus a BONK/WIF/POPCAT watchlist | every 60s |
| Price, 5m/1h/6h/24h change, volume, buy/sell counts, liquidity, market cap | DexScreener `tokens/v1/solana/{≤30 addresses}`, using each token's deepest pool | every 5s |
| SOL price | DexScreener, wSOL's deepest pool | every 30s |

That comes to about 15–25 requests a minute, well inside DexScreener's public limits.

## Strategies

These are rule-based versions of the memecoin momentum playbooks popular on
crypto TikTok: volume breakouts, buying dips on trending coins, early low-cap
"gems", taking your initial stake out at 2x, and trailing stops. Each strategy
can be toggled on or off and tracks its own win rate and P/L.

| Strategy | Entry (all must pass) | Size | Exit |
|---|---|---|---|
| **Volume Breakout** | 5m volume ≥ 2× hourly pace · 5m +3% to +25% · 1h up · buys ≥ 1.3× sells · still rising on live ticks | 10% | −20% SL · sell 50% at +100% · 25% trailing stop once +30% · 2h max · exit if flat after 30m |
| **Trend Dip Buy** | 24h ≥ +40%, 6h ≥ 0 · pulling back (5m −2…−12% or 1h −5…−20%) · ticks turning up · buys ≥ sells · liq ≥ $30K | 10% | −15% SL · 50% at +25% · rest at +50% · 12% trail once +15% · 90m max |
| **Early Low-Cap Gem** | age ≤ 24h · mcap $50K–$1M · 1h ≥ +15% · 1h buys ≥ 1.2× sells, ≥ 150 trades/h · liq ≥ $20K | 5% | −30% SL · 50% at +100% · 50% of rest at +300% · 30% trail once +50% · 4h max |
| **Trending Runner** | 24h ≥ +20%, 6h ≥ +10%, 1h ≥ +5%, 5m ≥ +0.5% · mcap ≥ $250K · 1h buys ≥ 1.1× sells · volume at pace | 8% | −12% SL · 33% at +40% · 15% trail once +10% · 3h max |

Rules every strategy follows:

- **Safety filter (AVOID):** liquidity ≥ $15K, mcap ≥ $30K, liquidity/mcap ≥ 2%,
  ≥ 40 trades in the last hour, pair ≥ 30 minutes old, not down more than 40% in 1h.
- **Rug protection:** sell immediately if pool liquidity falls below half of what it was at entry.
- **Momentum flip:** sell if 5m ≤ −10% and sellers outnumber buyers by more than 1.6×.
- At most 5 open positions (configurable), 2 new entries per tick, and a 20-minute cooldown before re-buying a coin.

**Signals:** BUY means every entry rule of an enabled strategy passes. SELL means an exit
rule fired on a position you hold, or sellers are in control (momentum score ≤ −35).
HOLD means no trigger yet; the reason column shows which rules are still missing.
AVOID means the coin fails the safety filter, or Jupiter just rejected an order for it.

**Fills:** real Jupiter quotes in live mode (see above). The estimate model
(demo mode or fallback) uses 1% slippage and a 0.25% DEX fee. Every trade also pays
a $0.01 network fee. Open positions are marked to the latest DexScreener price each tick.

## Files

```
index.html        layout
styles.css        dark trading-desk theme, responsive down to phone width
js/util.js        formatting and localStorage helpers
js/market.js      live DexScreener feed and synthetic demo feed (same interface)
js/strategies.js  safety filter, entry/exit rules, signal scoring
js/execution.js   order fills: Jupiter quotes, honeypot/round-trip checks, estimate fallback
js/portfolio.js   paper portfolio: books fills, P/L, stats, persistence
js/chart.js       canvas equity curve and sparklines
js/ui.js          rendering
js/app.js         poll → evaluate → auto-trade → render loop, controls
```

## Disclaimer

This is an educational simulation, not financial advice. Even quote-priced fills
are somewhat optimistic compared with real memecoin execution (landing delay, MEV,
failed transactions). Past simulated results don't predict real returns.
