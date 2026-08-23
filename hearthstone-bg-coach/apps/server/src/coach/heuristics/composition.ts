import { Mistake, TurnSnapshot } from "../../types/schemas";
import { dominantTribes } from "../knowledgeBase";
import { mkMistake } from "./shared";

/**
 * By the late-lobby stage, a board with no tribe holding a plurality usually
 * means no synergy package is coming online - just stats fighting synergy.
 */
export function checkCompFocus(turns: TurnSnapshot[]): Mistake[] {
  const lateTurns = turns.filter((t) => t.turn >= 9 && t.board.length >= 4);
  if (lateTurns.length === 0) return [];

  const checkpoint = lateTurns[Math.floor(lateTurns.length / 2)];
  const dominant = dominantTribes(checkpoint, 2);

  if (dominant.length === 0) {
    return [
      mkMistake({
        turn: checkpoint,
        category: "composition",
        severity: "moderate",
        title: `No clear comp identity by turn ${checkpoint.turn}`,
        explanation: `On turn ${checkpoint.turn}, no single tribe made up more than one minion on your board. This late, a board of unrelated stats is usually behind a board that's leaning on even one active synergy package.`,
        suggestion: `By the turn 8-9 mark, commit to whichever tribe is most open in your lobby (least contested in other players' boards) rather than continuing to take the best individual stats regardless of type.`,
      }),
    ];
  }
  return [];
}
