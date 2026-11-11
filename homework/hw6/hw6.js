/* Homework 6: integrali di Riemann e di Lebesgue (Es. 1) e calcolo numerico della ripartizione normale (Es. 2). */
const PI = Math.PI;

/* ---------- Es. 1: funzioni (tutte >= 0), integrale esatto e misura esatta di {f > t} ---------- */
const sinc = (x) => (x === 0 ? 1 : Math.sin(x) / x);
function sincMu(t) {                                   // sinc è decrescente su [0, pi]: si risolve sinc(x) = t per bisezione
  if (t < 0) return PI; if (t >= 1) return 0;
  let a = 0, b = PI; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (sinc(m) > t) a = m; else b = m; }
  return a;
}
const FUNS = {
  sin:   { name: "sin x su [0, π]", a: 0, b: PI, f: Math.sin, I: 2, top: 1, mu: (t) => (t < 0 ? PI : t >= 1 ? 0 : PI - 2 * Math.asin(t)) },
  sq:    { name: "x² su [0, 1]", a: 0, b: 1, f: (x) => x * x, I: 1 / 3, top: 1, mu: (t) => (t < 0 ? 1 : t >= 1 ? 0 : 1 - Math.sqrt(t)) },
  step:  { name: "1 se x<0,5; 3 se x≥0,5", a: 0, b: 1, f: (x) => (x < 0.5 ? 1 : 3), I: 2, top: 3, mu: (t) => (t < 1 ? 1 : t < 3 ? 0.5 : 0) },
  abs:   { name: "|x − 0,5| su [0, 1]", a: 0, b: 1, f: (x) => Math.abs(x - 0.5), I: 0.25, top: 0.5, mu: (t) => (t < 0 ? 1 : t >= 0.5 ? 0 : 1 - 2 * t) },
  inv:   { name: "1/√x su (0, 1]  (illimitata)", a: 0, b: 1, f: (x) => 1 / Math.sqrt(x), I: 2, top: Infinity, mu: (t) => (t <= 1 ? 1 : 1 / (t * t)) },
  ind:   { name: "1 se x<0,5; 0 altrimenti", a: 0, b: 1, f: (x) => (x < 0.5 ? 1 : 0), I: 0.5, top: 1, mu: (t) => (t < 0 ? 1 : t < 1 ? 0.5 : 0) },
  sinc:  { name: "sin x / x su [0, π]", a: 0, b: PI, f: sinc, I: 1.8519370519824662, top: 1, mu: sincMu },
};
// Riemann: n sottointervalli uguali; punto medio oppure estremo sinistro
function riemann(F, n, kind) {
  const h = (F.b - F.a) / n; let s = 0;
  for (let i = 0; i < n; i++) s += F.f(F.a + (i + (kind === "mid" ? 0.5 : 0)) * h);
  return s * h;
}
// Lebesgue: K livelli y_i = i*h sull'immagine; somma inferiore  sum y_i * mu(y_i <= f < y_{i+1}) = h * sum_{i>=1} mu(f >= y_i)
function lebesgue(F, K) {
  const unb = !isFinite(F.top), h = unb ? 1 / Math.sqrt(K) : F.top / K; let s = 0;
  for (let i = 1; i <= K; i++) s += F.mu(i * h - 1e-12);          // f >= y_i (conta anche i valori esattamente sul livello)
  return s * h;
}
const logGrid = (lo, hi, k = 4) => { const out = new Set(); for (let e = Math.log10(lo); e <= Math.log10(hi) + 1e-9; e += 1 / k) { let v = Math.round(10 ** e); if (v % 2 === 0) v++; out.add(v); } return [...out]; };
// Thomae: somma superiore su n parti uguali: sup su [i/n,(i+1)/n] di f = 1/q con q minimo tale che esista p/q nell'intervallo
function thomaeUpper(n) {
  let s = 0;
  for (let i = 0; i < n; i++) { let q = 1; while (Math.floor((i * q + n - 1) / n) > Math.floor(((i + 1) * q) / n)) q++; s += 1 / q; }
  return s / n;
}

