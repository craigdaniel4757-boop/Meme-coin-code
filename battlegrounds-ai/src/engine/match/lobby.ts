import type { RNG } from "@/lib/rng";
import type { AgentProfile, GameState, PlayerState } from "@/engine/types";
import { createPlayer } from "@/engine/shop";
import { createTavernPool } from "@/engine/pool";
import { HERO_DEFS } from "@/engine/data/heroes";
import { ANOMALY_DEFS } from "@/engine/data/anomalies";
import { pickBaselineAssignment } from "@/engine/ai/baselineProfiles";
import { LOBBY_SIZE } from "@/engine/data/constants";

export interface LobbySetup {
  game: GameState;
  profiles: Record<number, AgentProfile>;
}

export function createLobby(seed: number, rng: RNG, learnerProfile: AgentProfile): LobbySetup {
  const anomaly = ANOMALY_DEFS[rng.int(ANOMALY_DEFS.length)];
  const pool = createTavernPool();
  const shuffledHeroes = rng.shuffle([...HERO_DEFS]).slice(0, LOBBY_SIZE);
  const baselineProfiles = pickBaselineAssignment((n) => rng.int(n));

  const learnerSeat = rng.int(LOBBY_SIZE);
  const players: PlayerState[] = [];
  const profiles: Record<number, AgentProfile> = {};

  for (let seat = 0; seat < LOBBY_SIZE; seat++) {
    const isLearner = seat === learnerSeat;
    const profile = isLearner ? learnerProfile : baselineProfiles[seat > learnerSeat ? seat - 1 : seat];
    const name = isLearner ? "Aurora (learning)" : profile.label;
    const startingTier = anomaly.startingTier ?? 1;
    const goldCapDelta = anomaly.goldCapDelta ?? 0;
    const player = createPlayer(seat, name, shuffledHeroes[seat].id, profile.id, isLearner, startingTier, goldCapDelta);
    players.push(player);
    profiles[seat] = profile;
  }

  const game: GameState = {
    seed,
    round: 0,
    players,
    pool,
    anomaly,
    finished: false,
  };

  return { game, profiles };
}
