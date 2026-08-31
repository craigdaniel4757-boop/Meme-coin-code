export function Footer() {
  return (
    <footer className="border-t border-border mt-8">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 text-xs text-slate-500 leading-relaxed">
        <p>
          <strong className="text-slate-400">MemeMind AI trades on paper, with real market data.</strong> Coin
          prices, liquidity, volume, and transaction data are fetched live from{' '}
          <a
            href="https://dexscreener.com"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-300"
          >
            DexScreener's
          </a>{' '}
          public API for real, currently-trading Solana-chain meme coins. Every buy and sell on this page, however,
          is a simulated paper trade against a $1,000 balance that exists only in this browser's local storage —
          there is no connected wallet, no on-chain transaction, and no real money at risk. Nothing here is
          investment advice; meme coins are extremely volatile and a majority are designed to separate late buyers
          from their money. The "AI" is a lightweight online-learning trading policy (a linear contextual-bandit
          model updated after every closed trade) that runs entirely in your browser.
        </p>
      </div>
    </footer>
  );
}
