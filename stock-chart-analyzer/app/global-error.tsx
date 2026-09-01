'use client';

// Catches errors thrown by the root layout itself (rare — app/error.tsx handles everything
// else). Next.js requires this file to render its own <html>/<body> since it replaces the root
// layout entirely when it fires.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#0b0e14',
          color: '#e6eaf2',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>ChartPilot hit an unexpected error</h1>
        <p style={{ maxWidth: 380, fontSize: 14, color: '#8896ab' }}>
          Nothing was saved anywhere — no data was lost beyond this browser tab.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
