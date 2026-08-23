import { Link } from "react-router-dom";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="container grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="animate-slide-up">
          <Badge variant="accent" className="mb-6">
            <Sparkles className="h-3 w-3" /> Powered by Claude vision + a Battlegrounds strategy engine
          </Badge>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Turn every Battlegrounds run into your <span className="text-primary">best one yet.</span>
          </h1>
          <p className="mt-6 max-w-xl text-balance text-lg text-muted-foreground">
            Upload a screen recording of a Hearthstone Battlegrounds game. TavernIQ reads every turn, flags exactly
            what went wrong, and coaches you through what to do differently - like a VOD review from a coach who
            never blinks.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button size="lg" asChild>
              <Link to="/upload">
                Upload your VOD <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/report/sample">
                <PlayCircle className="h-4 w-4" /> See a sample report
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">No account needed. Most reports are ready in a few minutes.</p>
        </div>

        <HeroPreviewCard />
      </div>
    </section>
  );
}

function HeroPreviewCard() {
  return (
    <Card className="relative mx-auto w-full max-w-md rotate-1 border-border/80 p-6 shadow-2xl transition-transform duration-300 hover:rotate-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Run Report</p>
          <p className="font-semibold">George the Fallen &middot; 3rd place</p>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-primary text-lg font-bold text-primary">
          C+
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">Turn 9 &middot; Positioning</p>
          <p className="mt-1 text-muted-foreground">
            Divine Shields grouped together - a single cleave strips both at once.
          </p>
        </div>
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-warning">Turn 5 &middot; Tempo</p>
          <p className="mt-1 text-muted-foreground">Took 15 damage early - board was under-statted for the turn.</p>
        </div>
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          <p className="font-medium text-success">Turn 11 &middot; Strength</p>
          <p className="mt-1 text-muted-foreground">Clean Beast pivot execution right as the board needed it.</p>
        </div>
      </div>
    </Card>
  );
}
