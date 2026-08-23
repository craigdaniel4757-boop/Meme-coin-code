import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProcessingTimeline } from "@/components/upload/processing-timeline";
import { getJobStatus } from "@/lib/api";
import { JobStatus } from "@/types/report";

const POLL_INTERVAL_MS = 2000;

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      try {
        const status = await getJobStatus(jobId!);
        if (cancelled) return;
        setJob(status);
        setPollError(null);
        if (status.status === "complete") {
          navigate(`/report/${jobId}`);
          return;
        }
        if (status.status !== "failed") {
          timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setPollError(err instanceof Error ? err.message : "Lost connection while checking status.");
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [jobId, navigate]);

  if (!jobId) {
    return (
      <div className="container max-w-xl py-24 text-center text-muted-foreground">Missing job id.</div>
    );
  }

  const failed = job?.status === "failed";
  const displayStage = job && job.status !== "failed" ? job.status : "uploaded";

  return (
    <div className="container flex max-w-xl flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{failed ? "Analysis hit a snag" : "Analyzing your game..."}</h1>
      <p className="mt-2 text-muted-foreground">
        {failed ? "Here's what went wrong:" : "This usually takes a few minutes. Feel free to leave this tab open."}
      </p>
      {job?.isDemo && !failed && (
        <Badge variant="accent" className="mt-4">
          Demo mode - showing sample analysis
        </Badge>
      )}

      <Card className="mt-8 w-full text-left">
        <CardHeader>
          <CardTitle className="text-base">{failed ? "Error" : "Progress"}</CardTitle>
          {!failed && <CardDescription>Live status</CardDescription>}
        </CardHeader>
        <CardContent>
          {failed ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{job?.error ?? "Something went wrong during analysis."}</p>
            </div>
          ) : (
            <ProcessingTimeline status={displayStage} />
          )}
          {pollError && <p className="mt-4 text-xs text-muted-foreground">{pollError} Retrying...</p>}
        </CardContent>
      </Card>

      {failed && (
        <Button className="mt-6" onClick={() => navigate("/upload")}>
          Try another video
        </Button>
      )}
    </div>
  );
}
