# ChartPilot — screenshot-to-plan stock chart analyzer

Upload a screenshot of a stock chart (1D/5D/1M/3M/6M/1Y), pick a short-term or long-term
goal, and get a transparent, step-by-step technical-analysis walkthrough. Free data sources
only — no paid APIs, no API keys required.

**This is an educational tool, not financial advice.** See [Disclaimer](#disclaimer) and
`/methodology` in the running app for the full picture.

## What it does

1. **Reads your screenshot in the browser** — OCR (Tesseract.js) tries to auto-detect the
   ticker symbol, and a canvas-based heuristic estimates the visual trend as a fallback signal.
2. **Fetches real, free price history** for the resolved ticker from Stooq and Yahoo Finance's
   public endpoints (server-side, no key) — daily bars for 1M–1Y, true intraday bars for 1D/5D.
   For daily timeframes, both sources are fetched and cross-checked against each other (not just
   failed-over), and far more history is fetched than is displayed — up to ~6 years — so
   long-period indicators (SMA200, ADX, the backtest) have a real warm-up even when you're
   looking at a 1-month chart, exactly like a real charting platform would.
3. **Runs a full technical-analysis pass** on the real data: SMA/EMA stack, RSI(14),
   Stochastic %K/%D, MACD, ADX/DMI (trend strength/conviction), On-Balance Volume + divergence,
   Chaikin Money Flow, Rate of Change, anchored VWAP, ATR, Bollinger Bands *and* Keltner
   Channels (the real "TTM Squeeze"), Ichimoku Cloud position, Parabolic SAR, classic floor
   pivot points, fractal swing-point support/resistance clustering, 52-week/period high-low
   context, Fibonacci retracement, and pattern detection covering double top/bottom, breakouts,
   triangles, head & shoulders, flags/pennants, session gaps, squeeze fires, RSI/MACD/OBV
   divergence, and candlestick reversal patterns (engulfing, hammer, shooting star, doji,
   morning/evening star) on the real OHLC bars.
4. **Cross-checks itself** — relative strength vs. a benchmark (SPY) over the same window, a
   daily-trend confluence check for intraday (1D/5D) reads, and a small, honest backtest that
   replays three independent mechanical signals (RSI mean-reversion, SMA50/200 golden/death
   cross, MACD crossover) over the fetched chart's own bars — with no look-ahead bias by
   construction — and reports each one's actual historical hit rate. Real empirical context,
   not just formula-trust, and deliberately kept out of the score itself so it can't become
   self-referential.
5. **Scores it** into a −100…+100 directional read with a confidence number that's deliberately
   capped (never 100%, and much lower when only the screenshot could be used) and adjusted by
   ADX-measured trend conviction, timeframe confluence, and cross-source agreement — see
   `lib/scorer.ts`.
6. **Generates a step-by-step plan** — trend context, momentum, key levels (including pivot
   points), pattern signals, track record & context, a suggested approach (tuned to short-term
   vs. long-term), risk-management notes, and an explicit invalidation condition — see
   `lib/planner.ts`.
7. **Re-renders the real price data** as an interactive candlestick chart (`lightweight-charts`)
   with moving-average, VWAP, and support/resistance overlays, so you can cross-check it against
   your screenshot.

If no ticker can be resolved (OCR fails and none is typed in), the tool still produces a read
from the screenshot's pixels alone — clearly labeled and confidence-capped well below the
real-data path, rather than pretending to have data it doesn't.

## Why this design

Every number in the UI traces back to either a real fetched price bar or a named, standard
technical-analysis formula — there's no opaque model guessing at "what a chart looks like."
That's a deliberate choice for trustworthiness: see `/methodology` in the app (or
`app/methodology/page.tsx`) for the full breakdown of data sources, formulas, confidence
scoring, and honest limitations.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables or API keys are
required — every data source used is free and unauthenticated.

```bash
npm run build      # production build
npm run start      # run the production build
npm run typecheck
npm test           # unit tests (Vitest) for the analysis engine
```

A GitHub Actions workflow (`.github/workflows/stock-chart-analyzer-ci.yml` at the repo root)
runs typecheck + tests + build on every push/PR that touches this project.

## Architecture

