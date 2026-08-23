import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_HEALTH_LINE, CHART_SEVERITY_COLOR, CHART_SURFACE } from "@/lib/chart-colors";
import { SEVERITY_LABEL } from "@/lib/mistake-meta";
import { Mistake, TurnSnapshot } from "@/types/report";

interface TempoChartProps {
  turns: TurnSnapshot[];
  mistakes: Mistake[];
  onSeek: (timestampSec: number) => void;
}

interface ChartPoint extends TurnSnapshot {
  mistakesAtTurn: Mistake[];
}

interface TierBand {
  tier: number;
  startTurn: number;
  endTurn: number;
}

function computeTierBands(turns: TurnSnapshot[]): TierBand[] {
  const bands: TierBand[] = [];
  for (const turn of turns) {
    const last = bands[bands.length - 1];
    if (last && last.tier === turn.tavernTier) {
      last.endTurn = turn.turn;
    } else {
      bands.push({ tier: turn.tavernTier, startTurn: turn.turn, endTurn: turn.turn });
    }
  }
  return bands;
}

const worstSeverity = (mistakesAtTurn: Mistake[]): Mistake =>
  mistakesAtTurn.reduce((worst, m) => {
    const rank = { minor: 0, moderate: 1, major: 2 };
    return rank[m.severity] > rank[worst.severity] ? m : worst;
  });

export function TempoChart({ turns, mistakes, onSeek }: TempoChartProps) {
  const data: ChartPoint[] = useMemo(
    () => turns.map((t) => ({ ...t, mistakesAtTurn: mistakes.filter((m) => m.turn === t.turn) })),
    [turns, mistakes],
  );
  const tierBands = useMemo(() => computeTierBands(turns), [turns]);
  // Half-turn padding on the axis domain matches the ReferenceArea bands'
  // own -0.5/+0.5 padding - otherwise the first/last band (and their
  // labels) get clipped right at the plot edge.
  const xDomain: [number, number] = [
    (turns[0]?.turn ?? 1) - 0.5,
    (turns[turns.length - 1]?.turn ?? 1) + 0.5,
  ];

  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_HEALTH_LINE} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART_HEALTH_LINE} stopOpacity={0} />
              </linearGradient>
            </defs>

            {tierBands.map((band) => (
              <ReferenceArea
                key={`${band.tier}-${band.startTurn}`}
                x1={band.startTurn - 0.5}
                x2={band.endTurn + 0.5}
                strokeOpacity={0}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={band.tier % 2 === 0 ? 0.06 : 0.02}
                label={{
                  value: `T${band.tier}`,
                  position: "insideTop",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 11,
                }}
              />
            ))}

            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="turn"
              type="number"
              domain={xDomain}
              allowDecimals={false}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              label={{ value: "Turn", position: "insideBottom", offset: -4, fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis
              domain={[0, 40]}
              ticks={[0, 10, 20, 30, 40]}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              content={<ChartTooltip />}
              wrapperStyle={{ outline: "none" }}
            />
            <Area
              type="monotone"
              dataKey="health"
              stroke={CHART_HEALTH_LINE}
              strokeWidth={2}
              fill="url(#healthFill)"
              dot={(props) => <MistakeDot key={props.payload.turn} {...props} onSeek={onSeek} />}
              activeDot={{ r: 4, fill: CHART_HEALTH_LINE, stroke: CHART_SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: CHART_HEALTH_LINE }} />
          Health
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/20" />
          Tavern tier (shaded, labeled)
        </span>
        {(["minor", "moderate", "major"] as const).map((severity) => (
          <span key={severity} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: CHART_SEVERITY_COLOR[severity] }}
            />
            {SEVERITY_LABEL[severity]} mistake
          </span>
        ))}
      </div>
    </div>
  );
}

interface DotRenderProps {
  cx?: number;
  cy?: number;
  payload: ChartPoint;
  onSeek: (timestampSec: number) => void;
}

function MistakeDot({ cx, cy, payload, onSeek }: DotRenderProps) {
  if (cx == null || cy == null || payload.mistakesAtTurn.length === 0) return null;
  const worst = worstSeverity(payload.mistakesAtTurn);
  const color = CHART_SEVERITY_COLOR[worst.severity];

  return (
    <g style={{ cursor: "pointer" }} onClick={() => onSeek(payload.timestampSec)}>
      <circle cx={cx} cy={cy} r={14} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={color} stroke={CHART_SURFACE} strokeWidth={2} />
    </g>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="max-w-[220px] rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">Turn {point.turn}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
        <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: CHART_HEALTH_LINE }} />
        Health <span className="font-medium text-foreground">{point.health}</span>
      </p>
      <p className="text-muted-foreground">Tavern Tier {point.tavernTier}</p>
      {point.mistakesAtTurn.map((m) => (
        <p key={m.id} className="mt-1.5 font-medium leading-snug" style={{ color: CHART_SEVERITY_COLOR[m.severity] }}>
          {m.title}
        </p>
      ))}
    </div>
  );
}
