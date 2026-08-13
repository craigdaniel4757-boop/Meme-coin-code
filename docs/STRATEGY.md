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
| Liquidity/safety | 15% | Liquidity depth, FDV/liquidity ratio, pair age, safety-gate pass rate, holder concentration (Solana) |
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
- **Liquidity-crash / stability check** (`bot/analysis/liquidity_guard.py`)
  — rejects entry if a pair's liquidity has dropped more than
  `max_liquidity_drawdown_pct` (default 40%) from its recent peak, computed
  purely from the price/liquidity ticks memebot has itself recorded while
  watching the pair. This is a deliberate, practical substitute for
  directly verifying *LP lock status*: reliably decoding "is the LP token
  locked or burned" requires parsing each AMM program's own account layout
  (Raydium, Orca, pump.fun, etc. all differ), and a wrong byte-offset guess
  would silently produce an incorrect safety verdict — worse than not
  having the check at all. Watching liquidity itself for a sudden drop
  catches the same underlying danger (a rug in progress) without any
  protocol-specific guessing. The same mechanism, at a stricter threshold,
  is also the *highest-priority* exit check for open positions (see §5) —
  arguably more important there than as an entry gate, since it protects
  money already at risk.
- **Holder concentration check** (Solana only, `getTokenLargestAccounts` +
  `getTokenSupply`) — rejects entry if the top holders, *excluding* the
  single largest one, control more than `max_top_holder_concentration_pct`
  (default 70%) of supply. The largest holder is excluded because for a
  freshly launched pool it's almost always the AMM's own liquidity vault —
  a pool is supposed to hold a big share of supply, that's what liquidity
  means, so including it would flag every healthy pool as "dangerously
  concentrated." This is a heuristic, not a guarantee: it can occasionally
  exclude a genuine large individual holder if they happen to hold more
  than the pool itself (see `bot/data/solana_safety.py`).
- **Sellability ("honeypot") pre-check** (Solana only,
  `bot/data/honeypot_check.py`) — before ever buying, asks Jupiter's free
  quote API for a hypothetical sell of the token back to USDC. If no route
  exists, or the check itself can't complete, the gate fails closed. This
  catches honeypots directly and independently of DexScreener's own stats
  — a honeypot can have perfectly normal-looking price/volume/liquidity
  numbers right up until you actually try to sell it. Only a quote is
  requested (never a real transaction), so this works identically in paper
  and live mode and needs no wallet.

