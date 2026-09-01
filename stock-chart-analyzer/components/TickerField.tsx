'use client';

export default function TickerField({
  value,
  onChange,
  candidates,
  ocrStatus,
}: {
  value: string;
  onChange: (v: string) => void;
  candidates: string[];
  ocrStatus: 'idle' | 'reading' | 'done';
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
        Ticker symbol <span className="normal-case text-muted/70">(optional, but recommended)</span>
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 12))}
        placeholder="e.g. AAPL"
        spellCheck={false}
        autoCapitalize="characters"
        className="w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-slate-100 placeholder:text-muted/60 placeholder:tracking-normal focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="mt-1.5 min-h-[18px] text-[11px] text-muted">
        {ocrStatus === 'reading' && <span className="animate-pulse-soft">Scanning screenshot for a ticker…</span>}
        {ocrStatus === 'done' && candidates.length > 0 && (
          <span>
            Detected in screenshot:{' '}
            {candidates.slice(0, 4).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                className="mr-1 rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-accent hover:border-accent"
              >
                {c}
              </button>
            ))}
          </span>
        )}
        {ocrStatus === 'done' && candidates.length === 0 && (
          <span>Couldn&apos;t confidently read a ticker from the screenshot — type it in for a data-backed analysis.</span>
        )}
        {!value && ocrStatus === 'idle' && (
          <span>Without a ticker, analysis falls back to a rough visual read of the screenshot only.</span>
        )}
      </div>
    </div>
  );
}
