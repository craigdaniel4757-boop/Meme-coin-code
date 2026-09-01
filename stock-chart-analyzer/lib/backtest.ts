// A genuine (small, honest) empirical check rather than pure formula-trust: replays one
// well-defined, mechanical signal — an RSI(14) mean-reversion crossing — over the exact bars
// already fetched for this chart, and reports how it actually performed. No look-ahead bias:
// a signal at bar i only ever looks at bars up to i to fire, and only evaluates the outcome
// using bars strictly after i, all of which are already-historical by the time this runs.
//
// Deliberately not fed into the score (see lib/scorer.ts) — this is context to weigh, not a
// vote, and it is not fed back into the rule being tested by construction. Small samples are
// reported as "not enough occurrences" rather than a misleadingly precise percentage.

import type { Bar, BacktestReading, BacktestSignalStat } from './types';

const MIN_SAMPLE = 3;

export function backtestRsiMeanReversion(bars: Bar[], rsiSeries: (number | null)[], horizon = 5): BacktestReading {
  const oversoldReturns: number[] = [];
  const overboughtReturns: number[] = [];

  const lastSignalIndex = bars.length - horizon - 1;
  for (let i = 1; i <= lastSignalIndex; i++) {
    const prevRsi = rsiSeries[i - 1];
    const curRsi = rsiSeries[i];
    if (prevRsi == null || curRsi == null) continue;

    const entry = bars[i]!.close;
    const exit = bars[i + horizon]!.close;

    if (prevRsi < 30 && curRsi >= 30) {
      oversoldReturns.push(((exit - entry) / entry) * 100);
    }
    if (prevRsi > 70 && curRsi <= 70) {
      overboughtReturns.push(((entry - exit) / entry) * 100); // positive = the fade would have worked
    }
  }

  return {
    rsiOversoldBounce: summarize('RSI oversold bounce (crosses back above 30)', oversoldReturns, horizon),
    rsiOverboughtFade: summarize('RSI overbought fade (crosses back below 70)', overboughtReturns, horizon),
  };
}

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
