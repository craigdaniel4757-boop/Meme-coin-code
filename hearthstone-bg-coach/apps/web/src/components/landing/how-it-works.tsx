import { Brain, ClipboardList, ScanSearch, Upload } from "lucide-react";

const STEPS = [
  {
    icon: Upload,
    title: "1. Upload your VOD",
    description: "Drop in a screen recording of a Battlegrounds game - mp4, mov, or webm.",
  },
  {
    icon: ScanSearch,
    title: "2. Frames get read",
    description:
      "TavernIQ samples the recording and reads tavern tier, gold, board, and shop off the screen turn by turn.",
  },
  {
    icon: Brain,
    title: "3. A strategy engine grades it",
    description:
      "Economy curve, positioning, composition focus, and hero power usage all get checked against real Battlegrounds benchmarks.",
  },
  {
    icon: ClipboardList,
    title: "4. You get a coaching report",
    description: "A turn-by-turn breakdown of what to fix, synced to your video, with a clear priority order.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60 py-20 scroll-mt-16">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-4 text-muted-foreground">From recording to report in four steps.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-lg border border-border bg-card p-6">
              <step.icon className="h-8 w-8 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
