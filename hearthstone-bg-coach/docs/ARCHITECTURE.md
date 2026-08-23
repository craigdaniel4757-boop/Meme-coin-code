# Architecture

## Pipeline

```
POST /api/vods (multipart video)
        │
        ▼
  job created (status: uploaded) ─── returned to client as { jobId }
        │
        │  client polls GET /api/vods/:id/status every 2s
        ▼
  status: extracting_frames
        │  apps/server/src/pipeline/frameExtractor.ts
        │  ffmpeg samples one frame every FRAME_INTERVAL_SECONDS (default 3s)
        ▼
  status: analyzing_gameplay
        │  apps/server/src/pipeline/visionAnalyzer.ts
        │  frames batched (FRAME_BATCH_SIZE, default 6) and sent to Claude
        │  vision as { text label, image } pairs, forcing structured output
        │  via zodOutputFormat(FrameBatchResultSchema) - one FrameReading
        │  per frame back: turn, tavern tier, gold, health, board, shop, etc.
        │
        │  apps/server/src/pipeline/timelineBuilder.ts
        │  readings grouped by turn number, one representative reading
        │  chosen per turn (prefer "recruit" phase, highest confidence,
        │  latest timestamp), consolidated into TurnSnapshot[]
        ▼
  status: generating_report
        │  apps/server/src/coach/heuristics/*.ts
        │  ~10 deterministic rules run over the TurnSnapshot[] timeline,
        │  producing Mistake[] and Strength[] plus derived KeyStats -
        │  this alone is a complete, valid report
        │
        │  apps/server/src/coach/reportGenerator.ts
        │  (skipped in demo mode / on API failure)
        │  heuristic findings + condensed timeline sent to Claude (text)
        │  as structured output via CoachNarrativeSchema: polishes each
        │  finding's prose, writes the executive summary, assigns
        │  score/grade, names the comp archetype, picks strengths
        ▼
  status: complete → GET /api/vods/:id/report → { report, videoUrl }
```

Demo mode (`ANTHROPIC_API_KEY` unset, or `DEMO_MODE=true`) short-circuits after
upload: it walks through the same status stages on a timer, then returns
`apps/server/src/data/sampleReport.ts` - a fully hand-authored 17-turn game -
instead of running ffmpeg or calling Claude. The same sample report (under a
fixed id) backs `GET /api/reports/sample`, which is what the landing page's
"see a sample report" link hits with no upload at all.

## Why a hybrid engine, not one LLM call

Handing Claude the raw video and asking for "coaching feedback" in one shot
would work, but it's neither reliable nor auditable: an LLM's numeric
judgment ("was turn 9 late?") drifts run to run, and there's no way to tell
a real finding from a plausible-sounding one. Splitting it in two fixes
both:

- **Vision extraction** (Claude) is the right tool for "read what's on
  screen" - OCR-adjacent perception, not judgment. Structured output
  (`zodOutputFormat`) keeps it honest: every field is typed and nullable,
  so the model reports low confidence or `null` instead of guessing.
- **Grading** (the heuristics engine, `apps/server/src/coach`) is
  deterministic and reproducible: the same timeline always produces the
  same findings, benchmarked against real Battlegrounds curves
  (`knowledgeBase.ts`). It has no opinion the code doesn't explicitly encode.
- **Narrative polish** (Claude, text-only) is where the "expert coach voice"
  comes from - rewriting the engine's findings in specific, contextual
  prose, plus the parts that genuinely need broad judgment (an executive
  summary, an overall grade, which turns stand out as strengths).

The consequence: if the Claude narrative call fails or is disabled, the
report degrades to the heuristics engine's own template text - fully
formed, just less polished. See `reportGenerator.ts`.

## Report schema

`apps/server/src/types/schemas.ts` is the single source of truth - Zod
schemas that are simultaneously runtime validators (`ReportSchema.parse(...)`
before anything is persisted or returned) and the structured-output targets
passed straight to Claude (`zodOutputFormat(FrameBatchResultSchema)`,
`zodOutputFormat(CoachNarrativeSchema)`). `apps/web/src/types/report.ts`
mirrors the reader-facing subset by hand, since the web app has no shared
build step with the server.

