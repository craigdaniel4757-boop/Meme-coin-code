import type { GameId, GeneratedImageResult } from "@/types";
import { generateWithGemini } from "./gemini";
import { generateWithOpenAI } from "./openai";
import { generateWithPollinations } from "./pollinations";

export type ImageProviderId = "pollinations" | "gemini" | "openai";

export interface ImageProvider {
  id: ImageProviderId;
  label: string;
  /** Env var holding the API key. Omit for providers that need no key. */
  apiKeyEnvVar?: string;
  /** Each provider builds its own prompts — diffusion and LLM-native image
   *  models need very different prompt shapes (see promptEngine.ts). */
  generate: (gameId: GameId, bossIdea: string) => Promise<GeneratedImageResult[]>;
}

const PROVIDERS: Record<ImageProviderId, ImageProvider> = {
  pollinations: {
    id: "pollinations",
    label: "Pollinations.ai",
    generate: generateWithPollinations,
  },
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

/**
 * Defaults to Pollinations: it's the only option that needs no API key and
 * no billing account at all. Gemini's free tier requires Cloud Billing to
 * be linked as of late 2025 (still pay-as-you-go, no minimum spend), and
 * gpt-image-1 has never had a free tier.
 */
export function getActiveProvider(): ImageProvider {
  const requested = (process.env.IMAGE_PROVIDER || "pollinations").trim().toLowerCase();
  return PROVIDERS[requested as ImageProviderId] ?? PROVIDERS.pollinations;
}
