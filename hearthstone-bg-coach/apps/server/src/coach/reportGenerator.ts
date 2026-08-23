import { randomUUID } from "node:crypto";
import { config } from "../config";
import { generateCoachNarrative } from "../lib/anthropic";
import { Mistake, Report, ReportSchema, Strength, TurnSnapshot } from "../types/schemas";
import { runHeuristics } from "./heuristics";
import { dominantTribes, gradeFromScore, inferArchetypeLabel } from "./knowledgeBase";

export interface GenerateReportInput {
  videoId: string;
  hero: string;
  finalPlacement: number;
  turns: TurnSnapshot[];
  isDemo?: boolean;
}

/**
 * Builds the full coaching report. The heuristics engine always runs first
 * and produces a complete, valid report on its own; the Claude narrative
 * pass (skipped in demo mode, or if it errors) only replaces the prose,
 * score, and grade with a more nuanced pass - it never gets to invent or
 * drop findings the rules engine didn't produce.
 */
export async function generateReport(input: GenerateReportInput): Promise<Report> {
  const { turns, hero, finalPlacement, videoId } = input;
  const { mistakes, strengths, keyStats } = runHeuristics(turns);

  let finalMistakes: Mistake[] = mistakes;
  let finalStrengths: Strength[] = strengths;
  let overallScore = fallbackScore(mistakes, finalPlacement);
  let grade = gradeFromScore(overallScore);
  let summary = fallbackSummary(mistakes, strengths, finalPlacement, hero);
  let compArchetype = inferArchetypeLabel(turns);

  if (!config.demoMode && turns.length > 0) {
    try {
      const narrative = await generateCoachNarrative({
        hero,
        finalPlacement,
        timelineJson: JSON.stringify(condenseTimeline(turns)),
        findingsJson: JSON.stringify(
          mistakes.map(({ id, turn, category, severity, title, explanation, suggestion }) => ({
            id,
            turn,
            category,
            severity,
            title,
            explanation,
            suggestion,
          })),
        ),
        keyStatsJson: JSON.stringify(keyStats),
      });

      const polishedById = new Map(narrative.polishedMistakes.map((p) => [p.id, p]));
      finalMistakes = mistakes.map((m) => {
        const polished = polishedById.get(m.id);
        return polished
          ? { ...m, title: polished.title, explanation: polished.explanation, suggestion: polished.suggestion }
          : m;
      });
      finalStrengths = narrative.strengths.length ? narrative.strengths : strengths;
      overallScore = narrative.overallScore;
      grade = narrative.grade;
      summary = narrative.summary;
      compArchetype = narrative.compArchetype || compArchetype;
    } catch (err) {
      // The heuristic-only report assembled above already stands on its own.
      console.error("[reportGenerator] Claude narrative pass failed, falling back to heuristic-only report:", err);
    }
  }

  const report: Report = {
    id: randomUUID(),
    videoId,
    createdAt: new Date().toISOString(),
    hero,
    finalPlacement,
    durationTurns: turns.length ? turns[turns.length - 1].turn : 0,
    overallScore,
    grade,
    summary,
    strengths: finalStrengths,
    mistakes: finalMistakes,
    turns,
    tribesFocused: turns.length ? dominantTribes(turns[turns.length - 1], 1) : [],
    compArchetype,
    keyStats,
    isDemo: input.isDemo ?? false,
  };

  return ReportSchema.parse(report);
}

function fallbackScore(mistakes: Mistake[], placement: number): number {
  const base = 100 - (placement - 1) * 6;
  const penalty = mistakes.reduce((sum, m) => {
    if (m.severity === "major") return sum + 8;
    if (m.severity === "moderate") return sum + 4;
    return sum + 1.5;
  }, 0);
  return Math.max(0, Math.min(100, Math.round(base - penalty)));
}

function fallbackSummary(mistakes: Mistake[], strengths: Strength[], placement: number, hero: string): string {
  const majorCount = mistakes.filter((m) => m.severity === "major").length;
  const placementText =
    placement <= 2 ? "a strong finish" : placement <= 4 ? "a top-half finish" : "a rough finish";
  const mistakeText =
    mistakes.length === 0
      ? "no significant mistakes were flagged"
      : `${mistakes.length} issue${mistakes.length === 1 ? "" : "s"} flagged across the run${
          majorCount ? `, including ${majorCount} major one${majorCount === 1 ? "" : "s"}` : ""
        }`;
  const strengthText = strengths.length
    ? ` ${strengths.length} strong turn${strengths.length === 1 ? "" : "s"} also stood out.`
    : "";
  return `Playing ${hero}, this run ended in ${placementText} (placed ${placement} of 8). ${mistakeText}.${strengthText}`;
}

/** Trims the timeline to what the narrative pass needs - full keyword lists etc. are heuristics-only input. */
function condenseTimeline(turns: TurnSnapshot[]) {
  return turns.map((t) => ({
    turn: t.turn,
    tavernTier: t.tavernTier,
    gold: t.goldAvailable,
    health: t.health,
    healthDelta: t.healthDelta,
    boardSize: t.board.length,
    boardSummary: t.board.map((m) => m.name).join(", "),
    heroPowerUsed: t.heroPowerUsed,
    combatResult: t.combatResult,
  }));
}
