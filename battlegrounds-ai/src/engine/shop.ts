import type { RNG } from "@/lib/rng";
import type { GameAction, GameState, MinionInstance, PlayerSnapshot, PlayerState, ShopEffectApi, ShopEffectContext } from "@/engine/types";
import { getHeroDef } from "@/engine/data/heroes";
import { getMinionDef, minionsForTier, PURCHASABLE_MINIONS } from "@/engine/data/minions";
import { instantiate } from "@/engine/factory";
import { BUY_COST, MAX_BOARD_SIZE, MAX_TAVERN_TIER, REFRESH_COST, SELL_VALUE, SHOP_SIZE_BY_TIER, STARTING_GOLD_CAP, STARTING_HEALTH, TAVERN_UPGRADE_BASE_COST } from "@/engine/data/constants";
import { defaultTierWeight } from "@/engine/pool";

export function createPlayer(seat: number, name: string, heroId: string, profileId: string, isLearner: boolean, startingTier: number, goldCapDelta: number): PlayerState {
  return {
    seat,
    name,
    heroId,
    isLearner,
    profileId,
    health: STARTING_HEALTH,
    armor: 0,
    maxHealth: STARTING_HEALTH,
    tavernTier: startingTier,
    gold: STARTING_GOLD_CAP,
    goldCap: STARTING_GOLD_CAP + goldCapDelta,
    board: [],
    shop: [],
    frozen: false,
    bloodGems: 0,
    heroPowerUsed: false,
    heroPowerCharges: 1,
    alive: true,
    placement: null,
    triplesThisGame: 0,
    tribeCounts: {},
    lastCombatResult: null,
    turnsSinceUpgrade: 0,
    actionsThisTurn: 0,
    turnCounters: {},
    permanentUpgradeDiscount: 0,
  };
}

export function clonePlayerState(player: PlayerState): PlayerState {
  return {
    ...player,
    board: player.board.map((m) => ({ ...m, keywords: [...m.keywords] })),
    shop: player.shop.map((m) => ({ ...m, keywords: [...m.keywords] })),
    tribeCounts: { ...player.tribeCounts },
    turnCounters: { ...player.turnCounters },
  };
}

function buyCost(game: GameState): number {
  return Math.max(1, BUY_COST + (game.anomaly.buyCostDelta ?? 0));
}

export function upgradeCost(game: GameState, player: PlayerState): number {
  const nextTier = player.tavernTier + 1;
  const base = TAVERN_UPGRADE_BASE_COST[nextTier] ?? 999;
  const turnsElapsed = player.turnsSinceUpgrade;
  const raw = base - turnsElapsed + (game.anomaly.upgradeCostDelta ?? 0) - player.permanentUpgradeDiscount;
  return Math.max(1, raw);
}

function buildApi(game: GameState, player: PlayerState, rng: RNG): ShopEffectApi {
  return {
    buffMinion(target, atk, health) {
      target.attack = Math.max(0, target.attack + atk);
      target.health = Math.max(1, target.health + health);
      target.maxHealth = Math.max(target.maxHealth, target.health);
    },
    addKeyword(target, kw) {
      if (!target.keywords.includes(kw)) target.keywords.push(kw);
    },
    summonToBoard(p, defId, opts, atIndex) {
      if (p.board.length >= MAX_BOARD_SIZE) return null;
      const def = getMinionDef(defId);
      const inst = instantiate(def, opts?.golden ?? false, { atk: opts?.atkBonus, health: opts?.healthBonus });
      const idx = atIndex === undefined ? p.board.length : Math.min(atIndex, p.board.length);
      p.board.splice(idx, 0, inst);
      recordTribe(p, inst);
      return inst;
    },
    gainGold(p, amount) {
      p.gold = Math.max(0, p.gold + amount);
    },
    gainBloodGems(p, amount) {
      p.bloodGems += amount;
    },
    consumeBloodGems(p) {
      const n = p.bloodGems;
      p.bloodGems = 0;
      return n;
    },
    drawFromPoolToShop(p, count, filter) {
      for (let i = 0; i < count; i++) {
        const defId = game.pool.drawRandom(rng, p.tavernTier, (t) => defaultTierWeight(p.tavernTier, t));
        if (!defId) break;
        if (filter && !filter(defId)) {
          game.pool.ret(defId);
          continue;
        }
        if (game.pool.take(defId)) {
          const def = getMinionDef(defId);
          p.shop.push(instantiate(def, false));
        }
      }
    },
    buffAllFriendly(p, atk, health, filter) {
      for (const m of p.board) {
        if (!filter || filter(m)) {
          m.attack = Math.max(0, m.attack + atk);
          m.health = Math.max(1, m.health + health);
          m.maxHealth = Math.max(m.maxHealth, m.health);
        }
      }
    },
    sellFromBoard(p, target) {
      const idx = p.board.findIndex((m) => m.iid === target.iid);
      if (idx === -1) return;
      p.board.splice(idx, 1);
      game.pool.ret(target.defId, target.golden ? 3 : 1);
    },
  };
}

