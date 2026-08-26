import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { startOfCombatBuffTribe } from "@/engine/data/effectHelpers";

export const DRAGON_MINIONS: MinionDef[] = [
  {
    id: "dragon-whelp-warden",
    name: "Whelp Warden",
    tier: 1,
    tribe: "Dragon",
    attack: 2,
    health: 3,
    keywords: [],
    text: "A young but sturdy watcher.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "dragon-cinder-scale",
    name: "Cinder Scale",
    tier: 2,
    tribe: "Dragon",
    attack: 3,
    health: 3,
    keywords: [],
    text: "Battlecry: Give your biggest minion +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      battlecry: (ctx) => {
        const candidates = ctx.player.board.filter((m) => m.iid !== ctx.self.iid);
        if (candidates.length === 0) return;
        let best = candidates[0];
        for (const m of candidates) if (m.attack + m.health > best.attack + best.health) best = m;
        ctx.api.buffMinion(best, 2, 2);
      },
    },
  },
  {
    id: "dragon-emberwing-sentinel",
    name: "Emberwing Sentinel",
    tier: 2,
    tribe: "Dragon",
    attack: 4,
    health: 4,
    keywords: [],
    text: "A balanced mid-size wyrm.",
    poolCopies: POOL_COPIES_BY_TIER[2],
  },
  {
    id: "dragon-scalebound-mystic",
    name: "Scalebound Mystic",
    tier: 3,
    tribe: "Dragon",
    attack: 4,
    health: 5,
    keywords: [],
    text: "Start of Combat: Give a random friendly Dragon +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      startOfCombat: (ctx) => {
        const pool = ctx.owner.board.filter((m) => m.iid !== ctx.self.iid && (m.tribe === "Dragon" || m.tribe === "All"));
        if (pool.length === 0) return;
        const t = pool[ctx.rng.int(pool.length)];
        ctx.api.buff(t, 3, 3);
        ctx.log(`${ctx.self.name} channels draconic power into ${t.name}.`);
      },
    },
  },
  {
    id: "dragon-molten-warden",
    name: "Molten Warden",
    tier: 3,
    tribe: "Dragon",
    attack: 3,
    health: 6,
    keywords: ["Taunt"],
    text: "Taunt.",
    poolCopies: POOL_COPIES_BY_TIER[3],
  },
  {
    id: "dragon-stormwing-matriarch",
    name: "Stormwing Matriarch",
    tier: 4,
    tribe: "Dragon",
    attack: 5,
    health: 5,
    keywords: [],
    text: "Battlecry: Give your Dragons +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      battlecry: (ctx) => {
        for (const m of ctx.player.board) if (m.tribe === "Dragon" || m.tribe === "All") ctx.api.buffMinion(m, 2, 2);
      },
    },
  },
  {
    id: "dragon-ashfang-colossus",
    name: "Ashfang Colossus",
    tier: 5,
    tribe: "Dragon",
    attack: 7,
    health: 7,
    keywords: [],
    text: "Start of Combat: Give your Dragons +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: { startOfCombat: startOfCombatBuffTribe("Dragon", 3, 3) },
  },
  {
    id: "dragon-worldflame",
    name: "Worldflame, Herald of Ash",
    tier: 6,
    tribe: "Dragon",
    attack: 9,
    health: 9,
    keywords: ["Taunt"],
    text: "Taunt. Start of Combat: Deal 4 damage to a random enemy minion.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      startOfCombat: (ctx) => {
        const t = ctx.api.randomEnemy();
        if (t) {
          ctx.api.dealDamage(t, 4, ctx.self);
          ctx.log(`${ctx.self.name} breathes fire on ${t.name}.`);
        }
      },
    },
  },
];
