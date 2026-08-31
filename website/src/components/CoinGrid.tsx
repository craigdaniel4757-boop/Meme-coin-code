import { Coin, Position } from '../types';
import { CoinCard } from './CoinCard';

interface Props {
  coins: Coin[];
  positions: Record<string, Position>;
}

export function CoinGrid({ coins, positions }: Props) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="text-sm text-slate-400 mb-3">Market — live Solana meme coins (DexScreener)</div>
      {coins.length === 0 ? (
        <div className="text-sm text-slate-500 py-10 text-center">Connecting to DexScreener…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {coins.map((coin) => (
            <CoinCard key={coin.id} coin={coin} position={positions[coin.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
