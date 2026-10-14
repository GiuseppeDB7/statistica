/*
 * Grafici minimi su <canvas>: istogrammi a barre e diagrammi di dispersione.
 * Nessuna libreria: servono solo assi, barre e punti.
 */
const Charts = (() => {
  const colors = { a: "#00ff41", b: "#ffcc66", exp: "#6ee7ff", sha: "#ff6b9d" };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const FONT = '11px "JetBrains Mono", ui-monospace, monospace';

  // I grafici si ridisegnano quando cambia la larghezza della finestra
  const redraws = new Map();
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => redraws.forEach((fn) => fn()), 150);
  });
  const register = (canvas, fn) => { redraws.set(canvas, fn); fn(); };

  function prepare(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = FONT;
    return { ctx, w, h };
  }

  const defFmt = (v) => String(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);

  // Assi, griglia e tick sull'asse y. Restituisce il rettangolo del grafico.
  function axes(ctx, w, h, m, ymin, ymax, yFmt, xTitle) {
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    ctx.strokeStyle = css("--border-strong") || "#1f4a2b";
    ctx.fillStyle = css("--text-faint") || "#3f6e4c";
    ctx.lineWidth = 1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 2; i++) {
      const v = ymin + ((ymax - ymin) * i) / 2;
      const y = Math.round(m.t + ph - (ph * i) / 2) + 0.5;
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(yFmt(v), m.l - 6, y);
    }
    if (xTitle) {
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(xTitle, m.l + pw / 2, h - 3);
    }
    return { pw, ph };
  }

  function legend(ctx, m, items) {
    let x = m.l;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (const it of items) {
      ctx.fillStyle = it.color;
      if (it.line) ctx.fillRect(x, 8, 12, 2); else ctx.fillRect(x, 4, 8, 8);
      ctx.fillStyle = css("--text-soft") || "#7fc794";
      ctx.fillText(it.name, x + 16, 9);
      x += 24 + ctx.measureText(it.name).width;
    }
  }

  /*
   * Istogramma a barre.
   * o = { series: [{name, values, color}], expected: number | number[] | null, expectedName,
   *       ymin, ymax, yFmt, xLabel: (i) => string, xTitle }
   */
  function bars(canvas, o) {
    register(canvas, () => {
      const { ctx, w, h } = prepare(canvas);
      const m = { l: 46, r: 8, t: 22, b: 30 };
      const ymin = o.ymin ?? 0, ymax = o.ymax, yFmt = o.yFmt || defFmt;
      const { pw, ph } = axes(ctx, w, h, m, ymin, ymax, yFmt, o.xTitle);
      const y = (v) => m.t + ph - ((v - ymin) / (ymax - ymin)) * ph;
      const nC = o.series[0].values.length, gw = pw / nC;
      const bw = Math.max(1, (gw * 0.78) / o.series.length);
      o.series.forEach((s, si) => {
        ctx.fillStyle = s.color;
        s.values.forEach((v, i) => {
          const x = m.l + i * gw + gw * 0.11 + si * bw;
          const top = y(Math.min(v, ymax));
          ctx.fillRect(x, top, Math.max(1, bw - (bw > 4 ? 1 : 0)), m.t + ph - top);
        });
      });
      // valore atteso: tacca per classe (array) oppure linea tratteggiata (numero)
      if (o.expected != null) {
        ctx.strokeStyle = ctx.fillStyle = colors.exp;
        if (Array.isArray(o.expected)) {
          o.expected.forEach((e, i) => ctx.fillRect(m.l + i * gw, y(e) - 1, gw, 2));
        } else {
          ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(m.l, y(o.expected)); ctx.lineTo(m.l + pw, y(o.expected)); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // etichette sull'asse x: ne salto abbastanza da non farle sovrapporre
      const lw = ctx.measureText(String(o.xLabel ? o.xLabel(nC - 1) : nC - 1)).width + 12;
      const every = Math.max(1, Math.ceil(lw / gw));
      ctx.fillStyle = css("--text-faint") || "#3f6e4c";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      for (let i = 0; i < nC; i += every) ctx.fillText(o.xLabel ? o.xLabel(i) : String(i), m.l + i * gw + gw / 2, m.t + ph + 13);
      legend(ctx, m, [
        ...o.series.map((s) => ({ name: s.name, color: s.color })),
        ...(o.expected != null ? [{ name: o.expectedName || "atteso", color: colors.exp, line: true }] : []),
      ]);
    });
  }

  /*
   * Diagramma di dispersione.  o = { xmax, ymax, xTitle, color, size }
   */
  function scatter(canvas, xs, ys, o) {
    register(canvas, () => {
      const { ctx, w, h } = prepare(canvas);
      const m = { l: 46, r: 10, t: 12, b: 30 };
      const { pw, ph } = axes(ctx, w, h, m, 0, o.ymax, defFmt, o.xTitle);
      ctx.fillStyle = o.color || colors.a;
      ctx.globalAlpha = 0.6;
      const s = o.size || 1.6;
      for (let i = 0; i < xs.length; i++) {
        ctx.fillRect(m.l + (xs[i] / o.xmax) * pw - s / 2, m.t + ph - (ys[i] / o.ymax) * ph - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = css("--text-faint") || "#3f6e4c";
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      ctx.fillText("0", m.l, m.t + ph + 13);
      ctx.textAlign = "right";
      ctx.fillText(defFmt(o.xmax), m.l + pw, m.t + ph + 13);
    });
  }

  return { colors, bars, scatter };
})();
