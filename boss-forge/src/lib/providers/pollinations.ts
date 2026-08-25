import { buildDiffusionPrompts } from "@/lib/promptEngine";
import type { GameId, GeneratedImageResult } from "@/types";

const ENDPOINT = "https://image.pollinations.ai/prompt";
const DEFAULT_MODEL = "flux";
const SIZE = 1024;

// Serverless hosts (Vercel included) kill the whole request around
// maxDuration (60s here). Three calls run concurrently rather than
// sequentially so total wall time is bounded by the slowest single call
// plus the stagger below, not their sum — comfortably under that ceiling.
const REQUEST_TIMEOUT_MS = 25_000;
const CALL_STAGGER_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOneImage(prompt: string): Promise<{ dataUrl?: string; error?: string }> {
  const model = process.env.POLLINATIONS_MODEL || DEFAULT_MODEL;
  // A random seed busts any response caching keyed on the request URL, so
  // repeated prompts (or the near-identical shot prompts) don't come back
  // as the same image.
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url =
    `${ENDPOINT}/${encodeURIComponent(prompt)}` +
    `?width=${SIZE}&height=${SIZE}&model=${encodeURIComponent(model)}&nologo=true&enhance=false&seed=${seed}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.startsWith("image/")) {
      const bodyText = await response.text().catch(() => "");
      return {
        error:
          bodyText.trim().slice(0, 200) ||
          `Pollinations returned an unexpected response (HTTP ${response.status}).`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}` };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        error: "Pollinations timed out generating this image. Its free tier can be slow under load — try again.",
      };
    }
    return { error: err instanceof Error ? err.message : "Image generation failed." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateWithPollinations(gameId: GameId, bossIdea: string): Promise<GeneratedImageResult[]> {
  const prompts = buildDiffusionPrompts(gameId, bossIdea);
  const settled = await Promise.allSettled(
    prompts.map((p, i) => sleep(i * CALL_STAGGER_MS).then(() => fetchOneImage(p.prompt)))
  );

  return settled.map((result, index) => {
    const built = prompts[index]!;
    const outcome = result.status === "fulfilled" ? result.value : { error: "Image generation failed." };
    return {
      shotId: built.shotId,
      shotLabel: built.label,
      prompt: built.prompt,
      ...(outcome.dataUrl ? { imageDataUrl: outcome.dataUrl } : { error: outcome.error ?? "Image generation failed." }),
    };
  });
}
