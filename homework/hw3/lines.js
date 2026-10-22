/*
 * Grafico a linee su <canvas> (asse x opzionalmente logaritmico), nello stile di charts.js.
 * Lines.draw(canvas, { xs, series: [{name, values, color}], xLog, ymin, ymax, yFmt, xFmt, xTitle, yTitle })
 */
const Lines = (() => {
  const FONT = '11px "JetBrains Mono", ui-monospace, monospace';
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const redraws = new Map();
  let timer;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => redraws.forEach((f) => f()), 150); });

  function draw(canvas, o) {
    const render = () => {
      const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.font = FONT;
      const m = { l: 44, r: 12, t: 26, b: 34 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
      const ymin = o.ymin ?? 0, ymax = o.ymax ?? 1;
      const fx = o.xLog ? Math.log : (v) => v;
      const x0 = fx(o.xs[0]), x1 = fx(o.xs[o.xs.length - 1]);
      const X = (v) => m.l + ((fx(v) - x0) / (x1 - x0)) * pw, Y = (v) => m.t + ph - ((v - ymin) / (ymax - ymin)) * ph;
      const faint = css("--text-faint") || "#3f6e4c", soft = css("--text-soft") || "#7fc794", border = css("--border-strong") || "#1f4a2b";
      // griglia e assi
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const v = ymin + ((ymax - ymin) * i) / 4, y = Math.round(Y(v)) + 0.5;
        ctx.strokeStyle = border; ctx.globalAlpha = i === 0 ? 1 : 0.3;
        ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = faint; ctx.fillText((o.yFmt || ((q) => String(q)))(v), m.l - 6, y);
      }
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = faint;
      o.xs.forEach((v) => {
        const x = X(v);
        ctx.strokeStyle = border; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillText((o.xFmt || String)(v), x, m.t + ph + 14);
      });
      if (o.xTitle) ctx.fillText(o.xTitle, m.l + pw / 2, h - 3);
      // linee
      for (const s of o.series) {
        ctx.strokeStyle = ctx.fillStyle = s.color; ctx.lineWidth = 1.8; ctx.beginPath();
        s.values.forEach((v, i) => { const x = X(o.xs[i]), y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
        s.values.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(o.xs[i]), Y(v), 2.6, 0, 7); ctx.fill(); });
      }
      // legenda
      let lx = m.l; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      for (const s of o.series) {
        ctx.fillStyle = s.color; ctx.fillRect(lx, 8, 12, 3);
        ctx.fillStyle = soft; ctx.fillText(s.name, lx + 16, 10);
        lx += 24 + ctx.measureText(s.name).width;
      }
    };
    redraws.set(canvas, render);
    render();
  }
  return { draw };
})();
