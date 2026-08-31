import { formatPct, formatUsd, timeAgo } from '../lib/format';
import type { ConnectionStatus } from '../hooks/useSimulation';

interface Props {
  equity: number;
  cash: number;
  totalReturnPct: number;
  running: boolean;
  setRunning: (v: boolean) => void;
  status: ConnectionStatus;
  lastFetchAt: number | null;
  onRefreshNow: () => void;
  onFullReset: () => void;
  onSoftReset: () => void;
  resetMenuOpen: boolean;
  setResetMenuOpen: (v: boolean) => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: '◐ Connecting…',
  live: '● Live · DexScreener',
  reconnecting: '◐ Reconnecting…',
};

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connecting: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
  live: 'border-up/40 text-up bg-up/10',
  reconnecting: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
};

export function Header(props: Props) {
  const {
    equity,
    cash,
    totalReturnPct,
    running,
    setRunning,
    status,
    lastFetchAt,
    onRefreshNow,
    onFullReset,
    onSoftReset,
    resetMenuOpen,
    setResetMenuOpen,
  } = props;
  const positive = totalReturnPct >= 0;

  return (
    <header className="border-b border-border bg-panel/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center font-bold text-bg shadow-glow">
            M
          </div>
          <div>
            <div className="font-semibold tracking-tight leading-tight">MemeMind AI</div>
            <div className="text-[11px] text-slate-400 leading-tight">Real Solana meme coin prices, paper trades</div>
          </div>
          <span className="ml-2 hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-accent2 border border-accent2/30 bg-accent2/10 rounded-full px-2 py-1">
            Paper trading · Not real money
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wide">Portfolio value</div>
            <div className={`font-mono text-xl font-semibold ${positive ? 'text-up' : 'text-down'}`}>
              {formatUsd(equity)}
              <span className="ml-2 text-sm">{formatPct(totalReturnPct)}</span>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-[11px] text-slate-400 uppercase tracking-wide">Cash available</div>
            <div className="font-mono text-base text-slate-200">{formatUsd(cash)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden lg:block text-right mr-1">
            <div className={`text-xs font-medium px-2 py-1 rounded-md border ${STATUS_CLASS[status]}`}>
              {STATUS_LABEL[status]}
            </div>
            {lastFetchAt !== null && (
              <div className="text-[10px] text-slate-500 mt-0.5">Updated {timeAgo(lastFetchAt)}</div>
            )}
          </div>

          <button
            onClick={onRefreshNow}
            title="Refresh now"
            className="px-2.5 py-1.5 rounded-md text-sm border border-border text-slate-300 hover:bg-panel2 transition"
          >
            ⟳
          </button>

          <button
            onClick={() => setRunning(!running)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
              running
                ? 'border-up/40 text-up bg-up/10 hover:bg-up/20'
                : 'border-slate-500/40 text-slate-300 bg-slate-500/10 hover:bg-slate-500/20'
            }`}
          >
            {running ? '⏸ Trading' : '▶ Paused'}
          </button>

          <div className="relative">
            <button
              onClick={() => setResetMenuOpen(!resetMenuOpen)}
              className="px-3 py-1.5 rounded-md text-sm font-medium border border-border text-slate-300 hover:bg-panel2 transition"
            >
              Reset ▾
            </button>
            {resetMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-panel2 shadow-xl p-1 z-30">
                <button
                  onClick={() => {
                    onSoftReset();
                    setResetMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-panel text-sm"
                >
                  <div className="font-medium">New portfolio, keep the brain</div>
                  <div className="text-xs text-slate-400">Fresh $1,000. The AI keeps everything it has learned.</div>
                </button>
                <button
                  onClick={() => {
                    if (confirm('Wipe all learned weights and trade history? This cannot be undone.')) {
                      onFullReset();
                    }
                    setResetMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-panel text-sm text-down"
                >
                  <div className="font-medium">Full reset</div>
                  <div className="text-xs text-slate-400">Wipes the AI's learned brain too. Starts from zero.</div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
