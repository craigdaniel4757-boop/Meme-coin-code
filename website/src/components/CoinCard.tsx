import { useMemo } from 'react';
import { Coin, Position } from '../types';
import { formatPct, formatPrice } from '../lib/format';

interface Props {
  coin: Coin;
  position?: Position;
}

const SPARK_W = 120;
const SPARK_H = 36;

export function CoinCard({ coin, position }: Props) {
  const change = coin.prevPrice > 0 ? (coin.price - coin.prevPrice) / coin.prevPrice : 0;
  const windowHistory = coin.history.slice(-40);

  const path = useMemo(() => {
    const values = windowHistory;
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1e-12);
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * SPARK_W;
        const y = SPARK_H - ((v - min) / span) * SPARK_H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [windowHistory]);

  const up = change >= 0;
  const unrealizedPct = position ? (coin.price - position.entryPrice) / position.entryPrice : 0;

  return (
    <div
      className={`rounded-lg border p-3 transition ${
        position ? 'border-accent/50 bg-accent/[0.06]' : 'border-border bg-panel2/40'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: coin.color }} />
          <span className="font-semibold text-sm truncate">{coin.ticker}</span>
        </div>
        {position && (
          <span className="text-[9px] uppercase tracking-wide font-semibold text-accent bg-accent/15 rounded px-1.5 py-0.5">
            Holding
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500 truncate mb-1">{coin.name}</div>
      <div className="font-mono text-sm">{formatPrice(coin.price)}</div>
      <div className={`text-xs font-mono ${up ? 'text-up' : 'text-down'}`}>{formatPct(change)}</div>
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="w-full h-9 mt-1" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={up ? '#22d3a5' : '#f5495c'} strokeWidth="1.5" />
      </svg>
      {position && (
        <div className={`mt-1 text-[11px] font-mono ${unrealizedPct >= 0 ? 'text-up' : 'text-down'}`}>
          {formatPct(unrealizedPct)} · {Math.round(position.entryConfidence * 100)}% conf.
        </div>
      )}
    </div>
  );
}
