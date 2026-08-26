"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LearnerModel } from "@/engine/persistence/storage";
import { bucketedTrend } from "@/lib/stats";
import { FEATURE_DEFS } from "@/engine/ai/features";

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <p className="text-xs text-text-faint">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text)",
};

export function PlacementTrendChart({ model }: { model: LearnerModel }) {
  const data = bucketedTrend(model.placementHistory, Math.max(5, Math.round(model.gamesPlayed / 40) || 5), 40);

  if (data.length < 2) {
    return (
      <ChartCard title="Placement over time" subtitle="Rolling average finishing place, most recent games last">
        <div className="flex h-56 items-center justify-center text-xs text-text-faint">Play or train more games to see a trend.</div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Placement over time" subtitle="Rolling average finishing place per batch of games (1 is best, 8 is worst)">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="bucketEnd" tick={{ fill: "var(--text-faint)", fontSize: 11 }} axisLine={{ stroke: "var(--border-strong)" }} tickLine={false} />
            <YAxis
              domain={[1, 8]}
              reversed
              ticks={[1, 2, 4, 6, 8]}
              tick={{ fill: "var(--text-faint)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => `through game ${v}`}
              formatter={(value) => [Number(value).toFixed(2), "avg. placement"]}
            />
            <ReferenceLine y={4.5} stroke="var(--text-faint)" strokeDasharray="3 4" />
            <Line type="monotone" dataKey="avgPlacement" stroke="var(--accent-violet)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function WeightsChart({ model }: { model: LearnerModel }) {
  const rows = FEATURE_DEFS.map((def, i) => ({ key: def.key, label: def.label, weight: model.weights[i] ?? 0 }))
    .filter((r) => r.key !== "bias")
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return (
    <ChartCard title="What Aurora currently values" subtitle="Learned weight per decision factor — right of zero means it favors that factor, left means it avoids it">
      <div style={{ height: rows.length * 26 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barCategoryGap={6}>
            <CartesianGrid stroke="var(--gridline)" horizontal={false} />
            <XAxis type="number" domain={[-1.5, 1.5]} tick={{ fill: "var(--text-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={168}
              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine x={0} stroke="var(--border-strong)" />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toFixed(3), "weight"]} cursor={{ fill: "var(--panel-2)" }} />
            <Bar dataKey="weight" radius={4} barSize={14} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.weight >= 0 ? "var(--accent-violet)" : "var(--accent-coral)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
