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
  PeriodHighLow,
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
  adxData: { adx: number | null; plusDI: number | null; minusDI: number | null } | null = null,
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

  const adxVal = adxData?.adx ?? null;
  const adxState: TrendReading['adxState'] = adxVal === null ? 'unknown' : adxVal >= 25 ? 'trending' : 'choppy';
  if (adxVal !== null) {
    const diAgrees =
      direction === 'uptrend'
        ? (adxData?.plusDI ?? 0) > (adxData?.minusDI ?? 0)
        : direction === 'downtrend'
          ? (adxData?.minusDI ?? 0) > (adxData?.plusDI ?? 0)
          : false;
    if (adxState === 'trending' && diAgrees) {
      strength = Math.min(1, strength + 0.1);
      notes.push(`ADX(14) is ${adxVal.toFixed(1)} and directional movement agrees — this reads as a genuinely trending market, not just noise.`);
    } else if (adxState === 'choppy') {
      strength = Math.max(0.15, strength - 0.15);
      notes.push(`ADX(14) is ${adxVal.toFixed(1)}, below the conventional 25 trending threshold — momentum behind this trend read is weak.`);
    }
  }

  return { direction, strength, smaStack, structure, adx: adxVal, adxState, notes };
}

function isMonotonic(values: number[], dir: 'up' | 'down'): boolean {
  if (values.length < 2) return false;
  for (let i = 1; i < values.length; i++) {
    if (dir === 'up' && values[i]! <= values[i - 1]!) return false;
    if (dir === 'down' && values[i]! >= values[i - 1]!) return false;
  }
  return true;
}

/**
 * Double top / double bottom, reporting only the single most recent qualifying pair for each
 * (not every overlapping pair in the lookback window) — a tight consolidation can easily have
 * several swing highs within tolerance of each other, and flagging each pair separately would
 * just be the same observation repeated, not several distinct signals.
 */
export function detectDoubleTopBottom(swings: SwingPoint[], tolerancePct = 0.02): PatternFlag[] {
  const flags: PatternFlag[] = [];
  const highs = swings.filter((s) => s.kind === 'high').slice(-6);
  const lows = swings.filter((s) => s.kind === 'low').slice(-6);

  for (let i = highs.length - 1; i >= 1; i--) {
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
      break;
    }
  }
  for (let i = lows.length - 1; i >= 1; i--) {
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
      break;
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

/**
 * Volatility context, including the real "TTM Squeeze": Bollinger Bands pinched *inside* the
 * Keltner Channels (not just a low band-width percentile) — the well-known John Carter
 * definition, with a distinct `squeezeJustFired` flag for the bar the bands expand back outside
 * the channels, which is the more actionable moment than the squeeze itself.
 */
export function volatilityReading(
  atrSeries: (number | null)[],
  bollinger: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] },
  keltner: { upper: (number | null)[]; lower: (number | null)[] },
  lastClose: number,
): VolatilityReading {
  const notes: string[] = [];
  const atrVal = lastValid(atrSeries);
  const atrPct = atrVal !== null && lastClose > 0 ? (atrVal / lastClose) * 100 : null;

  const widths: number[] = [];
  const n = bollinger.upper.length;
  const squeezeOn: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const u = bollinger.upper[i];
    const l = bollinger.lower[i];
    const m = bollinger.middle[i];
    if (u != null && l != null && m != null && m !== 0) widths.push(((u - l) / m) * 100);

    const ku = keltner.upper[i];
    const kl = keltner.lower[i];
    if (u != null && l != null && ku != null && kl != null) {
      squeezeOn[i] = u < ku && l > kl;
    }
  }
  const currentWidth = widths.length > 0 ? widths[widths.length - 1]! : null;
  const squeeze = squeezeOn[n - 1] ?? false;
  const squeezeJustFired = n >= 2 ? squeezeOn[n - 2] === true && squeezeOn[n - 1] === false : false;

  if (squeeze) {
    notes.push(
      'Bollinger Bands are pinched inside the Keltner Channels ("TTM squeeze") — volatility is compressed and often precedes a sharp expansion move.',
    );
  } else if (squeezeJustFired) {
    notes.push(
      'A volatility squeeze just released (Bollinger Bands expanded back outside the Keltner Channels) — often marks the start of the expansion move.',
    );
  }
  if (atrPct !== null) {
    notes.push(`Average True Range is about ${atrPct.toFixed(1)}% of price (14-period).`);
  }

  return { atr: atrVal, atrPct, bollingerWidthPct: currentWidth, squeeze, squeezeJustFired, notes };
}

/** Session gaps (open vs. prior close with no range overlap) at the most recent bar. Daily-bar
 * concept only — meaningless between intraday bars within the same session. */
