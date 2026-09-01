// Orchestrates the whole rule-based read: runs every indicator/pattern function, then combines
// the results into one directional score and an honest confidence number.
//
// Design principle: confidence is capped well short of 100 on purpose (see CONFIDENCE_CEILING).
// No amount of free (or paid) data makes short-term price direction certain, and a tool that
// implies otherwise is less trustworthy, not more. Every weight below is a plain constant you
// can read and second-guess — nothing here is a trained/opaque model.

import { atr, bollingerBands, ema, lastValid, macd, rsi, sma } from './indicators';
import { classifyTrend, detectBreakout, detectDoubleTopBottom, fibonacciLevels, rsiDivergence, volatilityReading } from './patterns';
import { clusterLevels, findSwingPoints } from './swings';
import type {
  AnalysisResult,
  Bar,
  DataQuality,
  ImageHeuristics,
  IndicatorSnapshot,
  MomentumReading,
  PatternFlag,
  Signal,
} from './types';

const CONFIDENCE_FLOOR = 5;
const CONFIDENCE_CEILING = 92;
const MIN_BARS_FOR_FULL_ANALYSIS = 30;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function detectMacdCross(
  macdLine: (number | null)[],
  signalLine: (number | null)[],
): MomentumReading['macdCross'] {
  const diffs: number[] = [];
  const start = Math.max(0, macdLine.length - 4);
  for (let i = start; i < macdLine.length; i++) {
    const m = macdLine[i];
    const s = signalLine[i];
    if (m == null || s == null) continue;
    diffs.push(m - s);
  }
  if (diffs.length < 2) return 'unknown';
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i - 1]! <= 0 && diffs[i]! > 0) return 'bullish-cross';
    if (diffs[i - 1]! >= 0 && diffs[i]! < 0) return 'bearish-cross';
  }
  return 'none';
}

export function analyzeSeries(bars: Bar[], quality: DataQuality): AnalysisResult {
  const closes = bars.map((b) => b.close);
  const lastClose = closes[closes.length - 1]!;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsiSeries = rsi(closes, 14);
  const macdResult = macd(closes, 12, 26, 9);
  const bb = bollingerBands(closes, 20, 2);
  const atrSeries = atr(bars, 14);

  const indicators: IndicatorSnapshot = {
    lastClose,
    sma20: lastValid(sma20),
    sma50: lastValid(sma50),
    sma200: lastValid(sma200),
    ema12: lastValid(ema12),
    ema26: lastValid(ema26),
    rsi14: lastValid(rsiSeries),
    macd:
      lastValid(macdResult.macd) !== null && lastValid(macdResult.signal) !== null
        ? {
            macd: lastValid(macdResult.macd)!,
            signal: lastValid(macdResult.signal)!,
            histogram: lastValid(macdResult.histogram) ?? 0,
          }
        : null,
    bollinger:
      lastValid(bb.upper) !== null
        ? { upper: lastValid(bb.upper)!, middle: lastValid(bb.middle)!, lower: lastValid(bb.lower)! }
        : null,
    atr14: lastValid(atrSeries),
  };

  const swingWindow = bars.length > 120 ? 4 : bars.length > 40 ? 3 : 2;
  const swings = findSwingPoints(bars, swingWindow);
  const levels = clusterLevels(swings, lastClose, bars.length);
  const trend = classifyTrend(bars, sma50, sma200, swings);
  const divergence = rsiDivergence(closes, rsiSeries, swings);
  const macdCross = detectMacdCross(macdResult.macd, macdResult.signal);

  const rsiLast = indicators.rsi14;
  const rsiState: MomentumReading['rsiState'] =
    rsiLast === null ? 'unknown' : rsiLast >= 70 ? 'overbought' : rsiLast <= 30 ? 'oversold' : 'neutral';

  const momentumNotes: string[] = [];
  if (rsiLast !== null) {
    momentumNotes.push(`RSI(14) is at ${rsiLast.toFixed(1)}${rsiState !== 'neutral' ? ` — ${rsiState}` : ''}.`);
  }
  if (macdCross === 'bullish-cross') momentumNotes.push('MACD line just crossed above its signal line.');
  if (macdCross === 'bearish-cross') momentumNotes.push('MACD line just crossed below its signal line.');
  if (divergence === 'bullish') momentumNotes.push('Bullish RSI divergence: price made a lower low while RSI made a higher low.');
  if (divergence === 'bearish') momentumNotes.push('Bearish RSI divergence: price made a higher high while RSI made a lower high.');

  const momentum: MomentumReading = {
    rsi: rsiLast,
    rsiState,
    macdHistogram: indicators.macd?.histogram ?? null,
    macdCross,
    rsiDivergence: divergence,
    notes: momentumNotes,
  };

  const volatility = volatilityReading(atrSeries, bb, lastClose);

  const patterns: PatternFlag[] = [
    ...detectDoubleTopBottom(swings),
    ...detectBreakout(bars, levels),
  ];
  if (volatility.squeeze) {
    patterns.push({
      id: 'bollinger-squeeze',
      label: 'Bollinger Band squeeze',
      bias: 'neutral',
      confidence: 0.5,
      description: 'Volatility is compressed to recent lows — often precedes an expansion move, direction unconfirmed until price breaks a band.',
    });
  }
  if (divergence !== 'none') {
    patterns.push({
      id: `rsi-divergence-${divergence}`,
      label: `${divergence === 'bullish' ? 'Bullish' : 'Bearish'} RSI divergence`,
      bias: divergence,
      confidence: 0.5,
      description:
        divergence === 'bullish'
          ? 'Price and momentum are disagreeing at the lows — a classic early-reversal tell, not a confirmed signal on its own.'
          : 'Price and momentum are disagreeing at the highs — a classic early-reversal tell, not a confirmed signal on its own.',
    });
  }
  if (macdCross !== 'none' && macdCross !== 'unknown') {
    patterns.push({
      id: `macd-${macdCross}`,
      label: macdCross === 'bullish-cross' ? 'MACD bullish crossover' : 'MACD bearish crossover',
      bias: macdCross === 'bullish-cross' ? 'bullish' : 'bearish',
      confidence: 0.55,
      description:
        macdCross === 'bullish-cross'
          ? 'Momentum just turned up on the MACD/signal-line crossover.'
          : 'Momentum just turned down on the MACD/signal-line crossover.',
    });
  }

  const fib = fibonacciLevels(swings);

  // --- Score assembly -------------------------------------------------
  const trendComponent =
    trend.direction === 'uptrend' ? trend.strength : trend.direction === 'downtrend' ? -trend.strength : 0;

  const rsiComponent = rsiLast === null ? 0 : clamp((rsiLast - 50) / 50, -1, 1);

  let macdComponent = 0;
  if (indicators.macd) {
    const histSeries = macdResult.histogram.filter((v): v is number => v !== null).slice(-20);
    const refScale = histSeries.length
      ? Math.max(
          histSeries.reduce((a, b) => a + Math.abs(b), 0) / histSeries.length,
          Math.abs(lastClose) * 0.0005,
        )
      : Math.abs(lastClose) * 0.0005 || 1;
    macdComponent = clamp(indicators.macd.histogram / (refScale * 2), -1, 1);
  }

  const patternsComponent =
    patterns.length > 0
      ? clamp(
          patterns.reduce((sum, p) => sum + (p.bias === 'bullish' ? 1 : p.bias === 'bearish' ? -1 : 0) * p.confidence, 0) /
            Math.max(2, patterns.length),
          -1,
          1,
        )
      : 0;

  const WEIGHTS = { trend: 40, rsi: 15, macd: 20, patterns: 25 };
  const rawScore =
    trendComponent * WEIGHTS.trend +
    rsiComponent * WEIGHTS.rsi +
    macdComponent * WEIGHTS.macd +
    patternsComponent * WEIGHTS.patterns;
  const score = clamp(Math.round(rawScore), -100, 100);

  let signal: Signal;
  if (score >= 50) signal = 'strong-bullish';
  else if (score >= 15) signal = 'bullish';
  else if (score > -15) signal = 'neutral';
  else if (score > -50) signal = 'bearish';
  else signal = 'strong-bearish';

  // --- Confidence assembly ---------------------------------------------
  const qualityBase = quality === 'image-only' ? 28 : quality === 'real-intraday' ? 58 : 62;
  const sampleAdequacy = clamp(bars.length / MIN_BARS_FOR_FULL_ANALYSIS, 0, 1) * 18;

  const componentSigns = [trendComponent, rsiComponent, macdComponent, patternsComponent].filter(
    (c) => Math.abs(c) > 0.05,
  );
  const agreeing = componentSigns.filter((c) => Math.sign(c) === Math.sign(rawScore || 1)).length;
  const agreementBonus = componentSigns.length > 0 ? (agreeing / componentSigns.length) * 14 : 0;

  const squeezePenalty = volatility.squeeze ? -6 : 0;

  const confidence = clamp(
    Math.round(qualityBase + sampleAdequacy + agreementBonus + squeezePenalty),
    CONFIDENCE_FLOOR,
    CONFIDENCE_CEILING,
  );

  return {
    signal,
    score,
    confidence,
    dataQuality: quality,
    sampleSize: bars.length,
    trend,
    momentum,
    volatility,
    levels,
    fib,
    patterns,
    indicators,
  };
}

