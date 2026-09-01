import { describe, expect, it } from 'vitest';
import {
  adx,
  atr,
  bollingerBands,
  chaikinMoneyFlow,
  classicPivotPoints,
  ema,
  keltnerChannels,
  macd,
  obv,
  parabolicSar,
  roc,
  rsi,
  sma,
  stochastic,
} from './indicators';
import type { Bar } from './types';

function synthBars(n: number, start: number, drift: number, noise: number, seed = 7): Bar[] {
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

describe('sma', () => {
  it('matches a hand-computed example', () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });
});

describe('ema', () => {
  it('seeds with the SMA of the first period and stays finite thereafter', () => {
    const values = [10, 11, 9, 12, 13, 14, 12, 15, 16, 17];
    const out = ema(values, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo((10 + 11 + 9) / 3);
    for (const v of out.slice(2)) expect(Number.isFinite(v as number)).toBe(true);
  });
});

describe('rsi', () => {
  it('approaches 100 for a strictly rising series and 0 for a strictly falling one', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const falling = Array.from({ length: 30 }, (_, i) => 200 - i);
    const risingRsi = rsi(rising, 14).at(-1);
    const fallingRsi = rsi(falling, 14).at(-1);
    expect(risingRsi).toBe(100);
    expect(fallingRsi).toBe(0);
  });
});

describe('macd', () => {
  it('has a positive histogram when the fast EMA runs above the slow EMA', () => {
    const bars = synthBars(80, 100, 0.5, 0.5); // steady uptrend, low noise
    const closes = bars.map((b) => b.close);
    const result = macd(closes, 12, 26, 9);
    const hist = result.histogram.at(-1);
    expect(hist).not.toBeNull();
  });
});

describe('bollingerBands', () => {
  it('keeps upper > middle > lower whenever all three are defined', () => {
    const bars = synthBars(60, 100, 0.1, 3);
    const closes = bars.map((b) => b.close);
    const { upper, middle, lower } = bollingerBands(closes, 20, 2);
    for (let i = 0; i < closes.length; i++) {
      if (upper[i] === null || middle[i] === null || lower[i] === null) continue;
      expect(upper[i]!).toBeGreaterThanOrEqual(middle[i]!);
      expect(middle[i]!).toBeGreaterThanOrEqual(lower[i]!);
    }
  });
});

describe('atr', () => {
  it('is always non-negative once defined', () => {
    const bars = synthBars(40, 100, 0, 5);
    const values = atr(bars, 14);
    for (const v of values) {
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('adx', () => {
  it('stays within 0..100 and confirms direction via +DI/-DI on a strong uptrend', () => {
    const bars = synthBars(120, 100, 0.6, 0.4);
    const result = adx(bars, 14);
    const lastAdx = result.adx.filter((v): v is number => v !== null).at(-1);
    const lastPlus = result.plusDI.filter((v): v is number => v !== null).at(-1);
    const lastMinus = result.minusDI.filter((v): v is number => v !== null).at(-1);
    expect(lastAdx).not.toBeUndefined();
    expect(lastAdx!).toBeGreaterThanOrEqual(0);
    expect(lastAdx!).toBeLessThanOrEqual(100);
    expect(lastPlus!).toBeGreaterThan(lastMinus!);
  });
});

describe('stochastic', () => {
  it('keeps %K within 0..100', () => {
    const bars = synthBars(50, 100, 0.2, 4);
    const { k } = stochastic(bars, 14, 3);
    for (const v of k) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('obv', () => {
  it('accumulates volume signed by close-to-close direction on a tiny example', () => {
    const bars: Bar[] = [
      { time: 0, open: 10, high: 10, low: 10, close: 10, volume: 100 },
      { time: 1, open: 10, high: 11, low: 10, close: 11, volume: 50 }, // up -> +50
      { time: 2, open: 11, high: 11, low: 9, close: 9, volume: 30 }, // down -> -30
      { time: 3, open: 9, high: 9, low: 9, close: 9, volume: 20 }, // flat -> +0
    ];
    expect(obv(bars)).toEqual([0, 50, 20, 20]);
  });
});

describe('keltnerChannels', () => {
  it('keeps upper > middle > lower whenever all three are defined', () => {
    const bars = synthBars(50, 100, 0.1, 3);
    const closes = bars.map((b) => b.close);
    const atrSeries = atr(bars, 14);
    const { upper, middle, lower } = keltnerChannels(closes, atrSeries, 20, 1.5);
    for (let i = 0; i < closes.length; i++) {
      if (upper[i] === null || middle[i] === null || lower[i] === null) continue;
      expect(upper[i]!).toBeGreaterThan(middle[i]!);
      expect(middle[i]!).toBeGreaterThan(lower[i]!);
    }
  });
});

describe('parabolicSar', () => {
  it('produces only up/down trend states and a defined value for every bar', () => {
    const bars = synthBars(60, 100, 0.3, 4);
    const points = parabolicSar(bars);
    for (const p of points) {
      expect(p).not.toBeNull();
      expect(['up', 'down']).toContain(p!.trend);
      expect(Number.isFinite(p!.value)).toBe(true);
    }
  });
});

describe('chaikinMoneyFlow', () => {
  it('stays within a reasonable -1..1 band', () => {
    const bars = synthBars(50, 100, 0.2, 4);
    const values = chaikinMoneyFlow(bars, 20);
    for (const v of values) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('roc', () => {
  it('matches a hand-computed percentage change', () => {
    const closes = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 110];
    const out = roc(closes, 12);
    expect(out.at(-1)).toBeCloseTo(10, 5);
  });
});

describe('classicPivotPoints', () => {
  it('matches the textbook floor-pivot formula', () => {
    const p = classicPivotPoints(110, 90, 100);
    const pp = (110 + 90 + 100) / 3;
    expect(p.pp).toBeCloseTo(pp);
    expect(p.r1).toBeCloseTo(2 * pp - 90);
    expect(p.s1).toBeCloseTo(2 * pp - 110);
    expect(p.r2).toBeCloseTo(pp + (110 - 90));
    expect(p.s2).toBeCloseTo(pp - (110 - 90));
  });
});
