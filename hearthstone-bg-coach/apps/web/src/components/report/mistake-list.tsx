import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORY_META, SEVERITY_BADGE_VARIANT, SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/mistake-meta";
import { formatTimestamp } from "@/lib/utils";
import { Mistake } from "@/types/report";

interface MistakeListProps {
  mistakes: Mistake[];
  onSeek: (timestampSec: number) => void;
}

export function MistakeList({ mistakes, onSeek }: MistakeListProps) {
  const sorted = useMemo(
    () =>
      [...mistakes].sort((a, b) => {
        const rankA = SEVERITY_ORDER.indexOf(a.severity);
        const rankB = SEVERITY_ORDER.indexOf(b.severity);
        if (rankA !== rankB) return rankA - rankB;
        return a.turn - b.turn;
      }),
    [mistakes],
  );

  if (sorted.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No mistakes flagged - a very clean run.</p>;
  }

  return (
    <div className="space-y-4">
      {sorted.map((mistake) => {
        const category = CATEGORY_META[mistake.category];
        return (
          <Card
            key={mistake.id}
            role="button"
            tabIndex={0}
            onClick={() => onSeek(mistake.timestampSec)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSeek(mistake.timestampSec)}
            className="cursor-pointer transition-colors hover:border-primary/40"
          >
            <CardContent className="flex gap-4 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                <category.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SEVERITY_BADGE_VARIANT[mistake.severity]}>{SEVERITY_LABEL[mistake.severity]}</Badge>
                  <Badge variant="outline">{category.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Turn {mistake.turn} &middot; {formatTimestamp(mistake.timestampSec)}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold">{mistake.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{mistake.explanation}</p>
                <p className="mt-2 text-sm">
                  <span className="font-medium text-primary">Fix: </span>
                  <span className="text-muted-foreground">{mistake.suggestion}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
