import type { BuiltPrompt, GeneratedImageResult } from "@/types";

const ENDPOINT = "https://image.pollinations.ai/prompt";
const DEFAULT_MODEL = "flux";
const SIZE = 1024;
const REQUEST_TIMEOUT_MS = 60_000;

// Pollinations has no published, stable per-minute limit for anonymous
// requests — historically informal and tight. Shots are generated
// sequentially with a conservative gap rather than in parallel.
const CALL_STAGGER_MS = 4000;

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

export async function generateWithPollinations(prompts: BuiltPrompt[]): Promise<GeneratedImageResult[]> {
  const results: GeneratedImageResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const built = prompts[i]!;
    if (i > 0) await sleep(CALL_STAGGER_MS);

    const { dataUrl, error } = await fetchOneImage(built.prompt);
    results.push({
      shotId: built.shotId,
      shotLabel: built.label,
      prompt: built.prompt,
      ...(dataUrl ? { imageDataUrl: dataUrl } : { error: error ?? "Image generation failed." }),
    });
  }

  return results;
}
