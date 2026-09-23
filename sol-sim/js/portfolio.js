// Paper portfolio: fake cash, positions, realized/unrealized P/L, per-strategy
// stats, trade log and equity history. Persisted to localStorage per feed.
// Fills (price, quantity, fees) come from SIM.execution; this only books them.
(function () {
  const SIM = window.SIM;
  const { store } = SIM.util;

  const START_CASH = 1000;
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
      execCost: 0, // total paid vs the screen price: fees + slippage + price impact
      equityHist: [{ t: Date.now(), v: START_CASH }],
      cooldown: {}, // addr -> timestamp until which we won't re-enter
    };
  }

  function createPortfolio(key) {
    let s = store.get(key, null);
    if (!s || typeof s.cash !== 'number') s = fresh();
    s.stratRealized = s.stratRealized || {};
    s.execCost = s.execCost || 0;

    const save = () => store.set(key, s);

    function log(side, pos, qty, price, usd, reason, pnl, fill) {
      s.trades.unshift({
        t: Date.now(),
        side,
        symbol: pos.symbol,
        addr: pos.addr,
        strategy: pos.strategy,
        qty,
        price,
        usd,
        reason,
        pnl,
        src: fill ? fill.source : null,
        vsScreen: fill ? fill.vsScreen : NaN,
        route: (fill && fill.route) || '',
        roundTrip: fill ? fill.roundTrip : NaN,
        note: (fill && fill.note) || '',
      });
      if (s.trades.length > MAX_TRADES) s.trades.length = MAX_TRADES;
    }

    // Book a buy. `fill` is what the execution layer got for `usd`.
    function buy(coin, usd, strategy, reason, fill) {
      if (usd > s.cash + 1e-9 || usd < 5 || !(fill.qty > 0) || s.positions[coin.addr]) return null;
      s.cash -= usd;
      s.fees += fill.fee;
      s.execCost += usd - fill.qty * coin.price;
      const pos = {
        addr: coin.addr,
        symbol: coin.symbol,
        name: coin.name,
        url: coin.url,
        strategy,
        qty: fill.qty,
        qtyRaw: fill.qtyRaw || null, // on-chain integer amount, when priced by Jupiter
        cost: usd, // remaining cost basis, including fees
        invested: usd,
        entryPrice: fill.price,
        openedAt: Date.now(),
        peak: coin.price,
        entryLiq: coin.liq,
        tpHit: [],
        realized: 0,
        last: coin.price,
      };
      s.positions[coin.addr] = pos;
      log('BUY', pos, fill.qty, fill.price, usd, reason, null, fill);
      save();
      return pos;
    }

    // Fraction actually worth selling: close fully if the remainder would be dust.
    function sellFraction(addr, fraction, price) {
      const pos = s.positions[addr];
      fraction = Math.min(1, Math.max(0, fraction));
      if (pos && pos.qty * (1 - fraction) * price < 2) fraction = 1;
      return fraction;
    }

    // Book a sell of `fraction` of the position. `screen` is the market price
    // at the time, used to measure execution cost.
    function sell(addr, fraction, fill, reason, screen) {
      const pos = s.positions[addr];
      if (!pos) return null;
      const net = fill.net;
      const costPart = pos.cost * fraction;
      const pnl = net - costPart;
      s.cash += net;
      s.fees += fill.fee;
      s.execCost += fill.qty * screen - net;
      s.realized += pnl;
      s.stratRealized[pos.strategy] = (s.stratRealized[pos.strategy] || 0) + pnl;
      pos.qty -= fill.qty;
      if (pos.qtyRaw && fill.qtyRaw) pos.qtyRaw = (BigInt(pos.qtyRaw) - BigInt(fill.qtyRaw)).toString();
      pos.cost -= costPart;
      pos.realized += pnl;
      log('SELL', pos, fill.qty, fill.price, net, reason, pnl, fill);
      if (fraction >= 1) {
        s.closed.push({ strategy: pos.strategy, pnl: pos.realized, t: Date.now() });
        s.cooldown[addr] = Date.now() + 20 * 60000;
        delete s.positions[addr];
      }
      save();
      return pnl;
    }

    // Record an order the venue refused (no route, honeypot, too illiquid).
    function reject(coinOrPos, side, strategy, reason) {
      log('REJECT', { symbol: coinOrPos.symbol, addr: coinOrPos.addr, strategy }, 0, NaN, 0, `${side.toLowerCase()} rejected: ${reason}`, null, null);
      save();
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
        execCost: s.execCost,
        quotedFills: s.trades.filter((t) => t.src === 'jupiter').length,
        fills: s.trades.filter((t) => t.src).length,
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
      sellFraction,
      reject,
      mark,
      totals,
      recordEquity,
      strategyStats,
      inCooldown: (addr) => (s.cooldown[addr] || 0) > Date.now(),
      setCooldown(addr, ms) {
        s.cooldown[addr] = Date.now() + ms;
      },
      reset() {
        s = fresh();
        save();
      },
    };
  }

  SIM.portfolio = { createPortfolio, START_CASH };
})();
