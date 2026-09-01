import clsx from 'clsx';
import type { Signal } from '@/lib/types';

const CONFIG: Record<Signal, { label: string; className: string }> = {
  'strong-bullish': { label: 'Strong Bullish', className: 'bg-bull/15 text-bull border-bull/40' },
  bullish: { label: 'Bullish', className: 'bg-bull/10 text-bull border-bull/30' },
  neutral: { label: 'Neutral', className: 'bg-neutral/10 text-neutral border-neutral/30' },
  bearish: { label: 'Bearish', className: 'bg-bear/10 text-bear border-bear/30' },
  'strong-bearish': { label: 'Strong Bearish', className: 'bg-bear/15 text-bear border-bear/40' },
};

export default function SignalBadge({ signal, score }: { signal: Signal; score: number }) {
  const cfg = CONFIG[signal];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold tracking-wide',
        cfg.className,
      )}
    >
      {cfg.label}
      <span className="font-mono text-xs opacity-70">
        {score > 0 ? '+' : ''}
        {score}
      </span>
    </span>
  );
}
