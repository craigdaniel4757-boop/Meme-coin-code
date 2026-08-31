import { Features, FeatureKey, NeuralWeights } from '../types';
import { Decision, FEATURE_KEYS } from './linearModel';

const HIDDEN_SIZE = 6;
const WEIGHT_DECAY = 0.01;
const WEIGHT_CLAMP = 3;

function featuresToVector(features: Features): number[] {
  return FEATURE_KEYS.map((k) => features[k]);
}

export function createNeuralWeights(scale: number): NeuralWeights {
  const inputSize = FEATURE_KEYS.length;
  const w1: number[][] = Array.from({ length: HIDDEN_SIZE }, () =>
    Array.from({ length: inputSize }, () => (Math.random() * 2 - 1) * scale),
  );
  const b1 = Array.from({ length: HIDDEN_SIZE }, () => 0);
  const w2 = Array.from({ length: HIDDEN_SIZE }, () => (Math.random() * 2 - 1) * scale);
  return { w1, b1, w2, b2: 0 };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function forwardHidden(weights: NeuralWeights, x: number[]): number[] {
  return weights.w1.map((row, h) => {
    let sum = weights.b1[h];
    for (let i = 0; i < x.length; i++) sum += row[i] * x[i];
    return Math.tanh(sum);
  });
}

function forwardOutput(weights: NeuralWeights, hidden: number[]): number {
  let z2 = weights.b2;
  for (let h = 0; h < hidden.length; h++) z2 += weights.w2[h] * hidden[h];
  return sigmoid(z2);
}

export function decideNeural(weights: NeuralWeights, features: Features, epsilon: number): Decision {
  const x = featuresToVector(features);
  const hidden = forwardHidden(weights, x);
  const probability = forwardOutput(weights, hidden);
  const explore = Math.random() < epsilon;

  // "Dominant feature" for a nonlinear model is inherently an
  // approximation (no single input "causes" the output the way it does
  // in the linear case) -- trace back from the most-active hidden unit to
  // its largest input connection, good enough for a one-line explanation.
  let bestHidden = 0;
  let bestHiddenAbs = -Infinity;
  hidden.forEach((h, i) => {
    const a = Math.abs(h * weights.w2[i]);
    if (a > bestHiddenAbs) {
      bestHiddenAbs = a;
      bestHidden = i;
    }
  });
  let dominant: FeatureKey = 'bias';
  let best = -Infinity;
  FEATURE_KEYS.forEach((k, i) => {
    if (k === 'bias') return;
    const contribution = Math.abs(weights.w1[bestHidden][i] * x[i]);
    if (contribution > best) {
      best = contribution;
      dominant = k;
    }
  });

  const confidence = Math.abs(probability - 0.5) * 2;
  return { probability, confidence, explore, dominant };
}

function clamp(v: number): number {
  return Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, v));
}

/**
 * Same reward-weighted gradient-ascent idea as `learnLinear` -- treat the
 * objective as reward times the network's pre-sigmoid score, and
 * backpropagate that one gradient through both layers via the chain rule
 * (with the same light L2 decay). Not full supervised backprop against a
 * known label -- there isn't one, this is a bandit, not classification --
 * just the linear model's update rule extended through an extra layer.
 */
export function learnNeural(
  weights: NeuralWeights,
  features: Features,
  reward: number,
  learningRate: number,
): NeuralWeights {
  const x = featuresToVector(features);
  const hidden = forwardHidden(weights, x);
  const scaledReward = Math.max(-1, Math.min(1, reward * 4));

  const dHidden = weights.w2.map((w, h) => scaledReward * w * (1 - hidden[h] * hidden[h]));

  const w2 = weights.w2.map((w, h) => clamp(w * (1 - WEIGHT_DECAY) + learningRate * scaledReward * hidden[h]));
  const b2 = clamp(weights.b2 * (1 - WEIGHT_DECAY) + learningRate * scaledReward);
  const w1 = weights.w1.map((row, h) =>
    row.map((w, i) => clamp(w * (1 - WEIGHT_DECAY) + learningRate * dHidden[h] * x[i])),
  );
  const b1 = weights.b1.map((b, h) => clamp(b * (1 - WEIGHT_DECAY) + learningRate * dHidden[h]));

  return { w1, b1, w2, b2 };
}
