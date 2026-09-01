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

export interface CrossValidation {
  agrees: boolean;
  deltaPct: number;
  otherSource: 'stooq' | 'yahoo';
}

export interface QuoteSeries {
  symbol: string;
  resolvedSymbol: string;
  source: 'stooq' | 'yahoo';
  interval: string;
  /** Extended history used for analysis (SMA200/ADX/backtest warm-up) — not all of it is charted. */
  bars: Bar[];
  /** The timeframe-appropriate slice actually rendered on the chart. */
  displayBars: Bar[];
  quality: DataQuality;
  currency?: string;
  crossValidated: CrossValidation | null;
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
  adx: number | null;
  adxState: 'trending' | 'choppy' | 'unknown';
  notes: string[];
}

export type DivergenceState = 'bullish' | 'bearish' | 'none';

export interface MomentumReading {
  rsi: number | null;
  rsiState: 'overbought' | 'oversold' | 'neutral' | 'unknown';
  macdHistogram: number | null;
  macdCross: 'bullish-cross' | 'bearish-cross' | 'none' | 'unknown';
  rsiDivergence: DivergenceState;
  macdDivergence: DivergenceState;
  obvDivergence: DivergenceState;
  stochK: number | null;
  stochState: 'overbought' | 'oversold' | 'neutral' | 'unknown';
  obvTrend: 'rising' | 'falling' | 'flat' | 'unknown';
  notes: string[];
}

export interface VolatilityReading {
  atr: number | null;
  atrPct: number | null;
  bollingerWidthPct: number | null;
  squeeze: boolean;
  squeezeJustFired: boolean;
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
  dmi: { adx: number; plusDI: number; minusDI: number } | null;
  stochastic: { k: number; d: number } | null;
  vwap: number | null;
  ichimoku: { tenkan: number; kijun: number; senkouA: number; senkouB: number; cloudPosition: CloudPosition } | null;
  sar: { value: number; trend: 'up' | 'down' } | null;
  cmf: number | null;
  roc: number | null;
  pivots: PivotLevels | null;
}

export type CloudPosition = 'above' | 'below' | 'inside' | 'unknown';

export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface PeriodHighLow {
  periodHigh: number;
  periodLow: number;
  pctFromHigh: number;
  pctFromLow: number;
  nearHigh: boolean;
  nearLow: boolean;
}

export interface HigherTimeframeContext {
  direction: TrendDirection;
  agrees: boolean;
}

export interface AnalysisContext {
  relativeStrength?: RelativeStrengthReading | null;
  crossValidated?: CrossValidation | null;
  /** Length of the timeframe-appropriate display window, for anchoring VWAP sensibly when `bars`
   * carries much more history than is shown (see lib/dataSources.ts). Defaults to all of `bars`
   * (VWAP anchored at the very start of history) when omitted. */
  displayBarCount?: number;
  /** Daily-trend cross-check, computed by the caller, for intraday (1D/5D) reads only. */
  higherTimeframe?: HigherTimeframeContext | null;
}

export interface RelativeStrengthReading {
  benchmarkSymbol: string;
  symbolReturnPct: number;
  benchmarkReturnPct: number;
  relativeStrengthPct: number;
  outperforming: boolean;
}

export interface BacktestSignalStat {
  label: string;
  occurrences: number;
  hitRatePct: number | null;
  avgForwardReturnPct: number | null;
  horizon: number;
}

export interface BacktestReading {
  rsiOversoldBounce: BacktestSignalStat;
  rsiOverboughtFade: BacktestSignalStat;
  maCrossBullish: BacktestSignalStat;
  maCrossBearish: BacktestSignalStat;
  macdCrossBullish: BacktestSignalStat;
  macdCrossBearish: BacktestSignalStat;
}

export interface AnalysisResult {
  signal: Signal;
  score: number; // -100..100
  confidence: number; // 0-100
  dataQuality: DataQuality;
  sampleSize: number;
  crossValidated: CrossValidation | null;
  trend: TrendReading;
  momentum: MomentumReading;
  volatility: VolatilityReading;
  levels: Level[];
  fib: FibLevel[] | null;
  patterns: PatternFlag[];
  indicators: IndicatorSnapshot | null;
  periodHighLow: PeriodHighLow | null;
  relativeStrength: RelativeStrengthReading | null;
  backtest: BacktestReading | null;
  higherTimeframeContext: HigherTimeframeContext | null;
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
