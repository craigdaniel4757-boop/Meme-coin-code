// Client-side OCR (Tesseract.js — free, open-source, runs via WebAssembly in the browser, no
// server upload of the image required for this step). Used purely as a convenience auto-fill
// for the ticker field: typing the ticker yourself is always the more reliable path, which is
// why the UI never blocks on OCR and always lets you override its guess.

import type { OcrExtraction } from './types';

const STOPWORDS = new Set([
  'THE', 'FOR', 'AND', 'NYSE', 'NASDAQ', 'USD', 'EUR', 'GBP', 'LOW', 'HIGH', 'OPEN', 'CLOSE',
  'VOL', 'VOLUME', 'MAX', 'ALL', 'DAY', 'ASK', 'BID', 'PM', 'AM', 'ET', 'EST', 'EDT', 'YTD',
  'INC', 'CORP', 'LTD', 'CO', 'PLC', 'PRICE', 'CHART', 'SHARE', 'SHARES', 'MKT', 'CAP', 'AVG',
  'NA', 'USA', 'ID', 'OK', 'UP', 'ADD', 'BUY', 'SELL', 'HOLD', 'RSI', 'MACD', 'SMA', 'EMA',
  'MIN', 'SEC', 'TODAY', 'NOW', 'AI', 'US', 'ATH', 'ATL',
]);

const TICKER_RE = /\$?\b[A-Z]{1,5}(?:\.[A-Z])?\b/g;
const PRICE_RE = /\b\d{1,6}(?:,\d{3})*\.\d{2}\b/g;

export function parseOcrText(rawText: string): OcrExtraction {
  const seen = new Set<string>();
  const candidateSymbols: string[] = [];

  for (const match of rawText.matchAll(TICKER_RE)) {
    const token = (match[0] ?? '').replace('$', '');
    if (token.length < 2) continue;
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    candidateSymbols.push(token);
  }

  const guessedPrices = Array.from(rawText.matchAll(PRICE_RE))
    .map((m) => Number((m[0] ?? '').replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .slice(0, 12);

  return {
    rawText,
    guessedSymbol: candidateSymbols[0] ?? null,
    candidateSymbols: candidateSymbols.slice(0, 8),
    guessedPrices,
  };
}

export async function extractChartText(
  image: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<OcrExtraction> {
  try {
    const { recognize } = await import('tesseract.js');
    const { data } = await recognize(image, 'eng', {
      logger: (msg) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          onProgress?.(Math.round(msg.progress * 100));
        }
      },
    });
    return parseOcrText(data.text ?? '');
  } catch {
    return { rawText: '', guessedSymbol: null, candidateSymbols: [], guessedPrices: [] };
  }
}
