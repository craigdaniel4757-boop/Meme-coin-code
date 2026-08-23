import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config";
import {
  FrameBatchResultSchema,
  type FrameBatchResult,
  CoachNarrativeSchema,
  type CoachNarrative,
} from "../types/schemas";

export const MODEL = config.anthropicModel;

let cachedClient: Anthropic | null = null;

/**
 * Only constructs a client when explicitly enabled via ANTHROPIC_API_KEY.
 * We deliberately don't fall back to the SDK's ambient credential resolution
 * (`ant auth login` profiles, etc.) here - demo mode should be the only
 * thing that runs when an operator hasn't explicitly opted into live calls.
 */
export function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set - cannot make a live Claude call.");
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return cachedClient;
}

export interface FrameInput {
  index: number;
  timestampSec: number;
  base64: string;
  mediaType: "image/jpeg" | "image/png";
}

const VISION_SYSTEM_PROMPT = `You are a Hearthstone Battlegrounds screen-reading specialist. You are shown still frames captured from a screen recording of ONE PLAYER'S Battlegrounds match - the person who recorded and submitted this video. You read whatever HUD information is visible in each frame: turn number, tavern tier, gold available, hero health/armor, the minions on THAT RECORDING PLAYER'S OWN board, the shop's minion offers, and whether the hero power looks usable.

The single most important rule: every field you report - board, heroName, health, gold, tavern tier - describes the recording player and nobody else. During the recruit/shop phase this is unambiguous (only one board is shown). During a COMBAT frame, two boards face off, and only the bottom one is the recording player's - Battlegrounds always renders the local player's board at the bottom of the screen and the current opponent's board at the top, for every combat, with no exceptions. Never read the top board as "board". If you cannot tell with real confidence which board is on the bottom in a given combat frame (bad angle, obstruction, unclear framing), return an empty board array and confidence "low" for that frame rather than guessing - a wrong minion list is worse than a missing one, because it would misattribute an opponent's board to the wrong player.

Rules:
- Only report what's actually legible in that specific frame. If a value isn't visible, or the frame is a transition/loading frame, use null for that field and mark confidence "low" or "medium" rather than guessing.
- Identify each minion by cross-referencing its artwork with its visible attack/health numbers and tribe icon - these narrow down look-alike minions. If you recognize the art but aren't sure of the exact name, give your best specific guess rather than a vague description, but reflect the uncertainty in that frame's overall confidence rather than reporting it as certain.
- Positions in "board" are left-to-right as shown on screen, 0-indexed.
- Read the turn-number HUD element carefully - it drives which turn every other value in this frame gets grouped into. If it's partially obscured or ambiguous between two close numbers, use null rather than guessing; a wrong turn number silently misattributes this frame's data to the wrong turn in the final report.
- "phase" is your read of what kind of frame this is: recruit (shop/buy phase, board and shop both visible), combat (battle animation playing, two boards visible), shop_result (post-combat damage or results screen), other, or unclear.
- Common keywords to watch for: Divine Shield, Taunt, Reborn, Poisonous, Windfury, Magnetic, Stealth, Deathrattle triggers shown as icons.
- "heroName" is the recording player's own hero portrait/nameplate, visible on essentially every frame regardless of phase - never the opponent's hero shown during combat.
- "finalPlacementGuess" must stay null on every frame except a clear end-of-game results screen naming the recording player's own placement (e.g. "You placed 3rd!") - do not guess a placement from anything else, and never report the eliminated opponent's placement.
- Return exactly one reading per frame you were given, in the same order, tagged with the frameIndex you were told for that frame.`;

/**
 * Sends a batch of extracted video frames to Claude vision and gets back
 * structured per-frame game state. Frames are interleaved with short text
 * labels (not just images back-to-back) so the model can reliably attribute
 * each reading to the right frameIndex/timestamp.
 */
export async function analyzeFrameBatch(frames: FrameInput[]): Promise<FrameBatchResult> {
  const client = getClient();

  const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
  for (const frame of frames) {
    content.push({
      type: "text",
      text: `Frame ${frame.index} (captured at ${frame.timestampSec.toFixed(1)}s into the video):`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: frame.mediaType, data: frame.base64 },
    });
  }
  content.push({
    type: "text",
    text: `That was ${frames.length} frame(s). Return one entry in "readings" per frame, in the same order, using the frameIndex given above each image.`,
  });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      // Reading a small board of minions off a screenshot accurately (right
      // player, right names, right turn number) benefits more from careful
      // reasoning than it costs in latency - worth the higher effort here.
      effort: "high",
      format: zodOutputFormat(FrameBatchResultSchema),
    },
    system: VISION_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude vision call did not return parseable structured output.");
  }
  return response.parsed_output;
}

const COACH_SYSTEM_PROMPT = `You are a grandmaster-level Hearthstone Battlegrounds coach reviewing a student's game with them after the fact, in the style of a thoughtful VOD review - direct, specific, and focused on what actually would have changed the outcome.

You'll be given: the hero played, final placement, a turn-by-turn timeline of tavern tier/gold/health/board state, and a list of mistakes already flagged by a deterministic rules engine (each with an id, category, severity, a default title/explanation/suggestion).

Your job:
1. Write "summary": a 2-4 sentence executive summary of the run in a coaching voice - what defined this game, said plainly.
2. Assign "overallScore" (0-100) and a letter "grade", weighing the severity/count of flagged mistakes against the final placement and any strong turns.
3. Name "compArchetype": a short label for the composition actually played (e.g. "Poison/Deathrattle", "Unfocused Beast/Mech", "Big Beast Late Pivot").
4. Identify 1-3 "strengths": real turns where the player made a good decision, each tied to a specific turn number from the timeline. If nothing stands out, keep this list short rather than inventing praise.
5. For "polishedMistakes": rewrite EVERY flagged finding's title/explanation/suggestion in your own coaching voice - sharper and more specific to what's actually in the timeline around that turn - while keeping the same "id" so it can be matched back up. Don't drop any and don't add new ones beyond what was flagged; you're polishing the existing findings, not re-diagnosing the game from scratch.

Be concrete. Reference actual turn numbers, tavern tiers, and gold amounts from the data instead of generic advice.`;

export interface CoachNarrativeContext {
  hero: string;
  finalPlacement: number;
  timelineJson: string;
  findingsJson: string;
  keyStatsJson: string;
}

export async function generateCoachNarrative(ctx: CoachNarrativeContext): Promise<CoachNarrative> {
  const client = getClient();

  const userText = `Hero: ${ctx.hero}
Final placement: ${ctx.finalPlacement} of 8

Turn-by-turn timeline (JSON):
${ctx.timelineJson}

Rules-engine findings to polish (JSON):
${ctx.findingsJson}

Key stats (JSON):
${ctx.keyStatsJson}`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(CoachNarrativeSchema),
    },
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude coaching call did not return parseable structured output.");
  }
  return response.parsed_output;
}
