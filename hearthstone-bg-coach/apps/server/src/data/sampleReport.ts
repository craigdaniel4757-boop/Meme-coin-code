import {
  Confidence,
  MinionSnapshot,
  Mistake,
  Report,
  Strength,
  Tribe,
  TurnSnapshot,
} from "../types/schemas";

/**
 * A fully hand-authored, realistic 17-turn game, used both as the response
 * for demo-mode uploads and behind the dedicated GET /api/reports/sample
 * route the landing page's "see a sample report" link hits. It's real data
 * shaped exactly like a live analysis - the same ReportPage component in
 * the frontend renders both.
 */

type MinionTuple = [name: string, attack: number, health: number, tribe: Tribe | null, keywords: string[], golden?: boolean];

function board(...minions: MinionTuple[]): MinionSnapshot[] {
  return minions.map(([name, attack, health, tribe, keywords, golden], position) => ({
    name,
    attack,
    health,
    tribe,
    keywords,
    position,
    golden: golden ?? false,
  }));
}

const TURN_LENGTH_SEC = 28;

interface RawTurn {
  turn: number;
  tavernTier: number;
  goldSpent: number;
  health: number;
  minions: MinionTuple[];
  shopOffers: string[];
  heroPowerUsed: boolean;
  confidence?: Confidence;
}

