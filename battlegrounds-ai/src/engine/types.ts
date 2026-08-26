import type { RNG } from "@/lib/rng";

export type Tribe =
  | "Beast"
  | "Murloc"
  | "Demon"
  | "Mech"
  | "Dragon"
  | "Elemental"
  | "Pirate"
  | "Naga"
  | "Quilboar"
  | "Undead"
  | "All"
  | "None";

export const ALL_TRIBES: Tribe[] = [
  "Beast",
  "Murloc",
  "Demon",
  "Mech",
  "Dragon",
  "Elemental",
  "Pirate",
  "Naga",
  "Quilboar",
  "Undead",
];

export type Keyword =
  | "Taunt"
  | "DivineShield"
  | "Poisonous"
  | "Windfury"
  | "MegaWindfury"
  | "Reborn"
  | "Stealth"
  | "Frenzy"
  | "Avenge";

export interface StatLine {
  attack: number;
  health: number;
}

export interface MinionInstance {
  iid: string;
  defId: string;
  name: string;
  tribe: Tribe;
  tier: number;
  golden: boolean;
  attack: number;
  health: number;
  maxHealth: number;
  keywords: Keyword[];
  frenzyUsed: boolean;
  avengeThreshold: number | null;
  avengeProgress: number;
  justSummoned: boolean;
  text: string;
}

export interface ShopEffectApi {
  buffMinion(target: MinionInstance, atk: number, health: number): void;
  addKeyword(target: MinionInstance, kw: Keyword): void;
  summonToBoard(player: PlayerState, defId: string, opts?: { golden?: boolean; atkBonus?: number; healthBonus?: number }, atIndex?: number): MinionInstance | null;
  gainGold(player: PlayerState, amount: number): void;
  gainBloodGems(player: PlayerState, amount: number): void;
  consumeBloodGems(player: PlayerState): number;
  drawFromPoolToShop(player: PlayerState, count: number, filter?: (defId: string) => boolean): void;
  buffAllFriendly(player: PlayerState, atk: number, health: number, filter?: (m: MinionInstance) => boolean): void;
  sellFromBoard(player: PlayerState, target: MinionInstance): void;
}

export interface ShopEffectContext {
  self: MinionInstance;
  player: PlayerState;
  game: GameState;
  rng: RNG;
  api: ShopEffectApi;
  event?: unknown;
}

export type ShopEffect = (ctx: ShopEffectContext) => void;

export interface CombatSide {
  seat: number;
  board: MinionInstance[];
  heroId: string;
}

export interface CombatEffectApi {
  dealDamage(target: MinionInstance, amount: number, source?: MinionInstance): void;
  buff(target: MinionInstance, atk: number, health: number): void;
  addKeyword(target: MinionInstance, kw: Keyword): void;
  summon(side: CombatSide, defId: string, opts: { golden?: boolean; atkBonus?: number; healthBonus?: number }, nearIndex: number): MinionInstance | null;
  randomEnemy(): MinionInstance | null;
  randomFriendly(exclude?: MinionInstance): MinionInstance | null;
  friendlyNeighbors(target: MinionInstance): MinionInstance[];
}

export interface CombatEffectContext {
  self: MinionInstance;
  owner: CombatSide;
  enemy: CombatSide;
  rng: RNG;
  api: CombatEffectApi;
  event?: unknown;
  log(msg: string): void;
}

export type CombatEffect = (ctx: CombatEffectContext) => void;

export interface MinionAura {
  tribe?: Tribe;
  buff: StatLine;
  description: string;
}

export interface MinionDef {
  id: string;
  name: string;
  tier: number;
  tribe: Tribe;
  attack: number;
  health: number;
  keywords: Keyword[];
  text: string;
  poolCopies: number;
  purchasable?: boolean;
  avengeThreshold?: number;
  effects?: {
    battlecry?: ShopEffect;
    onSell?: ShopEffect;
    endOfTurn?: ShopEffect;
    startOfCombat?: CombatEffect;
    deathrattle?: CombatEffect;
    onAnyDeath?: CombatEffect;
    onDamaged?: CombatEffect;
    onAttack?: CombatEffect;
    avengeTrigger?: CombatEffect;
  };
  aura?: MinionAura;
  tags?: string[];
}

