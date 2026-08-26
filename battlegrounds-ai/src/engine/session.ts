import { freshSeed } from "@/lib/rng";
import type { AgentProfile, GameEvent, PlayerSnapshot } from "@/engine/types";
import { simulateGame } from "@/engine/match/simulateGame";
import { updateWeights } from "@/engine/ai/learning";
import { explorationRateFor, learningRateFor, loadModel, recordGameResult, saveModel, type LearnerModel } from "@/engine/persistence/storage";

export const LEARNER_LABEL = "Aurora";

export interface PlayedGameSummary {
  events: GameEvent[];
  initialRoster: PlayerSnapshot[];
  placement: number;
  archetype: string;
  roundsPlayed: number;
  modelAfter: LearnerModel;
  avgTrainingError: number;
  finalReward: number;
  learnerSeat: number;
}

export function buildLearnerProfile(model: LearnerModel, forceExploration?: number): AgentProfile {
  return {
    id: "learner",
    label: LEARNER_LABEL,
    learner: true,
    weights: [...model.weights],
    tribeBias: {},
    greed: 0.5,
    explorationRate: forceExploration ?? explorationRateFor(model.gamesPlayed),
  };
}

export function playOneGame(model: LearnerModel, opts?: { seed?: number; forceExploration?: number }): PlayedGameSummary {
  const seed = opts?.seed ?? freshSeed();
  const learnerProfile = buildLearnerProfile(model, opts?.forceExploration);
  const result = simulateGame(seed, learnerProfile, undefined, model.gamesPlayed);
  const lr = learningRateFor(model.gamesPlayed);
  const update = updateWeights(model.weights, result.learnerTrajectory, result.learnerPlacement, lr);
  const modelAfter = recordGameResult(model, result.learnerPlacement, result.learnerArchetype, update.weights);
  saveModel(modelAfter);

  return {
    events: result.events,
    initialRoster: result.initialRoster,
    placement: result.learnerPlacement,
    archetype: result.learnerArchetype,
    roundsPlayed: result.roundsPlayed,
    modelAfter,
    avgTrainingError: update.avgError,
    finalReward: update.finalReward,
    learnerSeat: result.learnerSeat,
  };
}

export function getModel(): LearnerModel {
  return loadModel();
}
