import { AgentWeights, Features, FeatureKey } from '../types';

export const FEATURE_KEYS: FeatureKey[] = [
  'chg5m',
  'chg1h',
  'chg6h',
  'volatility',
  'rsi',
  'smaDist',
  'buyPressure',
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
  unrealized: 'Open position P&L',
  bias: 'Base instinct',
};

// Warm-start priors: basic, textbook technical-analysis intuition (favor
// momentum + buy-pressure confirmation on entry, favor overbought/fading-
// momentum on exit) so the bot isn't trading on pure noise before it has
// closed a single trade. From here every weight is still fully overwritten
// by `learn()` after every close -- this is a starting point, not a script.
const ENTRY_PRIOR: Features = {
  chg5m: 0.6,
  chg1h: 0.9,
  chg6h: 0.5,
  volatility: 0.3,
  rsi: -0.2,
  smaDist: 0.3,
  buyPressure: 0.5,
  unrealized: 0,
  bias: -0.3,
};

const EXIT_PRIOR: Features = {
  chg5m: -0.5,
  chg1h: -0.6,
  chg6h: -0.3,
  volatility: 0.4,
  rsi: 0.7,
  smaDist: 0.3,
  buyPressure: -0.2,
  unrealized: 0.6,
  bias: -0.5,
};

function withNoise(prior: Features, scale: number): Features {
  const f = {} as Features;
  for (const k of FEATURE_KEYS) f[k] = prior[k] + (Math.random() * 2 - 1) * scale;
  return f;
}

/**
 * The "brain": two linear policies (entry, exit) over the same feature
 * space, trained online via a gradient-bandit-style update after every
 * closed trade. It is a real (if intentionally small) reinforcement
 * learning system -- not a scripted demo -- so its weights genuinely
 * drift toward whatever has been paying off in this run.
 */
export function createAgent(): AgentWeights {
  return {
    entry: withNoise(ENTRY_PRIOR, 0.05),
    exit: withNoise(EXIT_PRIOR, 0.05),
    updates: 0,
    epsilon: 0.25,
    learningRate: 0.18,
  };
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

export function decide(weights: Features, features: Features, epsilon: number): Decision {
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

/**
 * Online gradient-bandit update: nudge every weight in the direction of
 * the features that were present, scaled by how good the outcome turned
 * out to be. Profitable trades reinforce the features that led to them;
 * losing trades push weights away from those features. `reward` is the
 * realized trade P&L as a fraction (0.12 = +12%).
 */
export function learn(weights: Features, features: Features, reward: number, learningRate: number): Features {
  const scaledReward = Math.max(-1, Math.min(1, reward * 4));
  const updated = {} as Features;
  for (const k of FEATURE_KEYS) {
    const next = weights[k] + learningRate * scaledReward * features[k];
    updated[k] = Math.max(-4, Math.min(4, next));
  }
  return updated;
}

// Learning rate decays with experience (fast early learning that
// stabilizes as the model accumulates trades) while exploration decays
// exponentially so the bot leans on what it has learned instead of
// trading at random once it has some track record.
export function nextLearningRate(updates: number): number {
  return Math.max(0.02, 0.35 / Math.sqrt(1 + updates * 0.6));
}

export function nextEpsilon(updates: number): number {
  return Math.max(0.03, 0.25 * Math.exp(-updates / 40));
}
