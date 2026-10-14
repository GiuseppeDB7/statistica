/*
 * Esperimenti statistici su k ↦ kG (scala 2 e 3), senza interfaccia grafica.
 * Restituiscono solo numeri: la pagina (explore.js) li disegna.
 */
const Analysis = (() => {
  const tick = () => new Promise((r) => setTimeout(r, 0)); // lascia respirare il browser

  /* ---------- Helper ---------- */

  // Classe (0..bins-1) del valore v ∈ [0, p): intervalli di uguale ampiezza
  const binOf = (v, p, bins) => Math.floor((v * bins) / p);

  // Probabilità esatta di ogni classe se v è uniforme su {0, ..., p-1}
  function binProbs(p, bins) {
    const c = new Array(bins).fill(0);
    for (let v = 0; v < p; v++) c[binOf(v, p, bins)]++;
    return c.map((x) => x / p);
  }

  function uniformity(values, p, bins) {
    const counts = new Array(bins).fill(0);
    for (const v of values) counts[binOf(v, p, bins)]++;
    return { counts, probs: binProbs(p, bins), ...Stats.chiSquare(counts, binProbs(p, bins)) };
  }

  // Frequenza del bit b = 1 per ogni posizione, e valore atteso se v è uniforme su [0, p)
  function bitFrequencies(values, nb) {
    const f = new Array(nb).fill(0);
    for (const v of values) for (let b = 0; b < nb; b++) f[b] += (v >> b) & 1;
    return f.map((c) => c / values.length);
  }
  function expectedBitFrequencies(p, nb) {
    const f = new Array(nb).fill(0);
    for (let v = 0; v < p; v++) for (let b = 0; b < nb; b++) f[b] += (v >> b) & 1;
    return f.map((c) => c / p);
  }
  // z-score di ogni frequenza osservata rispetto all'attesa, con N osservazioni
  const bitZ = (obs, exp, N) => obs.map((o, i) => (o - exp[i]) / Math.sqrt((exp[i] * (1 - exp[i])) / N));

  function multiplicity(arr) {
    const m = new Map();
    for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
    const hist = {}; // molteplicità → quanti valori distinti la hanno
    for (const c of m.values()) hist[c] = (hist[c] || 0) + 1;
    return { distinct: m.size, hist, values: [...m.keys()] };
  }

  /* ---------- Scala 2: curva intermedia, popolazione completa ---------- */

  async function analyzeMid(progress = () => {}) {
    const C = EC.CURVES.mid, G = C.G;
    const n = Number(C.n), p = Number(C.p);
    const nb = (p - 1).toString(2).length; // bit necessari per le coordinate
    const R = {};
    R.params = { n, p, nb };

    progress("Calcolo tutti i multipli kG, k = 1 … n−1");
    const P = new Array(n); // P[k] = kG
    P[1] = G;
    for (let k = 2; k < n; k++) P[k] = EC.add(C, P[k - 1], G);
    R.closes = EC.add(C, P[n - 1], G) === null; // n·G = O
    const X = new Array(n), Y = new Array(n);
    for (let k = 1; k < n; k++) { X[k] = Number(P[k].x); Y[k] = Number(P[k].y); }
    R.P = P; R.X = X; R.Y = Y;
    await tick();

    progress("Frequenza dei valori e uniformità (χ²)");
    const mx = multiplicity(X.slice(1)), my = multiplicity(Y.slice(1));
    R.mult = { x: mx, y: my };
    R.chiX = uniformity(mx.values, p, 16);
    R.chiY = uniformity(my.values, p, 16);

    // Simmetria x(k) = x(n−k) e struttura (x,y) → (ωx, y) = λ·(x,y), con ω³ = 1
    let mirror = 0;
    for (let k = 1; k < n; k++) if (X[k] === X[n - k]) mirror++;
    R.mirror = { ok: mirror, total: n - 1 };
    let w = 1n;
    for (let g = 2n; w === 1n; g++) w = EC.modpow(g, (C.p - 1n) / 3n, C.p);
    const idx = new Map();
    for (let k = 1; k < n; k++) idx.set(X[k] * p + Y[k], k);
    const lambda = idx.get(Number((w * G.x) % C.p) * p + Number(G.y));
    let endoOk = 0;
    for (let k = 1; k < n; k++) {
      const j = (lambda * k) % n; // indice di λ·(kG)
      if (X[j] === Number((w * BigInt(X[k])) % C.p) && Y[j] === Y[k]) endoOk++;
    }
    R.endo = { omega: Number(w), lambda, ok: endoOk, total: n - 1, lambdaCubed: Number((BigInt(lambda) ** 3n) % C.n) };
    await tick();

    progress("Bit delle coordinate");
    R.bits = {
      nb,
      x: bitFrequencies(mx.values, nb), y: bitFrequencies(my.values, nb),
      exp: expectedBitFrequencies(p, nb), Nx: mx.distinct, Ny: my.distinct,
    };
    R.bits.zx = bitZ(R.bits.x, R.bits.exp, mx.distinct);
    R.bits.zy = bitZ(R.bits.y, R.bits.exp, my.distinct);
    R.bits.zCrit = Stats.zCritical(0.05, 2 * nb);
    await tick();

    progress("Correlazioni tra input e output");
    // x(k) = x(n−k): la seconda metà della sequenza ripete la prima, quindi i dati
    // indipendenti sono solo i primi h. Uso solo quelli, altrimenti gonfio la significatività.
    const h = (n - 1) / 2;
    const ks = Array.from({ length: h }, (_, i) => i + 1);
    const xs = ks.map((k) => X[k]), ys = ks.map((k) => Y[k]);
    const r = {
      kx: Stats.pearson(ks, xs), ky: Stats.pearson(ks, ys),
      lag: Stats.pearson(xs.slice(0, -1), xs.slice(1)),
      N: h,
    };
    r.zkx = r.kx * Math.sqrt(h); r.zky = r.ky * Math.sqrt(h); r.zlag = r.lag * Math.sqrt(h - 1);
    R.corr = r;
    await tick();

    progress("Avalanche: curva ellittica contro SHA-256");
    const H = new Array(n);
    for (let k = 1; k < n; k++) H[k] = Stats.sha256Int(k);
    const ecAv = [], shaAv = [];
    for (let b = 0; b < nb; b++) {
      let se = 0, ss = 0, c = 0;
      for (let k = 1; k < n; k++) {
        const k2 = k ^ (1 << b);
        if (k2 < 1 || k2 >= n) continue;
        se += Stats.popcount(X[k] ^ X[k2]);
        let hd = 0;
        for (let j = 0; j < 8; j++) hd += Stats.popcount(H[k][j] ^ H[k2][j]);
        ss += hd; c++;
      }
      ecAv.push(se / c / nb);
      shaAv.push(ss / c / 256);
    }
    R.aval = { ec: ecAv, sha: shaAv, nb };
    await tick();

    progress("Incrementi Q(k+1) − Q(k) e linearità");
    const ecDiffs = new Set(), shaDiffs = new Set();
    for (let k = 1; k < n - 1; k++) {
      const d = EC.add(C, P[k + 1], EC.neg(C, P[k]));
      ecDiffs.add(d === null ? "O" : `${d.x},${d.y}`);
      let s = "";
      for (let j = 0; j < 8; j++) s += ((H[k + 1][j] ^ H[k][j]) >>> 0).toString(16) + ".";
      shaDiffs.add(s);
    }
    R.incr = { ec: ecDiffs.size, sha: shaDiffs.size, total: n - 2, ecValue: [...ecDiffs][0] };
    let linOk = 0; const LT = 1000;
    for (let i = 0; i < LT; i++) {
      const k1 = 1 + Math.floor(Math.random() * (n - 2)), k2 = 1 + Math.floor(Math.random() * (n - 1 - k1));
      const sum = EC.add(C, P[k1], P[k2]);
      if (EC.eq(sum, P[k1 + k2])) linOk++;
    }
    R.lin = { ok: linOk, total: LT };
    await tick();

    progress("Attacco a forza bruta: ritrovo k da Q");
    const T = 20; let steps = 0;
    const t0 = performance.now();
    for (let i = 0; i < T; i++) {
      const k = 1 + Math.floor(Math.random() * (n - 1)), Q = P[k];
      let cur = G, found = 1;
      while (!(cur.x === Q.x && cur.y === Q.y)) { cur = EC.add(C, cur, G); found++; }
      steps += found;
    }
    const ms = performance.now() - t0;
    R.brute = { targets: T, avgSteps: steps / T, msPerKey: ms / T, opsPerSec: (steps / ms) * 1000 };
    return R;
  }

  /* ---------- Scala 3: secp256k1, campione di chiavi ---------- */

  const rand256 = (n) => {
    const b = new Uint8Array(32);
    (globalThis.crypto || require("crypto").webcrypto).getRandomValues(b);
    let v = 0n;
    for (const x of b) v = (v << 8n) | BigInt(x);
    return (v % (n - 1n)) + 1n; // 1 … n−1 (demo: bias trascurabile)
  };

  async function sampleSecp(N, nAval, progress = () => {}) {
    const C = EC.CURVES.secp256k1, G = C.G;
    const R = { N };
    const xs = [];
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      xs.push(EC.mulJac(C, rand256(C.n), G).x);
      if (i % 50 === 49) { progress(`Chiavi: ${i + 1}/${N}`); await tick(); }
    }
    R.ms = performance.now() - t0;
    // Bit di x
    const f = new Array(256).fill(0);
    for (const x of xs) { const s = x.toString(2).padStart(256, "0"); for (let b = 0; b < 256; b++) if (s[255 - b] === "1") f[b]++; }
    R.bitFreq = f.map((c) => c / N);
    R.bitZ = R.bitFreq.map((o) => (o - 0.5) / Math.sqrt(0.25 / N));
    R.zCrit = Stats.zCritical(0.05, 256);
    // Uniformità su 16 intervalli di x (x < p ≈ 2²⁵⁶)
    const bins = 16, counts = new Array(bins).fill(0);
    for (const x of xs) counts[Number((x * BigInt(bins)) / C.p)]++;
    R.chi = { counts, ...Stats.chiSquare(counts, new Array(bins).fill(1 / bins)) };
    // Avalanche: capovolgo un bit della chiave e conto i bit che cambiano nella x pubblica
    const positions = Array.from({ length: 16 }, (_, i) => i * 16); // 0, 16, …, 240
    const sums = new Array(16).fill(0);
    let done = 0;
    for (let i = 0; i < nAval; i++) {
      const k = rand256(C.n), x1 = EC.mulJac(C, k, G).x;
      positions.forEach((pos, j) => {
        const k2 = k ^ (1n << BigInt(pos));
        if (k2 >= 1n && k2 < C.n) sums[j] += Stats.popcountBig(x1 ^ EC.mulJac(C, k2, G).x);
      });
      done++;
      if (i % 10 === 9) { progress(`Avalanche: ${i + 1}/${nAval}`); await tick(); }
    }
    R.aval = { positions, frac: sums.map((s) => s / done / 256) };
    return R;
  }

  return { analyzeMid, sampleSecp, rand256, binOf, binProbs, uniformity, bitFrequencies, expectedBitFrequencies };
})();

if (typeof module !== "undefined") module.exports = Analysis;
