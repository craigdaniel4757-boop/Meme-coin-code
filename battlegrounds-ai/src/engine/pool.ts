import type { RNG } from "@/lib/rng";
import type { TavernPool } from "@/engine/types";
import { PURCHASABLE_MINIONS } from "@/engine/data/minions";

const TIER_WEIGHTS: Record<number, number[]> = {
  1: [1],
  2: [3, 2],
  3: [3, 3, 2],
  4: [2, 3, 3, 2],
  5: [2, 2, 3, 3, 2],
  6: [1, 2, 2, 3, 3, 2],
};

export function defaultTierWeight(tavernTier: number, minionTier: number): number {
  const row = TIER_WEIGHTS[Math.min(6, Math.max(1, tavernTier))];
  if (!row || minionTier < 1 || minionTier > row.length) return 0;
  return row[minionTier - 1];
}

export function createTavernPool(): TavernPool {
  const counts: Record<string, number> = {};
  for (const def of PURCHASABLE_MINIONS) counts[def.id] = def.poolCopies;
  return poolFromCounts(counts);
}

export function cloneTavernPool(pool: TavernPool): TavernPool {
  return poolFromCounts({ ...pool.counts });
}

function poolFromCounts(counts: Record<string, number>): TavernPool {
  const poolObj: TavernPool = {
    counts,
    take(defId: string) {
      if ((counts[defId] ?? 0) <= 0) return false;
      counts[defId] -= 1;
      return true;
    },
    ret(defId: string, n = 1) {
      counts[defId] = (counts[defId] ?? 0) + n;
    },
    totalAvailable(maxTier: number) {
      let total = 0;
      for (const def of PURCHASABLE_MINIONS) {
        if (def.tier <= maxTier) total += counts[def.id] ?? 0;
      }
      return total;
    },
    drawRandom(rng: RNG, maxTier: number, weightFn: (tier: number) => number, exclude?: Set<string>) {
      const candidates = PURCHASABLE_MINIONS.filter((def) => def.tier <= maxTier && (counts[def.id] ?? 0) > 0 && !exclude?.has(def.id));
      if (candidates.length === 0) return null;
      const weights = candidates.map((def) => weightFn(def.tier) * (counts[def.id] ?? 0));
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return candidates[rng.int(candidates.length)].id;
      let roll = rng.next() * total;
      for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return candidates[i].id;
      }
      return candidates[candidates.length - 1].id;
    },
  };
  return poolObj;
}
