(function () {
  "use strict";
  const LWC = window.LightweightCharts;
  let chart = null, series = null, markersApi = null, priceLines = [];

  const $ = (id) => document.getElementById(id);

  function etTime(iso) {
    if (!iso) return "-";
    const m = iso.match(/T(\d{2}:\d{2})/);
    return m ? m[1] : iso;
  }
  function isoToUnix(iso) {
    return Math.floor(new Date(iso).getTime() / 1000);
  }
  function fmtPx(v) {
    return v === null || v === undefined ? "-" : "$" + Number(v).toFixed(2);
  }
  function fmtR(v) {
    if (v === null || v === undefined) return "-";
    return (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "R";
  }
  function signClass(v) {
    return v === null || v === undefined ? "neutral" : v > 0 ? "up" : v < 0 ? "down" : "neutral";
  }
  const OUTCOME_LABELS = {
    target: "Target", stop: "Stop", eod: "EOD", no_sweep: "No sweep", invalid_sweep: "Invalid sweep",
    no_entry_trigger: "No entry", no_prior_swing: "No swing", insufficient_data: "No data",
  };
  function outcomeLabel(o) {
    return OUTCOME_LABELS[o] || o;
  }
  function todayISO(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function etHHMM(unixSeconds) {
    const d = new Date(unixSeconds * 1000);
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  }

  function setDefaultDates(source) {
    $("end").value = todayISO(0);
    $("start").value = todayISO(source === "yahoo" ? -6 : -16);
  }

  async function loadInstruments() {
    try {
      const res = await fetch("/api/instruments");
      const data = await res.json();
      const list = $("ticker-list");
      list.innerHTML = "";
      for (const tkr of data.demo_tickers) {
        const opt = document.createElement("option");
        opt.value = tkr;
        list.appendChild(opt);
      }
    } catch (e) {
      // Non-fatal: the ticker input still works as a free-text field without suggestions.
    }
  }

  function showError(msg) {
    const box = $("error-box");
    if (!msg) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.textContent = msg;
    box.style.display = "block";
  }

  function costParams() {
    return {
      tick_size: $("tick_size").value,
      spread_ticks: $("spread_ticks").value,
      slippage_ticks: $("slippage_ticks").value,
      commission_per_share: $("commission_per_share").value,
      session_close: $("session_close").value,
      lookback_hours: $("lookback_hours").value,
    };
  }

  function updateSourceBanner() {
    const source = $("source").value;
    const banner = $("source-banner");
    if (source === "yahoo") {
      banner.classList.add("live");
      banner.innerHTML =
        "Live data via Yahoo Finance's public intraday endpoint (no key needed). Real limitations: 1-minute " +
        "history only reliably covers roughly the last 7-8 days, and 8:00-10:00am ET is largely " +
        "<em>pre-market</em> (thinner liquidity, wider spreads) since the regular session opens at 9:30am ET. " +
        "This request runs from wherever this server has outbound network access -- if that's a sandboxed " +
        "environment, it will fail with a clear error rather than substituting fake data.";
    } else {
      banner.classList.remove("live");
      banner.innerHTML =
        "Synthetic demo data: deterministic, seeded, clearly-labeled fake candles -- not real market history. " +
        "Free to explore with zero setup; every mechanical branch of the strategy (target/stop/EOD/invalid " +
        "sweep/no sweep/no entry trigger) is represented across enough days. Switch to Yahoo Finance for real prices.";
    }
  }

  async function runBacktest() {
    showError(null);
    const ticker = $("ticker").value.trim().toUpperCase();
    if (!ticker) {
      showError("Enter a ticker.");
      return;
    }
    const params = new URLSearchParams(Object.assign({ ticker, start: $("start").value, end: $("end").value, source: $("source").value }, costParams()));
    const btn = $("run-btn");
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>Running...';
    try {
      const res = await fetch("/api/backtest?" + params.toString());
      const data = await res.json();
      if (!res.ok) {
        showError(data.detail || "Request failed.");
        return;
      }
      renderSummary(data.summary);
      renderTable(data.days);
      $("summary-panel").style.display = "block";
      $("results-panel").style.display = "block";
      $("chart-panel").style.display = "none";
    } catch (e) {
      showError("Request failed: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  function renderSummary(s) {
    $("s-days").textContent = s.days_analyzed;
    $("s-trades").textContent = s.trades_taken;
    $("s-winrate").textContent = s.win_rate_pct !== null ? s.win_rate_pct.toFixed(1) + "%" : "-";
    const avgEl = $("s-avgr");
    avgEl.textContent = fmtR(s.avg_r);
    avgEl.className = "value " + signClass(s.avg_r);
    const totEl = $("s-totalr");
    totEl.textContent = fmtR(s.total_r);
    totEl.className = "value " + signClass(s.total_r);
    $("s-pf").textContent = s.profit_factor === null ? "-" : s.profit_factor > 1e6 ? "∞" : s.profit_factor.toFixed(2);
    $("s-nosweep").textContent = s.no_sweep_days;
    $("s-invalid").textContent = s.invalid_sweep_days;
  }

  function renderTable(days) {
    const body = $("results-body");
    body.innerHTML = "";
    if (!days.length) {
      body.innerHTML = '<tr><td colspan="13" class="empty">No trading days in range.</td></tr>';
      return;
    }
    for (const d of days) {
      const tr = document.createElement("tr");
      tr.className = "row";
      const dir = d.sweep_direction ? (d.sweep_direction === "bullish" ? "Long" : "Short") : "-";
      tr.innerHTML =
        "<td>" + d.date + "</td>" +
        '<td><span class="pill ' + d.outcome + '">' + outcomeLabel(d.outcome) + "</span></td>" +
        "<td>" + dir + "</td>" +
        "<td>" + fmtPx(d.range_high) + "</td>" +
        "<td>" + fmtPx(d.range_low) + "</td>" +
        "<td>" + fmtPx(d.sweep_price) + "</td>" +
        "<td>" + etTime(d.entry_time) + "</td>" +
        "<td>" + fmtPx(d.entry_price) + "</td>" +
        "<td>" + fmtPx(d.stop_price) + "</td>" +
        "<td>" + fmtPx(d.target_price) + "</td>" +
        "<td>" + etTime(d.exit_time) + "</td>" +
        "<td>" + fmtPx(d.exit_price) + "</td>" +
        '<td class="' + signClass(d.result_r) + '">' + fmtR(d.result_r) + "</td>";
      tr.addEventListener("click", () => selectDay(d.date, tr));
      body.appendChild(tr);
    }
  }

  async function selectDay(date, rowEl) {
    document.querySelectorAll("tr.row.selected").forEach((el) => el.classList.remove("selected"));
    if (rowEl) rowEl.classList.add("selected");
    showError(null);
    const ticker = $("ticker").value.trim().toUpperCase();
    const params = new URLSearchParams(Object.assign({ ticker, date, source: $("source").value }, costParams()));
    try {
      const res = await fetch("/api/day?" + params.toString());
      const data = await res.json();
      if (!res.ok) {
        showError(data.detail || "Request failed.");
        return;
      }
      renderChart(ticker, date, data);
    } catch (e) {
      showError("Request failed: " + e.message);
    }
  }

  function ensureChart() {
    if (chart) return;
    const container = $("chart-container");
    chart = LWC.createChart(container, {
      layout: { background: { color: "#161b22" }, textColor: "#e6edf3", fontFamily: "ui-monospace, Consolas, monospace" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false, tickMarkFormatter: (time) => etHHMM(time) },
      crosshair: { mode: LWC.CrosshairMode.Normal },
      localization: { timeFormatter: (time) => etHHMM(time) + " ET" },
      width: container.clientWidth,
      height: 480,
    });
    series = chart.addSeries(LWC.CandlestickSeries, {
      upColor: "#3fb950", downColor: "#f85149", borderVisible: false, wickUpColor: "#3fb950", wickDownColor: "#f85149",
    });
    markersApi = LWC.createSeriesMarkers(series, []);
    if (window.ResizeObserver) {
      new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth })).observe(container);
    }
  }

  function clearOverlays() {
    for (const line of priceLines) series.removePriceLine(line);
    priceLines = [];
    markersApi.setMarkers([]);
  }

  function addLine(price, color, title) {
    if (price === null || price === undefined) return;
    priceLines.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LWC.LineStyle.Dashed, axisLabelVisible: true, title }));
  }

  function renderChart(ticker, date, data) {
    ensureChart();
    clearOverlays();
    const trade = data.trade;
    $("chart-panel").style.display = "block";
    $("chart-title").textContent = ticker + " -- " + date + " (" + outcomeLabel(trade.outcome) + ")";

    if (!data.candles.length) {
      series.setData([]);
      $("chart-legend").innerHTML = '<span class="empty">No candle data for this date.</span>';
      return;
    }

    series.setData(data.candles.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));

    addLine(trade.range_high, "#8b949e", "Range H");
    addLine(trade.range_low, "#8b949e", "Range L");
    addLine(trade.stop_price, "#f85149", "Stop");
    addLine(trade.target_price, "#3fb950", "Target");

    // No inline text on the markers themselves -- the legend above already spells out
    // every exact time/price, and at a 1-minute chart scale sweep/reclaim/entry can sit
    // only a bar or two apart, where text labels would just overlap into noise.
    const bullish = trade.sweep_direction === "bullish";
    const markers = [];
    if (trade.sweep_time) {
      markers.push({ time: isoToUnix(trade.sweep_time), position: bullish ? "belowBar" : "aboveBar", shape: "circle", color: "#d29922" });
    }
    if (trade.reclaim_time) {
      markers.push({ time: isoToUnix(trade.reclaim_time), position: bullish ? "belowBar" : "aboveBar", shape: "circle", color: "#58a6ff" });
    }
    if (trade.entry_time) {
      markers.push({ time: isoToUnix(trade.entry_time), position: bullish ? "belowBar" : "aboveBar", shape: bullish ? "arrowUp" : "arrowDown", color: "#e6edf3" });
    }
    if (trade.exit_time) {
      const exitColor = trade.outcome === "target" ? "#3fb950" : trade.outcome === "stop" ? "#f85149" : "#58a6ff";
      markers.push({ time: isoToUnix(trade.exit_time), position: bullish ? "aboveBar" : "belowBar", shape: "square", color: exitColor });
    }
    markers.sort((a, b) => a.time - b.time);
    markersApi.setMarkers(markers);

    renderLegend(trade);

    const times = data.candles.map((c) => c.t);
    const rangeStartT = isoToUnix(data.windows.range_start);
    const focusEnd = trade.exit_time ? isoToUnix(trade.exit_time) + 15 * 60 : isoToUnix(data.windows.monitor_end) + 30 * 60;
    chart.timeScale().setVisibleRange({
      from: Math.max(times[0], rangeStartT - 20 * 60),
      to: Math.min(times[times.length - 1], focusEnd),
    });
  }

  function dot(color) {
    return '<span class="legend-dot" style="background:' + color + '"></span>';
  }

  function renderLegend(t) {
    const exitColor = t.outcome === "target" ? "#3fb950" : t.outcome === "stop" ? "#f85149" : "#58a6ff";
    const rows = [
      ["Range", fmtPx(t.range_low) + " - " + fmtPx(t.range_high)],
      [dot("#d29922") + "Sweep", t.sweep_direction ? t.sweep_direction + " @ " + fmtPx(t.sweep_price) + " (" + etTime(t.sweep_time) + ")" : "-"],
      [dot("#58a6ff") + "Reclaim", etTime(t.reclaim_time)],
      ["Swing point", fmtPx(t.swing_price)],
      [dot("#e6edf3") + "Entry", t.entry_time ? fmtPx(t.entry_price) + " @ " + etTime(t.entry_time) : "-"],
      ["Stop", fmtPx(t.stop_price)],
      ["Target", fmtPx(t.target_price)],
      [dot(exitColor) + "Exit", t.exit_time ? fmtPx(t.exit_price) + " @ " + etTime(t.exit_time) : "-"],
      ["Result", fmtR(t.result_r)],
    ];
    let html = rows.map(([k, v]) => "<span><b>" + k + ":</b> " + v + "</span>").join("");
    if (t.notes) html += '<span style="width:100%">' + t.notes + "</span>";
    $("chart-legend").innerHTML = html;
  }

  $("run-btn").addEventListener("click", runBacktest);
  $("source").addEventListener("change", () => {
    updateSourceBanner();
    setDefaultDates($("source").value);
  });

  setDefaultDates("synthetic");
  updateSourceBanner();
  loadInstruments();
})();
