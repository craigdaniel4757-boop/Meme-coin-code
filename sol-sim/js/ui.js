// DOM rendering. Everything is re-rendered from app state after each price
// tick; a 1-second clock only refreshes relative times.
(function () {
  const SIM = window.SIM;
  const U = SIM.util;
  const $ = (id) => document.getElementById(id);

  const SIGNAL_ORDER = { BUY: 0, SELL: 1, HOLD: 2, AVOID: 3 };
  const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
  const stratName = (id) => (SIM.strategies.byId[id] ? SIM.strategies.byId[id].name : 'Manual');

  function coinCell(c, addr) {
    const img = c && c.image ? `<img src="${U.esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg">${U.esc(((c && c.symbol) || '?').slice(0, 2))}</span>`;
    const sym = U.esc((c && c.symbol) || addr.slice(0, 6));
    const link = c && c.url ? `<a href="${U.esc(c.url)}" target="_blank" rel="noopener" title="Open on DexScreener">${sym}</a>` : sym;
    const sub = c ? `${U.esc(c.name).slice(0, 22)}${isFinite(c.ageH) ? ' · ' + U.fmtAge(c.ageH) : ''}` : '';
    return `<div class="coin">${img}<div><b>${link}</b><small>${sub}</small></div></div>`;
  }

  function badge(signal, reason) {
    return `<span class="badge ${signal.toLowerCase()}" title="${U.esc(reason || '')}">${signal}</span>`;
  }

  function scoreBar(score) {
    const w = Math.abs(score) / 2; // 100 -> 50% of the bar
    const side = score >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
    return `<div class="score" title="Momentum score ${score}"><i class="${score >= 0 ? 'pos' : 'neg'}" style="${side}"></i><span>${score > 0 ? '+' : ''}${score}</span></div>`;
  }

  function renderKpis(app) {
    const t = app.portfolio.totals();
    const set = (id, text, klass) => {
      const el = $(id);
      el.textContent = text;
      if (klass !== undefined) el.className = 'v ' + klass;
    };
    set('k-equity', U.fmtUsd(t.equity));
    set('k-pnl', U.fmtSignedUsd(t.pnl), cls(t.pnl));
    set('k-pnlpct', U.fmtPct(t.pnlPct, 2), cls(t.pnlPct));
    set('k-realized', U.fmtSignedUsd(t.realized), cls(t.realized));
    set('k-unrealized', U.fmtSignedUsd(t.unrealized), cls(t.unrealized));
    set('k-cash', U.fmtUsd(t.cash));
    set('k-winrate', isFinite(t.winRate) ? `${t.winRate.toFixed(0)}%` : '—');
    $('k-winrate-sub').textContent = `${t.closedCount} closed trade${t.closedCount === 1 ? '' : 's'}`;
    const open = Object.keys(app.portfolio.state.positions).length;
    set('k-open', `${open} / ${app.settings.maxOpen}`);
    $('k-fees-sub').textContent = `fees paid ${U.fmtUsd(t.fees)}`;
    const big = $('pnl-hero');
    big.className = 'hero ' + cls(t.pnl);
    document.title = `${U.fmtSignedUsd(t.pnl)} (${U.fmtPct(t.pnlPct, 1)}) · SOL Paper Desk`;
  }

  function renderPositions(app) {
    const rows = Object.values(app.portfolio.state.positions);
    const body = $('positions-body');
    $('positions-empty').hidden = rows.length > 0;
    body.innerHTML = rows
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((p) => {
        const u = app.universe.get(p.addr);
        const c = u && u.coin;
        const value = p.qty * p.last;
        const pnl = value - p.cost + p.realized;
        const pnlPct = (p.last / p.entryPrice - 1) * 100;
        const peakPct = (p.peak / p.entryPrice - 1) * 100;
        const plan = SIM.strategies.exitPlan(p);
        const ev = app.evals.get(p.addr);
        const signal = ev ? ev.signal : 'HOLD';
        const levels = [
          isFinite(plan.stop) ? `<span class="down">SL ${U.fmtPrice(plan.stop)}</span>` : '',
          isFinite(plan.target) ? `<span class="up">TP ${U.fmtPrice(plan.target)}</span>` : '',
          isFinite(plan.trail) ? `<span>Trail ${U.fmtPrice(plan.trail)}</span>` : '',
        ].filter(Boolean).join('<br>') || '<span class="muted">manual</span>';
        return `<tr>
          <td>${coinCell(c || p, p.addr)}</td>
          <td><span class="chip">${U.esc(stratName(p.strategy))}</span></td>
          <td class="num">${U.fmtPrice(p.entryPrice)}</td>
          <td class="num ${flash(u)}">${U.fmtPrice(p.last)}</td>
          <td class="num">${U.fmtUsd(value)}<small>cost ${U.fmtUsd(p.cost)}</small></td>
          <td class="num ${cls(pnl)}"><b>${U.fmtSignedUsd(pnl)}</b><small>${U.fmtPct(pnlPct)}</small></td>
          <td class="num ${cls(peakPct)}">${U.fmtPct(peakPct)}</td>
          <td class="num" data-since="${p.openedAt}">${U.fmtDuration(Date.now() - p.openedAt)}</td>
          <td class="num levels">${levels}</td>
          <td>${badge(signal, ev && ev.reason)}<small class="reason">${U.esc((ev && ev.reason) || '')}</small></td>
          <td class="actions">
            <button class="btn sm" data-sell="${U.esc(p.addr)}" data-frac="0.5">Sell 50%</button>
            <button class="btn sm danger" data-sell="${U.esc(p.addr)}" data-frac="1">Sell all</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  function flash(u) {
    if (!u || !u.coin || !(u.prevPrice > 0) || u.flashed) return '';
    return u.coin.price > u.prevPrice ? 'flash-up' : u.coin.price < u.prevPrice ? 'flash-down' : '';
  }

  function renderScanner(app) {
    const counts = { ALL: 0, BUY: 0, HOLD: 0, SELL: 0, AVOID: 0 };
    const rows = [];
    for (const [addr, ev] of app.evals) {
      const u = app.universe.get(addr);
      if (!u || !u.coin) continue;
      counts.ALL++;
      counts[ev.signal]++;
      if (app.filter !== 'ALL' && ev.signal !== app.filter) continue;
      rows.push({ addr, u, ev });
    }
    rows.sort((a, b) => SIGNAL_ORDER[a.ev.signal] - SIGNAL_ORDER[b.ev.signal] || b.ev.score - a.ev.score);
    for (const k of Object.keys(counts)) {
      const el = document.querySelector(`[data-filter="${k}"] .n`);
      if (el) el.textContent = counts[k];
    }
    document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === app.filter));
    $('scanner-empty').hidden = rows.length > 0;
    $('scanner-empty').textContent = counts.ALL ? 'No coins with this signal right now.' : 'Loading market data…';

    const held = app.portfolio.state.positions;
    const manualAmt = app.settings.manualSize;
    $('scanner-body').innerHTML = rows
      .map(({ addr, u, ev }) => {
        const c = u.coin;
        const br = ev.f.br5;
        const canBuy = !held[addr] && app.portfolio.state.cash >= 5;
        return `<tr class="${held[addr] ? 'held' : ''}">
          <td>${coinCell(c, addr)}</td>
          <td class="num ${flash(u)}">${U.fmtPrice(c.price)}</td>
          <td>${SIM.chart.sparkline(u.hist)}</td>
          <td class="num ${cls(c.ch.m5)}">${U.fmtPct(c.ch.m5)}</td>
          <td class="num ${cls(c.ch.h1)}">${U.fmtPct(c.ch.h1)}</td>
          <td class="num ${cls(c.ch.h24)}">${U.fmtPct(c.ch.h24, 0)}</td>
          <td class="num">${U.fmtCompact(c.vol.m5)}<small>${ev.f.volAccel.toFixed(1)}× pace</small></td>
          <td class="num ${br >= 1.2 ? 'up' : br <= 0.8 ? 'down' : ''}">${c.tx.m5.b}/${c.tx.m5.s}<small>${br.toFixed(2)}×</small></td>
          <td class="num">${U.fmtCompact(c.liq)}</td>
          <td class="num">${U.fmtCompact(c.mcap)}</td>
          <td>${scoreBar(ev.score)}</td>
          <td class="sig">${badge(ev.signal, ev.reason)}<small class="reason">${U.esc(ev.reason)}</small></td>
          <td class="actions">${
            held[addr]
              ? `<button class="btn sm danger" data-sell="${U.esc(addr)}" data-frac="1">Sell</button>`
              : `<button class="btn sm" data-buy="${U.esc(addr)}" ${canBuy ? '' : 'disabled'}>Buy $${manualAmt}</button>`
          }</td>
        </tr>`;
      })
      .join('');
  }

  function renderTrades(app) {
    const trades = app.portfolio.state.trades.slice(0, 100);
    $('trades-empty').hidden = trades.length > 0;
    $('trades-body').innerHTML = trades
      .map(
        (t) => `<tr>
        <td class="num">${U.fmtTime(t.t)}</td>
        <td>${badge(t.side === 'BUY' ? 'BUY' : 'SELL', '')}</td>
        <td><b>${U.esc(t.symbol)}</b></td>
        <td>${U.esc(stratName(t.strategy))}</td>
        <td class="num">${U.fmtPrice(t.price)}</td>
        <td class="num">${U.fmtUsd(t.usd)}</td>
        <td class="num ${t.pnl == null ? '' : cls(t.pnl)}">${t.pnl == null ? '' : U.fmtSignedUsd(t.pnl)}</td>
        <td class="reason-cell">${U.esc(t.reason)}</td>
      </tr>`
      )
      .join('');
  }

  // The strategy cards are built once (so checkboxes and open <details>
  // survive ticks); only their stats line refreshes.
  function renderStrategies(app) {
    const root = $('strategies');
    if (!root.dataset.built) {
      root.innerHTML = SIM.strategies.STRATEGIES.map(
        (s) => `<div class="strat" id="strat-${s.id}">
        <label class="strat-head">
          <input type="checkbox" data-strategy="${s.id}">
          <b>${U.esc(s.name)}</b><span class="chip">${Math.round(s.size * 100)}% size</span>
        </label>
        <p>${U.esc(s.summary)}</p>
        <div class="strat-stats" id="strat-stats-${s.id}"></div>
        <details><summary>Rules</summary><ul>${s.rules.map((r) => `<li>${U.esc(r)}</li>`).join('')}</ul></details>
      </div>`
      ).join('');
      root.dataset.built = '1';
    }
    for (const s of SIM.strategies.STRATEGIES) {
      const st = app.portfolio.strategyStats(s.id);
      const on = !!app.settings.enabled[s.id];
      $('strat-' + s.id).classList.toggle('off', !on);
      root.querySelector(`[data-strategy="${s.id}"]`).checked = on;
      const wr = st.trades ? `${Math.round((st.wins / st.trades) * 100)}% win` : 'no closed trades';
      $('strat-stats-' + s.id).innerHTML = `<span>${st.trades} closed · ${wr}</span>
          <span>${st.open} open</span>
          <span class="${cls(st.realized)}">realized ${U.fmtSignedUsd(st.realized)}</span>
          <span class="${cls(st.unrealized)}">open ${U.fmtSignedUsd(st.unrealized)}</span>`;
    }
  }

  function renderStatus(app) {
    const dot = $('feed-dot');
    dot.className = 'dot ' + app.status.level;
    $('feed-status').textContent = app.status.text;
    $('sol-price').textContent = isFinite(app.solPrice) ? U.fmtUsd(app.solPrice) : '—';
    $('mode-select').value = app.feed ? app.feed.kind : app.settings.mode;
    $('auto-toggle').checked = app.settings.auto;
    const banner = $('banner');
    banner.hidden = !app.banner;
    banner.textContent = app.banner || '';
  }

  function renderClock(app) {
    const el = $('last-update');
    el.textContent = app.lastUpdate ? `updated ${Math.round((Date.now() - app.lastUpdate) / 1000)}s ago` : 'waiting for data';
    document.querySelectorAll('[data-since]').forEach((td) => {
      td.textContent = U.fmtDuration(Date.now() - Number(td.dataset.since));
    });
  }

  function renderChart(app) {
    SIM.chart.drawEquity($('equity-chart'), app.portfolio.state.equityHist, app.portfolio.state.startCash);
  }

  function render(app) {
    renderStatus(app);
    renderKpis(app);
    renderChart(app);
    renderPositions(app);
    renderScanner(app);
    renderTrades(app);
    renderStrategies(app);
    renderClock(app);
    for (const u of app.universe.values()) u.flashed = true;
  }

  SIM.ui = { render, renderClock, renderChart, renderScanner };
})();
