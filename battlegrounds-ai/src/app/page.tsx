import Link from "next/link";
import { LiveStatsStrip } from "@/components/landing/LiveStatsStrip";
import { ALL_TRIBES } from "@/engine/types";
import { TRIBE_META } from "@/engine/data/tribes";
import { PURCHASABLE_MINIONS } from "@/engine/data/minions";
import { HERO_DEFS } from "@/engine/data/heroes";
import { FEATURE_DEFS } from "@/engine/ai/features";

const THINK_STEPS = [
  {
    title: "Reads the board",
    body: `Every decision point, the board becomes ${FEATURE_DEFS.length - 1} numeric signals — curve timing, tribe commitment, keyword density, a quick Monte-Carlo read on its next matchup, and more.`,
  },
  {
    title: "Scores every option",
    body: "A linear value function turns those signals into a score for each legal move it could make right now — buy, sell, upgrade, freeze, reroll, hero power, or end turn.",
  },
  {
    title: "Learns from the result",
    body: "After every game, the model shifts its weights toward whatever was correlated with a better finish — a transparent, from-scratch reinforcement-learning update, not a black box.",
  },
  {
    title: "Says why, out loud",
    body: "Each move ships with the actual factors that drove it, worded fresh from the live weights — so the explanation changes as its priorities do.",
  },
];

const FEATURES = [
  { title: "A full 8-player lobby", body: "Every game simulates all eight seats end-to-end — real pairings, ghost boards, and eliminations, not a 1-on-1 toy." },
  { title: `${PURCHASABLE_MINIONS.length}+ original minions`, body: `Spanning all ${ALL_TRIBES.length} current Battlegrounds tribes and six tavern tiers, with real keyword mechanics: Taunt, Divine Shield, Poisonous, Windfury, Reborn, Avenge, and Frenzy.` },
  { title: `${HERO_DEFS.length} heroes, each run`, body: "A different hero power every game, so the agent has to generalize its strategy rather than memorize one setup." },
  { title: "Real Battlegrounds economy", body: "Tavern tiers, a shared minion pool, triples into goldens, and rotating game-warping anomalies." },
  { title: "Self-play, no external data", body: "Aurora never sees a human game log. Everything it knows comes from playing itself, over and over, in your browser." },
  { title: "Remembers between visits", body: "Its model lives in your browser's storage and keeps improving across sessions until you reset it." },
];

export default function LandingPage() {
  return (
    <div className="bg-noise-gradient">
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs font-medium text-violet-strong">
          An original self-learning auto-battler
        </span>
        <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-text sm:text-5xl">
          Watch an AI teach itself Battlegrounds &mdash; and explain every move.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
          Aurora is a from-scratch reinforcement-learning agent playing an original 8-player auto-battler built on the tribes,
          tavern tiers, and economy of Hearthstone Battlegrounds&rsquo; current patch. No pre-training, no scripted lines
          &mdash; every decision comes from a model that updates after every single game.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/arena"
            className="rounded-lg bg-gradient-to-r from-violet to-violet-strong px-6 py-3 text-sm font-semibold text-bg transition-transform hover:scale-[1.03] active:scale-95"
          >
            Watch the Arena
          </Link>
          <Link href="/lab" className="rounded-lg border border-border-strong bg-panel px-6 py-3 text-sm font-semibold text-text hover:bg-panel-2">
            Open the Training Lab
          </Link>
        </div>
        <div className="mx-auto mt-10 max-w-xl">
          <LiveStatsStrip />
        </div>
      </section>

      <section id="how-it-thinks" className="border-t border-border bg-bg-elevated/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-semibold text-text sm:text-3xl">How Aurora actually thinks</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              No neural network, no GPU cluster &mdash; and that&rsquo;s deliberate. A small, fully-inspectable learning loop
              that runs entirely in the browser, so every number behind a decision is one you can actually look at.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {THINK_STEPS.map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-border bg-panel p-5">
                <span className="font-display text-2xl font-bold text-violet/40">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-sm font-semibold text-text">{step.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-panel p-5">
              <h3 className="text-sm font-semibold text-text">{f.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="cards" className="border-t border-border bg-bg-elevated/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-semibold text-text sm:text-3xl">Ten tribes, one shared tavern</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              An original card pool, built to match the current patch&rsquo;s structure &mdash; not Blizzard&rsquo;s actual
              cards or art. See the full disclaimer in the footer.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ALL_TRIBES.map((tribe) => {
              const meta = TRIBE_META[tribe];
              return (
                <div key={tribe} className="rounded-xl border border-border bg-panel p-4" style={{ boxShadow: `inset 3px 0 0 ${meta.color}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.glyph}</span>
                    <span className="text-sm font-semibold text-text">{meta.label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-muted">{meta.identity}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="font-display text-2xl font-semibold text-text sm:text-3xl">See it think, one turn at a time.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-text-muted">
          Drop into a live lobby and watch the reasoning appear in real time, or jump into the Lab and fast-train hundreds of
          games to see the model itself shift.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/arena"
            className="rounded-lg bg-gradient-to-r from-violet to-violet-strong px-6 py-3 text-sm font-semibold text-bg transition-transform hover:scale-[1.03] active:scale-95"
          >
            Watch the Arena
          </Link>
          <Link href="/lab" className="rounded-lg border border-border-strong bg-panel px-6 py-3 text-sm font-semibold text-text hover:bg-panel-2">
            Open the Training Lab
          </Link>
        </div>
      </section>
    </div>
  );
}
