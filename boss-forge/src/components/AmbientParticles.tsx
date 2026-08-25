"use client";

import { useMemo } from "react";
import type { GameId } from "@/types";

interface Particle {
  left: string;
  size: number;
  duration: string;
  delay: string;
  driftX: string;
  opacity: number;
}

function makeParticles(seed: number, count: number): Particle[] {
  // Deterministic pseudo-random so server/client render match (no hydration mismatch).
  let state = seed;
  const rand = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  return Array.from({ length: count }, () => ({
    left: `${(rand() * 100).toFixed(1)}%`,
    size: 2 + rand() * 4,
    duration: `${10 + rand() * 14}s`,
    delay: `${(rand() * 14).toFixed(1)}s`,
    driftX: `${Math.round((rand() - 0.5) * 80)}px`,
    opacity: 0.25 + rand() * 0.45,
  }));
}

const SEED_BY_GAME: Record<GameId, number> = {
  "elden-ring": 42,
  "dark-souls-3": 17,
  terraria: 8,
  palworld: 91,
};

export function AmbientParticles({ gameId }: { gameId: GameId }) {
  const particles = useMemo(() => makeParticles(SEED_BY_GAME[gameId], 22), [gameId]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="particle animate-drift"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size,
              animationDuration: p.duration,
              animationDelay: p.delay,
              "--drift-x": p.driftX,
              "--particle-opacity": p.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
