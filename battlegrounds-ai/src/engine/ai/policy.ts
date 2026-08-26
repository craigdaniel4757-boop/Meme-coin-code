import type { RNG } from "@/lib/rng";
import type { AgentProfile, GameAction, GameState, PlayerState } from "@/engine/types";
import { applyAction, clonePlayerState, legalActions } from "@/engine/shop";
import { cloneTavernPool } from "@/engine/pool";
import { extractFeatures, FEATURE_COUNT, type FeatureContext } from "@/engine/ai/features";

export const DEFAULT_WEIGHTS: number[] = [
  0.05, // bias
  0.9, // totalStats
  0.6, // curveStats
  0.3, // boardFullness
  0.5, // tauntDensity
  0.55, // divineShieldDensity
  0.45, // poisonousDensity
  0.35, // rebornDensity
  0.4, // windfuryDensity
  0.4, // deathrattleDensity
  0.6, // topTribeCommitment
  0.2, // secondTribeCommitment
  -0.15, // tribeDiversity
  0.5, // tavernTierLevel
  0.7, // curveTiming
  0.5, // goldSpentRatio
  0.3, // healthSafety
  1.1, // combatWinProb
  0.5, // goldenValue
];

if (DEFAULT_WEIGHTS.length !== FEATURE_COUNT) {
  throw new Error(`DEFAULT_WEIGHTS length ${DEFAULT_WEIGHTS.length} does not match FEATURE_COUNT ${FEATURE_COUNT}`);
}

export function dot(weights: number[], features: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i] * (features[i] ?? 0);
  return sum;
}

export interface ScoredAction {
  action: GameAction;
  features: number[];
  baseValue: number;
  finalValue: number;
}

function tribeBiasBonus(profile: AgentProfile, resultPlayer: PlayerState): number {
  if (Object.keys(profile.tribeBias).length === 0 || resultPlayer.board.length === 0) return 0;
  let bonus = 0;
  for (const m of resultPlayer.board) {
    bonus += profile.tribeBias[m.tribe] ?? 0;
  }
  return bonus / resultPlayer.board.length;
}

export function evaluateAction(game: GameState, player: PlayerState, action: GameAction, rng: RNG, ctx: FeatureContext, profile: AgentProfile): ScoredAction {
  const simPlayer = clonePlayerState(player);
  const simGame: GameState = { ...game, pool: cloneTavernPool(game.pool) };
  applyAction(simGame, simPlayer, action, rng);
  const features = extractFeatures(simPlayer, ctx);
  const baseValue = dot(profile.weights, features);
  const finalValue = baseValue + tribeBiasBonus(profile, simPlayer);
  return { action, features, baseValue, finalValue };
}

export interface DecisionResult {
  chosen: ScoredAction;
  alternatives: ScoredAction[];
  exploratory: boolean;
}

export function decideAction(game: GameState, player: PlayerState, profile: AgentProfile, rng: RNG, ctx: FeatureContext, explorationOverride?: number): DecisionResult {
  const actions = legalActions(game, player);
  const scored = actions.map((a) => evaluateAction(game, player, a, rng, ctx, profile));
  scored.sort((a, b) => b.finalValue - a.finalValue);

  const epsilon = explorationOverride ?? profile.explorationRate;
  if (scored.length > 1 && rng.chance(epsilon)) {
    const idx = rng.int(scored.length);
    return { chosen: scored[idx], alternatives: scored, exploratory: idx !== 0 };
  }
  return { chosen: scored[0], alternatives: scored, exploratory: false };
}
