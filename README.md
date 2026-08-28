# memebot — AI-assisted meme coin trading bot for DexScreener

memebot continuously scans meme coin pairs discovered through DexScreener
across multiple chains, scores each one with a multi-factor technical +
safety model, generates entry/exit signals from a small set of proven
momentum/breakout strategies, and manages positions with explicit risk
controls. It ships in **paper trading mode by default** and can optionally
be switched to live on-chain execution (Solana, via the Jupiter aggregator)
once you've reviewed and accepted the risks below.

**Read [docs/RISK_DISCLAIMER.md](docs/RISK_DISCLAIMER.md) before doing
anything else.** Meme coins are extremely volatile, thinly regulated, and a
majority are designed to separate late buyers from their money. No scoring
model, indicator set, or backtest result changes that. This project gives
you tooling to apply discipline and data to a fundamentally high-risk
activity — it does not, and cannot, guarantee profit.

## What it actually does

1. **Discovers candidates** — pulls DexScreener's latest/top boosted
   tokens, latest token profiles, configurable search terms, and any
   explicit watchlist entries, across whichever chains you configure
   (Solana, Ethereum, Base, BSC by default), then consolidates any token
   trading on more than one DEX down to its single most-liquid pool so it
   isn't scored as several separate, split-liquidity candidates.
2. **Filters hard** — liquidity, volume, pair age, and transaction-count
   floors remove obvious junk before any analysis runs. Hundreds of raw
   candidates typically collapse to a few dozen worth scoring.
3. **Builds real OHLCV candles** — pulls actual historical candles from
   GeckoTerminal's public pool API where available, and falls back to
   resampling its own observed price ticks into candles for pairs too new
   to have GeckoTerminal history yet. Technical analysis is only as good
   as the price history backing it, and this project is upfront about that
   in `docs/STRATEGY.md`.
4. **Runs safety gates** — DexScreener FDV/liquidity sanity checks,
   buy/sell pressure ratio, a liquidity-crash/stability check built from
   the bot's own recorded price/liquidity history, and (for Solana) an
   on-chain check that mint and freeze authorities have been renounced,
   holder concentration among top wallets, and a pre-trade Jupiter
   sellability probe that catches honeypots before ever buying. Anything
   that fails a hard gate is dropped regardless of how good its chart
   looks. See `bot/analysis/safety_filters.py`.
5. **Scores what's left** — a weighted 0-100 composite of trend
   (EMA stack + slope), momentum (RSI + MACD + RSI/price divergence),
   volume (z-score + buy/sell pressure + two independent wash-trading
   checks), volatility (ATR/Bollinger width), liquidity/safety, and
   social presence. Every score comes with a factor-by-factor breakdown,
   not just a number.
6. **Generates signals** from four independent strategies (momentum
   breakout, volume-spike breakout, trend pullback, Bollinger squeeze
   breakout) — see `docs/STRATEGY.md` for the exact rules each one
   trades. By default any one strategy's BUY signal is enough; raise
   `risk.min_agreeing_strategies` to require several to agree before
   entering.
7. **Confirms before entering** — three more checks run only at the point
   of actually placing a trade (not for every candidate scanned): a
   multi-timeframe trend check that a higher timeframe hasn't already
   turned against the entry, a market-regime filter that pauses new
   entries while a chain's reference token (SOL by default) is in a sharp
   short-term downtrend, and a same-token cooldown that blocks re-entering
   a token for a while after it just stopped you out.
8. **Sizes and manages risk** — fixed-fractional position sizing off your
   configured bankroll, per-token exposure caps, a hard stop-loss, a
   staged take-profit ladder, an ATR-aware trailing stop once a position
   is sufficiently in profit, a reversal-pattern exit that closes out a
   profitable position on a bearish engulfing candle or RSI divergence,
   a max-hold timer, a liquidity-crash emergency exit that overrides
   every other rule (including the stop-loss) if a held position's
   liquidity craters, and a daily-loss circuit breaker that halts new
   entries for the day.
9. **Executes** — in paper mode (default) against a fully simulated
   portfolio with configurable slippage/fees, or in live mode as real
   swaps signed and sent through Jupiter on Solana.
10. **Backtests** — replay any strategy against recorded or fetched
    history, gated by the same composite score used live, and get win rate,
    profit factor, expectancy, max drawdown, and a Sharpe-style ratio back,
    so claims about a strategy are something you can check yourself rather
    than take on faith.
