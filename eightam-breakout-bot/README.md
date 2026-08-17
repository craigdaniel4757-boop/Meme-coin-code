# eightam-breakout-bot — 8am break-and-retest strategy bot

A mechanical implementation of the "8am break and retest" intraday
strategy: mark the 8:00-8:15am New York session range, wait for a confirmed
1-minute breakout of it at or after 9:30am, enter on a retest of the
range's midpoint, and manage risk with a fixed stop and target. It ships in
**paper trading mode by default** and can optionally be switched to live
execution on any [ccxt](https://github.com/ccxt/ccxt)-supported exchange
once you've reviewed and accepted the risks below. It also includes a
backtester (to check whether the strategy actually has an edge on data you
choose, rather than taking a YouTube P&L screenshot on faith) and an
optional, off-by-default statistical filter that scores each setup's
confidence using a model trained on your own backtest history.

This is a **separate, standalone project** — it shares no code with the
meme-coin scanner/bot elsewhere in this repository and can be used
independently.

**Read [docs/RISK_DISCLAIMER.md](docs/RISK_DISCLAIMER.md) before doing
anything else.** Trading — crypto or otherwise — carries real risk of loss.
Nothing here guarantees profit, and the fact that a YouTube video shows a
winning week doesn't mean the strategy has a durable statistical edge. Use
the backtester on your own data before trusting any of this with real money.

## The strategy, exactly as implemented

1. **Mark the range**: the high and low of the 8:00-8:15am (New York time)
   candle. Its midpoint is the entry level for the rest of the day.
2. **Wait for a breakout**: a 1-minute candle must *close* beyond the range
   (configurable to wick-based instead) at or after 9:30am — a break before
   then is ignored, since it doesn't have the New York equity open's volume
   behind it yet. Whichever side breaks first sets the day's bias (long or
   short); there's no reconsidering it if price later breaks the other way.
3. **Enter on the retest**: once broken, a resting order at the range's
   midpoint waits for price to pull back to it, any time before 11:00am. If
   it never comes back, no trade is taken that day.
