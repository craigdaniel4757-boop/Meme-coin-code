import { describe, expect, it } from 'vitest';
import { adx, sma } from './indicators';
import { classifyTrend, detectDoubleTopBottom, detectGap, volatilityReading } from './patterns';
import { findSwingPoints } from './swings';
import type { Bar } from './types';

function synthBars(n: number, start: number, drift: number, noise: number, seed = 3): Bar[] {
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

describe('findSwingPoints', () => {
  it('finds a single obvious peak in a small window', () => {
    const closes = [10, 11, 12, 20, 12, 11, 10, 9, 8];
    const bars: Bar[] = closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c }));
    const swings = findSwingPoints(bars, 3);
    const highs = swings.filter((s) => s.kind === 'high');
    expect(highs.length).toBeGreaterThanOrEqual(1);
    expect(highs.some((h) => h.price === 20)).toBe(true);
  });
});

describe('classifyTrend', () => {
  it('reads a clean, strongly rising series as an uptrend', () => {
    const bars = synthBars(220, 100, 0.5, 1);
    const closes = bars.map((b) => b.close);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const swings = findSwingPoints(bars, 3);
    const adxResult = adx(bars, 14);
    const adxLast = adxResult.adx.filter((v): v is number => v !== null).at(-1) ?? null;
    const plusLast = adxResult.plusDI.filter((v): v is number => v !== null).at(-1) ?? null;
    const minusLast = adxResult.minusDI.filter((v): v is number => v !== null).at(-1) ?? null;
    const trend = classifyTrend(bars, sma50, sma200, swings, { adx: adxLast, plusDI: plusLast, minusDI: minusLast });
    expect(trend.direction).toBe('uptrend');
    expect(trend.strength).toBeGreaterThan(0);
  });
});

describe('detectDoubleTopBottom', () => {
  it('never reports more than one top and one bottom, even with many overlapping near-equal swings', () => {
    // A tight range that bounces between ~100 and ~110 many times over -- naively comparing
    // every adjacent swing pair would fire a "double top"/"double bottom" flag repeatedly for
    // what is really the same observation (regression test for that bug).
    const swings = [];
    for (let i = 0; i < 12; i++) {
      swings.push({ index: i * 2, time: i * 2, price: i % 2 === 0 ? 110 : 100, kind: i % 2 === 0 ? ('high' as const) : ('low' as const) });
    }
    const flags = detectDoubleTopBottom(swings, 0.03);
    const tops = flags.filter((f) => f.id === 'double-top');
    const bottoms = flags.filter((f) => f.id === 'double-bottom');
    expect(tops.length).toBeLessThanOrEqual(1);
    expect(bottoms.length).toBeLessThanOrEqual(1);
  });
});

describe('detectGap', () => {
  it('flags a clear gap-up with no range overlap', () => {
    const bars: Bar[] = [
      { time: 0, open: 100, high: 102, low: 99, close: 101 },
      { time: 1, open: 108, high: 110, low: 107, close: 109 }, // opens well above prior high
    ];
    const flags = detectGap(bars, 1);
    expect(flags.some((f) => f.id === 'gap-up')).toBe(true);
  });

  it('does not flag when the new bar overlaps the prior range', () => {
    const bars: Bar[] = [
      { time: 0, open: 100, high: 102, low: 99, close: 101 },
      { time: 1, open: 101, high: 103, low: 100, close: 102 },
    ];
    expect(detectGap(bars, 1)).toHaveLength(0);
  });
});

describe('volatilityReading', () => {
  it('flags a squeeze only when Bollinger sits strictly inside Keltner', () => {
    // Current-bar state is read from the *last* array index, so the meaningful values go there.
    const bollinger = { upper: [null, 102], middle: [null, 100], lower: [null, 98] };
    const keltnerSqueezed = { upper: [null, 105], lower: [null, 95] };
    const keltnerWide = { upper: [null, 101], lower: [null, 99] };
    const atrSeries = [null, 1];

    const squeezed = volatilityReading(atrSeries, bollinger, keltnerSqueezed, 100);
    const notSqueezed = volatilityReading(atrSeries, bollinger, keltnerWide, 100);
    expect(squeezed.squeeze).toBe(true);
    expect(notSqueezed.squeeze).toBe(false);
  });
});
