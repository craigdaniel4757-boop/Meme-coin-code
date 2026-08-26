import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";

export const UNDEAD_MINIONS: MinionDef[] = [
  {
    id: "undead-risen-skirmisher",
    name: "Risen Skirmisher",
    tier: 1,
    tribe: "Undead",
    attack: 2,
    health: 1,
    keywords: ["Reborn"],
    text: "Reborn.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "undead-bone-caller",
    name: "Bone Caller",
    tier: 1,
    tribe: "Undead",
    attack: 1,
    health: 2,
    keywords: [],
    text: "Battlecry: Give a friendly minion Reborn.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: {
      battlecry: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && !m.keywords.includes("Reborn"));
        if (pool.length === 0) return;
        ctx.api.addKeyword(pool[ctx.rng.int(pool.length)], "Reborn");
      },
    },
  },
  {
    id: "undead-grave-warden",
    name: "Grave Warden",
    tier: 2,
    tribe: "Undead",
    attack: 3,
    health: 3,
    keywords: ["Taunt", "Reborn"],
    text: "Taunt. Reborn.",
    poolCopies: POOL_COPIES_BY_TIER[2],
  },
  {
    id: "undead-soulbind-priest",
    name: "Soulbind Priest",
    tier: 2,
    tribe: "Undead",
    attack: 2,
    health: 4,
    keywords: [],
    text: "Start of Combat: Gain +1/+1 for each friendly minion with Reborn.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      startOfCombat: (ctx) => {
        const n = ctx.owner.board.filter((m) => m.keywords.includes("Reborn")).length;
        if (n > 0) {
          ctx.api.buff(ctx.self, n, n);
          ctx.log(`${ctx.self.name} draws power from the reborn (+${n}/+${n}).`);
        }
      },
    },
  },
  {
    id: "undead-deathwhisper-adept",
    name: "Deathwhisper Adept",
    tier: 3,
    tribe: "Undead",
    attack: 4,
    health: 3,
    keywords: ["Reborn"],
    text: "Reborn. Deathrattle: Give a random friendly minion +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      deathrattle: (ctx) => {
        const t = ctx.api.randomFriendly();
        if (t) {
          ctx.api.buff(t, 2, 2);
          ctx.log(`${ctx.self.name}'s deathrattle strengthens ${t.name}.`);
        }
      },
    },
  },
  {
    id: "undead-crypt-guardian",
    name: "Crypt Guardian",
    tier: 3,
    tribe: "Undead",
    attack: 3,
    health: 5,
    keywords: ["Taunt"],
    text: "Taunt. Battlecry: Give a friendly minion Reborn.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      battlecry: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && !m.keywords.includes("Reborn"));
        if (pool.length === 0) return;
        ctx.api.addKeyword(pool[ctx.rng.int(pool.length)], "Reborn");
      },
    },
  },
  {
    id: "undead-boneshard-warlock",
    name: "Boneshard Warlock",
    tier: 4,
    tribe: "Undead",
    attack: 5,
    health: 5,
    keywords: ["Reborn"],
    text: "Reborn. Deathrattle: Deal 4 damage to a random enemy minion.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      deathrattle: (ctx) => {
        const t = ctx.api.randomEnemy();
        if (t) {
          ctx.api.dealDamage(t, 4, ctx.self);
          ctx.log(`${ctx.self.name}'s deathrattle detonates on ${t.name}.`);
        }
      },
    },
  },
  {
    id: "undead-hollow-tyrant",
    name: "Hollow Tyrant",
    tier: 5,
    tribe: "Undead",
    attack: 6,
    health: 6,
    keywords: [],
    text: "Start of Combat: Give your minions with Reborn +4/+4.",
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: {
      startOfCombat: (ctx) => {
        for (const m of ctx.owner.board) if (m.keywords.includes("Reborn")) ctx.api.buff(m, 4, 4);
        ctx.log(`${ctx.self.name} calls the risen to arms.`);
      },
    },
  },
  {
    id: "undead-eternal-necromancer",
    name: "The Eternal Necromancer",
    tier: 6,
    tribe: "Undead",
    attack: 6,
    health: 8,
    keywords: ["Reborn"],
    text: "Reborn. Battlecry: Give your other minions Reborn.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      battlecry: (ctx) => {
        for (const m of ctx.player.board) if (m.iid !== ctx.self.iid && !m.keywords.includes("Reborn")) ctx.api.addKeyword(m, "Reborn");
      },
    },
  },
];
