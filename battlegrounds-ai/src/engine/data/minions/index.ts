import type { MinionDef } from "@/engine/types";
import { BEAST_MINIONS, BEAST_TOKENS } from "./beast";
import { MURLOC_MINIONS, MURLOC_TOKENS } from "./murloc";
import { DEMON_MINIONS, DEMON_TOKENS } from "./demon";
import { MECH_MINIONS, MECH_TOKENS } from "./mech";
import { DRAGON_MINIONS } from "./dragon";
import { ELEMENTAL_MINIONS } from "./elemental";
import { PIRATE_MINIONS } from "./pirate";
import { NAGA_MINIONS } from "./naga";
import { QUILBOAR_MINIONS } from "./quilboar";
import { UNDEAD_MINIONS } from "./undead";
import { GENERAL_MINIONS } from "./general";

export const ALL_MINION_DEFS: MinionDef[] = [
  ...BEAST_MINIONS,
  ...BEAST_TOKENS,
  ...MURLOC_MINIONS,
  ...MURLOC_TOKENS,
  ...DEMON_MINIONS,
  ...DEMON_TOKENS,
  ...MECH_MINIONS,
  ...MECH_TOKENS,
  ...DRAGON_MINIONS,
  ...ELEMENTAL_MINIONS,
  ...PIRATE_MINIONS,
  ...NAGA_MINIONS,
  ...QUILBOAR_MINIONS,
  ...UNDEAD_MINIONS,
  ...GENERAL_MINIONS,
];

export const MINION_BY_ID: Record<string, MinionDef> = Object.fromEntries(ALL_MINION_DEFS.map((m) => [m.id, m]));

export function getMinionDef(id: string): MinionDef {
  const def = MINION_BY_ID[id];
  if (!def) throw new Error(`Unknown minion def: ${id}`);
  return def;
}

export const PURCHASABLE_MINIONS: MinionDef[] = ALL_MINION_DEFS.filter((m) => m.purchasable !== false);

export function minionsForTier(tier: number): MinionDef[] {
  return PURCHASABLE_MINIONS.filter((m) => m.tier === tier);
}

export const MAX_MINION_TIER = Math.max(...PURCHASABLE_MINIONS.map((m) => m.tier));
