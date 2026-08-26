import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { avengeBuffSelf, avengeDamageRandomEnemy, deathrattleBuffRandomFriendly, summonBattlecry } from "@/engine/data/effectHelpers";

export const DEMON_TOKENS: MinionDef[] = [
  {
    id: "demon-imp-token",
    name: "Imp Sprite",
    tier: 1,
    tribe: "Demon",
    attack: 1,
    health: 1,
    keywords: [],
    text: "A small piece of the Twisting Nether.",
    poolCopies: 0,
    purchasable: false,
  },
];

export const DEMON_MINIONS: MinionDef[] = [
  {
    id: "demon-imp-caller",
    name: "Imp Caller",
    tier: 1,
    tribe: "Demon",
    attack: 1,
    health: 2,
    keywords: [],
    text: "Battlecry: Summon a 1/1 Imp Sprite.",
    poolCopies: POOL_COPIES_BY_TIER[1],
    effects: { battlecry: summonBattlecry("demon-imp-token", 1) },
  },
  {
    id: "demon-fel-hound",
    name: "Fel Hound",
    tier: 1,
    tribe: "Demon",
    attack: 3,
    health: 1,
    keywords: [],
    text: "A vicious hunter, thin on health.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "demon-soul-broker",
    name: "Soul Broker",
    tier: 2,
    tribe: "Demon",
    attack: 2,
    health: 3,
    keywords: [],
    text: "Battlecry: Deal 2 damage to a random friendly minion. It gains +4/+2.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      battlecry: (ctx) => {
        const targets = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && m.health > 2);
        if (targets.length === 0) return;
        const t = targets[ctx.rng.int(targets.length)];
        ctx.api.buffMinion(t, 4, 2);
      },
    },
  },
  {
    id: "demon-avenger-of-torment",
    name: "Avenger of Torment",
    tier: 2,
    tribe: "Demon",
    attack: 3,
    health: 3,
    keywords: ["Avenge"],
    text: "Avenge (2): Gain +3/+2.",
    avengeThreshold: 2,
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: { avengeTrigger: avengeBuffSelf(3, 2) },
  },
  {
    id: "demon-pitlord",
    name: "Lesser Pitlord",
    tier: 3,
    tribe: "Demon",
    attack: 5,
    health: 3,
    keywords: [],
    text: "Deathrattle: Give a random friendly minion +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: { deathrattle: deathrattleBuffRandomFriendly(3, 3, 1) },
  },
  {
    id: "demon-shadow-broker",
    name: "Shadow Broker",
    tier: 3,
    tribe: "Demon",
    attack: 3,
    health: 4,
    keywords: ["Avenge"],
    text: "Avenge (1): Deal 3 damage to a random enemy minion.",
    avengeThreshold: 1,
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: { avengeTrigger: avengeDamageRandomEnemy(3) },
  },
  {
    id: "demon-doomcaller",
    name: "Doomcaller",
    tier: 4,
    tribe: "Demon",
    attack: 4,
    health: 4,
    keywords: [],
    text: "Battlecry: Sacrifice a friendly minion. Gain double its Attack and Health.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      battlecry: (ctx) => {
        const targets = ctx.player.board.filter((m) => m.iid !== ctx.self.iid);
        if (targets.length === 0) return;
        const t = targets[ctx.rng.int(targets.length)];
        ctx.api.buffMinion(ctx.self, t.attack * 2, t.health * 2);
        ctx.api.sellFromBoard(ctx.player, t);
      },
    },
  },
  {
    id: "demon-void-marauder",
    name: "Void Marauder",
    tier: 4,
    tribe: "Demon",
    attack: 6,
    health: 5,
    keywords: [],
    text: "A raw slab of demonic muscle.",
    poolCopies: POOL_COPIES_BY_TIER[4],
  },
  {
    id: "demon-nether-tyrant",
    name: "Nether Tyrant",
    tier: 5,
    tribe: "Demon",
    attack: 6,
    health: 6,
    keywords: ["Avenge"],
    text: "Avenge (2): Gain +6/+4.",
    avengeThreshold: 2,
    poolCopies: POOL_COPIES_BY_TIER[5],
    effects: { avengeTrigger: avengeBuffSelf(6, 4) },
  },
  {
    id: "demon-worldbreaker",
    name: "Worldbreaker",
    tier: 6,
    tribe: "Demon",
    attack: 8,
    health: 8,
    keywords: [],
    text: "Deathrattle: Give two random friendly minions +4/+4.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: { deathrattle: deathrattleBuffRandomFriendly(4, 4, 2) },
  },
];
