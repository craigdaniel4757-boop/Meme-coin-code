import { Mistake, TurnSnapshot } from "../../types/schemas";
import { EARLY_HEALTH_WARNING_FLOOR, EARLY_HEALTH_WARNING_TURN } from "../knowledgeBase";
import { mkMistake } from "./shared";

/** Losing a big chunk of health in the first several turns, before the board can carry it. */
export function checkEarlyHealthLoss(turns: TurnSnapshot[]): Mistake[] {
  const findings: Mistake[] = [];
  const earlyTurns = turns.filter((t) => t.turn <= EARLY_HEALTH_WARNING_TURN);

  for (const turn of earlyTurns) {
    if (turn.healthDelta <= -10) {
      findings.push(
        mkMistake({
          turn,
          category: "tempo",
          severity: turn.healthDelta <= -16 ? "major" : "moderate",
          title: `Heavy early damage on turn ${turn.turn}`,
          explanation: `You took ${Math.abs(turn.healthDelta)} damage on turn ${turn.turn}, still within the opening turns where boards are small and one bad matchup can swing a big chunk of your health total.`,
          suggestion: `Early losses are sometimes just a bad roll of the matchmaking dice, but check whether your board that turn was under-statted for the turn number - prioritizing raw stats over value/synergy in the first few turns keeps these hits smaller.`,
        }),
      );
    }
  }

  const lastEarly = earlyTurns[earlyTurns.length - 1];
  if (lastEarly && lastEarly.health < EARLY_HEALTH_WARNING_FLOOR) {
    findings.push(
      mkMistake({
        turn: lastEarly,
        category: "tempo",
        severity: "moderate",
        title: `Below ${EARLY_HEALTH_WARNING_FLOOR} health by turn ${EARLY_HEALTH_WARNING_TURN}`,
        explanation: `By turn ${lastEarly.turn} you were down to ${lastEarly.health} health. Dropping this low this early puts you in range of a single unlucky combat ending your run before your comp comes online.`,
        suggestion: `When health is already low in the early game, lean toward the safer of two options in the shop (stats/taunt over a greedy value pick) until you've stabilized.`,
      }),
    );
  }

  return findings;
}

/** Board is noticeably thin for how far into the game it is. */
export function checkBoardDevelopment(turns: TurnSnapshot[]): Mistake[] {
  for (const turn of turns) {
    if (turn.turn >= 8 && turn.board.length <= 3) {
      return [
        mkMistake({
          turn,
          category: "tempo",
          severity: "moderate",
          title: `Thin board on turn ${turn.turn}`,
          explanation: `Only ${turn.board.length} minion${turn.board.length === 1 ? "" : "s"} on board by turn ${turn.turn}. That's light for this stage of the game and usually means combats are decided by a couple of minions instead of your full board.`,
          suggestion: `Unless you're deliberately playing a small, high-value board (a late-game deathrattle/reborn shell), fill remaining slots with reasonable stats rather than leaving them empty while banking gold.`,
        }),
      ];
    }
  }
  return [];
}

/** A single turn that swung health hard - worth reviewing regardless of fault. */
export function checkSwingTurns(turns: TurnSnapshot[]): Mistake[] {
  const findings: Mistake[] = [];
  for (const turn of turns) {
    if (turn.turn > EARLY_HEALTH_WARNING_TURN && turn.healthDelta <= -15) {
      findings.push(
        mkMistake({
          turn,
          category: "combat-decision",
          severity: turn.healthDelta <= -22 ? "major" : "moderate",
          title: `Key swing turn: -${Math.abs(turn.healthDelta)} on turn ${turn.turn}`,
          explanation: `This was your biggest single hit of the mid-to-late game. Worth rewatching this combat specifically - it's often either a positioning issue (your important minions clumped or exposed) or a comp mismatch you could have scouted from the opponent's board on a previous turn.`,
          suggestion: `Rewind to this timestamp and check your board positioning going into the fight, and whether the opponent's board on earlier turns telegraphed what was coming.`,
        }),
      );
    }
  }
  return findings;
}