11. **Auto-tunes scoring weights** — `optimize-weights` runs many
    backtests across several pools with different weight combinations and
    reports whichever performed best, with a minimum-trade-count floor and
    multi-pool requirement specifically to push back on overfitting. See
    `docs/STRATEGY.md` for the method and its honest limitations.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # fill in only what you need; paper mode needs nothing
python -m bot init-db

# Read-only: run one discovery+scoring pass and print a ranked report.
python -m bot scan

# Same, but continuously on the configured interval -- never trades, paper
# or live, just a live-updating table (Ctrl+C to stop).
python -m bot scan --loop

# Add --buy-only to either scan command to hide every HOLD row and show
# only what's actually flagged tradeable.
python -m bot scan --loop --buy-only

# Continuous paper trading (simulated fills, no real funds, safe to leave running).
python -m bot run

# Backtest a strategy against a specific pool's history.
python -m bot backtest --chain solana --pair <pairAddress> --days 14

# Search for scoring weights that historically performed best (pass
# several --pair values -- optimizing against one pool overfits to it).
python -m bot optimize-weights --chain solana --pair <pairAddress1> --pair <pairAddress2> --days 14

# Current simulated (or live) portfolio state.
python -m bot report
```

Everything above runs in **paper trading mode** — `execution.mode` in
`config/default.yaml` defaults to `"paper"` and no live order is ever sent
in that mode. Nothing in this repository will touch a real wallet unless
you deliberately change that setting *and* pass `--i-understand-the-risk`
on the command line *and* set a funded `SOLANA_PRIVATE_KEY`. See
[Live trading](#live-trading-solana) below.

## Web dashboard

A local, live-updating view of the exact same paper-trading engine `run`
uses, in a browser, so portfolio value and buy-signal accuracy over time
are something you watch build up instead of reading off a terminal:

```bash
pip install -r requirements-web.txt
python -m bot web
```

Then open **http://127.0.0.1:8000** in your browser. Equity curve, win
rate/profit factor/expectancy/drawdown (the same metrics `backtest` and
`optimize-weights` use), open positions, recent trades, and this cycle's
live BUY signals, all updating every few seconds on their own — no need
to keep refreshing.

**Deliberately paper-only and local-only**, not a placeholder: `web`
always runs simulated fills regardless of `execution.mode` in config —
there's no path from this command to live trading, not even by accident —
and binds `127.0.0.1` by default, so nothing outside your own machine can
reach it unless you explicitly pass a different `--host`. Kept in a
separate `requirements-web.txt` so every other command still works without
installing a web framework.

## Configuration

All tunables live in `config/default.yaml` — chains to scan, discovery
sources, pre-filter thresholds, safety gates, scoring weights, indicator
periods, strategy parameters, and risk limits. Copy it (e.g. to
`config/local.yaml`) and pass `--config config/local.yaml` rather than
editing the default in place. Secrets (wallet key, RPC URL, notification
tokens) are read from environment variables / `.env`, never from the YAML,
so they can't accidentally end up committed.

## Architecture

```
bot/data/        DexScreener + GeckoTerminal clients, Solana on-chain checks
                  (mint/freeze authority, holder concentration), Jupiter
                  sellability probe, local candle store, rate limiting,
                  typed models
bot/analysis/     Indicators (RSI/MACD/EMA/Bollinger/ATR/ADX/VWAP/anchored
                  VWAP/swings, RSI divergence, OBV divergence, bearish
                  engulfing, breakout retest confirmation), composite
                  scoring model, hard safety filters, liquidity-crash
                  detector, multi-timeframe confirmation, market-regime
                  filter
bot/strategy/     Signal-generating strategies + the risk manager
                  (sizing, stop-loss, take-profit ladder, trailing stop,
                  reversal-pattern exit, same-token cooldown, circuit
                  breaker)
bot/execution/    Portfolio bookkeeping, paper execution (default),
                  live Jupiter execution (opt-in)
bot/scanner/      The continuous scan -> filter -> score -> signal ->
                  execute orchestration loop
bot/backtest/     Historical replay engine, performance metrics, and a
                  scoring-weight optimizer built on top of both
