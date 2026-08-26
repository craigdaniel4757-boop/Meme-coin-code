import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { deathrattleSummon, startOfCombatBuffTribe } from "@/engine/data/effectHelpers";

export const MECH_TOKENS: MinionDef[] = [
  {
    id: "mech-bot-token",
    name: "Micro-Bot",
    tier: 1,
    tribe: "Mech",
    attack: 1,
    health: 1,
    keywords: ["DivineShield"],
    text: "A tiny helper drone.",
    poolCopies: 0,
    purchasable: false,
  },
];

export const MECH_MINIONS: MinionDef[] = [
  {
    id: "mech-microbot-rack",
    name: "Microbot Rack",
    tier: 1,
    tribe: "Mech",
    attack: 1,
    health: 1,
    keywords: [],
    text: "Deathrattle: Summon two 1/1 Micro-Bots with Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: { deathrattle: deathrattleSummon("mech-bot-token", 2) },
  },
  {
    id: "mech-plated-crawler",
    name: "Plated Crawler",
    tier: 1,
    tribe: "Mech",
    attack: 3,
    health: 2,
    keywords: ["DivineShield"],
    text: "Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "mech-scraphoarder",
    name: "Scraphoarder",
    tier: 2,
    tribe: "Mech",
    attack: 2,
    health: 3,
    keywords: [],
    text: "Deathrattle: Give a random friendly Mech +2/+1.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      deathrattle: (ctx) => {
        const pool = ctx.owner.board.filter((m) => m.iid !== ctx.self.iid && (m.tribe === "Mech" || m.tribe === "All"));
        if (pool.length === 0) return;
        const t = pool[ctx.rng.int(pool.length)];
        ctx.api.buff(t, 2, 1);
        ctx.log(`${ctx.self.name}'s deathrattle reinforces ${t.name}.`);
      },
    },
  },
  {
    id: "mech-guard-turret",
    name: "Guard Turret",
    tier: 2,
    tribe: "Mech",
    attack: 1,
    health: 5,
    keywords: ["Taunt", "DivineShield"],
    text: "Taunt. Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[2],
  },
  {
    id: "mech-repair-drone",
    name: "Repair Drone",
    tier: 3,
    tribe: "Mech",
    attack: 3,
    health: 3,
    keywords: [],
    text: "Start of Combat: Give a random friendly Mech Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      startOfCombat: (ctx) => {
        const pool = ctx.owner.board.filter((m) => (m.tribe === "Mech" || m.tribe === "All") && !m.keywords.includes("DivineShield"));
        if (pool.length === 0) return;
        const t = pool[ctx.rng.int(pool.length)];
        ctx.api.addKeyword(t, "DivineShield");
        ctx.log(`${ctx.self.name} shields ${t.name}.`);
      },
    },
  },
  {
    id: "mech-siege-breaker",
    name: "Siege Breaker",
    tier: 3,
    tribe: "Mech",
    attack: 5,
    health: 4,
    keywords: ["Windfury"],
    text: "Windfury.",
    poolCopies: POOL_COPIES_BY_TIER[3],
  },
  {
    id: "mech-junkyard-tinkerer",
    name: "Junkyard Tinkerer",
    tier: 4,
    tribe: "Mech",
    attack: 4,
    health: 4,
    keywords: [],
    text: "Start of Combat: Give your Mechs with Divine Shield +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      startOfCombat: (ctx) => {
        for (const m of ctx.owner.board) {
          if ((m.tribe === "Mech" || m.tribe === "All") && m.keywords.includes("DivineShield")) ctx.api.buff(m, 2, 2);
        }
        ctx.log(`${ctx.self.name} overclocks the shielded Mechs.`);
      },
    },
  },
  {
    id: "mech-annihilator",
    name: "Annihilator Prime",
    tier: 4,
    tribe: "Mech",
    attack: 6,
    health: 6,
    keywords: ["DivineShield"],
    text: "Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[4],
  },
  {
    id: "mech-fortress-core",
    name: "Fortress Core",
    tier: 5,
    tribe: "Mech",
    attack: 5,
    health: 8,
    keywords: ["Taunt"],
    text: "Taunt. Start of Combat: Give your other Mechs +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: { startOfCombat: startOfCombatBuffTribe("Mech", 2, 2) },
  },
  {
    id: "mech-omega-devastator",
    name: "Omega Devastator",
    tier: 6,
    tribe: "Mech",
    attack: 8,
    health: 8,
    keywords: ["DivineShield"],
    text: "Divine Shield. Deathrattle: Summon two 1/1 Micro-Bots with Divine Shield.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: { deathrattle: deathrattleSummon("mech-bot-token", 2) },
  },
];
