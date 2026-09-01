import clsx from 'clsx';
import { formatPrice } from '@/lib/patterns';
import type { Level } from '@/lib/types';

export default function LevelsTable({ levels }: { levels: Level[] }) {
  if (levels.length === 0) {
    return <p className="text-sm text-muted">No clean, repeatedly-tested levels found in the visible history.</p>;
  }
  const sorted = [...levels].sort((a, b) => b.price - a.price);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-panel2 text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Level</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Touches</th>
            <th className="px-3 py-2 font-medium">Strength</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((level, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-3 py-2">
                <span
                  className={clsx(
                    'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
                    level.kind === 'resistance' ? 'bg-bear/10 text-bear' : 'bg-bull/10 text-bull',
                  )}
                >
                  {level.kind === 'resistance' ? 'Resistance' : 'Support'}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-slate-100">{formatPrice(level.price)}</td>
              <td className="px-3 py-2 text-muted">{level.touches}</td>
              <td className="px-3 py-2 text-muted">{Math.round(level.strength * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
