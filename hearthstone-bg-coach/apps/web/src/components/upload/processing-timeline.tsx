import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobStage } from "@/types/report";

export type PipelineStage = Exclude<JobStage, "failed">;

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "uploaded", label: "Upload received" },
  { key: "extracting_frames", label: "Extracting frames" },
  { key: "analyzing_gameplay", label: "Reading the board (Claude vision)" },
  { key: "generating_report", label: "Generating coaching report" },
  { key: "complete", label: "Done" },
];

const ORDER = STAGES.map((s) => s.key);

export function ProcessingTimeline({ status }: { status: PipelineStage }) {
  const currentIndex = ORDER.indexOf(status);

  return (
    <ol className="space-y-4">
      {STAGES.map((stage, i) => {
        const isDone = i < currentIndex || status === "complete";
        const isCurrent = i === currentIndex && status !== "complete";

        return (
          <li key={stage.key} className="flex items-center gap-3">
            {isDone ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            ) : isCurrent ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
            )}
            <span
              className={cn(
                "text-sm",
                (isDone || isCurrent) ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