bot/notify/       Optional Telegram / Discord alerts
bot/storage/      SQLite persistence (candles, scan results, trades)
bot/web.py        Local live dashboard (paper-only) -- `python -m bot web`
bot/cli.py        scan / run / backtest / report / web / init-db subcommands
```

Each layer talks to the next through plain typed objects (see
`bot/data/models.py`), so, for example, the strategy layer has no idea
whether a candle came from GeckoTerminal or from locally resampled ticks,
and the execution layer has no idea whether a fill was simulated or real.

## Live trading (Solana)

Live execution is intentionally harder to turn on than to leave off:

1. Install the extra signing dependencies: `pip install -r requirements-live.txt`
2. Set `execution.mode: "live"` in your config file.
3. Put a **base58-encoded private key for a wallet funded with only what
   you can afford to lose** in `SOLANA_PRIVATE_KEY`, and a Solana RPC URL
   in `SOLANA_RPC_URL` (a dedicated RPC provider is strongly recommended —
   public endpoints rate-limit hard).
4. Fund that wallet with **USDC** (trades are sized and quoted in USDC,
   regardless of which token each pair is actually pooled against — Jupiter
   handles the routing) **and a small amount of native SOL** to pay network
   and priority fees, which are always paid in SOL and are separate from
   your USDC trading capital.
5. Run with the explicit flag: `python -m bot run --i-understand-the-risk`

Live orders are routed through Jupiter's swap API (quote → build → sign
locally → send). The bot never transmits your private key anywhere except
to sign locally with it; it is read once from the environment and held in
memory only. Start with a trivially small bankroll and watch it closely —
this code path has not been exercised against real funds and you are
responsible for verifying its behavior before relying on it.

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

Tests cover indicator correctness, scoring monotonicity, risk-manager
sizing/stop/ladder/circuit-breaker logic, paper execution bookkeeping,
backtest metrics, and safety-filter gating — all against synthetic
fixtures, with no network calls required.

## Range Breakout Web App (stocks/ETFs)

A second, completely independent website in this repo: `rangebreak/`. It
has nothing to do with meme coins or `bot/` — it's a mechanical backtester
and chart visualizer for an 8-9am ET opening-range liquidity-sweep strategy
on stocks/ETFs, built around one specific rule set (see below) rather than
the scoring/multi-strategy approach `bot/` uses. It never places an order,
paper or live — it replays 1-minute candles against fixed rules and shows
you, on an actual candlestick chart, exactly what would have happened.

### Quick start

```bash
pip install -r requirements-rangebreak.txt
python -m rangebreak
```

Open **http://127.0.0.1:8010**. Pick a ticker and date range, hit "Run
backtest", then click any row in the results table to see that day's chart
with the range box, sweep, entry, stop, and target all marked. Ships with
zero setup using seeded synthetic demo data (see below); switch the "Data
source" dropdown to Yahoo Finance for real prices once you're running
somewhere with open outbound network access. Binds `127.0.0.1` by default,
same local-only posture as `python -m bot web` — pass `--host`/`--port` to
change it.

### The strategy, exactly as implemented

1. **Range**: the 1-hour candle from 08:00–09:00 **America/New_York**
   (DST-correct — this is wall-clock ET year-round, not a fixed UTC
   offset) sets `range_high`/`range_low`.
2. **Sweep + reclaim, 09:00–10:00 ET**: walking 1-minute candles forward,
   a *bullish* setup requires price to trade at least 1 tick below
   `range_low` and then a later (or the same) candle to *close* back above
   it; a *bearish* setup is the mirror image on `range_high`. Only the
   first such breach of the day is considered — a second, opposite-side
   breach later in the window is never a fallback candidate.
3. **Validity**: the setup only counts if the 9:00–10:00 hour's *close*
   (i.e. its last 1-minute bar) ends back inside `[range_low, range_high]`.
   This is the one place the backtest deliberately looks past the moment a
   trade might already have triggered — entry price/time/stop are decided
   using only data available up to that point, but whether the day counts
   as a trade at all isn't settled until 10:00, exactly as the spec asks
   for. A live version of this exact rule would need to treat any signal
   before 10:00 as provisional until the hour closes.
4. **Pre-sweep swing point**: a 1-minute swing high/low is a candle whose
   high (low) is strictly greater (less) than both immediate neighbors;
   the engine uses the most recent one whose entire 3-candle pattern sits
   before the breach candle.
5. **Entry**: the first 1-minute candle *from the reclaim candle onward*
   whose close breaks that swing point, entered at that candle's close.
6. **Stop**: 1 tick beyond the most extreme price reached during the
   breach→reclaim excursion (not re-extended by anything that happens
   after reclaim, while waiting for the entry trigger).
7. **Target**: the opposite side of the original 8–9am range.
8. **Resolution**: whichever of stop/target is touched first, walking
   forward on 1-minute bars; if a single bar's range spans both (which can
   happen with 1-minute OHLC — there's no tick data to disambiguate), the
   backtest conservatively assumes the stop was hit first. Neither hit by
   the session-close cutoff (16:00 ET by default) exits at the last price
   — recorded as an EOD exit, distinct from a target/stop.
9. One trade attempt per day, maximum — whatever the first breach+reclaim
   event resolves to (invalid, no swing, no entry trigger, or a trade)
   *is* the day's outcome.

Every day is recorded with (at minimum) date, ticker, range high/low,
sweep direction/price, entry time/price, stop price, target price, exit
time/price, result in R, and which of stop/target/EOD was reached first —
`GET /api/backtest` returns the full set as JSON.

### Cost model

US equities/ETFs trade in $0.01 ticks by default (configurable, for the
rare instrument that doesn't). Every fill is adjusted from the nominal
trigger price: entry, a triggered stop, and an EOD close-out are all
modeled as marketable orders that pay half the configured spread plus
configured slippage against the position; the target is modeled as a
resting limit order filled at its exact price. Commission is a flat
$/share round-trip cost subtracted from realized P&L. All of it —
tick size, spread, slippage, commission, and the session-close cutoff —
is adjustable from the "Advanced" panel in the UI. Defaults are
deliberately wider than a typical regular-hours estimate: the 8:00–10:00am
ET window is mostly **pre-market** (regular session opens 9:30am ET),
where liquidity is thinner and spreads wider for most names — lean on
liquid ETFs/large caps and tighten the assumptions to match your own
broker/instrument.

### Data sources

- **Synthetic demo data** (default): deterministic, seeded, clearly
  fake — cycles through all seven mechanical outcomes (target, stop, EOD
  is reachable too, invalid sweep, no sweep, no entry trigger, no prior
  swing) so the whole app is explorable with zero setup and no API key.
  Never presented as real prices for a real ticker.
- **Yahoo Finance** (`source=yahoo`): real prices via Yahoo's public
  intraday chart endpoint, no key required, fetched with
  `includePrePost=true` since the strategy's window is largely pre-market.
  Real limits worth knowing: 1-minute history only reliably covers roughly
  the last 7-8 days, and it's an unofficial endpoint (no SLA). A request
  it can't fulfill fails with a clear error rather than silently
  substituting fake data. Swap in another provider (Polygon.io, Alpaca,
  Twelve Data, …) by implementing `rangebreak/data/provider.py`'s
  `MarketDataProvider` — nothing else depends on Yahoo specifically.

### Testing

```bash
pip install -r requirements-rangebreak.txt -r requirements-dev.txt
pytest tests/test_rangebreak_*.py
```

The strategy engine is tested two ways: whitebox unit tests hand-build
specific candle sequences to pin down the trickiest mechanical edges (tick-
exact breach boundaries, same-bar reclaim, a swing point tied with its
neighbor, both stop and target touched in one bar), and end-to-end tests
run the full engine against the synthetic generator's seven scripted
scenarios and assert the expected outcome — all with no network calls.

### Disclaimer

This is a backtesting and visualization tool, not investment advice and
not a live trading bot — there is no code path from it to a broker or
exchange. A backtest, however carefully the costs are modeled, is not a
guarantee of future results, and thin pre-market liquidity in particular
can make real fills worse than any fixed slippage assumption captures.
You are solely responsible for complying with the laws and regulations
that apply to you.

## Disclaimer

This software is provided for research and educational purposes. It is
not financial advice. Trading meme coins carries a substantial risk of
total loss, including from rug pulls, honeypots, and extreme volatility
that no technical filter fully eliminates. You are solely responsible for
complying with the laws and regulations that apply to you. See
[docs/RISK_DISCLAIMER.md](docs/RISK_DISCLAIMER.md) for the full disclosure.
