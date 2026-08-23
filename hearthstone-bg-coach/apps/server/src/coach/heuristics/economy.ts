import { Mistake, TurnSnapshot } from "../../types/schemas";
import { GOLD_BANK_THRESHOLD, TAVERN_BEHIND_TOLERANCE, TAVERN_TIER_BENCHMARK_TURN } from "../knowledgeBase";
import { mkMistake } from "./shared";

/**
 * Flags falling meaningfully behind the standard tavern-upgrade curve, and
 * separately, upgrading well ahead of it without the board to show for it
 * (paying for tempo you never used).
 */
export function checkTavernUpgradeTiming(turns: TurnSnapshot[]): Mistake[] {
  const findings: Mistake[] = [];
  const firstTurnAtTier = new Map<number, TurnSnapshot>();
  for (const turn of turns) {
    if (!firstTurnAtTier.has(turn.tavernTier)) {
      firstTurnAtTier.set(turn.tavernTier, turn);
    }
  }

  for (const [tier, benchmarkTurn] of Object.entries(TAVERN_TIER_BENCHMARK_TURN)) {
    const tierNum = Number(tier);
    const reached = firstTurnAtTier.get(tierNum);
    if (!reached) continue;

    const behindBy = reached.turn - benchmarkTurn;
    if (behindBy >= TAVERN_BEHIND_TOLERANCE) {
      findings.push(
        mkMistake({
          turn: reached,
          category: "economy",
          severity: behindBy >= TAVERN_BEHIND_TOLERANCE + 2 ? "major" : "moderate",
          title: `Slow to Tavern Tier ${tierNum}`,
          explanation: `You first hit Tavern Tier ${tierNum} on turn ${reached.turn} - a solid curve is usually around turn ${benchmarkTurn}, so you were about ${behindBy} turns behind.`,
          suggestion: `Look for turns before this where you rerolled or held gold instead of upgrading. Falling this far behind curve usually means getting outscaled in the mid-game even if individual combats look fine.`,
        }),
      );
    }

    // Ahead-of-curve is only a problem if it visibly cost health - i.e. gold
    // went to tavern instead of the board, and that board lost fights.
    const aheadBy = benchmarkTurn - reached.turn;
    if (aheadBy >= 2) {
      const windowStart = Math.max(1, reached.turn - 2);
      const windowTurns = turns.filter((t) => t.turn >= windowStart && t.turn <= reached.turn);
      const healthLost = windowTurns.length
        ? windowTurns[0].health - windowTurns[windowTurns.length - 1].health
        : 0;
      if (healthLost >= 10) {
        findings.push(
          mkMistake({
            turn: reached,
            category: "economy",
            severity: "moderate",
            title: `Greedy Tier ${tierNum} upgrade cost you health`,
            explanation: `You hit Tavern Tier ${tierNum} on turn ${reached.turn}, ${aheadBy} turns ahead of a typical curve, but lost ${healthLost} health in the turns around it - the board didn't keep up with the tempo you spent on upgrading.`,
            suggestion: `Fast-tiering is strong when your board can survive on stats alone in the meantime. If you're taking heavy damage right after an early upgrade, spend a turn or two more on the board before tiering again.`,
          }),
        );
      }
    }
  }

  return findings;
}

/**
 * Flags the turns where the most gold was left unspent with no upgrade the
 * following turn to explain it. Capped to the worst offenders so this
 * doesn't dominate the mistake list on a game with a lot of minor banking.
 */
export function checkGoldBanking(turns: TurnSnapshot[], maxFindings = 3): Mistake[] {
  const candidates: Array<{ turn: TurnSnapshot; unspent: number }> = [];

  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    const next = turns[i + 1];
    if (turn.turn <= 2) continue; // early turns rarely have enough gold to matter
    const unspent = turn.goldAvailable - turn.goldSpent;
    const upgradedNextTurn = next.tavernTier > turn.tavernTier;
    if (unspent >= GOLD_BANK_THRESHOLD && !upgradedNextTurn) {
      candidates.push({ turn, unspent });
    }
  }

  return candidates
    .sort((a, b) => b.unspent - a.unspent)
    .slice(0, maxFindings)
    .sort((a, b) => a.turn.turn - b.turn.turn)
    .map(({ turn, unspent }) =>
      mkMistake({
        turn,
        category: "economy",
        severity: unspent >= GOLD_BANK_THRESHOLD + 3 ? "moderate" : "minor",
        title: `${unspent} gold left unspent on turn ${turn.turn}`,
        explanation: `You had ${unspent} gold left over at the end of turn ${turn.turn} with no Tavern upgrade the turn after. Gold doesn't carry over in Battlegrounds - unspent gold is just gone, except for whatever it put toward an in-progress Tavern upgrade.`,
        suggestion: `If you weren't mid-upgrade, that gold should go toward rerolls or buys instead of sitting unused - there's no benefit to holding it.`,
      }),
    );
}

/** Rerolling a lot while too low-tier to have found what you're looking for yet. */
export function checkRerollEfficiency(turns: TurnSnapshot[]): Mistake[] {
  const findings: Mistake[] = [];
  for (const turn of turns) {
    if (turn.tavernTier <= 2 && turn.rerollCount >= 3) {
      findings.push(
        mkMistake({
          turn,
          category: "economy",
          severity: "minor",
          title: `Heavy rerolling at Tavern Tier ${turn.tavernTier}`,
          explanation: `${turn.rerollCount} rerolls on turn ${turn.turn} while still at Tavern Tier ${turn.tavernTier} - the pool is small this early, so rerolling hard rarely finds much you couldn't already see.`,
          suggestion: `Save aggressive rerolling for Tier 3+, where the wider pool actually makes searching for specific tempo or synergy pieces worth the gold.`,
        }),
      );
    }
  }
  return findings;
}
