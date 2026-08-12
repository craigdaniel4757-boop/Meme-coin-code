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
   (Solana, Ethereum, Base, BSC by default).
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
   buy/sell pressure ratio, and (for Solana) an on-chain check that mint
   and freeze authorities have been renounced. Anything that fails a hard
   gate is dropped regardless of how good its chart looks. See
   `bot/analysis/safety_filters.py`.
5. **Scores what's left** — a weighted 0-100 composite of trend
   (EMA stack + slope), momentum (RSI + MACD), volume (z-score + buy/sell
   pressure), volatility (ATR/Bollinger width), liquidity/safety, and
   social presence. Every score comes with a factor-by-factor breakdown,
   not just a number.
6. **Generates signals** from three independent strategies (momentum
   breakout, volume-spike breakout, trend pullback) — see
   `docs/STRATEGY.md` for the exact rules each one trades.
7. **Sizes and manages risk** — fixed-fractional position sizing off your
   configured bankroll, per-token exposure caps, a hard stop-loss, a
   staged take-profit ladder, an ATR-aware trailing stop once a position
   is sufficiently in profit, a max-hold timer, and a daily-loss circuit
   breaker that halts new entries for the day.
8. **Executes** — in paper mode (default) against a fully simulated
   portfolio with configurable slippage/fees, or in live mode as real
   swaps signed and sent through Jupiter on Solana.
9. **Backtests** — replay any strategy against recorded or fetched
   history and get win rate, profit factor, expectancy, max drawdown, and
   a Sharpe-style ratio back, so claims about a strategy are something you
   can check yourself rather than take on faith.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # fill in only what you need; paper mode needs nothing
python -m bot init-db

# Read-only: run one discovery+scoring pass and print a ranked report.
python -m bot scan

# Continuous paper trading (simulated fills, no real funds, safe to leave running).
python -m bot run

# Backtest a strategy against a specific pool's history.
python -m bot backtest --chain solana --pair <pairAddress> --days 14

# Current simulated (or live) portfolio state.
python -m bot report
```

Everything above runs in **paper trading mode** — `execution.mode` in
`config/default.yaml` defaults to `"paper"` and no live order is ever sent
in that mode. Nothing in this repository will touch a real wallet unless
you deliberately change that setting *and* pass `--i-understand-the-risk`
on the command line *and* set a funded `SOLANA_PRIVATE_KEY`. See
[Live trading](#live-trading-solana) below.

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
bot/data/        DexScreener + GeckoTerminal clients, Solana authority checks,
                  local candle store, rate limiting, typed models
bot/analysis/     Indicators (RSI/MACD/EMA/Bollinger/ATR/VWAP/swings),
                  composite scoring model, hard safety filters
bot/strategy/     Signal-generating strategies + the risk manager
                  (sizing, stop-loss, take-profit ladder, trailing stop,
                  circuit breaker)
bot/execution/    Portfolio bookkeeping, paper execution (default),
                  live Jupiter execution (opt-in)
bot/scanner/      The continuous scan -> filter -> score -> signal ->
                  execute orchestration loop
bot/backtest/     Historical replay engine + performance metrics
bot/notify/       Optional Telegram / Discord alerts
bot/storage/      SQLite persistence (candles, scan results, trades)
bot/cli.py        scan / run / backtest / report / init-db subcommands
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

## Disclaimer

This software is provided for research and educational purposes. It is
not financial advice. Trading meme coins carries a substantial risk of
total loss, including from rug pulls, honeypots, and extreme volatility
that no technical filter fully eliminates. You are solely responsible for
complying with the laws and regulations that apply to you. See
[docs/RISK_DISCLAIMER.md](docs/RISK_DISCLAIMER.md) for the full disclosure.
