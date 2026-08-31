import { AgentWeights } from '../types';
import { FEATURE_KEYS, FEATURE_LABELS, averageLinearEntryWeights } from '../lib/agent';
import { Stats } from '../lib/stats';
import { formatPct } from '../lib/format';
import { MIN_HELD_OUT_FOR_SIGNAL } from '../lib/simulation';

interface Props {
  agent: AgentWeights;
  stats: Stats;
  sizingFactor: number;
}

export function BrainPanel({ agent, stats, sizingFactor }: Props) {
  const avgWeights = averageLinearEntryWeights(agent);
  const rows = avgWeights
    ? FEATURE_KEYS.filter((k) => k !== 'bias').map((k) => ({ key: k, label: FEATURE_LABELS[k], weight: avgWeights[k] }))
    : [];
  const maxAbs = Math.max(0.05, ...rows.map((r) => Math.abs(r.weight)));
  const sortedRows = rows.slice().sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const linearCount = agent.members.filter((m) => m.kind === 'linear').length;
  const neuralCount = agent.members.length - linearCount;

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-slate-400">AI brain</div>
          <div className="text-xs text-slate-500">
            {agent.members.length}-model ensemble ({linearCount} linear + {neuralCount} neural) · updates after every
            training trade
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg text-accent2">{agent.updates}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">learning updates</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Exploration</div>
          <div className="font-mono text-sm">{(agent.epsilon * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Learning rate</div>
          <div className="font-mono text-sm">{agent.learningRate.toFixed(3)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg bg-panel2/60 border border-border px-3 py-2" title="Win rate on trades the model learned from -- inflated, since it was fit to these.">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Win rate (training)</div>
          <div className="font-mono text-sm">
            {stats.training.trades ? formatPct(stats.training.winRate, false) : '—'}
            <span className="text-slate-500 text-[10px]"> n={stats.training.trades}</span>
          </div>
        </div>
        <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2" title="Win rate on trades excluded from learning -- an unbiased read on current skill.">
          <div className="text-[10px] text-accent2 uppercase tracking-wide">Win rate (held-out)</div>
          <div className="font-mono text-sm">
            {stats.heldOut.trades ? formatPct(stats.heldOut.winRate, false) : '—'}
            <span className="text-slate-500 text-[10px]"> n={stats.heldOut.trades}</span>
          </div>
        </div>
      </div>

      <div
        className="text-xs text-slate-400 mb-4"
        title="New position sizes are multiplied by this -- shrinks after a run of losing held-out trades, sizes up after a run of winning ones, neutral until there's enough held-out history to judge."
      >
        Position sizing is currently at{' '}
        <span className={sizingFactor >= 1 ? 'text-up' : sizingFactor < 0.65 ? 'text-down' : 'text-slate-300'}>
          {Math.round(sizingFactor * 100)}%
        </span>{' '}
        of baseline, driven by recent held-out results
        {stats.heldOut.trades < MIN_HELD_OUT_FOR_SIGNAL ? ' (not enough yet to matter)' : ''}.
      </div>

      <div className="text-xs text-slate-400 mb-2">
        What the linear members currently weigh most for entries (averaged)
      </div>
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
