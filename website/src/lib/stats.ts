import { FeedEvent } from '../types';

export interface SplitStats {
  trades: number;
  wins: number;
  winRate: number;
}

export interface Stats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  avgPnlPct: number;
  // Trades whose outcome fed a learning update -- the model was fit to
  // these, so a high win rate here isn't proof the model is actually good.
  training: SplitStats;
  // Trades deliberately excluded from learning (see EVAL_FRACTION in
  // lib/simulation.ts) -- an unbiased read on what the current policy
  // actually achieves, since it never got to adjust itself around them.
  heldOut: SplitStats;
}

function splitStats(closes: FeedEvent[]): SplitStats {
  const wins = closes.filter((e) => e.win).length;
  return { trades: closes.length, wins, winRate: closes.length ? wins / closes.length : 0 };
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
    training: splitStats(closes.filter((e) => !e.isEval)),
    heldOut: splitStats(closes.filter((e) => e.isEval)),
  };
}
