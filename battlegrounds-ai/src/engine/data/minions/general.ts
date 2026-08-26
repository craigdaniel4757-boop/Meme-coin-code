import type { MinionDef } from "@/engine/types";
import { POOL_COPIES_BY_TIER } from "@/engine/data/constants";
import { buffAdjacent, deathrattleBuffRandomFriendly } from "@/engine/data/effectHelpers";

function countUniqueTribes(board: { tribe: string }[]): number {
  const set = new Set<string>();
  for (const m of board) if (m.tribe !== "None") set.add(m.tribe === "All" ? "__all__" : m.tribe);
  return set.size;
}

export const GENERAL_MINIONS: MinionDef[] = [
  {
    id: "general-tavern-brawler",
    name: "Tavern Brawler",
    tier: 1,
    tribe: "None",
    attack: 3,
    health: 3,
    keywords: [],
    text: "A plain, sturdy body — no tribe, no tricks.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "general-amalgam-scrap",
    name: "Amalgam Scrap",
    tier: 1,
    tribe: "All",
    attack: 1,
    health: 2,
    keywords: [],
    text: "Counts as every tribe.",
    poolCopies: POOL_COPIES_BY_TIER[1],
  },
  {
    id: "general-wandering-scholar",
    name: "Wandering Scholar",
    tier: 2,
    tribe: "None",
    attack: 2,
    health: 3,
    keywords: [],
    text: "Battlecry: Give adjacent minions +1/+1.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: { battlecry: buffAdjacent(1, 1) },
  },
  {
    id: "general-menagerie-scout",
    name: "Menagerie Scout",
    tier: 2,
    tribe: "None",
    attack: 2,
    health: 2,
    keywords: [],
    text: "Start of Combat: Gain +1/+1 for each different minion type you have.",
    poolCopies: POOL_COPIES_BY_TIER[2],
    effects: {
      startOfCombat: (ctx) => {
        const n = countUniqueTribes(ctx.owner.board);
        if (n > 0) {
          ctx.api.buff(ctx.self, n, n);
          ctx.log(`${ctx.self.name} draws on ${n} different kinds of allies.`);
        }
      },
    },
  },
  {
    id: "general-amalgam-brute",
    name: "Amalgam Brute",
    tier: 3,
    tribe: "All",
    attack: 4,
    health: 4,
    keywords: [],
    text: "Counts as every tribe.",
    poolCopies: POOL_COPIES_BY_TIER[3],
  },
  {
    id: "general-stonebound-guardian",
    name: "Stonebound Guardian",
    tier: 3,
    tribe: "None",
    attack: 2,
    health: 8,
    keywords: ["Taunt"],
    text: "Taunt. Nothing fancy — just refuses to fall over.",
    poolCopies: POOL_COPIES_BY_TIER[3],
  },
  {
    id: "general-freelance-tinkerer",
    name: "Freelance Tinkerer",
    tier: 3,
    tribe: "None",
    attack: 3,
    health: 3,
    keywords: [],
    text: "Deathrattle: Give two random friendly minions +2/+2.",
    poolCopies: POOL_COPIES_BY_TIER[3],
    effects: { deathrattle: deathrattleBuffRandomFriendly(2, 2, 2) },
  },
  {
    id: "general-wildcard-champion",
    name: "Wildcard Champion",
    tier: 4,
    tribe: "None",
    attack: 5,
    health: 4,
    keywords: [],
    text: "Start of Combat: Gain +2/+2 for each different minion type you have.",
    poolCopies: POOL_COPIES_BY_TIER[4],
    effects: {
      startOfCombat: (ctx) => {
        const n = countUniqueTribes(ctx.owner.board);
        if (n > 0) {
          ctx.api.buff(ctx.self, n * 2, n * 2);
          ctx.log(`${ctx.self.name} draws on ${n} different kinds of allies.`);
        }
      },
    },
  },
  {
    id: "general-amalgam-colossus",
    name: "Amalgam Colossus",
    tier: 5,
    tribe: "All",
    attack: 6,
    health: 6,
    keywords: ["Taunt"],
    text: "Taunt. Counts as every tribe.",
    poolCopies: POOL_COPIES_BY_TIER[5],
  },
  {
    id: "general-oldworld-titan",
    name: "Old-World Titan",
    tier: 5,
    tribe: "None",
    attack: 7,
    health: 7,
    keywords: [],
    text: "A colossal, tribeless force of nature.",
    poolCopies: POOL_COPIES_BY_TIER[5],
  },
  {
    id: "general-worldweaver",
    name: "The Worldweaver",
    tier: 6,
    tribe: "None",
    attack: 6,
    health: 6,
    keywords: [],
    text: "Start of Combat: Gain +3/+3 for each different minion type you have.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      startOfCombat: (ctx) => {
        const n = countUniqueTribes(ctx.owner.board);
        if (n > 0) {
          ctx.api.buff(ctx.self, n * 3, n * 3);
          ctx.log(`${ctx.self.name} draws on ${n} different kinds of allies.`);
        }
      },
    },
  },
  {
    id: "general-last-word",
    name: "Last Word",
    tier: 6,
    tribe: "None",
    attack: 5,
    health: 5,
    keywords: [],
    text: "Deathrattle: Give all friendly minions +3/+3.",
    poolCopies: POOL_COPIES_BY_TIER[6],
    effects: {
      deathrattle: (ctx) => {
        for (const m of ctx.owner.board) ctx.api.buff(m, 3, 3);
        ctx.log(`${ctx.self.name}'s final word empowers the whole board.`);
      },
    },
  },
];
