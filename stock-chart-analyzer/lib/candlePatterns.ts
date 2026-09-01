// Single/multi-candle reversal patterns on real OHLC bars — only checked at the most recent
// bar(s), since that's the actionable edge of the chart. Each is the textbook geometric
// definition (body/wick ratios, relative position), nothing fuzzy or model-guessed.

import type { Bar, PatternFlag } from './types';

function body(b: Bar): number {
  return Math.abs(b.close - b.open);
}
function range(b: Bar): number {
  return b.high - b.low;
}
function upperWick(b: Bar): number {
  return b.high - Math.max(b.open, b.close);
}
function lowerWick(b: Bar): number {
  return Math.min(b.open, b.close) - b.low;
}
function isBullish(b: Bar): boolean {
  return b.close > b.open;
}
function isBearish(b: Bar): boolean {
  return b.close < b.open;
}

function recentTrendDown(bars: Bar[], lookback = 5): boolean {
  const n = bars.length;
  if (n < lookback + 2) return false;
  return bars[n - 2]!.close < bars[n - 2 - lookback]!.close;
}
function recentTrendUp(bars: Bar[], lookback = 5): boolean {
  const n = bars.length;
  if (n < lookback + 2) return false;
  return bars[n - 2]!.close > bars[n - 2 - lookback]!.close;
}

export function detectCandlestickPatterns(bars: Bar[]): PatternFlag[] {
  const flags: PatternFlag[] = [];
  const n = bars.length;
  if (n < 3) return flags;
  const last = bars[n - 1]!;
  const prev = bars[n - 2]!;
  const prev2 = bars[n - 3]!;

  if (
    isBearish(prev) &&
    isBullish(last) &&
    last.open <= prev.close &&
    last.close >= prev.open &&
    body(last) > body(prev)
  ) {
    const trendContext = recentTrendDown(bars);
    flags.push({
      id: 'bullish-engulfing',
      label: 'Bullish engulfing',
      bias: 'bullish',
      confidence: trendContext ? 0.6 : 0.45,
      description: `The latest candle's body fully engulfs the prior (bearish) candle's body${trendContext ? ', following a short-term decline — a classic reversal tell' : ''}.`,
    });
  }
  if (
    isBullish(prev) &&
    isBearish(last) &&
    last.open >= prev.close &&
    last.close <= prev.open &&
    body(last) > body(prev)
  ) {
    const trendContext = recentTrendUp(bars);
    flags.push({
      id: 'bearish-engulfing',
      label: 'Bearish engulfing',
      bias: 'bearish',
      confidence: trendContext ? 0.6 : 0.45,
      description: `The latest candle's body fully engulfs the prior (bullish) candle's body${trendContext ? ', following a short-term advance — a classic reversal tell' : ''}.`,
    });
  }

  const r = range(last);
  if (r > 0) {
    const b = body(last);
    const lw = lowerWick(last);
    const uw = upperWick(last);

    if (lw >= b * 2 && uw <= b * 0.5 && b <= r * 0.4 && recentTrendDown(bars)) {
      flags.push({
        id: 'hammer',
        label: 'Hammer',
        bias: 'bullish',
        confidence: 0.5,
        description: 'A long lower wick with a small body near the top of the range, after a decline — buyers stepped in and pushed price back up intraday.',
      });
    }
    if (uw >= b * 2 && lw <= b * 0.5 && b <= r * 0.4 && recentTrendUp(bars)) {
      flags.push({
        id: 'shooting-star',
        label: 'Shooting star',
        bias: 'bearish',
        confidence: 0.5,
        description: 'A long upper wick with a small body near the bottom of the range, after an advance — sellers stepped in and pushed price back down intraday.',
      });
    }
    if (b <= r * 0.1) {
      flags.push({
        id: 'doji',
        label: 'Doji',
        bias: 'neutral',
        confidence: 0.3,
        description: 'Open and close are nearly identical — indecision between buyers and sellers, often a pause point rather than a clean signal on its own.',
      });
    }
  }

  const firstBearishLong = isBearish(prev2) && body(prev2) > range(prev2) * 0.5;
  const firstBullishLong = isBullish(prev2) && body(prev2) > range(prev2) * 0.5;
  const midSmall = body(prev) < body(prev2) * 0.5;
  const midpoint = (prev2.open + prev2.close) / 2;

  if (firstBearishLong && midSmall && isBullish(last) && last.close > midpoint) {
    flags.push({
      id: 'morning-star',
      label: 'Morning star',
      bias: 'bullish',
      confidence: 0.55,
      description: "A long bearish candle, a small-bodied pause, then a strong bullish candle closing back into the first candle's body — a textbook 3-candle bottoming pattern.",
    });
  }
  if (firstBullishLong && midSmall && isBearish(last) && last.close < midpoint) {
    flags.push({
      id: 'evening-star',
      label: 'Evening star',
      bias: 'bearish',
      confidence: 0.55,
      description: "A long bullish candle, a small-bodied pause, then a strong bearish candle closing back into the first candle's body — a textbook 3-candle topping pattern.",
    });
  }

  return flags;
}
