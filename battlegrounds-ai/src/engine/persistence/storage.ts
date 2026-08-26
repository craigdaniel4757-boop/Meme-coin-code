import { DEFAULT_WEIGHTS } from "@/engine/ai/policy";
import { FEATURE_COUNT } from "@/engine/ai/features";

export const MODEL_VERSION = 1;
const STORAGE_KEY = "battlegrounds-ai:model:v1";
const MAX_PLACEMENT_HISTORY = 400;
const MAX_WEIGHT_HISTORY = 120;

export interface ArchetypeStat {
  games: number;
  placementSum: number;
  wins: number;
}

export interface PlacementEntry {
  game: number;
  placement: number;
  ts: number;
  archetype: string;
}

export interface WeightSnapshot {
  game: number;
  weights: number[];
}

export interface LearnerModel {
  version: number;
  weights: number[];
  gamesPlayed: number;
  placementSum: number;
  winCount: number;
  top4Count: number;
  placementHistory: PlacementEntry[];
  archetypeStats: Record<string, ArchetypeStat>;
  weightHistory: WeightSnapshot[];
  createdAt: number;
  updatedAt: number;
}

export function freshModel(): LearnerModel {
  const now = Date.now();
  return {
    version: MODEL_VERSION,
    weights: [...DEFAULT_WEIGHTS],
    gamesPlayed: 0,
    placementSum: 0,
    winCount: 0,
    top4Count: 0,
    placementHistory: [],
    archetypeStats: {},
    weightHistory: [{ game: 0, weights: [...DEFAULT_WEIGHTS] }],
    createdAt: now,
    updatedAt: now,
  };
}

function isValidModel(v: unknown): v is LearnerModel {
  if (!v || typeof v !== "object") return false;
  const m = v as Partial<LearnerModel>;
  return (
    m.version === MODEL_VERSION &&
    Array.isArray(m.weights) &&
    m.weights.length === FEATURE_COUNT &&
    typeof m.gamesPlayed === "number" &&
    Array.isArray(m.placementHistory) &&
    typeof m.archetypeStats === "object"
  );
}

export function loadModel(): LearnerModel {
  if (typeof window === "undefined") return freshModel();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshModel();
    const parsed: unknown = JSON.parse(raw);
    if (!isValidModel(parsed)) return freshModel();
    return parsed;
  } catch {
    return freshModel();
  }
}

export function saveModel(model: LearnerModel): void {
  if (typeof window === "undefined") return;
  try {
    model.updatedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
    // storage unavailable or full; training continues in-memory for this session
  }
}

export function resetModel(): LearnerModel {
  const fresh = freshModel();
  saveModel(fresh);
  return fresh;
}

export function recordGameResult(model: LearnerModel, placement: number, archetype: string, newWeights: number[]): LearnerModel {
  const gamesPlayed = model.gamesPlayed + 1;

  let placementHistory = [...model.placementHistory, { game: gamesPlayed, placement, ts: Date.now(), archetype }];
  if (placementHistory.length > MAX_PLACEMENT_HISTORY) {
    placementHistory = placementHistory.slice(placementHistory.length - MAX_PLACEMENT_HISTORY);
  }

  const prevStat = model.archetypeStats[archetype] ?? { games: 0, placementSum: 0, wins: 0 };
  const archetypeStats = {
    ...model.archetypeStats,
    [archetype]: {
      games: prevStat.games + 1,
      placementSum: prevStat.placementSum + placement,
      wins: prevStat.wins + (placement === 1 ? 1 : 0),
    },
  };

  let weightHistory = model.weightHistory;
  if (gamesPlayed % 3 === 0 || gamesPlayed <= 5) {
    weightHistory = [...model.weightHistory, { game: gamesPlayed, weights: [...newWeights] }];
    if (weightHistory.length > MAX_WEIGHT_HISTORY) {
      weightHistory = weightHistory.slice(weightHistory.length - MAX_WEIGHT_HISTORY);
    }
  }

  return {
    ...model,
    weights: newWeights,
    gamesPlayed,
    placementSum: model.placementSum + placement,
    winCount: model.winCount + (placement === 1 ? 1 : 0),
    top4Count: model.top4Count + (placement <= 4 ? 1 : 0),
    placementHistory,
    archetypeStats,
    weightHistory,
  };
}

export function learningRateFor(gamesPlayed: number): number {
  return Math.max(0.02, 0.25 / (1 + gamesPlayed / 40));
}

export function explorationRateFor(gamesPlayed: number): number {
  return Math.max(0.03, 0.35 * Math.exp(-gamesPlayed / 120));
}