```
app/
  page.tsx              Main upload -> configure -> analyze -> results flow (client component)
  error.tsx              Route-level error boundary (Next.js App Router convention)
  global-error.tsx        Root-layout-level error boundary
  methodology/page.tsx   Transparency page: data sources, formulas, confidence, limitations
  api/quote/route.ts     Server-side free market-data proxy (Stooq + Yahoo, no CORS/keys client-side)
components/              UI: dropzone, controls, results view, indicator grid, levels table,
                          pivot table, track-record panel, plan steps, lightweight-charts price
                          chart, disclaimers
lib/
  types.ts               Shared domain types
  indicators.ts          SMA, EMA, RSI/ATR/ADX (Wilder), MACD, Bollinger Bands, Keltner
                          Channels, Stochastic, OBV, anchored VWAP, Ichimoku, Parabolic SAR,
                          Chaikin Money Flow, Rate of Change, classic floor pivots
                          (+ indicators.test.ts)
  swings.ts               Fractal swing-point detection + support/resistance clustering
  patterns.ts             Trend classification (ADX-weighted), double top/bottom (deduplicated
                          to the most recent instance), breakouts, triangles, head & shoulders,
                          flags, TTM squeeze + fire detection, session gaps, RSI/MACD/OBV
                          divergence, Fibonacci retracement, period high/low context
                          (+ patterns.test.ts)
  candlePatterns.ts        Candlestick reversal patterns on real OHLC bars (engulfing, hammer,
                          shooting star, doji, morning/evening star)
  relativeStrength.ts      Return vs. a benchmark (SPY) over the same window
  backtest.ts               No-look-ahead historical replay of RSI mean-reversion, SMA
                          golden/death cross, and MACD crossover signals over the fetched
                          chart's own bars (+ backtest.test.ts)
  scorer.ts                Combines everything into a signal + honestly-capped confidence
                          (+ scorer.test.ts)
  dataSources.ts           Stooq/Yahoo fetchers with cross-validation, extended-history fetch,
                          short-TTL response cache, symbol validation (server-only)
  ocr.ts                   Tesseract.js ticker/price extraction (client-only)
  imageAnalysis.ts         Canvas-based visual trend/color heuristic (client-only, fallback path)
  planner.ts               Turns an analysis result into the ordered step-by-step plan
```

## Data sources

- **[Stooq](https://stooq.com)** — free daily OHLCV history, no key. Primary source for the
  1M/3M/6M/1Y timeframes.
- **[Yahoo Finance's public chart endpoint](https://query1.finance.yahoo.com)** — free, no key.
  Used for true intraday bars on 1D/5D, and as a fallback if Stooq has nothing for a symbol.
- **[Tesseract.js](https://github.com/naptha/tesseract.js)** — free, open-source, in-browser OCR
  for auto-filling the ticker field from the screenshot.
- **[lightweight-charts](https://github.com/tradingview/lightweight-charts)** — free,
  open-source (TradingView) charting library for the results chart.

Both market-data sources are unauthenticated public endpoints rather than licensed commercial
feeds — they're usually reliable but can occasionally lag or be unavailable. When both fail,
the app says so explicitly and falls back to the screenshot-only estimate instead of silently
showing wrong data. For daily timeframes both sources are fetched and their latest closes
compared; if they disagree by more than 2%, the UI surfaces it and confidence is reduced
accordingly rather than silently trusting whichever happened to respond. Responses are cached
in-memory for 60 seconds per symbol/timeframe to avoid hammering either free source on repeated
requests.

## Deployment

This is a standard Next.js App Router project — it deploys to any Node host or platform with a
Next.js runtime (e.g., Vercel's free tier) with no configuration beyond `npm run build`. No
secrets or environment variables are needed.

## Disclaimer

ChartPilot produces general, educational technical-analysis commentary from free/public price
data (and, when that's unavailable, a rough visual read of your screenshot). It does not know
your financial situation, goals, or risk tolerance, it cannot predict the future, and its free
data sources can lag, gap, or be wrong. Nothing it outputs is a recommendation to buy or sell
any security. Markets carry real risk of loss — consider speaking with a licensed financial
advisor before acting, and never risk money you can't afford to lose.
