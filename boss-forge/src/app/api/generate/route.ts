import { NextRequest, NextResponse } from "next/server";
import { isValidGameId } from "@/lib/games";
import { buildPrompts } from "@/lib/promptEngine";
import { getActiveProvider } from "@/lib/providers";
import type { GenerateRequestBody } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IDEA_LENGTH = 600;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;

// Best-effort, single-instance in-memory limiter. Good enough to stop a
// runaway client from burning through image-generation credits; not a
// substitute for real auth/rate limiting behind a public deployment.
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

export async function POST(req: NextRequest) {
  const clientKey =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  if (isRateLimited(clientKey)) {
    return NextResponse.json(
      { error: "Too many requests — wait a minute before generating again." },
      { status: 429 }
    );
  }

  let body: Partial<GenerateRequestBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const gameId = body.gameId;
  const bossIdea = typeof body.bossIdea === "string" ? body.bossIdea.trim() : "";

  if (!gameId || !isValidGameId(gameId)) {
    return NextResponse.json(
      { error: "Pick one of the four supported games first." },
      { status: 400 }
    );
  }
  if (!bossIdea) {
    return NextResponse.json(
      { error: "Describe your boss idea before generating." },
      { status: 400 }
    );
  }
  if (bossIdea.length > MAX_IDEA_LENGTH) {
    return NextResponse.json(
      { error: `Boss idea is too long (${MAX_IDEA_LENGTH} characters max).` },
      { status: 400 }
    );
  }

  const provider = getActiveProvider();
  if (provider.apiKeyEnvVar && !process.env[provider.apiKeyEnvVar]) {
    return NextResponse.json(
      {
        error: `No ${provider.apiKeyEnvVar} is configured on the server (image provider: ${provider.label}). Copy .env.example to .env.local, add your key, and restart the dev server.`,
        code: "MISSING_API_KEY",
      },
      { status: 500 }
    );
  }

  const prompts = buildPrompts(gameId, bossIdea);
  const images = await provider.generate(prompts);

  const anySucceeded = images.some((image) => image.imageDataUrl);
  if (!anySucceeded) {
    return NextResponse.json(
      { error: images[0]?.error ?? "All three image generations failed.", images },
      { status: 502 }
    );
  }

  return NextResponse.json({ gameId, bossIdea, images });
}
