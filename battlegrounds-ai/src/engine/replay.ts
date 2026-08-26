import type { GameEvent, PlayerSnapshot } from "@/engine/types";

export interface ArenaDisplayState {
  round: number;
  players: Record<number, PlayerSnapshot>;
  currentEvent: GameEvent | null;
  finished: boolean;
  winnerSeat: number | null;
  placements: Record<number, number> | null;
}

export function deriveDisplayState(events: GameEvent[], uptoIndex: number, initialRoster: PlayerSnapshot[] = []): ArenaDisplayState {
  const players: Record<number, PlayerSnapshot> = {};
  for (const p of initialRoster) players[p.seat] = p;
  let round = 0;
  let finished = false;
  let winnerSeat: number | null = null;
  let placements: Record<number, number> | null = null;

  const last = Math.min(uptoIndex, events.length - 1);
  for (let i = 0; i <= last; i++) {
    const e = events[i];
    switch (e.type) {
      case "roundStart":
        round = e.round;
        break;
      case "recruitAction":
        players[e.seat] = e.snapshot;
        break;
      case "combatResult":
        if (players[e.seat]) {
          players[e.seat] = { ...players[e.seat], health: e.heroHealthAfter };
        }
        break;
      case "playerEliminated":
        if (players[e.seat]) {
          players[e.seat] = { ...players[e.seat], alive: false, placement: e.placement };
        }
        break;
      case "gameOver":
        finished = true;
        winnerSeat = e.winnerSeat;
        placements = e.placements;
        break;
    }
  }

  return { round, players, currentEvent: last >= 0 ? events[last] : null, finished, winnerSeat, placements };
}

export function recruitActionsUpToRound(events: GameEvent[], uptoIndex: number, seat: number, limit: number) {
  const out: Extract<GameEvent, { type: "recruitAction" }>[] = [];
  const last = Math.min(uptoIndex, events.length - 1);
  for (let i = last; i >= 0 && out.length < limit; i--) {
    const e = events[i];
    if (e.type === "recruitAction" && e.seat === seat && e.commentary) out.push(e);
  }
  return out;
}
