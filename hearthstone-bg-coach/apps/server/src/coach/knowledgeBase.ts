import { Tribe, TurnSnapshot } from "../types/schemas";

/**
 * Reference data the heuristics engine grades against. These are the kind of
 * benchmarks a strong player internalizes - not hard rules (lobby state,
 * hero, and matchups all shift the "right" line), which is why every
 * heuristic that uses them treats them as a band to be meaningfully behind
 * or ahead of, not an exact target.
 */

/** Roughly the turn a solid, on-curve player first hits each tavern tier. */
export const TAVERN_TIER_BENCHMARK_TURN: Record<number, number> = {
  2: 3,
  3: 6,
  4: 8,
  5: 10,
  6: 12,
};

/** Turns behind benchmark before it's worth flagging as passive/slow. */
export const TAVERN_BEHIND_TOLERANCE = 3;

/** Gold left on board with no upgrade the following turn, before it's "banking." */
export const GOLD_BANK_THRESHOLD = 3;

/** Starting hero health in a standard Battlegrounds lobby. */
export const STARTING_HEALTH = 40;

/** Health floor that's a real warning sign if crossed in the first 6 turns. */
export const EARLY_HEALTH_WARNING_TURN = 6;
export const EARLY_HEALTH_WARNING_FLOOR = 25;

/** Minions with combined attack+health at/above this are worth protecting positionally. */
export const HIGH_VALUE_STAT_THRESHOLD = 14;

export const CLEAVE_RISK_KEYWORD = "Divine Shield";

export const TRIBES = [
  "Beast",
  "Murloc",
  "Demon",
  "Mech",
  "Pirate",
  "Dragon",
  "Naga",
  "Quilboar",
  "Undead",
  "Elemental",
] as const;

/**
 * Labels the dominant tribe(s) on a board snapshot. Used both as the
 * deterministic default for Report.compArchetype (before Claude polishes it)
 * and by the composition heuristic to judge lobby-stage focus.
 */
export function dominantTribes(turn: TurnSnapshot, minCount = 2): Tribe[] {
  const counts = new Map<Tribe, number>();
  for (const minion of turn.board) {
    const tribe = minion.tribe;
    if (!tribe || tribe === "All" || tribe === "None") continue;
    counts.set(tribe, (counts.get(tribe) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([tribe]) => tribe);
}

export function inferArchetypeLabel(turns: TurnSnapshot[]): string {
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || lastTurn.board.length === 0) return "Unclear";
  const dominant = dominantTribes(lastTurn, 2);
  if (dominant.length === 0) return "Unfocused / Generic Stats";
  if (dominant.length === 1) return dominant[0];
  return dominant.slice(0, 2).join("/");
}

/**
 * Gold does not carry over between turns in Battlegrounds - unspent gold is
 * simply lost (partial progress toward a Tavern upgrade is the one
 * exception, tracked separately by the game). So each turn's starting gold
 * is just a function of the turn number.
 */
export function expectedGoldForTurn(turn: number): number {
  return Math.min(turn + 2, 10);
}

export function gradeFromScore(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 60) return "D";
  return "F";
}
