import { AgentWeights } from '../types';
import { FEATURE_KEYS, FEATURE_LABELS } from '../lib/agent';
import { Stats } from '../lib/stats';
import { formatPct } from '../lib/format';

interface Props {
  agent: AgentWeights;
  stats: Stats;
}

export function BrainPanel({ agent, stats }: Props) {
  const rows = FEATURE_KEYS.filter((k) => k !== 'bias').map((k) => ({
    key: k,
    label: FEATURE_LABELS[k],
    weight: agent.entry[k],
  }));
  const maxAbs = Math.max(0.05, ...rows.map((r) => Math.abs(r.weight)));
  const sortedRows = rows.slice().sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-slate-400">AI brain</div>
          <div className="text-xs text-slate-500">Updates after every closed trade</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg text-accent2">{agent.updates}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">learning updates</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Exploration</div>
          <div className="font-mono text-sm">{(agent.epsilon * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Learning rate</div>
          <div className="font-mono text-sm">{agent.learningRate.toFixed(3)}</div>
        </div>
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Win rate</div>
          <div className="font-mono text-sm">{stats.totalTrades ? formatPct(stats.winRate, false) : '—'}</div>
        </div>
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Closed trades</div>
          <div className="font-mono text-sm">{stats.totalTrades}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 mb-2">What the model currently weighs most for entries</div>
      <div className="flex flex-col gap-1.5">
        {sortedRows.map((r) => {
          const pct = Math.min(100, (Math.abs(r.weight) / maxAbs) * 100);
          const positive = r.weight >= 0;
          return (
            <div key={r.key} className="flex items-center gap-2">
              <div className="w-36 shrink-0 text-[11px] text-slate-400 truncate">{r.label}</div>
              <div className="flex-1 h-2 rounded-full bg-panel2 overflow-hidden">
                <div className={`h-full rounded-full ${positive ? 'bg-up' : 'bg-down'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
