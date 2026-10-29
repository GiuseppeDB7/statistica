/*
 * Simulazione del processo di penetrazione e statistiche (homework 4), senza interfaccia.
 *
 * Modello: un attaccante attacca n sistemi uno dopo l'altro. L'esito sul sistema i è X_i:
 *   Bernoulli(p):   X_i = 1 (penetrato) con probabilità p, 0 altrimenti
 *   Rademacher:     X_i = +1 (penetrato) o −1 (respinto), ciascuno con probabilità 1/2
 * Gli X_i sono indipendenti e identicamente distribuiti (i.i.d.).
 * Si simulano m attaccanti indipendenti: ciascuno è una traiettoria S_k = X_1 + … + X_k.
 *
 * Tre quantità: totale S_n, media S_n/n, totale normalizzato S_n/√n.
 */
const Analysis4 = (() => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /* ---------- Generatore pseudocasuale con seme (riproducibile) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Teoria: media, varianza e momento terzo dell'incremento ---------- */
  function theory(model, p) {
    if (model === "rademacher") return { mu: 0, var: 1, sd: 1, rho: 1, lo: -1, hi: 1 };
    const q = 1 - p, v = p * q;
    return { mu: p, var: v, sd: Math.sqrt(v), rho: v * (p * p + q * q), lo: 0, hi: 1 };   // rho = E|X − μ|³
  }

  /* ---------- Simulazione ---------- */
  // Punti di controllo n (interi, equispaziati in scala logaritmica) in cui si registra S_n
  function makeGrid(nMax, perDecade = 14) {
    const set = new Set([1, nMax]);
    for (let e = 0; e <= Math.log10(nMax) + 1e-9; e += 1 / perDecade) set.add(Math.min(nMax, Math.max(1, Math.round(10 ** e))));
    for (let d = 1; d <= Math.log10(nMax); d++) set.add(10 ** d);         // 10, 100, 1000, …
    return [...set].filter((v) => v <= nMax).sort((a, b) => a - b);
  }

  /*
   * opts = { model, p, n, m, seed }
   * Restituisce { grid, S (matrice m × |grid|, per riga un attaccante), opts, th }
   */
  // Ciclo caldo: simula gli attaccanti da j0 a j1 (esclusa) e restituisce lo stato del generatore.
  // È una funzione SINCRONA a parte: dentro una funzione async il motore JavaScript non ottimizza il
  // ciclo e va 5 volte più piano. Il generatore mulberry32 è scritto qui dentro (niente chiamata per
  // passo) e il confronto "u < p" si fa sugli interi: u32 < p·2³².
  function simulateChunk(S, grid, C, j0, j1, a, thr, bern) {
    for (let j = j0; j < j1; j++) {
      let s = 0, k = 0;
      const row = j * C;
      for (let g = 0; g < C; g++) {
        const stop = grid[g];
        if (bern) {
          for (; k < stop; k++) {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            if (((t ^ (t >>> 14)) >>> 0) < thr) s++;
          }
        } else {
          for (; k < stop; k++) {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            s += ((t ^ (t >>> 14)) >>> 0) < thr ? 1 : -1;
          }
        }
        S[row + g] = s;
      }
    }
    return a;
  }

  async function simulate(opts, progress = () => {}) {
    const { model, p, n, m, seed } = opts;
    const grid = makeGrid(n), C = grid.length;
    const S = new Float64Array(m * C);
    const bern = model === "bernoulli";
    const thr = Math.floor((bern ? p : 0.5) * 4294967296);
    let a = seed | 0;
    const block = Math.max(1, Math.min(50, Math.floor(2e6 / n)));      // attaccanti per blocco (circa 2·10⁶ passi)
    for (let j = 0; j < m; j += block) {
      a = simulateChunk(S, grid, C, j, Math.min(m, j + block), a, thr, bern);
      progress(Math.min(1, (j + block) / m));
      await tick();
    }
    return { grid, S, m, C, opts, th: theory(model, p) };
  }

  /* ---------- Le tre quantità ---------- */
  // Valori di una quantità ("total" | "mean" | "norm") a una colonna della griglia
  function column(sim, g, kind = "total") {
    const { S, m, C, grid } = sim, n = grid[g], out = new Float64Array(m);
    const f = kind === "total" ? 1 : kind === "mean" ? 1 / n : 1 / Math.sqrt(n);
    for (let j = 0; j < m; j++) out[j] = S[j * C + g] * f;
    return out;
  }
  // Variabile standardizzata Z_n = (S_n − nμ) / (σ√n): per Rademacher coincide con S_n/√n
  function standardized(sim, g) {
    const { S, m, C, grid, th } = sim, n = grid[g], out = new Float64Array(m), sq = th.sd * Math.sqrt(n);
    for (let j = 0; j < m; j++) out[j] = (S[j * C + g] - n * th.mu) / sq;
    return out;
  }
  const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
  const variance = (a) => { const mu = mean(a); let s = 0; for (const v of a) s += (v - mu) * (v - mu); return s / (a.length - 1); };

  // Media e varianza empiriche delle tre quantità, accanto ai valori teorici
  function moments(sim, g) {
    const n = sim.grid[g], { mu, var: v } = sim.th, out = {};
    for (const [kind, tm, tv] of [["total", n * mu, n * v], ["mean", mu, v / n], ["norm", Math.sqrt(n) * mu, v]]) {
      const c = column(sim, g, kind);
      out[kind] = { mean: mean(c), variance: variance(c), theoMean: tm, theoVar: tv };
    }
    return out;
  }

  /* ---------- Legge dei grandi numeri: P(|S_n/n − μ| > ε) ---------- */
  function llnCurve(sim, eps) {
    const { S, m, C, grid, th } = sim, out = [];
    for (let g = 0; g < C; g++) {
      let bad = 0;
      for (let j = 0; j < m; j++) if (Math.abs(S[j * C + g] / grid[g] - th.mu) > eps) bad++;
      out.push(bad / m);
    }
    return out;
  }
  // Limiti teorici: Chebyshev σ²/(nε²) e Hoeffding (X limitata in [lo, hi])
  const chebyshev = (th, n, eps) => Math.min(1, th.var / (n * eps * eps));
  const hoeffding = (th, n, eps) => Math.min(1, 2 * Math.exp((-2 * n * eps * eps) / ((th.hi - th.lo) ** 2)));

  /* ---------- Teorema del limite centrale: distanza di Kolmogorov--Smirnov ---------- */
  // Funzione di ripartizione della normale standard (Abramowitz--Stegun 7.1.26, errore < 1.5e-7)
  function Phi(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  const phi = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

  // KS tra la ripartizione empirica del campione z e la normale standard
  function ksEmpirical(z) {
    const a = Float64Array.from(z).sort(), m = a.length;
    let d = 0;
    for (let i = 0; i < m; i++) {
      const f = Phi(a[i]);
      d = Math.max(d, (i + 1) / m - f, f - i / m);
    }
    return d;
  }

  // Distanza KS ESATTA tra la binomiale standardizzata (S_n = somma di n Bernoulli(p)) e la normale.
  // Per Rademacher: S_n = 2B − n con B ~ Bin(n, 1/2), standardizzata = (2B − n)/√n.
  let lf = [0];                                            // logaritmi dei fattoriali
  function logFact(n) { for (let i = lf.length; i <= n; i++) lf.push(lf[i - 1] + Math.log(i)); return lf; }
  function exactKS(n, p) {
    const L = logFact(n), q = 1 - p, lp = Math.log(p), lq = Math.log(q), sd = Math.sqrt(n * p * q);
    let cdf = 0, d = 0;
    for (let k = 0; k <= n; k++) {
      const pk = Math.exp(L[n] - L[k] - L[n - k] + k * lp + (n - k) * lq);
      const z = (k - n * p) / sd, f = Phi(z);
      d = Math.max(d, Math.abs(cdf - f), Math.abs(cdf + pk - f));   // salto in z: confronto prima e dopo
      cdf += pk;
    }
    return d;
  }
  // Limite di Berry--Esseen: sup|F_n − Φ| ≤ C·ρ/(σ³√n), C ≤ 0,4748 (Shevtsova)
  const berryEsseen = (th, n) => (0.4748 * th.rho) / (th.sd ** 3 * Math.sqrt(n));

  // Curve KS: empirica (dal campione), esatta e limite di Berry--Esseen, per ogni n della griglia
  function ksCurves(sim) {
    const p = sim.opts.model === "rademacher" ? 0.5 : sim.opts.p;
    const emp = [], exact = [], be = [];
    for (let g = 0; g < sim.C; g++) {
      const n = sim.grid[g];
      emp.push(ksEmpirical(standardized(sim, g)));
      exact.push(n <= 200000 ? exactKS(n, p) : NaN);
      be.push(berryEsseen(sim.th, n));
    }
    return { emp, exact, be, noise: 1.358 / Math.sqrt(sim.m) };      // soglia al 5% del test KS con m dati
  }

  /* ---------- Aggregato su m attaccanti e n sistemi ---------- */
  // Tasso medio di penetrazione su tutti i sistemi e tutti gli attaccanti e suo errore standard
  function aggregate(th, n, m) {
    const rate = th.mu, se = th.sd / Math.sqrt(n * m);
    return { n, m, rate, se, totalMean: n * m * th.mu, totalSd: th.sd * Math.sqrt(n * m) };
  }

  return { mulberry32, theory, makeGrid, simulate, column, standardized, moments, mean, variance, llnCurve, chebyshev, hoeffding, Phi, phi, ksEmpirical, exactKS, berryEsseen, ksCurves, aggregate };
})();

if (typeof module !== "undefined") module.exports = Analysis4;
