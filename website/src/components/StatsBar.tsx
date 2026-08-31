import { Stats } from '../lib/stats';
import { formatPct, formatUsd } from '../lib/format';

interface Props {
  stats: Stats;
  totalFeesPaid: number;
  openPositions: number;
  maxPositions: number;
}

export function StatsBar({ stats, totalFeesPaid, openPositions, maxPositions }: Props) {
  const items = [
    { label: 'Open positions', value: `${openPositions}/${maxPositions}` },
    { label: 'Closed trades', value: `${stats.totalTrades}` },
    { label: 'Win rate', value: stats.totalTrades ? formatPct(stats.winRate, false) : '—' },
    { label: 'Best trade', value: stats.totalTrades ? formatPct(stats.bestTrade) : '—' },
    { label: 'Worst trade', value: stats.totalTrades ? formatPct(stats.worstTrade) : '—' },
    { label: 'Avg P&L / trade', value: stats.totalTrades ? formatPct(stats.avgPnlPct) : '—' },
    { label: 'Fees paid', value: formatUsd(totalFeesPaid) },
  ];

  return (
    <div className="rounded-xl border border-border bg-panel p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">{item.label}</div>
          <div className="font-mono text-sm mt-0.5">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
