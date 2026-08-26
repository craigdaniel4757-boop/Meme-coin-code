import type { AgentProfile, DecisionExplanation, GameAction, Keyword, MinionInstance, PlayerState, Tribe } from "@/engine/types";
import type { DecisionResult, ScoredAction } from "@/engine/ai/policy";
import type { FeatureContext } from "@/engine/ai/features";
import { FEATURE_DEFS } from "@/engine/ai/features";
import { tribeMeta } from "@/engine/data/tribes";
import { KEYWORD_META } from "@/engine/data/keywords";
import { getHeroDef } from "@/engine/data/heroes";

function tribeLabel(t: Tribe): string {
  return tribeMeta(t).label;
}

function baseActionLabel(action: GameAction, player: PlayerState): string {
  switch (action.kind) {
    case "buy": {
      const m = player.shop[action.shopIndex ?? -1];
      if (!m) return "Considers the tavern offer";
      const goldTxt = m.golden ? " golden" : "";
      return `Buys **${m.name}** (${m.attack}/${m.health}${goldTxt}, ${tribeLabel(m.tribe)})`;
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

function compareFactors(weights: number[], chosen: ScoredAction, alt: ScoredAction): FactorRow[] {
  const rows = FEATURE_DEFS.map((def, i) => ({
    key: def.key,
    label: def.label,
    weight: weights[i],
    contribution: weights[i] * (chosen.features[i] - alt.features[i]),
  })).filter((r) => r.key !== "bias" && Math.abs(r.contribution) > 0.008);
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return rows.slice(0, 3);
}

/** Best-scoring alternative of any kind, used when there's no same-kind peer to name. */
function pickBestAlt(decision: DecisionResult): ScoredAction | null {
  const { chosen, alternatives } = decision;
  if (alternatives.length < 2) return null;
  return chosen === alternatives[0] ? alternatives[1] : alternatives[0];
}

const KEY_KEYWORDS: Keyword[] = ["Taunt", "DivineShield", "Poisonous", "Reborn", "Windfury", "MegaWindfury", "Avenge", "Frenzy", "Stealth"];

function concreteMinionComparison(chosen: MinionInstance, rejected: MinionInstance, boardBefore: MinionInstance[]): string[] {
  const clauses: string[] = [];

  if (chosen.tribe !== rejected.tribe && chosen.tribe !== "None") {
    const n = boardBefore.filter((m) => m.tribe === chosen.tribe || m.tribe === "All").length;
    if (n >= 1) clauses.push(`the ${n} other ${tribeLabel(chosen.tribe)}${n > 1 ? "s" : ""} it already has on board`);
    else clauses.push(`starting to lean into ${tribeLabel(chosen.tribe)}`);
  }

  const chosenStats = chosen.attack + chosen.health;
  const rejectedStats = rejected.attack + rejected.health;
  const delta = chosenStats - rejectedStats;
  if (delta >= 2) {
    clauses.push(`the extra ${delta} combined stats (${chosen.attack}/${chosen.health} vs ${rejected.attack}/${rejected.health})`);
  } else if (delta <= -2) {
    clauses.push(`the tribe fit, even giving up ${Math.abs(delta)} stats for it (${chosen.attack}/${chosen.health} vs ${rejected.attack}/${rejected.health})`);
  }

  const chosenOnlyKeywords = chosen.keywords.filter((k) => KEY_KEYWORDS.includes(k) && !rejected.keywords.includes(k));
  if (chosenOnlyKeywords.length > 0) {
    clauses.push(`the ${KEYWORD_META[chosenOnlyKeywords[0]].label} it brings`);
  }

  if (chosen.golden && !rejected.golden) clauses.push("its golden stats");

  return clauses;
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
  (a, b) => `for ${a}, and ${b}`,
];

const SINGLE_CONNECTORS: ((a: string) => string)[] = [(a) => `weighing ${a}`, (a) => `driven mainly by ${a}`, (a) => `leaning on ${a}`, (a) => `for ${a}`, (a) => `swayed by ${a}`];

function buildReasonClause(clauses: string[]): string | null {
  const trimmed = clauses.slice(0, 2);
  if (trimmed.length === 0) return null;
  if (trimmed.length === 1) return pick(SINGLE_CONNECTORS)(trimmed[0]);
  return pick(PAIR_CONNECTORS)(trimmed[0], trimmed[1]);
}

function joinClauses(clauses: string[]): string | null {
  const trimmed = clauses.slice(0, 2);
  if (trimmed.length === 0) return null;
  return trimmed.join(", and ");
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

const CLOSE_CALL_STANDALONE = ["It's a close call between the two, but this edges it.", "There's not much separating the two — this one reads marginally better.", "Both looked similar; this one came out just ahead."];

/** For buy/sell: name the specific alternative it passed up and compare directly against it. Skips identical duplicate copies — comparing a card to itself explains nothing. */
function buildNamedComparisonSentence(action: GameAction, player: PlayerState, decision: DecisionResult, weights: number[]): { sentence: string; usedAlt: ScoredAction } | null {
  if (action.kind === "buy") {
    const chosen = player.shop[action.shopIndex ?? -1];
    if (!chosen) return null;
    const peerAlt = decision.alternatives.find(
      (a) => a.action.kind === "buy" && a !== decision.chosen && player.shop[a.action.shopIndex ?? -1]?.defId !== chosen.defId,
    );
    if (!peerAlt) return null;
    const rejected = player.shop[peerAlt.action.shopIndex ?? -1];
    if (!rejected) return null;

    const goldTxt = chosen.golden ? " golden" : "";
    const concrete = concreteMinionComparison(chosen, rejected, player.board);
    const abstract = compareFactors(weights, decision.chosen, peerAlt).map((f) => factorClause(f.key, f.contribution));
    const reason = buildReasonClause([...concrete, ...abstract]);
    const lead = `Buys **${chosen.name}** (${chosen.attack}/${chosen.health}${goldTxt}, ${tribeLabel(chosen.tribe)}) over **${rejected.name}**`;
    const sentence = reason ? `${lead}, ${reason}.` : `${lead}. ${pick(CLOSE_CALL_STANDALONE)}`;
    return { sentence, usedAlt: peerAlt };
  }

  if (action.kind === "sell") {
    const chosen = player.board[action.boardIndex ?? -1];
    if (!chosen) return null;
    const peerAlt = decision.alternatives.find(
      (a) => a.action.kind === "sell" && a !== decision.chosen && player.board[a.action.boardIndex ?? -1]?.defId !== chosen.defId,
    );
    if (!peerAlt) return null;
    const kept = player.board[peerAlt.action.boardIndex ?? -1];
    if (!kept) return null;

    const concrete = concreteMinionComparison(kept, chosen, player.board);
    const abstract = compareFactors(weights, decision.chosen, peerAlt).map((f) => factorClause(f.key, f.contribution));
    const reason = joinClauses([...concrete, ...abstract]);
    const lead = `Sells **${chosen.name}** rather than **${kept.name}**`;
    const sentence = reason ? `${lead}, keeping the latter for ${reason}.` : `${lead}. ${pick(CLOSE_CALL_STANDALONE)}`;
    return { sentence, usedAlt: peerAlt };
  }

  return null;
}

export function renderCommentary(
  action: GameAction,
  preActionPlayer: PlayerState,
  decision: DecisionResult,
  profile: AgentProfile,
  ctx: FeatureContext,
  gamesPlayed?: number,
): { text: string; explanation: DecisionExplanation } {
  const actionLabel = baseActionLabel(action, preActionPlayer);
  const named = buildNamedComparisonSentence(action, preActionPlayer, decision, profile.weights);

  let sentence: string;
  let topFactors: FactorRow[];

  if (named) {
    sentence = named.sentence;
    topFactors = compareFactors(profile.weights, decision.chosen, named.usedAlt);
  } else {
    const alt = pickBestAlt(decision);
    topFactors = alt ? compareFactors(profile.weights, decision.chosen, alt) : rawStateFactors(profile.weights, decision.chosen.features);
    const reasonClause = buildReasonClause(topFactors.map((f) => factorClause(f.key, f.contribution)));
    if (reasonClause) sentence = `${actionLabel}, ${reasonClause}.`;
    else if (alt) sentence = `${actionLabel}. ${pick(CLOSE_CALL_STANDALONE)}`;
    else sentence = `${actionLabel}.`;
  }

  const extraCandidates: (string | null)[] = [
    decision.exploratory ? "It's deliberately trying a less obvious line here to keep exploring." : null,
    ctx.winProb != null && (action.kind === "endTurn" || action.kind === "upgrade") ? `It reads its next matchup at roughly a ${Math.round(ctx.winProb * 100)}% chance to win.` : null,
    contextualDetail(preActionPlayer, ctx),
    gamesPlayed != null && gamesPlayed > 0 ? `This kind of read has been shaped by ${gamesPlayed.toLocaleString()} games of self-play so far.` : null,
  ];
  const extra = extraCandidates.find((c) => c != null) ?? null;
  const showExtra = extra != null && (extra === extraCandidates[0] || Math.random() < 0.3);

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
