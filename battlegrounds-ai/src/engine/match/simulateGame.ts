import { createRng } from "@/lib/rng";
import type { AgentProfile, GameEvent, HeroTrajectoryStep, MinionInstance, PlayerSnapshot, PlayerState } from "@/engine/types";
import { createLobby } from "@/engine/match/lobby";
import { makePairings, type GhostBoard } from "@/engine/match/pairing";
import { runRecruitPhase } from "@/engine/match/turnEngine";
import { applyCombatResultToBoard, simulateCombat } from "@/engine/combat";
import { advanceGoldCap, snapshotPlayer } from "@/engine/shop";
import { deriveArchetypeLabel } from "@/engine/ai/learning";
import { getHeroDef } from "@/engine/data/heroes";

const MAX_ROUNDS = 40;

export interface GameResult {
  events: GameEvent[];
  initialRoster: PlayerSnapshot[];
  placements: Record<number, number>;
  learnerSeat: number;
  learnerPlacement: number;
  learnerTrajectory: HeroTrajectoryStep[];
  learnerArchetype: string;
  roundsPlayed: number;
}

function cloneBoardForScouting(board: MinionInstance[]): MinionInstance[] {
  return board.map((m) => ({ ...m, keywords: [...m.keywords] }));
}

export function simulateGame(seed: number, learnerProfile: AgentProfile, explorationOverride: number | undefined, learnerGamesPlayed: number | undefined): GameResult {
  const rng = createRng(seed);
  const { game, profiles } = createLobby(seed, rng, learnerProfile);
  const events: GameEvent[] = [];
  const learnerTrajectory: HeroTrajectoryStep[] = [];
  const learnerPlayer = game.players.find((p) => p.isLearner);
  if (!learnerPlayer) throw new Error("Lobby has no learner seat");
  const learnerSeat = learnerPlayer.seat;
  const initialRoster = game.players.map((p) => snapshotPlayer(p));

  const ghosts: GhostBoard[] = [];
  const byeSeats = new Set<number>();

  while (game.round < MAX_ROUNDS) {
    game.round += 1;
    events.push({ type: "roundStart", round: game.round });

    const alive = game.players.filter((p) => p.alive);
    if (alive.length <= 1) break;

    const pairings = makePairings(alive, rng, ghosts);
    const byId = new Map(game.players.map((p) => [p.seat, p]));
    const scoutMap = new Map<number, { board: MinionInstance[]; tier: number }>();
    byeSeats.clear();
    for (const pairing of pairings) {
      const a = byId.get(pairing.seatA)!;
      if (pairing.seatB !== null) {
        const b = byId.get(pairing.seatB)!;
        scoutMap.set(a.seat, { board: cloneBoardForScouting(b.board), tier: b.tavernTier });
        scoutMap.set(b.seat, { board: cloneBoardForScouting(a.board), tier: a.tavernTier });
      } else if (pairing.ghost) {
        scoutMap.set(a.seat, { board: cloneBoardForScouting(pairing.ghost.board), tier: pairing.ghost.tavernTier });
      } else {
        byeSeats.add(a.seat);
      }
    }

    for (const player of alive) {
      const profile = profiles[player.seat];
      const isLearner = player.isLearner;
      const result = runRecruitPhase(game, player, profile, rng, game.round, scoutMap.get(player.seat) ?? null, isLearner ? explorationOverride : undefined, isLearner ? learnerGamesPlayed : undefined);
      events.push(...result.events);
      if (isLearner) {
        learnerTrajectory.push(...result.trajectorySteps);
      }
    }

    for (const pairing of pairings) {
      const a = byId.get(pairing.seatA)!;
      if (byeSeats.has(a.seat)) continue;

      const heroA = getHeroDef(a.heroId).name;
      if (pairing.seatB !== null) {
        const b = byId.get(pairing.seatB)!;
        const heroB = getHeroDef(b.heroId).name;
        const preA = cloneBoardForScouting(a.board);
        const preB = cloneBoardForScouting(b.board);
        const outcome = simulateCombat(a.board, b.board, a.tavernTier, b.tavernTier, a.seat, b.seat, heroA, heroB, rng);

        a.board = applyCombatResultToBoard(a.board, { deadIids: outcome.deadIidsA, dsPoppedIids: outcome.dsPoppedIidsA, frenzyIids: outcome.frenzyIidsA });
        b.board = applyCombatResultToBoard(b.board, { deadIids: outcome.deadIidsB, dsPoppedIids: outcome.dsPoppedIidsB, frenzyIids: outcome.frenzyIidsB });

        const resultA = outcome.result === "A" ? "win" : outcome.result === "B" ? "loss" : "tie";
        const resultB = outcome.result === "B" ? "win" : outcome.result === "A" ? "loss" : "tie";
        const dmgA = resultA === "loss" ? outcome.damage : 0;
        const dmgB = resultB === "loss" ? outcome.damage : 0;
        a.health -= dmgA;
        b.health -= dmgB;
        a.lastCombatResult = resultA;
        b.lastCombatResult = resultB;

        events.push({ type: "combatResult", round: game.round, seat: a.seat, opponentSeat: b.seat, result: resultA, damage: dmgA, log: outcome.log, heroBoardBefore: preA, enemyBoardBefore: preB, heroHealthAfter: a.health });
        events.push({ type: "combatResult", round: game.round, seat: b.seat, opponentSeat: a.seat, result: resultB, damage: dmgB, log: outcome.log, heroBoardBefore: preB, enemyBoardBefore: preA, heroHealthAfter: b.health });

        applyLearnerShaping(a, resultA, learnerTrajectory, game.round);
        applyLearnerShaping(b, resultB, learnerTrajectory, game.round);
      } else if (pairing.ghost) {
        const ghost = pairing.ghost;
        const preA = cloneBoardForScouting(a.board);
        const outcome = simulateCombat(a.board, ghost.board, a.tavernTier, ghost.tavernTier, a.seat, -1, heroA, "ghost", rng);
        a.board = applyCombatResultToBoard(a.board, { deadIids: outcome.deadIidsA, dsPoppedIids: outcome.dsPoppedIidsA, frenzyIids: outcome.frenzyIidsA });
        const resultA = outcome.result === "A" ? "win" : outcome.result === "B" ? "loss" : "tie";
        const dmgA = resultA === "loss" ? outcome.damage : 0;
        a.health -= dmgA;
        a.lastCombatResult = resultA;
        events.push({ type: "combatResult", round: game.round, seat: a.seat, opponentSeat: null, result: resultA, damage: dmgA, log: outcome.log, heroBoardBefore: preA, enemyBoardBefore: ghost.board, heroHealthAfter: a.health });
        applyLearnerShaping(a, resultA, learnerTrajectory, game.round);
      }
    }

    const newlyDead = alive.filter((p) => p.alive && p.health <= 0);
    if (newlyDead.length > 0) {
      newlyDead.sort((x, y) => y.health - x.health);
      const baseline = alive.length;
      newlyDead.forEach((p, i) => {
        p.alive = false;
        p.placement = baseline - newlyDead.length + 1 + i;
        events.push({ type: "playerEliminated", round: game.round, seat: p.seat, placement: p.placement });
        ghosts.push({ sourceSeat: p.seat, sourceName: p.name, board: cloneBoardForScouting(p.board), tavernTier: p.tavernTier });
      });
    }

    const stillAlive = game.players.filter((p) => p.alive);
    if (stillAlive.length <= 1) {
      if (stillAlive.length === 1) {
        stillAlive[0].placement = 1;
        events.push({ type: "playerEliminated", round: game.round, seat: stillAlive[0].seat, placement: 1 });
      }
      break;
    }
    for (const p of stillAlive) advanceGoldCap(p);
  }

  const unresolved = game.players.filter((p) => p.placement === null);
  if (unresolved.length > 0) {
    unresolved.sort((a, b) => b.health - a.health);
    unresolved.forEach((p, i) => {
      p.placement = i + 1;
    });
  }

  const placements: Record<number, number> = {};
  for (const p of game.players) placements[p.seat] = p.placement ?? 8;
  const winner = game.players.find((p) => p.placement === 1);

  events.push({ type: "gameOver", placements, winnerSeat: winner?.seat ?? learnerSeat });

  return {
    events,
    initialRoster,
    placements,
    learnerSeat,
    learnerPlacement: placements[learnerSeat],
    learnerTrajectory,
    learnerArchetype: deriveArchetypeLabel(learnerPlayer),
    roundsPlayed: game.round,
  };
}

function applyLearnerShaping(player: PlayerState, result: "win" | "loss" | "tie", trajectory: HeroTrajectoryStep[], round: number) {
  if (!player.isLearner) return;
  const reward = result === "win" ? 1 : result === "loss" ? -1 : 0;
  for (let i = trajectory.length - 1; i >= 0; i--) {
    if (trajectory[i].round !== round) break;
    trajectory[i].combatRewardAfter = reward;
  }
}
