import { useMemo, useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { computeStats } from './lib/stats';
import { computeEquity, MAX_POSITIONS } from './lib/simulation';
import { Header } from './components/Header';
import { EquityChart } from './components/EquityChart';
import { CoinGrid } from './components/CoinGrid';
import { BrainPanel } from './components/BrainPanel';
import { TradeFeed } from './components/TradeFeed';
import { StatsBar } from './components/StatsBar';
import { Footer } from './components/Footer';

export default function App() {
  const { state, running, setRunning, speed, setSpeed, fullReset, softReset } = useSimulation();
  const [resetMenuOpen, setResetMenuOpen] = useState(false);

  const equity = useMemo(
    () => computeEquity(state.coins, state.cash, state.positions),
    [state.coins, state.cash, state.positions],
  );
  const stats = useMemo(() => computeStats(state.events), [state.events]);
  const totalReturnPct = (equity - 1000) / 1000;
  const openPositions = Object.keys(state.positions).length;

  return (
    <div className="min-h-screen bg-bg text-slate-100 flex flex-col">
      <Header
        equity={equity}
        cash={state.cash}
        totalReturnPct={totalReturnPct}
        running={running}
        setRunning={setRunning}
        speed={speed}
        setSpeed={setSpeed}
        onFullReset={fullReset}
        onSoftReset={softReset}
        resetMenuOpen={resetMenuOpen}
        setResetMenuOpen={setResetMenuOpen}
      />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 md:px-6 py-5 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
        <div className="flex flex-col gap-5 min-w-0">
          <EquityChart equityCurve={state.equityCurve} />
          <StatsBar stats={stats} totalFeesPaid={state.totalFeesPaid} openPositions={openPositions} maxPositions={MAX_POSITIONS} />
          <CoinGrid coins={state.coins} positions={state.positions} />
        </div>
        <div className="flex flex-col gap-5 min-w-0">
          <BrainPanel agent={state.agent} stats={stats} />
          <TradeFeed events={state.events} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
