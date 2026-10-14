/*
 * Scale 2 e 3: mostra i risultati di analysis.js (grafici e numeri).
 */
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$("s2-grid")) return;

  const it = (v, d = 2) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => it(v * 100, d) + "%";
  const pv = (p) => (p < 0.001 ? "&lt; 0,001" : it(p, 3));
  const int = (v) => Math.round(v).toLocaleString("it-IT");
  const sci = (x) => {
    if (!isFinite(x) || x === 0) return String(x);
    const e = Math.floor(Math.log10(x));
    return `${it(x / 10 ** e, 1)} × 10<sup>${e}</sup>`;
  };
  const ok = (t) => `<span class="ok">${t}</span>`;
  const warn = (t) => `<span class="warn">${t}</span>`;
  const maxAbs = (a) => Math.max(...a.map(Math.abs));
  const col = Charts.colors;

  function card(parent, id, title, chartHeight) {
    const el = document.createElement("div");
    el.className = "stat-card";
    el.innerHTML = `<h4>${title}</h4>` +
      (chartHeight ? `<canvas class="chart" id="ch-${id}" style="height:${chartHeight}px"></canvas>` : "") +
      `<div class="kv" id="kv-${id}">…</div>`;
    parent.appendChild(el);
    return el;
  }
  const kv = (id, html) => { $("kv-" + id).innerHTML = html; };
  const histText = (h) =>
    Object.entries(h).map(([m, c]) => `${m} volte → ${int(c)} valori`).join(", ");

  /* ================= Scala 2 ================= */
  const g2 = $("s2-grid");
  card(g2, "x", "x · uniformità dei valori distinti", 190);
  card(g2, "y", "y · uniformità dei valori distinti", 190);
  card(g2, "freq", "Frequenza dei singoli valori");
  card(g2, "bits", "Distribuzione dei bit", 190);
  card(g2, "kx", "Correlazione: k contro x(kG)", 220);
  card(g2, "xy", "I punti della curva nel piano (x, y)", 220);
  card(g2, "aval", "Avalanche: curva ellittica contro SHA-256", 190);
  card(g2, "lin", "Struttura: incrementi e linearità");
  card(g2, "brute", "Forza bruta: ritrovare k da Q");

  let S2 = null, S3 = null, RATE = null;

  function showS2(R) {
    const { n, p, nb } = R.params;

    // χ² sugli istogrammi di x e y (valori distinti)
    [["x", R.chiX, R.mult.x, "x compare sempre 2 volte (k e n−k)"],
     ["y", R.chiY, R.mult.y, "y compare 3 volte (vedi sotto)"]].forEach(([id, chi, mult, why]) => {
      Charts.bars($("ch-" + id), {
        series: [{ name: `osservati (${int(chi.N)})`, values: chi.counts, color: id === "x" ? col.a : col.b }],
        expected: chi.probs.map((q) => q * chi.N), expectedName: "attesi se uniforme",
        ymax: Math.ceil((Math.max(...chi.counts, ...chi.probs.map((q) => q * chi.N)) * 1.25) / 10) * 10,
        yFmt: (v) => String(Math.round(v)), xLabel: (i) => String(i + 1), xTitle: `16 intervalli di ${id} in [0, ${p})`,
      });
      kv(id, `N = ${int(chi.N)} valori distinti · χ² = <b>${it(chi.chi2)}</b> (${chi.df} gdl) · p-value = <b>${pv(chi.p)}</b><br>` +
        (chi.p > 0.05 ? ok("Nessuno scostamento significativo dall'uniformità (p &gt; 0,05).")
          : warn("Scostamento significativo (p ≤ 0,05).")) +
        `<br>Conto ogni valore una sola volta: ${why}, e contarlo più volte gonfierebbe il χ² (i dati non sarebbero indipendenti).`);
    });

    // Frequenza dei singoli valori + struttura nascosta
    const e = R.endo;
    kv("freq",
      `<b>x</b>: ${int(R.mult.x.distinct)} valori distinti su ${p} possibili (${pct(R.mult.x.distinct / p)}); ${histText(R.mult.x.hist)}.<br>` +
      `<b>y</b>: ${int(R.mult.y.distinct)} valori distinti (${pct(R.mult.y.distinct / p)}); ${histText(R.mult.y.hist)}.<br><br>` +
      `x(k) = x(n−k) per ${int(R.mirror.ok)}/${int(R.mirror.total)} valori di k: kG e −kG sono simmetrici rispetto all'asse x, ` +
      `quindi la sola x non è iniettiva.<br><br>` +
      `y ripetuta tre volte perché p ≡ 1 (mod 3): esiste ω = ${e.omega} con ω³ ≡ 1, e (x, y), (ωx, y), (ω²x, y) stanno tutti sulla curva. ` +
      `Sono λ·P con λ = ${e.lambda} (λ³ ≡ 1 mod n): verificato su ${int(e.ok)}/${int(e.total)} punti.`);

    // Bit
    const zc = R.bits.zCrit, mzx = maxAbs(R.bits.zx), mzy = maxAbs(R.bits.zy);
    Charts.bars($("ch-bits"), {
      series: [{ name: "x", values: R.bits.x, color: col.a }, { name: "y", values: R.bits.y, color: col.b }],
      expected: R.bits.exp, expectedName: "atteso se uniforme in [0, p)",
      ymax: 0.6, yFmt: (v) => pct(v, 0), xLabel: (i) => String(i), xTitle: "posizione del bit (0 = meno significativo)",
    });
    kv("bits",
      `Frequenza dei bit uguali a 1 sui valori distinti. max |z|: x = <b>${it(mzx)}</b>, y = <b>${it(mzy)}</b> ` +
      `(soglia ${it(zc)} per ${2 * nb} test insieme, α = 5%, correzione di Bonferroni).<br>` +
      (Math.max(mzx, mzy) < zc ? ok("Nessun bit si discosta dall'attesa.") : warn("Almeno un bit si discosta dall'attesa.")) +
      `<br>I tre bit più alti sono sotto il 50% (≈ ${pct(R.bits.exp[nb - 1])}): è atteso, perché i valori sono &lt; p = ${p} &lt; 2<sup>${nb}</sup>.`);

    // Correlazione
    Charts.scatter($("ch-kx"), Array.from({ length: n - 1 }, (_, i) => i + 1), R.X.slice(1), { xmax: n, ymax: p, xTitle: "k  →  x(kG)" });
    const c = R.corr, zc3 = Stats.zCritical(0.05, 3);
    const flag = (z) => (Math.abs(z) < zc3 ? "" : " ⚠");
    kv("kx",
      `Su N = ${int(c.N)} dati indipendenti (k ≤ (n−1)/2):<br>` +
      `r(k, x) = <b>${it(c.kx, 3)}</b> (z = ${it(c.zkx)}) · r(k, y) = <b>${it(c.ky, 3)}</b> (z = ${it(c.zky)}) · autocorrelazione lag 1 di x = <b>${it(c.lag, 3)}</b> (z = ${it(c.zlag)})${flag(c.zkx) + flag(c.zky) + flag(c.zlag)}.<br>` +
      (Math.max(...[c.zkx, c.zky, c.zlag].map(Math.abs)) < zc3 ? ok(`Nessuna correlazione lineare significativa (soglia |z| &lt; ${it(zc3)} per 3 test).`) : warn("Correlazione lineare significativa.")) +
      `<br><b>Incorrelati non vuol dire indipendenti</b>: la seconda metà del grafico è lo specchio della prima, perché x(k) = x(n−k). Dipendenza perfetta, ma non lineare: r non la vede.`);

    Charts.scatter($("ch-xy"), R.X.slice(1), R.Y.slice(1), { xmax: p, ymax: p, xTitle: "x  →  y", size: 1.8, color: col.b });
    kv("xy", `Le ${int(n - 1)} coppie (x, y) sono tutte e sole le soluzioni di y² = x³ + 7 (mod ${p}) tranne O. ` +
      `A occhio è una nuvola: la simmetria y ↔ ${p}−y (k ↔ n−k) e le terne (x, ωx, ω²x) sono invisibili senza saperle cercare.`);

    // Avalanche
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    Charts.bars($("ch-aval"), {
      series: [{ name: "k·G (bit di x)", values: R.aval.ec, color: col.a }, { name: "SHA-256", values: R.aval.sha, color: col.sha }],
      expected: 0.5, expectedName: "50%", ymax: 0.7, yFmt: (v) => pct(v, 0),
      xLabel: (i) => String(i), xTitle: "bit di k capovolto (0 = meno significativo)",
    });
    kv("aval",
      `Capovolgo un bit di k e conto quanti bit cambiano nell'output (tutti i k validi).<br>` +
      `Media: k·G = <b>${pct(mean(R.aval.ec))}</b> (di ${nb} bit di x) · SHA-256 = <b>${pct(mean(R.aval.sha))}</b> (di 256 bit).<br>` +
      `Entrambi ≈ 50%: <b>qui l'avalanche non distingue</b> una funzione unidirezionale da una hash. Per una hash è un requisito di progetto, per kG è solo una conseguenza statistica.`);

    // Incrementi e linearità
    kv("lin",
      `<b>Incrementi</b> Q(k+1) − Q(k), per k = 1 … ${int(R.incr.total)}:<br>` +
      `· k·G → <b>${int(R.incr.ec)}</b> valore distinto: sempre G = (${R.incr.ecValue}).<br>` +
      `· SHA-256 (XOR) → <b>${int(R.incr.sha)}</b> valori distinti su ${int(R.incr.total)}.<br><br>` +
      `<b>Linearità</b> (k₁+k₂)G = k₁G + k₂G: verificata su ${int(R.lin.ok)}/${int(R.lin.total)} coppie casuali.<br><br>` +
      `Le uscite di kG sembrano casuali una per una, ma sono legate tra loro da una regola esatta: dato Q(k) si ottiene Q(k+1) = Q(k) + G senza conoscere k. In una hash questo non deve succedere.`);

    // Forza bruta
    const b = R.brute;
    kv("brute",
      `Ritrovo k da Q = kG provando k = 1, 2, 3, … su ${b.targets} chiavi casuali: <b>${int(b.avgSteps)}</b> passi in media (n/2 ≈ ${int(n / 2)}), ` +
      `<b>${it(b.msPerKey, 1)} ms</b> per chiave (${int(b.opsPerSec)} somme al secondo in questo browser).<br>` +
      `Le statistiche sono "buone" quanto quelle della scala 3, ma la chiave si ritrova in un istante: <b>uniformità non significa sicurezza</b>.`);
  }

  async function runS2() {
    const btn = $("s2-run"), status = $("s2-status");
    btn.disabled = true;
    const t0 = performance.now();
    try {
      S2 = await Analysis.analyzeMid((m) => { status.textContent = m + "…"; });
      showS2(S2);
      status.textContent = `Fatto in ${int(performance.now() - t0)} ms su tutti i ${int(S2.params.n - 1)} punti.`;
      renderMeasured();
    } catch (e) {
      status.textContent = "Errore: " + e.message;
      console.error(e);
    }
    btn.disabled = false;
  }
  $("s2-run").addEventListener("click", runS2);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); runS2(); } }, { rootMargin: "200px" });
    io.observe(g2);
  } else runS2();

  /* ================= Scala 3 ================= */
  const C3 = EC.CURVES.secp256k1;
  const GLV_BETA = 0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501een;
  const GLV_LAMBDA = 0x5363ad4cc05c30e0a5261c028812645a122e22ea20816678df02967c1b23bd72n;
  const g3 = $("s3-grid");
  card(g3, "s3bits", "Bit di x su secp256k1", 190);
  card(g3, "s3aval", "Avalanche su secp256k1", 170);
  kv("s3bits", "Premi «Campiona chiavi» per generare un campione.");
  kv("s3aval", "—");

  function selfTest() {
    const g2p = EC.mulJac(C3, 2n, C3.G);
    const t2 = EC.toHex(g2p.x) === "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
    const tn = EC.mulJac(C3, C3.n, C3.G) === null;
    const L = EC.mulJac(C3, GLV_LAMBDA, C3.G);
    const tg = L.x === (GLV_BETA * C3.G.x) % C3.p && L.y === C3.G.y;
    const mark = (b) => (b ? "✓" : "✗");
    $("s3-test").innerHTML =
      `Auto-verifica: 2·G = c6047f94…09ee5 (valore noto) ${mark(t2)} · n·G = O ${mark(tn)} · ` +
      `λ·G = (β·G<sub>x</sub>, G<sub>y</sub>) con le costanti di secp256k1 ${mark(tg)}`;
  }

  function genKey() {
    const k = Analysis.rand256(C3.n);
    const t0 = performance.now();
    const Q = EC.mulJac(C3, k, C3.G);
    const ms = performance.now() - t0;
    const bits = k.toString(2);
    const ones = bits.split("1").length - 1;
    $("s3-out").innerHTML =
      `<div class="hex"><span class="dim">chiave privata k</span> ${EC.toHex(k)}</div>` +
      `<div class="hex"><span class="dim">Q = kG · x</span> ${EC.toHex(Q.x)}</div>` +
      `<div class="hex"><span class="dim">Q = kG · y</span> ${EC.toHex(Q.y)}</div>` +
      `<div class="small">${bits.length - 1} raddoppi + ${ones - 1} somme · ${it(ms, 2)} ms · Q ${EC.isOnCurve(C3, Q) ? "sta sulla curva ✓" : "NON sta sulla curva ✗"}.<br>` +
      `Demo didattica: BigInt non è a tempo costante e non va usato per chiavi reali.</div>`;
  }

  // velocità del browser sulle operazioni di curva: serve alla stima dei tempi
  function measureRate() {
    const N = 60, t0 = performance.now();
    let ops = 0;
    for (let i = 0; i < N; i++) {
      const k = Analysis.rand256(C3.n);
      EC.mulJac(C3, k, C3.G);
      ops += k.toString(2).length - 1 + Stats.popcountBig(k) - 1;
    }
    RATE = ops / ((performance.now() - t0) / 1000);
  }

  function showBrute() {
    const n = Number(C3.n), YEAR = 3.156e7, AGE = 1.38e10;
    const rows = [
      ["Forza bruta: provare le k una per una (n/2)", n / 2],
      ["Miglior algoritmo noto, Pollard rho (≈ √n)", Math.sqrt(n)],
    ];
    const t = (ops, rate) => {
      const years = ops / rate / YEAR;
      return `${sci(years)} anni <span class="dim">(${sci(years / AGE)} × età dell'universo)</span>`;
    };
    $("s3-brute").innerHTML =
      `<table><thead><tr><th>strategia</th><th>operazioni</th><th>questo browser (${int(RATE)} op/s)</th><th>10<sup>18</sup> op/s (ipotesi)</th></tr></thead><tbody>` +
      rows.map(([name, ops]) => `<tr><td>${name}</td><td>${sci(ops)}</td><td>${t(ops, RATE)}</td><td>${t(ops, 1e18)}</td></tr>`).join("") +
      `</tbody></table>` +
      `<p class="small">n ≈ ${sci(n)} chiavi possibili. 10<sup>18</sup> op/s equivale a un miliardo di macchine da un miliardo di operazioni al secondo: un'ipotesi molto generosa. ` +
      `Sulla scala 2 la stessa ricerca richiede ${S2 ? it(S2.brute.msPerKey, 1) + " ms" : "pochi millisecondi"}.</p>`;
  }

  async function sample() {
    const btn = $("s3-sample"), status = $("s3-status");
    btn.disabled = true;
    try {
      S3 = await Analysis.sampleSecp(500, 100, (m) => { status.textContent = m + "…"; });
      status.textContent = `Fatto: ${S3.N} chiavi casuali in ${int(S3.ms)} ms.`;
      Charts.bars($("ch-s3bits"), {
        series: [{ name: "x", values: S3.bitFreq, color: col.a }], expected: 0.5, expectedName: "50%",
        ymax: 0.6, yFmt: (v) => pct(v, 0), xLabel: (i) => String(i), xTitle: "posizione del bit (0 = meno significativo)",
      });
      const mz = maxAbs(S3.bitZ);
      kv("s3bits",
        `N = ${S3.N} chiavi · max |z| = <b>${it(mz)}</b> su 256 bit (soglia ${it(S3.zCrit)} per 256 test, α = 5%).<br>` +
        (mz < S3.zCrit ? ok("Nessun bit si discosta dal 50%.") : warn("Un bit supera la soglia: con α = 5% capita una volta su venti anche se tutto è casuale, rilancia il campione.")) +
        `<br>Uniformità di x su 16 intervalli: χ² = <b>${it(S3.chi.chi2)}</b> (${S3.chi.df} gdl), p-value = <b>${pv(S3.chi.p)}</b> ` +
        (S3.chi.p > 0.05 ? ok("compatibile con l'uniformità.") : warn("scostamento significativo.")));
      Charts.bars($("ch-s3aval"), {
        series: [{ name: "k·G (bit di x)", values: S3.aval.frac, color: col.a }], expected: 0.5, expectedName: "50%",
        ymax: 0.7, yFmt: (v) => pct(v, 0), xLabel: (i) => String(S3.aval.positions[i]), xTitle: "bit di k capovolto",
      });
      const m3 = S3.aval.frac.reduce((s, v) => s + v, 0) / S3.aval.frac.length;
      kv("s3aval", `100 chiavi × 16 posizioni: in media cambia il <b>${pct(m3)}</b> dei 256 bit di x. Stesso comportamento della scala 2.`);
      renderMeasured();
    } catch (e) {
      status.textContent = "Errore: " + e.message;
      console.error(e);
    }
    btn.disabled = false;
  }

  $("s3-gen").addEventListener("click", genKey);
  $("s3-sample").addEventListener("click", sample);
  selfTest();
  measureRate();
  showBrute();
  genKey();

  /* ================= Numeri misurati (sezione Discussione) ================= */
  function renderMeasured() {
    const dash = "—";
    const a = (v, f) => (v == null ? dash : f(v));
    const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
    const rows = [
      ["Uniformità di x (χ², p-value)", a(S2, (r) => pv(r.chiX.p)), a(S3, (r) => pv(r.chi.p)), "—"],
      ["max |z| sui bit di x", a(S2, (r) => it(maxAbs(r.bits.zx))), a(S3, (r) => it(maxAbs(r.bitZ))), "—"],
      ["Avalanche media (bit che cambiano)", a(S2, (r) => pct(mean(r.aval.ec))), a(S3, (r) => pct(mean(r.aval.frac))), a(S2, (r) => pct(mean(r.aval.sha)))],
      ["Differenze Q(k+1) − Q(k) distinte", a(S2, (r) => `${int(r.incr.ec)} su ${int(r.incr.total)}`), "1 (sempre G)", a(S2, (r) => `${int(r.incr.sha)} su ${int(r.incr.total)}`)],
      ["Tempo per ritrovare k", a(S2, (r) => `${it(r.brute.msPerKey, 1)} ms`), `${sci(Math.sqrt(Number(C3.n)) / RATE)} s (rho, questo browser)`, "non applicabile"],
    ];
    $("measured").innerHTML =
      `<table><thead><tr><th>misura</th><th>kG, scala 2</th><th>kG, scala 3</th><th>SHA-256 (scala 2)</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("") + `</tbody></table>`;
  }
  renderMeasured();
})();
