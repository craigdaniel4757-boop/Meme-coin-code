/**
 * Mirrors apps/server/src/types/schemas.ts (the canonical, Zod-validated
 * source). Kept in sync by hand - the web app is a separate npm package
 * with no shared build step against the server.
 */

export type Tribe =
  | "Beast"
  | "Murloc"
  | "Demon"
  | "Mech"
  | "Pirate"
  | "Dragon"
  | "Naga"
  | "Quilboar"
  | "Undead"
  | "Elemental"
  | "All"
  | "None";

export type Confidence = "high" | "medium" | "low";

export interface MinionSnapshot {
  name: string;
  attack: number | null;
  health: number | null;
  tribe: Tribe | null;
  keywords: string[];
  position: number;
  golden: boolean;
}

export type CombatResult = "win" | "loss" | "tie" | "unknown";

export interface TurnSnapshot {
  turn: number;
  timestampSec: number;
  tavernTier: number;
  goldAvailable: number;
  goldSpent: number;
  health: number;
  healthDelta: number;
  armor: number;
  board: MinionSnapshot[];
  shopOffers: string[];
  heroPowerUsed: boolean;
  rerollCount: number;
  combatResult: CombatResult;
  confidence: Confidence;
}

export type MistakeCategory =
  | "economy"
  | "tempo"
  | "positioning"
  | "composition"
  | "hero-power"
  | "combat-decision";

export type Severity = "minor" | "moderate" | "major";

export interface Mistake {
  id: string;
  turn: number;
  timestampSec: number;
  category: MistakeCategory;
  severity: Severity;
  title: string;
  explanation: string;
  suggestion: string;
}

export interface Strength {
  turn: number;
  timestampSec: number;
  title: string;
  explanation: string;
}

export interface KeyStats {
  avgGoldUnspent: number;
  heroPowerUsageRate: number;
  turnsAboveHealthThreshold: number;
  tripleCount: number;
}

export interface Report {
  id: string;
  videoId: string;
  createdAt: string;
  hero: string;
  finalPlacement: number;
  durationTurns: number;
  overallScore: number;
  grade: string;
  summary: string;
  strengths: Strength[];
  mistakes: Mistake[];
  turns: TurnSnapshot[];
  tribesFocused: Tribe[];
  compArchetype: string;
  keyStats: KeyStats;
  isDemo: boolean;
}

export type JobStage =
  | "uploaded"
  | "extracting_frames"
  | "analyzing_gameplay"
  | "generating_report"
  | "complete"
  | "failed";

export interface JobStatus {
  jobId: string;
  status: JobStage;
  error: string | null;
  reportId: string | null;
  isDemo: boolean;
}