const RAW_TURNS: RawTurn[] = [
  {
    turn: 1,
    tavernTier: 1,
    goldSpent: 3,
    health: 40,
    minions: [
      ["Alleycat", 1, 1, "Beast", []],
      ["Tabbycat", 1, 1, "Beast", []],
    ],
    shopOffers: ["Murloc Tidehunter", "Fiendish Servant", "Micro Mummy"],
    heroPowerUsed: false,
  },
  {
    turn: 2,
    tavernTier: 1,
    goldSpent: 4,
    health: 40,
    minions: [
      ["Alleycat", 1, 1, "Beast", []],
      ["Tabbycat", 1, 1, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
    ],
    shopOffers: ["Rockpool Hunter", "Vulgar Homunculus", "Selfless Hero"],
    heroPowerUsed: false,
  },
  {
    turn: 3,
    tavernTier: 2,
    goldSpent: 5,
    health: 37,
    minions: [
      ["Alleycat", 1, 1, "Beast", []],
      ["Tabbycat", 1, 1, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
      ["Fiendish Servant", 2, 1, "Demon", ["Deathrattle"]],
    ],
    shopOffers: ["Metaltooth Leaper", "Kindly Grandmother", "Red Whelp"],
    heroPowerUsed: true,
  },
  {
    turn: 4,
    tavernTier: 2,
    goldSpent: 2,
    health: 37,
    minions: [
      ["Alleycat", 1, 1, "Beast", []],
      ["Tabbycat", 1, 1, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
      ["Fiendish Servant", 2, 1, "Demon", ["Deathrattle"]],
      ["Metaltooth Leaper", 3, 2, "Mech", []],
    ],
    shopOffers: ["Houndmaster", "Deflect-o-Bot", "Rat Pack"],
    heroPowerUsed: false,
  },
  {
    turn: 5,
    tavernTier: 2,
    goldSpent: 7,
    health: 22,
    minions: [
      ["Alleycat", 1, 1, "Beast", []],
      ["Tabbycat", 1, 1, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
    ],
    shopOffers: ["Houndmaster", "Kindly Grandmother", "Steward of Time"],
    heroPowerUsed: false,
    confidence: "medium",
  },
  {
    turn: 6,
    tavernTier: 2,
    goldSpent: 8,
    health: 22,
    minions: [
      ["Alleycat", 2, 2, "Beast", []],
      ["Tabbycat", 2, 2, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
      ["Kindly Grandmother", 1, 1, "Beast", ["Deathrattle"]],
      ["Houndmaster", 4, 3, "Beast", []],
    ],
    shopOffers: ["Deflect-o-Bot", "Menagerie Warband", "Twilight Emissary"],
    heroPowerUsed: true,
  },
  {
    turn: 7,
    tavernTier: 2,
    goldSpent: 9,
    health: 19,
    minions: [
      ["Alleycat", 2, 2, "Beast", []],
      ["Tabbycat", 2, 2, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
      ["Kindly Grandmother", 1, 1, "Beast", ["Deathrattle"]],
      ["Houndmaster", 4, 3, "Beast", []],
      ["Deflect-o-Bot", 2, 2, "Mech", ["Divine Shield"]],
    ],
    shopOffers: ["Metaltooth Leaper", "Micro Mummy", "Rat Pack"],
    heroPowerUsed: false,
  },
  {
    turn: 8,
    tavernTier: 2,
    goldSpent: 10,
    health: 19,
    minions: [
      ["Alleycat", 2, 2, "Beast", []],
      ["Tabbycat", 2, 2, "Beast", []],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
      ["Kindly Grandmother", 1, 1, "Beast", ["Deathrattle"]],
      ["Houndmaster", 4, 3, "Beast", ["Divine Shield"]],
      ["Deflect-o-Bot", 2, 2, "Mech", ["Divine Shield"]],
    ],
    shopOffers: ["Rat Pack", "Pack Leader", "Micro Machine"],
    heroPowerUsed: true,
  },
  {
    turn: 9,
    tavernTier: 3,
    goldSpent: 10,
    health: 16,
    minions: [
      ["Alleycat", 2, 2, "Beast", []],
      ["Golden Tabbycat", 4, 4, "Beast", [], true],
      ["Rockpool Hunter", 2, 1, "Murloc", []],
      ["Kindly Grandmother", 1, 1, "Beast", ["Deathrattle"]],
      ["Houndmaster", 4, 3, "Beast", ["Divine Shield"]],
      ["Deflect-o-Bot", 2, 2, "Mech", ["Divine Shield"]],
    ],
    shopOffers: ["Pack Leader", "Rat Pack", "Twilight Emissary"],
    heroPowerUsed: true,
  },
  {
    turn: 10,
    tavernTier: 4,
    goldSpent: 10,
    health: 16,
    minions: [
      ["Alleycat", 2, 2, "Beast", []],
      ["Golden Tabbycat", 4, 4, "Beast", [], true],
      ["Kindly Grandmother", 1, 1, "Beast", ["Deathrattle"]],
      ["Houndmaster", 4, 3, "Beast", []],
      ["Rat Pack", 2, 2, "Beast", []],
      ["Pack Leader", 2, 3, "Beast", []],
    ],
    shopOffers: ["Ironhide Direhorn", "Mama Bear", "Houndmaster"],
    heroPowerUsed: false,
  },
  {
    turn: 11,
    tavernTier: 4,
    goldSpent: 8,
    health: 16,
    minions: [
      ["Alleycat", 3, 3, "Beast", []],
      ["Golden Tabbycat", 5, 5, "Beast", [], true],
      ["Kindly Grandmother", 2, 2, "Beast", ["Deathrattle"]],
      ["Houndmaster", 5, 4, "Beast", []],
      ["Rat Pack", 3, 3, "Beast", []],
      ["Pack Leader", 3, 4, "Beast", []],
      ["Ironhide Direhorn", 7, 8, "Beast", ["Taunt"]],
    ],
    shopOffers: ["Mama Bear", "Rat Pack", "Cave Hydra"],
    heroPowerUsed: true,
  },
  {
    turn: 12,
    tavernTier: 5,
    goldSpent: 5,
    health: 16,
    minions: [
      ["Alleycat", 3, 3, "Beast", []],
      ["Golden Tabbycat", 5, 5, "Beast", [], true],
      ["Kindly Grandmother", 2, 2, "Beast", ["Deathrattle"]],
      ["Houndmaster", 5, 4, "Beast", []],
      ["Rat Pack", 3, 3, "Beast", []],
      ["Pack Leader", 3, 4, "Beast", []],
      ["Ironhide Direhorn", 8, 9, "Beast", ["Taunt"]],
    ],
    shopOffers: ["Mama Bear", "Cave Hydra", "Rat Pack"],
    heroPowerUsed: false,
  },
  {
    turn: 13,
    tavernTier: 5,
    goldSpent: 10,
    health: 13,
    minions: [
      ["Alleycat", 4, 4, "Beast", []],
      ["Golden Tabbycat", 6, 6, "Beast", [], true],
      ["Houndmaster", 6, 5, "Beast", []],
      ["Rat Pack", 4, 4, "Beast", []],
      ["Pack Leader", 4, 5, "Beast", []],
      ["Ironhide Direhorn", 9, 10, "Beast", ["Taunt"]],
      ["Mama Bear", 4, 4, "Beast", []],
    ],
    shopOffers: ["Cave Hydra", "Rat Pack", "Ironhide Direhorn"],
    heroPowerUsed: true,
  },
  {
    turn: 14,
    tavernTier: 6,
    goldSpent: 10,
    health: 13,
    minions: [
      ["Alleycat", 4, 4, "Beast", []],
      ["Golden Tabbycat", 6, 6, "Beast", [], true],
      ["Houndmaster", 6, 5, "Beast", []],
      ["Golden Rat Pack", 4, 4, "Beast", [], true],
      ["Pack Leader", 4, 5, "Beast", []],
      ["Ironhide Direhorn", 9, 10, "Beast", ["Taunt"]],
      ["Mama Bear", 5, 5, "Beast", []],
    ],
    shopOffers: ["Cave Hydra", "Herald of Flame", "Ironhide Direhorn"],
    heroPowerUsed: true,
  },
  {
    turn: 15,
    tavernTier: 6,
    goldSpent: 10,
    health: 13,
    minions: [
      ["Alleycat", 5, 5, "Beast", []],
      ["Golden Tabbycat", 7, 7, "Beast", [], true],
      ["Houndmaster", 7, 6, "Beast", []],
      ["Golden Rat Pack", 5, 5, "Beast", [], true],
      ["Pack Leader", 5, 6, "Beast", []],
      ["Ironhide Direhorn", 10, 11, "Beast", ["Taunt"]],
      ["Mama Bear", 6, 6, "Beast", []],
    ],
    shopOffers: ["Cave Hydra", "Ironhide Direhorn", "Rat Pack"],
    heroPowerUsed: false,
  },
  {
    turn: 16,
    tavernTier: 6,
    goldSpent: 10,
    health: 13,
    minions: [
      ["Alleycat", 5, 5, "Beast", []],
      ["Golden Tabbycat", 7, 7, "Beast", [], true],
      ["Houndmaster", 7, 6, "Beast", []],
      ["Golden Rat Pack", 5, 5, "Beast", [], true],
      ["Pack Leader", 5, 6, "Beast", []],
      ["Ironhide Direhorn", 11, 12, "Beast", ["Taunt"]],
      ["Mama Bear", 6, 6, "Beast", []],
    ],
    shopOffers: ["Cave Hydra", "Rat Pack", "Mama Bear"],
    heroPowerUsed: false,
  },
  {
    turn: 17,
    tavernTier: 6,
    goldSpent: 10,
    health: 0,
    minions: [
      ["Alleycat", 5, 5, "Beast", []],
      ["Golden Tabbycat", 7, 7, "Beast", [], true],
      ["Houndmaster", 7, 6, "Beast", []],
      ["Golden Rat Pack", 5, 5, "Beast", [], true],
      ["Pack Leader", 5, 6, "Beast", []],
      ["Ironhide Direhorn", 11, 12, "Beast", ["Taunt"]],
      ["Mama Bear", 6, 6, "Beast", []],
    ],
    shopOffers: [],
    heroPowerUsed: false,
    confidence: "medium",
  },
];

function buildTurns(): TurnSnapshot[] {
  let previousHealth = 40;
  return RAW_TURNS.map((raw, i) => {
    const healthDelta = i === 0 ? 0 : raw.health - previousHealth;
    const snapshot: TurnSnapshot = {
      turn: raw.turn,
      timestampSec: (raw.turn - 1) * TURN_LENGTH_SEC,
      tavernTier: raw.tavernTier,
      goldAvailable: Math.min(raw.turn + 2, 10),
      goldSpent: raw.goldSpent,
      health: raw.health,
      healthDelta,
      armor: 0,
      board: board(...raw.minions),
      shopOffers: raw.shopOffers,
      heroPowerUsed: raw.heroPowerUsed,
      rerollCount: 0,
      combatResult: i === 0 ? "unknown" : healthDelta < 0 ? "loss" : "win",
      confidence: raw.confidence ?? "high",
    };
    previousHealth = raw.health;
    return snapshot;
  });
}

function buildMistakes(): Omit<Mistake, "id">[] {
  return [
    {
      turn: 2,
      timestampSec: 28,
      category: "hero-power",
      severity: "moderate",
      title: "Hero power used on only 44% of turns",
      explanation:
        "George the Fallen's power (give a friendly minion Divine Shield for 1 gold) went unused on 9 of 16 eligible turns. It's cheap, always relevant, and stacks a real defensive layer onto your board - skipping it that often left a lot of free value on the table.",
      suggestion:
        "Make it a habit to check the hero power button after every shop decision, especially once you're above 3-4 gold and have a minion worth protecting.",
    },
    {
      turn: 4,
      timestampSec: 84,
      category: "economy",
      severity: "minor",
      title: "4 gold left unspent on turn 4",
      explanation:
        "You had 4 gold left over at the end of turn 4 with no Tavern upgrade the turn after. Gold doesn't carry over in Battlegrounds - that gold was simply gone.",
      suggestion: "If you're not mid-upgrade, spend leftover gold on a reroll or a marginal buy rather than passing the turn with it unused.",
    },
    {
      turn: 5,
      timestampSec: 112,
      category: "tempo",
      severity: "major",
      title: "Heavy early damage on turn 5",
      explanation:
        "You took 15 damage on turn 5, dropping from 37 to 22 health while still in the opening stretch of the game. Your board that combat (three 1-2 stat minions) was well under-statted for turn 5 - a common cost of splashing early value picks like Rockpool Hunter and Fiendish Servant instead of prioritizing raw stats.",
      suggestion:
        "In the first five or six turns, lean toward the highest total stats in the shop over synergy pieces you can't support yet. Value tech choices pay off once your board can survive the interim.",
    },
    {
      turn: 6,
      timestampSec: 140,
      category: "tempo",
      severity: "moderate",
      title: "Below 25 health by turn 6",
      explanation:
        "By turn 6 you were down to 22 health, a direct result of the turn 5 loss. Dropping this low this early puts you in range of a single bad matchup ending the run before your comp comes online.",
      suggestion: "When health is already low in the early game, prioritize the safer of two shop options (stats/taunt over greedy value) until you've stabilized.",
    },
    {
      turn: 8,
      timestampSec: 196,
      category: "composition",
      severity: "moderate",
      title: "No clear comp identity by turn 8",
      explanation:
        "Your turn 8 board mixed Beast, Murloc, Demon, and Mech with no tribe holding more than two minions. This late, a board of unrelated stats is usually behind a board leaning on even one active synergy package - and it shows in the pivot cost you paid two turns later selling off Rockpool Hunter and Deflect-o-Bot.",
      suggestion:
        "By the turn 7-8 mark, commit to whichever tribe is most open in your lobby rather than continuing to take the best individual stats regardless of type - the earlier you commit, the less value you waste on cards you'll sell.",
    },
    {
      turn: 9,
      timestampSec: 224,
      category: "positioning",
      severity: "moderate",
      title: "Divine Shields grouped together (turn 8-9)",
      explanation:
        "Houndmaster and Deflect-o-Bot both carried Divine Shield and sat in adjacent slots (positions 4 and 5). A single cleave attack strips both shields at once instead of the opponent needing two separate hits to deal with them.",
      suggestion: "Spread Divine Shield minions apart with a disposable minion between them so a cleave can only strip one shield per attack - especially relevant with George's hero power actively creating shields most games.",
    },
    {
      turn: 9,
      timestampSec: 224,
      category: "economy",
      severity: "major",
      title: "Slow to Tavern Tier 3",
      explanation:
        "You first hit Tavern Tier 3 on turn 9 - a solid curve is usually around turn 6, so you were roughly 3 turns behind. Most of that came from turns 5-8, spent rerolling defensively after the turn 5 damage spike instead of pushing tempo back.",
      suggestion:
        "A rough combat doesn't have to cost you the whole curve - once health stabilizes for a turn or two, prioritize catching the Tavern back up before continuing to reroll for value.",
    },
    {
      turn: 12,
      timestampSec: 308,
      category: "economy",
      severity: "minor",
      title: "5 gold left unspent on turn 12",
      explanation: "5 gold went unused at the end of turn 12 with no upgrade the turn after - a full reroll-and-a-half worth of tempo that turn.",
      suggestion: "At Tier 5 with a near-final board, that gold is usually better spent hunting for your last upgrade piece via rerolls than left on the table.",
    },
    {
      turn: 17,
      timestampSec: 448,
      category: "combat-decision",
      severity: "moderate",
      title: "Final combat, turn 17 - worth a rewatch",
      explanation:
        "The run ended here, dropping from 13 to 0 in a single combat despite a board that looks strong on paper (two golden minions, a 11/12 taunt). That kind of result is usually either a positioning issue going into the fight or a comp matchup (poison, a bigger taunt wall, or a faster attack-speed board) that was visible on the opponent's board in earlier turns.",
      suggestion: "Rewind to this timestamp and check both your positioning and what the opponent's board looked like one or two turns before this fight - the matchup was often decidable in advance.",
    },
  ];
}

function buildStrengths(): Strength[] {
  return [
    {
      turn: 9,
      timestampSec: 224,
      title: "Well-timed triple into Golden Tabbycat",
      explanation: "Tripling Tabbycat into a 4/4 Golden Tabbycat on turn 9 was a genuine value swing right as the board needed a stats boost - good use of the gold banked into that reroll.",
    },
    {
      turn: 11,
      timestampSec: 280,
      title: "Decisive Beast pivot execution",
      explanation: "Once the commitment to Beasts started on turn 10, the follow-through was clean - Ironhide Direhorn, Rat Pack, and Pack Leader came down in the right order to start compounding stats immediately instead of sitting as dead cards.",
    },
  ];
}

export function getSampleReport(id: string): Report {
  const turns = buildTurns();
  const mistakesWithId: Mistake[] = buildMistakes().map((m, i) => ({ ...m, id: `sample-mistake-${i + 1}` }));

  return {
    id,
    videoId: id,
    createdAt: new Date().toISOString(),
    hero: "George the Fallen",
    finalPlacement: 3,
    durationTurns: turns[turns.length - 1].turn,
    overallScore: 76,
    grade: "C+",
    summary:
      "Playing George the Fallen, this run recovered from a rough early game into a genuinely strong Beast board, finishing 3rd. The turn 5 damage spike and the slow tavern curve that followed cost the most equity - the eventual Beast commitment and the Golden Tabbycat triple were the two biggest bright spots. Tightening up early-game stat priority and Divine Shield positioning are the highest-leverage fixes for next time.",
    strengths: buildStrengths(),
    mistakes: mistakesWithId,
    turns,
    tribesFocused: ["Beast"],
    compArchetype: "Beast / Divine Shield",
    keyStats: {
      avgGoldUnspent: 1.6,
      heroPowerUsageRate: 0.44,
      turnsAboveHealthThreshold: 4,
      tripleCount: 2,
    },
    isDemo: true,
  };
}
