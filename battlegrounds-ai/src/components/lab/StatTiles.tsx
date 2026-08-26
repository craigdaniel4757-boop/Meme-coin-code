import type { ReactNode } from "react";
import type { LearnerModel } from "@/engine/persistence/storage";
import { bucketedAverages } from "@/lib/stats";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-8" />;
  const w = 96;
  const h = 28;
  const min = 1;
  const max = 8;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = ((v - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={Number(points[points.length - 1].split(",")[1])} r={2.5} fill={color} />
    </svg>
  );
}

function Tile({ label, value, sub, spark }: { label: string; value: string; sub?: string; spark?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-3xl font-semibold tabular text-text">{value}</div>
          {sub && <div className="mt-1 text-xs text-text-muted">{sub}</div>}
        </div>
        {spark}
      </div>
    </div>
  );
}

export function StatTiles({ model }: { model: LearnerModel }) {
  const games = model.gamesPlayed;
  const winRate = games > 0 ? (model.winCount / games) * 100 : 0;
  const top4Rate = games > 0 ? (model.top4Count / games) * 100 : 0;
  const avgPlacement = games > 0 ? model.placementSum / games : 4.5;

  const recentBuckets = bucketedAverages(model.placementHistory, 10, 14);
  const recentTrend = games > 0 ? recentBuckets.map((v) => 9 - v) : [];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile label="Games played" value={games.toLocaleString()} sub="since last reset" />
      <Tile label="Win rate" value={`${winRate.toFixed(1)}%`} sub="1st place finishes" />
      <Tile
        label="Avg. placement"
        value={avgPlacement.toFixed(2)}
        sub="lower is better (1–8)"
        spark={<Sparkline values={recentTrend.length > 1 ? recentTrend : [4, 4]} color="var(--accent-violet)" />}
      />
      <Tile label="Top-4 rate" value={`${top4Rate.toFixed(1)}%`} sub="cashed out of 8" />
    </div>
  );
}
