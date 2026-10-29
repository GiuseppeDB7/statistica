/*
 * Collega i controlli della pagina alla simulazione (analysis4.js) e ai grafici (plots.js).
 */
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$("sim-go")) return;
  const A = Analysis4, P = Plots;

  const M_LIST = [100, 300, 1000, 2000, 5000, 10000];
  const st = { model: "bernoulli", view: "total", sim: null, busy: false, again: false, timer: null };

  /* ---------- Formattazione ---------- */
  const it = (v, d = 2) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const int = (v) => Math.round(v).toLocaleString("it-IT");
  // numero leggibile: tondo se medio, notazione scientifica se molto grande o piccolo
  function num(v) {
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1e5 || a < 1e-2) return v.toExponential(2).replace(".", ",").replace("e+", "·10^").replace("e-", "·10^−").replace(/\^(\d)/, "^$1");
    return it(v, a >= 100 ? 1 : a >= 10 ? 2 : 3);
  }
  const sup = (s) => s.replace(/·10\^(−?\d+)/, "·10<sup>$1</sup>");
  const fnum = (v) => sup(num(v));

  /* ---------- Controlli ---------- */
  const pNow = () => Number($("p-range").value);
  const mNow = () => M_LIST[Number($("m-range").value)];
  const nNow = () => Number($("n-sel").value);
  function setModel(m) {
    st.model = m;
    $("mod-bern").setAttribute("aria-pressed", String(m === "bernoulli"));
    $("mod-rad").setAttribute("aria-pressed", String(m === "rademacher"));
    $("p-range").disabled = m === "rademacher";
    $("q-std").textContent = m === "rademacher" ? "centrato (coincide con S_k/√k)" : "centrato (S_k−kμ)/(σ√k)";
  }
  function setView(v) {
    st.view = v;
    for (const k of ["total", "mean", "norm", "std"]) $("q-" + k).setAttribute("aria-pressed", String(k === v));
    if (st.sim) renderPaths();
  }
  function schedule() {          // rilancio automatico dopo una modifica, se il calcolo è breve
    clearTimeout(st.timer);
    const secs = nNow() * mNow() * 3e-8;
    $("p-out").textContent = it(pNow(), 2); $("m-out").textContent = int(mNow());
    if (secs > 4) { $("sim-status").textContent = `Parametri pesanti (circa ${it(secs, 0)} s): premi «simula».`; return; }
    st.timer = setTimeout(run, 350);
  }
  $("mod-bern").addEventListener("click", () => { setModel("bernoulli"); schedule(); });
  $("mod-rad").addEventListener("click", () => { setModel("rademacher"); schedule(); });
  for (const id of ["p-range", "m-range", "n-sel"]) $(id).addEventListener("input", schedule);
  $("seed-in").addEventListener("change", () => schedule());
  $("seed-new").addEventListener("click", () => { $("seed-in").value = String(Math.floor(Math.random() * 1e6)); schedule(); });
  $("sim-go").addEventListener("click", () => { clearTimeout(st.timer); run(); });
  for (const k of ["total", "mean", "norm", "std"]) $("q-" + k).addEventListener("click", () => setView(k));
  $("eps-sel").addEventListener("change", () => { if (st.sim) renderLLN(); });

  /* ---------- Esecuzione ---------- */
  async function run() {
    if (st.busy) { st.again = true; return; }
    st.busy = true;
    const opts = { model: st.model, p: pNow(), n: nNow(), m: mNow(), seed: parseInt($("seed-in").value, 10) || 1 };
    const t0 = performance.now(), status = $("sim-status");
    $("sim-go").disabled = true;
    try {
      const sim = await A.simulate(opts, (f) => { status.textContent = `simulo… ${Math.round(f * 100)}%`; });
      st.sim = sim;
      status.textContent = "calcolo le statistiche…";
      await new Promise((r) => setTimeout(r, 0));
      renderAll();
      status.textContent = `${int(opts.m)} attaccanti × ${int(opts.n)} sistemi = ${int(opts.m * opts.n)} esiti simulati in ${it((performance.now() - t0) / 1000, 1)} s.`;
    } catch (e) {
      status.textContent = "Errore: " + e.message;
      console.error(e);
    }
    $("sim-go").disabled = false;
    st.busy = false;
    if (st.again) { st.again = false; run(); }
  }

  function renderAll() { renderPaths(); renderHists(); renderMoments(); renderLLN(); renderKS(); renderInterp(); }

  /* ---------- Traiettorie ---------- */
  function renderPaths() {
    const sim = st.sim, { grid, S, m, C, th } = sim, v = st.view;
    const f = (g, x) => {                      // valore della quantità scelta per il punto di controllo g
      const k = grid[g];
      return v === "total" ? x : v === "mean" ? x / k : v === "norm" ? x / Math.sqrt(k) : (x - k * th.mu) / (th.sd * Math.sqrt(k));
    };
    const expect = grid.map((k) => (v === "total" ? k * th.mu : v === "mean" ? th.mu : v === "norm" ? Math.sqrt(k) * th.mu : 0));
    const half = grid.map((k) => 2 * (v === "total" ? th.sd * Math.sqrt(k) : v === "mean" ? th.sd / Math.sqrt(k) : v === "norm" ? th.sd : 1));
    const mean = grid.map((k, g) => { let s = 0; for (let j = 0; j < m; j++) s += S[j * C + g]; return f(g, s / m); });
    const lines = [];
    for (let j = 0; j < Math.min(30, m); j++) lines.push(grid.map((k, g) => f(g, S[j * C + g])));
    const lo = expect.map((e, i) => e - half[i]), hi = expect.map((e, i) => e + half[i]);
    // asse verticale: la fascia, ma senza che i primi passi (molto larghi) schiaccino il resto
    const tail = Math.floor(grid.length * 0.25);
    let ylo = Math.min(...lo.slice(tail)), yhi = Math.max(...hi.slice(tail));
    if (v === "mean" || v === "norm" || v === "std") { ylo = Math.min(ylo, ...lo.slice(2)); yhi = Math.max(yhi, ...hi.slice(2)); }
    const yRange = v === "total" ? [Math.min(...lo), Math.max(...hi)] : [ylo, yhi];
    const titles = { total: "S_k (punteggio totale)", mean: "S_k/k (punteggio medio)", norm: "S_k/√k", std: "(S_k − kμ)/(σ√k)" };
    P.paths($("ch-paths"), { xs: grid, lines, bands: { lo, hi }, mean, expected: expect, xLog: v !== "total", xTitle: `numero di sistemi k · ${titles[v]}`, yRange });
    const n = sim.opts.n, last = grid.length - 1;
    const sdEmp = (() => { const col = lines.map((l) => l[last]); return A.variance(col) ** 0.5; })();
    $("paths-note").innerHTML = ({
      total: `A n = ${int(n)}: media teorica ${fnum(n * th.mu)}, deviazione standard ${fnum(th.sd * Math.sqrt(n))}. ` +
        (th.mu === 0 ? "La media resta 0" : "La media cresce in modo lineare") + ` e la fascia si allarga come √k: i singoli attaccanti si <b>disperdono</b> sempre di più.`,
      mean: `La fascia si <b>restringe</b> come 1/√k e tutte le traiettorie si stringono attorno a μ = ${it(th.mu, 2)}: è la legge dei grandi numeri. A n = ${int(n)} la deviazione standard è ${fnum(th.sd / Math.sqrt(n))}.`,
      norm: th.mu === 0 ? `La fascia ha larghezza <b>costante</b> (±2σ): le traiettorie non si disperdono e non si concentrano, restano «stazionarie» e distribuite come N(0, 1).` : `Dispersione costante (±2σ), ma la media √k·p <b>cresce</b>: la quantità si sposta e non converge a una distribuzione. Va centrata (quarto pulsante).`,
      std: `Centrata e scalata, la quantità resta nella fascia ±2 con probabilità circa 95%, a qualunque k: è il contenuto del teorema del limite centrale.`,
    })[v] + ` <span class="dim">(deviazione standard misurata sulle 30 traiettorie mostrate: ${fnum(sdEmp)})</span>`;
  }

  /* ---------- Istogrammi ---------- */
  function histNs() {
    const nmax = st.sim.opts.n;
    return [10, 100, 1000, 10000, 100000].filter((n) => n <= nmax && st.sim.grid.includes(n)).concat(nmax > 100000 || ![10, 100, 1000, 10000, 100000].includes(nmax) ? [nmax] : []);
  }
  function renderHists() {
    const sim = st.sim, th = sim.th, ns = histNs(), bern = sim.opts.model === "bernoulli";
    const rows = [
      { key: "total", name: "totale S_n", dens: (n) => (x) => A.phi((x - n * th.mu) / (th.sd * Math.sqrt(n))) / (th.sd * Math.sqrt(n)) },
      { key: "mean", name: "media S_n/n", dens: (n) => (x) => A.phi((x - th.mu) / (th.sd / Math.sqrt(n))) / (th.sd / Math.sqrt(n)) },
      { key: "norm", name: bern ? "totale normalizzato S_n/√n (la media √n·p diverge)" : "totale normalizzato S_n/√n (tende a N(0, 1))", dens: (n) => (x) => A.phi((x - Math.sqrt(n) * th.mu) / th.sd) / th.sd },
    ];
    if (bern) rows.push({ key: "std", name: "centrato e normalizzato Z_n = (S_n − np)/√(npq) (tende a N(0, 1))", dens: () => (x) => A.phi(x) });
    const root = $("hist-out"); root.innerHTML = "";
    for (const row of rows) {
      const h = document.createElement("div"); h.className = "rowlabel"; h.textContent = row.name; root.appendChild(h);
      const grid = document.createElement("div"); grid.className = "hist-grid"; root.appendChild(grid);
      for (const n of ns) {
        const g = sim.grid.indexOf(n);
        const vals = row.key === "std" ? A.standardized(sim, g) : A.column(sim, g, row.key);
        const cell = document.createElement("div"); cell.className = "hist-cell";
        cell.innerHTML = `<h5>n = ${int(n)}</h5><canvas></canvas>`; grid.appendChild(cell);
        P.hist(cell.querySelector("canvas"), { values: vals, density: row.dens(n), note: `μ̂ ${num(A.mean(vals))} · σ̂ ${num(A.variance(vals) ** 0.5)}`.replace(/·10\^(−?\d+)/g, "e$1") });
      }
    }
  }

  /* ---------- Momenti e varianza ---------- */
  function renderMoments() {
    const sim = st.sim, ns = histNs(), th = sim.th;
    const mo = ns.map((n) => A.moments(sim, sim.grid.indexOf(n)));
    const head = `<tr><th class="l"></th>${ns.map((n) => `<th>n = ${int(n)}</th>`).join("")}</tr>`;
    const rows = [
      ["E[S_n]", "total", "mean"], ["Var(S_n)", "total", "variance"],
      ["E[S_n/n]", "mean", "mean"], ["Var(S_n/n)", "mean", "variance"],
      ["E[S_n/√n]", "norm", "mean"], ["Var(S_n/√n)", "norm", "variance"],
    ].map(([label, kind, what]) => {
      const cells = mo.map((x) => {
        const e = x[kind][what], t = x[kind][what === "mean" ? "theoMean" : "theoVar"];
        return `<td class="num">${fnum(e)} <span class="dim">(${fnum(t)})</span></td>`;
      }).join("");
      return `<tr><td class="l">${label}</td>${cells}</tr>`;
    }).join("");
    $("mom-out").innerHTML = `<table class="res-table"><thead>${head}</thead><tbody>${rows}</tbody></table>` +
      `<p class="small">Valori simulati (e, tra parentesi, teorici) su ${int(sim.m)} attaccanti. La varianza di S_n cresce con n, quella di S_n/n cala come 1/n, quella di S_n/√n resta σ² = ${it(th.var, 3)}.</p>`;

    // varianza al variare di n, tutti i punti di controllo
    const grid = sim.grid, emp = { total: [], mean: [], norm: [] };
    for (let g = 0; g < grid.length; g++) for (const k of ["total", "mean", "norm"]) emp[k].push(A.variance(A.column(sim, g, k)));
    const all = [...emp.total, ...emp.mean, ...emp.norm].filter((x) => x > 0);
    const ymin = 10 ** Math.floor(Math.log10(Math.min(...all))), ymax = 10 ** Math.ceil(Math.log10(Math.max(...all)));
    P.curves($("ch-var"), {
      xs: grid, xLog: true, yLog: true, ymin, ymax, xTitle: "numero di sistemi n",
      series: [
        { name: "Var(S_n)", ys: emp.total, color: P.COL.green, markers: true, width: 0.01 },
        { name: "Var(S_n/n)", ys: emp.mean, color: P.COL.amber, markers: true, width: 0.01 },
        { name: "Var(S_n/√n)", ys: emp.norm, color: P.COL.pink, markers: true, width: 0.01 },
        { name: "teoria nσ²", ys: grid.map((n) => n * th.var), color: P.COL.green, dash: true, width: 1.2 },
        { name: "σ²/n", ys: grid.map((n) => th.var / n), color: P.COL.amber, dash: true, width: 1.2 },
        { name: "σ²", ys: grid.map(() => th.var), color: P.COL.pink, dash: true, width: 1.2 },
      ],
    });
  }

  /* ---------- Legge dei grandi numeri ---------- */
  function renderLLN() {
    const sim = st.sim, th = sim.th, grid = sim.grid, eps = Number($("eps-sel").value), floor = 0.5 / sim.m;
    const curves = [0.05, 0.1, 0.2].map((e) => A.llnCurve(sim, e));
    const colors = [P.COL.green, P.COL.amber, P.COL.pink];
    const series = [0.05, 0.1, 0.2].map((e, i) => ({ name: `simulata, ε = ${it(e, 2)}`, ys: curves[i].map((x) => (x > 0 ? x : NaN)), color: colors[i], markers: true, width: 1.4 }));
    series.push({ name: `Chebyshev, ε = ${it(eps, 2)}`, ys: grid.map((n) => A.chebyshev(th, n, eps)), color: P.COL.cyan, dash: true, width: 1.3 });
    series.push({ name: `Hoeffding, ε = ${it(eps, 2)}`, ys: grid.map((n) => A.hoeffding(th, n, eps)), color: P.COL.violet, dash: true, width: 1.3 });
    P.curves($("ch-lln"), { xs: grid, xLog: true, yLog: true, ymin: 1e-4, ymax: 1, series, xTitle: "numero di sistemi n · P(|S_n/n − μ| > ε)", hlines: [{ y: floor, name: "1/(2m): sotto, nessun attaccante fuori", color: "#888888" }] });
    const ns = histNs(), ci = [0.05, 0.1, 0.2].indexOf(eps);
    $("lln-out").innerHTML = `<table class="res-table"><thead><tr><th class="l">ε = ${it(eps, 2)}</th>${ns.map((n) => `<th>n = ${int(n)}</th>`).join("")}</tr></thead><tbody>` +
      `<tr><td class="l">simulata</td>${ns.map((n) => { const x = curves[ci][grid.indexOf(n)]; return `<td class="num">${x > 0 ? it(x, 4) : `0 <span class="dim">(&lt; ${it(1 / sim.m, 4)})</span>`}</td>`; }).join("")}</tr>` +
      `<tr><td class="l">Chebyshev σ²/(nε²)</td>${ns.map((n) => `<td class="num">${it(A.chebyshev(th, n, eps), 4)}</td>`).join("")}</tr>` +
      `<tr><td class="l">Hoeffding</td>${ns.map((n) => `<td class="num">${fnum(A.hoeffding(th, n, eps))}</td>`).join("")}</tr></tbody></table>` +
      `<p class="small">La probabilità simulata cala fino a zero e sta sempre sotto i due limiti: Chebyshev è molto largo (cala come 1/n), Hoeffding cala come e<sup>−cn</sup> e segue molto meglio la curva reale.${sim.opts.model === "rademacher" ? " Per Rademacher la curva è un po' irregolare a n piccolo perché S_n/n assume pochi valori e dipende dalla parità di n." : ""}</p>`;
  }

  /* ---------- Limite centrale ---------- */
  function renderKS() {
    const sim = st.sim, ks = A.ksCurves(sim), grid = sim.grid;
    P.curves($("ch-ks"), {
      xs: grid, xLog: true, yLog: true, ymin: 1e-4, ymax: 1, xTitle: "numero di sistemi n · distanza KS tra Z_n e N(0, 1)",
      series: [
        { name: "simulata (campione)", ys: ks.emp, color: P.COL.green, markers: true, width: 1.4 },
        { name: "esatta", ys: ks.exact, color: P.COL.cyan, width: 1.6 },
        { name: "Berry–Esseen", ys: ks.be, color: P.COL.violet, dash: true, width: 1.3 },
      ],
      hlines: [{ y: ks.noise, name: "rumore con m attaccanti", color: P.COL.amber }],
    });
    const g1 = grid.indexOf(sim.grid.includes(1000) ? 1000 : grid[grid.length - 1]), n1 = grid[g1], gl = grid.length - 1, nl = grid[gl];
    const mmin = Math.ceil((1.358 / ks.exact[gl]) ** 2);
    $("ks-note").innerHTML = `Esatta × √n a n = ${int(nl)}: <b>${it(ks.exact[gl] * Math.sqrt(nl), 3)}</b>` +
      (sim.opts.model === "rademacher" ? ` (limite teorico 1/√(2π) = 0,399: effetto della natura <i>discreta</i> di S_n, che non permette di fare meglio di 1/√n).` : `.`) +
      ` A n = ${int(n1)} la distanza esatta è ${it(ks.exact[g1], 4)}, il limite di Berry–Esseen ${it(ks.be[g1], 4)}. Con m = ${int(sim.m)} il rumore è ${it(ks.noise, 4)}: ` +
      (ks.exact[gl] < ks.noise ? `a n = ${int(nl)} la distanza vera (${it(ks.exact[gl], 4)}) è <b>più piccola del rumore</b>, quindi la curva simulata si appiattisce sul rumore; per vederla servirebbero circa ${int(mmin)} attaccanti.` : `la distanza vera resta sopra il rumore anche a n = ${int(nl)}.`);
  }

  /* ---------- Interpretazione ---------- */
  function renderInterp() {
    const sim = st.sim, th = sim.th, n = sim.opts.n, m = sim.opts.m, bern = sim.opts.model === "bernoulli";
    const ns = [10, 100, 1000, 10000], ms = [1, 10, 100, 1000];
    const closest = (arr, v) => arr.reduce((b, x) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(b / v)) ? x : b));
    const cn = closest(ns, n), cm = closest(ms, m);
    const rows = ns.map((k) => `<tr><td class="l">n = ${int(k)}</td>${ms.map((mm) => `<td class="num${k === cn && mm === cm ? " hl-cell" : ""}">${it(th.sd / Math.sqrt(k * mm), 4)}</td>`).join("")}</tr>`).join("");
    const unit = bern ? "sistemi penetrati" : "vantaggio netto";
    $("interp-out").innerHTML =
      `<p><b>Un attaccante</b> (n = ${int(n)} sistemi). Il punteggio totale (${unit}) ha media ${fnum(n * th.mu)} e deviazione standard ${fnum(th.sd * Math.sqrt(n))}; ` +
      (bern ? `il <i>tasso</i> di penetrazione S_n/n vale ${it(th.mu, 2)} ± ${fnum(th.sd / Math.sqrt(n))}. ` : `il vantaggio medio per sistema S_n/n vale 0 ± ${fnum(th.sd / Math.sqrt(n))}. `) +
      `Sistemi più numerosi <b>stabilizzano il tasso</b> (errore σ/√n) ma <b>rendono meno prevedibile il numero assoluto</b> (errore σ√n): con 10 000 sistemi la media S_n/n ha un errore di ±${fnum(th.sd / 100)}, ma il totale S_n oscilla di ±${fnum(th.sd * 100)} unità.</p>` +
      `<p><b>m attaccanti.</b> Non cambiano la distribuzione di un singolo attaccante: sono il campione con cui la si osserva (m = ${int(m)}: ogni percentuale simulata ha un errore di circa ±${it(100 * 0.5 / Math.sqrt(m), 1)} punti, e la distanza KS non scende sotto ${it(1.358 / Math.sqrt(m), 3)}). ` +
      `Se invece si guarda l'<b>aggregato</b> (il tasso medio su tutti i sistemi e tutti gli attaccanti), l'errore è σ/√(nm) = ${fnum(th.sd / Math.sqrt(n * m))}: dipende da <i>entrambi</i> in egual misura, perché n·m è il numero totale di esiti indipendenti.</p>` +
      `<p>Errore standard del tasso aggregato σ/√(nm) (la cella evidenziata è quella più vicina ai parametri correnti):</p>` +
      `<table class="res-table"><thead><tr><th class="l"></th>${ms.map((x) => `<th>m = ${int(x)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="small">${bern ? "In termini di sicurezza: una flotta grande di sistemi con la stessa probabilità di compromissione si comporta in modo molto regolare, e la quota compromessa si fissa vicino a p; ma il numero assoluto di sistemi compromessi, e quindi il danno, ha una dispersione che cresce come √n." : "Nel caso Rademacher, un confronto alla pari: il vantaggio netto di un attaccante fluttua come √n attorno allo zero (può essere positivo o negativo anche per molto tempo), mentre il vantaggio medio per sistema tende a zero: nessuno prevale sistematicamente."}</p>`;
  }

  setModel("bernoulli");
  $("p-out").textContent = it(pNow(), 2); $("m-out").textContent = int(mNow());
  run();
})();
