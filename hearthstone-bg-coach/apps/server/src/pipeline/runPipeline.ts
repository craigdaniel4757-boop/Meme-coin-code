import path from "node:path";
import { paths } from "../config";
import { generateReport } from "../coach/reportGenerator";
import { getSampleReport } from "../data/sampleReport";
import { store } from "../db/store";
import { Job } from "../types/schemas";
import { extractFrames } from "./frameExtractor";
import { analyzeFrames } from "./visionAnalyzer";
import { buildTimeline } from "./timelineBuilder";

/**
 * Runs the whole pipeline for one job, updating its status in the store at
 * each stage so GET /api/vods/:id/status can be polled from the UI. Never
 * throws - a failure is recorded on the job itself instead.
 */
export async function runPipeline(job: Job): Promise<void> {
  try {
    if (job.isDemo) {
      await runDemoPipeline(job);
    } else {
      await runLivePipeline(job);
    }
  } catch (err) {
    console.error(`[pipeline] job ${job.id} failed:`, err);
    await store.updateJob(job.id, {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown pipeline error",
    });
  }
}

/**
 * Walks through the same stages (with small delays standing in for real
 * processing time) so the UI's processing timeline behaves identically to a
 * live run, then hands back the bundled sample report instead of a real
 * analysis. This is what runs whenever ANTHROPIC_API_KEY isn't set.
 */
async function runDemoPipeline(job: Job): Promise<void> {
  await store.updateJob(job.id, { status: "extracting_frames" });
  await delay(1100);
  await store.updateJob(job.id, { status: "analyzing_gameplay" });
  await delay(1700);
  await store.updateJob(job.id, { status: "generating_report" });
  await delay(800);

  const report = getSampleReport(job.id);
  await store.saveReport(report);
  await store.updateJob(job.id, { status: "complete", reportId: report.id });
}

async function runLivePipeline(job: Job): Promise<void> {
  const videoPath = path.join(paths.videos, job.videoFilename);

  await store.updateJob(job.id, { status: "extracting_frames" });
  const frames = await extractFrames(job.id, videoPath);
  if (frames.length === 0) {
    throw new Error("No frames could be extracted from this video. Check that the file is a valid, playable recording.");
  }

  await store.updateJob(job.id, { status: "analyzing_gameplay" });
  const readings = await analyzeFrames(frames);
  const { turns, hero, finalPlacement } = buildTimeline(readings);
  if (turns.length === 0) {
    throw new Error(
      "Couldn't identify any Battlegrounds turns in this video. Make sure the recording clearly shows the in-game HUD (tavern tier, gold, board).",
    );
  }

  await store.updateJob(job.id, { status: "generating_report" });
  const report = await generateReport({ videoId: job.id, hero, finalPlacement, turns, isDemo: false });

  await store.saveReport(report);
  await store.updateJob(job.id, { status: "complete", reportId: report.id });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
