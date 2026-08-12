# Risk disclaimer

Read this before running memebot in live mode, or acting on anything it
tells you in paper/scan mode.

## This is not financial advice

memebot is a piece of software that applies technical analysis and
mechanical risk rules to a public data feed. Nothing it outputs — a score,
a signal, a backtest result — is a recommendation to buy or sell anything.
It is provided for research and educational purposes. You are solely
responsible for any trading decision you make, whether or not you used
this software to inform it.

## Meme coins are exceptionally high risk

This is not boilerplate — it is specific to what this software trades:

- **Most meme coins go to zero.** The base rate for any individual meme
  coin, including ones that pass every filter in this bot, is total loss
  of principal. A handful produce outsized returns; the distribution is
  extremely fat-tailed, and no scoring model changes that distribution.
- **Rug pulls and honeypots are common**, not edge cases. This bot checks
  Solana mint/freeze authority renouncement and a few DexScreener-derived
  heuristics, which catch some of the most common mechanisms — they do
  not catch all of them (see `docs/STRATEGY.md` section 3 for what's
  explicitly *not* covered, including unlocked LP tokens and insider
  wallet accumulation).
- **Liquidity can vanish instantly.** A pair with healthy-looking
  liquidity can be drained in a single transaction. Position sizing and
  stop-losses assume you can actually exit at close to the quoted price;
  in a real rug or liquidity crisis, you often cannot.
- **Volatility is extreme.** Double-digit percentage moves within minutes
  are routine, not exceptional. Backtested win rates and drawdowns from
  calmer assets do not transfer.
- **The space is adversarial.** Some volume, some social signals, and
  some "boosts" are manufactured specifically to trigger bots like this
  one into buying. Treat every filter here as raising the bar, not as
  proof of legitimacy.

## No guarantee of profit or accuracy

"Sophisticated," "expert-level," and "proven" describe the *techniques*
implemented here — real indicators computed correctly, hard safety gates,
mechanical risk management, and backtesting to verify claims rather than
assert them. They are not, and are not intended as, a promise of a
specific win rate or return. Past performance in a backtest, paper-trading
session, or even a real track record does not guarantee future results.

## Live trading moves real money

If you enable `execution.mode: "live"`:

- Start with an amount you are completely prepared to lose in full, in a
  wallet that holds nothing else of value.
- The live execution path (`bot/execution/jupiter_live.py`) has not been
  exercised against real funds by its authors. Read it. Verify its
  behavior yourself in small amounts before trusting it further.
- You are responsible for securing your private key. It is read once from
  an environment variable and used only to sign transactions locally; it
  is never transmitted anywhere by this software — but the environment
  variable itself, your `.env` file, and your shell history are still your
  responsibility to keep secret.
- Network/priority fees are paid in SOL directly from your wallet and are
  **not** reflected in this bot's tracked USD P&L.

## Regulatory and tax responsibility

Trading regulations, licensing requirements, and tax treatment for crypto
assets vary by jurisdiction and change over time. You are responsible for
understanding and complying with the laws that apply to you, and for any
tax reporting obligations arising from trades this software executes on
your behalf (in live mode) or that you place based on its output.

## In short

Use paper mode. Read the code before you trust it. If you go live, start
small, watch closely, and never trade money you can't afford to lose
completely.
