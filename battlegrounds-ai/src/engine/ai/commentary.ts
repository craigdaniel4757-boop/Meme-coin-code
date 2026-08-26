import type { AgentProfile, DecisionExplanation, GameAction, PlayerState, Tribe } from "@/engine/types";
import type { DecisionResult, ScoredAction } from "@/engine/ai/policy";
import type { FeatureContext } from "@/engine/ai/features";
import { FEATURE_DEFS } from "@/engine/ai/features";
import { tribeMeta } from "@/engine/data/tribes";
import { getHeroDef } from "@/engine/data/heroes";

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
    case "heroPower": {
      const power = getHeroDef(player.heroId).power.name;
      return `Activates its Hero Power (**${power}**)`;
    }
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

function rawStateFactors(weights: number[], features: number[]): FactorRow[] {
  const rows = FEATURE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    weight: weights[i],
    contribution: weights[i] * features[i],
  })).filter((row) => row.key !== "bias");
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return rows.slice(0, 3);
}

function pickComparisonAlt(decision: DecisionResult): ScoredAction | null {
  const { chosen, alternatives } = decision;
  if (alternatives.length < 2) return null;
  return chosen === alternatives[0] ? alternatives[1] : alternatives[0];
}

function differentiatingFactors(weights: number[], decision: DecisionResult): FactorRow[] {
  const alt = pickComparisonAlt(decision);
  if (!alt) return rawStateFactors(weights, decision.chosen.features);

  const rows = FEATURE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    weight: weights[i],
    contribution: weights[i] * (decision.chosen.features[i] - alt.features[i]),
  })).filter((r) => r.key !== "bias" && Math.abs(r.contribution) > 0.008);
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return rows.length > 0 ? rows.slice(0, 3) : rawStateFactors(weights, decision.chosen.features);
}

