# TavernIQ

A from-scratch reinforcement-learning agent — **Aurora** — that plays an original
8-player auto-battler built on the tribes, tavern tiers, and economy of
Hearthstone Battlegrounds' current patch, explains every decision it makes in
plain language, and gets measurably better the more games it plays.

Everything runs client-side: the game engine, the combat simulator, the
learning loop, and the persisted model all live in your browser. There's no
backend, no external API, and no pre-training on human game data — Aurora
starts from a small set of hand-authored "expert" priors and improves purely
from playing itself, over and over.

## How it works

1. **An original ruleset, not Blizzard's cards.** The tribes (Beast, Murloc,
   Demon, Mech, Dragon, Elemental, Pirate, Naga, Quilboar, Undead), the tavern
   economy (3g buy, 1g refresh, tavern tiers 1–6, triples into goldens,
   rotating anomalies), and the core keywords (Taunt, Divine Shield,
   Poisonous, Windfury/Mega-Windfury, Reborn, Frenzy, Avenge) all mirror the
   current Battlegrounds patch's structure. The 108 minions, 16 heroes, and
   all card text are original designs built for this project — see
   [`src/engine/data`](src/engine/data) — not a reproduction of Blizzard's
   actual card pool or art.
2. **A real combat simulator.** [`src/engine/combat.ts`](src/engine/combat.ts)
   resolves full 7v7 fights: attack order, Windfury multi-attacks, Divine
   Shield popping, Poisonous kills, deathrattle chains, Reborn, Avenge
   counters, and Frenzy triggers — the same simulator both plays out real
   combats and powers a fast Monte-Carlo win-probability estimate the agent
   uses to scout its next opponent.
3. **A transparent policy, not a black box.** Every decision point, the board
   becomes a ~19-dimensional feature vector — stats vs. the round's curve,
   tribe commitment, keyword density, tavern-tier timing, estimated combat
   win probability, and more (see
   [`src/engine/ai/features.ts`](src/engine/ai/features.ts)). A linear value
   function scores every legal action (buy, sell, reroll, freeze, upgrade,
   hero power, end turn) by simulating it against a cloned copy of the game
   state, and the agent picks the best-scoring one — with a decaying
   epsilon-greedy chance of trying something else, to keep exploring.
4. **Self-play reinforcement learning.** After every game, Aurora's finishing
   place becomes a reward signal (1st place ≈ +1, 8th place ≈ −1), blended
   with a smaller per-round shaping term from each combat's win/loss. A batch
   gradient update nudges the weight vector toward whatever features were
   correlated with the better outcome — plain Widrow-Hoff / linear TD
   learning (see [`src/engine/ai/learning.ts`](src/engine/ai/learning.ts)),
   with both the learning rate and exploration rate decaying on a fixed
   schedule as it plays more games. Across a few hundred self-play games in
   testing, Aurora's average finish reliably improves from around 6.3/8 to
   under 4.5/8 (better than the random baseline) against seven fixed
   heuristic opponents.
5. **Commentary generated from the live weights, not canned text.** Each move
   ships with the actual top-weighted factors that drove it (see
   [`src/engine/ai/commentary.ts`](src/engine/ai/commentary.ts)), so the
   stated reasoning shifts as training reshapes what the model values.

## Setup

Requires Node.js 18.18+.

```bash
cd battlegrounds-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment
variables, API keys, or database are needed — the learned model persists to
your browser's `localStorage` and picks up where it left off on your next
visit. Use the "Reset learning" button in the Lab to start over.

## Pages

- **`/`** — landing page and a short explainer of the learning approach.
- **`/arena`** — starts one full 8-player game and plays it back turn by
  turn, with Aurora's live board, its reasoning for every shop decision, an
  animated combat replay, and a compact view of the rest of the lobby. A
  "Deterministic play" toggle turns off exploration for a cleaner, more
  legible watch.
- **`/lab`** — training dashboard: games played, win rate, average
  placement, a placement-over-time trend, which board archetypes have
  actually won, and the current learned weight for every decision factor.
  "Train N games" fast-simulates games with no animation (yielding to the
  browser periodically so the UI stays responsive) so you can rack up
  hundreds of games in seconds.

Both pages drive the exact same [`playOneGame`](src/engine/session.ts)
function and update the exact same persisted model — watching a game in the
Arena teaches Aurora just as much as bulk-training in the Lab.

## Project structure

```
src/engine/
  types.ts, factory.ts        Core types and minion-instance construction
  data/                        Tribes, keywords, constants, heroes, anomalies,
                                and the minion pool (data/minions/<tribe>.ts)
  pool.ts, shop.ts             Shared tavern pool, buy/sell/upgrade/freeze/
                                hero-power rules, triple-into-golden logic
  combat.ts                    Full combat resolution + win-probability rollout
  replay.ts                    Turns a game's event log into UI-ready snapshots
  ai/
    features.ts                 Board -> feature vector
    policy.ts                    Feature vector -> action scores, action selection
    learning.ts                  Reward shaping + the weight-update rule
    commentary.ts                Turn-by-turn natural-language explanations
    baselineProfiles.ts          Seven fixed-strategy opponents for the lobby
  match/
    lobby.ts, pairing.ts, turnEngine.ts, simulateGame.ts
                                 8-player lobby setup, round pairing (incl.
                                 ghost boards), and the full game loop
  persistence/storage.ts       localStorage model persistence + schedules
  session.ts                    playOneGame(): simulate -> learn -> persist

src/app/            Landing, /arena, /lab (Next.js App Router)
src/components/      Arena and Lab UI, shared MinionCard
src/hooks/           useArenaSession (playback), useTrainer (bulk training)
src/store/           A small Zustand store so Arena, Lab, and the nav badge
                      share one live view of the model
```

## Honest limitations

This is a compact, fully-inspectable simulator, not a reproduction of every
rule and card in the live game:

- No hand zone — a bought minion resolves its Battlecry and is placed
  immediately (Taunts to the front, everything else to the right).
- Board positioning during combat isn't a learned decision.
- Discover effects, Trinkets, and tavern tier 7 aren't modeled; Anomalies are
  (a lightweight set of economy-modifying rules rolled once per game).
- The combat, pairing, and damage formulas are close, tested approximations
  of Battlegrounds' actual rules, not a byte-for-byte reimplementation.
- "Aurora" is a linear model over hand-picked features, not a neural
  network — deliberately, so every number behind a decision stays
  inspectable in [`src/engine/ai/policy.ts`](src/engine/ai/policy.ts).

## Fan project disclaimer

This is a fan-made, original simulator inspired by Hearthstone Battlegrounds'
rules and structure. It is not affiliated with, endorsed by, or associated
with Blizzard Entertainment. Every hero, minion, card name, and piece of card
text in this project is an original design — none of it reproduces
Blizzard's actual card pool, text, or art.
