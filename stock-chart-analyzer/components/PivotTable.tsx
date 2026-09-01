import { formatPrice } from '@/lib/patterns';
import type { PivotLevels } from '@/lib/types';

export default function PivotTable({ pivots }: { pivots: PivotLevels }) {
  const rows: Array<{ label: string; value: number; kind: 'resistance' | 'pivot' | 'support' }> = [
    { label: 'R3', value: pivots.r3, kind: 'resistance' },
    { label: 'R2', value: pivots.r2, kind: 'resistance' },
    { label: 'R1', value: pivots.r1, kind: 'resistance' },
    { label: 'PP', value: pivots.pp, kind: 'pivot' },
    { label: 'S1', value: pivots.s1, kind: 'support' },
    { label: 'S2', value: pivots.s2, kind: 'support' },
    { label: 'S3', value: pivots.s3, kind: 'support' },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border first:border-t-0">
              <td
                className={`px-3 py-1.5 text-xs font-medium ${
                  row.kind === 'resistance' ? 'text-bear' : row.kind === 'support' ? 'text-bull' : 'text-neutral'
                }`}
              >
                {row.label}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-100">{formatPrice(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border bg-panel2 px-3 py-1.5 text-[10px] text-muted">
        Classic floor pivots from the last completed session — a day-trading reference distinct
        from the swing-based levels above.
      </p>
    </div>
  );
}
