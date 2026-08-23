import { KeyStats, Mistake, Strength, TurnSnapshot } from "../../types/schemas";
import { checkTavernUpgradeTiming, checkGoldBanking, checkRerollEfficiency } from "./economy";
import { checkEarlyHealthLoss, checkBoardDevelopment, checkSwingTurns } from "./tempo";
import { checkDivineShieldClumping, checkHighValueClumping } from "./positioning";
import { checkCompFocus } from "./composition";
import { checkHeroPowerUsage } from "./heroPower";
import { checkHealthRetention, checkOnCurveTavern } from "./strengths";
import { average } from "./shared";

export interface HeuristicsResult {
  mistakes: Mistake[];
  strengths: Strength[];
  keyStats: KeyStats;
}

const EMPTY_KEY_STATS: KeyStats = {
  avgGoldUnspent: 0,
  heroPowerUsageRate: 0,
  turnsAboveHealthThreshold: 0,
  tripleCount: 0,
};

/**
 * Runs every deterministic rule against the turn timeline and returns a
 * complete, self-sufficient result - this is what backs the report when the
 * Claude narrative pass is unavailable or fails, and what the narrative pass
 * polishes when it succeeds.
 */
export function runHeuristics(turns: TurnSnapshot[]): HeuristicsResult {
  if (turns.length === 0) {
    return { mistakes: [], strengths: [], keyStats: EMPTY_KEY_STATS };
  }

  const mistakes = [
    ...checkTavernUpgradeTiming(turns),
    ...checkGoldBanking(turns),
    ...checkRerollEfficiency(turns),
    ...checkEarlyHealthLoss(turns),
    ...checkBoardDevelopment(turns),
    ...checkSwingTurns(turns),
    ...checkDivineShieldClumping(turns),
    ...checkHighValueClumping(turns),
    ...checkCompFocus(turns),
    ...checkHeroPowerUsage(turns),
  ].sort((a, b) => a.turn - b.turn);

  const strengths = [...checkHealthRetention(turns), ...checkOnCurveTavern(turns)].sort(
    (a, b) => a.turn - b.turn,
  );

  return { mistakes, strengths, keyStats: computeKeyStats(turns) };
}

function computeKeyStats(turns: TurnSnapshot[]): KeyStats {
  const eligibleForHeroPower = turns.filter((t) => t.turn >= 2);

  const goldenSeen = new Set<string>();
  for (const turn of turns) {
    for (const minion of turn.board) {
      if (minion.golden) goldenSeen.add(minion.name);
    }
  }

  return {
    avgGoldUnspent:
      Math.round(average(turns.map((t) => Math.max(0, t.goldAvailable - t.goldSpent))) * 10) / 10,
    heroPowerUsageRate: eligibleForHeroPower.length
      ? Math.round(
          (eligibleForHeroPower.filter((t) => t.heroPowerUsed).length / eligibleForHeroPower.length) * 100,
        ) / 100
      : 0,
    turnsAboveHealthThreshold: turns.filter((t) => t.health >= 25).length,
    tripleCount: goldenSeen.size,
  };
}
