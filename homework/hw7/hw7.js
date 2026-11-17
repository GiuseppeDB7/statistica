/* Homework 7: indipendenza statistica, tabella di contingenza e test chi-quadro. Motore + interfaccia. */

/* ---------- Motore ---------- */
// dati bivariati: lista di coppie [x, f] -> tabella di contingenza (ordine di prima comparsa)
function buildTable(records, order) {
  const rows = [], cols = [];
  for (const [x, f] of records) { if (!rows.includes(x)) rows.push(x); if (!cols.includes(f)) cols.push(f); }
  if (order && order.rows) rows.sort((a, b) => order.rows.indexOf(a) - order.rows.indexOf(b));
  if (order && order.cols) cols.sort((a, b) => order.cols.indexOf(a) - order.cols.indexOf(b));
  const O = rows.map(() => cols.map(() => 0));
  for (const [x, f] of records) O[rows.indexOf(x)][cols.indexOf(f)]++;
  return { rows, cols, O };
}
// funzione gamma incompleta regolarizzata superiore Q(a, x) (Numerical Recipes: serie per x < a+1, frazione continua altrimenti)
function lgamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015;
  for (const k of c) s += k / ++y;
  return -t + Math.log(2.5066282746310005 * s / z);
}
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const g = lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - g);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - g) * h;
}
const chi2Sf = (x, df) => gammaQ(df / 2, x / 2);        // P(chi2_df >= x)
function analyze(T) {
  const r = T.rows.length, c = T.cols.length, O = T.O;
  const rowT = O.map((row) => row.reduce((a, b) => a + b, 0)), colT = T.cols.map((_, j) => O.reduce((a, row) => a + row[j], 0));
  const N = rowT.reduce((a, b) => a + b, 0);
  const E = O.map((row, i) => row.map((_, j) => (rowT[i] * colT[j]) / N));
  const contrib = O.map((row, i) => row.map((o, j) => (o - E[i][j]) ** 2 / E[i][j]));
  const chi2 = contrib.flat().reduce((a, b) => a + b, 0), df = (r - 1) * (c - 1);
  return {
    r, c, N, rowT, colT, E, contrib, chi2, df, p: chi2Sf(chi2, df),
    condRow: O.map((row, i) => row.map((o) => o / rowT[i])),          // f(colonna | riga)
    condCol: O.map((row) => row.map((o, j) => o / colT[j])),          // f(riga | colonna)
    resid: O.map((row, i) => row.map((o, j) => (o - E[i][j]) / Math.sqrt(E[i][j]))),
    V: Math.sqrt(chi2 / (N * Math.min(r - 1, c - 1))),
    smallE: E.flat().filter((e) => e < 5).length,
  };
}

/* ---------- Dataset ---------- */
function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rnd, items, w) => { let u = rnd() * w.reduce((a, b) => a + b), i = 0; while (u > w[i]) u -= w[i++]; return items[i]; };
function expand(rows, cols, counts) { const out = []; rows.forEach((x, i) => cols.forEach((f, j) => { for (let k = 0; k < counts[i][j]; k++) out.push([x, f]); })); return out; }
function synth(n, seed, xs, wx, fs, pf) {                 // pf[i] = P(f | x_i)
  const rnd = mulberry32(seed), out = [];
  for (let k = 0; k < n; k++) { const i = xs.indexOf(pick(rnd, xs, wx)); out.push([xs[i], pick(rnd, fs, pf[i])]); }
  return out;
}
const DATASETS = {
  hair: {
    name: "Capelli × occhi (592 studenti, dati reali)", X: "colore dei capelli", F: "colore degli occhi",
    records: () => expand(["Neri", "Castani", "Rossi", "Biondi"], ["Castani", "Azzurri", "Nocciola", "Verdi"],
      [[68, 20, 15, 5], [119, 84, 54, 29], [26, 17, 14, 14], [7, 94, 10, 16]]),
    note: "Tabella classica di Snee (1974): studenti dell'università del Delaware.",
  },
  os: {
    name: "Sistema operativo × esito dell'attacco (sintetico, dipendente)", X: "sistema operativo", F: "esito",
    records: () => synth(1000, 7, ["Windows", "Linux", "macOS"], [55, 30, 15], ["Compromesso", "Respinto"], [[0.30, 0.70], [0.18, 0.82], [0.17, 0.83]]),
    note: "Dati sintetici generati per l'esercizio (seme fisso): la probabilità di compromissione dipende dal sistema.",
  },
  geo: {
    name: "Provenienza × esito dell'attacco (sintetico, indipendente)", X: "provenienza", F: "esito",
    records: () => synth(1000, 11, ["Europa", "Asia", "America"], [40, 35, 25], ["Compromesso", "Respinto"], [[0.2, 0.8], [0.2, 0.8], [0.2, 0.8]]),
    note: "Dati sintetici con esito generato senza guardare la provenienza: l'indipendenza è vera per costruzione.",
  },
};
function parseRecords(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(/[,;\t]/).map((s) => s.trim());
    if (p.length >= 2 && p[0] && p[1]) out.push([p[0], p[1]]);
  }
  return out;
}

