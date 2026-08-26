import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { startOfCombatBuffTribe, summonBattlecry } from "@/engine/data/effectHelpers";

export const MURLOC_TOKENS: MinionDef[] = [
  {
    id: "murloc-fry-token",
    name: "Murloc Fry",
    tier: 1,
    tribe: "Murloc",
    attack: 1,
    health: 1,
    keywords: [],
    text: "Blub blub.",
    poolCopies: 0,
    purchasable: false,
  },
];

export const MURLOC_MINIONS: MinionDef[] = [
  {
    id: "murloc-tidewater-scout",
    name: "Tidewater Scout",
    tier: 1,
    tribe: "Murloc",
    attack: 2,
    health: 1,
    keywords: [],
    text: "A quick, cheap fish.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "murloc-coral-caller",
    name: "Coral Caller",
    tier: 1,
    tribe: "Murloc",
    attack: 1,
    health: 2,
    keywords: [],
    text: "Battlecry: Summon a 1/1 Murloc Fry.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: { battlecry: summonBattlecry("murloc-fry-token", 1) },
  },
  {
    id: "murloc-reefscale-warlord",
    name: "Reefscale Warlord",
    tier: 2,
    tribe: "Murloc",
    attack: 3,
    health: 2,
    keywords: [],
    text: "Battlecry: Give your other Murlocs +1/+1.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      battlecry: (ctx) => {
        for (const m of ctx.player.board) {
          if (m.iid !== ctx.self.iid && (m.tribe === "Murloc" || m.tribe === "All")) ctx.api.buffMinion(m, 1, 1);
        }
      },
    },
  },
  {
    id: "murloc-tidal-guardian",
    name: "Tidal Guardian",
    tier: 2,
    tribe: "Murloc",
    attack: 1,
    health: 4,
    keywords: ["Taunt", "DivineShield"],
    text: "Taunt. Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[2],
  },
  {
    id: "murloc-brackish-chanter",
    name: "Brackish Chanter",
    tier: 3,
    tribe: "Murloc",
    attack: 3,
    health: 3,
    keywords: [],
    text: "Battlecry: Give a random friendly Murloc +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      battlecry: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && (m.tribe === "Murloc" || m.tribe === "All"));
        if (pool.length === 0) return;
        ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 2, 2);
      },
    },
  },
  {
    id: "murloc-riptide-thresher",
    name: "Riptide Thresher",
    tier: 3,
    tribe: "Murloc",
    attack: 3,
    health: 4,
    keywords: ["Windfury"],
    text: "Windfury.",
    poolCopies: POOL_COPIES_BY_TIER[3],
  },
  {
    id: "murloc-tideturner-oracle",
    name: "Tideturner Oracle",
    tier: 4,
    tribe: "Murloc",
    attack: 4,
    health: 5,
    keywords: [],
    text: "Start of Combat: Gain +1/+1 for each other friendly Murloc.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      startOfCombat: (ctx) => {
        const n = ctx.owner.board.filter((m) => m.iid !== ctx.self.iid && (m.tribe === "Murloc" || m.tribe === "All")).length;
        if (n > 0) {
          ctx.api.buff(ctx.self, n, n);
          ctx.log(`${ctx.self.name} channels the school (+${n}/+${n}).`);
        }
      },
    },
  },
  {
    id: "murloc-coralback-behemoth",
    name: "Coralback Behemoth",
    tier: 4,
    tribe: "Murloc",
    attack: 5,
    health: 6,
    keywords: ["Taunt"],
    text: "Taunt.",
    poolCopies: POOL_COPIES_BY_TIER[4],
  },
  {
    id: "murloc-tidalmaw",
    name: "Tidalmaw, the Endless",
    tier: 5,
    tribe: "Murloc",
    attack: 6,
    health: 7,
    keywords: [],
    text: "Start of Combat: Give your other Murlocs +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: { startOfCombat: startOfCombatBuffTribe("Murloc", 3, 3) },
  },
  {
    id: "murloc-deep-sovereign",
    name: "The Deep Sovereign",
    tier: 6,
    tribe: "Murloc",
    attack: 6,
    health: 6,
    keywords: [],
    text: "Battlecry: Double the Attack and Health of your other Murlocs.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      battlecry: (ctx) => {
        for (const m of ctx.player.board) {
          if (m.iid !== ctx.self.iid && (m.tribe === "Murloc" || m.tribe === "All")) ctx.api.buffMinion(m, m.attack, m.health);
        }
      },
    },
  },
];
