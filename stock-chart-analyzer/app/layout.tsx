import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChartPilot — Screenshot-to-Plan Stock Chart Analyzer',
  description:
    'Upload a stock chart screenshot and get a transparent, data-backed technical analysis walkthrough with a clear step-by-step plan. Free data sources only. Educational tool, not financial advice.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas text-slate-100 antialiased">{children}</body>
    </html>
  );
}
