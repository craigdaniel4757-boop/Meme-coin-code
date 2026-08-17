# Strategy design notes

This document explains *why* eightam-breakout-bot is built the way it is,
where the source video is ambiguous or internally inconsistent and which
choice this project actually made, and — just as important — what it's
weak at. If you're going to trust a bot with money, you should understand
its reasoning well enough to disagree with it.

## 1. What the source video actually says

The strategy: mark the 8:00-8:15am (New York time) candle. That's "the
final positioning of institutional money before the New York market opens
at 9:30am" — whether or not you buy the causal story, the mechanical claim
is falsifiable and this project is built so you can check it yourself (see
§5). Wait for a break of that range at or after 9:30am ("if it happens
before that, it's likely we don't have enough volume"). Enter on a retest
of the range's *midpoint*, not the broken level itself. Target a fixed
number of points; get out if invalidated.

**Where the video is inconsistent, across its own five daily examples**:
stop-loss placement is described three different ways — "five points below
this midpoint" (Monday), "slightly above the top of this zone" (Tuesday),
and "slightly below this zone, right next to this low" (Wednesday). Only
one of these comes with an actual *reason* attached: "the reason I place my
stop loss slightly below this Asia low is because Asia low will often act
as a magnet for price... I want to look at clear zones of invalidation."
That's the version this project implements by default — the stop sits just
beyond the range's opposite boundary (`risk_manager.compute_trade_levels`),
not at a fixed offset from the midpoint — because it's the one with an
actual invalidation argument behind it rather than an arbitrary points
figure that happens to fit whatever chart was on screen. `risk.stop_buffer_type`
lets you switch to fixed points if you'd rather match the video's numbers
exactly.

Target sizing has the same issue: "15 points" against either a ~5-point or
a ~4-point stop implies somewhere between 3R and 4R, and the video states
"about 1 to 4" for the Tuesday short specifically. This project defaults to
`take_profit_mode: "r_multiple"` at 3.0 — a reasonable middle of the video's
own numbers, fully configurable, not a claim that 3R is somehow the
"correct" target.

## 2. The state machine (`strategy.py`)

Five phases per symbol per day: `WAITING_FOR_RANGE` →
`WAITING_FOR_BREAK` → `WAITING_FOR_RETEST` → `IN_TRADE` → `DONE`. `DONE` is
terminal for the day regardless of how it was reached — one trade per
symbol per day, matching the video's own "we are scalpers, we follow the
plan" discipline. There is no re-arming after a trade closes, a setup times
out, or the range never even forms.

**Breakout confirmation** (`breakout.confirmation`, default `"close"`): a
1-minute candle must *close* beyond the range, not just wick through it.
This filters out exactly the kind of noise the video's own "clear break"
language implies a trader would filter by eye. Set to `"wick"` for a more
sensitive (and noisier) trigger.

**Retest fill mechanics**: the entry is modeled as a resting limit order at
the range's midpoint. A candle "fills" it the same way a real limit order
would — if its range touches the entry level at all, regardless of where
the candle's other side is. This works because of an invariant the state
machine itself guarantees: by the time a candle is checked in
`WAITING_FOR_RETEST`, price was still on the far side of the entry as of
the *previous* candle (otherwise the fill would already have happened) — so
a single-sided touch test (`candle.low <= entry` for a long, mirrored for a
short) is both sufficient and correct, including the edge case of a single
violent candle blowing straight through the midpoint and the stop in one
move (a real resting order would have been hit on the way through, so
that's treated as a fill that then resolves as a stop-out on a later
candle, not as some separate "invalidated without trading" outcome — there
isn't one; the only way this setup produces no trade at all is running out
of time before the trade window closes at 11:00am).

**Same-bar entry-and-exit is deliberately not modeled**: a fill and its
exit are always checked on different candles, even in the rare case
described above. At 1-minute granularity this is a reasonable
simplification, the same kind of timing approximation the video's own
manual chart-watching makes; getting it exactly right would need
tick-level data this project doesn't have.

**Stop-vs-target priority within one candle**: if a single volatile candle's
range spans both the stop and the target, which was actually hit first
intra-bar is ambiguous from OHLC data alone. The stop is checked first —
the standard, conservative backtesting convention, so results don't
overstate performance by assuming the better outcome whenever it's unclear.

**Force-close** (`session.force_close_time`, default 12:00pm): the source
video trades an instrument whose session simply ends. Crypto trades 24/7,
so a position that never hits its stop or target needs an explicit cutoff
or it could run indefinitely — this is a safety net the strategy itself
doesn't need for futures/equities, added specifically for the crypto case
this project defaults to.

**Trading days** (`session.trading_days`, default Mon-Fri): the "final
positioning of institutional money before the New York open" premise this
strategy is built on doesn't really hold on a weekend, even though crypto
itself keeps trading through it.

## 3. Risk management (`risk_manager.py`)

Pure functions over explicit numbers — a `SessionRange`, a `Bias`, an
account bankroll — no I/O, no clock reads, so this is trivial to unit test
and is exactly what both the live/paper runner and the backtester call.

- **`compute_trade_levels`**: entry is always the midpoint. Stop is the
  opposite boundary of the range plus a buffer (`risk.stop_buffer_type`:
  `"percent"` of the boundary price, or `"points"` for a fixed offset —
  see §1 for why the boundary, not the midpoint, anchors the stop). Target
  is derived from `risk.take_profit_mode`: an R-multiple of the resulting
  risk distance (default), a fixed percent of entry, or fixed points.
- **`size_position`**: fixed-fractional — risk exactly
  `risk.risk_per_trade_pct` of bankroll on the entry-to-stop distance,
  capped so notional never exceeds the bankroll itself. That cap assumes
  spot-style, unleveraged sizing; if you're trading this on margin, treat
  it as a conservative floor and adapt sizing to your own account's rules.
- **`check_daily_loss_limit`**: halts *new* entries (a trade already filled
  keeps running to its stop/target/force-close) once realized losses for
  the day reach `risk.max_daily_loss_pct` of the *starting* bankroll — a
  fixed baseline, not shrinking current equity, so the threshold doesn't
  get more lenient as a bad day compounds. With one trade per symbol per
  day, this mostly matters when watching several symbols at once (see
  `market.symbols`): each has its own independent setup, but losses still
  stack against one shared daily limit, and `backtest/engine.py` shares a
  single bankroll and circuit breaker across every symbol in a run exactly
  the way a live multi-symbol session would.

## 4. Fill economics: what's a limit order and what's a market order

Every level `strategy.py` produces is *ideal* — no slippage, no fees. The
execution layer (`execution/paper.py`'s `apply_entry_fill`/`apply_exit_fill`,
reused unmodified by `backtest/engine.py`) is what turns an ideal price
into a realistic one, and it treats each fill according to what kind of
order it realistically is:

- **Entry and take-profit**: resting **limit** orders. They fill at their
  exact price — no slippage — because that's how a limit order behaves.
  Fees still apply.
- **Stop-loss and force-close**: effectively **market** orders once
  triggered. Slippage (`execution.paper.simulated_slippage_bps`) is applied
  against the trader — a long exits lower, a short exits higher than the
  ideal level — plus fees.

Live execution (`execution/ccxt_live.py`) is simpler and more conservative
than this idealized paper model: every fill, entry included, is a real
market order placed the instant the bot's own polling detects the
condition strategy.py already computed. There's no resting exchange-side
limit order for the entry or take-profit the way paper mode assumes — an
unattended resting order that would need to be tracked, potentially
partially filled, and cancelled if a setup times out is a meaningfully
bigger and riskier surface than "detect the condition, then market-fill
immediately." Expect live results to run somewhat worse than paper or a
backtest, especially given this bot's 1-minute polling granularity.

## 5. Backtesting: what it can and can't tell you

`backtest/engine.py` replays the *exact same* `strategy.py` state machine
used live, bar-by-bar, over historical candles — not a separate,
possibly-drifted reimplementation. What that does and doesn't capture:

- **Real**: the range/breakout/retest/stop/target logic itself, and fill
  economics (§4) — identical code path to paper trading.
  Multi-symbol runs share one bankroll and one circuit breaker exactly like
  a live session would.
- **A simplification, stated plainly**: fills happen on the *next* bar
  after the condition that triggers them (§2's "same-bar entry-and-exit is
  deliberately not modeled"), and slippage/fees are flat configured
  assumptions rather than a real order book. There's no way to model the
  price impact the bot's own hypothetical order would have had, or a
  liquidity/gap event outside what the recorded candles show.
- **Historical data source**: `data_feed.py`'s `CCXTDataFeed` pulls real
  OHLCV from whatever exchange you configure — genuine market data, not
  synthetic. `CSVDataFeed` backtests against a local file, which is the
  only way to test this strategy against the actual futures instrument the
  source video trades, since ccxt only covers crypto exchanges.

Use backtest results to compare parameter choices against each other on
the same data, and as a sanity check on whether the strategy has *any*
edge on the instrument/period you actually care about — not as a promise
of what it'll do live. A backtest showing an edge on six months of one
symbol is a data point, not a proof.

## 6. The optional ML confidence filter (`ml_filter.py`)

Off by default, and everything above works identically without it. What it
adds: a small `LogisticRegression` classifier trained on your own backtest
history, scoring each new setup's probability of reaching target before
stop from features knowable at the moment of the breakout (range width
relative to price, how strongly price broke the range, how many minutes
after 9:30 the breakout happened, direction, day of week — see
`SetupFeatures`). If enabled, the live/paper runner skips any setup scoring
below `ml_filter.min_confidence`.

Logistic regression, not a deeper model, is a deliberate choice: at one
trade per symbol per day, realistic training sets are small — dozens to
low hundreds of rows even over a long backtest across several symbols — and
a simple, low-variance model is far less likely to just memorize noise on
a set that size than a more expressive one would be.
`RetestFilter.train` prints an explicit warning below
`ml_filter.MIN_TRAINING_SAMPLES` (40) rather than silently handing back a
model with no indication of how thin the data behind it was. Treat any
confidence score from a model trained on a small set with proportional
skepticism — this is a genuine overfitting risk, not a hypothetical one,
and more history (more symbols, more time) is the only real fix.

## 7. What actually determines whether this makes money

Being honest about it: a mechanical implementation of a video's rules is
not, on its own, an edge. What this project actually provides is the
*tooling* to find out — real historical data, the exact same logic live and
backtested, transparent fill assumptions, and mechanical risk management
that doesn't get greedy or emotional about any single trade. Whether the
underlying pattern (institutional positioning ahead of the New York open,
expressed as a range/break/retest) holds up on the specific instrument and
period you care about is something to verify with `backtest`, not assume
because a YouTube video showed a good week. See
[RISK_DISCLAIMER.md](RISK_DISCLAIMER.md).
