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
   calls OpenAI's `gpt-image-1` three times in parallel. Results (and the
   exact prompt used for each) come back to the gallery.

Every generated boss is an original design; prompts explicitly avoid naming
or reproducing existing characters, only the visual grammar of the game.

## Setup

Requires Node.js 18.18+ and an [OpenAI API key](https://platform.openai.com/api-keys)
with access to image generation.

```bash
cd boss-forge
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `OPENAI_API_KEY` set, game selection and the form still work, but
generating will return a clear setup message instead of images.

### Optional environment variables

See [`.env.example`](.env.example):

- `IMAGE_MODEL` — defaults to `gpt-image-1`.
- `IMAGE_SIZE` — one of `1024x1024` (default), `1024x1536`, `1536x1024`, `auto`.
- `IMAGE_QUALITY` — one of `low`, `medium`, `high` (default), `auto`. Higher
  quality costs more per image and takes longer — three `high` renders per
  generation is the most expensive setting.

## Project structure

```
src/
  app/
    page.tsx              Client-side flow: pick game -> describe boss -> gallery
    api/generate/route.ts POST endpoint: builds prompts, calls OpenAI, returns 3 results
    globals.css            Per-game theme (colors, fonts) via [data-game] CSS variables
    layout.tsx              Loads one Google Font family per game
  components/               GameSelector, BossForm, ImageGallery, ambient particles, icons
  lib/
    games.ts                 Game metadata: tagline, style tags, example prompts
    promptEngine.ts           The style guides + 3-shot prompt builder
  types/                      Shared TypeScript types
```

## Notes on cost and abuse protection

`gpt-image-1` charges per image; each generation makes three calls. The API
route includes a lightweight in-memory rate limit (5 generations/minute per
IP) as a safety net against runaway costs — it's best-effort and resets on
redeploy/restart, so add real auth/rate limiting before exposing this
publicly at scale.

## Fan project disclaimer

This is a fan-made tool for original concept art inspired by each game's
style. It is not affiliated with, endorsed by, or associated with
FromSoftware, Re-Logic, Pocketpair, or Bandai Namco.
