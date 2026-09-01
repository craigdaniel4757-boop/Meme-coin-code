// Shared domain types for the analysis pipeline.
// The pipeline is intentionally rule-based and fully inspectable (see lib/scorer.ts and
// lib/planner.ts) rather than an opaque model call, so every number in the UI can be traced
// back to a formula or to a real, fetched price bar.

export type Timeframe = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y';

export type Horizon = 'short' | 'long';

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type DataQuality = 'real-intraday' | 'real-daily' | 'image-only';

export interface QuoteSeries {
  symbol: string;
  resolvedSymbol: string;
  source: 'stooq' | 'yahoo';
  interval: string;
  bars: Bar[];
  quality: DataQuality;
  currency?: string;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  kind: 'high' | 'low';
}

export interface Level {
  price: number;
  kind: 'support' | 'resistance';
  touches: number;
  strength: number; // 0-1
  lastTouchIndex: number;
}

export type TrendDirection = 'uptrend' | 'downtrend' | 'sideways';

export interface TrendReading {
  direction: TrendDirection;
  strength: number; // 0-1
  smaStack: 'bullish' | 'bearish' | 'mixed';
  structure: 'higher-highs-lows' | 'lower-highs-lows' | 'mixed';
  notes: string[];
}

export interface MomentumReading {
  rsi: number | null;
  rsiState: 'overbought' | 'oversold' | 'neutral' | 'unknown';
  macdHistogram: number | null;
  macdCross: 'bullish-cross' | 'bearish-cross' | 'none' | 'unknown';
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  notes: string[];
}

export interface VolatilityReading {
  atr: number | null;
  atrPct: number | null;
  bollingerWidthPct: number | null;
  squeeze: boolean;
  notes: string[];
}

export interface PatternFlag {
  id: string;
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  description: string;
}

export interface FibLevel {
  ratio: number;
  price: number;
}

export type Signal = 'strong-bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong-bearish';

export interface IndicatorSnapshot {
  lastClose: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number } | null;
  atr14: number | null;
}

export interface AnalysisResult {
  signal: Signal;
  score: number; // -100..100
  confidence: number; // 0-100
  dataQuality: DataQuality;
  sampleSize: number;
  trend: TrendReading;
  momentum: MomentumReading;
  volatility: VolatilityReading;
  levels: Level[];
  fib: FibLevel[] | null;
  patterns: PatternFlag[];
  indicators: IndicatorSnapshot | null;
  imageOnly?: ImageHeuristics | null;
}

export interface ImageHeuristics {
  bullishPixelRatio: number; // 0-1, share of green vs red candle/line pixels
  slopeDirection: 'up' | 'down' | 'flat';
  slopeConfidence: number; // 0-1
  notes: string[];
}

export interface OcrExtraction {
  rawText: string;
  guessedSymbol: string | null;
  candidateSymbols: string[];
  guessedPrices: number[];
}

export interface PlanStep {
  title: string;
  body: string;
}

export interface Plan {
  headline: string;
  steps: PlanStep[];
  invalidation: string;
  horizon: Horizon;
}
