import type { RNG } from "@/lib/rng";
import type { MinionInstance, PlayerState } from "@/engine/types";

export interface GhostBoard {
  sourceSeat: number;
  sourceName: string;
  board: MinionInstance[];
  tavernTier: number;
}

export interface Pairing {
  seatA: number;
  seatB: number | null;
  ghost: GhostBoard | null;
}

export function makePairings(alive: PlayerState[], rng: RNG, ghosts: GhostBoard[]): Pairing[] {
  const seats = rng.shuffle(alive.map((p) => p.seat));
  const pairings: Pairing[] = [];

  if (seats.length % 2 === 1) {
    const soloSeat = seats.pop();
    if (soloSeat !== undefined) {
      const ghost = ghosts.length > 0 ? ghosts[rng.int(ghosts.length)] : null;
      pairings.push({ seatA: soloSeat, seatB: null, ghost });
    }
  }

  for (let i = 0; i < seats.length; i += 2) {
    pairings.push({ seatA: seats[i], seatB: seats[i + 1], ghost: null });
  }

  return pairings;
}
