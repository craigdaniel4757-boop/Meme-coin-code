import type { RNG } from "@/lib/rng";
import type { CombatEffectApi, CombatSide, CombatStep, MinionInstance } from "@/engine/types";
import { getMinionDef } from "@/engine/data/minions";
import { instantiate } from "@/engine/factory";
import { MAX_BOARD_SIZE } from "@/engine/data/constants";

export interface CombatOutcome {
  log: CombatStep[];
  survivingSeatA: boolean;
  survivingSeatB: boolean;
  deadIidsA: Set<string>;
  deadIidsB: Set<string>;
  dsPoppedIidsA: Set<string>;
  dsPoppedIidsB: Set<string>;
  frenzyIidsA: Set<string>;
  frenzyIidsB: Set<string>;
  damage: number;
  result: "A" | "B" | "tie";
}

function cloneForCombat(board: MinionInstance[]): MinionInstance[] {
  return board.map((m) => ({
    ...m,
    health: m.maxHealth,
    keywords: [...m.keywords],
    avengeProgress: 0,
    justSummoned: false,
  }));
}

function buildApi(side: CombatSide, enemy: CombatSide, rng: RNG, log: CombatStep[]): CombatEffectApi {
  return {
    dealDamage(target, amount, source) {
      applyDamage(target, amount, side.board.includes(target) ? side : enemy, side.board.includes(target) ? enemy : side, rng, log, source);
    },
    buff(target, atk, health) {
      target.attack = Math.max(0, target.attack + atk);
      target.health += health;
      target.maxHealth = Math.max(target.maxHealth, target.health);
    },
    addKeyword(target, kw) {
      if (!target.keywords.includes(kw)) target.keywords.push(kw);
    },
    summon(targetSide, defId, opts, nearIndex) {
      if (targetSide.board.length >= MAX_BOARD_SIZE) return null;
      const def = getMinionDef(defId);
      const inst = instantiate(def, opts.golden ?? false, { atk: opts.atkBonus, health: opts.healthBonus });
      const idx = Math.min(Math.max(nearIndex, 0), targetSide.board.length);
      targetSide.board.splice(idx, 0, inst);
      return inst;
    },
    randomEnemy() {
      const alive = enemy.board.filter((m) => m.health > 0);
      if (alive.length === 0) return null;
      return alive[rng.int(alive.length)];
    },
    randomFriendly(exclude) {
      const alive = side.board.filter((m) => m.health > 0 && m.iid !== exclude?.iid);
      if (alive.length === 0) return null;
      return alive[rng.int(alive.length)];
    },
    friendlyNeighbors(target) {
      const idx = side.board.findIndex((m) => m.iid === target.iid);
      if (idx === -1) return [];
      const out: MinionInstance[] = [];
      if (side.board[idx - 1]) out.push(side.board[idx - 1]);
      if (side.board[idx + 1]) out.push(side.board[idx + 1]);
      return out;
    },
  };
}

function applyDamage(target: MinionInstance, amount: number, targetSide: CombatSide, attackerSide: CombatSide, rng: RNG, log: CombatStep[], source?: MinionInstance) {
  if (target.health <= 0) return;
  if (target.keywords.includes("DivineShield")) {
    target.keywords = target.keywords.filter((k) => k !== "DivineShield");
    log.push({ kind: "divineShieldPop", text: `${target.name}'s Divine Shield absorbs the blow.`, defenderIid: target.iid });
    return;
  }
  target.health -= amount;
  const isPoison = source?.keywords.includes("Poisonous") && amount > 0;
  if (isPoison) target.health = Math.min(target.health, 0);
  if (target.health > 0 && !target.frenzyUsed) {
    const def = getMinionDef(target.defId);
    if (def.effects?.onDamaged) {
      target.frenzyUsed = true;
      def.effects.onDamaged({ self: target, owner: targetSide, enemy: attackerSide, rng, api: buildApi(targetSide, attackerSide, rng, log), log: (msg) => log.push({ kind: "trigger", text: msg }) });
    }
  }
}

