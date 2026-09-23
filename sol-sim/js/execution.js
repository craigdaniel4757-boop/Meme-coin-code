// Order execution for the paper portfolio.
//
// In live mode every simulated order is priced with a real Jupiter swap
// quote: the exact route and output amount a real USDC <-> token swap would
// get at that moment (pool fees, price impact and routing included). No
// transaction is ever built or signed; we only ask for the quote.
//
// Buys also quote selling the tokens straight back. That catches coins with
// no sell route (honeypots, frozen or untradable tokens) and measures the real
// round-trip cost before the simulator commits to the trade.
//
// When quotes are off (demo mode) or Jupiter can't be reached, fills fall back
// to a cost model and are flagged as estimates in the trade log.
(function () {
  const SIM = window.SIM;

  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // 6 decimals
  const MODEL = { slippage: 0.01, dexFee: 0.0025 };
  const NETWORK_FEE = 0.01; // $ per transaction (base + priority fee); real swaps pay it too
  const SLIPPAGE_BPS = 300;
  const MIN_GAP_MS = 1100; // keep well under free-tier rate limits

  // The venue answered, and the answer was "this order can't be filled".
  class OrderRejected extends Error {}
  class NoRoute extends Error {}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Share of a position's raw (on-chain integer) token amount.
  function rawPart(pos, fraction) {
    if (!pos.qtyRaw) return null;
    if (fraction >= 1) return pos.qtyRaw;
    return ((BigInt(pos.qtyRaw) * BigInt(Math.round(fraction * 1e6))) / 1000000n).toString();
  }

  // ---- modeled fills ----------------------------------------------------------
  function modelBuy(coin, usd) {
    const fee = usd * MODEL.dexFee + NETWORK_FEE;
    const price = coin.price * (1 + MODEL.slippage);
    return { qty: (usd - fee) / price, qtyRaw: null, price, fee, source: 'model', vsScreen: MODEL.slippage * 100 };
  }

  function modelSell(pos, fraction, screen) {
    const qty = pos.qty * fraction;
    const price = screen * (1 - MODEL.slippage);
    const gross = qty * price;
    const fee = gross * MODEL.dexFee + NETWORK_FEE;
    return { qty, qtyRaw: rawPart(pos, fraction), price, net: Math.max(0, gross - fee), fee, source: 'model', vsScreen: -MODEL.slippage * 100 };
  }

  // ---- Jupiter quote client ---------------------------------------------------
  function createJupiter(getKey) {
    const state = { ok: 0, fail: 0, lastOk: null, lastError: '', endpoint: '' };
    let last = 0;
    let chain = Promise.resolve();

    // Serialize calls with a minimum gap between them.
    function slot() {
      const p = chain.then(async () => {
        const wait = last + MIN_GAP_MS - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
      });
      chain = p.catch(() => {});
      return p;
    }

    function endpoints() {
      const key = (getKey() || '').trim();
      if (!key) return [{ url: 'https://lite-api.jup.ag/swap/v1/quote', headers: {} }];
      const headers = { 'x-api-key': key };
      return [
        { url: 'https://api.jup.ag/swap/v1/quote', headers },
        { url: 'https://api.jup.ag/swap/v2/order', headers },
      ];
    }

    async function fetchText(url, headers) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { headers, signal: ctrl.signal });
        return { status: res.status, ok: res.ok, body: await res.text() };
      } finally {
        clearTimeout(timer);
      }
    }

    const parse = (body) => {
      try {
        return JSON.parse(body);
      } catch (e) {
        return null;
      }
    };

    async function quote(inputMint, outputMint, amountRaw) {
      const qs = new URLSearchParams({
        inputMint,
        outputMint,
        amount: String(amountRaw),
        slippageBps: String(SLIPPAGE_BPS),
        restrictIntermediateTokens: 'true',
      });
      let lastErr = new Error('no Jupiter endpoint available');
      for (const ep of endpoints()) {
        for (let attempt = 0; attempt < 2; attempt++) {
          await slot();
          let res;
          try {
            res = await fetchText(`${ep.url}?${qs}`, ep.headers);
          } catch (e) {
            lastErr = new Error('Jupiter unreachable from this browser');
            break;
          }
          const data = parse(res.body);
          if (res.status === 429 && attempt === 0) {
            await sleep(1500);
            continue;
          }
          if (res.ok && data && data.outAmount && data.outAmount !== '0') {
            state.ok++;
            state.lastOk = true;
            state.endpoint = ep.url;
            return data;
          }
          if ((res.ok && data) || res.status === 400 || res.status === 422) {
            // Jupiter answered: there's no way to fill this order.
            state.lastOk = true;
            const msg = (data && (data.error || data.errorMessage || data.errorCode)) || 'no route';
            throw new NoRoute(String(msg));
          }
          lastErr = new Error(
            res.status === 401 || res.status === 403
              ? `Jupiter rejected the API key (HTTP ${res.status})`
              : res.status === 429
              ? 'Jupiter rate limit hit'
              : `Jupiter HTTP ${res.status}`
          );
          break; // try the next endpoint
        }
      }
      state.fail++;
      state.lastOk = false;
      state.lastError = lastErr.message;
      throw lastErr;
    }

    return { quote, state };
  }

  function routeLabel(q) {
    const plan = q.routePlan || [];
    const labels = plan.map((r) => r.swapInfo && r.swapInfo.label).filter(Boolean);
    return [...new Set(labels)].join(' → ');
  }

  // Jupiter speaks in raw integer amounts; DexScreener in whole tokens. Recover
  // the mint's decimals from the ratio (fees/impact only nudge it off an integer).
  function inferDecimals(spendUsd, outRaw, screenPrice) {
    if (!(outRaw > 0) || !(screenPrice > 0)) return null;
    const d = Math.log10(screenPrice / (spendUsd / outRaw));
    const r = Math.round(d);
    return r >= 0 && r <= 12 && Math.abs(d - r) <= 0.35 ? r : null;
  }

  // opts: { useQuotes(): bool, getKey(): string, maxRoundTripPct(): number }
  function createExecutor(opts) {
    const jup = createJupiter(opts.getKey);

    async function buy(coin, usd) {
      if (!opts.useQuotes()) return modelBuy(coin, usd);
      const spend = usd - NETWORK_FEE;
      const inRaw = Math.floor(spend * 1e6);
      let q;
      try {
        q = await jup.quote(USDC, coin.addr, inRaw);
      } catch (e) {
        if (e instanceof NoRoute) throw new OrderRejected(`no Jupiter route to buy (${e.message})`);
        return Object.assign(modelBuy(coin, usd), { note: e.message });
      }
      const dec = inferDecimals(spend, Number(q.outAmount), coin.price);
      if (dec == null) throw new OrderRejected('Jupiter price is far off the screen price; skipped');
      const qty = Number(q.outAmount) / Math.pow(10, dec);
      const price = spend / qty;

      let roundTrip = NaN;
      try {
        const back = await jup.quote(coin.addr, USDC, q.outAmount);
        roundTrip = (1 - Number(back.outAmount) / inRaw) * 100;
      } catch (e) {
        if (e instanceof NoRoute) throw new OrderRejected('no route to sell back, possible honeypot');
      }
      if (roundTrip > opts.maxRoundTripPct()) {
        throw new OrderRejected(`round-trip cost ${roundTrip.toFixed(1)}% is above your ${opts.maxRoundTripPct()}% limit; too illiquid`);
      }
      return {
        qty,
        qtyRaw: String(q.outAmount),
        price,
        fee: NETWORK_FEE,
        source: 'jupiter',
        route: routeLabel(q),
        vsScreen: (price / coin.price - 1) * 100,
        roundTrip,
      };
    }

    async function sell(pos, fraction, screen) {
      if (!opts.useQuotes() || !pos.qtyRaw) return modelSell(pos, fraction, screen);
      const amt = rawPart(pos, fraction);
      let q;
      try {
        q = await jup.quote(pos.addr, USDC, amt);
      } catch (e) {
        if (e instanceof NoRoute) throw new OrderRejected(`no Jupiter route to sell (${e.message})`);
        return Object.assign(modelSell(pos, fraction, screen), { note: e.message });
      }
      const qty = fraction >= 1 ? pos.qty : pos.qty * (Number(amt) / Number(pos.qtyRaw));
      const gross = Number(q.outAmount) / 1e6;
      return {
        qty,
        qtyRaw: amt,
        price: gross / qty,
        net: Math.max(0, gross - NETWORK_FEE),
        fee: NETWORK_FEE,
        source: 'jupiter',
        route: routeLabel(q),
        vsScreen: (gross / qty / screen - 1) * 100,
      };
    }

    return { buy, sell, jupiter: jup.state };
  }

  SIM.execution = { createExecutor, OrderRejected, inferDecimals, MODEL, NETWORK_FEE };
})();
