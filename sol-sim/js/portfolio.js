// Paper portfolio: fake cash, simulated fills with realistic memecoin costs
// (slippage + DEX fee + network fee), realized/unrealized P/L, per-strategy
// stats, trade log and equity history. Persisted to localStorage per feed.
(function () {
  const SIM = window.SIM;
  const { store } = SIM.util;

  const START_CASH = 1000;
  const COSTS = {
    slippage: 0.01, // 1% price impact on each fill
    dexFee: 0.0025, // 0.25% pool fee
    networkFee: 0.01, // $ per transaction (priority fee + base fee)
  };
  const MAX_TRADES = 300;
  const MAX_EQUITY_POINTS = 2000;

  function fresh() {
    return {
      startCash: START_CASH,
      cash: START_CASH,
      startedAt: Date.now(),
      positions: {}, // addr -> position
      trades: [], // newest first
      closed: [], // finished round trips: {strategy, pnl}
      realized: 0,
      stratRealized: {}, // strategy id -> realized P/L
      fees: 0,
      equityHist: [{ t: Date.now(), v: START_CASH }],
      cooldown: {}, // addr -> timestamp until which we won't re-enter
    };
  }

  function createPortfolio(key) {
    let s = store.get(key, null);
    if (!s || typeof s.cash !== 'number') s = fresh();
    s.stratRealized = s.stratRealized || {};

    const save = () => store.set(key, s);

    function log(side, pos, qty, price, usd, reason, pnl) {
      s.trades.unshift({ t: Date.now(), side, symbol: pos.symbol, addr: pos.addr, strategy: pos.strategy, qty, price, usd, reason, pnl });
      if (s.trades.length > MAX_TRADES) s.trades.length = MAX_TRADES;
    }

    function buy(coin, usd, strategy, reason) {
      usd = Math.min(usd, s.cash);
      if (usd < 5 || !(coin.price > 0) || s.positions[coin.addr]) return null;
      const fee = usd * COSTS.dexFee + COSTS.networkFee;
      const fill = coin.price * (1 + COSTS.slippage);
      const qty = (usd - fee) / fill;
      s.cash -= usd;
      s.fees += fee;
      const pos = {
        addr: coin.addr,
        symbol: coin.symbol,
        name: coin.name,
        url: coin.url,
        strategy,
        qty,
        cost: usd, // remaining cost basis, including fees
        invested: usd,
        entryPrice: fill,
        openedAt: Date.now(),
        peak: coin.price,
        entryLiq: coin.liq,
        tpHit: [],
        realized: 0,
        last: coin.price,
      };
      s.positions[coin.addr] = pos;
      log('BUY', pos, qty, fill, usd, reason, null);
      save();
      return pos;
    }

    function sell(addr, fraction, price, reason) {
      const pos = s.positions[addr];
      if (!pos || !(price > 0)) return null;
      fraction = Math.min(1, Math.max(0, fraction));
      // Close fully if what's left would be dust.
      if (pos.qty * (1 - fraction) * price < 2) fraction = 1;
      const qty = pos.qty * fraction;
      const fill = price * (1 - COSTS.slippage);
      const gross = qty * fill;
      const fee = gross * COSTS.dexFee + COSTS.networkFee;
      const net = Math.max(0, gross - fee);
      const costPart = pos.cost * fraction;
      const pnl = net - costPart;
      s.cash += net;
      s.fees += fee;
      s.realized += pnl;
      s.stratRealized[pos.strategy] = (s.stratRealized[pos.strategy] || 0) + pnl;
      pos.qty -= qty;
      pos.cost -= costPart;
      pos.realized += pnl;
      log('SELL', pos, qty, fill, net, reason, pnl);
      if (fraction >= 1) {
        s.closed.push({ strategy: pos.strategy, pnl: pos.realized, t: Date.now() });
        s.cooldown[addr] = Date.now() + 20 * 60000;
        delete s.positions[addr];
      }
      save();
      return pnl;
    }

    function mark(prices) {
      for (const pos of Object.values(s.positions)) {
        const p = prices.get(pos.addr);
        if (p > 0) {
          pos.last = p;
          if (p > pos.peak) pos.peak = p;
        }
      }
    }

    function totals() {
      let value = 0;
      let unrealized = 0;
      for (const pos of Object.values(s.positions)) {
        const v = pos.qty * pos.last;
        value += v;
        unrealized += v - pos.cost;
      }
      const equity = s.cash + value;
      const wins = s.closed.filter((c) => c.pnl > 0).length;
      return {
        equity,
        cash: s.cash,
        positionsValue: value,
        unrealized,
        realized: s.realized,
        pnl: equity - s.startCash,
        pnlPct: (equity / s.startCash - 1) * 100,
        fees: s.fees,
        closedCount: s.closed.length,
        winRate: s.closed.length ? (wins / s.closed.length) * 100 : NaN,
      };
    }

    function recordEquity() {
      const e = totals().equity;
      const h = s.equityHist;
      h.push({ t: Date.now(), v: e });
      if (h.length > MAX_EQUITY_POINTS) {
        // Thin the older half so long sessions keep their full shape.
        const half = Math.floor(h.length / 2);
        s.equityHist = h.slice(0, half).filter((_, i) => i % 2 === 0).concat(h.slice(half));
      }
      save();
    }

    function strategyStats(id) {
      const closed = s.closed.filter((c) => c.strategy === id);
      const open = Object.values(s.positions).filter((p) => p.strategy === id);
      const unreal = open.reduce((a, p) => a + p.qty * p.last - p.cost, 0);
      const realized = s.stratRealized[id] || 0;
      return {
        trades: closed.length,
        wins: closed.filter((c) => c.pnl > 0).length,
        open: open.length,
        realized,
        unrealized: unreal,
      };
    }

    return {
      get state() {
        return s;
      },
      buy,
      sell,
      mark,
      totals,
      recordEquity,
      strategyStats,
      inCooldown: (addr) => (s.cooldown[addr] || 0) > Date.now(),
      reset() {
        s = fresh();
        save();
      },
    };
  }

  SIM.portfolio = { createPortfolio, START_CASH, COSTS };
})();