function recordTribe(player: PlayerState, m: MinionInstance) {
  if (m.tribe === "None") return;
  player.tribeCounts[m.tribe] = (player.tribeCounts[m.tribe] ?? 0) + 1;
}

function checkTripleCombine(game: GameState, player: PlayerState) {
  const counts = new Map<string, MinionInstance[]>();
  for (const m of player.board) {
    if (m.golden) continue;
    const list = counts.get(m.defId) ?? [];
    list.push(m);
    counts.set(m.defId, list);
  }
  for (const [defId, list] of counts) {
    if (list.length >= 3) {
      const toRemove = new Set(list.slice(0, 3).map((m) => m.iid));
      const firstIdx = player.board.findIndex((m) => toRemove.has(m.iid));
      player.board = player.board.filter((m) => !toRemove.has(m.iid));
      const def = getMinionDef(defId);
      const golden = instantiate(def, true);
      const idx = Math.min(firstIdx, player.board.length);
      player.board.splice(idx, 0, golden);
      player.triplesThisGame += 1;
    }
  }
}

export function rollShop(game: GameState, player: PlayerState, rng: RNG, force: boolean) {
  if (player.frozen && !force) return;
  for (const m of player.shop) game.pool.ret(m.defId);
  player.shop = [];
  const size = SHOP_SIZE_BY_TIER[player.tavernTier] ?? 3;
  for (let i = 0; i < size; i++) {
    const defId = game.pool.drawRandom(rng, player.tavernTier, (t) => defaultTierWeight(player.tavernTier, t));
    if (!defId) break;
    if (game.pool.take(defId)) {
      player.shop.push(instantiate(getMinionDef(defId), false));
    }
  }
  player.frozen = false;
}

export function canAfford(game: GameState, player: PlayerState, action: GameAction): boolean {
  switch (action.kind) {
    case "buy":
      return player.gold >= buyCost(game) && player.board.length < MAX_BOARD_SIZE;
    case "sell":
      return player.board.length > (action.boardIndex ?? -1) && (action.boardIndex ?? -1) >= 0;
    case "reroll":
      return player.gold >= (game.anomaly.refreshFree ? 0 : REFRESH_COST);
    case "upgrade":
      return player.tavernTier < MAX_TAVERN_TIER && player.gold >= upgradeCost(game, player);
    case "heroPower": {
      const hero = getHeroDef(player.heroId);
      return !player.heroPowerUsed && player.gold >= hero.power.cost;
    }
    case "freeze":
    case "unfreeze":
    case "endTurn":
      return true;
    default:
      return false;
  }
}

export function legalActions(game: GameState, player: PlayerState): GameAction[] {
  const actions: GameAction[] = [];
  if (player.board.length < MAX_BOARD_SIZE) {
    for (let i = 0; i < player.shop.length; i++) {
      const a: GameAction = { kind: "buy", shopIndex: i };
      if (canAfford(game, player, a)) actions.push(a);
    }
  }
  for (let i = 0; i < player.board.length; i++) {
    actions.push({ kind: "sell", boardIndex: i });
  }
  if (canAfford(game, player, { kind: "reroll" })) actions.push({ kind: "reroll" });
  if (canAfford(game, player, { kind: "upgrade" })) actions.push({ kind: "upgrade" });
  if (canAfford(game, player, { kind: "heroPower" })) actions.push({ kind: "heroPower" });
  if (!player.turnCounters.freezeActionUsed) {
    actions.push(player.frozen ? { kind: "unfreeze" } : { kind: "freeze" });
  }
  actions.push({ kind: "endTurn" });
  return actions;
}

function runShopEffect(effect: ((ctx: ShopEffectContext) => void) | undefined, game: GameState, player: PlayerState, self: MinionInstance, rng: RNG) {
  if (!effect) return;
  effect({ self, player, game, rng, api: buildApi(game, player, rng) });
}

