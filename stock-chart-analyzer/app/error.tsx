'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('ChartPilot runtime error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bear/10 text-bear">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.02L13.71 3.86a2 2 0 0 0-3.42 0z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-slate-100">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        ChartPilot hit an unexpected error rendering this page. Your uploaded screenshot and any
        analysis in progress were not saved anywhere — no data was lost beyond this browser tab.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
