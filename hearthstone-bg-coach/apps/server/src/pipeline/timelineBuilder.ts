import { expectedGoldForTurn } from "../coach/knowledgeBase";
import { CombatResult, TurnSnapshot } from "../types/schemas";
import { GlobalFrameReading } from "./visionAnalyzer";

export interface TimelineResult {
  turns: TurnSnapshot[];
  hero: string;
  finalPlacement: number;
}

const CONFIDENCE_RANK: Record<GlobalFrameReading["confidence"], number> = { high: 3, medium: 2, low: 1 };

/**
 * Consolidates the raw per-frame vision readings into one snapshot per turn,
 * plus a best-effort hero name and final placement. Every derived field here
 * documents its own approximation - see README "What's not included" and
 * docs/ARCHITECTURE.md for the full list of what's exact vs. estimated.
 */
export function buildTimeline(readings: GlobalFrameReading[]): TimelineResult {
  const byTurn = new Map<number, GlobalFrameReading[]>();
  for (const reading of readings) {
    if (reading.turnNumber == null) continue;
    const list = byTurn.get(reading.turnNumber) ?? [];
    list.push(reading);
    byTurn.set(reading.turnNumber, list);
  }

  const turnNumbers = [...byTurn.keys()].sort((a, b) => a - b);
  const turns: TurnSnapshot[] = [];
  let previousHealth: number | null = null;

  for (const turnNumber of turnNumbers) {
    const candidates = byTurn.get(turnNumber)!;
    const best = pickRepresentativeReading(candidates);
    if (!best) continue;

    const health: number = best.heroHealth ?? previousHealth ?? 40;
    const isFirstSnapshot = previousHealth == null;
    const healthDelta = isFirstSnapshot ? 0 : health - previousHealth!;

    // best.goldAvailable is what Claude read off the screen at snapshot time
    // (ideally late in the turn, i.e. leftover gold) - but TurnSnapshot's
    // goldAvailable field means the turn's starting total, matching how the
    // heuristics engine reads it (unspent = goldAvailable - goldSpent). So
    // we convert the observed leftover into a spent amount here, once.
    const startingGold = expectedGoldForTurn(turnNumber);
    const observedLeftover = Math.max(0, best.goldAvailable ?? 0);
    const goldSpent = Math.max(0, Math.min(startingGold, startingGold - observedLeftover));

    turns.push({
      turn: turnNumber,
      timestampSec: best.timestampSec,
      tavernTier: best.tavernTier ?? turns[turns.length - 1]?.tavernTier ?? 1,
      goldAvailable: startingGold,
      goldSpent,
      health,
      healthDelta,
      armor: best.armor ?? 0,
      board: best.board,
      shopOffers: best.shopMinions,
      heroPowerUsed: best.heroPowerAvailable === false,
      // Not reliably observable from periodic screenshots without an action
      // log or much denser sampling - left at 0 for live analysis.
      rerollCount: 0,
      combatResult: inferCombatResult(healthDelta, isFirstSnapshot),
      confidence: best.confidence,
    });

    previousHealth = health;
  }

  return {
    turns,
    hero: mostCommonHeroName(readings),
    finalPlacement: inferFinalPlacement(readings, turns),
  };
}

function pickRepresentativeReading(candidates: GlobalFrameReading[]): GlobalFrameReading | null {
  const recruitReadings = candidates.filter((c) => c.phase === "recruit");
  const pool = recruitReadings.length ? recruitReadings : candidates;
  const sorted = [...pool].sort((a, b) => {
    const confDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confDiff !== 0) return confDiff;
    return b.timestampSec - a.timestampSec; // prefer the latest read of the turn - closest to final decisions
  });
  return sorted[0] ?? null;
}

function inferCombatResult(healthDelta: number, isFirstSnapshot: boolean): CombatResult {
  if (isFirstSnapshot) return "unknown"; // no combat has happened yet before the first observed turn
  if (healthDelta < 0) return "loss";
  return "win"; // zero-delta could technically be a tie, but wins are far more common than ties
}

function mostCommonHeroName(readings: GlobalFrameReading[]): string {
  const counts = new Map<string, number>();
  for (const r of readings) {
    if (!r.heroName) continue;
    counts.set(r.heroName, (counts.get(r.heroName) ?? 0) + 1);
  }
  const [topHero] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return topHero?.[0] ?? "Unknown Hero";
}

function inferFinalPlacement(readings: GlobalFrameReading[], turns: TurnSnapshot[]): number {
  const observed = [...readings].reverse().find((r) => r.finalPlacementGuess != null);
  if (observed?.finalPlacementGuess) return observed.finalPlacementGuess;

  const lastTurn = turns[turns.length - 1];
  if (lastTurn && lastTurn.health <= 0) return 7; // eliminated, but the exact placement wasn't visible in-frame
  return 4; // recording likely doesn't include the results screen - neutral fallback
}
