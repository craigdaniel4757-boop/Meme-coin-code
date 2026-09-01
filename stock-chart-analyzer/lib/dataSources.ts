// Free, no-API-key market data. Runs server-side only (called from app/api/quote/route.ts) so
// browser CORS never enters into it and no key ever ships to the client.
//
// Primary source: Stooq's public CSV export (no key, no rate-limit auth, long daily history).
// Secondary source: Yahoo Finance's public chart endpoint (no key; used for true intraday bars
// on the 1D/5D timeframes, which Stooq's free tier doesn't provide).
// Both are unauthenticated best-effort public endpoints, not paid/licensed data feeds — see the
// methodology page for what that means for reliability.

import type { Bar, DataQuality, QuoteSeries, Timeframe } from './types';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}

interface TimeframePlan {
  yahooRange: string;
  yahooInterval: string;
  stooqCutoffDays: number | null; // null = use full history returned
}

const TIMEFRAME_PLAN: Record<Timeframe, TimeframePlan> = {
  '1D': { yahooRange: '1d', yahooInterval: '5m', stooqCutoffDays: 5 },
  '5D': { yahooRange: '5d', yahooInterval: '15m', stooqCutoffDays: 10 },
  '1M': { yahooRange: '3mo', yahooInterval: '1d', stooqCutoffDays: 35 },
  '3M': { yahooRange: '6mo', yahooInterval: '1d', stooqCutoffDays: 100 },
  '6M': { yahooRange: '1y', yahooInterval: '1d', stooqCutoffDays: 195 },
  '1Y': { yahooRange: '2y', yahooInterval: '1d', stooqCutoffDays: 380 },
};

const FETCH_TIMEOUT_MS = 8000;

async function timedFetch(url: string, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json,text/csv,*/*',
        ...headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(id);
  }
}

async function fetchYahoo(symbol: string, timeframe: Timeframe): Promise<QuoteSeries | null> {
  const plan = TIMEFRAME_PLAN[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${plan.yahooRange}&interval=${plan.yahooInterval}&includePrePost=false`;

  try {
    const res = await timedFetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const result = json?.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) return null;

    const q = result.indicators.quote[0]!;
    const bars: Bar[] = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const open = q.open?.[i];
      const high = q.high?.[i];
      const low = q.low?.[i];
      const close = q.close?.[i];
      if (
        open === null ||
        open === undefined ||
        high === null ||
        high === undefined ||
        low === null ||
        low === undefined ||
        close === null ||
        close === undefined
      ) {
        continue;
      }
      bars.push({
        time: result.timestamp[i]!,
        open,
        high,
        low,
        close,
        volume: q.volume?.[i] ?? undefined,
      });
    }
    if (bars.length === 0) return null;

    const isIntraday = plan.yahooInterval.endsWith('m');
    return {
      symbol,
      resolvedSymbol: result.meta?.symbol ?? symbol,
      source: 'yahoo',
      interval: plan.yahooInterval,
      bars,
      quality: (isIntraday ? 'real-intraday' : 'real-daily') as DataQuality,
      currency: result.meta?.currency,
    };
  } catch {
    return null;
  }
}

async function fetchStooqOnce(symbol: string): Promise<Bar[] | null> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const res = await timedFetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text.trim().toUpperCase().startsWith('N/D') || !text.includes(',')) return null;

  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const bars: Bar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(',');
    if (parts.length < 6) continue;
    const [dateStr, openStr, highStr, lowStr, closeStr, volumeStr] = parts;
    const time = Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
    const open = Number(openStr);
    const high = Number(highStr);
    const low = Number(lowStr);
    const close = Number(closeStr);
    const volume = Number(volumeStr);
    if (![time, open, high, low, close].every((n) => Number.isFinite(n))) continue;
    bars.push({ time, open, high, low, close, volume: Number.isFinite(volume) ? volume : undefined });
  }
  return bars.length > 0 ? bars : null;
}

async function fetchStooq(symbol: string, timeframe: Timeframe): Promise<QuoteSeries | null> {
  const plan = TIMEFRAME_PLAN[timeframe];
  const attempts = [symbol.toLowerCase(), `${symbol.toLowerCase()}.us`];

  for (const attempt of attempts) {
    const bars = await fetchStooqOnce(attempt);
    if (!bars) continue;
    const sorted = bars.sort((a, b) => a.time - b.time);
    const cutoffDays = plan.stooqCutoffDays;
    const sliced = cutoffDays
      ? sorted.filter((b) => b.time >= sorted[sorted.length - 1]!.time - cutoffDays * 86400)
      : sorted;
    if (sliced.length === 0) continue;
    return {
      symbol,
      resolvedSymbol: attempt.toUpperCase(),
      source: 'stooq',
      interval: '1d',
      bars: sliced,
      quality: 'real-daily',
    };
  }
  return null;
}

export interface QuoteFetchOutcome {
  series: QuoteSeries | null;
  attemptedSources: string[];
  error: string | null;
}

/**
 * Tries the source best suited to the requested timeframe first, then falls back to the other.
 * Intraday timeframes (1D/5D) prefer Yahoo (Stooq's free tier has no intraday); everything else
 * prefers Stooq (longer, steadier daily history with no key and generous reliability).
 */
export async function getQuoteSeries(symbolRaw: string, timeframe: Timeframe): Promise<QuoteFetchOutcome> {
  const symbol = normalizeSymbol(symbolRaw);
  if (!isValidSymbol(symbol)) {
    return { series: null, attemptedSources: [], error: 'That doesn’t look like a valid ticker symbol.' };
  }

  const preferIntraday = timeframe === '1D' || timeframe === '5D';
  const attempted: string[] = [];

  if (preferIntraday) {
    attempted.push('yahoo');
    const yahoo = await fetchYahoo(symbol, timeframe);
    if (yahoo) return { series: yahoo, attemptedSources: attempted, error: null };
    attempted.push('stooq');
    const stooq = await fetchStooq(symbol, timeframe);
    if (stooq) return { series: stooq, attemptedSources: attempted, error: null };
  } else {
    attempted.push('stooq');
    const stooq = await fetchStooq(symbol, timeframe);
    if (stooq) return { series: stooq, attemptedSources: attempted, error: null };
    attempted.push('yahoo');
    const yahoo = await fetchYahoo(symbol, timeframe);
    if (yahoo) return { series: yahoo, attemptedSources: attempted, error: null };
  }

  return {
    series: null,
    attemptedSources: attempted,
    error: `Couldn’t find market data for "${symbol}" from either free source. Double-check the ticker, or continue with screenshot-only analysis.`,
  };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; currency?: string };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: unknown;
  };
}
