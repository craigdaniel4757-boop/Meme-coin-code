import OpenAI from "openai";
import type { BuiltPrompt, GeneratedImageResult } from "@/types";

function errorMessageFrom(reason: unknown): string {
  if (reason && typeof reason === "object") {
    const withError = reason as { error?: { message?: string }; message?: string };
    if (withError.error?.message) return withError.error.message;
    if (withError.message) return withError.message;
  }
  return "Image generation failed.";
}

export async function generateWithOpenAI(prompts: BuiltPrompt[]): Promise<GeneratedImageResult[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const size = process.env.IMAGE_SIZE || "1024x1024";
  const quality = process.env.IMAGE_QUALITY || "high";

  const settled = await Promise.allSettled(
    prompts.map((p) =>
      openai.images.generate({
        model,
        prompt: p.prompt,
        size: size as any,
        quality: quality as any,
        n: 1,
      })
    )
  );

  return settled.map((result, index) => {
    const built = prompts[index]!;
    if (result.status === "fulfilled") {
      const b64 = result.value.data?.[0]?.b64_json;
      if (b64) {
        return {
          shotId: built.shotId,
          shotLabel: built.label,
          prompt: built.prompt,
          imageDataUrl: `data:image/png;base64,${b64}`,
        };
      }
      return {
        shotId: built.shotId,
        shotLabel: built.label,
        prompt: built.prompt,
        error: "The model returned no image data.",
      };
    }
    return {
      shotId: built.shotId,
      shotLabel: built.label,
      prompt: built.prompt,
      error: errorMessageFrom(result.reason),
    };
  });
}
