# SOL Paper Desk: live Solana memecoin trading simulator

A static website that paper-trades **real Solana memecoins at live prices** with a
**fake $1,000 portfolio**. It scans trending Solana tokens on DexScreener every
few seconds and scores each one BUY / HOLD / SELL / AVOID. With auto-trade on, it
opens and closes simulated positions by rule. Portfolio value and P/L update live
on every price tick.

No wallet, no keys, and no real orders. Nothing is ever sent on-chain.

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
AVOID means the coin fails the safety filter.

**Fill model:** 1% slippage on every fill, a 0.25% DEX fee and a $0.01 network fee per trade.
Positions are marked to the latest price each tick.

## Files

```
index.html        layout
styles.css        dark trading-desk theme, responsive down to phone width
js/util.js        formatting and localStorage helpers
js/market.js      live DexScreener feed and synthetic demo feed (same interface)
js/strategies.js  safety filter, entry/exit rules, signal scoring
js/portfolio.js   paper portfolio: fills, P/L, stats, persistence
js/chart.js       canvas equity curve and sparklines
js/ui.js          rendering
js/app.js         poll → evaluate → auto-trade → render loop, controls
```

## Disclaimer

This is an educational simulation, not financial advice. Simulated fills are
optimistic compared with real memecoin execution (MEV, failed transactions,
honeypots). Past simulated results don't predict real returns.
