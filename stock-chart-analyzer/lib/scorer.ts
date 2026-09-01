// Orchestrates the whole rule-based read: runs every indicator/pattern function, then combines
// the results into one directional score and an honest confidence number.
//
// Design principle: confidence is capped well short of 100 on purpose (see CONFIDENCE_CEILING).
// No amount of free (or paid) data makes short-term price direction certain, and a tool that
// implies otherwise is less trustworthy, not more. Every weight below is a plain constant you
// can read and second-guess — nothing here is a trained/opaque model. The historical backtest
// (lib/backtest.ts) is deliberately *not* one of those weights — it's context to weigh, not a
// vote, so the score can't quietly become self-referential.

import { adx, atr, bollingerBands, ema, lastValid, macd, obv, rsi, sma, stochastic, anchoredVwap } from './indicators';
import { backtestRsiMeanReversion } from './backtest';
import { detectCandlestickPatterns } from './candlePatterns';
import {
  classifyTrend,
  detectBreakout,
  detectDoubleTopBottom,
  detectFlag,
  detectHeadAndShoulders,
  detectTriangle,
  fibonacciLevels,
  macdDivergence as computeMacdDivergence,
  obvDivergence as computeObvDivergence,
  periodHighLowContext,
  rsiDivergence as computeRsiDivergence,
  volatilityReading,
} from './patterns';
import { clusterLevels, findSwingPoints } from './swings';
import type {
  AnalysisResult,
  Bar,
  DataQuality,
  ImageHeuristics,
  IndicatorSnapshot,
  MomentumReading,
  PatternFlag,
  RelativeStrengthReading,
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

function pushIfPresent(patterns: PatternFlag[], id: string, label: string, divergence: 'bullish' | 'bearish' | 'none', hint: string) {
  if (divergence === 'none') return;
  patterns.push({
    id: `${id}-${divergence}`,
    label: `${divergence === 'bullish' ? 'Bullish' : 'Bearish'} ${label}`,
    bias: divergence,
    confidence: 0.5,
    description:
      divergence === 'bullish'
        ? `Price and ${hint} are disagreeing at the lows — an early-reversal tell, not a confirmed signal on its own.`
        : `Price and ${hint} are disagreeing at the highs — an early-reversal tell, not a confirmed signal on its own.`,
  });
}

export function analyzeSeries(
  bars: Bar[],
  quality: DataQuality,
  relativeStrength: RelativeStrengthReading | null = null,
): AnalysisResult {
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
  const adxResult = adx(bars, 14);
  const stochResult = stochastic(bars, 14, 3);
  const obvSeries = obv(bars);
  const vwapSeries = anchoredVwap(bars, 0);

  const adxLast = lastValid(adxResult.adx);
  const plusDILast = lastValid(adxResult.plusDI);
  const minusDILast = lastValid(adxResult.minusDI);
  const stochKLast = lastValid(stochResult.k);
  const stochDLast = lastValid(stochResult.d);
  const vwapLast = lastValid(vwapSeries);

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
    dmi: adxLast !== null ? { adx: adxLast, plusDI: plusDILast ?? 0, minusDI: minusDILast ?? 0 } : null,
    stochastic: stochKLast !== null && stochDLast !== null ? { k: stochKLast, d: stochDLast } : null,
    vwap: vwapLast,
  };

  const swingWindow = bars.length > 120 ? 4 : bars.length > 40 ? 3 : 2;
  const swings = findSwingPoints(bars, swingWindow);
  const levels = clusterLevels(swings, lastClose, bars.length);
  const trend = classifyTrend(bars, sma50, sma200, swings, { adx: adxLast, plusDI: plusDILast, minusDI: minusDILast });

  const rsiDiv = computeRsiDivergence(rsiSeries, swings);
  const macdDiv = computeMacdDivergence(macdResult.macd, swings);
  const obvDiv = computeObvDivergence(obvSeries, swings);
  const macdCross = detectMacdCross(macdResult.macd, macdResult.signal);

  const rsiLast = indicators.rsi14;
  const rsiState: MomentumReading['rsiState'] =
    rsiLast === null ? 'unknown' : rsiLast >= 70 ? 'overbought' : rsiLast <= 30 ? 'oversold' : 'neutral';
  const stochState: MomentumReading['stochState'] =
    stochKLast === null ? 'unknown' : stochKLast >= 80 ? 'overbought' : stochKLast <= 20 ? 'oversold' : 'neutral';

  let obvTrend: MomentumReading['obvTrend'] = 'unknown';
  const obvLookback = 10;
  if (obvSeries.length > obvLookback) {
    const change = obvSeries[obvSeries.length - 1]! - obvSeries[obvSeries.length - 1 - obvLookback]!;
    const scale = Math.max(...obvSeries.slice(-obvLookback - 1).map((v) => Math.abs(v)), 1);
    obvTrend = Math.abs(change) / scale < 0.03 ? 'flat' : change > 0 ? 'rising' : 'falling';
  }

  const momentumNotes: string[] = [];
  if (rsiLast !== null) {
    momentumNotes.push(`RSI(14) is at ${rsiLast.toFixed(1)}${rsiState !== 'neutral' ? ` — ${rsiState}` : ''}.`);
  }
  if (stochKLast !== null) {
    momentumNotes.push(`Stochastic %K is at ${stochKLast.toFixed(1)}${stochState !== 'neutral' ? ` — ${stochState}` : ''}.`);
  }
  if (macdCross === 'bullish-cross') momentumNotes.push('MACD line just crossed above its signal line.');
  if (macdCross === 'bearish-cross') momentumNotes.push('MACD line just crossed below its signal line.');
  if (rsiDiv === 'bullish') momentumNotes.push('Bullish RSI divergence: price made a lower low while RSI made a higher low.');
  if (rsiDiv === 'bearish') momentumNotes.push('Bearish RSI divergence: price made a higher high while RSI made a lower high.');
  if (obvTrend === 'rising') momentumNotes.push('On-Balance Volume is trending up — volume is confirming buying pressure.');
  if (obvTrend === 'falling') momentumNotes.push('On-Balance Volume is trending down — volume is confirming selling pressure.');
  if (vwapLast !== null) {
    momentumNotes.push(
      `Price is trading ${lastClose >= vwapLast ? 'above' : 'below'} its period VWAP (~${vwapLast.toFixed(2)}), a volume-weighted fair-value reference.`,
    );
  }

  const momentum: MomentumReading = {
    rsi: rsiLast,
    rsiState,
    macdHistogram: indicators.macd?.histogram ?? null,
    macdCross,
    rsiDivergence: rsiDiv,
    macdDivergence: macdDiv,
    obvDivergence: obvDiv,
    stochK: stochKLast,
    stochState,
    obvTrend,
    notes: momentumNotes,
  };

  const volatility = volatilityReading(atrSeries, bb, lastClose);

  const patterns: PatternFlag[] = [
    ...detectDoubleTopBottom(swings),
    ...detectBreakout(bars, levels),
    ...detectTriangle(swings, lastClose),
    ...detectHeadAndShoulders(swings),
    ...detectFlag(bars),
    ...detectCandlestickPatterns(bars),
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
  pushIfPresent(patterns, 'rsi-divergence', 'RSI divergence', rsiDiv, 'RSI');
  pushIfPresent(patterns, 'macd-divergence', 'MACD divergence', macdDiv, 'the MACD line');
  pushIfPresent(patterns, 'obv-divergence', 'OBV divergence', obvDiv, 'On-Balance Volume');
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
  const periodHighLow = periodHighLowContext(bars);
  const backtest = backtestRsiMeanReversion(bars, rsiSeries, 5);

  // --- Score assembly -------------------------------------------------
  const trendComponent =
    trend.direction === 'uptrend' ? trend.strength : trend.direction === 'downtrend' ? -trend.strength : 0;

  const rsiComponent = rsiLast === null ? null : clamp((rsiLast - 50) / 50, -1, 1);
  const stochComponent = stochKLast === null ? null : clamp((stochKLast - 50) / 50, -1, 1);
  const momentumComponent =
    rsiComponent !== null && stochComponent !== null
      ? (rsiComponent + stochComponent) / 2
      : (rsiComponent ?? stochComponent ?? 0);

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

  const rsComponent = relativeStrength ? clamp(relativeStrength.relativeStrengthPct / 15, -1, 1) : 0;

  const WEIGHTS = { trend: 32, momentum: 18, macd: 15, patterns: 28, relativeStrength: 7 };
  const rawScore =
    trendComponent * WEIGHTS.trend +
    momentumComponent * WEIGHTS.momentum +
    macdComponent * WEIGHTS.macd +
    patternsComponent * WEIGHTS.patterns +
    rsComponent * WEIGHTS.relativeStrength;
  const score = clamp(Math.round(rawScore), -100, 100);

  let signal: Signal;
  if (score >= 50) signal = 'strong-bullish';
  else if (score >= 15) signal = 'bullish';
  else if (score > -15) signal = 'neutral';
  else if (score > -50) signal = 'bearish';
  else signal = 'strong-bearish';

  // --- Confidence assembly ---------------------------------------------
  const qualityBase = quality === 'image-only' ? 28 : quality === 'real-intraday' ? 58 : 62;
  const sampleAdequacy = clamp(bars.length / MIN_BARS_FOR_FULL_ANALYSIS, 0, 1) * 16;

  const componentSigns = [trendComponent, momentumComponent, macdComponent, patternsComponent, rsComponent].filter(
    (c) => Math.abs(c) > 0.05,
  );
  const agreeing = componentSigns.filter((c) => Math.sign(c) === Math.sign(rawScore || 1)).length;
  const agreementBonus = componentSigns.length > 0 ? (agreeing / componentSigns.length) * 12 : 0;

  const squeezePenalty = volatility.squeeze ? -6 : 0;
  const adxAdjustment = trend.adxState === 'trending' ? 5 : trend.adxState === 'choppy' ? -8 : 0;

  const confidence = clamp(
    Math.round(qualityBase + sampleAdequacy + agreementBonus + squeezePenalty + adxAdjustment),
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
    periodHighLow,
    relativeStrength,
    backtest,
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
      adx: null,
      adxState: 'unknown',
      notes: heuristics.notes,
    },
    momentum: {
      rsi: null,
      rsiState: 'unknown',
      macdHistogram: null,
      macdCross: 'unknown',
      rsiDivergence: 'none',
      macdDivergence: 'none',
      obvDivergence: 'none',
      stochK: null,
      stochState: 'unknown',
      obvTrend: 'unknown',
      notes: [],
    },
    volatility: { atr: null, atrPct: null, bollingerWidthPct: null, squeeze: false, notes: [] },
    levels: [],
    fib: null,
    patterns: [],
    indicators: null,
    periodHighLow: null,
    relativeStrength: null,
    backtest: null,
    imageOnly: heuristics,
  };
}
