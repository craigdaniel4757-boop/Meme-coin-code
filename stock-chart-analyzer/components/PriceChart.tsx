'use client';

import { useEffect, useRef } from 'react';
import { anchoredVwap, sma } from '@/lib/indicators';
import type { Bar, Level } from '@/lib/types';

export default function PriceChart({ bars, levels }: { bars: Bar[]; levels: Level[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;
    let disposed = false;
    let chart: import('lightweight-charts').IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const { createChart, ColorType, CrosshairMode, LineStyle } = await import('lightweight-charts');
      if (disposed || !containerRef.current) return;

      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#8896ab',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1c2230' },
          horzLines: { color: '#1c2230' },
        },
        width: containerRef.current.clientWidth,
        height: 380,
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#232a38' },
        rightPriceScale: { borderColor: '#232a38' },
        crosshair: { mode: CrosshairMode.Normal },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
      candleSeries.setData(
        bars.map((b) => ({
          time: b.time as import('lightweight-charts').UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );

      const closes = bars.map((b) => b.close);
      const overlays: Array<{ period: number; color: string }> = [
        { period: 20, color: '#eab308' },
        { period: 50, color: '#3b82f6' },
        { period: 200, color: '#a855f7' },
      ];
      for (const { period, color } of overlays) {
        if (bars.length < period) continue;
        const values = sma(closes, period);
        const lineSeries = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        lineSeries.setData(
          bars
            .map((b, i) => ({ time: b.time as import('lightweight-charts').UTCTimestamp, value: values[i] ?? null }))
            .filter(
              (p): p is { time: import('lightweight-charts').UTCTimestamp; value: number } =>
                p.value !== null,
            ),
        );
      }

      const vwapValues = anchoredVwap(bars, 0);
      const vwapSeries = chart.addLineSeries({
        color: '#22d3ee',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      vwapSeries.setData(
        bars
          .map((b, i) => ({ time: b.time as import('lightweight-charts').UTCTimestamp, value: vwapValues[i] ?? null }))
          .filter(
            (p): p is { time: import('lightweight-charts').UTCTimestamp; value: number } => p.value !== null,
          ),
      );

      for (const level of levels.slice(0, 6)) {
        candleSeries.createPriceLine({
          price: level.price,
          color: level.kind === 'resistance' ? '#ef4444' : '#22c55e',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: level.kind === 'resistance' ? 'R' : 'S',
        });
      }

      chart.timeScale().fitContent();

      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && chart) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chart?.remove();
    };
  }, [bars, levels]);

  return <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />;
}
