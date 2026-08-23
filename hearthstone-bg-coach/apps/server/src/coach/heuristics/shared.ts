import { randomUUID } from "node:crypto";
import { Mistake, MistakeCategory, Severity, Strength, TurnSnapshot } from "../../types/schemas";

export function mkMistake(params: {
  turn: TurnSnapshot;
  category: MistakeCategory;
  severity: Severity;
  title: string;
  explanation: string;
  suggestion: string;
}): Mistake {
  return {
    id: randomUUID(),
    turn: params.turn.turn,
    timestampSec: params.turn.timestampSec,
    category: params.category,
    severity: params.severity,
    title: params.title,
    explanation: params.explanation,
    suggestion: params.suggestion,
  };
}

export function mkStrength(params: { turn: TurnSnapshot; title: string; explanation: string }): Strength {
  return {
    turn: params.turn.turn,
    timestampSec: params.turn.timestampSec,
    title: params.title,
    explanation: params.explanation,
  };
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
