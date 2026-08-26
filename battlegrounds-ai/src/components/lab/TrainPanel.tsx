"use client";

import { useState } from "react";
import { useTrainer } from "@/hooks/useTrainer";
import { useModelStore } from "@/store/modelStore";
import { explorationRateFor, learningRateFor } from "@/engine/persistence/storage";

const PRESETS = [25, 100, 500];

export function TrainPanel({ gamesPlayed }: { gamesPlayed: number }) {
  const { run, cancel, running, progress } = useTrainer();
  const reset = useModelStore((s) => s.reset);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const epsilon = explorationRateFor(gamesPlayed);
  const lr = learningRateFor(gamesPlayed);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Train in the background</h3>
          <p className="text-xs text-text-faint">Fast-simulates full games with no animation — Aurora learns from every one.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((n) => (
          <button
            key={n}
            disabled={running}
            onClick={() => run(n)}
            className="rounded-lg bg-gradient-to-r from-violet to-violet-strong px-3.5 py-2 text-xs font-semibold text-bg transition-transform hover:scale-[1.03] disabled:pointer-events-none disabled:opacity-40"
          >
            Train {n} games
          </button>
        ))}
        {running && (
          <button onClick={cancel} className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-text-secondary hover:bg-panel-2">
            Stop
          </button>
        )}

        <div className="ml-auto">
          {!confirmingReset ? (
            <button onClick={() => setConfirmingReset(true)} className="text-xs font-medium text-text-faint hover:text-coral">
              Reset learning
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">Erase all progress?</span>
              <button
                onClick={() => {
                  reset();
                  setConfirmingReset(false);
                }}
                className="font-semibold text-coral hover:underline"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmingReset(false)} className="text-text-faint hover:underline">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {running && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-gradient-to-r from-violet to-violet-strong transition-all duration-150" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 tabular text-xs text-text-faint">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()} games
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-6 border-t border-border pt-4 text-xs text-text-faint">
        <span>
          Exploration rate <span className="tabular text-text-secondary">{(epsilon * 100).toFixed(1)}%</span>
        </span>
        <span>
          Learning rate <span className="tabular text-text-secondary">{lr.toFixed(3)}</span>
        </span>
        <span className="text-text-faint">Both decay automatically as it plays more games.</span>
      </div>
    </div>
  );
}
