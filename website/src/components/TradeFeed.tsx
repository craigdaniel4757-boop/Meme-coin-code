import { FeedEvent } from '../types';
import { formatPct, formatUsd, timeAgo } from '../lib/format';

interface Props {
  events: FeedEvent[];
}

function ResetRow({ event }: { event: FeedEvent }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[10px] text-slate-500 uppercase tracking-wide">
      <div className="flex-1 border-t border-dashed border-border" />
      <span>{event.reasoning || 'Portfolio reset'}</span>
      <div className="flex-1 border-t border-dashed border-border" />
    </div>
  );
}

export function TradeFeed({ events }: Props) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4 flex flex-col min-h-0">
      <div className="text-sm text-slate-400 mb-3">Live activity</div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[520px] pr-1">
        {events.length === 0 && (
          <div className="text-sm text-slate-500 py-8 text-center">Waiting for the first signal…</div>
        )}
        {events.map((e) =>
          e.kind === 'reset' ? (
            <ResetRow key={e.id} event={e} />
          ) : (
            <div
              key={e.id}
              className={`rounded-lg border px-3 py-2 text-xs ${
                e.kind === 'close'
                  ? e.win
                    ? 'border-up/30 bg-up/5'
                    : 'border-down/30 bg-down/5'
                  : 'border-border bg-panel2/50'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="flex items-center gap-1.5">
                  <span className={`font-semibold ${e.kind === 'open' ? 'text-accent2' : e.win ? 'text-up' : 'text-down'}`}>
                    {e.kind === 'open' ? `BUY ${e.ticker}` : `SELL ${e.ticker}`}
                  </span>
                  {e.isEval && (
                    <span
                      className="text-[9px] uppercase tracking-wide font-semibold text-accent2 bg-accent2/15 rounded px-1 py-0.5"
                      title="Held out from learning -- an unbiased test of the current model."
                    >
                      Eval
                    </span>
                  )}
                </span>
                <span className="text-slate-500">{timeAgo(e.time)}</span>
              </div>
              <div className="text-slate-400">{e.reasoning}</div>
              {e.kind === 'close' && (
                <div className={`font-mono mt-0.5 ${e.win ? 'text-up' : 'text-down'}`}>
                  {formatUsd(e.pnlUsd ?? 0)} ({formatPct(e.pnlPct ?? 0)})
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
