import { Badge } from "@/components/ui/badge";
import { cn, formatPlacement } from "@/lib/utils";
import { Report } from "@/types/report";

function gradeColorClass(score: number): string {
  if (score >= 90) return "text-success border-success";
  if (score >= 73) return "text-primary border-primary";
  if (score >= 60) return "text-warning border-warning";
  return "text-destructive border-destructive";
}

export function ReportHeader({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {report.isDemo && <Badge variant="accent">Sample report</Badge>}
          <Badge variant="secondary">{report.compArchetype}</Badge>
          {report.tribesFocused.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{report.hero}</h1>
        <p className="mt-1 text-muted-foreground">
          Finished {formatPlacement(report.finalPlacement)} of 8 &middot; {report.durationTurns} turns
        </p>
      </div>

      <div
        className={cn(
          "flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4",
          gradeColorClass(report.overallScore),
        )}
      >
        <span className="text-3xl font-extrabold">{report.grade}</span>
        <span className="text-xs text-muted-foreground">{report.overallScore}/100</span>
      </div>
    </div>
  );
}
