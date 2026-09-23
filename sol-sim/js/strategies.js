// Strategy engine: safety filter, entry rules, exit rules, and the
// BUY / HOLD / SELL / AVOID signal shown for every coin.
//
// These are reconstructions of the momentum/memecoin playbooks commonly
// taught on crypto TikTok (volume breakouts, dip buys on trending coins,
// early low-cap gems, "take your initials out at 2x", trailing stops),
// written as explicit, testable rules.
(function () {
  const SIM = window.SIM;
  const { clamp } = SIM.util;

  const ratio = (t) => (t.b + 1) / (t.s + 1);

  // Derived features. `hist` is our own recorded price samples for this coin
  // (one per poll), used to confirm a move is still live, not stale.
  function features(c, hist) {
    const pace5 = c.vol.h1 / 12;
    let tick = 0;
    if (hist && hist.length >= 4) {
      const past = hist[hist.length - 4].p;
      if (past > 0) tick = (c.price / past - 1) * 100;
    }
    return {
      br5: ratio(c.tx.m5),
      br1: ratio(c.tx.h1),
      volAccel: pace5 > 0 ? c.vol.m5 / pace5 : 0,
      tick,
      txH1: c.tx.h1.b + c.tx.h1.s,
      liqMcap: c.mcap > 0 ? c.liq / c.mcap : 0,
    };
  }

  // Hard filters every strategy respects ("don't get rugged" rules).
  function safety(c, f) {
    const fails = [];
    if (c.liq < 15000) fails.push('liquidity under $15K');
    if (c.mcap < 30000) fails.push('market cap under $30K');
    if (f.liqMcap < 0.02) fails.push('liquidity too thin for market cap');
    if (f.txH1 < 40) fails.push('fewer than 40 trades in the last hour');
    if (c.ageH < 0.5) fails.push('pair younger than 30 minutes');
    if (c.ch.h1 < -40) fails.push('down more than 40% in 1h');
    return fails;
  }

  const n1 = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);

  const STRATEGIES = [
    {
      id: 'breakout',
      name: 'Volume Breakout',
      size: 0.1,
      summary: 'Buy when 5-minute volume explodes past its hourly pace while price and buyers push up. Take your initial out at 2×, trail the rest.',
      rules: [
        '5m volume ≥ 2× the average 5m volume of the last hour',
        '5m price change between +3% and +25% (not chasing a vertical candle)',
        '1h trend positive',
        'Buy transactions ≥ 1.3× sell transactions (5m)',
        'Price still rising on the live ticks we observed',
        'Exit: −20% stop loss · sell 50% at +100% · 25% trailing stop once up 30% · close after 2h or if flat after 30m',
      ],
      entry: (c, f) => [
        [f.volAccel >= 2, `5m volume ${f.volAccel.toFixed(1)}× hourly pace`],
        [c.ch.m5 >= 3 && c.ch.m5 <= 25, `5m ${n1(c.ch.m5)}%`],
        [c.ch.h1 > 0, `1h ${n1(c.ch.h1)}%`],
        [f.br5 >= 1.3, `buys ${f.br5.toFixed(2)}× sells`],
        [f.tick >= 0, 'rising on live ticks'],
      ],
      exit: { sl: -20, tp: [{ at: 100, sell: 0.5 }], trailArm: 30, trail: 25, maxHoldMin: 120, stallMin: 30, stallPct: 5 },
    },
    {
      id: 'dip',
      name: 'Trend Dip Buy',
      size: 0.1,
      summary: 'On coins already running hard (24h up 40%+), buy the pullback once buyers step back in. Quick scalps: half at +25%, rest at +50%.',
      rules: [
        '24h change ≥ +40% and 6h change ≥ 0% (a real uptrend)',
        'Pulling back: 5m between −12% and −2%, or 1h between −20% and −5%',
        'Bounce starting: live ticks turning up',
        'Buys ≥ sells in the last 5m',
        'Liquidity ≥ $30K',
        'Exit: −15% stop · sell 50% at +25% · rest at +50% · 12% trailing stop once up 15% · 90m max hold',
      ],
      entry: (c, f) => [
        [c.ch.h24 >= 40 && c.ch.h6 >= 0, `24h ${n1(c.ch.h24)}% / 6h ${n1(c.ch.h6)}%`],
        [(c.ch.m5 <= -2 && c.ch.m5 >= -12) || (c.ch.h1 <= -5 && c.ch.h1 >= -20), `pullback 5m ${n1(c.ch.m5)}% / 1h ${n1(c.ch.h1)}%`],
        [f.tick > 0, 'bounce on live ticks'],
        [f.br5 >= 1, `buys ${f.br5.toFixed(2)}× sells`],
        [c.liq >= 30000, 'liquidity ≥ $30K'],
      ],
      exit: { sl: -15, tp: [{ at: 25, sell: 0.5 }, { at: 50, sell: 1 }], trailArm: 15, trail: 12, maxHoldMin: 90, stallMin: 30, stallPct: 3 },
    },
    {
      id: 'gem',
      name: 'Early Low-Cap Gem',
      size: 0.05,
      summary: 'Small bets on fresh launches (under 24h, $50K–$1M cap) with strong buy pressure. Half at 2×, half again at 4×, let a moonbag ride.',
      rules: [
        'Pair age ≤ 24h',
        'Market cap between $50K and $1M',
        '1h change ≥ +15% with 5m not red',
        'Buys ≥ 1.2× sells over the last hour and ≥ 150 trades/h',
        'Liquidity ≥ $20K',
        'Half size (5% of equity) — most gems go to zero',
        'Exit: −30% stop · sell 50% at +100% · 50% of the rest at +300% · 30% trailing stop once up 50% · 4h max hold',
      ],
      entry: (c, f) => [
        [c.ageH <= 24, `age ${SIM.util.fmtAge(c.ageH)}`],
        [c.mcap >= 50000 && c.mcap <= 1e6, `mcap ${SIM.util.fmtCompact(c.mcap)}`],
        [c.ch.h1 >= 15 && c.ch.m5 >= 0, `1h ${n1(c.ch.h1)}%`],
        [f.br1 >= 1.2 && f.txH1 >= 150, `1h buys ${f.br1.toFixed(2)}× sells, ${f.txH1} trades`],
        [c.liq >= 20000, 'liquidity ≥ $20K'],
      ],
      exit: { sl: -30, tp: [{ at: 100, sell: 0.5 }, { at: 300, sell: 0.5 }], trailArm: 50, trail: 30, maxHoldMin: 240, stallMin: 45, stallPct: 5 },
    },
    {
      id: 'runner',
      name: 'Trending Runner',
      size: 0.08,
      summary: 'Ride established coins trending up on every timeframe (5m, 1h, 6h, 24h). Tight stop, trim a third at +40%, trail the rest.',
      rules: [
        'Up on every timeframe: 24h ≥ +20%, 6h ≥ +10%, 1h ≥ +5%, 5m ≥ +0.5%',
        'Market cap ≥ $250K',
        'Buys ≥ 1.1× sells over the last hour',
        '5m volume at or above its hourly pace',
        'Exit: −12% stop · sell 33% at +40% · 15% trailing stop once up 10% · 3h max hold',
      ],
      entry: (c, f) => [
        [c.ch.h24 >= 20 && c.ch.h6 >= 10, `24h ${n1(c.ch.h24)}% / 6h ${n1(c.ch.h6)}%`],
        [c.ch.h1 >= 5 && c.ch.m5 >= 0.5, `1h ${n1(c.ch.h1)}% / 5m ${n1(c.ch.m5)}%`],
        [c.mcap >= 250000, `mcap ${SIM.util.fmtCompact(c.mcap)}`],
        [f.br1 >= 1.1, `1h buys ${f.br1.toFixed(2)}× sells`],
        [f.volAccel >= 1, `5m volume ${f.volAccel.toFixed(1)}× pace`],
      ],
      exit: { sl: -12, tp: [{ at: 40, sell: 0.33 }], trailArm: 10, trail: 15, maxHoldMin: 180, stallMin: 40, stallPct: 3 },
    },
  ];
  const byId = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));

  // -100 (sellers in control) … +100 (strong upward momentum)
  function momentumScore(c, f) {
    const s =
      clamp(c.ch.m5, -20, 20) * 2 +
      clamp(c.ch.h1, -50, 50) * 0.4 +
      clamp(Math.log2(f.br5), -2, 2) * 12 +
      clamp(f.tick, -10, 10) * 1.6;
    return clamp(Math.round(s), -100, 100);
  }

  // Decide whether an open position should be (partly) sold right now.
  // Returns null to hold, or { sell: fractionOfRemaining, reason, tpIndex? }.
  function exitDecision(pos, c, f, now) {
    if (pos.entryLiq > 0 && c.liq < pos.entryLiq * 0.5) return { sell: 1, reason: 'liquidity pulled — rug protection' };
    const s = byId[pos.strategy];
    if (!s) return null; // manual positions are managed by the user
    const x = s.exit;
    const pnl = (c.price / pos.entryPrice - 1) * 100;
    const peakPnl = (pos.peak / pos.entryPrice - 1) * 100;
    const heldMin = (now - pos.openedAt) / 60000;
    if (pnl <= x.sl) return { sell: 1, reason: `stop loss (${x.sl}%)` };
    for (let i = 0; i < x.tp.length; i++) {
      if (!pos.tpHit.includes(i) && pnl >= x.tp[i].at) {
        return { sell: x.tp[i].sell, reason: `take profit +${x.tp[i].at}%`, tpIndex: i };
      }
    }
    if (peakPnl >= x.trailArm) {
      const dd = (1 - c.price / pos.peak) * 100;
      if (dd >= x.trail) return { sell: 1, reason: `trailing stop (−${x.trail}% from peak)` };
    }
    if (heldMin >= x.maxHoldMin) return { sell: 1, reason: 'max hold time reached' };
    if (heldMin >= x.stallMin && pnl < x.stallPct && peakPnl < x.trailArm) return { sell: 1, reason: 'stalled — momentum gone' };
    if (c.ch.m5 <= -10 && f.br5 < 0.6) return { sell: 1, reason: 'momentum flip — sellers dumping' };
    return null;
  }

  // Human-readable levels for an open position (shown in the positions table).
  function exitPlan(pos) {
    const s = byId[pos.strategy];
    if (!s) return { stop: NaN, target: NaN, trail: NaN };
    const x = s.exit;
    const nextTp = x.tp.find((_, i) => !pos.tpHit.includes(i));
    const armed = (pos.peak / pos.entryPrice - 1) * 100 >= x.trailArm;
    return {
      stop: pos.entryPrice * (1 + x.sl / 100),
      target: nextTp ? pos.entryPrice * (1 + nextTp.at / 100) : NaN,
      trail: armed ? pos.peak * (1 - x.trail / 100) : NaN,
    };
  }

  // Full evaluation for the scanner. `pos` is the open position, if any.
  function evaluate(c, hist, pos, enabled, now) {
    const f = features(c, hist);
    const score = momentumScore(c, f);
    const fails = safety(c, f);

    let best = null;
    for (const s of STRATEGIES) {
      if (!enabled[s.id]) continue;
      const checks = s.entry(c, f);
      const passed = checks.filter((k) => k[0]).length;
      const frac = passed / checks.length;
      if (!best || frac > best.frac) best = { strategy: s, checks, frac };
    }

    if (pos) {
      const d = exitDecision(pos, c, f, now);
      if (d) return { signal: 'SELL', score, f, fails, best, reason: d.reason, exit: d };
      return { signal: 'HOLD', score, f, fails, best, reason: `holding (${byId[pos.strategy] ? byId[pos.strategy].name : 'manual'})` };
    }
    if (fails.length) return { signal: 'AVOID', score, f, fails, best, reason: fails[0] };
    if (best && best.frac === 1) {
      return { signal: 'BUY', score, f, fails, best, reason: `${best.strategy.name}: ${best.checks.map((k) => k[1]).join(', ')}` };
    }
    if (score <= -35) return { signal: 'SELL', score, f, fails, best, reason: 'sellers in control — exit if holding' };
    const missing = best ? best.checks.filter((k) => !k[0]).map((k) => k[1]) : [];
    return {
      signal: 'HOLD',
      score,
      f,
      fails,
      best,
      reason: best ? `closest: ${best.strategy.name} (${Math.round(best.frac * 100)}%) — waiting on ${missing.join(', ')}` : 'no strategy enabled',
    };
  }

  SIM.strategies = { STRATEGIES, byId, features, safety, evaluate, exitDecision, exitPlan, momentumScore };
})();
