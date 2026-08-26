import type { RNG } from "@/lib/rng";
import type { AgentProfile, DecisionExplanation, GameEvent, GameState, HeroTrajectoryStep, MinionInstance, PlayerState } from "@/engine/types";
import { applyAction, snapshotPlayer, startTurnReset } from "@/engine/shop";
import { estimateWinProbability } from "@/engine/combat";
import { decideAction } from "@/engine/ai/policy";
import { renderCommentary } from "@/engine/ai/commentary";
import type { FeatureContext } from "@/engine/ai/features";

const MAX_ACTIONS_PER_TURN = 40;
const WIN_PROB_ITERATIONS = 8;

export interface TurnResult {
  events: GameEvent[];
  trajectorySteps: HeroTrajectoryStep[];
}

export function runRecruitPhase(
  game: GameState,
  player: PlayerState,
  profile: AgentProfile,
  rng: RNG,
  round: number,
  scouting: { board: MinionInstance[]; tier: number } | null,
  explorationOverride: number | undefined,
  learnerGamesPlayed: number | undefined,
): TurnResult {
  startTurnReset(game, player, rng);

  const winProb = scouting && player.board.length > 0 ? estimateWinProbability(player.board, scouting.board, player.tavernTier, scouting.tier, rng, WIN_PROB_ITERATIONS).winRate : null;
  const ctx: FeatureContext = { round, winProb };

  const events: GameEvent[] = [];
  const trajectorySteps: HeroTrajectoryStep[] = [];

  while (player.actionsThisTurn < MAX_ACTIONS_PER_TURN) {
    const decision = decideAction(game, player, profile, rng, ctx, explorationOverride);
    const action = decision.chosen.action;

    let commentary: string | null = null;
    let reasoning: DecisionExplanation | null = null;
    if (player.isLearner) {
      const rendered = renderCommentary(action, player, decision, profile, ctx, learnerGamesPlayed);
      commentary = rendered.text;
      reasoning = rendered.explanation;
    }

    applyAction(game, player, action, rng);

    events.push({
      type: "recruitAction",
      round,
      seat: player.seat,
      action,
      commentary,
      reasoning,
      snapshot: snapshotPlayer(player),
    });

    if (player.isLearner) {
      trajectorySteps.push({ round, features: decision.chosen.features, valuePred: decision.chosen.finalValue, combatRewardAfter: null });
    }

    if (action.kind === "endTurn") break;
  }

  return { events, trajectorySteps };
}
