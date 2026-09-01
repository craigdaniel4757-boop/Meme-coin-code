import clsx from 'clsx';
import SignalBadge from './SignalBadge';
import ConfidenceMeter from './ConfidenceMeter';
import IndicatorGrid from './IndicatorGrid';
import LevelsTable from './LevelsTable';
import PlanSteps from './PlanSteps';
import PriceChart from './PriceChart';
import TrackRecordPanel from './TrackRecordPanel';
import Disclaimer from './Disclaimer';
import type { AnalysisResult, Plan, QuoteSeries } from '@/lib/types';

export default function ResultsView({
  result,
  plan,
  quoteSeries,
  symbol,
}: {
  result: AnalysisResult;
  plan: Plan;
  quoteSeries: QuoteSeries | null;
  symbol: string | null;
}) {
  const crossCheckDisagrees =
    quoteSeries &&
    result.imageOnly &&
    ((result.trend.direction === 'uptrend' && result.imageOnly.slopeDirection === 'down') ||
      (result.trend.direction === 'downtrend' && result.imageOnly.slopeDirection === 'up'));

  return (
    <div className="space-y-6">
      <div
        className={clsx(
          'rounded-lg border px-3.5 py-2.5 text-xs',
          quoteSeries
            ? 'border-bull/30 bg-bull/5 text-bull'
            : 'border-neutral/30 bg-neutral/5 text-neutral',
        )}
      >
        {quoteSeries ? (
          <>
            Live data via <span className="font-medium capitalize">{quoteSeries.source}</span> —{' '}
            {result.sampleSize} {quoteSeries.interval} bars for{' '}
            <span className="font-mono">{quoteSeries.resolvedSymbol}</span>.
          </>
        ) : (
          <>Screenshot-only visual estimate — no verified price data was used. Add a ticker symbol for a real, data-backed analysis.</>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-panel p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <SignalBadge signal={result.signal} score={result.score} />
          {symbol && <span className="font-mono text-sm text-muted">{symbol}</span>}
        </div>
        <ConfidenceMeter confidence={result.confidence} />
      </div>

      {quoteSeries && (
        <div className="rounded-xl border border-border bg-panel p-3 shadow-panel">
          <PriceChart bars={quoteSeries.bars} levels={result.levels} />
          <p className="mt-2 px-1 text-[11px] text-muted">
            Yellow = SMA 20 · Blue = SMA 50 · Purple = SMA 200 · Cyan dotted = VWAP · dashed lines
            = detected support/resistance zones.
          </p>
        </div>
      )}

      {crossCheckDisagrees && (
        <div className="rounded-lg border border-neutral/30 bg-neutral/5 px-3.5 py-2.5 text-xs text-neutral">
          Heads up: the visual trajectory of your uploaded screenshot leans{' '}
          {result.imageOnly!.slopeDirection} while the computed trend from real data leans{' '}
          {result.trend.direction}. This can happen if the screenshot shows a different date
          range or symbol than what was fetched — double-check the ticker and timeframe above.
        </div>
      )}

      {result.indicators && (
        <div className="rounded-xl border border-border bg-panel p-5 shadow-panel">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Indicators</h3>
          <IndicatorGrid indicators={result.indicators} momentum={result.momentum} volatility={result.volatility} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-panel p-5 shadow-panel">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Support &amp; resistance</h3>
          <LevelsTable levels={result.levels} />
        </div>
        <div className="rounded-xl border border-border bg-panel p-5 shadow-panel">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Pattern signals</h3>
          {result.patterns.length === 0 ? (
            <p className="text-sm text-muted">No high-confidence pattern detected right now.</p>
          ) : (
            <ul className="space-y-2">
              {result.patterns.map((p) => (
                <li key={p.id} className="rounded-lg border border-border bg-panel2 p-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={clsx(
                        'text-xs font-semibold',
                        p.bias === 'bullish' ? 'text-bull' : p.bias === 'bearish' ? 'text-bear' : 'text-neutral',
                      )}
                    >
                      {p.label}
                    </span>
                    <span className="text-[10px] text-muted">{Math.round(p.confidence * 100)}% conf.</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{p.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(result.relativeStrength || result.backtest) && (
        <div className="rounded-xl border border-border bg-panel p-5 shadow-panel">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Track record &amp; context</h3>
          <TrackRecordPanel relativeStrength={result.relativeStrength} backtest={result.backtest} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-panel p-5 shadow-panel">
        <PlanSteps plan={plan} />
      </div>

      <Disclaimer />
    </div>
  );
}
