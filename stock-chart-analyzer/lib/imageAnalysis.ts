// Supplementary, screenshot-only visual read: pixel-color balance (green vs red candles/lines)
// and an overall trajectory fit via weighted linear regression across the image. This is a
// coarse heuristic, not real chart-data extraction — it exists so the tool still produces a
// (clearly low-confidence, clearly labeled) read when no ticker can be resolved to real data.
// See lib/scorer.ts's analyzeImageOnly, which hard-caps confidence for this path.

import type { ImageHeuristics } from './types';

async function loadImageBitmap(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode the image.'));
    };
    img.src = url;
  });
}

function linearRegression(points: { x: number; y: number }[]): { slope: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, r2: 0 };
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let denom = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    denom += (p.x - meanX) ** 2;
  }
  const slope = denom === 0 ? 0 : num / denom;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, r2 };
}

export async function analyzeChartImage(file: File | Blob): Promise<ImageHeuristics> {
  const img = await loadImageBitmap(file);
  const maxWidth = 700;
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      bullishPixelRatio: 0.5,
      slopeDirection: 'flat',
      slopeConfidence: 0,
      notes: ['Browser canvas unavailable — could not run visual analysis.'],
    };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  let greenCount = 0;
  let redCount = 0;
  const bucketCount = 60;
  const bucketSumY: number[] = new Array(bucketCount).fill(0);
  const bucketWeight: number[] = new Array(bucketCount).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const a = data[idx + 3]!;
      if (a < 200) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const brightness = max / 255;
      if (sat < 0.16 || brightness < 0.12) continue; // background / gridlines / text

      const isGreenish = g > r * 1.1 && g > b * 1.05;
      const isReddish = r > g * 1.1 && r > b * 1.05;
      if (isGreenish) greenCount++;
      if (isReddish) redCount++;

      if (isGreenish || isReddish || sat > 0.3) {
        const bucket = Math.min(bucketCount - 1, Math.floor((x / width) * bucketCount));
        bucketSumY[bucket] = (bucketSumY[bucket] ?? 0) + y;
        bucketWeight[bucket] = (bucketWeight[bucket] ?? 0) + 1;
      }
    }
  }

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const weight = bucketWeight[i] ?? 0;
    if (weight > 0) points.push({ x: i, y: (bucketSumY[i] ?? 0) / weight });
  }

  const { slope, r2 } = linearRegression(points);
  const normalizedSlope = (slope * bucketCount) / Math.max(1, height);

  let slopeDirection: ImageHeuristics['slopeDirection'] = 'flat';
  if (normalizedSlope < -0.035) slopeDirection = 'up';
  else if (normalizedSlope > 0.035) slopeDirection = 'down';

  const coverage = points.length / bucketCount;
  const slopeConfidence = Math.max(0, Math.min(1, r2 * coverage));

  const totalColored = greenCount + redCount;
  const bullishPixelRatio = totalColored > 0 ? greenCount / totalColored : 0.5;

  const notes: string[] = [];
  if (totalColored < width * height * 0.005) {
    notes.push('Very little green/red chart coloring was detected — this may be a line chart or an unusual color scheme, which lowers reliability further.');
  } else {
    notes.push(
      `Detected roughly ${Math.round(bullishPixelRatio * 100)}% green vs ${Math.round(
        (1 - bullishPixelRatio) * 100,
      )}% red chart pixels.`,
    );
  }
  notes.push(
    `Overall trajectory across the image reads as ${slopeDirection === 'flat' ? 'roughly flat' : slopeDirection === 'up' ? 'upward' : 'downward'} (fit confidence ${Math.round(slopeConfidence * 100)}%).`,
  );

  return { bullishPixelRatio, slopeDirection, slopeConfidence, notes };
}
