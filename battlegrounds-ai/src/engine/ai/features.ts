import type { MinionInstance, PlayerState, Tribe } from "@/engine/types";
import { getMinionDef } from "@/engine/data/minions";
import { MAX_BOARD_SIZE, MAX_TAVERN_TIER } from "@/engine/data/constants";
import { expectedStatsForRound, expectedTierForRound } from "@/engine/ai/curves";

export interface FeatureDef {
  key: string;
  label: string;
  positiveHint: string;
  negativeHint: string;
}

export const FEATURE_DEFS: FeatureDef[] = [
  { key: "bias", label: "Baseline Confidence", positiveHint: "generally favors taking action", negativeHint: "generally favors passing" },
  { key: "totalStats", label: "Total Board Stats", positiveHint: "raw stats", negativeHint: "raw stats" },
  { key: "curveStats", label: "Stats vs. Round Curve", positiveHint: "being ahead of curve on stats", negativeHint: "being behind curve on stats" },
  { key: "boardFullness", label: "Board Fullness", positiveHint: "filling the board", negativeHint: "keeping the board open" },
  { key: "tauntDensity", label: "Taunt Density", positiveHint: "Taunt coverage", negativeHint: "Taunt coverage" },
  { key: "divineShieldDensity", label: "Divine Shield Density", positiveHint: "Divine Shield value", negativeHint: "Divine Shield value" },
  { key: "poisonousDensity", label: "Poisonous Density", positiveHint: "Poisonous threats", negativeHint: "Poisonous threats" },
  { key: "rebornDensity", label: "Reborn Density", positiveHint: "Reborn value", negativeHint: "Reborn value" },
  { key: "windfuryDensity", label: "Windfury Density", positiveHint: "Windfury damage", negativeHint: "Windfury damage" },
  { key: "deathrattleDensity", label: "Deathrattle Density", positiveHint: "Deathrattle value", negativeHint: "Deathrattle value" },
  { key: "topTribeCommitment", label: "Primary Tribe Commitment", positiveHint: "committing to one tribe", negativeHint: "staying flexible" },
  { key: "secondTribeCommitment", label: "Secondary Tribe Support", positiveHint: "a secondary tribe package", negativeHint: "a secondary tribe package" },
  { key: "tribeDiversity", label: "Board Diversity", positiveHint: "a spread of minion types", negativeHint: "a focused board" },
  { key: "tavernTierLevel", label: "Tavern Tier", positiveHint: "tavern level", negativeHint: "tavern level" },
  { key: "curveTiming", label: "Tier vs. Round Curve", positiveHint: "being ahead on tavern curve", negativeHint: "being behind on tavern curve" },
  { key: "goldSpentRatio", label: "Gold Efficiency", positiveHint: "spending its gold down", negativeHint: "banking gold" },
  { key: "healthSafety", label: "Health Safety Margin", positiveHint: "a healthy life total", negativeHint: "a pressured life total" },
  { key: "combatWinProb", label: "Estimated Win Probability", positiveHint: "a favorable next matchup", negativeHint: "a difficult next matchup" },
  { key: "goldenValue", label: "Golden Minion Value", positiveHint: "golden minions", negativeHint: "golden minions" },
];

export const FEATURE_COUNT = FEATURE_DEFS.length;

function densityOf(board: MinionInstance[], pred: (m: MinionInstance) => boolean): number {
  if (board.length === 0) return 0;
  return board.filter(pred).length / board.length;
}

function tribeCounts(board: MinionInstance[]): Map<Tribe, number> {
  const map = new Map<Tribe, number>();
  for (const m of board) {
    if (m.tribe === "None") continue;
    map.set(m.tribe, (map.get(m.tribe) ?? 0) + 1);
  }
  return map;
}

export interface FeatureContext {
  round: number;
  winProb: number | null;
}

export function extractFeatures(player: PlayerState, ctx: FeatureContext): number[] {
  const board = player.board;
  const totalStats = board.reduce((s, m) => s + m.attack + m.health, 0);
  const expectedStats = expectedStatsForRound(ctx.round);
  const curveStats = clamp((totalStats - expectedStats) / Math.max(1, expectedStats), -2, 2);

  const counts = tribeCounts(board);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;

  const expectedTier = expectedTierForRound(ctx.round);
  const curveTiming = clamp((player.tavernTier - expectedTier) / MAX_TAVERN_TIER, -1, 1);

  const goldenCount = board.filter((m) => m.golden).length;

  const values = [
    1,
    totalStats / 20,
    curveStats,
    board.length / MAX_BOARD_SIZE,
    densityOf(board, (m) => m.keywords.includes("Taunt")),
    densityOf(board, (m) => m.keywords.includes("DivineShield")),
    densityOf(board, (m) => m.keywords.includes("Poisonous")),
    densityOf(board, (m) => m.keywords.includes("Reborn")),
    densityOf(board, (m) => m.keywords.includes("Windfury") || m.keywords.includes("MegaWindfury")),
    densityOf(board, (m) => Boolean(getMinionDef(m.defId).effects?.deathrattle)),
    board.length > 0 ? top / board.length : 0,
    board.length > 0 ? second / board.length : 0,
    board.length > 0 ? counts.size / board.length : 0,
    player.tavernTier / MAX_TAVERN_TIER,
    curveTiming,
    1 - player.gold / Math.max(1, player.goldCap),
    player.health / player.maxHealth,
    ctx.winProb ?? 0.5,
    goldenCount / MAX_BOARD_SIZE,
  ];

  return values;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
