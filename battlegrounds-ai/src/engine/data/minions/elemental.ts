import type { MinionDef, ShopEffect } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { startOfCombatBuffTribe } from "@/engine/data/effectHelpers";

function markElementalBuy(): ShopEffect {
  return (ctx) => {
    ctx.player.turnCounters.elementalsBoughtThisTurn = (ctx.player.turnCounters.elementalsBoughtThisTurn ?? 0) + 1;
  };
}

function ifChainedThisTurn(minCount: number, effect: ShopEffect): ShopEffect {
  return (ctx) => {
    const n = ctx.player.turnCounters.elementalsBoughtThisTurn ?? 0;
    if (n >= minCount) effect(ctx);
  };
}

export const ELEMENTAL_MINIONS: MinionDef[] = [
  {
    id: "elemental-sparkling-motes",
    name: "Sparkling Motes",
    tier: 1,
    tribe: "Elemental",
    attack: 2,
    health: 2,
    keywords: [],
    text: "Battlecry: If you've bought an Elemental this turn, gain +1/+1.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: {
      battlecry: combine2(markElementalBuy(), ifChainedThisTurn(2, (ctx) => ctx.api.buffMinion(ctx.self, 1, 1))),
    },
  },
  {
    id: "elemental-pebble-golem",
    name: "Pebble Golem",
    tier: 1,
    tribe: "Elemental",
    attack: 1,
    health: 4,
    keywords: ["Taunt"],
    text: "Taunt.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: { battlecry: markElementalBuy() },
  },
  {
    id: "elemental-cinder-wisp",
    name: "Cinder Wisp",
    tier: 2,
    tribe: "Elemental",
    attack: 3,
    health: 2,
    keywords: [],
    text: "Battlecry: If you've bought 2+ Elementals this turn, deal 3 damage to a random enemy minion at the start of combat.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      battlecry: markElementalBuy(),
      startOfCombat: (ctx) => {
        const t = ctx.api.randomEnemy();
        if (t) {
          ctx.api.dealDamage(t, 2, ctx.self);
          ctx.log(`${ctx.self.name} scorches ${t.name}.`);
        }
      },
    },
  },
  {
    id: "elemental-molten-shaper",
    name: "Molten Shaper",
    tier: 2,
    tribe: "Elemental",
    attack: 2,
    health: 3,
    keywords: [],
    text: "Battlecry: If you've bought an Elemental this turn, give a friendly Elemental +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      battlecry: combine2(
        markElementalBuy(),
        ifChainedThisTurn(2, (ctx) => {
          const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && (m.tribe === "Elemental" || m.tribe === "All"));
          if (pool.length === 0) return;
          ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 2, 2);
        }),
      ),
    },
  },
  {
    id: "elemental-tidecaller-golem",
    name: "Tidecaller Golem",
    tier: 3,
    tribe: "Elemental",
    attack: 4,
    health: 5,
    keywords: [],
    text: "Battlecry: If you've bought 2+ Elementals this turn, gain +4/+4.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: {
      battlecry: combine2(markElementalBuy(), ifChainedThisTurn(2, (ctx) => ctx.api.buffMinion(ctx.self, 4, 4))),
    },
  },
  {
    id: "elemental-magma-warden",
    name: "Magma Warden",
    tier: 3,
    tribe: "Elemental",
    attack: 3,
    health: 6,
    keywords: ["Taunt"],
    text: "Taunt.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: { battlecry: markElementalBuy() },
  },
  {
    id: "elemental-magmaloch",
    name: "Magmaloch",
    tier: 4,
    tribe: "Elemental",
    attack: 5,
    health: 5,
    keywords: [],
    text: "Battlecry: If you've bought 3+ Elementals this turn, summon another Magmaloch.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      battlecry: combine2(
        markElementalBuy(),
        ifChainedThisTurn(3, (ctx) => {
          ctx.api.summonToBoard(ctx.player, "elemental-magmaloch");
        }),
      ),
    },
  },
  {
    id: "elemental-stormbind-avatar",
    name: "Stormbind Avatar",
    tier: 5,
    tribe: "Elemental",
    attack: 6,
    health: 6,
    keywords: [],
    text: "Start of Combat: Give your Elementals +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: { battlecry: markElementalBuy(), startOfCombat: startOfCombatBuffTribe("Elemental", 2, 2) },
  },
  {
    id: "elemental-worldcore-titan",
    name: "Worldcore Titan",
    tier: 6,
    tribe: "Elemental",
    attack: 7,
    health: 9,
    keywords: ["Taunt"],
    text: "Taunt. Battlecry: If you've bought 3+ Elementals this turn, gain +6/+6.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      battlecry: combine2(markElementalBuy(), ifChainedThisTurn(3, (ctx) => ctx.api.buffMinion(ctx.self, 6, 6))),
    },
  },
];

function combine2(a: ShopEffect, b: ShopEffect): ShopEffect {
  return (ctx) => {
    a(ctx);
    b(ctx);
  };
}
