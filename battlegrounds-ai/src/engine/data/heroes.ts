import type { HeroDef } from "@/engine/types";
import { castMinorTavernSpell } from "@/engine/data/effectHelpers";

export const HERO_DEFS: HeroDef[] = [
  {
    id: "hero-grukk",
    name: "Grukk Emberfist",
    title: "The Unbroken",
    flavor: "A wandering brawler who trusts his fists more than his plans.",
    power: {
      name: "Sharpen",
      text: "Give a random friendly minion +1/+1.",
      cost: 0,
      passive: false,
      activate: (ctx) => {
        if (ctx.player.board.length === 0) return;
        ctx.api.buffMinion(ctx.player.board[ctx.rng.int(ctx.player.board.length)], 1, 1);
      },
    },
  },
  {
    id: "hero-veshaaran",
    name: "Lady Vesh'aran",
    title: "Broker of Souls",
    flavor: "Every deal costs something. She makes sure it's never her.",
    power: {
      name: "Void Pact",
      text: "Deal 2 damage to a random friendly minion; it gains +4/+2.",
      cost: 2,
      passive: false,
      activate: (ctx) => {
        if (ctx.player.board.length === 0) return;
        const t = ctx.player.board[ctx.rng.int(ctx.player.board.length)];
        ctx.api.buffMinion(t, 4, 2);
      },
    },
  },
  {
    id: "hero-sula",
    name: "Captain Sula Ironwake",
    title: "Scourge of the Shallows",
    flavor: "Never lost a ship. Never kept one either.",
    power: {
      name: "Full Sail",
      text: "Give your Pirates +1/+0.",
      cost: 1,
      passive: false,
      activate: (ctx) => {
        for (const m of ctx.player.board) if (m.tribe === "Pirate" || m.tribe === "All") ctx.api.buffMinion(m, 1, 0);
      },
    },
  },
  {
    id: "hero-ollun",
    name: "Brother Ollun",
    title: "Warden of the Vigil",
    flavor: "Protects the weak. Occasionally the strong, too.",
    power: {
      name: "Blessing of Wardens",
      text: "Give a random friendly minion Divine Shield and Taunt.",
      cost: 2,
      passive: false,
      activate: (ctx) => {
        if (ctx.player.board.length === 0) return;
        const t = ctx.player.board[ctx.rng.int(ctx.player.board.length)];
        ctx.api.addKeyword(t, "DivineShield");
        ctx.api.addKeyword(t, "Taunt");
      },
    },
  },
  {
    id: "hero-kaztik",
    name: "Kaz'tik the Unshackled",
    title: "Beastcaller",
    flavor: "Freed every cage he ever found. Started with his own.",
    power: {
      name: "Free the Beasts",
      text: "Give two random friendly Beasts +1/+1.",
      cost: 0,
      passive: false,
      activate: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.tribe === "Beast" || m.tribe === "All");
        for (let i = 0; i < 2 && pool.length > 0; i++) {
          const idx = ctx.rng.int(pool.length);
          ctx.api.buffMinion(pool[idx], 1, 1);
          pool.splice(idx, 1);
        }
      },
    },
  },
  {
    id: "hero-zenna",
    name: "Zenna Fishbind",
    title: "Voice of the Tide",
    flavor: "Speaks fluent Murloc. Regrets it constantly.",
    power: {
      name: "Tidecall",
      text: "Give your Murlocs +1/+0.",
      cost: 0,
      passive: false,
      activate: (ctx) => {
        for (const m of ctx.player.board) if (m.tribe === "Murloc" || m.tribe === "All") ctx.api.buffMinion(m, 1, 0);
      },
    },
  },
  {
    id: "hero-dreth",
    name: "Warlock Dreth",
    title: "The Self-Made Sacrifice",
    flavor: "Pain is just currency he hasn't spent yet.",
    power: {
      name: "Dark Bargain",
      text: "Deal 3 damage to your own hero. Give a random friendly minion +3/+3.",
      cost: 0,
      passive: false,
      activate: (ctx) => {
        ctx.player.health = Math.max(1, ctx.player.health - 3);
        if (ctx.player.board.length === 0) return;
        ctx.api.buffMinion(ctx.player.board[ctx.rng.int(ctx.player.board.length)], 3, 3);
      },
    },
  },
  {
    id: "hero-klix",
    name: "Overseer Klix",
    title: "Chief Mechanist",
    flavor: "Believes every problem has a mechanical solution. Usually right.",
    power: {
      name: "Mechanized",
      text: "Give a random friendly Mech +1/+2.",
      cost: 1,
      passive: false,
      activate: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.tribe === "Mech" || m.tribe === "All");
        if (pool.length === 0) return;
        ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 1, 2);
      },
    },
  },
  {
    id: "hero-ashwing",
    name: "Ashwing the Elder",
    title: "Keeper of the High Peaks",
    flavor: "Old enough to remember when tavern brawls were smaller.",
    power: {
      name: "Draconic Might",
      text: "Give a random friendly Dragon +2/+2.",
      cost: 2,
      passive: false,
      activate: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.tribe === "Dragon" || m.tribe === "All");
        if (pool.length === 0) return;
        ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 2, 2);
      },
    },
  },
  {
    id: "hero-cinderweave",
    name: "Cinderweave Shaman",
    title: "Speaker of Sparks",
    flavor: "Every ember she touches remembers her name.",
    power: {
      name: "Ignite",
      text: "Give a random friendly Elemental +1/+1. It counts as an extra Elemental bought this turn.",
      cost: 1,
      passive: false,
      activate: (ctx) => {
        const pool = ctx.player.board.filter((m) => m.tribe === "Elemental" || m.tribe === "All");
        ctx.player.turnCounters.elementalsBoughtThisTurn = (ctx.player.turnCounters.elementalsBoughtThisTurn ?? 0) + 1;
        if (pool.length === 0) return;
        ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 1, 1);
      },
    },
  },
  {
    id: "hero-vortesh",
    name: "Vor'tesh the Coiled",
    title: "Tidebound Oracle",
    flavor: "Speaks in riddles. The riddles are usually correct.",
    power: {
      name: "Spellweave",
      text: "Cast a random minor tavern spell.",
      cost: 1,
      passive: false,
      activate: (ctx) => {
        if (ctx.player.board.length === 0) {
          ctx.api.gainGold(ctx.player, 2);
          return;
        }
        castMinorTavernSpell()({ ...ctx, self: ctx.player.board[ctx.rng.int(ctx.player.board.length)] });
      },
    },
  },
  {
    id: "hero-drogash",
    name: "Thane Drogash",
    title: "The Warcaller",
    flavor: "His battle cry has ended more fights than his axe.",
    power: {
      name: "Warlord's Cry",
      text: "Give your whole board +1/+0.",
      cost: 2,
      passive: false,
      activate: (ctx) => {
        for (const m of ctx.player.board) ctx.api.buffMinion(m, 1, 0);
      },
    },
  },
  {
    id: "hero-nyx",
    name: "Nyx the Hollow",
    title: "Whisper of the Grave",
    flavor: "Death isn't the end. It's just her opening move.",
    power: {
      name: "Grave Pact",
      text: "Give a random friendly minion Reborn.",
      cost: 1,
      passive: false,
      activate: (ctx) => {
        const pool = ctx.player.board.filter((m) => !m.keywords.includes("Reborn"));
        if (pool.length === 0) return;
        ctx.api.addKeyword(pool[ctx.rng.int(pool.length)], "Reborn");
      },
    },
  },
  {
    id: "hero-reginald",
    name: "Sir Reginald Coinpurse",
    title: "The Overleveraged",
    flavor: "Technically the richest man in the tavern. Technically.",
    power: {
      name: "Line of Credit",
      text: "Gain 2 Gold this turn.",
      cost: 0,
      passive: false,
      activate: (ctx) => ctx.api.gainGold(ctx.player, 2),
    },
  },
  {
    id: "hero-quilra",
    name: "Quilra the Bloodmother",
    title: "Matriarch of the Warrens",
    flavor: "Her children carry gemstone tusks. Nobody asks why.",
    power: {
      name: "Gem Harvest",
      text: "Gain 2 Blood Gems.",
      cost: 0,
      passive: false,
      activate: (ctx) => ctx.api.gainBloodGems(ctx.player, 2),
    },
  },
  {
    id: "hero-thistlewood",
    name: "Maester Thistlewood",
    title: "The Adaptive",
    flavor: "Never commits to a plan he can't abandon mid-sentence.",
    power: {
      name: "Adaptive Tactics",
      text: "Give a random friendly minion +2/+2 if you control 3+ minion types, otherwise +1/+1.",
      cost: 1,
      passive: false,
      activate: (ctx) => {
        if (ctx.player.board.length === 0) return;
        const tribes = new Set(ctx.player.board.map((m) => (m.tribe === "All" ? "__all__" : m.tribe)).filter((t) => t !== "None"));
        const bonus = tribes.size >= 3 ? 2 : 1;
        ctx.api.buffMinion(ctx.player.board[ctx.rng.int(ctx.player.board.length)], bonus, bonus);
      },
    },
  },
];

export const HERO_BY_ID: Record<string, HeroDef> = Object.fromEntries(HERO_DEFS.map((h) => [h.id, h]));

export function getHeroDef(id: string): HeroDef {
  const h = HERO_BY_ID[id];
  if (!h) throw new Error(`Unknown hero: ${id}`);
  return h;
}
