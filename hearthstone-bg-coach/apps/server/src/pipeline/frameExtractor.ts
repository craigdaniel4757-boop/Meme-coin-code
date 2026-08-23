import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config, paths } from "../config";

export interface ExtractedFrame {
  index: number;
  timestampSec: number;
  filePath: string;
}

/**
 * Samples one frame every `FRAME_INTERVAL_SECONDS` from the uploaded video
 * via ffmpeg. Requires the `ffmpeg` binary on PATH - this is a deliberate
 * choice over bundling a prebuilt binary (see README); a missing binary
 * fails the job with a clear, actionable error instead of a cryptic one.
 */
export async function extractFrames(jobId: string, videoPath: string): Promise<ExtractedFrame[]> {
  const outDir = path.join(paths.frames, jobId);
  await fs.mkdir(outDir, { recursive: true });

  const pattern = path.join(outDir, "frame-%05d.jpg");
  const fps = 1 / config.frameIntervalSeconds;

  await runFfmpeg(["-i", videoPath, "-vf", `fps=${fps}`, "-q:v", "3", "-y", pattern]);

  const files = (await fs.readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  return files.map((file, i) => ({
    index: i,
    timestampSec: i * config.frameIntervalSeconds,
    filePath: path.join(outDir, file),
  }));
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "ffmpeg is not installed or not on PATH. Install it (apt install ffmpeg / brew install ffmpeg) to enable video analysis - see the README.",
          ),
        );
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
