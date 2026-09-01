// Turns an AnalysisResult into the ordered, plain-English walkthrough shown in the UI. Every
// sentence here traces back to a field already computed in lib/scorer.ts / lib/patterns.ts —
// this module only phrases and sequences those numbers, it never invents new signals.
//
// This is general technical-analysis education generated from public price data, not
// personalized investment advice, and it says so in the plan itself (see closing step).

import { formatPrice } from './patterns';
import { nearestLevel } from './swings';
import type { AnalysisResult, BacktestSignalStat, Horizon, Plan, PlanStep, Signal, Timeframe } from './types';

function describeBacktestStat(stat: BacktestSignalStat, favorableDirectionWord: 'higher' | 'lower'): string | null {
  if (stat.occurrences < 3 || stat.hitRatePct === null || stat.avgForwardReturnPct === null) return null;
  return `"${stat.label}" fired ${stat.occurrences} times in the visible history, and price was ${favorableDirectionWord} ${stat.horizon} bars later ${stat.hitRatePct.toFixed(0)}% of the time (average ${stat.avgForwardReturnPct >= 0 ? '+' : ''}${stat.avgForwardReturnPct.toFixed(1)}% in the signal's favor). Small sample — a pattern, not a promise.`;
}

const SIGNAL_LABEL: Record<Signal, string> = {
  'strong-bullish': 'Strong bullish lean',
  bullish: 'Bullish lean',
  neutral: 'No clear edge — neutral',
  bearish: 'Bearish lean',
  'strong-bearish': 'Strong bearish lean',
};

export function generatePlan(
  result: AnalysisResult,
  horizon: Horizon,
  timeframe: Timeframe,
  symbol: string | null,
): Plan {
  const steps: PlanStep[] = [];
  const label = symbol ? symbol.toUpperCase() : 'This chart';

  steps.push(buildContextStep(result, timeframe, symbol));
  steps.push(buildMomentumStep(result));
  steps.push(buildLevelsStep(result));
  steps.push(buildPatternStep(result));
  steps.push(buildTrackRecordStep(result));
  steps.push(buildApproachStep(result, horizon));
  steps.push(buildRiskStep(result, horizon));

  const invalidation = buildInvalidation(result, horizon);
  steps.push({
    title: 'What would change this read',
    body: invalidation,
  });

  const headline = `${label}: ${SIGNAL_LABEL[result.signal]} (score ${result.score > 0 ? '+' : ''}${result.score}/100, confidence ${result.confidence}%) for a ${horizon === 'short' ? 'short-term' : 'long-term'} horizon.`;

  return { headline, steps, invalidation, horizon };
}

function buildContextStep(result: AnalysisResult, timeframe: Timeframe, symbol: string | null): PlanStep {
  const parts: string[] = [];
  if (result.dataQuality === 'image-only') {
    parts.push(
      `No verified price data was used — this read comes only from analyzing the screenshot's pixels (${timeframe} chart${symbol ? ` for ${symbol}` : ''}). Treat it as a rough visual impression, not a data-backed read. Type in the ticker symbol above to unlock real indicator-based analysis.`,
    );
  } else {
    parts.push(
      `Based on ${result.sampleSize} ${result.dataQuality === 'real-intraday' ? 'intraday' : 'daily'} bars of real, freely-sourced price history for the ${timeframe} window.`,
    );
    parts.push(...result.trend.notes);
  }
  const directionWord =
    result.trend.direction === 'uptrend' ? 'an uptrend' : result.trend.direction === 'downtrend' ? 'a downtrend' : 'a sideways / range-bound structure';
  parts.push(`Overall structure reads as ${directionWord} (strength ${Math.round(result.trend.strength * 100)}%).`);

  if (result.periodHighLow) {
    const phl = result.periodHighLow;
    if (phl.nearHigh) {
      parts.push(`Price is within 3% of its high for this window (${formatPrice(phl.periodHigh)}).`);
    } else if (phl.nearLow) {
      parts.push(`Price is within 3% of its low for this window (${formatPrice(phl.periodLow)}).`);
    } else {
      parts.push(
        `Price sits ${Math.abs(phl.pctFromHigh).toFixed(1)}% below its window high (${formatPrice(phl.periodHigh)}) and ${phl.pctFromLow.toFixed(1)}% above its window low (${formatPrice(phl.periodLow)}).`,
      );
    }
  }

  if (result.higherTimeframeContext) {
    const htf = result.higherTimeframeContext;
    parts.push(
      `Daily-timeframe trend context: ${htf.direction} — ${htf.agrees ? 'this agrees with' : 'this conflicts with'} the intraday read above, which ${htf.agrees ? 'adds' : 'reduces'} conviction.`,
    );
  }

  return { title: 'Trend context', body: parts.join(' ') };
}

