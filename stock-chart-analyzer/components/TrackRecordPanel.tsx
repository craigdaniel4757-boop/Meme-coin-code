import clsx from 'clsx';
import type { BacktestReading, BacktestSignalStat, RelativeStrengthReading } from '@/lib/types';

function BacktestRow({ stat }: { stat: BacktestSignalStat }) {
  if (stat.occurrences < 3 || stat.hitRatePct === null || stat.avgForwardReturnPct === null) {
    return (
      <div className="rounded-lg border border-border bg-panel2 p-3">
        <div className="text-xs font-medium text-slate-200">{stat.label}</div>
        <p className="mt-1 text-xs text-muted">
          Only {stat.occurrences} occurrence{stat.occurrences === 1 ? '' : 's'} in the visible history — not enough
          to report a track record.
        </p>
      </div>
    );
  }
  const positive = stat.avgForwardReturnPct >= 0;
  return (
    <div className="rounded-lg border border-border bg-panel2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-200">{stat.label}</div>
        <span className="text-[10px] text-muted">{stat.occurrences} occurrences</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-3">
        <span className={clsx('font-mono text-lg font-semibold', positive ? 'text-bull' : 'text-bear')}>
          {stat.hitRatePct.toFixed(0)}%
        </span>
        <span className="text-xs text-muted">
          hit rate over {stat.horizon} bars, avg {positive ? '+' : ''}
          {stat.avgForwardReturnPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default function TrackRecordPanel({
  relativeStrength,
  backtest,
}: {
  relativeStrength: RelativeStrengthReading | null;
  backtest: BacktestReading | null;
}) {
  return (
    <div className="space-y-4">
      {relativeStrength && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Relative strength vs. {relativeStrength.benchmarkSymbol}
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-panel2 p-3">
            <div>
              <div className="text-[10px] text-muted">This symbol</div>
              <div className={clsx('font-mono text-sm font-semibold', relativeStrength.symbolReturnPct >= 0 ? 'text-bull' : 'text-bear')}>
                {relativeStrength.symbolReturnPct >= 0 ? '+' : ''}
                {relativeStrength.symbolReturnPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted">{relativeStrength.benchmarkSymbol}</div>
              <div className={clsx('font-mono text-sm font-semibold', relativeStrength.benchmarkReturnPct >= 0 ? 'text-bull' : 'text-bear')}>
                {relativeStrength.benchmarkReturnPct >= 0 ? '+' : ''}
                {relativeStrength.benchmarkReturnPct.toFixed(1)}%
              </div>
            </div>
            <div className="ml-auto">
              <span
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                  relativeStrength.outperforming ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear',
                )}
              >
                {relativeStrength.outperforming ? 'Outperforming' : 'Underperforming'} by{' '}
                {Math.abs(relativeStrength.relativeStrengthPct).toFixed(1)} pts
              </span>
            </div>
          </div>
        </div>
      )}

      {backtest &&
        (() => {
          const stats = [
            backtest.rsiOversoldBounce,
            backtest.rsiOverboughtFade,
            backtest.maCrossBullish,
            backtest.maCrossBearish,
            backtest.macdCrossBullish,
            backtest.macdCrossBearish,
          ].filter((s) => s.occurrences > 0);
          if (stats.length === 0) return null;
          return (
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                Historical signal check (this exact chart)
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {stats.map((stat) => (
                  <BacktestRow key={stat.label} stat={stat} />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Small, mechanical replay of each rule over this chart's own history — not a
                recommendation, and a small sample is not a reliable edge.
              </p>
            </div>
          );
        })()}

      {!relativeStrength && !backtest && (
        <p className="text-sm text-muted">Add a ticker symbol to unlock relative-strength and track-record context.</p>
      )}
    </div>
  );
}
