/*
 * Esperimenti dell'homework 3: li lancia (analysis3.js) e ne scrive tabelle e grafici.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$("cmp-out")) return;

  const it = (v, d = 2) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 0) => it(v * 100, d) + "%";
  const int = (v) => Math.round(v).toLocaleString("it-IT");
  const pv = (p) => (p < 0.001 ? "&lt; 0,001" : it(p, 3));
  const sci = (x) => {
    if (!isFinite(x)) return "∞";
    if (x === 0) return "0";
    if (x < 1e6) return int(x);
    const e = Math.floor(Math.log10(x));
    return `${it(x / 10 ** e, 1)} × 10<sup>${e}</sup>`;
  };
  const dur = (s) => {
    if (s < 1) return "meno di 1 s";
    if (s < 120) return `${it(s, 0)} s`;
    if (s < 7200) return `${it(s / 60, 0)} min`;
    if (s < 172800) return `${it(s / 3600, 0)} ore`;
    if (s < 3.15e7 * 2) return `${it(s / 86400, 0)} giorni`;
    return `${sci(s / 3.156e7)} anni`;
  };
  const bytes = (b) => {
    const u = ["B", "KB", "MB", "GB", "TB", "PB"];
    let i = 0, v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v >= 1e4 && i === u.length - 1 ? sci(b) + " B" : `${it(v, v < 10 ? 1 : 0)} ${u[i]}`;
  };
  const col = Charts.colors;
  const COLORS = { peak: "#ff6b9d", chi2: "#ffcc66", bigram: "#6ee7ff", trigram: "#00ff41", dict: "#b794f6" };
  const NAMES = { peak: "picco", chi2: "χ²", bigram: "bigrammi", trigram: "trigrammi", dict: "dizionario" };

  /* ---------- Confronto statistico sullo stesso testo ---------- */
  function showCompare(r) {
    const row = (label, ...c) => `<tr><td>${label}</td>${c.map((x) => `<td class="num">${x}</td>`).join("")}</tr>`;
    const prof = (p) => [`${p.k} (${int(p.n)})`, `${it(p.H, 2)} / ${it(p.Hmax, 2)}`, it(p.IC, 4), pv(p.p)];
    const a = prof(r.plain), b = prof(r.caesar), c = prof(r.ec);
    $("cmp-out").innerHTML = `<table class="res-table"><thead><tr><th></th><th>messaggio in chiaro</th><th>cifrato di Cesare</th><th>cifrato dello schema EC</th></tr></thead><tbody>` +
      row("simboli (quanti)", a[0], b[0], c[0]) +
      row("entropia, bit per simbolo (massimo)", a[1], b[1], c[1]) +
      row(`indice di coincidenza (uniforme: ${it(1 / 26, 4)} / ${it(1 / 256, 4)})`, a[2], b[2], c[2]) +
      row("p-value del χ² di uniformità", a[3], b[3], c[3]) +
      row("cambio la chiave di 1 (k+1, oppure d+1)", "—", `${pct(r.keyChange.caesarLetters)} delle lettere (sempre +1)`, `${pct(r.keyChange.ecBits, 1)} dei bit`) +
      row("cambio una lettera del messaggio", "—", `${pct(r.msgChange.caesarSymbols, 2)} dei simboli`, `${pct(r.msgChange.ecBytes, 2)} dei byte`) +
      `</tbody></table>` +
      `<p class="small">Il cifrato di Cesare ha <b>la stessa entropia e lo stesso indice di coincidenza del chiaro</b> e il suo profilo di lettere è esattamente quello del chiaro spostato di k = ${r.key} posti (${r.caesarShiftMatch ? "verificato ✓" : "non coincide ✗"}): per questo si attacca con le frequenze. ` +
      `Il cifrato dello schema EC ha entropia quasi massima, indice di coincidenza 1/256 e un χ² compatibile con l'uniformità (p = ${pv(r.ec.p)}): le frequenze non dicono nulla. ` +
      `In entrambi gli schemi cambiare una lettera cambia un solo simbolo del cifrato: nessuno dei due diffonde l'effetto (sono cifrari a flusso o a sostituzione).</p>`;
  }

  /* ---------- Successo in funzione della lunghezza ---------- */
  const sweeps = {};
  function showSweep(s) {
    sweeps[s.lang] = s;
    const series = Object.keys(Caesar.METHODS).map((m) => ({ name: NAMES[m], values: s.rate[m], color: COLORS[m] }));
    Lines.draw($("ch-sw-" + s.lang), { xs: s.lens, series, xLog: true, ymin: 0, ymax: 1, yFmt: (v) => pct(v), xTitle: "lunghezza del cifrato (lettere)" });
    if (sweeps.it && sweeps.en) {
      const need = (lang, m) => { const i = sweeps[lang].rate[m].findIndex((v, j, a) => v >= 0.95 && a.slice(j).every((x) => x >= 0.9)); return i < 0 ? "oltre 640" : sweeps[lang].lens[i]; };
      $("sw-kv").innerHTML = "Lunghezza a cui il successo supera il 95%: " +
        Object.keys(Caesar.METHODS).map((m) => `<b>${NAMES[m]}</b> ${need("it", m)} (it) / ${need("en", m)} (en)`).join(" · ") +
        `.<br>Con 5 lettere il successo dei trigrammi è già ${pct(sweeps.it.rate.trigram[0])}; il picco, che usa un solo numero (la lettera più frequente), resta fragile: ${pct(sweeps.it.rate.peak[5])} a 160 lettere in italiano, perché in italiano «e», «a», «i», «o» hanno frequenze simili e basta un po' di rumore a scambiarle.`;
    }
  }

  /* ---------- Limiti ---------- */
  function showLimits(r) {
    $("lim-out").innerHTML = `<table class="res-table"><thead><tr><th>caso (italiano, circa ${r.L} lettere)</th>${r.methods.map((m) => `<th>${NAMES[m]}</th>`).join("")}</tr></thead><tbody>` +
      r.rows.map((row) => `<tr><td>${row.name}</td>${r.methods.map((m) => `<td class="num">${pct(row.rate[m])}</td>`).join("")}</tr>`).join("") + `</tbody></table>` +
      `<p class="small">${r.T} prove per riga. <b>Corpus della lingua sbagliata</b>: l'italiano è attaccato con le statistiche dell'inglese; <b>lipogramma</b>: un testo senza la «e», la lettera su cui scommette il picco; <b>spazi tolti</b>: il dizionario non vede più le parole; <b>lettere a caso</b>: nessuna struttura da sfruttare, il successo è quello del caso (≈ 4%); <b>8 lettere</b>: troppo poco testo.</p>` +
      `<p>Le conclusioni: (1) i metodi a n-grammi sono i più robusti (testi corti, testi atipici, lingua sbagliata); (2) il picco crolla appena il testo non ha la «e» al primo posto; (3) il dizionario dipende da lingua e spazi; (4) nessun metodo può fare nulla se il testo non ha la struttura della lingua o è troppo corto.</p>`;
  }

  /* ---------- Attacco EC: costo misurato e stime ---------- */
  function showBenchmark(r) {
    const rows = r.rows.map((x) => `<tr><td class="num">${x.bits}</td><td class="num">${int(2 ** x.bits)}</td>` +
      `<td class="num">${x.exh ? `${int(x.exh.steps)} · ${it(x.exh.ms / 1000, 2)} s` : "—"}</td>` +
      `<td class="num">${int(x.bsgs.steps)} · ${it(x.bsgs.ms / 1000, 2)} s ${x.bsgsOk ? "✓" : "✗"}</td><td class="num">${int(x.bsgs.table)}</td></tr>`).join("");
    $("bm-out").innerHTML = `<table class="res-table"><thead><tr><th>bit</th><th>chiavi possibili</th><th>esaustiva (passi · tempo)</th><th>baby-step giant-step (passi · tempo)</th><th>memoria (voci)</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="small">Un passo (una somma di punti su secp256k1) costa circa <b>${it(r.msPerStep, 3)} ms</b>. Ogni 8 bit in più la ricerca esaustiva costa 256 volte di più; la baby-step giant-step solo 16 volte.</p>`;
    const bits = r.rows.map((x) => x.bits);
    Lines.draw($("ch-bm"), {
      xs: bits,
      series: [
        { name: "esaustiva (2^b)", values: bits.map((b) => Math.log10(2 ** b)), color: COLORS.peak },
        { name: "baby-step giant-step (misurata)", values: r.rows.map((x) => Math.log10(x.bsgs.steps)), color: COLORS.trigram },
      ],
      ymin: 0, ymax: 10, yFmt: (v) => "10^" + Math.round(v), xTitle: "ampiezza della chiave privata (bit)",
    });
    // stime per chiavi più grandi
    const ms = r.msPerStep, RATE = 1e12;
    $("ex-step").textContent = it(ms, 3);
    const lines = [32, 40, 64, 80, 128, 256].map((b) => {
      const exh = 2 ** b, bs = 2 * 2 ** (b / 2), mem = 2 ** (b / 2) * 48;
      return `<tr><td class="num">${b}</td><td class="num">${sci(exh)}</td><td class="num">${dur(exh / RATE)}</td>` +
        `<td class="num">${sci(bs)}</td><td class="num">${bytes(mem)}</td><td class="num">${dur((bs * ms) / 1000)}</td><td class="num">${dur(bs / RATE)}</td></tr>`;
    }).join("");
    $("ex-out").innerHTML = `<div class="ex-wrap"><table class="res-table"><thead><tr><th>bit</th><th>esaustiva: passi</th><th>esaustiva: con 10<sup>12</sup> passi/s</th><th>baby-step giant-step: passi</th><th>memoria (48 byte a voce)</th><th>su questo computer</th><th>con 10<sup>12</sup> passi/s</th></tr></thead><tbody>${lines}</tbody></table></div>`;
  }

  /* ---------- Esecuzione ---------- */
  let running = false;
  async function runAll() {
    if (running) return;
    running = true;
    const btn = $("s-run"), status = $("s-status"), t0 = performance.now();
    btn.disabled = true;
    const say = (m) => { status.textContent = m + "…"; };
    try {
      showCompare(Analysis3.compareSchemes("it", 3000));
      for (const lang of ["it", "en"]) showSweep(await Analysis3.caesarSweep(lang, undefined, 300, say));
      say("Limiti dell'attacco a Cesare");
      showLimits(await Analysis3.limits(160, 300));
      showBenchmark(await Analysis3.ecBenchmark([12, 16, 20, 24, 28, 32], 16, say));
      status.textContent = `Fatto in ${it((performance.now() - t0) / 1000, 1)} s.`;
    } catch (err) {
      status.textContent = "Errore: " + err.message;
      console.error(err);
    }
    btn.disabled = false;
    running = false;
  }
  $("s-run").addEventListener("click", runAll);
  setTimeout(runAll, 400);
})();
