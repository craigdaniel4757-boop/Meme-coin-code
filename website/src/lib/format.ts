export function formatUsd(value: number): string {
  if (!isFinite(value)) return '$0.00';
  const opts: Intl.NumberFormatOptions =
    Math.abs(value) < 1
      ? { minimumFractionDigits: 2, maximumFractionDigits: 4 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const sign = value < 0 ? '-$' : '$';
  return sign + Math.abs(value).toLocaleString('en-US', opts);
}

export function formatPrice(value: number): string {
  if (!isFinite(value) || value === 0) return '$0.00';
  const abs = Math.abs(value);
  if (abs >= 1) {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const decimals = Math.min(10, Math.max(2, -Math.floor(Math.log10(abs)) + 3));
  return '$' + value.toFixed(decimals);
}

export function formatPct(value: number, withSign = true): string {
  const pct = value * 100;
  const sign = withSign && pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function timeAgo(ts: number): string {
  if (!ts) return '';
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
