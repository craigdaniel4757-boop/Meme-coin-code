import { Activity, Coins, LayoutGrid, type LucideIcon, Shield, Swords, Zap } from "lucide-react";
import { MistakeCategory, Severity } from "@/types/report";

export const SEVERITY_ORDER: Severity[] = ["major", "moderate", "minor"];

/** Badge-component variant per severity (uses this app's own token system - see chart-colors.ts for raw SVG mark colors, a separate validated set for that rendering context. */
export const SEVERITY_BADGE_VARIANT: Record<Severity, "info" | "warning" | "destructive"> = {
  minor: "info",
  moderate: "warning",
  major: "destructive",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

export const CATEGORY_META: Record<MistakeCategory, { label: string; icon: LucideIcon }> = {
  economy: { label: "Economy", icon: Coins },
  tempo: { label: "Tempo", icon: Activity },
  positioning: { label: "Positioning", icon: Shield },
  composition: { label: "Composition", icon: LayoutGrid },
  "hero-power": { label: "Hero Power", icon: Zap },
  "combat-decision": { label: "Combat Decision", icon: Swords },
};
