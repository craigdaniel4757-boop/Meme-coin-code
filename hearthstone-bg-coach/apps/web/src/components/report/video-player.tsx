import { forwardRef } from "react";
import { FileQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";

interface VideoPlayerProps {
  src: string | null;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({ src }, ref) => {
  if (!src) {
    return (
      <Card className="flex aspect-video flex-col items-center justify-center gap-2 border-dashed p-6 text-center">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This is a sample report - no video is attached. Clicking a turn or mistake below still shows how syncing
          works with your own upload.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={ref} src={src} controls className="aspect-video w-full bg-black" />
    </Card>
  );
});
VideoPlayer.displayName = "VideoPlayer";
