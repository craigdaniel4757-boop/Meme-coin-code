// Genuine (small, honest) empirical checks rather than pure formula-trust: replays well-defined,
// mechanical signals — an RSI(14) mean-reversion crossing, an SMA50/200 golden/death cross, and
// a MACD signal-line cross — over the exact bars already fetched for this chart, and reports how
// each actually performed. No look-ahead bias: a signal at bar i only ever looks at bars up to i
// to fire, and only evaluates the outcome using bars strictly after i, all of which are already
// historical by the time this runs.
//
// Deliberately not fed into the score (see lib/scorer.ts) — this is context to weigh, not a
// vote, and it is not fed back into the rule being tested by construction. Small samples are
// reported as "not enough occurrences" rather than a misleadingly precise percentage.

import type { Bar, BacktestReading, BacktestSignalStat } from './types';

const MIN_SAMPLE = 3;

function summarize(label: string, returns: number[], horizon: number): BacktestSignalStat {
  if (returns.length < MIN_SAMPLE) {
    return { label, occurrences: returns.length, hitRatePct: null, avgForwardReturnPct: null, horizon };
  }
  const hits = returns.filter((r) => r > 0).length;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  return {
    label,
    occurrences: returns.length,
    hitRatePct: (hits / returns.length) * 100,
    avgForwardReturnPct: avg,
    horizon,
  };
}

function backtestRsiMeanReversion(
  bars: Bar[],
  rsiSeries: (number | null)[],
  horizon: number,
): { oversoldBounce: BacktestSignalStat; overboughtFade: BacktestSignalStat } {
  const oversoldReturns: number[] = [];
  const overboughtReturns: number[] = [];
  const lastSignalIndex = bars.length - horizon - 1;

  for (let i = 1; i <= lastSignalIndex; i++) {
    const prevRsi = rsiSeries[i - 1];
    const curRsi = rsiSeries[i];
    if (prevRsi == null || curRsi == null) continue;

    const entry = bars[i]!.close;
    const exit = bars[i + horizon]!.close;

    if (prevRsi < 30 && curRsi >= 30) oversoldReturns.push(((exit - entry) / entry) * 100);
    if (prevRsi > 70 && curRsi <= 70) overboughtReturns.push(((entry - exit) / entry) * 100); // positive = the fade would have worked
  }

  return {
    oversoldBounce: summarize('RSI oversold bounce (crosses back above 30)', oversoldReturns, horizon),
    overboughtFade: summarize('RSI overbought fade (crosses back below 70)', overboughtReturns, horizon),
  };
}

/** Generic "fast line crosses slow line" backtester — reused for both the SMA50/200 cross and
 * the MACD/signal-line cross, since both are the same shape of mechanical, no-look-ahead signal. */
function backtestCrossSignal(
  bars: Bar[],
  fast: (number | null)[],
  slow: (number | null)[],
  horizon: number,
  bullishLabel: string,
  bearishLabel: string,
): { bullish: BacktestSignalStat; bearish: BacktestSignalStat } {
  const bullishReturns: number[] = [];
  const bearishReturns: number[] = [];
  const lastSignalIndex = bars.length - horizon - 1;

  for (let i = 1; i <= lastSignalIndex; i++) {
    const prevFast = fast[i - 1];
    const prevSlow = slow[i - 1];
    const curFast = fast[i];
    const curSlow = slow[i];
    if (prevFast == null || prevSlow == null || curFast == null || curSlow == null) continue;

    const entry = bars[i]!.close;
    const exit = bars[i + horizon]!.close;

    if (prevFast <= prevSlow && curFast > curSlow) bullishReturns.push(((exit - entry) / entry) * 100);
    if (prevFast >= prevSlow && curFast < curSlow) bearishReturns.push(((entry - exit) / entry) * 100);
  }

  return {
    bullish: summarize(bullishLabel, bullishReturns, horizon),
    bearish: summarize(bearishLabel, bearishReturns, horizon),
  };
}

export function runBacktests(
  bars: Bar[],
  rsiSeries: (number | null)[],
  sma50: (number | null)[],
  sma200: (number | null)[],
  macdLine: (number | null)[],
  macdSignal: (number | null)[],
): BacktestReading {
  const rsi = backtestRsiMeanReversion(bars, rsiSeries, 5);
  const maCross = backtestCrossSignal(
    bars,
    sma50,
    sma200,
    10,
    'Golden cross (50-SMA crosses above 200-SMA)',
    'Death cross (50-SMA crosses below 200-SMA)',
  );
  const macdCross = backtestCrossSignal(
    bars,
    macdLine,
    macdSignal,
    5,
    'MACD bullish crossover',
    'MACD bearish crossover',
  );

  return {
    rsiOversoldBounce: rsi.oversoldBounce,
    rsiOverboughtFade: rsi.overboughtFade,
    maCrossBullish: maCross.bullish,
    maCrossBearish: maCross.bearish,
    macdCrossBullish: macdCross.bullish,
    macdCrossBearish: macdCross.bearish,
  };
}