function runDeaths(sideA: CombatSide, sideB: CombatSide, rng: RNG, log: CombatStep[]) {
  let again = true;
  while (again) {
    again = false;
    for (const [side, enemy] of [
      [sideA, sideB],
      [sideB, sideA],
    ] as [CombatSide, CombatSide][]) {
      const dead = side.board.filter((m) => m.health <= 0);
      if (dead.length === 0) continue;
      again = true;
      for (const d of dead) {
        log.push({ kind: "death", text: `${d.name} dies.`, defenderIid: d.iid });
        const def = getMinionDef(d.defId);
        const idx = side.board.findIndex((m) => m.iid === d.iid);
        side.board = side.board.filter((m) => m.iid !== d.iid);
        if (def.effects?.deathrattle) {
          def.effects.deathrattle({ self: d, owner: side, enemy, rng, api: buildApi(side, enemy, rng, log), log: (msg) => log.push({ kind: "trigger", text: msg }) });
        }
        if (d.keywords.includes("Reborn")) {
          const reborn = instantiate(def, d.golden, {});
          reborn.health = 1;
          reborn.maxHealth = 1;
          reborn.keywords = reborn.keywords.filter((k) => k !== "Reborn");
          const insertAt = Math.min(idx, side.board.length);
          side.board.splice(insertAt, 0, reborn);
          log.push({ kind: "reborn", text: `${d.name} is Reborn!`, defenderIid: reborn.iid });
        }
        for (const survivor of side.board) {
          if (survivor.avengeThreshold != null) {
            survivor.avengeProgress += 1;
            if (survivor.avengeProgress >= survivor.avengeThreshold) {
              survivor.avengeProgress = 0;
              const sdef = getMinionDef(survivor.defId);
              sdef.effects?.avengeTrigger?.({ self: survivor, owner: side, enemy, rng, api: buildApi(side, enemy, rng, log), log: (msg) => log.push({ kind: "trigger", text: msg }) });
            }
          }
        }
      }
    }
  }
}

function runStartOfCombat(sideA: CombatSide, sideB: CombatSide, rng: RNG, log: CombatStep[]) {
  const first = rng.chance(0.5) ? sideA : sideB;
  const second = first === sideA ? sideB : sideA;
  const maxLen = Math.max(first.board.length, second.board.length);
  for (let i = 0; i < maxLen; i++) {
    const fm = first.board[i];
    if (fm && fm.health > 0) {
      const def = getMinionDef(fm.defId);
      const enemyOf = first === sideA ? sideB : sideA;
      def.effects?.startOfCombat?.({ self: fm, owner: first, enemy: enemyOf, rng, api: buildApi(first, enemyOf, rng, log), log: (msg) => log.push({ kind: "trigger", text: msg }) });
      runDeaths(sideA, sideB, rng, log);
    }
    const sm = second.board[i];
    if (sm && sm.health > 0) {
      const def = getMinionDef(sm.defId);
      const enemyOf = second === sideA ? sideB : sideA;
      def.effects?.startOfCombat?.({ self: sm, owner: second, enemy: enemyOf, rng, api: buildApi(second, enemyOf, rng, log), log: (msg) => log.push({ kind: "trigger", text: msg }) });
      runDeaths(sideA, sideB, rng, log);
    }
  }
}

function pickTarget(rng: RNG, defenders: MinionInstance[]): MinionInstance | null {
  const alive = defenders.filter((m) => m.health > 0);
  if (alive.length === 0) return null;
  const taunts = alive.filter((m) => m.keywords.includes("Taunt"));
  const pool = taunts.length > 0 ? taunts : alive;
  return pool[rng.int(pool.length)];
}

function attacksRemainingFor(m: MinionInstance): number {
  if (m.keywords.includes("MegaWindfury")) return 4;
  if (m.keywords.includes("Windfury")) return 2;
  return 1;
}

