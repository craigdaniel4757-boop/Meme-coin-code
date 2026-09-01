// Trend classification and rule-based chart-pattern detection. Every check here is a named,
// textbook technical-analysis rule (moving-average stack, swing structure, double top/bottom,
// breakout-with-volume, Bollinger squeeze, RSI divergence, Fibonacci retracement) — nothing is
// inferred by a black-box model, so every flag in the UI can be explained in one sentence.

import { lastValid } from './indicators';
import type {
  Bar,
  FibLevel,
  Level,
  MomentumReading,
  PatternFlag,
  SwingPoint,
  TrendDirection,
  TrendReading,
  VolatilityReading,
} from './types';

export function classifyTrend(
  bars: Bar[],
  sma50: (number | null)[],
  sma200: (number | null)[],
  swings: SwingPoint[],
): TrendReading {
  const notes: string[] = [];
  const lastClose = bars[bars.length - 1]!.close;
  const s50 = lastValid(sma50);
  const s200 = lastValid(sma200);

  let smaStack: TrendReading['smaStack'] = 'mixed';
  if (s50 !== null && s200 !== null) {
    if (lastClose > s50 && s50 > s200) smaStack = 'bullish';
    else if (lastClose < s50 && s50 < s200) smaStack = 'bearish';
    else smaStack = 'mixed';
    notes.push(
      s50 > s200
        ? '50-period SMA is above the 200-period SMA (golden-cross alignment).'
        : '50-period SMA is below the 200-period SMA (death-cross alignment).',
    );
  } else if (s50 !== null) {
    smaStack = lastClose > s50 ? 'bullish' : 'bearish';
    notes.push('Not enough history yet for a 200-period SMA — using the 50-period only.');
  } else {
    notes.push('Not enough history for moving-average context on this timeframe.');
  }

  const recentSwings = swings.slice(-8);
  const highs = recentSwings.filter((s) => s.kind === 'high');
  const lows = recentSwings.filter((s) => s.kind === 'low');
  let structure: TrendReading['structure'] = 'mixed';
  if (highs.length >= 2 && lows.length >= 2) {
    const highsRising = isMonotonic(highs.map((h) => h.price), 'up');
    const lowsRising = isMonotonic(lows.map((l) => l.price), 'up');
    const highsFalling = isMonotonic(highs.map((h) => h.price), 'down');
    const lowsFalling = isMonotonic(lows.map((l) => l.price), 'down');
    if (highsRising && lowsRising) {
      structure = 'higher-highs-lows';
      notes.push('Recent swing highs and lows are both rising (higher-highs / higher-lows).');
    } else if (highsFalling && lowsFalling) {
      structure = 'lower-highs-lows';
      notes.push('Recent swing highs and lows are both falling (lower-highs / lower-lows).');
    } else {
      notes.push('Swing structure is choppy — no clean higher-highs or lower-lows sequence.');
    }
  }

  let direction: TrendDirection = 'sideways';
  let strength = 0.3;
  if (smaStack === 'bullish' && structure !== 'lower-highs-lows') {
    direction = 'uptrend';
    strength = structure === 'higher-highs-lows' ? 0.85 : 0.6;
  } else if (smaStack === 'bearish' && structure !== 'higher-highs-lows') {
    direction = 'downtrend';
    strength = structure === 'lower-highs-lows' ? 0.85 : 0.6;
  } else if (structure === 'higher-highs-lows') {
    direction = 'uptrend';
    strength = 0.5;
  } else if (structure === 'lower-highs-lows') {
    direction = 'downtrend';
    strength = 0.5;
  }

  return { direction, strength, smaStack, structure, notes };
}

function isMonotonic(values: number[], dir: 'up' | 'down'): boolean {
  if (values.length < 2) return false;
  for (let i = 1; i < values.length; i++) {
    if (dir === 'up' && values[i]! <= values[i - 1]!) return false;
    if (dir === 'down' && values[i]! >= values[i - 1]!) return false;
  }
  return true;
}

export function detectDoubleTopBottom(swings: SwingPoint[], tolerancePct = 0.02): PatternFlag[] {
  const flags: PatternFlag[] = [];
  const highs = swings.filter((s) => s.kind === 'high').slice(-6);
  const lows = swings.filter((s) => s.kind === 'low').slice(-6);

  for (let i = 1; i < highs.length; i++) {
    const a = highs[i - 1]!;
    const b = highs[i]!;
    if (Math.abs(a.price - b.price) / a.price <= tolerancePct) {
      flags.push({
        id: 'double-top',
        label: 'Possible double top',
        bias: 'bearish',
        confidence: 0.45,
        description: `Two swing highs near ${formatPrice(a.price)} and ${formatPrice(
          b.price,
        )} within ${(tolerancePct * 100).toFixed(1)}% of each other — a classic reversal warning if the level between them breaks down.`,
      });
    }
  }
  for (let i = 1; i < lows.length; i++) {
    const a = lows[i - 1]!;
    const b = lows[i]!;
    if (Math.abs(a.price - b.price) / a.price <= tolerancePct) {
      flags.push({
        id: 'double-bottom',
        label: 'Possible double bottom',
        bias: 'bullish',
        confidence: 0.45,
        description: `Two swing lows near ${formatPrice(a.price)} and ${formatPrice(
          b.price,
        )} within ${(tolerancePct * 100).toFixed(1)}% of each other — a classic reversal setup if the level between them breaks up.`,
      });
    }
  }
  return flags;
}

