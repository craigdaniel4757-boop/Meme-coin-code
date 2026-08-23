import { Mistake, TurnSnapshot } from "../../types/schemas";
import { mkMistake } from "./shared";

const MIN_USAGE_RATE = 0.5;

/**
 * Flags a low hero-power usage rate as a single finding (rather than one per
 * skipped turn) so it doesn't flood the mistake list. Most Battlegrounds
 * hero powers are worth using whenever affordable; a handful are situational
 * (need board space, a specific setup, or are worth saving) so this is
 * phrased as a rate worth reviewing rather than an absolute rule.
 */
export function checkHeroPowerUsage(turns: TurnSnapshot[]): Mistake[] {
  const eligible = turns.filter((t) => t.turn >= 2);
  if (eligible.length === 0) return [];

  const used = eligible.filter((t) => t.heroPowerUsed).length;
  const rate = used / eligible.length;
  if (rate >= MIN_USAGE_RATE) return [];

  const firstSkipped = eligible.find((t) => !t.heroPowerUsed) ?? eligible[0];

  return [
    mkMistake({
      turn: firstSkipped,
      category: "hero-power",
      severity: rate < 0.25 ? "major" : "moderate",
      title: `Hero power used on only ${Math.round(rate * 100)}% of turns`,
      explanation: `You used your hero power on ${used} of ${eligible.length} eligible turns. Most Battlegrounds hero powers are worth activating every turn you can afford them - if yours is one of the situational ones (needs a full board, a specific minion type, or is worth banking for a big turn), some of these skips may be correct, but this rate is low enough to be worth a second look.`,
      suggestion: `Get in the habit of checking the hero power button before ending every turn once you've made your shop decisions and still have the gold for it.`,
    }),
  ];
}
