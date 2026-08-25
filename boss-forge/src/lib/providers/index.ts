import type { BuiltPrompt, GeneratedImageResult } from "@/types";
import { generateWithGemini } from "./gemini";
import { generateWithOpenAI } from "./openai";

export type ImageProviderId = "gemini" | "openai";

export interface ImageProvider {
  id: ImageProviderId;
  label: string;
  apiKeyEnvVar: string;
  generate: (prompts: BuiltPrompt[]) => Promise<GeneratedImageResult[]>;
}

const PROVIDERS: Record<ImageProviderId, ImageProvider> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    apiKeyEnvVar: "GEMINI_API_KEY",
    generate: generateWithGemini,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKeyEnvVar: "OPENAI_API_KEY",
    generate: generateWithOpenAI,
  },
};

/** Defaults to Gemini: it has a genuinely free tier, unlike gpt-image-1. */
export function getActiveProvider(): ImageProvider {
  const requested = (process.env.IMAGE_PROVIDER || "gemini").trim().toLowerCase();
  return PROVIDERS[requested as ImageProviderId] ?? PROVIDERS.gemini;
}
