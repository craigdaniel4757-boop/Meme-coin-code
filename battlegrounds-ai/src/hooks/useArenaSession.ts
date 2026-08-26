"use client";

import { useCallback, useEffect, useState } from "react";
import { useModelStore } from "@/store/modelStore";
import { playOneGame, type PlayedGameSummary } from "@/engine/session";
import { deriveDisplayState } from "@/engine/replay";

export const SPEED_MS = { slow: 1500, normal: 750, fast: 280 } as const;
export type PlaybackSpeed = keyof typeof SPEED_MS;
export const SPEED_LABELS: Record<PlaybackSpeed, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };

export function useArenaSession() {
  const model = useModelStore((s) => s.model);
  const hydrated = useModelStore((s) => s.hydrated);
  const hydrate = useModelStore((s) => s.hydrate);
  const setModel = useModelStore((s) => s.setModel);

  const [summary, setSummary] = useState<PlayedGameSummary | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>("normal");
  const [deterministic, setDeterministic] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const startNewGame = useCallback(() => {
    if (!model) return;
    const result = playOneGame(model, { forceExploration: deterministic ? 0.02 : undefined });
    setSummary(result);
    setModel(result.modelAfter);
    setIndex(0);
    setPlaying(true);
  }, [model, setModel, deterministic]);

  const atEnd = summary ? index >= summary.events.length - 1 : false;

  useEffect(() => {
    if (!playing || !summary || atEnd) return undefined;
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, summary.events.length - 1)), SPEED_MS[speed]);
    return () => clearTimeout(t);
  }, [playing, index, summary, speed, atEnd]);

  const display = summary ? deriveDisplayState(summary.events, index, summary.initialRoster) : null;

  const stepForward = useCallback(() => {
    setPlaying(false);
    setIndex((i) => (summary ? Math.min(i + 1, summary.events.length - 1) : i));
  }, [summary]);

  const stepBackward = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const togglePlaying = useCallback(() => {
    if (atEnd) {
      setIndex(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [atEnd]);

  return {
    ready: hydrated,
    model,
    summary,
    display,
    index,
    playing: playing && !atEnd,
    togglePlaying,
    speed,
    setSpeed,
    deterministic,
    setDeterministic,
    startNewGame,
    stepForward,
    stepBackward,
    atEnd,
  };
}
