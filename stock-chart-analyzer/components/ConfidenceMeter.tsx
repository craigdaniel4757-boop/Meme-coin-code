import clsx from 'clsx';

export default function ConfidenceMeter({ confidence }: { confidence: number }) {
  const tone = confidence >= 65 ? 'bg-bull' : confidence >= 40 ? 'bg-neutral' : 'bg-bear';
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>Confidence</span>
        <span className="font-mono">{confidence}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
        <div
          className={clsx('h-full rounded-full transition-all', tone)}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Capped by design — no free (or paid) tool can be fully certain about future price moves.
      </p>
    </div>
  );
}
