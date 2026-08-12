# Strategy design notes

This document explains *why* memebot's scoring model and strategies are
built the way they are, what each one is actually good at, and — just as
important — where each one is weak. If you're going to trust a bot with
money, you should understand its reasoning well enough to disagree with
it.

## 1. The data problem, honestly

DexScreener's public API gives you a live snapshot per pair: current
price, liquidity, FDV/market cap, rolling volume and price-change over
5m/1h/6h/24h windows, and rolling buy/sell transaction counts over the
same windows. It does **not** give you historical OHLCV candles.

Real technical analysis — RSI, MACD, Bollinger Bands, ATR, support/
resistance — needs a price *history*, not a snapshot. memebot closes that
gap two ways:

1. **GeckoTerminal** indexes the same on-chain pools DexScreener does and
   exposes free, keyless OHLCV history at minute/hour/day granularity.
   This is the preferred source whenever a pool has enough history there.
2. **Locally resampled ticks**: for pools too new to be indexed yet (which
   describes a lot of meme coins in their most interesting early hours),
   memebot builds its own candles by resampling the price observations it
   makes on every scan cycle. Volume in these locally-built candles is a
   *proxy* — the clipped-at-zero delta of DexScreener's rolling 24h volume
   figure between observations — not exchange-grade trade volume.

**What this means practically**: indicator readings on a coin the bot has
only been watching for 20 minutes are much less trustworthy than readings
on one it's had an hour of real GeckoTerminal history for. The scoring
model treats indicators it can't compute yet (too little history) as
*neutral*, not bearish — but neutral still isn't the same as "confirmed."
`num_candles` on every indicator snapshot tells you exactly how much
history a reading is standing on.

## 2. The composite score (0-100)

Six weighted factors, each independently computed and independently
explainable (`ScoreBreakdown.notes`):

| Factor | Default weight | What it measures |
|---|---|---|
| Trend | 25% | EMA(9/21/50) stack alignment + EMA9 slope (rolling VWAP position noted, not scored) |
| Momentum | 20% | RSI zone + MACD histogram level/direction |
| Volume | 20% | Volume z-score spike + buy/sell pressure + volume/liquidity health |
| Volatility | 10% | ATR% of price — too low is dead, too high is unmanageable |
| Liquidity/safety | 15% | Liquidity depth, FDV/liquidity ratio, pair age, safety-gate pass rate |
| Social | 10% | Presence of socials/website, active DexScreener boosts |

Why these weights: trend and momentum dominate because they're the most
directly predictive of near-term continuation, which is what the
strategies actually trade. Liquidity/safety is weighted enough to matter
but intentionally doesn't dominate — the hard safety gates (next section)
already do the heavy lifting of keeping outright dangerous tokens out;
this factor is about *degree* of quality among things that already passed.
Social is deliberately the smallest weight: presence of a Twitter link is
a very weak signal on its own (scammers have Twitter accounts too), but
its total absence on an otherwise-promising coin is worth a small penalty.

**Every weight is configurable** in `config/default.yaml` under
`scoring.weights`. There is no universally "correct" weighting — what's
here is a reasonable starting point, not a claim of optimality. Use
`backtest` to test whether a different weighting actually performs better
on the specific coins/timeframes you care about.

## 3. Hard safety gates (`bot/analysis/safety_filters.py`)

These run *before* scoring and are pass/fail, not scored — a coin that
fails any of these is dropped regardless of how good its chart looks:

- **Liquidity / volume / age / activity floors** — filters out dead pairs
  and pairs too young to have shaken out the initial launch chaos.
- **FDV/liquidity ratio ceiling** — a huge fully-diluted valuation sitting
  on tiny liquidity is a classic setup for a small sell order to crater
  the price, and often signals the team holds most of the supply.
- **5-minute buy/sell pressure floor** — a sudden wave of sells relative
  to buys is the earliest visible signal of a dump in progress.
- **Solana mint/freeze authority renouncement** — queried on-chain via
  `getAccountInfo` with `jsonParsed` encoding, no API key needed. If the
  deployer retained mint authority, they can print unlimited new supply
  and dilute (or outright rug) every holder. If they retained freeze
  authority, they can freeze your token account so you can never sell.
  Both are checked directly against the mint account, and **both fail
  closed**: if the RPC call fails or the account can't be parsed, memebot
  treats it as "not confirmed renounced" rather than assuming it's safe.

