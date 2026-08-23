import { useCallback, useState } from "react";
import { FileRejection, useDropzone } from "react-dropzone";
import { FileVideo, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "video/x-matroska": [".mkv"],
};
const MAX_SIZE_BYTES = 500 * 1024 * 1024;

interface UploadDropzoneProps {
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onFileSelected, disabled }: UploadDropzoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        setError(rejections[0]?.errors[0]?.message ?? "That file couldn't be accepted.");
        return;
      }
      setError(null);
      const picked = accepted[0] ?? null;
      setFile(picked);
      onFileSelected(picked);
    },
    [onFileSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE_BYTES,
    maxFiles: 1,
    disabled,
  });

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setFile(null);
    setError(null);
    onFileSelected(null);
  }

  if (file) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-5">
        <div className="flex min-w-0 items-center gap-3">
          <FileVideo className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          </div>
        </div>
        {!disabled && (
          <Button variant="ghost" size="icon" onClick={clear} aria-label="Remove file">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card/50 p-12 text-center transition-colors hover:border-primary/50 hover:bg-card",
          isDragActive && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-10 w-10 text-muted-foreground" />
        <p className="mt-4 font-medium">
          {isDragActive ? "Drop it here" : "Drag & drop your recording, or click to browse"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">MP4, MOV, WebM, or MKV - up to 500MB</p>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
