import { AgentWeights, EnsembleMember, FeatureKey, Features } from '../types';
import {
  Decision,
  ENTRY_PRIOR,
  EXIT_PRIOR,
  FEATURE_KEYS,
  FEATURE_LABELS,
  decideLinear,
  learnLinear,
  withNoise,
} from './linearModel';
import { createNeuralWeights, decideNeural, learnNeural } from './neuralModel';
import pretrainedBrainFile from '../data/pretrainedBrain.json';

export { FEATURE_KEYS, FEATURE_LABELS };
export type { Decision };

export type PolicyKind = 'entry' | 'exit';

// The committee: two independently-seeded linear models plus one small
// neural net. Averaging differently-initialized, differently-shaped
// models is a standard, genuinely free variance-reduction technique --
// each member's gradient-bandit update is noisy and sensitive to its own
// random starting point and the luck of which trades it happened to see
// first, so a vote across a few of them is steadier than trusting any one.
const ENSEMBLE_SPEC: Array<EnsembleMember['kind']> = ['linear', 'linear', 'neural'];

interface PretrainedBrainFile {
  pretrained: boolean;
  agent: unknown;
}

function isCompatibleAgent(agent: unknown): agent is AgentWeights {
  if (!agent || typeof agent !== 'object') return false;
  const members = (agent as Record<string, unknown>).members;
  if (!Array.isArray(members) || members.length !== ENSEMBLE_SPEC.length) return false;
  return members.every((m, i) => (m as Record<string, unknown> | null)?.kind === ENSEMBLE_SPEC[i]);
}

function freshEnsemble(): EnsembleMember[] {
  return ENSEMBLE_SPEC.map((kind) => {
    if (kind === 'linear') {
      return { kind: 'linear', entry: withNoise(ENTRY_PRIOR, 0.08), exit: withNoise(EXIT_PRIOR, 0.08) };
    }
    return { kind: 'neural', entry: createNeuralWeights(0.3), exit: createNeuralWeights(0.3) };
  });
}

/**
 * The "brain": a small ensemble of policies (see ENSEMBLE_SPEC), each
 * trained online via a reward-weighted gradient-ascent update after every
 * closed trade -- a real (if intentionally small) reinforcement learning
 * system, not a scripted demo, so its weights genuinely drift toward
 * whatever has been paying off in this run.
 *
 * Starts from `src/data/pretrainedBrain.json` when it holds a real,
 * shape-compatible result from `npm run pretrain` (real historical
 * candles replayed through this exact code -- see scripts/pretrain.ts);
 * otherwise falls back to the hand-picked technical-analysis prior with
 * random noise, same as before pretraining existed.
 */
export function createAgent(): AgentWeights {
  const file = pretrainedBrainFile as PretrainedBrainFile;
  if (file.pretrained && isCompatibleAgent(file.agent)) {
    return JSON.parse(JSON.stringify(file.agent)) as AgentWeights;
  }
  return { members: freshEnsemble(), updates: 0, epsilon: 0.25, learningRate: 0.18 };
}

function decideMember(member: EnsembleMember, policy: PolicyKind, features: Features, epsilon: number): Decision {
  if (member.kind === 'linear') return decideLinear(member[policy], features, epsilon);
  return decideNeural(member[policy], features, epsilon);
}

function learnMember(
  member: EnsembleMember,
  policy: PolicyKind,
  features: Features,
  reward: number,
  learningRate: number,
): EnsembleMember {
  if (member.kind === 'linear') {
    const updated = learnLinear(member[policy], features, reward, learningRate);
    return policy === 'entry' ? { ...member, entry: updated } : { ...member, exit: updated };
  }
  const updated = learnNeural(member[policy], features, reward, learningRate);
  return policy === 'entry' ? { ...member, entry: updated } : { ...member, exit: updated };
}

export interface EnsembleDecision {
  probability: number;
  confidence: number;
  explore: boolean;
  dominant: FeatureKey;
  // Fraction of members that landed on the same side of 50/50 as the
  // ensemble's averaged probability -- 1.0 means every model agreed,
  // lower means the committee is split on this one.
  agreement: number;
}

// One shared explore/exploit coin flip per decision (not per member) so
// the ensemble acts as a single coherent policy rather than a muddle of
// members independently exploring and exploiting at the same moment.
export function decide(members: EnsembleMember[], policy: PolicyKind, features: Features, epsilon: number): EnsembleDecision {
  const explore = Math.random() < epsilon;
  const decisions = members.map((m) => decideMember(m, policy, features, epsilon));
  const probability = decisions.reduce((s, d) => s + d.probability, 0) / decisions.length;
  const confidence = decisions.reduce((s, d) => s + d.confidence, 0) / decisions.length;
  const votesUp = decisions.filter((d) => d.probability >= 0.5).length;
  const agreement = Math.max(votesUp, decisions.length - votesUp) / decisions.length;
  const mostConfident = decisions.reduce((best, d) => (d.confidence > best.confidence ? d : best), decisions[0]);
  return { probability, confidence, explore, dominant: mostConfident.dominant, agreement };
}

// Learning rate decays with experience (fast early learning that
// stabilizes as the model accumulates trades) while exploration decays
// exponentially so the bot leans on what it has learned instead of
// trading at random once it has some track record.
function nextLearningRate(updates: number): number {
  return Math.max(0.02, 0.35 / Math.sqrt(1 + updates * 0.6));
}

function nextEpsilon(updates: number): number {
  return Math.max(0.03, 0.25 * Math.exp(-updates / 40));
}

// Updates every member's entry AND exit policy from one closed trade's
// outcome, then advances the shared learning-rate/exploration schedule.
// Callers should skip this entirely for held-out eval trades (see
// lib/simulation.ts) so those stay an unbiased read on current skill.
export function learnFromTrade(
  agent: AgentWeights,
  entryFeatures: Features,
  exitFeatures: Features,
  reward: number,
): AgentWeights {
  const updates = agent.updates + 1;
  const members = agent.members.map((m) => {
    const afterEntry = learnMember(m, 'entry', entryFeatures, reward, agent.learningRate);
    return learnMember(afterEntry, 'exit', exitFeatures, reward, agent.learningRate);
  });
  return { members, updates, epsilon: nextEpsilon(updates), learningRate: nextLearningRate(updates) };
}

// Averaged entry weights across whichever members are linear -- used only
// for the "what the model weighs most" bar chart, which needs one
// comparable number per feature; a neural member's weights aren't
// directly comparable feature-by-feature the same way. Null if the
// ensemble happens to contain no linear members.
export function averageLinearEntryWeights(agent: AgentWeights): Features | null {
  const linears = agent.members.filter((m): m is Extract<EnsembleMember, { kind: 'linear' }> => m.kind === 'linear');
  if (linears.length === 0) return null;
  const avg = {} as Features;
  for (const k of FEATURE_KEYS) {
    avg[k] = linears.reduce((s, m) => s + m.entry[k], 0) / linears.length;
  }
  return avg;
}
