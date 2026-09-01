import { NextRequest, NextResponse } from 'next/server';
import { getQuoteSeries } from '@/lib/dataSources';
import type { Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_TIMEFRAMES: Timeframe[] = ['1D', '5D', '1M', '3M', '6M', '1Y'];

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? '';
  const timeframeParam = request.nextUrl.searchParams.get('timeframe') ?? '';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing "symbol" query parameter.' }, { status: 400 });
  }
  if (!VALID_TIMEFRAMES.includes(timeframeParam as Timeframe)) {
    return NextResponse.json(
      { error: `"timeframe" must be one of ${VALID_TIMEFRAMES.join(', ')}.` },
      { status: 400 },
    );
  }

  const outcome = await getQuoteSeries(symbol, timeframeParam as Timeframe);

  if (!outcome.series) {
    return NextResponse.json(
      { error: outcome.error ?? 'Unknown data-fetch error.', attemptedSources: outcome.attemptedSources },
      { status: 404 },
    );
  }

  return NextResponse.json({ series: outcome.series, attemptedSources: outcome.attemptedSources });
}
