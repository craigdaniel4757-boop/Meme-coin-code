import { formatPrice } from '@/lib/patterns';
import type { IndicatorSnapshot, MomentumReading, VolatilityReading } from '@/lib/types';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bull' | 'bear' | 'neutral' }) {
  const toneClass = tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : tone === 'neutral' ? 'text-neutral' : 'text-slate-100';
  return (
    <div className="rounded-lg border border-border bg-panel2 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function IndicatorGrid({
  indicators,
  momentum,
  volatility,
}: {
  indicators: IndicatorSnapshot;
  momentum: MomentumReading;
  volatility: VolatilityReading;
}) {
  const rsiTone = momentum.rsiState === 'overbought' ? 'bear' : momentum.rsiState === 'oversold' ? 'bull' : undefined;
  const stochTone = momentum.stochState === 'overbought' ? 'bear' : momentum.stochState === 'oversold' ? 'bull' : undefined;
  const macdTone = (indicators.macd?.histogram ?? 0) > 0 ? 'bull' : (indicators.macd?.histogram ?? 0) < 0 ? 'bear' : undefined;
  const obvTone = momentum.obvTrend === 'rising' ? 'bull' : momentum.obvTrend === 'falling' ? 'bear' : undefined;
  const vwapTone = indicators.vwap !== null ? (indicators.lastClose >= indicators.vwap ? 'bull' : 'bear') : undefined;
  const adxTone = indicators.dmi && indicators.dmi.adx >= 25 ? 'neutral' : undefined;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Last close" value={formatPrice(indicators.lastClose)} />
      <Stat label="RSI (14)" value={indicators.rsi14 !== null ? indicators.rsi14.toFixed(1) : '—'} tone={rsiTone} />
      <Stat label="Stochastic %K" value={indicators.stochastic ? indicators.stochastic.k.toFixed(1) : '—'} tone={stochTone} />
      <Stat
        label="MACD hist."
        value={indicators.macd ? indicators.macd.histogram.toFixed(3) : '—'}
        tone={macdTone}
      />
      <Stat label="ADX (14)" value={indicators.dmi ? indicators.dmi.adx.toFixed(1) : '—'} tone={adxTone} />
      <Stat label="OBV trend" value={momentum.obvTrend !== 'unknown' ? momentum.obvTrend : '—'} tone={obvTone} />
      <Stat label="VWAP" value={indicators.vwap !== null ? formatPrice(indicators.vwap) : '—'} tone={vwapTone} />
      <Stat label="ATR (14)" value={volatility.atrPct !== null ? `${volatility.atrPct.toFixed(1)}%` : '—'} />
      <Stat label="SMA 20" value={indicators.sma20 !== null ? formatPrice(indicators.sma20) : '—'} />
      <Stat label="SMA 50" value={indicators.sma50 !== null ? formatPrice(indicators.sma50) : '—'} />
      <Stat label="SMA 200" value={indicators.sma200 !== null ? formatPrice(indicators.sma200) : '—'} />
      <Stat
        label="Bollinger width"
        value={volatility.bollingerWidthPct !== null ? `${volatility.bollingerWidthPct.toFixed(1)}%` : '—'}
        tone={volatility.squeeze ? 'neutral' : undefined}
      />
    </div>
  );
}
