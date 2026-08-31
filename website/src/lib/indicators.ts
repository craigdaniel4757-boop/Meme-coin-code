import { Coin, Features } from '../types';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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

// Momentum (chg5m/chg1h/chg6h) and buy/sell pressure come straight from
// DexScreener's own windowed stats -- real, exchange-reported numbers.
// Volatility, RSI, and distance-from-average are computed from the price
// samples this browser session has actually observed (one per poll), so
// they start neutral and sharpen as more polls come in.
export function computeFeatures(coin: Coin, unrealizedPct: number): Features {
  const volatility = clamp(stdDevReturns(coin.history, 20) * 10, 0, 1);
  const rsiVal = (rsi(coin.history) - 50) / 50;
  const smaVal = sma(coin.history, 20);
  const smaDist = clamp(smaVal > 0 ? (coin.price - smaVal) / smaVal : 0, -1, 1);

  const totalTxns1h = coin.buys1h + coin.sells1h;
  const buyPressure = totalTxns1h > 0 ? clamp((coin.buys1h - coin.sells1h) / totalTxns1h, -1, 1) : 0;

  return {
    chg5m: clamp(coin.priceChange.m5 / 100, -1, 1),
    chg1h: clamp(coin.priceChange.h1 / 100, -1, 1),
    chg6h: clamp(coin.priceChange.h6 / 100, -1, 1),
    volatility,
    rsi: rsiVal,
    smaDist,
    buyPressure,
    unrealized: clamp(unrealizedPct, -1, 1),
    bias: 1,
  };
}
