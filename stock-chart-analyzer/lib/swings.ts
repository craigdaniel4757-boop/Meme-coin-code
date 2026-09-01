// Fractal-based swing point detection and support/resistance clustering.
// A "swing high" is a local max within a symmetric window (a standard, well-known technique
// often called a Williams Fractal); clustering nearby swing prices into zones is the standard
// way charting tools derive horizontal support/resistance without hand-drawn lines.

import type { Bar, Level, SwingPoint } from './types';

export function findSwingPoints(bars: Bar[], window = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = window; i < bars.length - window; i++) {
    const bar = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (bars[j]!.high >= bar.high) isHigh = false;
      if (bars[j]!.low <= bar.low) isLow = false;
    }
    if (isHigh) points.push({ index: i, time: bar.time, price: bar.high, kind: 'high' });
    if (isLow) points.push({ index: i, time: bar.time, price: bar.low, kind: 'low' });
  }
  return points;
}

/**
 * Groups swing points that sit within `tolerancePct` of each other into zones. Zones with more
 * touches and more recent touches score higher (`strength`). Returns the strongest zones first.
 */
export function clusterLevels(
  swings: SwingPoint[],
  currentPrice: number,
  totalBars: number,
  tolerancePct = 0.012,
  maxLevels = 6,
): Level[] {
  if (swings.length === 0) return [];

  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; indices: number[]; kinds: SwingPoint['kind'][] }[] = [];

  for (const point of sorted) {
    const last = clusters[clusters.length - 1];
    if (last) {
      const clusterMean = last.prices.reduce((a, b) => a + b, 0) / last.prices.length;
      if (Math.abs(point.price - clusterMean) / clusterMean <= tolerancePct) {
        last.prices.push(point.price);
        last.indices.push(point.index);
        last.kinds.push(point.kind);
        continue;
      }
    }
    clusters.push({ prices: [point.price], indices: [point.index], kinds: [point.kind] });
  }

  const levels: Level[] = clusters.map((c) => {
    const price = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
    const lastTouchIndex = Math.max(...c.indices);
    const recency = totalBars > 0 ? lastTouchIndex / totalBars : 0;
    const touchScore = Math.min(c.prices.length / 4, 1);
    const strength = 0.6 * touchScore + 0.4 * recency;
    const highs = c.kinds.filter((k) => k === 'high').length;
    const lows = c.kinds.filter((k) => k === 'low').length;
    const kind: Level['kind'] =
      price >= currentPrice ? 'resistance' : 'support';
    // If a zone was touched predominantly by one type of swing, that's a stronger tell than
    // pure price position relative to current price, but current-price-relative is the correct
    // forward-looking definition (a former resistance can still be above price after a rally).
    void highs;
    void lows;
    return {
      price,
      kind,
      touches: c.prices.length,
      strength: Math.min(1, strength),
      lastTouchIndex,
    };
  });

  return levels.sort((a, b) => b.strength - a.strength).slice(0, maxLevels);
}

export function nearestLevel(
  levels: Level[],
  currentPrice: number,
  kind: Level['kind'],
): Level | null {
  const candidates = levels.filter((l) => l.kind === kind);
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, l) =>
    Math.abs(l.price - currentPrice) < Math.abs(closest.price - currentPrice) ? l : closest,
  );
}