/* ---------- Es. 2: ripartizione della normale standard ---------- */
const phi = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * PI);
function trapezio(x, n) {                              // Phi(x) = 1/2 + int_0^x phi, regola dei trapezi
  const h = x / n; let s = (phi(0) + phi(x)) / 2; for (let i = 1; i < n; i++) s += phi(i * h);
  return 0.5 + s * h;
}
function simpson(x, n) {                               // n pari
  n += n % 2; const h = x / n; let s = phi(0) + phi(x);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * phi(i * h);
  return 0.5 + (s * h) / 3;
}
function serieAlt(x) {                                 // erf(z) = 2/sqrt(pi) * sum (-1)^k z^(2k+1) / (k! (2k+1)), a segni alterni
  const z = x / Math.SQRT2; let term = z, s = z;
  for (let k = 1; k < 200; k++) { term *= -z * z / k; const t = term / (2 * k + 1); s += t; if (Math.abs(t) < 1e-18) break; }
  return 0.5 * (1 + (2 / Math.sqrt(PI)) * s);
}
function erfcPos(z) {                                  // erfc per z>0: serie a termini positivi (z<3) o frazione continua (z>=3)
  if (z < 3) {
    let term = z, s = z;                                // erf(z) = 2/sqrt(pi) e^{-z^2} sum 2^k z^(2k+1) / (2k+1)!!
    for (let k = 1; k < 500; k++) { term *= 2 * z * z / (2 * k + 1); s += term; if (term < 1e-18 * s) break; }
    return 1 - (2 / Math.sqrt(PI)) * Math.exp(-z * z) * s;
  }
  let c = 0; for (let k = 60; k >= 1; k--) c = (k / 2) / (z + c);   // erfc = e^{-z^2}/sqrt(pi) / (z + (1/2)/(z + 1/(z + (3/2)/(z + ...))))
  return Math.exp(-z * z) / Math.sqrt(PI) / (z + c);
}
function phiBuono(x) { const e = erfcPos(Math.abs(x) / Math.SQRT2) / 2; return x >= 0 ? 1 - e : e; }
function phiAS(x) {                                    // Abramowitz-Stegun 7.1.26: razionale in t = 1/(1+p z), errore < 1,5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
// Riferimento: valori a 16 cifre (Python math.erfc / scipy.special.ndtr), in accordo con le tavole standard (es. Phi(1,96)=0,975002...)
const REF = [[-5, 2.8665157187919455e-7], [-1, 0.15865525393145707], [0.5, 0.691462461274013], [1, 0.8413447460685428], [1.96, 0.9750021048517796],
  [2, 0.9772498680518209], [3, 0.9986501019683699], [4, 0.9999683287581669], [5, 0.9999997133484282]];
const METODI = [
  { id: "trap", name: "trapezi (n=1000)", fn: (x) => trapezio(x, 1000), color: "pink" },
  { id: "simp", name: "Simpson (n=100)", fn: (x) => simpson(x, 100), color: "amber" },
  { id: "serie", name: "serie di erf, segni alterni", fn: serieAlt, color: "violet" },
  { id: "as", name: "Abramowitz–Stegun 7.1.26", fn: phiAS, color: "cyan" },
  { id: "buono", name: "serie positiva + frazione continua", fn: phiBuono, color: "green" },
];

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const C = Plots.COL, fx = (x, d = 3) => x.toFixed(d).replace(".", ",");
  const sci = (x) => (x === 0 ? "0" : x.toExponential(1).replace(".", ",").replace("e", "·10^").replace("+", ""));
  const timeIt = (fn, n) => { const reps = Math.max(1, Math.ceil(2e5 / n)); const t0 = performance.now(); let v; for (let r = 0; r < reps; r++) v = fn(); return [v, (performance.now() - t0) / reps]; };

  /* Es. 1 */
  const NS = logGrid(11, 100001);
  const run1 = () => {
    const F = FUNS[$("fun").value];
    const err = (v) => Math.max(Math.abs(v - F.I), 1e-17);
    const mid = NS.map((n) => err(riemann(F, n, "mid")));
    const left = isFinite(F.f(F.a)) ? NS.map((n) => err(riemann(F, n, "left"))) : NS.map(() => NaN);
    const leb = NS.map((n) => err(lebesgue(F, n)));
    Plots.curves($("c-int"), { xs: NS, xLog: true, yLog: true, ymin: 1e-12, ymax: 3, xTitle: "n (sottointervalli per Riemann, livelli per Lebesgue)",
      series: [{ name: "Riemann, punto medio", ys: mid, color: C.green, markers: true }, { name: "Riemann, estremo sinistro", ys: left, color: C.amber, markers: true }, { name: "Lebesgue (somma inferiore)", ys: leb, color: C.cyan, markers: true }] });
    $("int-ex").textContent = `valore esatto = ${F.I.toFixed(10).replace(".", ",")}`;
    const rows = [101, 1001, 10001, 100001].map((n) => {
      const [m, tm] = timeIt(() => riemann(F, n, "mid"), n), [l, tl] = timeIt(() => lebesgue(F, n), n);
      return `<tr><td>${n}</td><td>${sci(Math.abs(m - F.I))}</td><td>${tm.toFixed(3)}</td><td>${sci(Math.abs(l - F.I))}</td><td>${tl.toFixed(3)}</td></tr>`;
    }).join("");
    $("int-tab").innerHTML = `<table class="res-table"><thead><tr><th>n</th><th>errore Riemann (medio)</th><th>tempo (ms)</th><th>errore Lebesgue</th><th>tempo (ms)</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  $("fun").addEventListener("input", run1);

  const thomae = () => {
    const rows = [10, 100, 1000, 10000].map((n) => `<tr><td>${n}</td><td>0</td><td>${fx(thomaeUpper(n), 4)}</td></tr>`).join("");
    $("thomae").innerHTML = `<table class="res-table"><thead><tr><th>n parti</th><th>somma inferiore</th><th>somma superiore</th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  /* Es. 2 */
  const run2 = () => {
    const head = METODI.map((m) => `<th>${m.name}</th>`).join("");
    const rows = REF.map(([x, r]) => `<tr><td>${x}</td><td>${r.toPrecision(10)}</td>${METODI.map((m) => `<td>${sci(Math.abs(m.fn(x) - r))}</td>`).join("")}</tr>`).join("");
    $("cdf-tab").innerHTML = `<table class="res-table"><thead><tr><th>x</th><th>Φ(x) di riferimento</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    const x0 = 1.96, ref = REF.find((r) => r[0] === x0)[1], ns = logGrid(5, 20001, 3);
    Plots.curves($("c-conv"), { xs: ns, xLog: true, yLog: true, ymin: 1e-17, ymax: 1, xTitle: "n (suddivisioni), x = 1,96",
      series: [{ name: "trapezi", ys: ns.map((n) => Math.max(Math.abs(trapezio(x0, n) - ref), 1e-17)), color: C.pink, markers: true },
        { name: "Simpson", ys: ns.map((n) => Math.max(Math.abs(simpson(x0, n) - ref), 1e-17)), color: C.amber, markers: true }] });
    const trows = METODI.map((m) => { const [, t] = timeIt(() => m.fn(1.96), 100); return `<tr><td>${m.name}</td><td>${(t * 1000).toFixed(2)}</td></tr>`; }).join("");
    $("cdf-time").innerHTML = `<table class="res-table"><thead><tr><th>metodo</th><th>tempo per valutazione (µs)</th></tr></thead><tbody>${trows}</tbody></table>`;
  };
  $("x-in").addEventListener("input", () => {
    const x = parseFloat($("x-in").value.replace(",", "."));
    $("x-out").textContent = isFinite(x) ? METODI.map((m) => `${m.name.padEnd(36)} ${m.fn(x).toPrecision(15)}`).join("\n") : "";
  });
  window.addEventListener("load", () => { run1(); thomae(); run2(); $("x-in").dispatchEvent(new Event("input")); });
}
if (typeof module !== "undefined") module.exports = { FUNS, riemann, lebesgue, thomaeUpper, trapezio, simpson, serieAlt, phiAS, phiBuono, REF };
