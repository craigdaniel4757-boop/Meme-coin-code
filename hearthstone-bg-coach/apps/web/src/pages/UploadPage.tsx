import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadVideo } from "@/lib/api";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const { jobId } = await uploadVideo(file);
      navigate(`/processing/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
      setSubmitting(false);
    }
  }, [file, navigate]);

  return (
    <div className="container max-w-3xl py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Upload your Battlegrounds VOD</h1>
        <p className="mt-3 text-muted-foreground">
          We'll read the recording turn by turn and put together your coaching report.
        </p>
      </div>

      <div className="mt-10 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <UploadDropzone onFileSelected={setFile} disabled={submitting} />

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <Button size="lg" className="mt-6 w-full sm:w-auto" disabled={!file || submitting} onClick={handleSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting analysis...
              </>
            ) : (
              <>
                Start analysis <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">For the best results</CardTitle>
            <CardDescription>A few tips before you upload</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Record at 1080p or higher so tavern tier, gold, and minion stats stay legible.</p>
            <p>Include the whole game from turn 1 - placement and economy grading both need the full run.</p>
            <p>Keep the default in-game HUD visible and unobstructed by other overlays.</p>
            <p>No account or sign-in required - your report is ready as soon as processing finishes.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
