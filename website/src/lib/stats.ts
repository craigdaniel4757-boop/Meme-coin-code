import { FeedEvent } from '../types';

export interface Stats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  avgPnlPct: number;
}

export function computeStats(events: FeedEvent[]): Stats {
  const closes = events.filter((e) => e.kind === 'close');
  const wins = closes.filter((e) => e.win).length;
  const losses = closes.length - wins;
  const best = closes.reduce((m, e) => Math.max(m, e.pnlPct ?? 0), 0);
  const worst = closes.reduce((m, e) => Math.min(m, e.pnlPct ?? 0), 0);
  const avg = closes.length ? closes.reduce((s, e) => s + (e.pnlPct ?? 0), 0) / closes.length : 0;

  return {
    totalTrades: closes.length,
    wins,
    losses,
    winRate: closes.length ? wins / closes.length : 0,
    bestTrade: best,
    worstTrade: worst,
    avgPnlPct: avg,
  };
}
