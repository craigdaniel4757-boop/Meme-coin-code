import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SampleReportTeaser() {
  return (
    <section className="border-t border-border/60 py-20">
      <div className="container">
        <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-10 text-center md:p-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Not ready to upload? See it in action first.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Browse a full 17-turn coaching report - the same page your own analysis lands on - with real mistakes,
            strengths, and a turn-by-turn timeline.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link to="/report/sample">
              View the sample report <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
