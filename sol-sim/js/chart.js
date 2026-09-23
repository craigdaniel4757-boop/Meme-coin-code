// Minimal canvas equity chart: area line vs the $1,000 starting baseline.
(function () {
  const SIM = window.SIM;

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function drawEquity(canvas, points, baseline) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = { l: 58, r: 12, t: 10, b: 22 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const pts = points.length > 1 ? points : [{ t: Date.now() - 1000, v: baseline }, { t: Date.now(), v: baseline }];

    let lo = baseline;
    let hi = baseline;
    for (const p of pts) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    const span = Math.max(hi - lo, baseline * 0.01);
    lo -= span * 0.12;
    hi += span * 0.12;
    const t0 = pts[0].t;
    const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * pw;
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ph;

    const grid = css('--grid');
    const muted = css('--muted');
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText('$' + v.toFixed(v >= 10000 ? 0 : 2), pad.l - 6, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(SIM.util.fmtTime(t0), pad.l, h - 6);
    ctx.textAlign = 'right';
    ctx.fillText(SIM.util.fmtTime(t1), w - pad.r, h - 6);

    // baseline
    const by = Math.round(Y(baseline)) + 0.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = muted;
    ctx.beginPath();
    ctx.moveTo(pad.l, by);
    ctx.lineTo(w - pad.r, by);
    ctx.stroke();
    ctx.setLineDash([]);

    const last = pts[pts.length - 1].v;
    const color = last >= baseline ? css('--up') : css('--down');
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.lineTo(X(pts[pts.length - 1].t), by);
    ctx.lineTo(X(pts[0].t), by);
    ctx.closePath();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    const lx = X(pts[pts.length - 1].t);
    const ly = Y(last);
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Tiny inline sparkline for scanner rows.
  function sparkline(hist, w = 72, h = 22) {
    if (!hist || hist.length < 2) return '';
    const ps = hist.map((x) => x.p);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const span = hi - lo || hi * 0.001 || 1;
    const d = ps
      .map((p, i) => `${i ? 'L' : 'M'}${((i / (ps.length - 1)) * w).toFixed(1)},${(h - 2 - ((p - lo) / span) * (h - 4)).toFixed(1)}`)
      .join('');
    const cls = ps[ps.length - 1] >= ps[0] ? 'spark up' : 'spark down';
    return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  SIM.chart = { drawEquity, sparkline };
})();
