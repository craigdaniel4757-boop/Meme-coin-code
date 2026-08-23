import path from "path";
import dotenv from "dotenv";

dotenv.config();

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
const demoModeForced = bool(process.env.DEMO_MODE, false);

export const config = {
  port: int(process.env.PORT, 8787),
  storageDir: path.resolve(process.env.STORAGE_DIR || "./storage"),
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 500) * 1024 * 1024,

  anthropicApiKey,
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5",
  demoMode: demoModeForced || !anthropicApiKey,

  frameIntervalSeconds: int(process.env.FRAME_INTERVAL_SECONDS, 3),
  frameBatchSize: int(process.env.FRAME_BATCH_SIZE, 6),
} as const;

export const paths = {
  videos: path.join(config.storageDir, "videos"),
  frames: path.join(config.storageDir, "frames"),
  jobsFile: path.join(config.storageDir, "jobs.json"),
  reportsDir: path.join(config.storageDir, "reports"),
};
