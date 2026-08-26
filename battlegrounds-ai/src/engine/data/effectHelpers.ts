import type { CombatEffect, Keyword, MinionInstance, ShopEffect, Tribe } from "@/engine/types";

function isTribeMatch(tribe: Tribe, want: Tribe): boolean {
  return tribe === want || tribe === "All";
}

export function buffSelf(atk: number, health: number): ShopEffect {
  return (ctx) => ctx.api.buffMinion(ctx.self, atk, health);
}

export function buffAdjacent(atk: number, health: number): ShopEffect {
  return (ctx) => {
    const idx = ctx.player.board.findIndex((m) => m.iid === ctx.self.iid);
    if (idx === -1) return;
    const left = ctx.player.board[idx - 1];
    const right = ctx.player.board[idx + 1];
    if (left) ctx.api.buffMinion(left, atk, health);
    if (right) ctx.api.buffMinion(right, atk, health);
  };
}

export function buffAllFriendlyTribe(tribe: Tribe, atk: number, health: number, includeSelf = true): ShopEffect {
  return (ctx) => {
    ctx.api.buffAllFriendly(ctx.player, atk, health, (m) => {
      if (!includeSelf && m.iid === ctx.self.iid) return false;
      return isTribeMatch(m.tribe, tribe);
    });
  };
}

export function buffRandomFriendly(atk: number, health: number, count: number, filter?: (m: MinionInstance) => boolean): ShopEffect {
  return (ctx) => {
    const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid && (!filter || filter(m)));
    const picked: MinionInstance[] = [];
    const copy = [...pool];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = ctx.rng.int(copy.length);
      picked.push(copy.splice(idx, 1)[0]);
    }
    for (const m of picked) ctx.api.buffMinion(m, atk, health);
  };
}

export function summonBattlecry(defId: string, count: number, opts?: { golden?: boolean; atkBonus?: number; healthBonus?: number }): ShopEffect {
  return (ctx) => {
    for (let i = 0; i < count; i++) {
      ctx.api.summonToBoard(ctx.player, defId, opts);
    }
  };
}

export function gainGoldBattlecry(amount: number): ShopEffect {
  return (ctx) => ctx.api.gainGold(ctx.player, amount);
}

export function gainBloodGemsBattlecry(amount: number): ShopEffect {
  return (ctx) => ctx.api.gainBloodGems(ctx.player, amount);
}

export function consumeBloodGemsOntoSelf(): ShopEffect {
  return (ctx) => {
    const n = ctx.api.consumeBloodGems(ctx.player);
    if (n > 0) ctx.api.buffMinion(ctx.self, n * 2, n * 2);
  };
}

export function combine(...effects: ShopEffect[]): ShopEffect {
  return (ctx) => {
    for (const e of effects) e(ctx);
  };
}

export function castMinorTavernSpell(): ShopEffect {
  return (ctx) => {
    const roll = ctx.rng.int(4);
    if (roll === 0) {
      ctx.api.gainGold(ctx.player, 2);
    } else if (roll === 1) {
      ctx.api.buffMinion(ctx.self, 2, 2);
    } else if (roll === 2) {
      const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid);
      if (pool.length > 0) ctx.api.addKeyword(pool[ctx.rng.int(pool.length)], "DivineShield");
      else ctx.api.buffMinion(ctx.self, 1, 1);
    } else {
      const pool = ctx.player.board.filter((m) => m.iid !== ctx.self.iid);
      if (pool.length > 0) ctx.api.buffMinion(pool[ctx.rng.int(pool.length)], 3, 1);
      else ctx.api.buffMinion(ctx.self, 3, 1);
    }
  };
}

export function startOfCombatBuffSelf(atk: number, health: number): CombatEffect {
  return (ctx) => {
    ctx.api.buff(ctx.self, atk, health);
    ctx.log(`${ctx.self.name} readies itself (+${atk}/+${health}).`);
  };
}

export function startOfCombatBuffTribe(tribe: Tribe | undefined, atk: number, health: number): CombatEffect {
  return (ctx) => {
    for (const m of ctx.owner.board) {
      if (!tribe || isTribeMatch(m.tribe, tribe)) ctx.api.buff(m, atk, health);
    }
    ctx.log(`${ctx.self.name} rallies ${tribe ?? "the board"} (+${atk}/+${health}).`);
  };
}

export function startOfCombatDamageRandomEnemy(amount: number): CombatEffect {
  return (ctx) => {
    const t = ctx.api.randomEnemy();
    if (t) {
      ctx.log(`${ctx.self.name} strikes ${t.name} for ${amount} before the fight begins.`);
      ctx.api.dealDamage(t, amount, ctx.self);
    }
  };
}

export function deathrattleSummon(defId: string, count: number, opts?: { golden?: boolean; atkBonus?: number; healthBonus?: number }): CombatEffect {
  return (ctx) => {
    for (let i = 0; i < count; i++) {
      const s = ctx.api.summon(ctx.owner, defId, opts ?? {}, 0);
      if (s) ctx.log(`${ctx.self.name}'s deathrattle summons ${s.name}.`);
    }
  };
}

export function deathrattleBuffRandomFriendly(atk: number, health: number, count: number): CombatEffect {
  return (ctx) => {
    for (let i = 0; i < count; i++) {
      const t = ctx.api.randomFriendly();
      if (t) {
        ctx.api.buff(t, atk, health);
        ctx.log(`${ctx.self.name}'s deathrattle empowers ${t.name} (+${atk}/+${health}).`);
      }
    }
  };
}

export function deathrattleDamageRandomEnemy(amount: number): CombatEffect {
  return (ctx) => {
    const t = ctx.api.randomEnemy();
    if (t) {
      ctx.api.dealDamage(t, amount, ctx.self);
      ctx.log(`${ctx.self.name}'s deathrattle blasts ${t.name} for ${amount}.`);
    }
  };
}

export function combineCombat(...effects: CombatEffect[]): CombatEffect {
  return (ctx) => {
    for (const e of effects) e(ctx);
  };
}

export function frenzyBuffSelf(atk: number, health: number): CombatEffect {
  return (ctx) => {
    ctx.api.buff(ctx.self, atk, health);
    ctx.log(`${ctx.self.name}'s Frenzy triggers (+${atk}/+${health}).`);
  };
}

export function frenzyGiveKeyword(kw: Keyword): CombatEffect {
  return (ctx) => {
    ctx.api.addKeyword(ctx.self, kw);
    ctx.log(`${ctx.self.name}'s Frenzy grants itself ${kw}.`);
  };
}

export function avengeBuffSelf(atk: number, health: number): CombatEffect {
  return (ctx) => {
    ctx.api.buff(ctx.self, atk, health);
    ctx.log(`${ctx.self.name} is avenged (+${atk}/+${health}).`);
  };
}

export function avengeDamageRandomEnemy(amount: number): CombatEffect {
  return (ctx) => {
    const t = ctx.api.randomEnemy();
    if (t) {
      ctx.api.dealDamage(t, amount, ctx.self);
      ctx.log(`${ctx.self.name} is avenged, striking ${t.name} for ${amount}.`);
    }
  };
}
