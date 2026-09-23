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
    { mode: 'live', auto: true, maxOpen: 5, manualSize: 100, enabled: {} },
    store.get('settings', {})
  );
  for (const s of S.STRATEGIES) if (!(s.id in settings.enabled)) settings.enabled[s.id] = true;
  const saveSettings = () => store.set('settings', settings);

  const app = {
    settings,
    feed: null,
    portfolio: null,
    universe: new Map(), // addr -> { addr, firstSeen, misses, coin, hist, prevPrice, flashed }
    evals: new Map(),
    filter: 'ALL',
    status: { level: 'wait', text: 'Connecting…' },
    banner: '',
    solPrice: NaN,
    lastUpdate: 0,
  };

  let busy = false;
  let timer = null;
  let lastDiscover = 0;
  let lastSol = 0;
  let failures = 0;
  let everOk = false;

  function setMode(mode, banner, persist = true) {
    if (persist) {
      settings.mode = mode;
      saveSettings();
    }
    app.feed = mode === 'demo' ? SIM.market.createDemoFeed() : SIM.market.createLiveFeed();
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
      if (u.coin) app.evals.set(addr, S.evaluate(u.coin, u.hist, held[addr], settings.enabled, now));
    }
  }

  function autoTrade(now) {
    const port = app.portfolio;
    // Exits first, so freed cash and slots are available for entries.
    for (const pos of Object.values(port.state.positions)) {
      const ev = app.evals.get(pos.addr);
      if (!ev || ev.signal !== 'SELL' || !ev.exit) continue;
      if (ev.exit.tpIndex != null) pos.tpHit.push(ev.exit.tpIndex);
      port.sell(pos.addr, ev.exit.sell, app.universe.get(pos.addr).coin.price, ev.exit.reason);
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
      if (port.buy(app.universe.get(addr).coin, usd, ev.best.strategy.id, ev.reason)) {
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
        autoTrade(now);
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

  function currentPrice(addr) {
    const u = app.universe.get(addr);
    return u && u.coin ? u.coin.price : app.portfolio.state.positions[addr] && app.portfolio.state.positions[addr].last;
  }

  // ---- controls -------------------------------------------------------------
  function wire() {
    document.addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy]');
      const sell = e.target.closest('[data-sell]');
      const filter = e.target.closest('[data-filter]');
      if (buy) {
        const u = app.universe.get(buy.dataset.buy);
        if (u && u.coin) app.portfolio.buy(u.coin, settings.manualSize, 'manual', 'manual buy');
      } else if (sell) {
        const addr = sell.dataset.sell;
        app.portfolio.sell(addr, Number(sell.dataset.frac), currentPrice(addr), 'manual sell');
      } else if (filter) {
        app.filter = filter.dataset.filter;
      } else {
        return;
      }
      evaluateAll(Date.now());
      SIM.ui.render(app);
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
