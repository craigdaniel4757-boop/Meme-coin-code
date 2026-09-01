// Free, no-API-key market data. Runs server-side only (called from app/api/quote/route.ts) so
// browser CORS never enters into it and no key ever ships to the client.
//
// Primary source: Stooq's public CSV export (no key, no rate-limit auth, long daily history).
// Secondary source: Yahoo Finance's public chart endpoint (no key; used for true intraday bars
// on the 1D/5D timeframes, which Stooq's free tier doesn't provide).
// Both are unauthenticated best-effort public endpoints, not paid/licensed data feeds — see the
// methodology page for what that means for reliability.
//
// Two design choices worth calling out:
// - `bars` carries far more history than the selected timeframe displays (see
//   ANALYSIS_HISTORY_DAYS) so long-period indicators (SMA200, ADX, the backtest) have a real
//   warm-up even when you're looking at a 1-month chart — exactly how a real charting platform
//   computes a 200-day average while you're zoomed into a shorter window. `displayBars` is the
//   timeframe-appropriate slice the chart actually renders.
// - For daily timeframes, both sources are fetched and cross-checked against each other (not
//   just failed-over) — a free way to catch a stale/wrong read from either one.

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
  displayCutoffDays: number | null; // null = display everything fetched (intraday has nothing extra to trim)
}

const TIMEFRAME_PLAN: Record<Timeframe, TimeframePlan> = {
  '1D': { yahooRange: '1d', yahooInterval: '5m', displayCutoffDays: null },
  '5D': { yahooRange: '5d', yahooInterval: '15m', displayCutoffDays: null },
  '1M': { yahooRange: '3mo', yahooInterval: '1d', displayCutoffDays: 35 },
  '3M': { yahooRange: '6mo', yahooInterval: '1d', displayCutoffDays: 100 },
  '6M': { yahooRange: '1y', yahooInterval: '1d', displayCutoffDays: 195 },
  '1Y': { yahooRange: '2y', yahooInterval: '1d', displayCutoffDays: 380 },
};

/** How much daily history to keep for analysis, regardless of the selected display timeframe. */
const ANALYSIS_HISTORY_DAYS = 1500; // ~6 years — generous SMA200/ADX/backtest warm-up, still a small payload
const YAHOO_DAILY_ANALYSIS_RANGE = '5y';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 60_000;

function sliceTail(bars: Bar[], cutoffDays: number | null): Bar[] {
  if (cutoffDays === null || bars.length === 0) return bars;
  const lastTime = bars[bars.length - 1]!.time;
  return bars.filter((b) => b.time >= lastTime - cutoffDays * 86400);
}

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
  const isIntraday = plan.yahooInterval.endsWith('m');
  const range = isIntraday ? plan.yahooRange : YAHOO_DAILY_ANALYSIS_RANGE;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=${plan.yahooInterval}&includePrePost=false`;

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
    const sorted = bars.sort((a, b) => a.time - b.time);
    const displayBars = isIntraday ? sorted : sliceTail(sorted, plan.displayCutoffDays);

    return {
      symbol,
      resolvedSymbol: result.meta?.symbol ?? symbol,
      source: 'yahoo',
      interval: plan.yahooInterval,
      bars: sorted,
      displayBars,
      quality: (isIntraday ? 'real-intraday' : 'real-daily') as DataQuality,
      currency: result.meta?.currency,
      crossValidated: null,
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
    const rawBars = await fetchStooqOnce(attempt);
    if (!rawBars) continue;
    const sorted = rawBars.sort((a, b) => a.time - b.time);
    const bars = sliceTail(sorted, ANALYSIS_HISTORY_DAYS);
    if (bars.length === 0) continue;
    const displayBars = sliceTail(bars, plan.displayCutoffDays);
    return {
      symbol,
      resolvedSymbol: attempt.toUpperCase(),
      source: 'stooq',
      interval: '1d',
      bars,
      displayBars,
      quality: 'real-daily',
      crossValidated: null,
    };
  }
  return null;
}

function crossValidate(primary: QuoteSeries, secondary: QuoteSeries | null): QuoteSeries['crossValidated'] {
  if (!secondary) return null;
  const p = primary.bars[primary.bars.length - 1];
  const s = secondary.bars[secondary.bars.length - 1];
  if (!p || !s || p.close === 0) return null;
  const deltaPct = Math.abs((s.close - p.close) / p.close) * 100;
  return { agrees: deltaPct <= 2, deltaPct, otherSource: secondary.source };
}

export interface QuoteFetchOutcome {
  series: QuoteSeries | null;
  attemptedSources: string[];
  error: string | null;
}

const cache = new Map<string, { expires: number; outcome: QuoteFetchOutcome }>();

function notFoundMessage(symbol: string): string {
  return `Couldn’t find market data for "${symbol}" from either free source. Double-check the ticker, or continue with screenshot-only analysis.`;
}

/**
 * Intraday timeframes (1D/5D) use Yahoo only, falling back to Stooq's daily bars if Yahoo is
 * unavailable — Stooq's free tier has no intraday granularity, so there's nothing to
 * cross-validate there. Every other timeframe fetches Stooq and Yahoo concurrently: whichever
 * responds becomes the primary source, and if both respond their latest closes are compared as
 * a free data-quality check (see `crossValidated` on the result).
 */
export async function getQuoteSeries(symbolRaw: string, timeframe: Timeframe): Promise<QuoteFetchOutcome> {
  const symbol = normalizeSymbol(symbolRaw);
  if (!isValidSymbol(symbol)) {
    return { series: null, attemptedSources: [], error: 'That doesn’t look like a valid ticker symbol.' };
  }

  const cacheKey = `${symbol}:${timeframe}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.outcome;

  const preferIntraday = timeframe === '1D' || timeframe === '5D';
  const attempted: string[] = [];
  let outcome: QuoteFetchOutcome;

  if (preferIntraday) {
    attempted.push('yahoo');
    const yahoo = await fetchYahoo(symbol, timeframe);
    if (yahoo) {
      outcome = { series: yahoo, attemptedSources: attempted, error: null };
    } else {
      attempted.push('stooq');
      const stooq = await fetchStooq(symbol, timeframe);
      outcome = stooq
        ? { series: stooq, attemptedSources: attempted, error: null }
        : { series: null, attemptedSources: attempted, error: notFoundMessage(symbol) };
    }
  } else {
    attempted.push('stooq', 'yahoo');
    const [stooq, yahoo] = await Promise.all([fetchStooq(symbol, timeframe), fetchYahoo(symbol, timeframe)]);
    const primary = stooq ?? yahoo;
    if (primary) {
      const secondary = primary === stooq ? yahoo : stooq;
      outcome = {
        series: { ...primary, crossValidated: crossValidate(primary, secondary) },
        attemptedSources: attempted,
        error: null,
      };
    } else {
      outcome = { series: null, attemptedSources: attempted, error: notFoundMessage(symbol) };
    }
  }

  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, outcome });
  return outcome;
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
