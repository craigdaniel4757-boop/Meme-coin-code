import { FeatureKey } from '../types';
import { FEATURE_LABELS } from './agent';

const ENTRY_PHRASES: Partial<Record<FeatureKey, string[]>> = {
  mom3: ['a sharp short-term breakout', 'a fast burst higher'],
  mom10: ['building 10-tick momentum', 'a strengthening medium-term trend'],
  mom30: ['a sustained longer-term uptrend'],
  volatility: ['a volatility squeeze that often precedes a move'],
  rsi: ['RSI curling up out of oversold'],
  smaDist: ['price reclaiming its moving average'],
  volumeZ: ['a volume surge confirming interest'],
  bias: ['a pattern that has matched past winners'],
  unrealized: ['favorable position momentum'],
};

const EXIT_PHRASES: Partial<Record<FeatureKey, string[]>> = {
  mom3: ['a sudden reversal candle'],
  mom10: ['fading medium-term momentum'],
  mom30: ['the broader trend rolling over'],
  volatility: ['a volatility spike that raised risk'],
  rsi: ['RSI hitting overbought extremes'],
  smaDist: ['price stretched too far from its average'],
  volumeZ: ['a volume drop-off'],
  unrealized: ['the open profit/loss on the position'],
  bias: ['accumulated experience with this setup'],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function explainEntry(dominant: FeatureKey, ticker: string, confidence: number): string {
  const phrase = pick(ENTRY_PHRASES[dominant] ?? [FEATURE_LABELS[dominant]]);
  const conf = Math.round(confidence * 100);
  return `Opened ${ticker} on ${phrase} (${conf}% model confidence).`;
}

export function explainExit(dominant: FeatureKey, ticker: string, pnlPct: number): string {
  const phrase = pick(EXIT_PHRASES[dominant] ?? [FEATURE_LABELS[dominant]]);
  const verb = pnlPct >= 0 ? 'Took profit' : 'Cut the loss';
  const pct = `${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(1)}%`;
  return `${verb} on ${ticker} after ${phrase} (${pct}).`;
}

export function explainStop(ticker: string, pnlPct: number): string {
  return `Stop-loss triggered on ${ticker} at ${(pnlPct * 100).toFixed(1)}% -- risk control overrode the model.`;
}

export function explainMaxHold(ticker: string): string {
  return `Max hold time reached on ${ticker} -- closing out to free up capital.`;
}
