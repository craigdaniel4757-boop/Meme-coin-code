// Shared formatting + storage helpers. Plain scripts (no modules) so the site
// also works when index.html is opened straight from disk.
(function () {
  const SIM = (window.SIM = window.SIM || {});

  const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const SUB = '₀₁₂₃₄₅₆₇₈₉';

  const ok = (n) => typeof n === 'number' && isFinite(n);

  function fmtUsd(n) {
    return ok(n) ? usd.format(n) : '—';
  }

  function fmtSignedUsd(n) {
    if (!ok(n)) return '—';
    return (n >= 0 ? '+' : '−') + usd.format(Math.abs(n));
  }

  function fmtPct(n, digits = 1) {
    if (!ok(n)) return '—';
    return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(digits) + '%';
  }

  function fmtCompact(n) {
    if (!ok(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  // Memecoin prices are tiny, so use DexScreener-style subscript zeros:
  // 0.000000123 -> $0.0₆123
  function fmtPrice(p) {
    if (!ok(p) || p <= 0) return '—';
    if (p >= 100) return '$' + p.toFixed(2);
    if (p >= 1) return '$' + p.toFixed(4);
    if (p >= 0.001) return '$' + p.toFixed(6);
    const m = p.toFixed(20).match(/^0\.(0+)(\d{4})/);
    if (!m) return '$' + p.toExponential(3);
    const zeros = String(m[1].length).split('').map((d) => SUB[+d]).join('');
    return '$0.0' + zeros + (m[2].replace(/0+$/, '') || '0');
  }

  function fmtAge(hours) {
    if (!ok(hours)) return '—';
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + 'm';
    if (hours < 48) return Math.round(hours) + 'h';
    return Math.round(hours / 24) + 'd';
  }

  function fmtDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  // localStorage can be missing or throw (private mode, blocked storage).
  const PREFIX = 'solsim:';
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable — the sim still runs, it just won't persist */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  SIM.util = { fmtUsd, fmtSignedUsd, fmtPct, fmtCompact, fmtPrice, fmtAge, fmtDuration, fmtTime, clamp, esc, store };
})();