4. **Manage risk mechanically**: stop just beyond the range's *opposite*
   boundary (the side that would mean the setup was wrong), target a fixed
   R-multiple of that risk by default (3R, i.e. three times what's risked).
   One trade per symbol per day — full stop, win or lose.

See [docs/STRATEGY.md](docs/STRATEGY.md) for the full reasoning behind every
one of these rules (including where the source video is internally
inconsistent and which version of each rule this project actually
implements), what the optional ML filter does and doesn't add, and what a
backtest here can and can't tell you.

## Quick start

```bash
cd eightam-breakout-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # fill in only what you need; paper mode and backtesting need nothing

# Backtest against a real exchange's historical candles (default: BTC/USDT on Binance).
python -m eightam_bot backtest --days 90

# Continuous paper trading (simulated fills, no real funds -- safe to leave running).
python -m eightam_bot paper

# Current simulated (or live) bankroll and recent closed trades.
python -m eightam_bot report
```

Everything above runs in **paper trading mode** — `execution.mode` in
`config/default.yaml` defaults to `"paper"`, the `paper` subcommand forces
it regardless of what's in your config, and nothing in this project ever
sends a real order in that mode. See [Live trading](#live-trading) below
for what it actually takes to change that.

## Configuration

All tunables live in `config/default.yaml` — instrument(s), session timing,
risk sizing, execution mode, and the optional ML filter. Copy it (e.g. to
`config/local.yaml`) and pass `--config config/local.yaml` rather than
editing the default in place. Secrets (exchange API keys, notification
tokens) are read from environment variables / `.env`, never from the YAML,
so they can't accidentally end up committed.

A few settings worth knowing about up front:

- **`market.symbols`** is a list — the bot watches each symbol
  independently (its own range/breakout/retest/trade each day), sharing one
  account bankroll and one daily-loss circuit breaker across all of them.
- **`data.csv_paths`** lets you backtest against a local OHLCV file instead
  of fetching from an exchange — the only way to test this strategy against
  the *exact* instrument (index futures) the source video trades, since
  ccxt only covers crypto exchanges. When backtesting a CSV file, pass
  `--start`/`--end` explicitly rather than `--days` (the file's data is
  very unlikely to be from the last N days of wall-clock time).
- **`risk.stop_buffer_value`/`risk.take_profit_value`** default to
  percent-of-price and an R-multiple respectively, which scale sensibly
  across instruments. Switch either to `"points"` (raw price units) to
  match the source video's own numbers (5-point stop, 15-point target) if
  you're trading an instrument where that's the natural way to think about it.

## Architecture

```
eightam_bot/models.py        Shared value types: Candle, SessionRange, Bias, Trade
eightam_bot/timeutils.py     New York session time helpers (zoneinfo -- handles EST/EDT)
eightam_bot/config.py        YAML + env config, adapted into the engine's plain dataclasses
eightam_bot/strategy.py      The range/breakout/retest/stop/target state machine (pure, no I/O) --
                              the actual specification of the strategy; see its module docstring
eightam_bot/risk_manager.py  Stop/target calculation, position sizing, daily-loss circuit breaker
eightam_bot/data_feed.py     Historical + live OHLCV: any ccxt exchange, or a local CSV file
eightam_bot/execution/       Paper execution (default) and live ccxt execution (opt-in)
eightam_bot/backtest/        Historical replay engine + performance metrics
eightam_bot/ml_filter.py     Optional statistical confidence filter (off by default)
eightam_bot/journal.py       CSV trade journal -- the source of truth for realized P&L
eightam_bot/notify.py        Optional Telegram / Discord alerts
eightam_bot/runner.py        The continuous live/paper polling loop
eightam_bot/cli.py           backtest / train-filter / paper / live / report subcommands
```

`strategy.py` never touches the network, the exchange, or a clock beyond
the timestamp on the candle it's given — the exact same code replays a
backtest and drives a live/paper session, one bar at a time. See its module
docstring for the full design (why fills are checked in the order they are,
what's a deliberate simplification, and why).

## Live trading

Live execution is intentionally harder to turn on than to leave off, the
same way the sibling memebot project in this repository gates its own live
path:

1. Set `execution.mode: "live"` in your config file.
2. Put a trading-only API key/secret (no withdrawal permission) for your
   exchange in `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET` (and
   `EXCHANGE_API_PASSPHRASE` if your exchange needs one) — see `.env.example`.
3. If you want the strategy's short side live (not just in backtests/paper,
   where it's simulated either way), set `execution.live.market_type` to
   `"swap"` or `"future"` and make sure your exchange account is actually
   configured for margin/perpetuals trading — most exchanges cannot sell
   short on a plain spot market.
4. Run with the explicit flag: `python -m eightam_bot live --i-understand-the-risk`

Both #1 and #4 are required independently — either alone refuses to start.

Live fills are real MARKET orders placed the moment the bot's own candle
polling detects the condition (retest touch, stop/target/force-close) —
unlike paper mode, which idealizes the entry and take-profit as
zero-slippage resting limit orders. Expect live results to run somewhat
worse than a backtest or paper session. This code path has not been
exercised against real funds by its authors; verify its behavior yourself,
in small size, before trusting it further. Read
[docs/RISK_DISCLAIMER.md](docs/RISK_DISCLAIMER.md) first.

## The optional ML confidence filter

Off by default (`ml_filter.enabled: false`) and never required — every rule
above is fully mechanical. If you want it: run a backtest with real
history, then `python -m eightam_bot train-filter --days 180` to fit a
small classifier on your own closed trades (scoring each setup's
probability of reaching target before stop from features knowable at the
moment of the breakout), and set `ml_filter.enabled: true` to have the
live/paper runner skip any setup that scores below
`ml_filter.min_confidence`. See [docs/STRATEGY.md](docs/STRATEGY.md) for
why this uses a deliberately simple model and how seriously to take it at
realistic (small) sample sizes.

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

Tests cover the state machine (range construction, breakout confirmation,
retest fill/timeout, stop/target/force-close, one-trade-per-day, weekday
handling), risk/position sizing, the backtest engine and metrics (including
multi-symbol shared-bankroll sizing), paper execution fill economics, the
trade journal, config loading, and the ML filter — all against synthetic
fixtures, no network calls required.

## Disclaimer

This software is provided for research and educational purposes. It is not
financial advice. Trading carries a substantial risk of loss. You are
solely responsible for complying with the laws and regulations that apply
to you. See [docs/RISK_DISCLAIMER.md](docs/RISK_DISCLAIMER.md) for the full
disclosure.
