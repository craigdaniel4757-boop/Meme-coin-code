'use client';

import clsx from 'clsx';
import type { Timeframe } from '@/lib/types';

const OPTIONS: Timeframe[] = ['1D', '5D', '1M', '3M', '6M', '1Y'];

export default function TimeframeSelect({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
        Chart timeframe
      </label>
      <div className="grid grid-cols-6 gap-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={value === opt}
            className={clsx(
              'rounded-lg border px-2 py-2 text-sm font-medium transition',
              value === opt
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-panel2 text-muted hover:border-slate-500 hover:text-slate-200',
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