Key types: `TurnSnapshot` (one turn's tavern tier/gold/health/board/shop),
`Mistake` (category, severity, turn, title/explanation/suggestion),
`Strength`, `KeyStats`, and `Report` (the envelope: hero, placement, grade,
score, summary, and the full `turns`/`mistakes`/`strengths` arrays).

## Heuristics reference

All in `apps/server/src/coach/heuristics/`, each a pure function over
`TurnSnapshot[]`:

| File | Rules |
|---|---|
| `economy.ts` | Tavern tier reached 3+ turns behind benchmark (`checkTavernUpgradeTiming`); tier reached 2+ turns ahead *and* it cost real health (greedy without payoff); the 3 turns with the most gold left unspent and no upgrade following (`checkGoldBanking`); heavy rerolling (3+) while still Tavern Tier ≤2 (`checkRerollEfficiency`) |
| `tempo.ts` | 10+/16+ damage taken in turns 1-6 (`checkEarlyHealthLoss`); health under 25 by turn 6; board ≤3 minions by turn 8+ (`checkBoardDevelopment`); any single-turn 15+/22+ damage swing past turn 6, flagged as worth a rewatch rather than assigned blame (`checkSwingTurns`) |
| `positioning.ts` | Two Divine Shield minions adjacent (`checkDivineShieldClumping` - cleave strips both at once); two high-combined-stat minions adjacent on a board of 4+ (`checkHighValueClumping`) |
| `composition.ts` | By turn 9+, no tribe holds a plurality of the board (`checkCompFocus`) |
| `heroPower.ts` | Hero power used on <50% of eligible turns, as one finding (not one per skipped turn) |
| `strengths.ts` | Health stayed ≥70% of starting through turns 6-10; Tavern Tiers 2-4 all hit within tolerance of benchmark |

Benchmarks live in `knowledgeBase.ts`: tavern-tier-by-turn curve, the
turn-based gold formula (`expectedGoldForTurn`), and the tribe-dominance
helper used for both `compArchetype` and the composition-focus check.

Positioning intentionally stays narrow. Battlegrounds has other real
positioning nuance (Reborn/deathrattle placement, e.g.), but the specific
mechanics are easy to get subtly wrong and state confidently - the two
rules here (Divine Shield and high-value clumping vs. cleave) are the
well-established, high-confidence ones. Broader nuance is left to the
Claude narrative pass, which draws on its own Battlegrounds knowledge when
polishing a finding, rather than being asserted as a hard-coded rule.

`combat-decision` is a valid `MistakeCategory` with no dedicated rule file -
it's populated by `checkSwingTurns` and left open for the narrative pass;
per-fight decisions (freeze/reroll, which minions to hold) aren't reliably
inferable from periodic screenshots without an action log.

## Known approximations (by design, not oversight)

Vision-derived analysis can't be pixel-perfect, and a few fields are
explicitly documented estimates rather than ground truth:

- **`goldSpent`** is derived, not observed: `expectedGoldForTurn(turn) -
  observedLeftoverGold`. Battlegrounds gold doesn't carry over between
  turns (only partial Tavern-upgrade progress does), so this is a sound
  approximation - see the comment in `timelineBuilder.ts`.
- **`heroPowerUsed`** is inferred from whether the hero power button reads
  as unavailable at the turn's representative snapshot, which is usually
  but not always because it was used (insufficient gold reads the same way).
- **`combatResult`** ("win" vs "tie") can't be fully disambiguated from a
  zero health delta alone; ties are rare enough that zero-delta defaults to
  "win".
- **`rerollCount`** is not populated by live analysis at all (left `0`) -
  reliably detecting rerolls needs denser sampling or an action log, not
  periodic screenshots. It's only non-zero in the bundled sample report.
- **`finalPlacement`**, when the video doesn't include the results screen,
  falls back to a neutral placement rather than a fabricated precise one.

## Extension points

- **Storage** (`apps/server/src/db/store.ts`): a JSON file + local disk
  today. Swap it for Postgres/S3 without touching the pipeline or routes -
  they only call `store.createJob/updateJob/getJob/saveReport/getReport`.
- **Job execution** (`pipeline/runPipeline.ts` called fire-and-forget from
  `routes/vods.ts`): fine for one process; a real deployment processing
  many videos concurrently should move this behind a queue (BullMQ/SQS) so
  uploads don't block on server restarts mid-job.
- **Auth**: none. Every report is reachable by its (random UUID) job id.
  Adding accounts means gating the routes in `routes/vods.ts` and scoping
  `store.listJobs` per user.