export function applyAction(game: GameState, player: PlayerState, action: GameAction, rng: RNG): void {
  player.actionsThisTurn += 1;
  switch (action.kind) {
    case "buy": {
      const idx = action.shopIndex ?? -1;
      const shopMinion = player.shop[idx];
      if (!shopMinion || player.board.length >= MAX_BOARD_SIZE) return;
      const cost = buyCost(game);
      if (player.gold < cost) return;
      player.gold -= cost;
      player.shop.splice(idx, 1);
      const boardIdx = chooseBoardInsertIndex(player, shopMinion);
      player.board.splice(boardIdx, 0, shopMinion);
      recordTribe(player, shopMinion);
      runShopEffect(getMinionDef(shopMinion.defId).effects?.battlecry, game, player, shopMinion, rng);
      checkTripleCombine(game, player);
      return;
    }
    case "sell": {
      const idx = action.boardIndex ?? -1;
      const target = player.board[idx];
      if (!target) return;
      runShopEffect(getMinionDef(target.defId).effects?.onSell, game, player, target, rng);
      player.board.splice(idx, 1);
      game.pool.ret(target.defId, target.golden ? 3 : 1);
      player.gold += SELL_VALUE;
      return;
    }
    case "reroll": {
      const cost = game.anomaly.refreshFree ? 0 : REFRESH_COST;
      if (player.gold < cost) return;
      player.gold -= cost;
      rollShop(game, player, rng, true);
      return;
    }
    case "freeze":
      player.frozen = true;
      player.turnCounters.freezeActionUsed = 1;
      return;
    case "unfreeze":
      player.frozen = false;
      player.turnCounters.freezeActionUsed = 1;
      return;
    case "upgrade": {
      if (player.tavernTier >= MAX_TAVERN_TIER) return;
      const cost = upgradeCost(game, player);
      if (player.gold < cost) return;
      player.gold -= cost;
      player.tavernTier += 1;
      player.turnsSinceUpgrade = 0;
      return;
    }
    case "heroPower": {
      const hero = getHeroDef(player.heroId);
      if (player.heroPowerUsed || player.gold < hero.power.cost || !hero.power.activate) return;
      player.gold -= hero.power.cost;
      player.heroPowerUsed = true;
      const dummySelf: MinionInstance = player.board[0] ?? {
        iid: "hero-self",
        defId: "hero-self",
        name: hero.name,
        tribe: "None",
        tier: 1,
        golden: false,
        attack: 0,
        health: 1,
        maxHealth: 1,
        keywords: [],
        frenzyUsed: false,
        avengeThreshold: null,
        avengeProgress: 0,
        justSummoned: false,
        text: "",
      };
      hero.power.activate({ self: dummySelf, player, game, rng, api: buildApi(game, player, rng) });
      return;
    }
    case "endTurn":
      return;
    default:
      return;
  }
}

function chooseBoardInsertIndex(player: PlayerState, incoming: MinionInstance): number {
  if (incoming.keywords.includes("Taunt")) {
    let idx = 0;
    while (idx < player.board.length && player.board[idx].keywords.includes("Taunt")) idx++;
    return idx;
  }
  return player.board.length;
}

export function startTurnReset(game: GameState, player: PlayerState, rng: RNG) {
  player.heroPowerUsed = false;
  player.actionsThisTurn = 0;
  player.turnCounters = {};
  player.turnsSinceUpgrade += 1;
  player.gold = player.goldCap;
  rollShop(game, player, rng, false);
}

export function advanceGoldCap(player: PlayerState) {
  if (player.goldCap < 10) player.goldCap += 1;
}

export function snapshotPlayer(player: PlayerState): PlayerSnapshot {
  const hero = getHeroDef(player.heroId);
  return {
    seat: player.seat,
    name: player.name,
    heroName: hero.name,
    health: player.health,
    armor: player.armor,
    tavernTier: player.tavernTier,
    gold: player.gold,
    goldCap: player.goldCap,
    board: player.board.map((m) => ({ ...m, keywords: [...m.keywords] })),
    shop: player.shop.map((m) => ({ ...m, keywords: [...m.keywords] })),
    frozen: player.frozen,
    alive: player.alive,
    placement: player.placement,
    isLearner: player.isLearner,
  };
}

export function allMinionCount(): number {
  return PURCHASABLE_MINIONS.length;
}

export function tierPreview(tier: number): number {
  return minionsForTier(tier).length;
}
