import { Mistake, MinionSnapshot, TurnSnapshot } from "../../types/schemas";
import { CLEAVE_RISK_KEYWORD, HIGH_VALUE_STAT_THRESHOLD } from "../knowledgeBase";
import { mkMistake } from "./shared";

function isAdjacent(a: MinionSnapshot, b: MinionSnapshot): boolean {
  return Math.abs(a.position - b.position) === 1;
}

function stats(m: MinionSnapshot): number {
  return (m.attack ?? 0) + (m.health ?? 0);
}

/**
 * Divine Shield minions sitting next to each other die to a single cleave
 * hit instead of trading shields one-for-one across separate attacks - one
 * of the most consistently-cited positioning fundamentals in Battlegrounds.
 */
export function checkDivineShieldClumping(turns: TurnSnapshot[]): Mistake[] {
  const findings: Mistake[] = [];
  for (const turn of turns) {
    const shielded = turn.board.filter((m) => m.keywords.includes(CLEAVE_RISK_KEYWORD));
    for (let i = 0; i < shielded.length; i++) {
      for (let j = i + 1; j < shielded.length; j++) {
        if (isAdjacent(shielded[i], shielded[j])) {
          findings.push(
            mkMistake({
              turn,
              category: "positioning",
              severity: "moderate",
              title: `Divine Shields grouped together (turn ${turn.turn})`,
              explanation: `${shielded[i].name} and ${shielded[j].name} were positioned next to each other, both with Divine Shield. A single cleave attack pops both shields at once instead of the opponent needing two separate hits.`,
              suggestion: `Spread Divine Shield minions apart with a disposable minion between them so a cleave can only strip one shield per attack.`,
            }),
          );
          break; // one flag per shielded minion is enough signal for this turn
        }
      }
    }
  }
  return findings;
}

/**
 * More general version of the same principle: your highest-value minions
 * (by raw stats) sitting adjacent means one cleave or whirlwind-style attack
 * threatens both instead of just one.
 */
export function checkHighValueClumping(turns: TurnSnapshot[]): Mistake[] {
  const findings: Mistake[] = [];
  for (const turn of turns) {
    if (turn.board.length < 4) continue;
    const highValue = turn.board.filter((m) => stats(m) >= HIGH_VALUE_STAT_THRESHOLD);
    for (let i = 0; i < highValue.length; i++) {
      for (let j = i + 1; j < highValue.length; j++) {
        if (isAdjacent(highValue[i], highValue[j])) {
          findings.push(
            mkMistake({
              turn,
              category: "positioning",
              severity: "minor",
              title: `Your two biggest minions were adjacent (turn ${turn.turn})`,
              explanation: `${highValue[i].name} and ${highValue[j].name} - your highest-stat minions this turn - were next to each other. That's the pair a cleave opener punishes hardest.`,
              suggestion: `When you have a board with a couple of standout minions, put a cheaper filler minion between them so splash damage can't hit both.`,
            }),
          );
          break;
        }
      }
    }
  }
  return findings;
}
