/* Homework 5: ricorrenze di Welford e statistiche campionarie. Motore + interfaccia. */
const PMFS = {
  binom: { name: "Binomiale(10; 0,4)", p: (() => { const c = [1, 10, 45, 120, 210, 252, 210, 120, 45, 10, 1]; return c.map((v, k) => v * 0.4 ** k * 0.6 ** (10 - k)); })() },
  unif: { name: "Uniforme su 0..10", p: Array(11).fill(1 / 11) },
  skew: { name: "A coda lunga (geometrica troncata)", p: (() => { const w = Array.from({ length: 11 }, (_, k) => 0.65 ** k), s = w.reduce((a, b) => a + b); return w.map((v) => v / s); })() },
};
const NS = [5, 10, 30, 100, 1000];

// ---- Welford: nucleo di tre righe (aggiorna media e SS con un solo dato x) ----
function welford(xs) {
  let k = 0, mean = 0, ss = 0;
  for (const x of xs) { const d = x - mean; k++; mean += d / k; ss += d * (x - mean); }
  return { mean, ss, k };
}
function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function moments(p) {
  const mu = p.reduce((s, q, x) => s + q * x, 0), v = p.reduce((s, q, x) => s + q * (x - mu) ** 2, 0), m4 = p.reduce((s, q, x) => s + q * (x - mu) ** 4, 0);
  return { mu, v, m4 };
}
// m attaccanti, n sistemi: per ognuno media e varianza campionaria con Welford (una passata)
function experiment(p, m, n, rnd) {
  const cdf = []; p.reduce((a, q, i) => (cdf[i] = a + q), 0);
  const means = new Float64Array(m), vars = new Float64Array(m), varsN = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let k = 0, mean = 0, ss = 0;
    for (let i = 0; i < n; i++) {
      const u = rnd(); let x = 0; while (x < 10 && u > cdf[x]) x++;
      const d = x - mean; k++; mean += d / k; ss += d * (x - mean);
    }
    means[j] = mean; vars[j] = ss / (n - 1); varsN[j] = ss / n;
  }
  return { means, vars, varsN };
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = avg(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const f = (x, d = 3) => x.toFixed(d).replace(".", ",");

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  $("w-go").onclick = () => {
    const rnd = mulberry32(Date.now() & 0xffffffff), xs = Array.from({ length: 1000 }, () => 1e6 + Math.floor(rnd() * 11));
    const w = welford(xs), mean = avg(xs), ss = xs.reduce((s, x) => s + (x - mean) ** 2, 0);
    const naive = xs.reduce((s, x) => s + x * x, 0) - xs.length * mean * mean;
    $("w-out").textContent = `1000 numeri attorno a 1 000 000\nmedia  Welford ${w.mean.toFixed(6)}   due passate ${mean.toFixed(6)}\nSS     Welford ${w.ss.toFixed(4)}   due passate ${ss.toFixed(4)}\nSS con "somma dei quadrati - n*media^2": ${naive.toFixed(4)}  (errore di arrotondamento)`;
  };
  $("w-go").click();

  let timer;
  const run = () => {
    const p = PMFS[$("dist").value].p, th = moments(p), m = +$("m").value, seed = +$("seed").value || 1;
    $("m-v").textContent = m;
    const rnd = mulberry32(seed), res = {};
    for (const n of NS) res[n] = experiment(p, m, n, rnd);
    $("th").textContent = `μ = ${f(th.mu)}, σ² = ${f(th.v)}`;
    const body = NS.map((n) => {
      const r = res[n];
      return `<tr><td>${n}</td><td>${f(avg(r.means))}</td><td>${f(sd(r.means), 4)}</td><td>${f(Math.sqrt(th.v / n), 4)}</td><td>${f(avg(r.vars))}</td><td>${f(sd(r.vars), 3)}</td><td>${f(avg(r.varsN))}</td></tr>`;
    }).join("");
    $("tab").innerHTML = `<table class="res-table"><thead><tr><th>n</th><th>media delle medie</th><th>dev. std delle medie</th><th>teorica σ/√n</th><th>media delle varianze (÷(n−1))</th><th>dev. std delle varianze</th><th>media delle varianze (÷n)</th></tr></thead><tbody>${body}</tbody></table>`;
    const sdVar = (n) => Math.sqrt(Math.max(0, (th.m4 - th.v * th.v * (n - 3) / (n - 1)) / n));
    Plots.curves($("c-sd"), { xs: NS, xLog: true, yLog: true, ymin: 0.01, ymax: 10, xTitle: "numero di sistemi n per attaccante",
      series: [
        { name: "dev. std delle medie (misurata)", ys: NS.map((n) => sd(res[n].means)), color: Plots.COL.green, markers: true },
        { name: "σ/√n", ys: NS.map((n) => Math.sqrt(th.v / n)), color: Plots.COL.green, dash: true },
        { name: "dev. std delle varianze (misurata)", ys: NS.map((n) => sd(res[n].vars)), color: Plots.COL.amber, markers: true },
        { name: "teorica", ys: NS.map(sdVar), color: Plots.COL.amber, dash: true }] });
    for (const [id, n] of [["h-a", 10], ["h-b", 100]]) {
      const s = Math.sqrt(th.v / n);
      Plots.hist($(id), { values: Array.from(res[n].means), density: (x) => Math.exp(-((x - th.mu) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)), note: `n = ${n}` });
    }
  };
  const again = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
  ["dist", "m", "seed"].forEach((id) => $(id).addEventListener("input", again));
  window.addEventListener("load", run);
}
if (typeof module !== "undefined") module.exports = { welford, experiment, moments, PMFS, mulberry32 };
