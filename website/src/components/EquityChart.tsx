import { useMemo } from 'react';
import { EquityPoint } from '../types';
import { formatPct, formatUsd } from '../lib/format';
import { STARTING_CASH } from '../lib/simulation';

interface Props {
  equityCurve: EquityPoint[];
}

const W = 900;
const H = 220;
const PAD = 24;

export function EquityChart({ equityCurve }: Props) {
  const { path, areaPath, min, max, last, positive, points } = useMemo(() => {
    const values = equityCurve.map((p) => p.equity);
    const min = Math.min(...values, STARTING_CASH);
    const max = Math.max(...values, STARTING_CASH);
    const span = Math.max(max - min, 1e-6);
    const n = equityCurve.length;
    const points = equityCurve.map((p, i) => {
      const x = n <= 1 ? PAD : PAD + (i / (n - 1)) * (W - PAD * 2);
      const y = H - PAD - ((p.equity - min) / span) * (H - PAD * 2);
      return [x, y] as const;
    });
    const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const lastPoint = points[points.length - 1];
    const areaPath = path ? `${path} L${lastPoint[0]},${H - PAD} L${PAD},${H - PAD} Z` : '';
    const last = values[values.length - 1] ?? STARTING_CASH;
    return { path, areaPath, min, max, last, positive: last >= STARTING_CASH, points };
  }, [equityCurve]);

  const baselineY = useMemo(() => {
    const span = Math.max(max - min, 1e-6);
    return H - PAD - ((STARTING_CASH - min) / span) * (H - PAD * 2);
  }, [max, min]);

  const lineColor = positive ? '#22d3a5' : '#f5495c';

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm text-slate-400">Equity curve</div>
          <div className="text-xs text-slate-500">Starting balance $1,000 · simulated</div>
        </div>
        <div className={`font-mono text-sm ${positive ? 'text-up' : 'text-down'}`}>
          {formatUsd(last)} <span className="text-slate-500">·</span>{' '}
          {formatPct((last - STARTING_CASH) / STARTING_CASH)}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD} y1={baselineY} x2={W - PAD} y2={baselineY} stroke="#22304a" strokeDasharray="4 4" strokeWidth="1" />
        {path && <path d={areaPath} fill="url(#equityFill)" stroke="none" />}
        {path && (
          <path d={path} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.length > 0 && (
          <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="3.5" fill={lineColor} />
        )}
      </svg>
    </div>
  );
}
