import { z } from "zod";

/**
 * Canonical schemas for the whole pipeline. Zod is the source of truth here:
 * the same schemas both validate data at runtime and get passed straight to
 * Claude as structured-output targets (see lib/anthropic.ts callers), so the
 * shape the model returns and the shape the app renders can't drift apart.
 *
 * apps/web/src/types/report.ts mirrors the reader-facing subset of this file
 * by hand (the web app is a separate npm package with no shared build step).
 */

export const TribeSchema = z.enum([
  "Beast",
  "Murloc",
  "Demon",
  "Mech",
  "Pirate",
  "Dragon",
  "Naga",
  "Quilboar",
  "Undead",
  "Elemental",
  "All",
  "None",
]);
export type Tribe = z.infer<typeof TribeSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const MinionSnapshotSchema = z.object({
  name: z.string(),
  attack: z.number().int().nullable(),
  health: z.number().int().nullable(),
  tribe: TribeSchema.nullable(),
  keywords: z.array(z.string()),
  position: z.number().int(),
  golden: z.boolean(),
});
export type MinionSnapshot = z.infer<typeof MinionSnapshotSchema>;

export const CombatResultSchema = z.enum(["win", "loss", "tie", "unknown"]);
export type CombatResult = z.infer<typeof CombatResultSchema>;

export const TurnSnapshotSchema = z.object({
  turn: z.number().int(),
  timestampSec: z.number(),
  tavernTier: z.number().int(),
  goldAvailable: z.number().int(),
  goldSpent: z.number().int(),
  health: z.number().int(),
  healthDelta: z.number().int(),
  armor: z.number().int(),
  board: z.array(MinionSnapshotSchema),
  shopOffers: z.array(z.string()),
  heroPowerUsed: z.boolean(),
  rerollCount: z.number().int(),
  combatResult: CombatResultSchema,
  confidence: ConfidenceSchema,
});
export type TurnSnapshot = z.infer<typeof TurnSnapshotSchema>;

export const MistakeCategorySchema = z.enum([
  "economy",
  "tempo",
  "positioning",
  "composition",
  "hero-power",
  "combat-decision",
]);
export type MistakeCategory = z.infer<typeof MistakeCategorySchema>;

export const SeveritySchema = z.enum(["minor", "moderate", "major"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const MistakeSchema = z.object({
  id: z.string(),
  turn: z.number().int(),
  timestampSec: z.number(),
  category: MistakeCategorySchema,
  severity: SeveritySchema,
  title: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
});
export type Mistake = z.infer<typeof MistakeSchema>;

export const StrengthSchema = z.object({
  turn: z.number().int(),
  timestampSec: z.number(),
  title: z.string(),
  explanation: z.string(),
});
export type Strength = z.infer<typeof StrengthSchema>;

export const KeyStatsSchema = z.object({
  avgGoldUnspent: z.number(),
  heroPowerUsageRate: z.number(),
  turnsAboveHealthThreshold: z.number().int(),
  tripleCount: z.number().int(),
});
export type KeyStats = z.infer<typeof KeyStatsSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  createdAt: z.string(),
  hero: z.string(),
  finalPlacement: z.number().int().min(1).max(8),
  durationTurns: z.number().int(),
  overallScore: z.number().int().min(0).max(100),
  grade: z.string(),
  summary: z.string(),
  strengths: z.array(StrengthSchema),
  mistakes: z.array(MistakeSchema),
  turns: z.array(TurnSnapshotSchema),
  tribesFocused: z.array(TribeSchema),
  compArchetype: z.string(),
  keyStats: KeyStatsSchema,
  isDemo: z.boolean().default(false),
});
export type Report = z.infer<typeof ReportSchema>;

// ---------------------------------------------------------------------------
// LLM-facing schemas — passed directly as structured-output targets.
// ---------------------------------------------------------------------------

/** One vision call reads a batch of frames and returns one reading per frame. */
export const FrameReadingSchema = z.object({
  frameIndex: z.number().int().describe("Index of this frame within the batch, matching the order frames were provided in."),
  phase: z.enum(["recruit", "combat", "shop_result", "other", "unclear"]).describe(
    "recruit = shop/buy phase board is visible, combat = battle animation playing, shop_result = post-combat damage/result screen, unclear = HUD not legible.",
  ),
  turnNumber: z.number().int().nullable(),
  tavernTier: z.number().int().nullable(),
  goldAvailable: z.number().int().nullable(),
  heroHealth: z.number().int().nullable(),
  armor: z.number().int().nullable(),
  board: z.array(MinionSnapshotSchema),
  shopMinions: z.array(z.string()),
  heroPowerAvailable: z.boolean().nullable().describe("Whether the hero power button appears usable (not greyed out) in this frame."),
  heroName: z.string().nullable().describe("The player's hero name, if legible from the portrait/nameplate (usually visible most frames)."),
  finalPlacementGuess: z
    .number()
    .int()
    .min(1)
    .max(8)
    .nullable()
    .describe("Only set on an end-of-game results screen (e.g. 'You placed 3rd!'). Null on every other frame."),
  confidence: ConfidenceSchema,
});
export type FrameReading = z.infer<typeof FrameReadingSchema>;

export const FrameBatchResultSchema = z.object({
  readings: z.array(FrameReadingSchema),
});
export type FrameBatchResult = z.infer<typeof FrameBatchResultSchema>;

/** The narrative/grading pass: heuristic findings in, polished coaching prose out. */
export const PolishedMistakeSchema = z.object({
  id: z.string().describe("Must exactly match the id of the heuristic finding it corresponds to."),
  title: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
});
export type PolishedMistake = z.infer<typeof PolishedMistakeSchema>;

export const CoachNarrativeSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  grade: z.string().describe("Letter grade like A, B+, C-, etc."),
  summary: z.string().describe("2-4 sentence executive summary of the run in a coaching voice."),
  compArchetype: z.string().describe("Short label for the composition played, e.g. 'Poison/Deathrattle' or 'Unfocused Beast/Mech'."),
  strengths: z.array(StrengthSchema),
  polishedMistakes: z.array(PolishedMistakeSchema),
});
export type CoachNarrative = z.infer<typeof CoachNarrativeSchema>;

// ---------------------------------------------------------------------------
// Job/pipeline state
// ---------------------------------------------------------------------------

export const JobStageSchema = z.enum([
  "uploaded",
  "extracting_frames",
  "analyzing_gameplay",
  "generating_report",
  "complete",
  "failed",
]);
export type JobStage = z.infer<typeof JobStageSchema>;

export const JobSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: JobStageSchema,
  originalFilename: z.string(),
  videoFilename: z.string(),
  error: z.string().nullable(),
  reportId: z.string().nullable(),
  isDemo: z.boolean(),
});
export type Job = z.infer<typeof JobSchema>;
