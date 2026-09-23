// Main loop: discover coins -> poll prices -> evaluate signals -> auto-trade
// the paper portfolio -> render. Also wires up the controls.
(function () {
  const SIM = window.SIM;
  const { store } = SIM.util;
  const S = SIM.strategies;

  const POLL_MS = { live: 5000, demo: 2500 };
  const DISCOVER_MS = 60000;
  const MAX_UNIVERSE = 90;
  const HIST_LEN = 60; // price samples kept per coin for sparklines + tick momentum
  const MAX_NEW_PER_TICK = 2;

  const settings = Object.assign(
    { mode: 'live', auto: true, maxOpen: 5, manualSize: 100, enabled: {}, realQuotes: true, jupKey: '', maxRoundTrip: 15 },
    store.get('settings', {})
  );
  for (const s of S.STRATEGIES) if (!(s.id in settings.enabled)) settings.enabled[s.id] = true;
  const saveSettings = () => store.set('settings', settings);

  const app = {
    settings,
    feed: null,
    executor: null,
    portfolio: null,
    universe: new Map(), // addr -> { addr, firstSeen, misses, coin, hist, prevPrice, flashed }
    evals: new Map(),
    filter: 'ALL',
    status: { level: 'wait', text: 'Connecting…' },
    banner: '',
    orderError: '',
    solPrice: NaN,
    lastUpdate: 0,
  };

  let busy = false;
  let timer = null;
  let lastDiscover = 0;
  let lastSol = 0;
  let failures = 0;
  let everOk = false;
  const pending = new Set(); // addrs with an order in flight
  const sellRetryAt = new Map(); // addr -> earliest time to retry a rejected sell
  const flagged = new Map(); // addr -> { reason, until } after a rejected buy

  function setMode(mode, banner, persist = true) {
    if (persist) {
      settings.mode = mode;
      saveSettings();
    }
    app.feed = mode === 'demo' ? SIM.market.createDemoFeed() : SIM.market.createLiveFeed();
    app.executor = SIM.execution.createExecutor({
      useQuotes: () => mode === 'live' && settings.realQuotes,
      getKey: () => settings.jupKey,
      maxRoundTripPct: () => settings.maxRoundTrip,
    });
    app.portfolio = SIM.portfolio.createPortfolio('portfolio:' + mode);
    app.universe = new Map();
    app.evals = new Map();
    app.banner = banner || '';
    app.solPrice = NaN;
    app.lastUpdate = 0;
    app.status = { level: 'wait', text: `Connecting to ${app.feed.label}…` };
    lastDiscover = 0;
    lastSol = 0;
    failures = 0;
    everOk = false;
    pending.clear();
    sellRetryAt.clear();
    flagged.clear();
    clearInterval(timer);
    timer = setInterval(tick, POLL_MS[mode]);
    SIM.ui.render(app);
    tick();
  }

  function track(addr) {
    if (!app.universe.has(addr)) {
      app.universe.set(addr, { addr, firstSeen: Date.now(), misses: 0, coin: null, hist: [], prevPrice: NaN, flashed: true });
    }
  }

  function prune() {
    const held = app.portfolio.state.positions;
    for (const [addr, u] of app.universe) {
      if (!held[addr] && u.misses >= 3) app.universe.delete(addr);
    }
    if (app.universe.size <= MAX_UNIVERSE) return;
    const seeds = new Set(SIM.market.SEEDS);
    const droppable = [...app.universe.values()]
      .filter((u) => !held[u.addr] && !seeds.has(u.addr))
      .sort((a, b) => ((a.coin && a.coin.vol.h1) || 0) - ((b.coin && b.coin.vol.h1) || 0));
    for (const u of droppable.slice(0, app.universe.size - MAX_UNIVERSE)) app.universe.delete(u.addr);
  }

  function ingest(snaps) {
    for (const [addr, u] of app.universe) {
      const c = snaps.get(addr);
      if (!c) {
        u.misses++;
        continue;
      }
      u.misses = 0;
      u.prevPrice = u.coin ? u.coin.price : NaN;
      u.flashed = false;
      u.coin = c;
      u.hist.push({ t: c.ts, p: c.price });
      if (u.hist.length > HIST_LEN) u.hist.shift();
    }
  }

  function evaluateAll(now) {
    const held = app.portfolio.state.positions;
    app.evals = new Map();
    for (const [addr, u] of app.universe) {
      if (!u.coin) continue;
      const ev = S.evaluate(u.coin, u.hist, held[addr], settings.enabled, now);
      const flag = flagged.get(addr);
      if (!held[addr] && flag && flag.until > now) {
        ev.signal = 'AVOID';
        ev.reason = `order rejected: ${flag.reason}`;
      } else if (ev.signal === 'BUY' && app.portfolio.inCooldown(addr)) {
        ev.reason = `cooling down after a recent exit · ${ev.reason}`;
      }
      app.evals.set(addr, ev);
    }
  }

  // Orders are async (Jupiter quotes), so each one re-checks that the world
  // hasn't changed underneath it (mode switch, reset, position already gone).
  async function placeBuy(coin, usd, strategy, reason) {
    if (pending.has(coin.addr)) return false;
    const port = app.portfolio;
    const exec = app.executor;
    pending.add(coin.addr);
    try {
      const fill = await exec.buy(coin, usd);
      if (port !== app.portfolio) return false;
      return !!port.buy(coin, usd, strategy, reason, fill);
    } catch (e) {
      if (!(e instanceof SIM.execution.OrderRejected) || port !== app.portfolio) throw e;
      port.reject(coin, 'BUY', strategy, e.message);
      port.setCooldown(coin.addr, 10 * 60000);
      flagged.set(coin.addr, { reason: e.message, until: Date.now() + 10 * 60000 });
      return false;
    } finally {
      pending.delete(coin.addr);
    }
  }

  async function placeSell(addr, fraction, reason, tpIndex) {
    const port = app.portfolio;
    const pos = port.state.positions[addr];
    if (!pos || pending.has(addr)) return false;
    const u = app.universe.get(addr);
    const screen = u && u.coin ? u.coin.price : pos.last;
    fraction = port.sellFraction(addr, fraction, screen);
    pending.add(addr);
    try {
      const fill = await app.executor.sell(pos, fraction, screen);
      if (port !== app.portfolio || port.state.positions[addr] !== pos) return false;
      if (tpIndex != null) pos.tpHit.push(tpIndex);
      port.sell(addr, fraction, fill, reason, screen);
      return true;
    } catch (e) {
      if (!(e instanceof SIM.execution.OrderRejected) || port !== app.portfolio) throw e;
      port.reject(pos, 'SELL', pos.strategy, e.message);
      sellRetryAt.set(addr, Date.now() + 30000);
      return false;
    } finally {
      pending.delete(addr);
    }
  }

  async function autoTrade(now) {
    const port = app.portfolio;
    // Exits first, so freed cash and slots are available for entries.
    for (const pos of Object.values(port.state.positions)) {
      const ev = app.evals.get(pos.addr);
      if (!ev || ev.signal !== 'SELL' || !ev.exit || (sellRetryAt.get(pos.addr) || 0) > now) continue;
      await placeSell(pos.addr, ev.exit.sell, ev.exit.reason, ev.exit.tpIndex);
    }
    let slots = settings.maxOpen - Object.keys(port.state.positions).length;
    const buys = [...app.evals]
      .filter(([addr, ev]) => ev.signal === 'BUY' && !port.state.positions[addr] && !port.inCooldown(addr) && app.universe.get(addr).hist.length >= 4)
      .sort((a, b) => b[1].score - a[1].score);
    let opened = 0;
    for (const [addr, ev] of buys) {
      if (slots <= 0 || opened >= MAX_NEW_PER_TICK) break;
      const usd = Math.min(ev.best.strategy.size * port.totals().equity, port.state.cash);
      if (usd < 10) break;
      if (await placeBuy(app.universe.get(addr).coin, usd, ev.best.strategy.id, ev.reason)) {
        slots--;
        opened++;
      }
    }
  }

  async function tick() {
    if (busy) return;
    busy = true;
    const feed = app.feed;
    try {
      const now = Date.now();
      if (now - lastDiscover > DISCOVER_MS || app.universe.size === 0) {
        try {
          (await feed.discover()).forEach(track);
          lastDiscover = now;
        } catch (e) {
          if (!app.universe.size) throw e;
        }
      }
      if (feed !== app.feed) return; // mode switched while awaiting
      Object.keys(app.portfolio.state.positions).forEach(track);
      prune();

      const held = app.portfolio.state.positions;
      const addrs = [...app.universe.keys()].sort((a, b) => (held[b] ? 1 : 0) - (held[a] ? 1 : 0));
      const snaps = await feed.quote(addrs);
      if (feed !== app.feed) return;
      if (!snaps.size) throw new Error('no prices returned');

      ingest(snaps);
      const prices = new Map([...app.universe].filter(([, u]) => u.coin).map(([a, u]) => [a, u.coin.price]));
      app.portfolio.mark(prices);
      evaluateAll(now);
      if (settings.auto) {
        try {
          await autoTrade(now);
          app.orderError = '';
        } catch (e) {
          app.orderError = e.message || String(e); // an order bug must not look like a feed outage
        }
        if (feed !== app.feed) return;
        evaluateAll(now); // refresh signals for coins we just traded
      }
      app.portfolio.recordEquity();

      if (now - lastSol > 30000) {
        lastSol = now;
        feed.solPrice().then((p) => (app.solPrice = p)).catch(() => {});
      }
      failures = 0;
      everOk = true;
      app.lastUpdate = Date.now();
      app.status = { level: 'ok', text: `${feed.label} · ${snaps.size} coins` };
    } catch (err) {
      if (feed !== app.feed) return;
      failures++;
      app.status = { level: 'err', text: `Feed error (${failures}): ${err.message || err}` };
      if (feed.kind === 'live' && !everOk && failures >= 2) {
        setMode('demo', 'Could not reach the live DexScreener API from this browser, so the simulator switched to the synthetic demo market. Switch back to “Live DexScreener” any time.', false);
        return;
      }
    } finally {
      busy = false;
      if (feed === app.feed) SIM.ui.render(app);
    }
  }

  // ---- controls -------------------------------------------------------------
  function wire() {
    const rerender = () => {
      evaluateAll(Date.now());
      SIM.ui.render(app);
    };
    const report = (err) => {
      app.status = { level: 'err', text: `Order error: ${err.message || err}` };
      SIM.ui.render(app);
    };
    document.addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy]');
      const sell = e.target.closest('[data-sell]');
      const filter = e.target.closest('[data-filter]');
      if (buy) {
        const u = app.universe.get(buy.dataset.buy);
        const usd = Math.min(settings.manualSize, app.portfolio.state.cash);
        if (!u || !u.coin || usd < 5) return;
        buy.disabled = true;
        buy.textContent = 'Quoting…';
        placeBuy(u.coin, usd, 'manual', 'manual buy').catch(report).finally(rerender);
      } else if (sell) {
        sell.disabled = true;
        sell.textContent = 'Quoting…';
        placeSell(sell.dataset.sell, Number(sell.dataset.frac), 'manual sell').catch(report).finally(rerender);
      } else if (filter) {
        app.filter = filter.dataset.filter;
        rerender();
      }
    });

    document.getElementById('strategies').addEventListener('change', (e) => {
      const id = e.target.dataset.strategy;
      if (!id) return;
      settings.enabled[id] = e.target.checked;
      saveSettings();
      evaluateAll(Date.now());
      SIM.ui.render(app);
    });

    document.getElementById('auto-toggle').addEventListener('change', (e) => {
      settings.auto = e.target.checked;
      saveSettings();
      SIM.ui.render(app);
    });

    document.getElementById('mode-select').addEventListener('change', (e) => setMode(e.target.value));

    const manual = document.getElementById('manual-size');
    manual.value = settings.manualSize;
    manual.addEventListener('change', () => {
      const v = Math.round(Number(manual.value));
      settings.manualSize = v >= 5 ? v : 100;
      manual.value = settings.manualSize;
      saveSettings();
      SIM.ui.render(app);
    });

    const quotes = document.getElementById('quotes-toggle');
    quotes.checked = settings.realQuotes;
    quotes.addEventListener('change', () => {
      settings.realQuotes = quotes.checked;
      saveSettings();
      SIM.ui.render(app);
    });

    const key = document.getElementById('jup-key');
    key.value = settings.jupKey;
    key.addEventListener('change', () => {
      settings.jupKey = key.value.trim();
      saveSettings();
      SIM.ui.render(app);
    });

    const maxRt = document.getElementById('max-rt');
    maxRt.value = settings.maxRoundTrip;
    maxRt.addEventListener('change', () => {
      const v = Number(maxRt.value);
      settings.maxRoundTrip = v >= 1 && v <= 90 ? v : 15;
      maxRt.value = settings.maxRoundTrip;
      saveSettings();
    });

    const maxOpen = document.getElementById('max-open');
    maxOpen.value = settings.maxOpen;
    maxOpen.addEventListener('change', () => {
      const v = Math.round(Number(maxOpen.value));
      settings.maxOpen = v >= 1 && v <= 20 ? v : 5;
      maxOpen.value = settings.maxOpen;
      saveSettings();
      SIM.ui.render(app);
    });

    // Two-step reset (no blocking confirm dialog).
    const reset = document.getElementById('reset-btn');
    let armedUntil = 0;
    reset.addEventListener('click', () => {
      if (Date.now() < armedUntil) {
        app.portfolio.reset();
        armedUntil = 0;
        reset.textContent = 'Reset to $1,000';
        evaluateAll(Date.now());
        SIM.ui.render(app);
        return;
      }
      armedUntil = Date.now() + 4000;
      reset.textContent = 'Click again to confirm';
      setTimeout(() => {
        if (Date.now() >= armedUntil) reset.textContent = 'Reset to $1,000';
      }, 4100);
    });

    window.addEventListener('resize', () => SIM.ui.renderChart(app));
    setInterval(() => SIM.ui.renderClock(app), 1000);
  }

  wire();
  const params = new URLSearchParams(location.search);
  setMode(params.get('mode') === 'demo' || params.get('mode') === 'live' ? params.get('mode') : settings.mode);

  SIM.app = app; // handy for poking at state from the console
})();
