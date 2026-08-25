import { ApiError, FinishReason, GoogleGenAI, Modality } from "@google/genai";
import { buildPrompts } from "@/lib/promptEngine";
import type { GameId, GeneratedImageResult } from "@/types";

const DEFAULT_MODEL = "gemini-2.5-flash-image";

// The free tier is generous on daily volume but tight on requests-per-minute.
// Three parallel calls risk a 429 on the free tier, so shots are generated
// one at a time with a short gap between them instead.
const CALL_STAGGER_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeMissingImage(reason: FinishReason | undefined): string {
  switch (reason) {
    case FinishReason.SAFETY:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.BLOCKLIST:
    case FinishReason.SPII:
    case FinishReason.RECITATION:
      return "Gemini declined to generate this image (safety filters). Try rephrasing your boss idea.";
    default:
      return "Gemini returned no image for this prompt.";
  }
}

function errorMessageFrom(reason: unknown): string {
  if (reason instanceof ApiError) {
    if (reason.status === 429) {
      // A RESOURCE_EXHAUSTED response quoting a free-tier quota of 0 means
      // the project behind this key has no free image-generation
      // allowance at all — as of late 2025 that requires linking Cloud
      // Billing (still pay-as-you-go, no minimum spend), not a transient
      // per-minute limit that a short wait fixes.
      if (reason.message.includes("free_tier") && reason.message.includes("limit: 0")) {
        return "Gemini rejected this: your API key's project has zero free image-generation quota. Since late 2025 that model needs Cloud Billing linked to the project (pay-as-you-go, no minimum spend) — see https://ai.google.dev/gemini-api/docs/rate-limits, or switch IMAGE_PROVIDER to \"pollinations\" or \"openai\".";
      }
      return "Hit Gemini's rate limit. Wait a minute and try again.";
    }
    return reason.message;
  }
  if (reason instanceof Error) return reason.message;
  return "Image generation failed.";
}

export async function generateWithGemini(gameId: GameId, bossIdea: string): Promise<GeneratedImageResult[]> {
  const prompts = buildPrompts(gameId, bossIdea);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const results: GeneratedImageResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const built = prompts[i]!;
    if (i > 0) await sleep(CALL_STAGGER_MS);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: built.prompt,
        config: {
          responseModalities: [Modality.IMAGE],
          imageConfig: { aspectRatio: "1:1" },
        },
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((part) => part.inlineData?.data);

      if (imagePart?.inlineData?.data) {
        const mimeType = imagePart.inlineData.mimeType || "image/png";
        results.push({
          shotId: built.shotId,
          shotLabel: built.label,
          prompt: built.prompt,
          imageDataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}`,
        });
      } else {
        results.push({
          shotId: built.shotId,
          shotLabel: built.label,
          prompt: built.prompt,
          error: describeMissingImage(candidate?.finishReason),
        });
      }
    } catch (err) {
      results.push({
        shotId: built.shotId,
        shotLabel: built.label,
        prompt: built.prompt,
        error: errorMessageFrom(err),
      });
    }
  }

  return results;
}