export function detectBreakout(bars: Bar[], levels: Level[]): PatternFlag[] {
  const flags: PatternFlag[] = [];
  if (bars.length < 3) return flags;
  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2]!;

  const avgVolume =
    bars.slice(-20).reduce((sum, b) => sum + (b.volume ?? 0), 0) / Math.min(20, bars.length);
  const volumeConfirmed = avgVolume > 0 && (last.volume ?? 0) > avgVolume * 1.3;

  for (const level of levels) {
    if (level.kind === 'resistance' && prev.close <= level.price && last.close > level.price) {
      flags.push({
        id: 'breakout-resistance',
        label: 'Breaking above resistance',
        bias: 'bullish',
        confidence: volumeConfirmed ? 0.7 : 0.5,
        description: `Latest close (${formatPrice(last.close)}) pushed above a resistance zone near ${formatPrice(
          level.price,
        )}${volumeConfirmed ? ', confirmed by above-average volume' : ' on unremarkable volume — watch for a retest'}.`,
      });
    }
    if (level.kind === 'support' && prev.close >= level.price && last.close < level.price) {
      flags.push({
        id: 'breakdown-support',
        label: 'Breaking below support',
        bias: 'bearish',
        confidence: volumeConfirmed ? 0.7 : 0.5,
        description: `Latest close (${formatPrice(last.close)}) dropped below a support zone near ${formatPrice(
          level.price,
        )}${volumeConfirmed ? ', confirmed by above-average volume' : ' on unremarkable volume — watch for a retest'}.`,
      });
    }
  }
  return flags;
}

export function volatilityReading(
  atrSeries: (number | null)[],
  bollinger: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] },
  lastClose: number,
): VolatilityReading {
  const notes: string[] = [];
  const atrVal = lastValid(atrSeries);
  const atrPct = atrVal !== null && lastClose > 0 ? (atrVal / lastClose) * 100 : null;

  const widths: number[] = [];
  for (let i = 0; i < bollinger.upper.length; i++) {
    const u = bollinger.upper[i];
    const l = bollinger.lower[i];
    const m = bollinger.middle[i];
    if (u != null && l != null && m != null && m !== 0) widths.push(((u - l) / m) * 100);
  }
  const currentWidth = widths.length > 0 ? widths[widths.length - 1]! : null;
  let squeeze = false;
  if (widths.length >= 20 && currentWidth !== null) {
    const recent = widths.slice(-60);
    const sortedWidths = [...recent].sort((a, b) => a - b);
    const percentileRank =
      sortedWidths.findIndex((w) => w >= currentWidth) / sortedWidths.length;
    squeeze = percentileRank <= 0.15;
    if (squeeze) {
      notes.push(
        'Bollinger Band width is near its lowest in the visible history — volatility is compressed and often precedes a sharp move.',
      );
    }
  }
  if (atrPct !== null) {
    notes.push(`Average True Range is about ${atrPct.toFixed(1)}% of price (14-period).`);
  }

  return { atr: atrVal, atrPct, bollingerWidthPct: currentWidth, squeeze, notes };
}

export function rsiDivergence(
  closes: number[],
  rsiValues: (number | null)[],
  swings: SwingPoint[],
): MomentumReading['rsiDivergence'] {
  const highs = swings.filter((s) => s.kind === 'high').slice(-2);
  const lows = swings.filter((s) => s.kind === 'low').slice(-2);

  if (highs.length === 2) {
    const [a, b] = highs;
    const rsiA = rsiValues[a!.index];
    const rsiB = rsiValues[b!.index];
    if (rsiA !== null && rsiA !== undefined && rsiB !== null && rsiB !== undefined) {
      if (b!.price > a!.price && rsiB < rsiA) return 'bearish';
    }
  }
  if (lows.length === 2) {
    const [a, b] = lows;
    const rsiA = rsiValues[a!.index];
    const rsiB = rsiValues[b!.index];
    if (rsiA !== null && rsiA !== undefined && rsiB !== null && rsiB !== undefined) {
      if (b!.price < a!.price && rsiB > rsiA) return 'bullish';
    }
  }
  void closes;
  return 'none';
}

export function fibonacciLevels(swings: SwingPoint[]): FibLevel[] | null {
  if (swings.length < 2) return null;
  const last = swings.slice(-12);
  const high = last.reduce((m, s) => (s.price > m.price ? s : m));
  const low = last.reduce((m, s) => (s.price < m.price ? s : m));
  if (high.price === low.price) return null;

  const range = high.price - low.price;
  const uptrendMostRecent = high.index > low.index;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return ratios.map((ratio) => ({
    ratio,
    price: uptrendMostRecent ? high.price - range * ratio : low.price + range * ratio,
  }));
}

export function formatPrice(price: number): string {
  return price >= 100 ? price.toFixed(1) : price.toFixed(2);
}
