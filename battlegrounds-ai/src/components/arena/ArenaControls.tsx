"use client";

import type { PlaybackSpeed } from "@/hooks/useArenaSession";
import { SPEED_LABELS } from "@/hooks/useArenaSession";

const SPEEDS: PlaybackSpeed[] = ["slow", "normal", "fast"];

export function ArenaControls({
  hasGame,
  playing,
  onTogglePlaying,
  onNewGame,
  onStep,
  onBack,
  atEnd,
  speed,
  setSpeed,
  deterministic,
  setDeterministic,
  round,
}: {
  hasGame: boolean;
  playing: boolean;
  onTogglePlaying: () => void;
  onNewGame: () => void;
  onStep: () => void;
  onBack: () => void;
  atEnd: boolean;
  speed: PlaybackSpeed;
  setSpeed: (s: PlaybackSpeed) => void;
  deterministic: boolean;
  setDeterministic: (v: boolean) => void;
  round: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3">
      <button
        onClick={onNewGame}
        className="rounded-lg bg-gradient-to-r from-violet to-violet-strong px-4 py-2 text-sm font-semibold text-bg transition-transform hover:scale-[1.03] active:scale-95"
      >
        {hasGame ? "New Game" : "Start a Game"}
      </button>

      {hasGame && (
        <>
          <div className="flex items-center gap-1">
            <button
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-panel-2"
              aria-label="Step back"
            >
              ⏮
            </button>
            <button
              onClick={onTogglePlaying}
              className="flex h-8 w-16 items-center justify-center rounded-lg border border-border text-sm font-medium text-text hover:bg-panel-2"
            >
              {atEnd ? "Replay" : playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={onStep}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-panel-2"
              aria-label="Step forward"
            >
              ⏭
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  speed === s ? "bg-panel-2 text-text" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {SPEED_LABELS[s]}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input type="checkbox" checked={deterministic} onChange={(e) => setDeterministic(e.target.checked)} className="accent-violet" />
            Deterministic play
          </label>

          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" />
            Round {round}
          </div>
        </>
      )}
    </div>
  );
}
