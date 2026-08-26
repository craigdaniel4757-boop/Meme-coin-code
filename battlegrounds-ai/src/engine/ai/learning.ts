import type { HeroTrajectoryStep, PlayerState, Tribe } from "@/engine/types";
import { FEATURE_COUNT } from "@/engine/ai/features";

const TERMINAL_WEIGHT = 0.7;
const SHAPING_WEIGHT = 0.3;
const WEIGHT_CLAMP = 3;

export function computeFinalReward(placement: number): number {
  return (4.5 - placement) / 3.5;
}

export function updateWeights(weights: number[], trajectory: HeroTrajectoryStep[], placement: number, learningRate: number): { weights: number[]; avgError: number; finalReward: number } {
  const finalReward = computeFinalReward(placement);
  if (trajectory.length === 0) {
    return { weights: [...weights], avgError: 0, finalReward };
  }

  const gradient = new Array(FEATURE_COUNT).fill(0);
  let errorSum = 0;
  for (const step of trajectory) {
    const target = SHAPING_WEIGHT * (step.combatRewardAfter ?? 0) + TERMINAL_WEIGHT * finalReward;
    const error = target - step.valuePred;
    errorSum += error;
    for (let i = 0; i < FEATURE_COUNT; i++) {
      gradient[i] += error * (step.features[i] ?? 0);
    }
  }
  const n = trajectory.length;
  const nextWeights = weights.map((w, i) => clamp(w + learningRate * (gradient[i] / n), -WEIGHT_CLAMP, WEIGHT_CLAMP));
  return { weights: nextWeights, avgError: errorSum / n, finalReward };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function deriveArchetypeLabel(player: PlayerState): string {
  const entries = Object.entries(player.tribeCounts) as [Tribe, number][];
  if (entries.length === 0) return "Generalist";
  entries.sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const [topTribe, topCount] = entries[0];
  if (topCount / total >= 0.55) return topTribe;
  if (entries.length >= 2) {
    const [secondTribe] = entries[1];
    return `${topTribe}/${secondTribe}`;
  }
  return "Generalist";
}