function buildMomentumStep(result: AnalysisResult): PlanStep {
  if (result.dataQuality === 'image-only') {
    return {
      title: 'Momentum check',
      body: 'Momentum indicators (RSI, MACD) need real price history and can’t be computed from a screenshot alone — add a ticker symbol to see them.',
    };
  }
  const notes = result.momentum.notes.length
    ? result.momentum.notes.join(' ')
    : 'Momentum readings are mixed with no strong tilt either way right now.';
  return { title: 'Momentum check', body: notes };
}

function buildLevelsStep(result: AnalysisResult): PlanStep {
  if (result.dataQuality === 'image-only') {
    return {
      title: 'Key levels to watch',
      body: 'Support/resistance levels require real price history to calculate precisely — add a ticker symbol to see exact levels.',
    };
  }
  const parts: string[] = [];
  const resistances = result.levels.filter((l) => l.kind === 'resistance').slice(0, 2);
  const supports = result.levels.filter((l) => l.kind === 'support').slice(0, 2);
  if (resistances.length) {
    parts.push(
      `Resistance: ${resistances.map((l) => `~${formatPrice(l.price)} (${l.touches} touch${l.touches > 1 ? 'es' : ''})`).join(', ')}.`,
    );
  }
  if (supports.length) {
    parts.push(
      `Support: ${supports.map((l) => `~${formatPrice(l.price)} (${l.touches} touch${l.touches > 1 ? 'es' : ''})`).join(', ')}.`,
    );
  }
  if (parts.length === 0) {
    parts.push('No clean, well-tested support or resistance zones stood out in the visible history — price has been trading without an obvious repeated pivot.');
  }
  if (result.fib && result.fib.length) {
    const mid = result.fib.find((f) => f.ratio === 0.5);
    const golden = result.fib.find((f) => f.ratio === 0.618);
    if (mid && golden) {
      parts.push(`Fibonacci retracement of the latest swing puts the 50% level near ${formatPrice(mid.price)} and the 61.8% "golden" level near ${formatPrice(golden.price)}.`);
    }
  }
  if (result.indicators?.pivots) {
    const p = result.indicators.pivots;
    parts.push(
      `Classic floor pivots off the last session: pivot ~${formatPrice(p.pp)}, R1 ~${formatPrice(p.r1)}, S1 ~${formatPrice(p.s1)}.`,
    );
  }
  return { title: 'Key levels to watch', body: parts.join(' ') };
}

function buildPatternStep(result: AnalysisResult): PlanStep {
  if (result.patterns.length === 0) {
    return {
      title: 'Chart patterns',
      body: 'No high-confidence textbook pattern (double top/bottom, breakout, triangle, head & shoulders, flag, candlestick reversal, squeeze, or divergence) is flagged right now — that’s a neutral, not a bad, signal.',
    };
  }
  const sorted = [...result.patterns].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const body = sorted.map((p) => `${p.label}: ${p.description}`).join(' ');
  return { title: 'Chart patterns', body };
}

function buildTrackRecordStep(result: AnalysisResult): PlanStep {
  if (result.dataQuality === 'image-only') {
    return {
      title: 'Track record & context',
      body: 'Relative strength vs. the broader market and a historical signal check both need real price data — add a ticker symbol to see them.',
    };
  }
  const parts: string[] = [];

  if (result.relativeStrength) {
    const rs = result.relativeStrength;
    parts.push(
      `Vs. ${rs.benchmarkSymbol}: this moved ${rs.symbolReturnPct >= 0 ? '+' : ''}${rs.symbolReturnPct.toFixed(1)}% over the window while ${rs.benchmarkSymbol} moved ${rs.benchmarkReturnPct >= 0 ? '+' : ''}${rs.benchmarkReturnPct.toFixed(1)}% — ${rs.outperforming ? 'outperforming' : 'underperforming'} the broader market by ${Math.abs(rs.relativeStrengthPct).toFixed(1)} points.`,
    );
  }

  if (result.backtest) {
    const bt = result.backtest;
    const checks: Array<[BacktestSignalStat, 'higher' | 'lower']> = [
      [bt.rsiOversoldBounce, 'higher'],
      [bt.rsiOverboughtFade, 'lower'],
      [bt.maCrossBullish, 'higher'],
      [bt.maCrossBearish, 'lower'],
      [bt.macdCrossBullish, 'higher'],
      [bt.macdCrossBearish, 'lower'],
    ];
    for (const [stat, direction] of checks) {
      const line = describeBacktestStat(stat, direction);
      if (line) parts.push(line);
    }
  }

  if (parts.length === 0) {
    parts.push('Not enough historical occurrences on this timeframe, or no benchmark data, to add track-record context beyond what’s above.');
  }
  return { title: 'Track record & context', body: parts.join(' ') };
}

