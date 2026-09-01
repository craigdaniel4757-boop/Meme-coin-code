'use client';

import clsx from 'clsx';
import type { Horizon } from '@/lib/types';

export default function HorizonToggle({
  value,
  onChange,
}: {
  value: Horizon;
  onChange: (h: Horizon) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
        Goal
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onChange('short')}
          aria-pressed={value === 'short'}
          className={clsx(
            'rounded-lg border px-3 py-2.5 text-left transition',
            value === 'short'
              ? 'border-accent bg-accent/15'
              : 'border-border bg-panel2 hover:border-slate-500',
          )}
        >
          <div className={clsx('text-sm font-semibold', value === 'short' ? 'text-accent' : 'text-slate-200')}>
            Short-term
          </div>
          <div className="text-[11px] text-muted">Days to a few weeks</div>
        </button>
        <button
          type="button"
          onClick={() => onChange('long')}
          aria-pressed={value === 'long'}
          className={clsx(
            'rounded-lg border px-3 py-2.5 text-left transition',
            value === 'long'
              ? 'border-accent bg-accent/15'
              : 'border-border bg-panel2 hover:border-slate-500',
          )}
        >
          <div className={clsx('text-sm font-semibold', value === 'long' ? 'text-accent' : 'text-slate-200')}>
            Long-term
          </div>
          <div className="text-[11px] text-muted">Months and beyond</div>
        </button>
      </div>
    </div>
  );
}
