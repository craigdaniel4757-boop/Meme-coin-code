import { FeatureKey } from '../types';
import { FEATURE_LABELS } from './agent';

const ENTRY_PHRASES: Partial<Record<FeatureKey, string[]>> = {
  chg5m: ['a sharp move in the last 5 minutes', 'a fast burst higher on the 5-minute chart'],
  chg1h: ['a strong last hour', 'building 1-hour momentum'],
  chg6h: ['a sustained 6-hour uptrend'],
  volatility: ['a volatility squeeze that often precedes a move'],
  rsi: ['RSI curling up out of oversold'],
  smaDist: ['price reclaiming its moving average'],
  buyPressure: ['buyers clearly outnumbering sellers this hour'],
  volTrend: ['hourly volume running well above its normal pace'],
  tokenAge: ['a track record as an established coin'],
  solRegime: ['SOL itself holding up well'],
  relStrength: ['outperforming the rest of the watchlist right now'],
  bias: ['a pattern that has matched past winners'],
  unrealized: ['favorable position momentum'],
};

const EXIT_PHRASES: Partial<Record<FeatureKey, string[]>> = {
  chg5m: ['a sudden reversal in the last 5 minutes'],
  chg1h: ['fading 1-hour momentum'],
  chg6h: ['the 6-hour trend rolling over'],
  volatility: ['a volatility spike that raised risk'],
  rsi: ['RSI hitting overbought extremes'],
  smaDist: ['price stretched too far from its average'],
  buyPressure: ['sell pressure building this hour'],
  volTrend: ['volume drying up'],
  tokenAge: ['this being a newer, less-proven coin'],
  solRegime: ['SOL itself turning weak'],
  relStrength: ['lagging the rest of the watchlist'],
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