function buildApproachStep(result: AnalysisResult, horizon: Horizon): PlanStep {
  const bias = result.score > 15 ? 'bullish' : result.score < -15 ? 'bearish' : 'neutral';
  const ind = result.indicators;

  if (result.dataQuality === 'image-only' || !ind) {
    return {
      title: `Suggested ${horizon === 'short' ? 'short-term' : 'long-term'} approach`,
      body: 'Numeric entry/stop/target levels need real price data. Add a ticker symbol above so this step can compute them from actual prices instead of a visual guess.',
    };
  }

  const lastClose = ind.lastClose;
  const atrVal = ind.atr14;

  if (horizon === 'short') {
    const stopMult = 1.5;
    const nearestSupport = nearestLevel(result.levels, lastClose, 'support');
    const nearestResistance = nearestLevel(result.levels, lastClose, 'resistance');
    const parts: string[] = [];
    if (bias === 'bullish') {
      const stop = atrVal ? lastClose - atrVal * stopMult : nearestSupport?.price;
      parts.push(
        `Momentum and trend favor the bulls short-term. A common approach: look for entries on a pullback toward ${nearestSupport ? `~${formatPrice(nearestSupport.price)} support` : 'recent short-term support'} or on a confirmed break of ${nearestResistance ? `~${formatPrice(nearestResistance.price)} resistance` : 'the nearest resistance'}, rather than chasing an extended move.`,
      );
      if (stop) parts.push(`A tight, volatility-based stop (${stopMult}× ATR) would sit near ${formatPrice(stop)}.`);
      if (nearestResistance) parts.push(`First target: the ${formatPrice(nearestResistance.price)} zone, reassessing if it holds.`);
      if (ind.vwap) parts.push(`Price is currently ${lastClose >= ind.vwap ? 'above' : 'below'} VWAP (~${formatPrice(ind.vwap)}) — many short-term traders treat that as a live bias filter, favoring longs above it and shorts below it.`);
    } else if (bias === 'bearish') {
      const stop = atrVal ? lastClose + atrVal * stopMult : nearestResistance?.price;
      parts.push(
        `Momentum and trend favor the bears short-term. A common approach on the short side (or simply avoiding new long entries) is to wait for a failed bounce into ${nearestResistance ? `~${formatPrice(nearestResistance.price)} resistance` : 'overhead resistance'} rather than shorting into an extended decline.`,
      );
      if (stop) parts.push(`A tight, volatility-based stop (${stopMult}× ATR) on a short would sit near ${formatPrice(stop)}.`);
      if (nearestSupport) parts.push(`First downside target: the ${formatPrice(nearestSupport.price)} zone.`);
      if (ind.vwap) parts.push(`Price is currently ${lastClose >= ind.vwap ? 'above' : 'below'} VWAP (~${formatPrice(ind.vwap)}) — many short-term traders treat that as a live bias filter, favoring longs above it and shorts below it.`);
    } else {
      parts.push(
        `Signals are mixed — trend, momentum, and pattern evidence don’t agree enough for a clean short-term setup. The higher-discipline move is usually to wait for either a confirmed break of ${nearestResistance ? formatPrice(nearestResistance.price) : 'resistance'} or ${nearestSupport ? formatPrice(nearestSupport.price) : 'support'} before committing capital.`,
      );
    }
    parts.push('Typical holding window for this style: a few sessions to a couple of weeks, reassessed daily.');
    return { title: 'Suggested short-term approach', body: parts.join(' ') };
  }

  // long horizon
  const stopMult = 3;
  const parts: string[] = [];
  if (bias === 'bullish') {
    const stop = atrVal ? lastClose - atrVal * stopMult : ind.sma200 ?? undefined;
    parts.push(
      `The broader trend and moving-average stack favor the bulls. A common long-horizon approach is scaling in over time (e.g., in 2-3 tranches) rather than committing all at once, adding on pullbacks toward ${ind.sma50 ? `the 50-period average (~${formatPrice(ind.sma50)})` : 'a rising moving average'} while the uptrend structure stays intact.`,
    );
    if (stop) parts.push(`A wide, trend-following invalidation point would be roughly ${formatPrice(stop)} (weekly-close basis, not an intraday wick).`);
    parts.push('Let profits run with a trailing stop tied to the moving-average trend rather than a fixed target, reassessing monthly.');
  } else if (bias === 'bearish') {
    const stop = atrVal ? lastClose + atrVal * stopMult : ind.sma200 ?? undefined;
    parts.push(
      `The broader trend and moving-average stack favor the bears. For existing long positions, this is a context where trimming exposure or tightening stops is more common than adding. For new capital, the higher-discipline approach is usually waiting for the trend structure to repair (e.g., price reclaiming ${ind.sma200 ? `the 200-period average near ${formatPrice(ind.sma200)}` : 'the long-term average'}) before committing.`,
    );
    if (stop) parts.push(`If holding or trading the downtrend, a wide invalidation point would be roughly ${formatPrice(stop)}.`);
  } else {
    parts.push(
      'The long-term trend picture is mixed — moving averages and swing structure aren’t aligned. Many long-horizon investors treat this as a "wait and watch" zone: reassess once price commits clearly above or below its 50/200-period averages rather than forcing a decision now.',
    );
  }
  parts.push('Typical reassessment cadence for this style: monthly, or around major earnings/news events.');
  return { title: 'Suggested long-term approach', body: parts.join(' ') };
}

