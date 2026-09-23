// Market data feeds. Both feeds expose the same interface so the strategy
// engine and portfolio never care where prices come from:
//   discover() -> Promise<string[]>            token addresses worth watching
//   quote(addrs) -> Promise<Map<addr, Coin>>   latest snapshot per token
//   solPrice() -> Promise<number>
//
// Coin snapshot shape (normalized from DexScreener's pair object):
//   { addr, symbol, name, url, image, dex, price,
//     ch:{m5,h1,h6,h24}, vol:{m5,h1,h6,h24}, tx:{m5:{b,s},h1:{b,s},h24:{b,s}},
//     liq, mcap, ageH, ts }
(function () {
  const SIM = window.SIM;
  const API = 'https://api.dexscreener.com';
  const WSOL = 'So11111111111111111111111111111111111111112';
  const NOT_MEMES = new Set([
    WSOL,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  ]);
  // Always-on watchlist of established Solana memes so the board is never empty.
  const SEEDS = [
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
    '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', // POPCAT
  ];
  const CHUNK = 30; // DexScreener /tokens/v1 accepts up to 30 addresses per call

  const num = (x, d = 0) => {
    const n = Number(x);
    return isFinite(n) ? n : d;
  };

  async function getJSON(path, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function normalize(pair) {
    const pc = pair.priceChange || {};
    const v = pair.volume || {};
    const tx = pair.txns || {};
    const t = (k) => ({ b: num(tx[k] && tx[k].buys), s: num(tx[k] && tx[k].sells) });
    const created = num(pair.pairCreatedAt, 0);
    return {
      addr: pair.baseToken.address,
      symbol: pair.baseToken.symbol || '???',
      name: pair.baseToken.name || '',
      url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`,
      image: (pair.info && pair.info.imageUrl) || '',
      dex: pair.dexId || '',
      price: num(pair.priceUsd),
      ch: { m5: num(pc.m5), h1: num(pc.h1), h6: num(pc.h6), h24: num(pc.h24) },
      vol: { m5: num(v.m5), h1: num(v.h1), h6: num(v.h6), h24: num(v.h24) },
      tx: { m5: t('m5'), h1: t('h1'), h24: t('h24') },
      liq: num(pair.liquidity && pair.liquidity.usd),
      mcap: num(pair.marketCap || pair.fdv),
      ageH: created ? (Date.now() - created) / 3.6e6 : Infinity,
      ts: Date.now(),
    };
  }

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function createLiveFeed() {
    return {
      kind: 'live',
      label: 'Live · DexScreener',

      async discover() {
        const lists = await Promise.allSettled([
          getJSON('/token-boosts/latest/v1'),
          getJSON('/token-boosts/top/v1'),
          getJSON('/token-profiles/latest/v1'),
        ]);
        const out = new Set(SEEDS);
        let anyOk = false;
        for (const r of lists) {
          if (r.status !== 'fulfilled') continue;
          anyOk = true;
          const arr = Array.isArray(r.value) ? r.value : [r.value];
          for (const it of arr) {
            if (it && it.chainId === 'solana' && it.tokenAddress && !NOT_MEMES.has(it.tokenAddress)) {
              out.add(it.tokenAddress);
            }
          }
        }
        if (!anyOk) throw new Error('DexScreener discovery unreachable');
        return [...out];
      },

      async quote(addrs) {
        const wanted = new Set(addrs);
        const res = new Map();
        const parts = chunk(addrs, CHUNK);
        const results = await Promise.allSettled(parts.map((c) => getJSON('/tokens/v1/solana/' + c.join(','))));
        let anyOk = false;
        for (const r of results) {
          if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
          anyOk = true;
          for (const pair of r.value) {
            const base = pair && pair.chainId === 'solana' && pair.baseToken && pair.baseToken.address;
            if (!base || !wanted.has(base) || !(num(pair.priceUsd) > 0)) continue;
            // A token can trade in several pools; use the deepest one.
            const coin = normalize(pair);
            const prev = res.get(base);
            if (!prev || coin.liq > prev.liq) res.set(base, coin);
          }
        }
        if (!anyOk && parts.length) throw new Error('DexScreener price feed unreachable');
        return res;
      },

      async solPrice() {
        const pairs = await getJSON('/tokens/v1/solana/' + WSOL);
        let best = null;
        for (const p of pairs || []) {
          if (p.baseToken && p.baseToken.address === WSOL && (!best || num(p.liquidity && p.liquidity.usd) > num(best.liquidity && best.liquidity.usd))) best = p;
        }
        return best ? num(best.priceUsd) : NaN;
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Demo feed: a synthetic memecoin market (regime-switching random walk with
  // pumps, dumps, jumps and the occasional rug). Used when the live API is
  // unreachable, or when the user picks it to watch the strategies work fast.
  // ---------------------------------------------------------------------------
  const DEMO_NAMES = [
    ['PEPSOL', 'Pepe on Sol'], ['CATWIF', 'Cat Wif Hat'], ['BONKER', 'Bonker'], ['MOODENG', 'Baby Hippo'],
    ['GIGA', 'Giga Chad'], ['FROGE', 'Froge'], ['DOGEAI', 'Doge AI'], ['SLERF2', 'Slerf 2'],
    ['MEW2', 'Cat Mew'], ['PNUT', 'Peanut Squirrel'], ['WOJAK', 'Wojak'], ['SAMO2', 'Samo Returns'],
    ['TRUMPY', 'Trumpy'], ['BOME2', 'Book of Memes'], ['GOAT', 'Goatseus'], ['HAMSTR', 'Hamster Kombat'],
    ['CHILLGUY', 'Just a Chill Guy'], ['MOTHER', 'Mother'], ['RETARDIO', 'Retardio'], ['SIGMA', 'Sigma'],
    ['PONKE2', 'Ponke'], ['MANEKI', 'Maneki'], ['FWOG', 'Fwog'], ['SPX', 'SPX6900'],
  ];
  const STEP_S = 10; // simulation resolution in seconds
  const KEEP = (24 * 3600) / STEP_S; // 24h of steps
  const DEMO_SPEED = 3; // demo market runs 3× real time so trades happen quickly

  function gauss() {
    let u = 0;
    let v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  function createDemoFeed() {
    const start = Date.now();
    const coins = DEMO_NAMES.map(([symbol, name], i) => {
      const mcap = Math.pow(10, rand(4.8, 7.6));
      return {
        addr: `demo${i}${symbol}`,
        symbol,
        name,
        supply: 1e9,
        price: mcap / 1e9,
        liqFrac: rand(0.06, 0.22),
        sigma: rand(0.006, 0.015),
        baseVol: Math.pow(10, rand(1.5, 3.2)), // $ per 10s in a quiet market
        regime: 'chop',
        regimeLeft: 30,
        rugged: false,
        createdAt: start - rand(0.6, 400) * 3.6e6,
        hist: [], // {p, v, b, s} per step
      };
    });

    const REGIMES = [
      ['pump', 0.14, 0.0035],
      ['dump', 0.2, -0.0025],
      ['chop', 0.66, 0],
    ];

    function step(c) {
      if (--c.regimeLeft <= 0) {
        let x = Math.random();
        for (const [name, p] of REGIMES) {
          if ((x -= p) <= 0) {
            c.regime = name;
            break;
          }
        }
        c.regimeLeft = Math.round(rand(20, 120));
      }
      const drift = REGIMES.find((r) => r[0] === c.regime)[2];
      let r = drift + c.sigma * gauss();
      if (Math.random() < 0.002) r += gauss() * 0.15; // news / whale
      if (!c.rugged && Math.random() < 0.000012) {
        r += Math.log(0.07); // rug pull
        c.rugged = true;
        c.liqFrac = 0.004;
        c.regime = 'dump';
        c.regimeLeft = 200;
      }
      c.price = Math.max(1e-12, c.price * Math.exp(r));
      const vol = c.baseVol * (1 + 40 * Math.abs(r)) * (c.regime === 'pump' ? 2.5 : 1) * rand(0.5, 1.5);
      const n = Math.max(1, Math.round(vol / rand(40, 160)));
      const buyShare = SIM.util.clamp(0.5 + r * 25 + (c.regime === 'pump' ? 0.08 : c.regime === 'dump' ? -0.08 : 0), 0.1, 0.9);
      const b = Math.round(n * buyShare);
      c.hist.push({ p: c.price, v: vol, b, s: n - b });
      if (c.hist.length > KEEP) c.hist.shift();
    }

    // Pre-roll 24h of history so 1h/6h/24h stats exist from the first tick.
    // Then rescale so each coin lands on its intended market cap today.
    for (const c of coins) {
      const target = c.price;
      for (let i = 0; i < KEEP; i++) step(c);
      const k = target / c.price;
      for (const h of c.hist) h.p *= k;
      c.price = target;
    }
    let simT = start;

    function snapshot(c) {
      const h = c.hist;
      const back = (steps) => h[Math.max(0, h.length - 1 - steps)].p;
      const pct = (steps) => (c.price / back(steps) - 1) * 100;
      const sum = (steps, k) => {
        let t = 0;
        for (let i = Math.max(0, h.length - steps); i < h.length; i++) t += h[i][k];
        return t;
      };
      const W = { m5: 30, h1: 360, h6: 2160, h24: 8640 };
      const tx = (k) => ({ b: sum(W[k], 'b'), s: sum(W[k], 's') });
      const mcap = c.price * c.supply;
      return {
        addr: c.addr,
        symbol: c.symbol,
        name: c.name + ' (demo)',
        url: '',
        image: '',
        dex: 'demo',
        price: c.price,
        ch: { m5: pct(W.m5), h1: pct(W.h1), h6: pct(W.h6), h24: pct(W.h24) },
        vol: { m5: sum(W.m5, 'v'), h1: sum(W.h1, 'v'), h6: sum(W.h6, 'v'), h24: sum(W.h24, 'v') },
        tx: { m5: tx('m5'), h1: tx('h1'), h24: tx('h24') },
        liq: mcap * c.liqFrac,
        mcap,
        ageH: (Date.now() - c.createdAt) / 3.6e6,
        ts: Date.now(),
      };
    }

    return {
      kind: 'demo',
      label: 'Demo market (synthetic)',
      async discover() {
        return coins.map((c) => c.addr);
      },
      async quote(addrs) {
        // Advance the market to "now" (capped so a backgrounded tab doesn't stall).
        const due = Math.floor(((Date.now() - simT) / 1000 / STEP_S) * DEMO_SPEED);
        const steps = Math.min(360, due);
        simT = due > steps ? Date.now() : simT + (steps * STEP_S * 1000) / DEMO_SPEED;
        for (const c of coins) for (let i = 0; i < steps; i++) step(c);
        const wanted = new Set(addrs);
        const res = new Map();
        for (const c of coins) if (wanted.has(c.addr)) res.set(c.addr, snapshot(c));
        return res;
      },
      async solPrice() {
        return NaN;
      },
    };
  }

  SIM.market = { createLiveFeed, createDemoFeed, SEEDS };
})();
