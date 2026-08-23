import { Severity } from "@/types/report";

/**
 * Raw hex values for chart marks (SVG on the dark chart surface), kept
 * separate from the app's CSS-variable UI tokens (buttons/badges/borders).
 * This app's own `--warning`/`--destructive` tokens failed the dataviz
 * skill's dark-mode categorical lightness-band check when tested as chart
 * marks (they're tuned for text-on-15%-fill badge contrast, a different
 * rendering context) - these are the skill's validated status-palette steps
 * for the dark chart surface instead. See `dataviz` skill, references/palette.md.
 */
export const CHART_SURFACE = "#11141d";
export const CHART_HEALTH_LINE = "#3987e5"; // categorical slot 1 (blue)
export const CHART_STRENGTH = "#0ca30c"; // status: good

export const CHART_SEVERITY_COLOR: Record<Severity, string> = {
  minor: "#fab219", // status: warning
  moderate: "#ec835a", // status: serious
  major: "#d03b3b", // status: critical
};
