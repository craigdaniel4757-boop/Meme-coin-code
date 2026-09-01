// Relative strength vs. a benchmark index (SPY by default) — a staple of professional technical
// analysis that a pure single-chart read misses entirely: a stock down 5% while the market is
// down 12% is quietly outperforming, and a stock up 5% while the market is up 15% is lagging.
// Free because it's just one more call to the same data sources already in use.

import type { Bar, RelativeStrengthReading } from './types';

function pctChange(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}

export function computeRelativeStrength(
  symbolBars: Bar[],
  benchmarkBars: Bar[],
  benchmarkSymbol: string,
): RelativeStrengthReading | null {
  if (symbolBars.length < 2 || benchmarkBars.length < 2) return null;

  const symbolReturnPct = pctChange(symbolBars[0]!.close, symbolBars[symbolBars.length - 1]!.close);
  const benchmarkReturnPct = pctChange(benchmarkBars[0]!.close, benchmarkBars[benchmarkBars.length - 1]!.close);
  const relativeStrengthPct = symbolReturnPct - benchmarkReturnPct;

  return {
    benchmarkSymbol,
    symbolReturnPct,
    benchmarkReturnPct,
    relativeStrengthPct,
    outperforming: relativeStrengthPct > 0,
  };
}