**What this does not catch**: liquidity-pool-side rugs (LP tokens not
locked/burned — this build doesn't verify LP lock status), team wallets
disguised as normal holders quietly accumulating before dumping, or
outright fake volume/wash trading sophisticated enough to pass the
volume/liquidity ratio check. No automated filter catches everything;
these gates raise the floor, they don't guarantee safety.

## 4. Entry strategies (`bot/strategy/signals.py`)

Three independent, well-established technical patterns. Any one BUY
signal (combined with a passing score) is enough to be considered
tradeable — they aren't required to agree.

- **`momentum_breakout`** — price closes above its N-bar swing high on a
  volume spike, with MACD histogram non-negative. The classic "something
  just happened, follow it" entry. Weakness: by definition you're buying
  after the move has already started, so you're paying up for
  confirmation; on a coin that immediately reverses, this is the strategy
  most likely to buy the local top.
- **`volume_spike_breakout`** — a more sensitive, volume-first trigger:
  fires on a sharp volume z-score spike plus a positive 5-minute price
  move, before a clean range breakout has necessarily formed. Catches
  moves earlier than `momentum_breakout`; also has the highest false-
  positive rate of the three, since a volume spike alone doesn't
  distinguish real accumulation from one large buyer.
- **`trend_pullback`** — only fires within a confirmed uptrend (bullish
  EMA stack, price still above the slow EMA) when RSI has pulled back into
  a defined "buy the dip" zone. This is usually the best risk/reward of
  the three — you're buying a discount within an established move instead
  of chasing strength — at the cost of firing far less often, since it
  needs an uptrend to already exist.

## 5. Risk management (`bot/strategy/risk_manager.py`)

- **Position sizing**: fixed-fractional — risk exactly `risk_per_trade_pct`
  of *current available cash* on the distance to the stop-loss, hard-capped
  at `max_allocation_pct_per_token` regardless of how tight the stop looks.
  Sizing off available cash (rather than total equity including what's
  already deployed in open positions) is the more conservative of the two
  common conventions, and avoids needing a mark-to-market pass before every
  sizing decision.
- **Stop-loss**: a flat percentage below entry. Simple and non-negotiable
  on purpose — meme coin moves are violent enough that indicator-based
  "smart" exits alone tend to give back far more than they save.
- **Take-profit ladder**: staged partial exits (default: sell 25% at
  +50%, +100%, +200%) rather than one all-or-nothing target, so a position
  that goes vertical and then reverses still banks real profit along the
  way.
- **Trailing stop**: arms only after `trailing_stop_activate_pct` unrealized
  gain, then trails `trailing_stop_distance_pct` behind the high-water
  mark — protects the back half of a big winner without capping its
  upside the way a fixed take-profit would.
- **Max hold timer**: closes out anything that's gone nowhere after
  `max_hold_minutes` — capital sitting in a dead trade is capital not
  available for the next real signal.
- **Daily-loss circuit breaker**: halts *new* entries (existing positions
  keep being managed normally) once realized losses for the day reach
  `max_daily_loss_pct` of the *starting* bankroll — deliberately measured
  against a fixed baseline rather than shrinking current equity, so the
  breaker's dollar threshold doesn't get more lenient as a bad day
  compounds.

## 6. Backtesting: what it can and can't tell you

`bot/backtest/engine.py` replays the exact same indicator/strategy/risk-
manager code used live, bar-by-bar, over historical candles for one pool
at a time. Read the caveats in that file's docstring before trusting a
result: fills happen at the current bar's close (no execution-lag
modeling), slippage/fees are flat assumptions rather than a real order
book, and there's no way to model the price impact of the bot's own
hypothetical order or a rug pull that isn't visible in the recorded price
series. Use backtest results to compare strategies and parameters against
each other on the same data — not as a forecast of live performance.

## 7. What "highest possible win rate" actually requires

It requires, honestly: none of this is enough on its own. Meme coins are
dominated by reflexive, narrative-driven, often outright manipulated price
action that a purely technical model cannot fully see coming. The
combination here — hard safety gates before anything else, multiple
independent confirmation signals rather than one indicator, mechanical
risk management that doesn't get greedy or emotional, and backtesting to
verify claims — is the standard, proven toolkit professional discretionary
and systematic traders actually use to put the odds in their favor. It is
not, and cannot be, a guarantee. See
[RISK_DISCLAIMER.md](RISK_DISCLAIMER.md).
