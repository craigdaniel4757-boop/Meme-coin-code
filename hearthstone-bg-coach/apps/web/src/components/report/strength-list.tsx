import { Sparkle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/utils";
import { Strength } from "@/types/report";

interface StrengthListProps {
  strengths: Strength[];
  onSeek: (timestampSec: number) => void;
}

export function StrengthList({ strengths, onSeek }: StrengthListProps) {
  if (strengths.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No standout turns flagged this run.</p>;
  }

  return (
    <div className="space-y-4">
      {strengths.map((s) => (
        <Card
          key={`${s.turn}-${s.title}`}
          role="button"
          tabIndex={0}
          onClick={() => onSeek(s.timestampSec)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSeek(s.timestampSec)}
          className="cursor-pointer border-success/30 transition-colors hover:border-success/60"
        >
          <CardContent className="flex gap-4 p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
              <Sparkle className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                Turn {s.turn} &middot; {formatTimestamp(s.timestampSec)}
              </span>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.explanation}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
