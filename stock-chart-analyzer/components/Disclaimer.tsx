export default function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[11px] leading-relaxed text-muted">
        Educational tool only, not financial advice. Automated technical analysis on
        free/public data can be wrong or stale — verify independently before making any
        financial decision.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-panel2/60 p-4 text-xs leading-relaxed text-muted">
      <p className="mb-1 font-semibold text-slate-300">This is not financial advice.</p>
      <p>
        ChartPilot generates general, educational technical-analysis commentary from
        free/public price data and, when unavailable, a rough visual read of your screenshot.
        It does not know your financial situation, goals, or risk tolerance, it cannot predict
        the future, and its data sources are unofficial free feeds that can lag, gap, or be
        wrong. Nothing here is a recommendation to buy or sell any security. Markets carry real
        risk of loss. Consider speaking with a licensed financial advisor before acting, and
        never risk money you can't afford to lose.
      </p>
    </div>
  );
}
