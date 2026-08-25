# BossForge

Pick a game — Elden Ring, Dark Souls III, Terraria, or Palworld — describe a
new boss idea in a sentence or two, and get back three concept renders built
to match that game's actual visual language: rendering technique, materials,
palette, lighting, and mood, not just "in the style of [game]."

## How it works

1. **Pick a game.** Each of the four supported games carries its own detailed
   style guide in [`src/lib/promptEngine.ts`](src/lib/promptEngine.ts) —
   rendering technique (painterly vs. pixel-sprite vs. PBR 3D), materials,
   color palette, lighting, anatomy conventions, and mood, derived from how
   that game's bestiary actually looks.
2. **Describe a boss.** A sentence or two is enough — a creature, a twist, a
   theme.
3. **Generate.** The server builds three prompts from your idea — a full-body
   action pose, a close-up portrait, and a wide environmental shot — each
   layering the game's style guide, your idea, and the shot framing, then
   sends each one to an image model. Results (and the exact prompt used for
   each) come back to the gallery.

Every generated boss is an original design; prompts explicitly avoid naming
or reproducing existing characters, only the visual grammar of the game.

## Setup

Requires Node.js 18.18+. Image generation is provider-based, selected via
`IMAGE_PROVIDER` in your env file:

- **`gemini`** (default) — Google's `gemini-2.5-flash-image` ("Nano Banana").
  Get a free key at [Google AI Studio](https://aistudio.google.com/apikey) —
  no credit card required. Free tier allows up to 500 images/day; the app
  paces its 3 calls per generation with a short delay between them to stay
  under the free tier's per-minute rate limit.
- **`openai`** — `gpt-image-1`, paid only (no free tier). Get a key at
  [OpenAI's platform](https://platform.openai.com/api-keys).

```bash
cd boss-forge
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (or switch to openai)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without the active provider's API key set, game selection and the form still
work, but generating will return a clear setup message instead of images.

### Optional environment variables

See [`.env.example`](.env.example):

- `IMAGE_PROVIDER` — `gemini` (default) or `openai`.
- `GEMINI_MODEL` — defaults to `gemini-2.5-flash-image`.
- `IMAGE_MODEL` — OpenAI model, defaults to `gpt-image-1`.
- `IMAGE_SIZE` — OpenAI only. One of `1024x1024` (default), `1024x1536`, `1536x1024`, `auto`.
- `IMAGE_QUALITY` — OpenAI only. One of `low`, `medium`, `high` (default), `auto`.
  Higher quality costs more per image and takes longer — three `high` renders
  per generation is the most expensive setting.

## Project structure

```
src/
  app/
    page.tsx              Client-side flow: pick game -> describe boss -> gallery
    api/generate/route.ts POST endpoint: validates input, delegates to the active provider
    globals.css            Per-game theme (colors, fonts) via [data-game] CSS variables
    layout.tsx              Loads one Google Font family per game
  components/               GameSelector, BossForm, ImageGallery, ambient particles, icons
  lib/
    games.ts                 Game metadata: tagline, style tags, example prompts
    promptEngine.ts           The style guides + 3-shot prompt builder
    providers/                One module per image backend (gemini.ts, openai.ts) behind
                               a common generate(prompts) -> GeneratedImageResult[] contract,
                               selected by index.ts via IMAGE_PROVIDER
  types/                      Shared TypeScript types
```

## Notes on cost and abuse protection

Gemini's free tier covers normal personal use, but it's a daily quota, not
unlimited access — heavy or public use can still exhaust it. Switching to
`IMAGE_PROVIDER=openai` charges per image with no free tier at all. Either
way, the API route includes a lightweight in-memory rate limit (5
generations/minute per IP) as a safety net against runaway usage — it's
best-effort and resets on redeploy/restart, so add real auth/rate limiting
before exposing this publicly at scale.

## Fan project disclaimer

This is a fan-made tool for original concept art inspired by each game's
style. It is not affiliated with, endorsed by, or associated with
FromSoftware, Re-Logic, Pocketpair, or Bandai Namco.
