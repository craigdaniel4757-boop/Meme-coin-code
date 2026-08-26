"use client";

import { useEffect } from "react";
import { useModelStore } from "@/store/modelStore";
import { StatTiles } from "@/components/lab/StatTiles";
import { PlacementTrendChart, WeightsChart } from "@/components/lab/Charts";
import { ArchetypeTable } from "@/components/lab/ArchetypeTable";
import { TrainPanel } from "@/components/lab/TrainPanel";

export default function LabPage() {
  const model = useModelStore((s) => s.model);
  const hydrated = useModelStore((s) => s.hydrated);
  const hydrate = useModelStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Training Lab</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every game Aurora plays &mdash; in the Arena or trained here in bulk &mdash; updates the same model. This is what it
          has learned so far.
        </p>
      </div>

      {!hydrated || !model ? (
        <div className="py-20 text-center text-sm text-text-faint">Loading&hellip;</div>
      ) : (
        <div className="space-y-6">
          <StatTiles model={model} />
          <TrainPanel gamesPlayed={model.gamesPlayed} />
          <div className="grid gap-6 lg:grid-cols-2">
            <PlacementTrendChart model={model} />
            <ArchetypeTable model={model} />
          </div>
          <WeightsChart model={model} />
        </div>
      )}
    </div>
  );
}
