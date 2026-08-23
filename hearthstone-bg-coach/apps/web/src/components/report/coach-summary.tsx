import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function CoachSummary({ summary }: { summary: string }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="flex gap-4 p-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Coach&rsquo;s summary</p>
          <p className="mt-2 text-balance leading-relaxed text-foreground/90">{summary}</p>
        </div>
      </CardContent>
    </Card>
  );
}