export function analyzeImageOnly(heuristics: ImageHeuristics): AnalysisResult {
  const trendComponent = heuristics.slopeDirection === 'up' ? heuristics.slopeConfidence : heuristics.slopeDirection === 'down' ? -heuristics.slopeConfidence : 0;
  const pixelComponent = clamp((heuristics.bullishPixelRatio - 0.5) * 2, -1, 1);
  const rawScore = trendComponent * 65 + pixelComponent * 35;
  const score = clamp(Math.round(rawScore), -100, 100);

  let signal: Signal;
  if (score >= 50) signal = 'strong-bullish';
  else if (score >= 15) signal = 'bullish';
  else if (score > -15) signal = 'neutral';
  else if (score > -50) signal = 'bearish';
  else signal = 'strong-bearish';

  const confidence = clamp(
    Math.round(18 + heuristics.slopeConfidence * 14),
    CONFIDENCE_FLOOR,
    40, // image-only reads are capped well below the real-data ceiling — always the weaker case
  );

  return {
    signal,
    score,
    confidence,
    dataQuality: 'image-only',
    sampleSize: 0,
    trend: {
      direction: heuristics.slopeDirection === 'up' ? 'uptrend' : heuristics.slopeDirection === 'down' ? 'downtrend' : 'sideways',
      strength: heuristics.slopeConfidence,
      smaStack: 'mixed',
      structure: 'mixed',
      notes: heuristics.notes,
    },
    momentum: {
      rsi: null,
      rsiState: 'unknown',
      macdHistogram: null,
      macdCross: 'unknown',
      rsiDivergence: 'none',
      notes: [],
    },
    volatility: { atr: null, atrPct: null, bollingerWidthPct: null, squeeze: false, notes: [] },
    levels: [],
    fib: null,
    patterns: [],
    indicators: null,
    imageOnly: heuristics,
  };
}
