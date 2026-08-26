import type { AgentProfile } from "@/engine/types";
import { DEFAULT_WEIGHTS } from "@/engine/ai/policy";
import { FEATURE_DEFS } from "@/engine/ai/features";

const KEY_INDEX: Record<string, number> = Object.fromEntries(FEATURE_DEFS.map((f, i) => [f.key, i]));

function overrideWeights(overrides: Record<string, number>): number[] {
  const w = [...DEFAULT_WEIGHTS];
  for (const [k, v] of Object.entries(overrides)) {
    const idx = KEY_INDEX[k];
    if (idx !== undefined) w[idx] = v;
  }
  return w;
}

export const BASELINE_PROFILES: AgentProfile[] = [
  {
    id: "profile-tempo",
    label: "Tempo Rusher",
    learner: false,
    weights: overrideWeights({ curveTiming: 0.3, totalStats: 1.15, goldSpentRatio: 0.75, tavernTierLevel: 0.3 }),
    tribeBias: {},
    greed: 0.15,
    explorationRate: 0.12,
  },
  {
    id: "profile-murloc",
    label: "Murloc Zealot",
    learner: false,
    weights: overrideWeights({ topTribeCommitment: 0.9, boardFullness: 0.5, curveTiming: 0.5 }),
    tribeBias: { Murloc: 0.9 },
    greed: 0.35,
    explorationRate: 0.1,
  },
  {
    id: "profile-mech",
    label: "Mech Loyalist",
    learner: false,
    weights: overrideWeights({ divineShieldDensity: 0.8, deathrattleDensity: 0.7, topTribeCommitment: 0.75 }),
    tribeBias: { Mech: 0.85 },
    greed: 0.5,
    explorationRate: 0.1,
  },
  {
    id: "profile-greedy",
    label: "Greedy Scaler",
    learner: false,
    weights: overrideWeights({ curveTiming: 1.05, goldSpentRatio: 0.15, tavernTierLevel: 0.75, healthSafety: 0.5 }),
    tribeBias: {},
    greed: 0.9,
    explorationRate: 0.08,
  },
  {
    id: "profile-beast",
    label: "Beast Packleader",
    learner: false,
    weights: overrideWeights({ topTribeCommitment: 0.85, totalStats: 1.0 }),
    tribeBias: { Beast: 0.85 },
    greed: 0.4,
    explorationRate: 0.1,
  },
  {
    id: "profile-quilboar",
    label: "Quilboar Berserker",
    learner: false,
    weights: overrideWeights({ tauntDensity: 0.85, topTribeCommitment: 0.7, curveStats: 0.8 }),
    tribeBias: { Quilboar: 0.85 },
    greed: 0.3,
    explorationRate: 0.12,
  },
  {
    id: "profile-balanced",
    label: "Balanced Generalist",
    learner: false,
    weights: overrideWeights({}),
    tribeBias: {},
    greed: 0.5,
    explorationRate: 0.15,
  },
];

export function pickBaselineAssignment(rngInt: (n: number) => number): AgentProfile[] {
  const shuffled = [...BASELINE_PROFILES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rngInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
