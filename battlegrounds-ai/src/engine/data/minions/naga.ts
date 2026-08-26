import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { castMinorTavernSpell as spellcraft } from "@/engine/data/effectHelpers";

export const NAGA_MINIONS: MinionDef[] = [
  {
    id: "naga-tidepool-mystic",
    name: "Tidepool Mystic",
    tier: 1,
    tribe: "Naga",
    attack: 2,
    health: 3,
    keywords: [],
    text: "Spellcraft: Battlecry casts a random minor tavern spell.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: { battlecry: spellcraft() },
  },
  {
    id: "naga-scaleguard",
    name: "Scaleguard",
    tier: 2,
    tribe: "Naga",
    attack: 3,
    health: 4,
    keywords: ["Taunt"],
    text: "Taunt.",
    poolCopies: POOL_COPIES_BY_TIER[2],
  },
  {
    id: "naga-riptide-adept",
    name: "Riptide Adept",
    tier: 2,
    tribe: "Naga",
    attack: 3,
    health: 3,
    keywords: [],
    text: "Spellcraft: Battlecry casts a random minor tavern spell, twice.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      battlecry: (ctx) => {
        spellcraft()(ctx);
        spellcraft()(ctx);
      },
    },
  },
  {
    id: "naga-shellforged-warrior",
    name: "Shellforged Warrior",
    tier: 3,
    tribe: "Naga",
    attack: 4,
    health: 4,
    keywords: [],
    text: "Shell: Start of Combat, gain +4/+4 that fades if this survives the first clash unshaken.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      startOfCombat: (ctx) => {
        ctx.api.buff(ctx.self, 4, 4);
        ctx.log(`${ctx.self.name}'s shell hardens (+4/+4).`);
      },
    },
  },
  {
    id: "naga-abyssal-siren",
    name: "Abyssal Siren",
    tier: 3,
    tribe: "Naga",
    attack: 3,
    health: 5,
    keywords: [],
    text: "Battlecry: Give a friendly Naga +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      battlecry: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && (m.tribe === "Naga" || m.tribe === "All"));
        if (pool.length === 0) return;
        ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 3, 3);
      },
    },
  },
  {
    id: "naga-tidal-conjurer",
    name: "Tidal Conjurer",
    tier: 4,
    tribe: "Naga",
    attack: 5,
    health: 5,
    keywords: [],
    text: "Spellcraft: Battlecry casts a random minor tavern spell, twice.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      battlecry: (ctx) => {
        spellcraft()(ctx);
        spellcraft()(ctx);
      },
    },
  },
  {
    id: "naga-deepwater-behemoth",
    name: "Deepwater Behemoth",
    tier: 4,
    tribe: "Naga",
    attack: 6,
    health: 6,
    keywords: ["Taunt", "Poisonous"],
    text: "Taunt. Poisonous.",
    poolCopies: POOL_COPIES_BY_TIER[4],
  },
  {
    id: "naga-stormtide-empress",
    name: "Stormtide Empress",
    tier: 5,
    tribe: "Naga",
    attack: 6,
    health: 7,
    keywords: [],
    text: "Start of Combat: Give your Nagas +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: {
      startOfCombat: (ctx) => {
        for (const m of ctx.owner.board) if (m.tribe === "Naga" || m.tribe === "All") ctx.api.buff(m, 3, 3);
        ctx.log(`${ctx.self.name} calls the tide.`);
      },
    },
  },
  {
    id: "naga-leviathan-queen",
    name: "Leviathan Queen",
    tier: 6,
    tribe: "Naga",
    attack: 8,
    health: 8,
    keywords: [],
    text: "Shell: Start of Combat, gain +8/+8.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      startOfCombat: (ctx) => {
        ctx.api.buff(ctx.self, 8, 8);
        ctx.log(`${ctx.self.name} surfaces in full, terrible glory.`);
      },
    },
  },
];