function buildRiskStep(result: AnalysisResult, horizon: Horizon): PlanStep {
  const generic =
    'General risk-management principles (not personalized to your account): many disciplined traders/investors risk only a small slice of total capital on any single idea (often cited as roughly 1-2% for active trading), size positions so that hitting the stop-loss above is a planned, tolerable loss rather than a surprise, and avoid concentrating a portfolio in one name or one correlated theme.';
  const horizonNote =
    horizon === 'short'
      ? 'Short-term/active setups typically warrant smaller size and tighter stops because they’re wrong more often, more quickly.'
      : 'Long-term positions can typically warrant wider stops and slower position-building, since the goal is to ride a trend through normal volatility rather than react to daily noise.';
  const confidenceNote =
    result.confidence < 40
      ? 'Confidence on this particular read is low — that alone is a reason to size any position smaller than usual, or to wait for a clearer setup.'
      : result.confidence < 65
        ? 'Confidence on this read is moderate — treat it as one input among several, not a green light on its own.'
        : 'Confidence on this read is relatively high for a free, automated tool — still only one input, and markets can invalidate any setup.';
  return {
    title: 'Risk management',
    body: `${generic} ${horizonNote} ${confidenceNote}`,
  };
}

function buildInvalidation(result: AnalysisResult, horizon: Horizon): string {
  if (result.dataQuality === 'image-only' || !result.indicators) {
    return 'Because this read has no verified price data behind it, treat any conclusion as provisional — add a ticker symbol for a real invalidation level.';
  }
  const ind = result.indicators;
  const bias = result.score > 15 ? 'bullish' : result.score < -15 ? 'bearish' : 'neutral';
  if (bias === 'neutral') {
    return 'This is already a neutral read — it would firm up (in either direction) on a decisive close through either the support or resistance zone listed above.';
  }
  const smaRef = horizon === 'long' ? ind.sma200 ?? ind.sma50 : ind.sma20 ?? ind.sma50;
  const smaLabel = horizon === 'long' ? '200-period (or 50-period, if unavailable)' : '20-period (or 50-period, if unavailable)';
  if (bias === 'bullish') {
    return smaRef
      ? `This bullish lean weakens or reverses on a sustained close back below the ${smaLabel} moving average (~${formatPrice(smaRef)}), or below the nearest support zone listed above.`
      : 'This bullish lean weakens or reverses on a sustained close back below the nearest support zone listed above.';
  }
  return smaRef
    ? `This bearish lean weakens or reverses on a sustained close back above the ${smaLabel} moving average (~${formatPrice(smaRef)}), or above the nearest resistance zone listed above.`
    : 'This bearish lean weakens or reverses on a sustained close back above the nearest resistance zone listed above.';
}
