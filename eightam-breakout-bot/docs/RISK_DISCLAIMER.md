# Risk disclaimer

Read this before running eightam-breakout-bot in live mode, or acting on
anything it tells you in paper/backtest mode.

## This is not financial advice

eightam-breakout-bot is a piece of software that applies a mechanical
intraday trading rule set and mechanical risk management to a public market
data feed. Nothing it outputs — a signal, a backtest result, a trade — is a
recommendation to buy or sell anything. It is provided for research and
educational purposes. You are solely responsible for any trading decision
you make, whether or not you used this software to inform it.

## A YouTube track record is not a backtest

The strategy this project implements is drawn from a YouTube video showing
a profitable week of trades. That is not evidence the strategy has a
durable statistical edge:

- **A handful of trades is not a sample size.** Five days of one trade each
  proves the setup *can* happen to work, not that it works reliably over
  time, across market regimes, or on an instrument you'll actually trade.
- **Presentation bias is real.** People who post trading results
  disproportionately post winning ones. This project exists specifically so
  you can check the claim yourself, on real historical data, with
  `python -m eightam_bot backtest` — see docs/STRATEGY.md section 5 for
  what a backtest here can and can't actually tell you.
- **Rules described inconsistently in the source material were resolved
  with an explicit, documented choice, not silently.** See
  docs/STRATEGY.md section 1 for exactly where the video's own five
  examples disagree with each other and which version this project
  actually implements.

## Trading carries real risk of loss

This is not boilerplate — it applies directly to how this bot trades:

- **Leverage and volatility compound quickly.** Crypto markets (this
  project's default target) move sharply intraday; a stop-loss assumes you
  can actually exit near the quoted price, which is not guaranteed during a
  fast move or a thin order book.
- **Mechanical risk rules reduce, but do not eliminate, downside.** A fixed
  stop-loss and daily-loss circuit breaker (see docs/STRATEGY.md section 3)
  cap risk *per the rules as configured* — they do not protect against
  slippage beyond what's simulated, an exchange outage, a stop that fails
  to fill, or misconfiguration.
- **The optional ML confidence filter is not a safety feature.** It's a
  statistical filter trained on your own (likely small) backtest history —
  see docs/STRATEGY.md section 6 for why it's built to be conservative and
  why you should be skeptical of its confidence scores at realistic sample
  sizes. It can be wrong in either direction.

## No guarantee of profit or accuracy

"Mechanical," "backtested," and "risk-managed" describe the *techniques*
implemented here — real timezone-aware session logic, transparent fill
assumptions, position sizing, and a circuit breaker, computed correctly and
consistently between backtesting and live trading. They are not, and are
not intended as, a promise of a specific win rate or return. Past
performance in a backtest, a paper-trading session, or a YouTube video does
not guarantee future results.

## Live trading moves real money

If you enable `execution.mode: "live"`:

- Start with an amount you are completely prepared to lose in full, using
  API credentials scoped to trading only (no withdrawal permission).
- The live execution path (`eightam_bot/execution/ccxt_live.py`) has not
  been exercised against real funds by its authors. Read it. Verify its
  behavior yourself, in small size, before trusting it further — see
  docs/STRATEGY.md section 4 for exactly how live fills differ from (and
  are more conservative than) the paper-trading model.
- Live entries and exits are real market orders; expect real slippage that
  the idealized paper/backtest numbers do not reflect.
- Shorting requires an exchange/account genuinely configured for
  margin/perpetuals trading (`execution.live.market_type: "swap"` or
  `"future"`). Most exchanges cannot sell short on a plain spot market —
  attempting to on a misconfigured account will simply fail (or, worse on
  some exchanges/configurations, do something other than what you intended).
- You are responsible for securing your API credentials. They are read once
  from environment variables and used only to sign requests to your
  exchange; this software never transmits them anywhere else — but your
  `.env` file and shell history are still your responsibility to keep secret.

## Regulatory and tax responsibility

Trading regulations, licensing requirements, and tax treatment vary by
jurisdiction, by asset class, and by instrument (spot vs. margin vs.
derivatives), and change over time. You are responsible for understanding
and complying with the laws that apply to you, and for any tax reporting
obligations arising from trades this software executes on your behalf (in
live mode) or that you place based on its output.

## In short

Use paper mode. Run the backtester on real data before trusting the
strategy at all, on the specific instrument you actually plan to trade.
Read the code before you trust it. If you go live, start small, watch
closely, and never trade money you can't afford to lose completely.
