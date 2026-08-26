"use client";

import { useEffect } from "react";
import { useModelStore } from "@/store/modelStore";

export function LiveStatsStrip() {
  const model = useModelStore((s) => s.model);
  const hydrate = useModelStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const games = model?.gamesPlayed ?? 0;
  const winRate = games > 0 && model ? (model.winCount / games) * 100 : 0;
  const avgPlacement = games > 0 && model ? model.placementSum / games : null;

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-panel/60 px-6 py-4 backdrop-blur-sm">
      <StripStat value={games.toLocaleString()} label="games played so far" />
      <div className="hidden h-8 w-px bg-border sm:block" />
      <StripStat value={avgPlacement != null ? avgPlacement.toFixed(2) : "—"} label="current avg. placement" />
      <div className="hidden h-8 w-px bg-border sm:block" />
      <StripStat value={games > 0 ? `${winRate.toFixed(1)}%` : "—"} label="win rate" />
    </div>
  );
}

function StripStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display tabular text-xl font-semibold text-text">{value}</div>
      <div className="text-xs text-text-faint">{label}</div>
    </div>
  );
}
