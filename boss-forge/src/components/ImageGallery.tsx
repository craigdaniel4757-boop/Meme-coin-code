"use client";

import { useEffect, useState } from "react";
import { getShotVariants } from "@/lib/promptEngine";
import type { GeneratedImageResult } from "@/types";

const FLAVOR_LINES = [
  "Sketching silhouette…",
  "Layering armor, scale, and scar…",
  "Balancing light against dread…",
  "Matching the game's exact palette…",
  "Rendering final pass…",
];

function LoadingFlavorText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % FLAVOR_LINES.length), 1800);
    return () => clearInterval(id);
  }, []);

  return <p className="text-sm text-ink-muted">{FLAVOR_LINES[index]}</p>;
}

function PromptDisclosure({ prompt }: { prompt: string }) {
  return (
    <details className="mt-3 text-xs text-ink-muted">
      <summary className="cursor-pointer select-none text-accent">View the art direction</summary>
      <p className="mt-2 whitespace-pre-line leading-relaxed">{prompt}</p>
    </details>
  );
}

export function ImageGallery({
  isGenerating,
  results,
  gameName,
}: {
  isGenerating: boolean;
  results: GeneratedImageResult[] | null;
  gameName: string;
}) {
  if (!isGenerating && !results) return null;

  const shots = getShotVariants();

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
      {shots.map((shot, i) => {
        const result = results?.[i];
        return (
          <div key={shot.id} className="panel flex flex-col overflow-hidden">
            <div className="skeleton relative aspect-square w-full">
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center animate-shimmer">
                  <div className="h-8 w-8 animate-pulseGlow rounded-full border-2 border-accent" />
                  <LoadingFlavorText />
                </div>
              )}
              {!isGenerating && result?.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.imageDataUrl}
                  alt={`${gameName} boss concept — ${shot.label}`}
                  className="h-full w-full object-cover"
                />
              )}
              {!isGenerating && result?.error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <span className="text-2xl">⚠</span>
                  <p className="text-sm text-ink-muted">{result.error}</p>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h4 className="font-heading text-accent">{shot.label}</h4>
              {result?.imageDataUrl && (
                <a
                  href={result.imageDataUrl}
                  download={`${gameName.replace(/\s+/g, "-").toLowerCase()}-boss-${shot.id}.png`}
                  className="chip mt-3 inline-block w-fit px-3 py-1.5 text-xs"
                >
                  Download PNG
                </a>
              )}
              {result?.prompt && <PromptDisclosure prompt={result.prompt} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
