import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted sm:px-6">
        <p className="mb-2">
          ChartPilot is a free educational tool. Market data via Stooq and Yahoo Finance public
          endpoints; chart text/ticker recognition via Tesseract.js. See{' '}
          <Link href="/methodology" className="text-accent hover:underline">
            methodology &amp; limitations
          </Link>
          .
        </p>
        <p>Not financial advice. No warranty of accuracy. Use at your own risk.</p>
      </div>
    </footer>
  );
}
