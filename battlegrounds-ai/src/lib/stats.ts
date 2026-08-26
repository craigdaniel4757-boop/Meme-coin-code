import type { LearnerModel } from "@/engine/persistence/storage";

export interface TrendPoint {
  bucketEnd: number;
  avgPlacement: number;
  winRate: number;
}

export function bucketedTrend(history: LearnerModel["placementHistory"], bucketSize: number, maxBuckets: number): TrendPoint[] {
  if (history.length === 0) return [];
  const points: TrendPoint[] = [];
  for (let end = history.length; end > 0 && points.length < maxBuckets; end -= bucketSize) {
    const start = Math.max(0, end - bucketSize);
    const slice = history.slice(start, end);
    const avgPlacement = slice.reduce((s, e) => s + e.placement, 0) / slice.length;
    const winRate = slice.filter((e) => e.placement === 1).length / slice.length;
    points.unshift({ bucketEnd: slice[slice.length - 1].game, avgPlacement, winRate });
  }
  return points;
}

export function bucketedAverages(history: LearnerModel["placementHistory"], bucketSize: number, maxBuckets: number): number[] {
  return bucketedTrend(history, bucketSize, maxBuckets).map((p) => p.avgPlacement);
}