export function detectGap(bars: Bar[], thresholdPct = 1): PatternFlag[] {
  const flags: PatternFlag[] = [];
  const n = bars.length;
  if (n < 2) return flags;
  const last = bars[n - 1]!;
  const prev = bars[n - 2]!;
  if (prev.close <= 0) return flags;

  if (last.open > prev.high) {
    const gapPct = ((last.open - prev.close) / prev.close) * 100;
    if (gapPct >= thresholdPct) {
      flags.push({
        id: 'gap-up',
        label: 'Gap up',
        bias: 'bullish',
        confidence: 0.4,
        description: `Opened ${gapPct.toFixed(1)}% above the prior close with no overlap — an unfilled gap can act as support on a pullback, or get filled if buying doesn't follow through.`,
      });
    }
  } else if (last.open < prev.low) {
    const gapPct = ((prev.close - last.open) / prev.close) * 100;
    if (gapPct >= thresholdPct) {
      flags.push({
        id: 'gap-down',
        label: 'Gap down',
        bias: 'bearish',
        confidence: 0.4,
        description: `Opened ${gapPct.toFixed(1)}% below the prior close with no overlap — an unfilled gap can act as resistance on a bounce, or get filled if selling doesn't follow through.`,
      });
    }
  }
  return flags;
}

type DivergenceResult = 'bullish' | 'bearish' | 'none';

/**
 * Generic price/oscillator divergence check shared by RSI, MACD, and OBV: a swing that price
 * confirms (a fresh high or low) but the indicator doesn't confirm is a classic early tell
 * that the move's momentum is weaker than the price action alone suggests.
 */
function detectDivergence(values: (number | null | undefined)[], swings: SwingPoint[]): DivergenceResult {
  const highs = swings.filter((s) => s.kind === 'high').slice(-2);
  const lows = swings.filter((s) => s.kind === 'low').slice(-2);

  if (highs.length === 2) {
    const [a, b] = highs;
    const vA = values[a!.index];
    const vB = values[b!.index];
    if (vA !== null && vA !== undefined && vB !== null && vB !== undefined) {
      if (b!.price > a!.price && vB < vA) return 'bearish';
    }
  }
  if (lows.length === 2) {
    const [a, b] = lows;
    const vA = values[a!.index];
    const vB = values[b!.index];
    if (vA !== null && vA !== undefined && vB !== null && vB !== undefined) {
      if (b!.price < a!.price && vB > vA) return 'bullish';
    }
  }
  return 'none';
}

export function rsiDivergence(rsiValues: (number | null)[], swings: SwingPoint[]): MomentumReading['rsiDivergence'] {
  return detectDivergence(rsiValues, swings);
}

/** Same idea as rsiDivergence but off the raw MACD line — a second, independent confirmation. */
export function macdDivergence(macdLine: (number | null)[], swings: SwingPoint[]): DivergenceResult {
  return detectDivergence(macdLine, swings);
}

/** Same idea again but off On-Balance Volume — catches moves where volume isn't confirming price. */
export function obvDivergence(obvValues: number[], swings: SwingPoint[]): DivergenceResult {
  return detectDivergence(obvValues, swings);
}

function linRegSlope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let denom = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    denom += (p.x - meanX) ** 2;
  }
  return denom === 0 ? 0 : num / denom;
}

/** Ascending/descending/symmetrical triangle via linear-regression slope of recent swing highs vs lows. */
export function detectTriangle(swings: SwingPoint[], lastClose: number): PatternFlag[] {
  const flags: PatternFlag[] = [];
  const highs = swings.filter((s) => s.kind === 'high').slice(-5);
  const lows = swings.filter((s) => s.kind === 'low').slice(-5);
  if (highs.length < 3 || lows.length < 3 || lastClose <= 0) return flags;

  const highSlope = linRegSlope(highs.map((s) => ({ x: s.index, y: s.price })));
  const lowSlope = linRegSlope(lows.map((s) => ({ x: s.index, y: s.price })));
  const flatThresh = lastClose * 0.0015;

  const highFlat = Math.abs(highSlope) < flatThresh;
  const lowFlat = Math.abs(lowSlope) < flatThresh;
  const highFalling = highSlope < -flatThresh;
  const lowRising = lowSlope > flatThresh;

  if (highFlat && lowRising) {
    flags.push({
      id: 'ascending-triangle',
      label: 'Ascending triangle',
      bias: 'bullish',
      confidence: 0.5,
      description: 'Swing highs are flattening out while swing lows keep rising — a compressing range that often resolves with an upside breakout.',
    });
  } else if (highFalling && lowFlat) {
    flags.push({
      id: 'descending-triangle',
      label: 'Descending triangle',
      bias: 'bearish',
      confidence: 0.5,
      description: 'Swing lows are flattening out while swing highs keep falling — a compressing range that often resolves with a downside breakdown.',
    });
  } else if (highFalling && lowRising) {
    flags.push({
      id: 'symmetrical-triangle',
      label: 'Symmetrical triangle',
      bias: 'neutral',
      confidence: 0.4,
      description: 'Swing highs and lows are converging toward each other — a compressing range with an unconfirmed breakout direction; watch which side it breaks.',
    });
  }
  return flags;
}

