import type { Keyword } from "@/engine/types";

export const KEYWORD_META: Record<Keyword, { label: string; glyph: string; short: string }> = {
  Taunt: { label: "Taunt", glyph: "\u{1F6E1}️", short: "Enemies must attack this first." },
  DivineShield: { label: "Divine Shield", glyph: "✨", short: "Ignores the first instance of damage." },
  Poisonous: { label: "Poisonous", glyph: "☠️", short: "Destroys anything it damages." },
  Windfury: { label: "Windfury", glyph: "\u{1F32A}️", short: "Attacks twice per combat." },
  MegaWindfury: { label: "Mega-Windfury", glyph: "\u{1F32C}️", short: "Attacks four times per combat." },
  Reborn: { label: "Reborn", glyph: "\u{1F49A}", short: "Returns once with 1 health after dying." },
  Stealth: { label: "Stealth", glyph: "\u{1F464}", short: "Can't be attacked until it attacks." },
  Frenzy: { label: "Frenzy", glyph: "⚡", short: "Triggers once the first time it survives damage." },
  Avenge: { label: "Avenge", glyph: "\u{1F3F9}", short: "Triggers after enough friendly minions have died." },
};
