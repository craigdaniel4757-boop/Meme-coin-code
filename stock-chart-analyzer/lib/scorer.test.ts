import { describe, expect, it } from 'vitest';
import { analyzeImageOnly, analyzeSeries } from './scorer';
import type { Bar, Signal } from './types';

const VALID_SIGNALS: Signal[] = ['strong-bullish', 'bullish', 'neutral', 'bearish', 'strong-bearish'];

function synthBars(n: number, start: number, drift: number, noise: number, seed: number): Bar[] {
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
    bars.push({ time: 1700000000 + i * 86400, open, high, low, close, volume: 1_000_000 + rand() * 500_000 });
  }
  return bars;
}

describe('analyzeSeries', () => {
  const scenarios: Array<[string, Bar[]]> = [
    ['strong uptrend', synthBars(220, 100, 0.35, 2.5, 42)],
    ['strong downtrend', synthBars(220, 200, -0.35, 2.5, 7)],
    ['choppy/sideways', synthBars(220, 100, 0, 2.5, 99)],
    ['short series (30 bars)', synthBars(30, 100, 0.1, 3, 5)],
  ];

  for (const [label, bars] of scenarios) {
    it(`stays within documented bounds for a ${label} series`, () => {
      const result = analyzeSeries(bars, 'real-daily');
      expect(result.score).toBeGreaterThanOrEqual(-100);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(5);
      expect(result.confidence).toBeLessThanOrEqual(92);
      expect(VALID_SIGNALS).toContain(result.signal);
      expect(Number.isNaN(result.score)).toBe(false);
      expect(Number.isNaN(result.confidence)).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/NaN/);
    });
  }

  it('produces a signal consistent with its own score thresholds', () => {
    const result = analyzeSeries(synthBars(220, 100, 0.4, 2, 1), 'real-daily');
    if (result.score >= 50) expect(result.signal).toBe('strong-bullish');
    else if (result.score >= 15) expect(result.signal).toBe('bullish');
    else if (result.score > -15) expect(result.signal).toBe('neutral');
    else if (result.score > -50) expect(result.signal).toBe('bearish');
    else expect(result.signal).toBe('strong-bearish');
  });

  it('never produces an empty pattern description or indicator NaN', () => {
    const result = analyzeSeries(synthBars(260, 150, 0.1, 4, 21), 'real-daily');
    for (const p of result.patterns) {
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
    if (result.indicators) {
      expect(Number.isNaN(result.indicators.lastClose)).toBe(false);
    }
  });
});

describe('analyzeImageOnly', () => {
  it('caps confidence well below the real-data ceiling', () => {
    const result = analyzeImageOnly({
      bullishPixelRatio: 0.8,
      slopeDirection: 'up',
      slopeConfidence: 1, // even a maximally confident visual read...
      notes: [],
    });
    expect(result.confidence).toBeLessThanOrEqual(40); // ...must stay under the image-only ceiling
    expect(result.dataQuality).toBe('image-only');
  });

  it('stays within score bounds at the extremes', () => {
    const bullish = analyzeImageOnly({ bullishPixelRatio: 1, slopeDirection: 'up', slopeConfidence: 1, notes: [] });
    const bearish = analyzeImageOnly({ bullishPixelRatio: 0, slopeDirection: 'down', slopeConfidence: 1, notes: [] });
    expect(bullish.score).toBeLessThanOrEqual(100);
    expect(bearish.score).toBeGreaterThanOrEqual(-100);
  });
});
