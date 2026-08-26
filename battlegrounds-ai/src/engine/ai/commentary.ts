import type { AgentProfile, DecisionExplanation, GameAction, PlayerState } from "@/engine/types";
import type { DecisionResult } from "@/engine/ai/policy";
import type { FeatureContext } from "@/engine/ai/features";
import { FEATURE_DEFS } from "@/engine/ai/features";
import { tribeMeta } from "@/engine/data/tribes";

function describeAction(action: GameAction, player: PlayerState): string {
  switch (action.kind) {
    case "buy": {
      const m = player.shop[action.shopIndex ?? -1];
      if (!m) return "Considers the tavern offer";
      const goldTxt = m.golden ? " golden" : "";
      return `Buys **${m.name}** (${m.attack}/${m.health}${goldTxt}, ${tribeMeta(m.tribe).label})`;
    }
    case "sell": {
      const m = player.board[action.boardIndex ?? -1];
      if (!m) return "Clears a board slot";
      return `Sells **${m.name}**`;
    }
    case "reroll":
      return "Refreshes the tavern";
    case "freeze":
      return "Freezes the tavern for next turn";
    case "unfreeze":
      return "Unfreezes the tavern";
    case "upgrade":
      return `Upgrades the tavern to Tier ${player.tavernTier + 1}`;
    case "heroPower":
      return "Activates its Hero Power";
    case "endTurn":
      return "Ends its turn";
    default:
      return "Acts";
  }
}

interface FactorRow {
  key: string;
  label: string;
  weight: number;
  contribution: number;
}

export function computeTopFactors(profileWeights: number[], features: number[]): FactorRow[] {
  const rows = FEATURE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    weight: profileWeights[i],
    contribution: profileWeights[i] * features[i],
  })).filter((row) => row.key !== "bias");
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return rows.slice(0, 3);
}

function factorClause(key: string, contribution: number): string {
  const def = FEATURE_DEFS.find((d) => d.key === key);
  if (!def) return key;
  return contribution >= 0 ? def.positiveHint : def.negativeHint;
}

export function renderCommentary(action: GameAction, preActionPlayer: PlayerState, decision: DecisionResult, profile: AgentProfile, ctx: FeatureContext, gamesPlayed?: number): { text: string; explanation: DecisionExplanation } {
  const actionLabel = describeAction(action, preActionPlayer);
  const topFactors = computeTopFactors(profile.weights, decision.chosen.features);

  const clauses = topFactors
    .filter((f) => Math.abs(f.contribution) > 0.02)
    .slice(0, 2)
    .map((f) => factorClause(f.key, f.contribution));

  let sentence = `${actionLabel}.`;
  if (clauses.length > 0) {
    sentence = `${actionLabel}, weighing ${clauses.join(" and ")}.`;
  }

  const extras: string[] = [];
  if (ctx.winProb != null && (action.kind === "endTurn" || action.kind === "upgrade")) {
    const pct = Math.round(ctx.winProb * 100);
    extras.push(`It reads its next matchup at roughly a ${pct}% chance to win.`);
  }
  if (decision.exploratory) {
    extras.push("It's deliberately trying a less obvious line here to keep exploring.");
  } else if (gamesPlayed != null && gamesPlayed > 0 && Math.random() < 0.12) {
    extras.push(`This kind of read has been shaped by ${gamesPlayed.toLocaleString()} games of self-play so far.`);
  }

  const text = extras.length > 0 ? `${sentence} ${extras[0]}` : sentence;

  const explanation: DecisionExplanation = {
    actionLabel,
    topFactors: topFactors.map(({ label, weight, contribution }) => ({ label, weight, contribution })),
    valueEstimate: decision.chosen.finalValue,
    winProbEstimate: ctx.winProb,
    note: extras[0] ?? null,
  };

  return { text, explanation };
}
