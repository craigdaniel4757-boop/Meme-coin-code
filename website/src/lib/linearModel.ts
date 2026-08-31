import { Features, FeatureKey } from '../types';

export const FEATURE_KEYS: FeatureKey[] = [
  'chg5m',
  'chg1h',
  'chg6h',
  'volatility',
  'rsi',
  'smaDist',
  'buyPressure',
  'volTrend',
  'tokenAge',
  'solRegime',
  'relStrength',
  'unrealized',
  'bias',
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  chg5m: '5-minute change',
  chg1h: '1-hour change',
  chg6h: '6-hour change',
  volatility: 'Volatility',
  rsi: 'RSI extremity',
  smaDist: 'Distance from average',
  buyPressure: 'Buy/sell pressure',
  volTrend: 'Volume trend',
  tokenAge: 'Token age',
  solRegime: 'SOL market regime',
  relStrength: 'Strength vs. watchlist',
  unrealized: 'Open position P&L',
  bias: 'Base instinct',
};

// Warm-start priors: basic, textbook technical-analysis intuition (favor
// momentum + buy-pressure + relative-strength confirmation on entry,
// favor overbought/fading-momentum/broad-weakness on exit) so the bot
// isn't trading on pure noise before it has closed a single trade. From
// here every weight is still fully overwritten by `learnLinear()` after
// every close -- this is a starting point, not a script.
export const ENTRY_PRIOR: Features = {
  chg5m: 0.6,
  chg1h: 0.9,
  chg6h: 0.5,
  volatility: 0.3,
  rsi: -0.2,
  smaDist: 0.3,
  buyPressure: 0.5,
  volTrend: 0.4,
  tokenAge: 0.1,
  solRegime: 0.3,
  relStrength: 0.4,
  unrealized: 0,
  bias: -0.3,
};

export const EXIT_PRIOR: Features = {
  chg5m: -0.5,
  chg1h: -0.6,
  chg6h: -0.3,
  volatility: 0.4,
  rsi: 0.7,
  smaDist: 0.3,
  buyPressure: -0.2,
  volTrend: -0.2,
  tokenAge: 0,
  solRegime: -0.3,
  relStrength: -0.3,
  unrealized: 0.6,
  bias: -0.5,
};

export function withNoise(prior: Features, scale: number): Features {
  const f = {} as Features;
  for (const k of FEATURE_KEYS) f[k] = prior[k] + (Math.random() * 2 - 1) * scale;
  return f;
}

export function dot(weights: Features, features: Features): number {
  let sum = 0;
  for (const k of FEATURE_KEYS) sum += weights[k] * features[k];
  return sum;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface Decision {
  probability: number;
  confidence: number;
  explore: boolean;
  dominant: FeatureKey;
}

export function decideLinear(weights: Features, features: Features, epsilon: number): Decision {
  const score = dot(weights, features);
  const probability = sigmoid(score);
  const explore = Math.random() < epsilon;

  let dominant: FeatureKey = 'bias';
  let best = -Infinity;
  for (const k of FEATURE_KEYS) {
    if (k === 'bias') continue;
    const contribution = Math.abs(weights[k] * features[k]);
    if (contribution > best) {
      best = contribution;
      dominant = k;
    }
  }

  const confidence = Math.abs(probability - 0.5) * 2;
  return { probability, confidence, explore, dominant };
}

const WEIGHT_DECAY = 0.01;

/**
 * Online gradient-bandit update with a touch of L2 weight decay: nudge
 * every weight toward the features that were present, scaled by how good
 * the outcome turned out to be, while continuously shrinking weights back
 * toward zero a little so a handful of coincidental wins can't push a
 * weight to an overconfident extreme. `reward` is the realized trade P&L
 * as a fraction (0.12 = +12%).
 */
export function learnLinear(weights: Features, features: Features, reward: number, learningRate: number): Features {
  const scaledReward = Math.max(-1, Math.min(1, reward * 4));
  const updated = {} as Features;
  for (const k of FEATURE_KEYS) {
    const decayed = weights[k] * (1 - WEIGHT_DECAY);
    const next = decayed + learningRate * scaledReward * features[k];
    updated[k] = Math.max(-4, Math.min(4, next));
  }
  return updated;
}
