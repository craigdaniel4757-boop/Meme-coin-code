import type { Tribe } from "@/engine/types";

export interface TribeMeta {
  tribe: Tribe;
  label: string;
  glyph: string;
  color: string;
  bg: string;
  ring: string;
  identity: string;
}

export const TRIBE_META: Record<Tribe, TribeMeta> = {
  Beast: {
    tribe: "Beast",
    label: "Beast",
    glyph: "\u{1F43E}",
    color: "#e8b04b",
    bg: "#3a2c12",
    ring: "#e8b04b55",
    identity: "Adapts, buffs a rotating pack, and snowballs stats onto one huge threat.",
  },
  Murloc: {
    tribe: "Murloc",
    label: "Murloc",
    glyph: "\u{1F41F}",
    color: "#3fd6c8",
    bg: "#0f3230",
    ring: "#3fd6c855",
    identity: "Wide, cheap boards that buff themselves faster than anyone can keep up.",
  },
  Demon: {
    tribe: "Demon",
    label: "Demon",
    glyph: "\u{1F47F}",
    color: "#b073e0",
    bg: "#2a1a38",
    ring: "#b073e055",
    identity: "Sacrifices its own board for compounding stats and demonic value.",
  },
  Mech: {
    tribe: "Mech",
    label: "Mech",
    glyph: "⚙️",
    color: "#7fb8e0",
    bg: "#132631",
    ring: "#7fb8e055",
    identity: "Divine Shields and Deathrattles stacked into a wall that refuses to die.",
  },
  Dragon: {
    tribe: "Dragon",
    label: "Dragon",
    glyph: "\u{1F409}",
    color: "#e07a5f",
    bg: "#3a1f16",
    ring: "#e07a5f55",
    identity: "Heavy single bodies and board-wide buffs for a top-heavy late game.",
  },
  Elemental: {
    tribe: "Elemental",
    label: "Elemental",
    glyph: "\u{1F525}",
    color: "#f2a541",
    bg: "#3a2409",
    ring: "#f2a54155",
    identity: "Rewards buying multiple Elementals a turn with chained bonus effects.",
  },
  Pirate: {
    tribe: "Pirate",
    label: "Pirate",
    glyph: "☠️",
    color: "#5b8fd6",
    bg: "#10203a",
    ring: "#5b8fd655",
    identity: "Windfury and treasure-driven tempo that hits hard early and often.",
  },
  Naga: {
    tribe: "Naga",
    label: "Naga",
    glyph: "\u{1F30A}",
    color: "#4fc3c9",
    bg: "#0d2f31",
    ring: "#4fc3c955",
    identity: "Spellcraft and Shell effects that trade board presence for raw power.",
  },
  Quilboar: {
    tribe: "Quilboar",
    label: "Quilboar",
    glyph: "\u{1F417}",
    color: "#c98a4b",
    bg: "#33220f",
    ring: "#c98a4b55",
    identity: "Blood Gems stack burst buffs onto Taunts for an explosive midgame.",
  },
  Undead: {
    tribe: "Undead",
    label: "Undead",
    glyph: "\u{1F480}",
    color: "#7fd68a",
    bg: "#132a17",
    ring: "#7fd68a55",
    identity: "Reborn chains and death triggers that get two fights out of one board.",
  },
  All: {
    tribe: "All",
    label: "Amalgam",
    glyph: "✨",
    color: "#d9c569",
    bg: "#302c10",
    ring: "#d9c56955",
    identity: "Counts as every tribe at once — the universal synergy piece.",
  },
  None: {
    tribe: "None",
    label: "Neutral",
    glyph: "◆",
    color: "#9aa3b2",
    bg: "#1c1f26",
    ring: "#9aa3b255",
    identity: "No tribal synergy, judged purely on raw stats and text.",
  },
};

export function tribeMeta(tribe: Tribe): TribeMeta {
  return TRIBE_META[tribe];
}
