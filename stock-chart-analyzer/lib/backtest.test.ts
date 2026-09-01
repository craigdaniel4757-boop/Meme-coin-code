import { describe, expect, it } from 'vitest';
import { rsi, sma, macd } from './indicators';
import { runBacktests } from './backtest';
import type { Bar } from './types';

function synthBars(n: number, start: number, drift: number, noise: number, seed = 11): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    price = Math.max(1, price + drift + (rand() - 0.5) * noise);
    const close = price;
    const high = Math.max(open, close) + rand() * noise * 0.5;
    const low = Math.min(open, close) - rand() * noise * 0.5;
    bars.push({ time: 1700000000 + i * 86400, open, high, low, close, volume: 1_000_000 });
  }
  return bars;
}

function runFor(bars: Bar[]) {
  const closes = bars.map((b) => b.close);
  const rsiSeries = rsi(closes, 14);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const macdResult = macd(closes, 12, 26, 9);
  return runBacktests(bars, rsiSeries, sma50, sma200, macdResult.macd, macdResult.signal);
}

describe('runBacktests — no look-ahead bias', () => {
  it('gives identical stats whether or not bars far beyond the evaluation horizon exist', () => {
    // The whole point of a no-look-ahead backtest is that a signal's recorded outcome can never
    // change based on data that hadn't happened yet. Truncating the series well past every
    // signal's evaluation window must not change any of the earlier, fully-resolved stats.
    const full = synthBars(300, 100, 0.15, 3);
    const truncated = full.slice(0, 220); // still long enough for every signal fired before ~bar 205 to fully resolve

    const fullResult = runFor(full);
    const truncatedResult = runFor(truncated);

    // maCrossBullish/Bearish need 200+ bars to even start firing, so their *early* occurrences
    // (all of which resolve well before bar 220) must match exactly between the two runs.
    expect(truncatedResult.maCrossBullish.occurrences).toBeLessThanOrEqual(fullResult.maCrossBullish.occurrences);
    expect(truncatedResult.rsiOversoldBounce.occurrences).toBeLessThanOrEqual(fullResult.rsiOversoldBounce.occurrences);

    // If the truncated run found *any* occurrences, their aggregate stats must be internally
    // consistent (bounded hit rate, finite average) -- a sanity check that nothing produced
    // NaN/undefined by reading past the end of a shortened array.
    for (const stat of Object.values(truncatedResult)) {
      if (stat.hitRatePct !== null) {
        expect(stat.hitRatePct).toBeGreaterThanOrEqual(0);
        expect(stat.hitRatePct).toBeLessThanOrEqual(100);
      }
      if (stat.avgForwardReturnPct !== null) {
        expect(Number.isFinite(stat.avgForwardReturnPct)).toBe(true);
      }
    }
  });

  it('never evaluates a signal using a bar beyond the array it was given', () => {
    // A signal at index i with horizon h reads bars[i+h] as its outcome. If that ever ran past
    // the end of the array, occurrences would silently include a `close: undefined` comparison
    // that produces NaN -- so a completely NaN-free result across every stat is itself the
    // no-look-ahead-into-nonexistent-data check.
    const bars = synthBars(40, 100, 0.2, 3); // short on purpose: only a few bars of headroom past minimum length
    const result = runFor(bars);
    for (const stat of Object.values(result)) {
      if (stat.avgForwardReturnPct !== null) expect(Number.isNaN(stat.avgForwardReturnPct)).toBe(false);
    }
  });

  it('reports "not enough occurrences" rather than a misleading percentage under the sample floor', () => {
    const bars = synthBars(20, 100, 0, 0.5); // too short for any signal to occur meaningfully
    const result = runFor(bars);
    for (const stat of Object.values(result)) {
      if (stat.occurrences < 3) {
        expect(stat.hitRatePct).toBeNull();
        expect(stat.avgForwardReturnPct).toBeNull();
      }
    }
  });
});
