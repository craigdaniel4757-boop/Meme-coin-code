import { Coin, Features } from '../types';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pctReturn(history: number[], lag: number): number {
  const n = history.length;
  if (n <= lag) return 0;
  const past = history[n - 1 - lag];
  const now = history[n - 1];
  if (past <= 0) return 0;
  return (now - past) / past;
}

function stdDevReturns(history: number[], window: number): number {
  const n = history.length;
  const start = Math.max(1, n - window);
  const rets: number[] = [];
  for (let i = start; i < n; i++) {
    const prev = history[i - 1];
    if (prev > 0) rets.push((history[i] - prev) / prev);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

function rsi(history: number[], period = 14): number {
  const n = history.length;
  if (n <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = n - period; i < n; i++) {
    const diff = history[i] - history[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  const rs = gains / (losses || 1e-9);
  return 100 - 100 / (1 + rs);
}

function sma(history: number[], window: number): number {
  const n = history.length;
  const start = Math.max(0, n - window);
  const slice = history.slice(start);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function volumeZ(volumes: number[], window = 20): number {
  const n = volumes.length;
  const start = Math.max(0, n - window);
  const slice = volumes.slice(start);
  if (slice.length < 3) return 0;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const sd = Math.sqrt(variance) || 1;
  return (volumes[n - 1] - mean) / sd;
}

// All features are scaled roughly into [-1, 1] so the linear policy weights
// stay comparable across features.
export function computeFeatures(coin: Coin, unrealizedPct: number): Features {
  const mom3 = clamp(pctReturn(coin.history, 3), -1, 1);
  const mom10 = clamp(pctReturn(coin.history, 10), -1, 1);
  const mom30 = clamp(pctReturn(coin.history, 30), -1, 1);
  const volatility = clamp(stdDevReturns(coin.history, 20) * 10, 0, 1);
  const rsiVal = (rsi(coin.history) - 50) / 50;
  const smaVal = sma(coin.history, 20);
  const smaDist = clamp(smaVal > 0 ? (coin.price - smaVal) / smaVal : 0, -1, 1);
  const volZ = clamp(volumeZ(coin.volumeHistory) / 3, -1, 1);
  const unrealized = clamp(unrealizedPct, -1, 1);

  return {
    mom3,
    mom10,
    mom30,
    volatility,
    rsi: rsiVal,
    smaDist,
    volumeZ: volZ,
    unrealized,
    bias: 1,
  };
}
