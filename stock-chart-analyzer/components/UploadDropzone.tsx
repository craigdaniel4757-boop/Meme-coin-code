'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface Props {
  previewUrl: string | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

export default function UploadDropzone({ previewUrl, onFileSelected, onClear }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) return;
      onFileSelected(file);
    },
    [onFileSelected],
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            onFileSelected(file);
            e.preventDefault();
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFileSelected]);

  if (previewUrl) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-panel2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Uploaded chart preview" className="max-h-80 w-full object-contain" />
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-2 rounded-lg border border-border bg-canvas/90 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-bear hover:text-bear"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      className={clsx(
        'flex h-80 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition',
        isDragging ? 'border-accent bg-accent/5' : 'border-border bg-panel2 hover:border-slate-500',
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 16V4M12 4L7 9M12 4L17 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M4 16V18a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="font-medium text-slate-200">Drop a chart screenshot, click to browse, or paste (Ctrl/Cmd+V)</p>
        <p className="mt-1 text-xs text-muted">PNG, JPG, or WEBP — any 1D/5D/1M/3M/6M/1Y stock chart screenshot</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
