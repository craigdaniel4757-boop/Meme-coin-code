// Core technical indicator math. Every function is a pure, standard-formula implementation
// (no proprietary tweaks) so results match what any charting platform would show for the
// same inputs. All functions return `null` where there isn't enough history, rather than a
// misleading zero.

import type { Bar } from './types';

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (prev === null) {
      if (i === period - 1) {
        // seed with SMA of the first `period` values
        const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        prev = seed;
        out[i] = seed;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stdev(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    const window = values.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

/** Wilder's RSI (the standard convention used by virtually every charting platform). */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change >= 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i] ?? null;
    const s = emaSlow[i] ?? null;
    return f !== null && s !== null ? f - s : null;
  });

  const firstValid = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (firstValid !== -1) {
    const compact = macdLine.slice(firstValid).map((v) => v as number);
    const compactSignal = ema(compact, signalPeriod);
    compactSignal.forEach((v, i) => {
      signalLine[firstValid + i] = v;
    });
  }

  const histogram: (number | null)[] = macdLine.map((v, i) => {
    const s = signalLine[i] ?? null;
    return v !== null && s !== null ? v - s : null;
  });

  return { macd: macdLine, signal: signalLine, histogram };
}

export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

export function bollingerBands(closes: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(closes, period);
  const sd = stdev(closes, period);
  const upper = middle.map((m, i) => (m !== null && sd[i] !== null ? m + mult * sd[i]! : null));
  const lower = middle.map((m, i) => (m !== null && sd[i] !== null ? m - mult * sd[i]! : null));
  return { upper, middle, lower };
}

/** Wilder's Average True Range. */
export function atr(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < 2) return out;
  const trueRanges: number[] = new Array(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      trueRanges[i] = bars[i]!.high - bars[i]!.low;
      continue;
    }
    const b = bars[i]!;
    const prevClose = bars[i - 1]!.close;
    trueRanges[i] = Math.max(
      b.high - b.low,
      Math.abs(b.high - prevClose),
      Math.abs(b.low - prevClose),
    );
  }
  let sum = 0;
  for (let i = 0; i < period && i < trueRanges.length; i++) sum += trueRanges[i]!;
  if (trueRanges.length < period) return out;
  let prevAtr = sum / period;
  out[period - 1] = prevAtr;
  for (let i = period; i < trueRanges.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trueRanges[i]!) / period;
    out[i] = prevAtr;
  }
  return out;
}

export function lastValid(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

export interface AdxResult {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

/**
 * Wilder's ADX/DMI. ADX measures trend *strength* (0-100, direction-agnostic); +DI/-DI carry
 * the direction. Conventionally: ADX > 25 = trending (trust the directional read more), ADX <
 * 20 = choppy/no trend (directional signals are less reliable). Needs roughly 2x `period` bars
 * before it stabilizes, so short timeframes may not produce a value at all.
 */
export function adx(bars: Bar[], period = 14): AdxResult {
  const n = bars.length;
  const adxOut: (number | null)[] = new Array(n).fill(null);
  const plusDIOut: (number | null)[] = new Array(n).fill(null);
  const minusDIOut: (number | null)[] = new Array(n).fill(null);
  if (n < period * 2 + 1) return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    tr[i] = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothTR += tr[i]!;
    smoothPlusDM += plusDM[i]!;
    smoothMinusDM += minusDM[i]!;
  }

  const dx: (number | null)[] = new Array(n).fill(null);
  const recordDI = (i: number) => {
    const pDI = smoothTR === 0 ? 0 : (100 * smoothPlusDM) / smoothTR;
    const mDI = smoothTR === 0 ? 0 : (100 * smoothMinusDM) / smoothTR;
    plusDIOut[i] = pDI;
    minusDIOut[i] = mDI;
    const sum = pDI + mDI;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / sum;
  };
  recordDI(period);
  for (let i = period + 1; i < n; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i]!;
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i]!;
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i]!;
    recordDI(i);
  }

  let dxSum = 0;
  let count = 0;
  let firstAdxIndex = -1;
  for (let i = period; i < n; i++) {
    const v = dx[i];
    if (v == null) continue;
    dxSum += v;
    count++;
    if (count === period) {
      firstAdxIndex = i;
      break;
    }
  }
  if (firstAdxIndex === -1) return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };

  let prevAdx = dxSum / period;
  adxOut[firstAdxIndex] = prevAdx;
  for (let i = firstAdxIndex + 1; i < n; i++) {
    const v = dx[i];
    if (v == null) continue;
    prevAdx = (prevAdx * (period - 1) + v) / period;
    adxOut[i] = prevAdx;
  }

  return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };
}

export interface StochasticResult {
  k: (number | null)[];
  d: (number | null)[];
}

/** Standard (slow) Stochastic Oscillator: %K from the high/low range, %D = SMA(%K). */
export function stochastic(bars: Bar[], period = 14, dPeriod = 3): StochasticResult {
  const n = bars.length;
  const k: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highest = Math.max(highest, bars[j]!.high);
      lowest = Math.min(lowest, bars[j]!.low);
    }
    const range = highest - lowest;
    k[i] = range === 0 ? 50 : ((bars[i]!.close - lowest) / range) * 100;
  }

  const d: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (k[i] === null) continue;
    const window: number[] = [];
    for (let j = i - dPeriod + 1; j <= i; j++) {
      const v = j >= 0 ? k[j] : null;
      if (v === null || v === undefined) {
        window.length = 0;
        break;
      }
      window.push(v);
    }
    if (window.length === dPeriod) d[i] = window.reduce((a, b) => a + b, 0) / dPeriod;
  }
  return { k, d };
}

/** On-Balance Volume: a running total of volume signed by that bar's close-to-close direction. */
export function obv(bars: Bar[]): number[] {
  const out: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const prevObv = out[i - 1]!;
    const vol = bars[i]!.volume ?? 0;
    if (bars[i]!.close > bars[i - 1]!.close) out[i] = prevObv + vol;
    else if (bars[i]!.close < bars[i - 1]!.close) out[i] = prevObv - vol;
    else out[i] = prevObv;
  }
  return out;
}

/**
 * VWAP anchored at `anchorIndex` (defaults to the start of the fetched window) — the
 * volume-weighted average price from that point forward, a common short-term fair-value
 * reference. Stays null throughout if the data source didn't supply volume.
 */
export function anchoredVwap(bars: Bar[], anchorIndex = 0): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let cumPV = 0;
  let cumVol = 0;
  for (let i = anchorIndex; i < bars.length; i++) {
    const b = bars[i]!;
    const typicalPrice = (b.high + b.low + b.close) / 3;
    const vol = b.volume ?? 0;
    cumPV += typicalPrice * vol;
    cumVol += vol;
    out[i] = cumVol > 0 ? cumPV / cumVol : null;
  }
  return out;
}
