/*
 * Grafici su <canvas> per l'homework 4: traiettorie, istogrammi con curva teorica, curve in scala logaritmica.
 * Nessuna libreria; stesso stile dei grafici degli altri homework.
 */
const Plots = (() => {
  const FONT = '11px "JetBrains Mono", ui-monospace, monospace';
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const COL = { green: "#00ff41", amber: "#ffcc66", pink: "#ff6b9d", cyan: "#6ee7ff", violet: "#b794f6" };
  const redraws = new Map();
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const [c, f] of redraws) { if (!c.isConnected) redraws.delete(c); else f(); }   // via i grafici di canvas ormai tolti dalla pagina
    }, 150);
  });

  function prep(canvas) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.font = FONT;
    return { ctx, w, h };
  }
  const style = () => ({ faint: css("--text-faint") || "#3f6e4c", soft: css("--text-soft") || "#7fc794", border: css("--border-strong") || "#1f4a2b" });

  // Numeri tondi per le tacche di un asse lineare
  function niceTicks(lo, hi, n = 5) {
    if (hi <= lo) hi = lo + 1;
    const raw = (hi - lo) / n, e = Math.floor(Math.log10(raw)), f = raw / 10 ** e;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * 10 ** e;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function fmt(v) {
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1e5 || a < 1e-3) return v.toExponential(0).replace("e+", "e");
    return String(Math.round(v * 1e4) / 1e4);
  }
  const pow10 = (e) => (e === 0 ? "1" : e === 1 ? "10" : `10^${e}`);

  // Sistema di coordinate: mappa dati → pixel, con assi eventualmente logaritmici
  function frame(ctx, w, h, xa, ya, o = {}) {
    const m = { l: o.left ?? 48, r: 12, t: o.top ?? 24, b: 34 }, pw = w - m.l - m.r, ph = h - m.t - m.b, st = style();
    const fx = xa.log ? Math.log10 : (v) => v, fy = ya.log ? Math.log10 : (v) => v;
    const X = (v) => m.l + ((fx(v) - fx(xa.min)) / (fx(xa.max) - fx(xa.min))) * pw;
    const Y = (v) => m.t + ph - ((fy(v) - fy(ya.min)) / (fy(ya.max) - fy(ya.min))) * ph;
    ctx.lineWidth = 1; ctx.strokeStyle = st.border; ctx.fillStyle = st.faint;
    const yt = ya.log ? Array.from({ length: Math.round(Math.log10(ya.max) - Math.log10(ya.min)) + 1 }, (_, i) => 10 ** (Math.round(Math.log10(ya.min)) + i)) : niceTicks(ya.min, ya.max, 4);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of yt) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(ya.log ? pow10(Math.round(Math.log10(v))) : fmt(v), m.l - 6, y);
    }
    const xt = xa.log ? Array.from({ length: Math.round(Math.log10(xa.max) - Math.log10(xa.min)) + 1 }, (_, i) => 10 ** (Math.round(Math.log10(xa.min)) + i)) : niceTicks(xa.min, xa.max, 5);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (const v of xt) {
      const x = Math.round(X(v)) + 0.5;
      ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(xa.log ? pow10(Math.round(Math.log10(v))) : fmt(v), x, m.t + ph + 14);
    }
    ctx.strokeStyle = st.border; ctx.beginPath(); ctx.moveTo(m.l, m.t + ph + 0.5); ctx.lineTo(m.l + pw, m.t + ph + 0.5); ctx.moveTo(m.l + 0.5, m.t); ctx.lineTo(m.l + 0.5, m.t + ph); ctx.stroke();
    if (o.xTitle) { ctx.fillStyle = st.faint; ctx.fillText(o.xTitle, m.l + pw / 2, h - 3); }
    return { X, Y, m, pw, ph, st };
  }
  function legend(ctx, m, st, items) {
    let x = m.l; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (const it of items) {
      ctx.strokeStyle = ctx.fillStyle = it.color; ctx.lineWidth = 2;
      ctx.setLineDash(it.dash ? [4, 3] : []); ctx.beginPath(); ctx.moveTo(x, 9); ctx.lineTo(x + 14, 9); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = st.soft; ctx.fillText(it.name, x + 18, 9);
      x += 28 + ctx.measureText(it.name).width;
    }
  }

  /* ---------- Traiettorie: più attaccanti, media e fascia teorica ---------- */
  // o = { xs, lines: [valori], bands: {lo, hi}, mean, expected, xTitle, yRange }
  function paths(canvas, o) {
    const render = () => {
      const { ctx, w, h } = prep(canvas);
      const lo = o.yRange ? o.yRange[0] : Math.min(...o.bands.lo), hi = o.yRange ? o.yRange[1] : Math.max(...o.bands.hi);
      const pad = (hi - lo) * 0.05;
      const f = frame(ctx, w, h, { min: o.xs[0], max: o.xs[o.xs.length - 1], log: o.xLog !== false }, { min: lo - pad, max: hi + pad }, { xTitle: o.xTitle });
      const clipY = (y) => Math.max(f.m.t, Math.min(f.m.t + f.ph, y));
      // fascia teorica ±2σ
      ctx.fillStyle = COL.cyan; ctx.globalAlpha = 0.12; ctx.beginPath();
      o.xs.forEach((x, i) => (i ? ctx.lineTo(f.X(x), f.Y(o.bands.hi[i])) : ctx.moveTo(f.X(x), f.Y(o.bands.hi[i]))));
      for (let i = o.xs.length - 1; i >= 0; i--) ctx.lineTo(f.X(o.xs[i]), f.Y(o.bands.lo[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      // traiettorie
      ctx.lineWidth = 1; ctx.strokeStyle = COL.green; ctx.globalAlpha = 0.4;
      for (const ln of o.lines) {
        ctx.beginPath();
        ln.forEach((v, i) => { const x = f.X(o.xs[i]), y = clipY(f.Y(v)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // media empirica di tutti gli attaccanti e valore teorico
      const line = (vals, color, wd, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.setLineDash(dash ? [5, 4] : []); ctx.beginPath();
        vals.forEach((v, i) => { const x = f.X(o.xs[i]), y = clipY(f.Y(v)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke(); ctx.setLineDash([]);
      };
      line(o.expected, COL.cyan, 1.5, true); line(o.mean, COL.amber, 2.2, false);
      legend(ctx, f.m, f.st, [{ name: "attaccanti", color: COL.green }, { name: "media di tutti", color: COL.amber }, { name: "valore atteso", color: COL.cyan, dash: true }, { name: "±2σ teorico", color: COL.cyan }]);
    };
    redraws.set(canvas, render); render();
  }

  /* ---------- Istogramma (densità) con curva teorica ---------- */
  // o = { values, density: (x) => y, note }
  function hist(canvas, o) {
    const render = () => {
      const { ctx, w, h } = prep(canvas), v = o.values, m = v.length;
      let lo = Infinity, hi = -Infinity;
      for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
      const uniq = [...new Set(v)].sort((a, b) => a - b);
      let width, start;
      if (uniq.length <= 40) {                                                      // valori discreti: una barra per valore
        let d = Infinity; for (let i = 1; i < uniq.length; i++) d = Math.min(d, uniq[i] - uniq[i - 1]);
        width = isFinite(d) ? d : 1; start = lo - width / 2;
      } else { const nb = 30; width = (hi - lo) / nb || 1; start = lo; }
      const nb = Math.max(1, Math.round((hi + width / 2 - start) / width + (uniq.length <= 40 ? 0 : 1)));
      const dens = new Float64Array(nb);
      for (const x of v) dens[Math.min(nb - 1, Math.max(0, Math.floor((x - start) / width)))] += 1 / (m * width);
      const xmin = start - width, xmax = start + nb * width + width;
      let ymax = Math.max(...dens);
      const curve = [];
      for (let i = 0; i <= 120; i++) { const x = xmin + ((xmax - xmin) * i) / 120, y = o.density(x); curve.push([x, y]); if (y > ymax) ymax = y; }
      const f = frame(ctx, w, h, { min: xmin, max: xmax }, { min: 0, max: ymax * 1.12 }, { left: 40, top: 10 });
      ctx.fillStyle = COL.green; ctx.globalAlpha = 0.75;
      dens.forEach((d, i) => { const x0 = f.X(start + i * width), x1 = f.X(start + (i + 1) * width); ctx.fillRect(x0 + 0.5, f.Y(d), Math.max(1, x1 - x0 - 1), f.Y(0) - f.Y(d)); });
      ctx.globalAlpha = 1; ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1.8; ctx.beginPath();
      curve.forEach(([x, y], i) => (i ? ctx.lineTo(f.X(x), f.Y(y)) : ctx.moveTo(f.X(x), f.Y(y)))); ctx.stroke();
      if (o.note) { ctx.fillStyle = f.st.soft; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText(o.note, w - 8, 4); }
    };
    redraws.set(canvas, render); render();
  }

  /* ---------- Curve (asse x e y eventualmente logaritmici) ---------- */
  // o = { xs, series: [{name, ys, color, dash, markers}], xLog, yLog, ymin, ymax, xTitle, hlines: [{y, name, color}] }
  function curves(canvas, o) {
    const render = () => {
      const { ctx, w, h } = prep(canvas);
      const f = frame(ctx, w, h, { min: o.xs[0], max: o.xs[o.xs.length - 1], log: !!o.xLog }, { min: o.ymin, max: o.ymax, log: !!o.yLog }, { xTitle: o.xTitle });
      const ok = (y) => isFinite(y) && (!o.yLog || y > 0);
      const clip = (y) => Math.max(f.m.t, Math.min(f.m.t + f.ph, y));
      for (const hl of o.hlines || []) {
        ctx.strokeStyle = hl.color; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]); ctx.beginPath();
        ctx.moveTo(f.m.l, f.Y(hl.y)); ctx.lineTo(f.m.l + f.pw, f.Y(hl.y)); ctx.stroke(); ctx.setLineDash([]);
      }
      for (const s of o.series) {
        ctx.strokeStyle = ctx.fillStyle = s.color; ctx.lineWidth = s.width || 1.8; ctx.setLineDash(s.dash ? [5, 4] : []);
        let pen = false; ctx.beginPath();
        s.ys.forEach((y, i) => {
          if (!ok(y)) { pen = false; return; }
          const px = f.X(o.xs[i]), py = clip(f.Y(y));
          if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
        });
        ctx.stroke(); ctx.setLineDash([]);
        if (s.markers) s.ys.forEach((y, i) => { if (ok(y)) { ctx.beginPath(); ctx.arc(f.X(o.xs[i]), clip(f.Y(y)), 2.2, 0, 7); ctx.fill(); } });
      }
      legend(ctx, f.m, f.st, [...o.series.map((s) => ({ name: s.name, color: s.color, dash: s.dash })), ...(o.hlines || []).map((x) => ({ name: x.name, color: x.color, dash: true }))]);
    };
    redraws.set(canvas, render); render();
  }

  return { COL, paths, hist, curves };
})();