/** Head & shoulders (and inverse) from the three most recent swing highs / lows. */
export function detectHeadAndShoulders(swings: SwingPoint[]): PatternFlag[] {
  const flags: PatternFlag[] = [];

  const highs = swings.filter((s) => s.kind === 'high').slice(-3);
  if (highs.length === 3) {
    const [left, head, right] = highs as [SwingPoint, SwingPoint, SwingPoint];
    const shoulderAvg = (left.price + right.price) / 2;
    const shoulderDiff = shoulderAvg > 0 ? Math.abs(left.price - right.price) / shoulderAvg : 1;
    if (head.price > left.price && head.price > right.price && shoulderDiff < 0.04) {
      flags.push({
        id: 'head-and-shoulders',
        label: 'Possible head & shoulders',
        bias: 'bearish',
        confidence: 0.45,
        description: `Three swing highs with the middle one clearly the tallest and the two shoulders within ${(shoulderDiff * 100).toFixed(1)}% of each other — a classic topping pattern if the neckline (the swing lows between them) breaks.`,
      });
    }
  }

  const lows = swings.filter((s) => s.kind === 'low').slice(-3);
  if (lows.length === 3) {
    const [left, head, right] = lows as [SwingPoint, SwingPoint, SwingPoint];
    const shoulderAvg = (left.price + right.price) / 2;
    const shoulderDiff = shoulderAvg > 0 ? Math.abs(left.price - right.price) / shoulderAvg : 1;
    if (head.price < left.price && head.price < right.price && shoulderDiff < 0.04) {
      flags.push({
        id: 'inverse-head-and-shoulders',
        label: 'Possible inverse head & shoulders',
        bias: 'bullish',
        confidence: 0.45,
        description: `Three swing lows with the middle one clearly the deepest and the two shoulders within ${(shoulderDiff * 100).toFixed(1)}% of each other — a classic bottoming pattern if the neckline (the swing highs between them) breaks.`,
      });
    }
  }
  return flags;
}

/** Bull/bear flag: a sharp directional "pole" followed by a tight sideways consolidation. */
export function detectFlag(bars: Bar[]): PatternFlag[] {
  const flags: PatternFlag[] = [];
  const n = bars.length;
  const poleWindow = 10;
  const flagWindow = 6;
  if (n < poleWindow + flagWindow + 2) return flags;

  const poleStart = bars[n - poleWindow - flagWindow]!.close;
  const poleEnd = bars[n - flagWindow]!.close;
  if (poleStart <= 0) return flags;
  const poleChangePct = (poleEnd - poleStart) / poleStart;

  const flagCloses = bars.slice(n - flagWindow).map((b) => b.close);
  const flagHigh = Math.max(...flagCloses);
  const flagLow = Math.min(...flagCloses);
  const flagRangePct = poleEnd > 0 ? (flagHigh - flagLow) / poleEnd : 1;

  if (Math.abs(poleChangePct) >= 0.06 && flagRangePct <= Math.abs(poleChangePct) * 0.45) {
    const bullish = poleChangePct > 0;
    flags.push({
      id: bullish ? 'bull-flag' : 'bear-flag',
      label: bullish ? 'Bull flag' : 'Bear flag',
      bias: bullish ? 'bullish' : 'bearish',
      confidence: 0.45,
      description: `A sharp ${bullish ? 'advance' : 'decline'} (${(poleChangePct * 100).toFixed(1)}%) followed by a tight sideways consolidation — a classic continuation setup if price breaks ${bullish ? 'up' : 'down'} out of the range.`,
    });
  }
  return flags;
}

/** Where the latest close sits relative to the high/low of the entire fetched window. */
export function periodHighLowContext(bars: Bar[]): PeriodHighLow {
  const periodHigh = Math.max(...bars.map((b) => b.high));
  const periodLow = Math.min(...bars.map((b) => b.low));
  const lastClose = bars[bars.length - 1]!.close;
  const pctFromHigh = periodHigh > 0 ? ((lastClose - periodHigh) / periodHigh) * 100 : 0;
  const pctFromLow = periodLow > 0 ? ((lastClose - periodLow) / periodLow) * 100 : 0;
  return {
    periodHigh,
    periodLow,
    pctFromHigh,
    pctFromLow,
    nearHigh: pctFromHigh >= -3,
    nearLow: pctFromLow <= 3,
  };
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