**What this does not catch**: the liquidity-crash check is a practical
substitute for LP-lock verification, not the same thing — a slow,
patient rug that never produces a sharp liquidity drop (or one that
happens faster than the bot's scan interval can observe) can still slip
through. The holder-concentration check is Solana-only and, per its
excluded-largest-holder heuristic above, can be fooled by a whale bigger
than the pool itself. Team wallets disguised as many separate normal-
looking holders (rather than one concentrated one) won't be flagged by
either check. And outright fake volume/wash trading sophisticated enough
to pass the volume/liquidity ratio check, or sophisticated enough to also
pass a Jupiter sell-quote probe, is still possible. No automated filter
catches everything; these gates raise the floor, they don't guarantee
safety.

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

- **Liquidity-crash emergency exit**: checked *before* even the stop-loss,
  and overrides every other exit rule. If a held position's liquidity has
  dropped more than `emergency_exit_liquidity_drawdown_pct` (default 60% —
  deliberately higher than the 40% entry gate in §3, since a moderate
  wobble shouldn't panic-sell a position but a severe one should) from its
  recent peak, the entire remaining position is exited immediately. This
  exists because price can lag behind a liquidity pull — by the time a
  falling price alone would trigger the stop-loss, the *effective* exit
  price after slippage may already be far worse than what's quoted.
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
at a time — and, by default (`python -m bot backtest`), also applies the
same composite score and safety gate live scanning does, so results
reflect what the bot would actually have done, not just "does this
strategy pattern ever appear in the data."

That gate needs pair stats (liquidity, volume, transaction counts, FDV,
age) a bare OHLCV history doesn't carry. What the backtester does with
that:

- **Real, derived from the candles**: 24h volume and 5m price change (read
  directly off the window), and buy/sell transaction counts (each bar
  classified buy/sell by whether it closed up or down — a crude per-bar
  proxy, since real counts are per-trade, not per-bar). Pair *age* is also
  real within the backtest: it's simulated as elapsed bars from the start
  of the series, not the wall-clock time since the data's real historical
  date.
- **Fixed placeholders for the whole run**: liquidity and FDV, which have
  no historical time series available from OHLCV at all. This means the
  liquidity-floor, FDV-ratio, and liquidity-depth-scoring checks don't
  vary bar to bar in a backtest — only the age- and activity-derived parts
  of the safety gate and score do.
- **Not evaluated at all**: Solana mint/freeze authority renouncement,
  holder concentration, sellability, and the liquidity-crash/stability
  check, since none of these can be reconstructed from historical OHLCV
  alone -- there's no historical on-chain RPC feed, no historical Jupiter
  quote, and no historical tick-by-tick liquidity series to check them
  against. All five are disabled in every backtest regardless of config;
  they're validated live, not historically.

Read the rest of the caveats in `bot/backtest/engine.py`'s docstring
before trusting a result: fills happen at the current bar's close (no
execution-lag modeling), slippage/fees are flat assumptions rather than a
real order book, and there's no way to model the price impact of the
bot's own hypothetical order or a rug pull that isn't visible in the
recorded price series. Use backtest results to compare strategies and
parameters against each other on the same data — not as a forecast of
live performance.

## 7. Auto-tuning scoring weights (`python -m bot optimize-weights`)

`bot/backtest/optimizer.py` searches for a set of the six scoring weights
(trend/momentum/volume/volatility/liquidity_safety/social) that would have
performed best, by literally running many backtests with different weight
vectors and keeping the winner — optimizing directly for realized
backtest performance through the real score-gate → strategy → risk-manager
pipeline, rather than an indirect statistical proxy like correlating
individual factors with forward returns.

**Search method**: weight vectors are sampled uniformly over the
probability simplex (Dirichlet(1,...,1) — "any non-negative combination
that sums to 1, with no bias toward the center or the corners"), the best
of `--trials` random samples is kept, then polished with a short
coordinate-wise hill-climbing pass (nudge weight from one factor to
another, keep the move only if it improves the score). No heavyweight
optimization library involved — deliberately, since the objective is
noisy and discontinuous (discrete trade counts), which is exactly the
kind of landscape simple random search plus local refinement handles
reasonably without the machinery (and false precision) of gradient-based
methods.

**Runtime**: candle indicators and the candle-derived pair-stat proxies
are precomputed once per pool and reused across every trial (they don't
depend on the weights being searched), but each trial still re-evaluates
the composite score bar by bar, since that *does* depend on the weights.
Runtime scales roughly with `trials x pools x bars`. The defaults (150
trials, `--days 14`, which fetches hourly bars) typically finish in well
under a minute per pool; a short `--days` (which switches to 5-minute
bars) combined with many pools and a high `--trials` can take several
minutes.

**Fitness function**: `expectancy_per_trade - drawdown_penalty *
max_drawdown_pct`, computed per pool and averaged across every pool
tested. A weight combination that doesn't produce at least `--min-trades`
closed trades on **every** pool is fully disqualified (`-inf`), not just
penalized — a couple of lucky trades on thin data shouldn't be able to
"win" the search, and requiring every pool to clear the bar (rather than
just averaging over however many did) rewards weights that work
reasonably broadly, not weights fit to one coin's specific noise.

**Overfitting is the real risk here, not a hypothetical one.** Searching
over many weight combinations against a limited amount of historical data
is a textbook way to fit noise. Two things push back on it: the minimum-
trade-count floor, and testing against *multiple* pools (always pass
several `--pair` values, not one). Neither eliminates the risk — more and
longer history, across more pools, is the only real fix. Treat the result
as a reasonable, data-backed starting point worth continuing to validate
(different pools, different date ranges) — not a finished answer, and
not something to blindly paste into a live config without watching how it
actually performs.

Because the composite score mixes candle-derived factors (trend, momentum,
volatility, and the activity-driven parts of volume/liquidity_safety —
see §6) with factors that stay constant for a whole backtest (liquidity
depth, FDV ratio, social presence), the search can meaningfully learn
weights for the former but has nothing to learn from for the latter within
a single-pool run — a weight near zero on `social` in the result, for
instance, may just reflect that `social` never varied in the data tested,
not that social signals are actually worthless live.

## 8. What "highest possible win rate" actually requires

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