export interface HeroPowerDef {
  name: string;
  text: string;
  cost: number;
  passive: boolean;
  activate?: (ctx: ShopEffectContext) => void;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  power: HeroPowerDef;
  flavor: string;
}

export interface AnomalyDef {
  id: string;
  name: string;
  text: string;
  buyCostDelta?: number;
  refreshFree?: boolean;
  upgradeCostDelta?: number;
  startingTier?: number;
  goldCapDelta?: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  heroId: string;
  isLearner: boolean;
  profileId: string;
  health: number;
  armor: number;
  maxHealth: number;
  tavernTier: number;
  gold: number;
  goldCap: number;
  board: MinionInstance[];
  shop: MinionInstance[];
  frozen: boolean;
  bloodGems: number;
  heroPowerUsed: boolean;
  heroPowerCharges: number;
  alive: boolean;
  placement: number | null;
  triplesThisGame: number;
  tribeCounts: Partial<Record<Tribe, number>>;
  lastCombatResult: "win" | "loss" | "tie" | null;
  turnsSinceUpgrade: number;
  actionsThisTurn: number;
  turnCounters: Record<string, number>;
  permanentUpgradeDiscount: number;
}

export interface TavernPool {
  counts: Record<string, number>;
  take(defId: string): boolean;
  drawRandom(rng: RNG, maxTier: number, weightFn: (tier: number) => number, exclude?: Set<string>): string | null;
  ret(defId: string, n?: number): void;
  totalAvailable(maxTier: number): number;
}

export interface GameState {
  seed: number;
  round: number;
  players: PlayerState[];
  pool: TavernPool;
  anomaly: AnomalyDef;
  finished: boolean;
}

export type ActionKind =
  | "buy"
  | "sell"
  | "reroll"
  | "freeze"
  | "unfreeze"
  | "upgrade"
  | "heroPower"
  | "endTurn";

export interface GameAction {
  kind: ActionKind;
  shopIndex?: number;
  boardIndex?: number;
}

export interface CombatStep {
  kind: "attack" | "death" | "deathrattle" | "reborn" | "divineShieldPop" | "trigger" | "summon";
  text: string;
  attackerIid?: string;
  defenderIid?: string;
  damage?: number;
}

export interface PlayerSnapshot {
  seat: number;
  name: string;
  heroName: string;
  health: number;
  armor: number;
  tavernTier: number;
  gold: number;
  goldCap: number;
  board: MinionInstance[];
  shop: MinionInstance[];
  frozen: boolean;
  alive: boolean;
  placement: number | null;
  isLearner: boolean;
}

export type GameEvent =
  | { type: "roundStart"; round: number }
  | {
      type: "recruitAction";
      round: number;
      seat: number;
      action: GameAction;
      commentary: string | null;
      reasoning: DecisionExplanation | null;
      snapshot: PlayerSnapshot;
    }
  | {
      type: "combatResult";
      round: number;
      seat: number;
      opponentSeat: number | null;
      result: "win" | "loss" | "tie";
      damage: number;
      log: CombatStep[];
      heroBoardBefore: MinionInstance[];
      enemyBoardBefore: MinionInstance[];
      heroHealthAfter: number;
    }
  | { type: "playerEliminated"; round: number; seat: number; placement: number }
  | { type: "gameOver"; placements: Record<number, number>; winnerSeat: number };

export interface FeatureVector {
  values: number[];
}

export interface DecisionExplanation {
  actionLabel: string;
  topFactors: { label: string; weight: number; contribution: number }[];
  valueEstimate: number;
  winProbEstimate: number | null;
  note: string | null;
}

export interface HeroTrajectoryStep {
  round: number;
  features: number[];
  valuePred: number;
  combatRewardAfter: number | null;
}

export interface AgentProfile {
  id: string;
  label: string;
  learner: boolean;
  weights: number[];
  tribeBias: Partial<Record<Tribe, number>>;
  greed: number;
  explorationRate: number;
}
