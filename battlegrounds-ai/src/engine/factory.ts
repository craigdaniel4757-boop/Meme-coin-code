import type { MinionDef, MinionInstance } from "@/engine/types";

let iidCounter = 0;
export function nextIid(): string {
  iidCounter += 1;
  return `m${iidCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function instantiate(def: MinionDef, golden: boolean, bonus?: { atk?: number; health?: number }): MinionInstance {
  const mult = golden ? 2 : 1;
  const baseAtk = def.attack * mult + (bonus?.atk ?? 0);
  const baseHp = def.health * mult + (bonus?.health ?? 0);
  return {
    iid: nextIid(),
    defId: def.id,
    name: def.name,
    tribe: def.tribe,
    tier: def.tier,
    golden,
    attack: baseAtk,
    health: baseHp,
    maxHealth: baseHp,
    keywords: [...def.keywords],
    frenzyUsed: false,
    avengeThreshold: def.avengeThreshold ?? null,
    avengeProgress: 0,
    justSummoned: true,
    text: def.text,
  };
}

export function cloneInstance(m: MinionInstance): MinionInstance {
  return { ...m, keywords: [...m.keywords] };
}