const PHRASE_VARIANTS: Record<string, { positive: string[]; negative: string[] }> = {
  totalStats: { positive: ["its raw stat total", "sheer stats on board"], negative: ["thin stats on board", "not much raw power out yet"] },
  curveStats: {
    positive: ["running ahead of the round's stat curve", "already outpacing where a board 'should' be this round"],
    negative: ["falling behind the round's stat curve", "lagging the pace this round usually calls for"],
  },
  boardFullness: {
    positive: ["filling out its last open slots", "wanting more bodies on board"],
    negative: ["keeping a slot open for flexibility", "not wanting to overcommit the board yet"],
  },
  tauntDensity: { positive: ["its Taunt coverage", "having something to eat the first hit"], negative: ["thin Taunt coverage", "nothing to absorb the opening trade"] },
  divineShieldDensity: { positive: ["its Divine Shield count", "shields to soak the opening trades"], negative: ["a lack of Divine Shields", "no shields to blunt the first hit"] },
  poisonousDensity: { positive: ["its Poisonous threats", "having something that trades up for free"], negative: ["a lack of Poisonous", "nothing that punches above its weight in combat"] },
  rebornDensity: { positive: ["its Reborn value", "getting two fights out of one body"], negative: ["a lack of Reborn value", "nothing that comes back after dying"] },
  windfuryDensity: { positive: ["its Windfury damage output", "doubled swings this combat"], negative: ["a lack of Windfury", "single-hit damage only"] },
  deathrattleDensity: { positive: ["its Deathrattle value", "getting something even when it loses the trade"], negative: ["a lack of Deathrattle value", "nothing left behind if it loses the trade"] },
  topTribeCommitment: {
    positive: ["committing harder to its lead tribe", "doubling down on its main tribe"],
    negative: ["staying flexible on tribe", "not locking into one tribe just yet"],
  },
  secondTribeCommitment: {
    positive: ["building out a secondary tribe package", "hedging with a second tribe"],
    negative: ["skipping a secondary tribe package", "not splitting focus across a second tribe"],
  },
  tribeDiversity: {
    positive: ["a wider spread of minion types", "keeping its options open across tribes"],
    negative: ["a tighter, more focused board", "narrowing in on one tribe identity"],
  },
  tavernTierLevel: { positive: ["what its tavern level unlocks", "the tools available at this tier"], negative: ["the limits of its current tavern tier", "not having higher-tier tools yet"] },
  curveTiming: {
    positive: ["being ahead on the tavern curve", "leveling faster than a typical lobby"],
    negative: ["being behind on the tavern curve", "leveling slower than it would like"],
  },
  goldSpentRatio: {
    positive: ["spending its gold down efficiently", "not wanting to waste tempo this turn"],
    negative: ["banking gold for something bigger", "holding back to set up next turn"],
  },
  healthSafety: { positive: ["a comfortable life total", "having health to spare"], negative: ["a pressured life total", "not much health left to work with"] },
  combatWinProb: {
    positive: ["a favorable read on its next matchup", "liking its odds in the next fight"],
    negative: ["a difficult read on its next matchup", "not loving its odds in the next fight"],
  },
  goldenValue: { positive: ["the golden minions already in play", "leaning on its golden upgrades"], negative: ["not having a golden minion yet", "no doubled-stat body on board yet"] },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function factorClause(key: string, contribution: number): string {
  const variants = PHRASE_VARIANTS[key];
  if (!variants) return key;
  return pick(contribution >= 0 ? variants.positive : variants.negative);
}

const PAIR_CONNECTORS: ((a: string, b: string) => string)[] = [
  (a, b) => `weighing ${a} and ${b}`,
  (a, b) => `leaning on ${a}, with ${b} reinforcing it`,
  (a, b) => `driven mainly by ${a}, plus ${b}`,
  (a, b) => `favoring ${a} over the alternatives, and ${b}`,
];

const SINGLE_CONNECTORS: ((a: string) => string)[] = [(a) => `weighing ${a}`, (a) => `driven mainly by ${a}`, (a) => `leaning on ${a}`, (a) => `swayed by ${a}`];

function buildReasonClause(clauses: string[]): string | null {
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return pick(SINGLE_CONNECTORS)(clauses[0]);
  return pick(PAIR_CONNECTORS)(clauses[0], clauses[1]);
}

function tribeLabel(t: Tribe): string {
  return tribeMeta(t).label;
}

function contextualDetail(player: PlayerState, ctx: FeatureContext): string | null {
  const board = player.board;
  const notes: string[] = [];

  if (board.length > 0) {
    const counts = new Map<Tribe, number>();
    for (const m of board) {
      if (m.tribe !== "None") counts.set(m.tribe, (counts.get(m.tribe) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] >= 3) {
      notes.push(`With ${sorted[0][1]} ${tribeLabel(sorted[0][0])}s already out, it's committed to that plan.`);
    }
  }

  const goldenCount = board.filter((m) => m.golden).length;
  if (goldenCount > 0) {
    notes.push(`It's already tripled into ${goldenCount} golden minion${goldenCount > 1 ? "s" : ""} this game.`);
  }

  if (player.health <= 12) {
    notes.push(`At ${player.health} health, it's playing for survival more than greed right now.`);
  } else if (player.health >= 27 && ctx.round >= 4) {
    notes.push(`Sitting healthy at ${player.health}, it can afford to take a risk here.`);
  }

  if (ctx.round >= 8) {
    notes.push(`This deep into the lobby (round ${ctx.round}), every decision matters more.`);
  }

  return notes.length > 0 ? pick(notes) : null;
}

export function renderCommentary(
  action: GameAction,
  preActionPlayer: PlayerState,
  decision: DecisionResult,
  profile: AgentProfile,
  ctx: FeatureContext,
  gamesPlayed?: number,
): { text: string; explanation: DecisionExplanation } {
  const actionLabel = describeAction(action, preActionPlayer);
  const topFactors = differentiatingFactors(profile.weights, decision);
  const reasonClause = buildReasonClause(topFactors.map((f) => factorClause(f.key, f.contribution)));

  const sentence = reasonClause ? `${actionLabel}, ${reasonClause}.` : `${actionLabel}.`;

  const extraCandidates: (string | null)[] = [
    decision.exploratory ? "It's deliberately trying a less obvious line here to keep exploring." : null,
    ctx.winProb != null && (action.kind === "endTurn" || action.kind === "upgrade") ? `It reads its next matchup at roughly a ${Math.round(ctx.winProb * 100)}% chance to win.` : null,
    contextualDetail(preActionPlayer, ctx),
    gamesPlayed != null && gamesPlayed > 0 ? `This kind of read has been shaped by ${gamesPlayed.toLocaleString()} games of self-play so far.` : null,
  ];
  const extra = extraCandidates.find((c) => c != null) ?? null;
  const showExtra = extra != null && (extra === extraCandidates[0] || Math.random() < 0.35);

  const text = showExtra && extra ? `${sentence} ${extra}` : sentence;

  const explanation: DecisionExplanation = {
    actionLabel,
    topFactors: topFactors.map(({ label, weight, contribution }) => ({ label, weight, contribution })),
    valueEstimate: decision.chosen.finalValue,
    winProbEstimate: ctx.winProb,
    note: showExtra ? extra : null,
  };

  return { text, explanation };
}
