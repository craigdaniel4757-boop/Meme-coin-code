# TavernIQ

TavernIQ turns a Hearthstone Battlegrounds screen recording into a full coaching report: a turn-by-turn breakdown of your economy, tempo, positioning, and composition decisions, with concrete fixes for what to do differently next run.

Upload a VOD → TavernIQ extracts frames, reads the board state off the screen with Claude's vision, runs it through a Battlegrounds strategy engine, and hands back a graded report with a video synced to every flagged moment.

## How it works

```
 1. Upload           2. Extract            3. Read the board        4. Coach
 ─────────           ───────────           ──────────────────       ───────────────────
 .mp4 / .mov    →    ffmpeg samples   →    Claude (vision) reads →  Rules engine flags
 / .webm              a frame every         each frame into          economy/tempo/position
                       ~3s + on scene        structured JSON:         mistakes on the turn
                       changes                turn, tavern tier,      timeline, then Claude
                                              gold, board, shop       writes the narrative
                                                                      report + grade
```

The analysis is a **hybrid**, not a single LLM call:

- A deterministic **heuristics engine** (`apps/server/src/coach/heuristics`) encodes real Battlegrounds benchmarks — tavern-tier timing curves, gold-banking thresholds, positioning-vs-cleave rules, hero power usage, comp focus — and always produces a complete, consistent report on its own, even if the LLM call fails.
- **Claude** (`claude-opus-5`, vision + text) reads the raw video frames into structured game state, and separately turns the heuristic findings + turn timeline into polished, specific coaching prose. This is where the "expert coach voice" and any nuance the fixed rules miss comes from.

If `ANTHROPIC_API_KEY` isn't set, the server runs in **demo mode**: uploads are accepted and go through the same pipeline stages, but the bundled sample analysis is returned instead of a live one. This keeps the whole product demoable (and testable) with zero credentials.

## Stack

| | |
|---|---|
| **Web** (`apps/web`) | React 18 + TypeScript + Vite + Tailwind CSS, Radix primitives (shadcn-style components), Recharts, React Router |
| **Server** (`apps/server`) | Node.js + Express + TypeScript, ffmpeg (via `child_process`) for frame extraction, `@anthropic-ai/sdk` for vision + coaching generation, Zod for schema validation, a JSON-file job store |

Nothing here is a toy stub — the upload, ffmpeg extraction, Claude vision calls, heuristics engine, and report rendering are all real, working code. The two things that need infrastructure beyond this repo to run "for real" in production are noted below.

## Getting started

### Prerequisites

- Node.js 20+
- [ffmpeg](https://ffmpeg.org/download.html) on your `PATH` (`apt install ffmpeg` / `brew install ffmpeg`) — required for frame extraction. The server still runs without it in demo mode, but real video processing needs it.
- An Anthropic API key, if you want live analysis instead of demo mode.

### Install

```bash
npm run install:all
```

### Configure

```bash
cp apps/server/.env.example apps/server/.env
# edit apps/server/.env and set ANTHROPIC_API_KEY to enable live analysis
cp apps/web/.env.example apps/web/.env
```

### Run

```bash
npm run dev
```

This starts the API on `http://localhost:8787` and the web app on `http://localhost:5173`. Visit the web app, upload a `.mp4`/`.mov`/`.webm` recording of a Battlegrounds game, and watch the processing stages run.

No video handy? Click **"See a sample report"** on the landing page — it's the same report UI, pre-populated with a full 17-turn analyzed game.

## Deploying

There's a `Dockerfile` at the project root that builds and serves the whole
app (frontend + API) as one container on one port — it works unmodified on
Render, Railway, Fly.io, or any other Docker-capable host. Step-by-step
instructions (Render first, with notes for the others): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Project layout

```
apps/
  web/                    React frontend
    src/
      components/ui/      Button, Card, Badge, Progress, Tabs, Dialog (Radix-based)
      components/landing/ Hero, HowItWorks, FeatureGrid, FAQ, sample report teaser
      components/upload/  Dropzone, processing timeline
      components/report/  Report header, stat tiles, tempo chart, mistake list,
                           turn-by-turn timeline, video player (synced to timestamps)
      pages/               Landing, Upload, Processing, Report
      data/sampleReport.ts Full mock report powering demo mode + "sample report"
  server/                  Express API
    src/
      pipeline/            frameExtractor (ffmpeg) -> visionAnalyzer (Claude) ->
                           timelineBuilder -> runPipeline (orchestration + demo mode)
      coach/                knowledgeBase (BG benchmarks/tribes) + heuristics/*
                           (economy, tempo, positioning, composition, hero power) +
                           reportGenerator (heuristics + Claude narrative pass)
      routes/               /api/vods upload + status + report endpoints
      db/store.ts           JSON-file backed job/report persistence
docs/
  ARCHITECTURE.md           Deeper dive into the pipeline and report schema
```

## Environment variables

See `apps/server/.env.example` for the full list. The important ones:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables live vision analysis + coaching generation. Unset = demo mode. |
| `ANTHROPIC_MODEL` | Defaults to `claude-opus-5`. |
| `FRAME_INTERVAL_SECONDS` | How often ffmpeg samples a frame (default `3`). |
| `PORT` | API port (default `8787`). |

## What's not included (by design)

This is a from-scratch product scaffold, not a hosted SaaS. A few things are intentionally left as documented extension points rather than built out, so the core coaching pipeline stays the focus:

- **Storage**: uploaded videos/frames/reports live on local disk (`apps/server/storage/`) and job metadata in a flat JSON file. Swapping in S3/GCS + Postgres is a matter of replacing `db/store.ts` and the file paths in `pipeline/frameExtractor.ts` — the rest of the pipeline doesn't care where bytes live.
- **Job queue**: the pipeline runs in-process as a fire-and-forget async function. A real deployment would move this to a queue (BullMQ/SQS) so uploads don't block on server restarts.
- **Auth/accounts**: there's no login; every report is reachable by its job ID. Fine for a personal tool or a demo, not for a multi-user product.

## Coaching heuristics covered

Economy (tavern upgrade timing vs. curve, gold banking, reroll efficiency), tempo (early health loss vs. board development), hero power usage, positioning (Divine Shield clumping vs. cleave, taunt/deathrattle placement), and composition focus (tribe commitment, missed triples). See `docs/ARCHITECTURE.md` for the full rule list and the reasoning behind each benchmark.