/* ---------- Interfaccia ---------- */
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const f = (x, d = 3) => x.toFixed(d).replace(".", ","), pc = (x) => (100 * x).toFixed(1).replace(".", ",") + "%";
  const fp = (p) => (p < 1e-4 ? p.toExponential(2).replace(".", ",").replace("e", "·10^").replace("+", "") : f(p, 4));
  let ds = DATASETS.hair, records = ds.records();

  const render = () => {
    const alpha = +$("alpha").value; $("alpha-v").textContent = alpha;
    if (records.length < 2) { $("out").innerHTML = "<p>Inserisci almeno due righe «x,f».</p>"; return; }
    const T = buildTable(records), A = analyze(T);
    if (A.r < 2 || A.c < 2) { $("out").innerHTML = "<p>Servono almeno due categorie per ciascuna variabile.</p>"; return; }
    const max = Math.max(...A.contrib.flat());
    const head = (cells) => `<tr><th></th>${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
    // tabella osservata con totali di riga e colonna, colorata in base al contributo al chi-quadro
    const obs = T.O.map((row, i) => `<tr><th>${T.rows[i]}</th>${row.map((o, j) => `<td style="background:rgba(0,255,65,${(0.04 + 0.4 * A.contrib[i][j] / max).toFixed(2)})">${o}</td>`).join("")}<td><b>${A.rowT[i]}</b></td></tr>`).join("");
    const tot = `<tr><th>totale</th>${A.colT.map((c) => `<td><b>${c}</b></td>`).join("")}<td><b>${A.N}</b></td></tr>`;
    const mk = (title, body, extra = "") => `<h4>${title}</h4><div style="overflow-x:auto"><table class="res-table">${body}</table></div>${extra}`;
    const row = (m, d = 3, fmt = f) => m.map((r, i) => `<tr><th>${T.rows[i]}</th>${r.map((v) => `<td>${fmt(v, d)}</td>`).join("")}</tr>`).join("");
    const chead = head(T.cols);
    const verdict = A.p < alpha ? "si <b>rifiuta</b> l'ipotesi di indipendenza" : "<b>non si rifiuta</b> l'ipotesi di indipendenza";
    const strength = A.V < 0.1 ? "trascurabile" : A.V < 0.3 ? "debole" : A.V < 0.5 ? "moderata" : "forte";
    const big = [];
    A.resid.forEach((r, i) => r.forEach((v, j) => big.push([Math.abs(v), v, i, j])));
    big.sort((a, b) => b[0] - a[0]);
    const top = big.slice(0, 2).filter((b) => b[0] > 2).map(([, v, i, j]) => `«${T.rows[i]} / ${T.cols[j]}» (${v > 0 ? "più" : "meno"} frequente di quanto atteso: ${T.O[i][j]} osservati contro ${f(A.E[i][j], 1)})`);
    $("out").innerHTML =
      `<p class="legend-note">${ds.note || ""} Prime righe del dataset: ${records.slice(0, 4).map((r) => `(${r[0]}, ${r[1]})`).join(", ")}…</p>` +
      mk(`Tabella di contingenza osservata (N = ${A.N}); più scura = contributo maggiore al χ²`, chead.replace("</tr>", "<th>totale</th></tr>") + obs + tot) +
      mk("Frequenze relative marginali", `<tr><th>righe</th>${T.rows.map((r, i) => `<td>${r}: ${pc(A.rowT[i] / A.N)}</td>`).join("")}</tr><tr><th>colonne</th>${T.cols.map((c, j) => `<td>${c}: ${pc(A.colT[j] / A.N)}</td>`).join("")}</tr>`) +
      mk("Frequenze condizionate: colonna dato riga, f(F | X) — ogni riga somma a 1", chead + row(A.condRow, 3), "<p class='legend-note'>Se le variabili fossero indipendenti, tutte le righe sarebbero uguali tra loro (e uguali alla riga marginale).</p>") +
      mk("Frequenze condizionate: riga dato colonna, f(X | F) — ogni colonna somma a 1", chead + row(A.condCol, 3)) +
      mk("Frequenze attese sotto indipendenza  E<sub>ij</sub> = (totale riga · totale colonna) / N", chead + row(A.E, 2)) +
      mk("Contributi al χ²  (O − E)² / E", chead + row(A.contrib, 2)) +
      `<div class="panel" style="margin-top:12px"><p><b>χ² = ${f(A.chi2, 2)}</b> con ${A.df} gradi di libertà, <b>p-value = ${fp(A.p)}</b>, V di Cramér = ${f(A.V, 3)}.</p>
      <p>Con soglia α = ${alpha}: ${verdict}.${A.smallE ? ` Attenzione: ${A.smallE} celle hanno frequenza attesa inferiore a 5, l'approssimazione chi-quadro è meno affidabile.` : " Tutte le frequenze attese sono almeno 5: l'approssimazione chi-quadro è adeguata."}</p>
      <p>${A.p < alpha ? `Le variabili «${ds.X || "X"}» e «${ds.F || "F"}» risultano <b>statisticamente dipendenti</b>; l'intensità dell'associazione è <b>${strength}</b> (V = ${f(A.V, 2)}).${top.length ? " Le celle più lontane dall'indipendenza: " + top.join("; ") + "." : ""}` : `I dati sono compatibili con l'<b>indipendenza</b>: le differenze tra osservato e atteso sono quelle che il caso produce da solo con probabilità ${pc(A.p)}.`}</p></div>`;
  };

  const setDs = (key) => {
    ds = DATASETS[key]; records = ds.records();
    $("raw").value = records.slice(0, 15).map((r) => r.join(",")).join("\n") + (records.length > 15 ? "\n…" : "");
    render();
  };
  $("ds").addEventListener("input", () => setDs($("ds").value));
  $("alpha").addEventListener("input", render);
  $("use-raw").onclick = () => { records = parseRecords($("raw").value); ds = { X: "X", F: "F", note: "Dati inseriti dall'utente." }; render(); };
  window.addEventListener("load", () => setDs("hair"));
}
if (typeof module !== "undefined") module.exports = { buildTable, analyze, chi2Sf, DATASETS };
