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
