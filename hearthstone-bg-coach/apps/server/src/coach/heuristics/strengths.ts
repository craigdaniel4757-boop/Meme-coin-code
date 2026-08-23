import { Strength, TurnSnapshot } from "../../types/schemas";
import { STARTING_HEALTH, TAVERN_BEHIND_TOLERANCE, TAVERN_TIER_BENCHMARK_TURN } from "../knowledgeBase";
import { mkStrength } from "./shared";

/** Deterministic positive signals, so the report isn't purely a mistake list even without a live LLM pass. */
export function checkHealthRetention(turns: TurnSnapshot[]): Strength[] {
  const midGame = turns.filter((t) => t.turn >= 6 && t.turn <= 10);
  if (midGame.length === 0) return [];

  const stayedHealthy = midGame.every((t) => t.health >= STARTING_HEALTH * 0.7);
  if (!stayedHealthy) return [];

  const anchor = midGame[midGame.length - 1];
  return [
    mkStrength({
      turn: anchor,
      title: "Strong health control through the midgame",
      explanation: `You held onto at least ${Math.round(STARTING_HEALTH * 0.7)} health all the way through turn ${anchor.turn}, which kept you clear of any single bad combat ending your run early and gave your comp time to come online.`,
    }),
  ];
}

export function checkOnCurveTavern(turns: TurnSnapshot[]): Strength[] {
  const firstTurnAtTier = new Map<number, TurnSnapshot>();
  for (const turn of turns) {
    if (!firstTurnAtTier.has(turn.tavernTier)) firstTurnAtTier.set(turn.tavernTier, turn);
  }

  const checkedTiers = [2, 3, 4] as const;
  const onCurve = checkedTiers.every((tier) => {
    const reached = firstTurnAtTier.get(tier);
    const benchmark = TAVERN_TIER_BENCHMARK_TURN[tier];
    return reached && reached.turn - benchmark < TAVERN_BEHIND_TOLERANCE && reached.turn >= benchmark - 1;
  });
  if (!onCurve) return [];

  const anchor = firstTurnAtTier.get(4)!;
  return [
    mkStrength({
      turn: anchor,
      title: "Textbook tavern curve through Tier 4",
      explanation: `You hit Tavern Tiers 2 through 4 right around the standard benchmark turns - that's the kind of consistent economy that keeps every option open in the mid-game.`,
    }),
  ];
}
