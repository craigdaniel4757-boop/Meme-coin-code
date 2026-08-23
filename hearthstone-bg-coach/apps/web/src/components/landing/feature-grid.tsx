import { Activity, Coins, LayoutGrid, ListChecks, Shield, Swords } from "lucide-react";

const FEATURES = [
  {
    icon: Coins,
    title: "Economy coaching",
    description: "Catches slow tavern curves, banked gold, and inefficient rerolling against real benchmark turns.",
  },
  {
    icon: Activity,
    title: "Tempo tracking",
    description: "Flags early health loss and thin boards before they turn into a lost run.",
  },
  {
    icon: Shield,
    title: "Positioning analysis",
    description: "Spots Divine Shield clumping and other cleave-vulnerable setups turn by turn.",
  },
  {
    icon: LayoutGrid,
    title: "Composition grading",
    description: "Tells you when your comp lacks a clear identity - and when it's time to commit.",
  },
  {
    icon: Swords,
    title: "Combat review",
    description: "Surfaces the biggest swing turns in the game, worth a rewatch to see what happened.",
  },
  {
    icon: ListChecks,
    title: "Turn-by-turn timeline",
    description: "Every turn's board, gold, and tavern tier, synced to your video so you can jump straight to it.",
  },
];

export function FeatureGrid() {
  return (
    <section className="border-t border-border/60 py-20">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything a coach would check</h2>
          <p className="mt-4 text-muted-foreground">
            Six categories of feedback, each backed by real Battlegrounds strategy fundamentals.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
