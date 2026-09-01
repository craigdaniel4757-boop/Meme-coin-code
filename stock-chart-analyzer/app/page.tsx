'use client';

import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import UploadDropzone from '@/components/UploadDropzone';
import TimeframeSelect from '@/components/TimeframeSelect';
import HorizonToggle from '@/components/HorizonToggle';
import TickerField from '@/components/TickerField';
import ResultsView from '@/components/ResultsView';
import Disclaimer from '@/components/Disclaimer';
import { extractChartText } from '@/lib/ocr';
import { analyzeChartImage } from '@/lib/imageAnalysis';
import { analyzeSeries, analyzeImageOnly } from '@/lib/scorer';
import { generatePlan } from '@/lib/planner';
import type { AnalysisResult, Horizon, Plan, QuoteSeries, Timeframe } from '@/lib/types';

const STAGES = [
  'Reading your screenshot…',
  'Looking up free market data…',
  'Computing indicators & levels…',
  'Building your step-by-step plan…',
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('3M');
  const [horizon, setHorizon] = useState<Horizon>('short');
  const [ticker, setTicker] = useState('');
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'reading' | 'done'>('idle');
  const [ocrCandidates, setOcrCandidates] = useState<string[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fetchNote, setFetchNote] = useState<string | null>(null);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [quoteSeries, setQuoteSeries] = useState<QuoteSeries | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const ocrRunId = useRef(0);

  function resetResults() {
    setResult(null);
    setPlan(null);
    setQuoteSeries(null);
    setError(null);
    setFetchNote(null);
  }

  function handleFileSelected(f: File) {
    setFile(f);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    resetResults();
    setOcrCandidates([]);
    setOcrStatus('reading');

    const runId = ++ocrRunId.current;
    extractChartText(f).then((extraction) => {
      if (ocrRunId.current !== runId) return; // a newer file was selected meanwhile
      setOcrStatus('done');
      setOcrCandidates(extraction.candidateSymbols);
      if (extraction.guessedSymbol) {
        setTicker((prev) => (prev.trim() ? prev : extraction.guessedSymbol!));
      }
    });
  }

  function handleClear() {
    setFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setTicker('');
    setOcrStatus('idle');
    setOcrCandidates([]);
    resetResults();
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze() {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setStageIndex(0);
    resetResults();

    const stageTimer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 700);

    try {
      let series: QuoteSeries | null = null;
      const trimmedTicker = ticker.trim().toUpperCase();

      if (trimmedTicker) {
        try {
          const res = await fetch(`/api/quote?symbol=${encodeURIComponent(trimmedTicker)}&timeframe=${timeframe}`);
          const json = await res.json();
          if (res.ok && json.series) {
            series = json.series as QuoteSeries;
          } else {
            setFetchNote(json.error ?? `Couldn't find free market data for "${trimmedTicker}" — showing a screenshot-only estimate instead.`);
          }
        } catch {
          setFetchNote(`Network error while fetching data for "${trimmedTicker}" — showing a screenshot-only estimate instead.`);
        }
      }

      const imageHeuristics = await analyzeChartImage(file).catch(() => null);

      let finalResult: AnalysisResult;
      if (series) {
        const base = analyzeSeries(series.bars, series.quality);
        finalResult = imageHeuristics ? { ...base, imageOnly: imageHeuristics } : base;
      } else if (imageHeuristics) {
        finalResult = analyzeImageOnly(imageHeuristics);
      } else {
        throw new Error('Could not read the chart image or find market data. Try a clearer screenshot or a different ticker.');
      }

      const usedSymbol = series?.resolvedSymbol ?? (trimmedTicker || null);
      const generatedPlan = generatePlan(finalResult, horizon, timeframe, usedSymbol);

      setResult(finalResult);
      setPlan(generatedPlan);
      setQuoteSeries(series);

      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong analyzing this chart.');
    } finally {
      clearInterval(stageTimer);
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-12 sm:px-6">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Paste a chart. Get a clear, data-backed plan.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Upload a screenshot of any 1D–1Y stock chart. ChartPilot reads the ticker off the
            image, pulls real free price history, runs a full technical-analysis pass (trend,
            momentum, support/resistance, chart patterns), and turns it into a step-by-step plan
            tuned to a short-term or long-term goal — with every number traceable back to real
            data, not a black box.
          </p>
          <div className="mt-5 max-w-2xl">
            <Disclaimer compact />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <UploadDropzone previewUrl={previewUrl} onFileSelected={handleFileSelected} onClear={handleClear} />

            <div className="space-y-5 rounded-xl border border-border bg-panel p-5 shadow-panel">
              <TimeframeSelect value={timeframe} onChange={setTimeframe} />
              <HorizonToggle value={horizon} onChange={setHorizon} />
              <TickerField value={ticker} onChange={setTicker} candidates={ocrCandidates} ocrStatus={ocrStatus} />

              <button
                type="button"
                disabled={!file || analyzing}
                onClick={handleAnalyze}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-panel2 disabled:text-muted"
              >
                {analyzing ? 'Analyzing…' : 'Analyze chart'}
              </button>

              {analyzing && (
                <p className="animate-pulse-soft text-center text-xs text-muted">{STAGES[stageIndex]}</p>
              )}
              {fetchNote && !analyzing && (
                <p className="rounded-lg border border-neutral/30 bg-neutral/5 p-2.5 text-xs text-neutral">{fetchNote}</p>
              )}
              {error && (
                <p className="rounded-lg border border-bear/30 bg-bear/5 p-2.5 text-xs text-bear">{error}</p>
              )}
            </div>
          </div>
        </section>

        {result && plan && (
          <section ref={resultsRef} className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6">
            <ResultsView result={result} plan={plan} quoteSeries={quoteSeries} symbol={quoteSeries?.resolvedSymbol ?? (ticker.trim() || null)} />
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
