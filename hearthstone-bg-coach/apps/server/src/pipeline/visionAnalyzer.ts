import fs from "node:fs/promises";
import { config } from "../config";
import { analyzeFrameBatch, FrameInput } from "../lib/anthropic";
import { FrameReading } from "../types/schemas";
import { ExtractedFrame } from "./frameExtractor";

export interface GlobalFrameReading extends FrameReading {
  timestampSec: number;
}

/**
 * Sends extracted frames to Claude vision in fixed-size batches (sequential,
 * not parallel - simpler, rate-limit-friendly, and the SDK already retries
 * 429/5xx with backoff). A production deployment processing many videos
 * concurrently would want a bounded-concurrency queue here instead.
 */
export async function analyzeFrames(frames: ExtractedFrame[]): Promise<GlobalFrameReading[]> {
  const results: GlobalFrameReading[] = [];
  const batchSize = config.frameBatchSize;

  for (let start = 0; start < frames.length; start += batchSize) {
    const batch = frames.slice(start, start + batchSize);
    const inputs: FrameInput[] = await Promise.all(
      batch.map(async (frame, localIndex) => ({
        index: localIndex,
        timestampSec: frame.timestampSec,
        base64: (await fs.readFile(frame.filePath)).toString("base64"),
        mediaType: "image/jpeg" as const,
      })),
    );

    const { readings } = await analyzeFrameBatch(inputs);
    for (const reading of readings) {
      const frame = batch[reading.frameIndex];
      if (!frame) continue; // model returned an index outside this batch - skip rather than fail the whole job
      results.push({ ...reading, timestampSec: frame.timestampSec });
    }
  }

  return results.sort((a, b) => a.timestampSec - b.timestampSec);
}