export function simulateCombat(boardA: MinionInstance[], boardB: MinionInstance[], tierA: number, tierB: number, seatA: number, seatB: number, heroA: string, heroB: string, rng: RNG): CombatOutcome {
  const log: CombatStep[] = [];
  const sideA: CombatSide = { seat: seatA, board: cloneForCombat(boardA), heroId: heroA };
  const sideB: CombatSide = { seat: seatB, board: cloneForCombat(boardB), heroId: heroB };
  const idsA = new Set(boardA.map((m) => m.iid));
  const idsB = new Set(boardB.map((m) => m.iid));

  if (sideA.board.length === 0 && sideB.board.length === 0) {
    return emptyOutcome(log);
  }

  runStartOfCombat(sideA, sideB, rng, log);

  let turn: "A" | "B" = sideA.board.length >= sideB.board.length ? "A" : "B";
  if (sideA.board.length === sideB.board.length) turn = rng.chance(0.5) ? "A" : "B";
  let pointerA = 0;
  let pointerB = 0;

  let guard = 0;
  while (sideA.board.some((m) => m.health > 0) && sideB.board.some((m) => m.health > 0) && guard < 500) {
    guard += 1;
    const attackingSide = turn === "A" ? sideA : sideB;
    const defendingSide = turn === "A" ? sideB : sideA;
    const attackerAlive = attackingSide.board.filter((m) => m.health > 0);
    if (attackerAlive.length === 0) {
      turn = turn === "A" ? "B" : "A";
      continue;
    }
    const pointer = turn === "A" ? pointerA : pointerB;
    const idx = pointer % attackerAlive.length;
    const attacker = attackerAlive[idx];
    if (turn === "A") pointerA += 1;
    else pointerB += 1;

    const hits = attacksRemainingFor(attacker);
    for (let hit = 0; hit < hits; hit++) {
      if (attacker.health <= 0) break;
      const defender = pickTarget(rng, defendingSide.board);
      if (!defender) break;

      log.push({ kind: "attack", text: `${attacker.name} attacks ${defender.name}.`, attackerIid: attacker.iid, defenderIid: defender.iid, damage: attacker.attack });

      const attackerSideObj = turn === "A" ? sideA : sideB;
      const defenderSideObj = turn === "A" ? sideB : sideA;
      applyDamage(defender, attacker.attack, defenderSideObj, attackerSideObj, rng, log, attacker);
      applyDamage(attacker, defender.attack, attackerSideObj, defenderSideObj, rng, log, defender);

      const adef = getMinionDef(attacker.defId);
      if (attacker.health > 0 && adef.effects?.onAttack) {
        adef.effects.onAttack({ self: attacker, owner: attackerSideObj, enemy: defenderSideObj, rng, api: buildApi(attackerSideObj, defenderSideObj, rng, log), log: (msg) => log.push({ kind: "trigger", text: msg }) });
      }

      runDeaths(sideA, sideB, rng, log);
      if (!sideA.board.some((m) => m.health > 0) || !sideB.board.some((m) => m.health > 0)) break;
    }

    turn = turn === "A" ? "B" : "A";
  }

  const aAlive = sideA.board.filter((m) => m.health > 0);
  const bAlive = sideB.board.filter((m) => m.health > 0);
  const deadIidsA = new Set([...idsA].filter((iid) => !aAlive.some((m) => m.iid === iid)));
  const deadIidsB = new Set([...idsB].filter((iid) => !bAlive.some((m) => m.iid === iid)));
  const dsPoppedIidsA = new Set(boardA.filter((m) => m.keywords.includes("DivineShield") && !sideA.board.find((s) => s.iid === m.iid)?.keywords.includes("DivineShield") && aAlive.some((s) => s.iid === m.iid)).map((m) => m.iid));
  const dsPoppedIidsB = new Set(boardB.filter((m) => m.keywords.includes("DivineShield") && !sideB.board.find((s) => s.iid === m.iid)?.keywords.includes("DivineShield") && bAlive.some((s) => s.iid === m.iid)).map((m) => m.iid));
  const frenzyIidsA = new Set(sideA.board.filter((m) => m.frenzyUsed).map((m) => m.iid));
  const frenzyIidsB = new Set(sideB.board.filter((m) => m.frenzyUsed).map((m) => m.iid));

  let result: "A" | "B" | "tie" = "tie";
  let damage = 0;
  if (aAlive.length > 0 && bAlive.length === 0) {
    result = "A";
    damage = tierA + aAlive.reduce((s, m) => s + (m.golden ? m.tier * 2 : m.tier), 0);
  } else if (bAlive.length > 0 && aAlive.length === 0) {
    result = "B";
    damage = tierB + bAlive.reduce((s, m) => s + (m.golden ? m.tier * 2 : m.tier), 0);
  }

  return { log, survivingSeatA: aAlive.length > 0, survivingSeatB: bAlive.length > 0, deadIidsA, deadIidsB, dsPoppedIidsA, dsPoppedIidsB, frenzyIidsA, frenzyIidsB, damage, result };
}

function emptyOutcome(log: CombatStep[]): CombatOutcome {
  return {
    log,
    survivingSeatA: false,
    survivingSeatB: false,
    deadIidsA: new Set(),
    deadIidsB: new Set(),
    dsPoppedIidsA: new Set(),
    dsPoppedIidsB: new Set(),
    frenzyIidsA: new Set(),
    frenzyIidsB: new Set(),
    damage: 0,
    result: "tie",
  };
}

export function applyCombatResultToBoard(board: MinionInstance[], outcome: { deadIids: Set<string>; dsPoppedIids: Set<string>; frenzyIids: Set<string> }): MinionInstance[] {
  return board
    .filter((m) => !outcome.deadIids.has(m.iid))
    .map((m) => {
      const next = { ...m, keywords: [...m.keywords] };
      if (outcome.dsPoppedIids.has(m.iid)) next.keywords = next.keywords.filter((k) => k !== "DivineShield");
      if (outcome.frenzyIids.has(m.iid)) next.frenzyUsed = true;
      next.health = next.maxHealth;
      return next;
    });
}

export function estimateWinProbability(boardA: MinionInstance[], boardB: MinionInstance[], tierA: number, tierB: number, rng: RNG, iterations = 24): { winRate: number; tieRate: number; lossRate: number; avgDamage: number } {
  let wins = 0;
  let ties = 0;
  let losses = 0;
  let damageSum = 0;
  for (let i = 0; i < iterations; i++) {
    const outcome = simulateCombat(boardA, boardB, tierA, tierB, 0, 1, "sim", "sim", rng);
    if (outcome.result === "A") {
      wins += 1;
      damageSum += outcome.damage;
    } else if (outcome.result === "B") {
      losses += 1;
      damageSum -= outcome.damage;
    } else {
      ties += 1;
    }
  }
  return { winRate: wins / iterations, tieRate: ties / iterations, lossRate: losses / iterations, avgDamage: damageSum / iterations };
}
