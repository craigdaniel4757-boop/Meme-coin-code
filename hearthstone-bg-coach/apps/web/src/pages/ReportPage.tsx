import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { CoachSummary } from "@/components/report/coach-summary";
import { MistakeList } from "@/components/report/mistake-list";
import { ReportHeader } from "@/components/report/report-header";
import { StatOverview } from "@/components/report/stat-overview";
import { StrengthList } from "@/components/report/strength-list";
import { TempoChart } from "@/components/report/tempo-chart";
import { TurnTimeline } from "@/components/report/turn-timeline";
import { VideoPlayer } from "@/components/report/video-player";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getJobReport, getSampleReport, ReportResponse, resolveMediaUrl } from "@/lib/api";

interface ReportPageProps {
  sample?: boolean;
}

export default function ReportPage({ sample = false }: ReportPageProps) {
  const { jobId } = useParams<{ jobId: string }>();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    const request = sample
      ? getSampleReport()
      : jobId
        ? getJobReport(jobId)
        : Promise.reject(new Error("Missing report id."));

    request
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load this report.");
      });

    return () => {
      cancelled = true;
    };
  }, [sample, jobId]);

  function seekTo(timestampSec: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = timestampSec;
    void video.play().catch(() => undefined);
    video.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (error) {
    return <div className="container max-w-xl py-24 text-center text-muted-foreground">{error}</div>;
  }

  if (!data) {
    return (
      <div className="container flex flex-col items-center gap-3 py-32 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Loading report...</p>
      </div>
    );
  }

  const { report, videoUrl } = data;

  return (
    <div className="container max-w-6xl py-12">
      <ReportHeader report={report} />

      <div className="mt-8">
        <CoachSummary summary={report.summary} />
      </div>

      <div className="mt-6">
        <StatOverview
          keyStats={report.keyStats}
          mistakeCount={report.mistakes.length}
          strengthCount={report.strengths.length}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <TempoChart turns={report.turns} mistakes={report.mistakes} onSeek={seekTo} />
        </CardContent>
      </Card>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:h-fit">
          <VideoPlayer ref={videoRef} src={resolveMediaUrl(videoUrl)} />
        </div>

        <div className="lg:col-start-1 lg:row-start-1">
          <Tabs defaultValue="mistakes">
            <TabsList>
              <TabsTrigger value="mistakes">Mistakes &amp; Fixes ({report.mistakes.length})</TabsTrigger>
              <TabsTrigger value="timeline">Turn-by-Turn</TabsTrigger>
              <TabsTrigger value="strengths">Strengths ({report.strengths.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="mistakes">
              <MistakeList mistakes={report.mistakes} onSeek={seekTo} />
            </TabsContent>
            <TabsContent value="timeline">
              <TurnTimeline turns={report.turns} onSeek={seekTo} />
            </TabsContent>
            <TabsContent value="strengths">
              <StrengthList strengths={report.strengths} onSeek={seekTo} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
