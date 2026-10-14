/*
 * Mostra i risultati di analysis2.js: una scheda per esperimento, più la tabella finale
 * con la "firma statistica" di ogni anello della pipeline.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const grid = $("s-grid");
  if (!grid) return;

  const it = (v, d = 2) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => it(v * 100, d) + "%";
  const int = (v) => Math.round(v).toLocaleString("it-IT");
  const pv = (p) => (p < 0.001 ? "&lt; 0,001" : it(p, 3));
  const sci = (x) => {
    if (!isFinite(x) || x === 0) return String(x);
    const e = Math.floor(Math.log10(x));
    return `${it(x / 10 ** e, 1)} × 10<sup>${e}</sup>`;
  };
  const ok = (t) => `<span class="ok">${t}</span>`;
  const warn = (t) => `<span class="warn">${t}</span>`;
  const col = Charts.colors;
  const R = {};

  function card(id, title, chartHeight) {
    const el = document.createElement("div");
    el.className = "stat-card";
    el.innerHTML = `<h4>${title}</h4>` + (chartHeight ? `<canvas class="chart" id="ch-${id}" style="height:${chartHeight}px"></canvas>` : "") + `<div class="kv" id="kv-${id}">in attesa…</div>`;
    grid.appendChild(el);
  }
  const kv = (id, html) => { $("kv-" + id).innerHTML = html; };
  const table = (head, rows) =>
    `<table class="digests"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;

  card("ck", "BIP-39 · checksum su frasi casuali");
  card("wd", "BIP-39 · uniformità delle parole", 190);
  card("av", "Avalanche lungo la pipeline", 200);
  card("hs", "Hash: Keccak-256, SHA3-256, SHA-256");
  card("ad", "Indirizzi reali: le 40 cifre esadecimali", 190);
  card("pv", "Il p-value sotto H₀ è uniforme", 190);
  card("e5", "EIP-55: quanti errori di battitura scopre");
  card("bd", "Paradosso del compleanno e indirizzi da 160 bit");
  card("b3", "BIP-32: struttura e perdita di una chiave");

  /* ---------- Rendering delle singole schede ---------- */
  function showBip39(r) {
    R.bip39 = r;
    kv("ck", table(["parole", "frasi casuali", "con checksum corretto", "atteso", "z"],
      r.checksum.map((c) => [c.words, int(c.N), `${int(c.valid)} (${pct(c.valid / c.N, 2)})`, `1/${Math.round(1 / c.p)} = ${pct(c.p, 2)}`, it(c.z)])) +
      `<br>Una frase di parole a caso ha il checksum giusto con probabilità 2<sup>−CS</sup>: il checksum scopre un errore di trascrizione con probabilità 94% (12 parole) o 99,6% (24 parole), ma <b>non aggiunge entropia</b>: la sicurezza resta di 128 o 256 bit.`);
    const per = 2048 / 16, bins = new Array(16).fill(0);
    r.words.counts.forEach((c, i) => { bins[Math.floor(i / per)] += c; });
    const exp = r.words.M * 12 / 16;
    Charts.bars($("ch-wd"), {
      series: [{ name: `parole (${int(r.words.M * 12)})`, values: bins, color: col.a }], expected: exp, expectedName: "atteso",
      ymax: Math.ceil((Math.max(...bins) * 1.3) / 100) * 100, yFmt: (v) => int(v), xLabel: (i) => String(i + 1), xTitle: "16 gruppi di 128 parole consecutive della lista",
    });
    kv("wd", `${int(r.words.M)} frasi di 12 parole generate da entropia casuale, χ² sulle 2048 parole: χ² = <b>${it(r.words.chi2, 1)}</b> (${r.words.df} gdl), p-value = <b>${pv(r.words.p)}</b> ` +
      (r.words.p > 0.05 ? ok("compatibile con l'uniformità.") : warn("scostamento significativo.")) +
      `<br>Ogni parola porta 11 bit: la lista da 2048 è una potenza di 2 proprio per questo, così l'encoding non introduce distorsioni.`);
  }

  function showAvalanche(r) {
    R.av = r;
    const g = (k, s) => (r[k][s] ? r[k][s].mean : 0);
    Charts.bars($("ch-av"), {
      series: [
        { name: "1 bit entropia", values: ["mnemonic", "seed", "priv", "addr"].map((s) => g("entropia", s)), color: col.a },
        { name: "1 car. passphrase", values: ["mnemonic", "seed", "priv", "addr"].map((s) => g("passphrase", s)), color: col.b },
        { name: "indice i→i+1", values: ["mnemonic", "seed", "priv", "addr"].map((s) => g("indice", s)), color: col.sha },
      ],
      expected: 0.5, expectedName: "50%", ymax: 0.7, yFmt: (v) => pct(v, 0),
      xLabel: (i) => ["mnemonica", "seed", "chiave priv.", "indirizzo"][i], xTitle: "frazione di bit che cambiano",
    });
    const line = (k, label) => `${label}: ` + ["mnemonic", "seed", "priv", "addr"].filter((s) => r[k][s]).map((s) => `${{ mnemonic: "mnemonica", seed: "seed", priv: "chiave privata", addr: "indirizzo" }[s]} <b>${pct(r[k][s].mean)}</b>`).join(" · ");
    kv("av", `${line("entropia", "1 bit di entropia")}<br>${line("passphrase", "1 carattere di passphrase")}<br>${line("indice", "indirizzo i → i+1")}<br>` +
      `L'<b>encoding</b> conserva la somiglianza: un bit di entropia cambia solo una parola e qualche bit di checksum (${pct(r.entropia.mnemonic.mean)}). Appena entra una <b>derivazione</b> (PBKDF2, HMAC) o un <b>hash</b> tutto cambia a caso (≈ 50%): indirizzi consecutivi non sono imparentati.`);
  }

  function showHash(r) {
    R.hash = r;
    const rows = Object.entries(r.hashes).map(([n, h]) => [n, `${it(h.maxZ)} <span class="dim">(p = ${it(h.pMax)})</span>`, `${it(h.maxZcounter)} <span class="dim">(p = ${it(h.pMaxCounter)})</span>`, pct(h.avalanche.mean, 2) + ` ± ${it(h.avalanche.sd * 100, 1)}`]);
    const kc = r.hashes["Keccak-256"];
    kv("hs", table(["funzione", "max |z| bit (input casuali)", "max |z| bit (contatore)", "avalanche"], rows) +
      `<br>${r.N} input da 64 byte (avalanche su ${r.A}). Soglia di Bonferroni sull'intera famiglia di ${r.family} test: |z| = <b>${it(r.zCrit)}</b>: ` +
      (Object.values(r.hashes).every((h) => Math.max(h.maxZ, h.maxZcounter) < r.zCrit) ? ok("nessun bit sopra soglia.") : warn("un bit supera la soglia.")) +
      `<br>Il massimo su 256 bit va letto così: <b>${it(kc.maxZcounter)}</b> di Keccak sui contatori ha p = ${it(kc.pMaxCounter)} da solo, ma è uno di 6 massimi, quindi capita spesso. ` +
      `Replica sullo stesso bit (${kc.worstBit}) con dati nuovi: z = <b>${it(kc.replZ)}</b> ${Math.abs(kc.replZ) < 2 ? ok("era caso.") : warn("persiste.")}` +
      `<br><b>Keccak-256 contro SHA3-256</b> sullo stesso input: ${r.kvs.equal} digest uguali su ${r.N}, distanza di Hamming media <b>${pct(r.kvs.meanDist)}</b>. ` +
      `Cambia solo il byte di padding, ma i due output sono indipendenti. E nessuno dei test statistici distingue Keccak-256, SHA3-256 e SHA-256: <b>la statistica non riconosce la famiglia di un hash</b>.`);
  }

  function showAddress(r) {
    R.addr = r;
    const exp = new Array(16).fill(1 / 16), freq = r.nibbles.counts.map((c) => c / (r.N * 40));
    Charts.bars($("ch-ad"), {
      series: [{ name: `cifre (${int(r.N * 40)})`, values: freq, color: col.a }], expected: exp, expectedName: "1/16",
      ymax: 0.1, yFmt: (v) => pct(v, 1), xLabel: (i) => i.toString(16), xTitle: "cifra esadecimale",
    });
    kv("ad", `${int(r.N)} indirizzi reali (chiavi casuali → secp256k1 → Keccak-256). χ² sulle 16 cifre: <b>${it(r.nibbles.chi2)}</b> (${r.nibbles.df} gdl), p-value = <b>${pv(r.nibbles.p)}</b>.<br>` +
      `Lettere a–f per indirizzo: media <b>${it(r.letters.mean)}</b> (teoria 15, sd ${it(r.letters.theoSd)}; z = ${it(r.letters.z)}) · maiuscole tra le lettere: <b>${pct(r.upper.frac)}</b> (atteso 50%, z = ${it(r.upper.z)}).<br>` +
      `Se ripeti l'esperimento il p-value cambia: vedi la scheda a destra.`);
  }

  function showPvalue(r) {
    R.pv = r;
    Charts.bars($("ch-pv"), {
      series: [{ name: "p-value osservati", values: r.bins, color: col.b }], expected: r.REPS / 10, expectedName: "uniforme",
      ymax: Math.ceil((Math.max(...r.bins) * 1.3) / 10) * 10, yFmt: (v) => int(v), xLabel: (i) => `${it(i / 10, 1)}`, xTitle: "p-value (10 intervalli)",
    });
    kv("pv", `Ripeto ${r.REPS} volte lo stesso test (χ² sulle cifre di ${r.N} indirizzi) su dati che sono davvero uniformi. Se H₀ è vera il p-value è uniforme su [0, 1]: <b>${r.below}</b> test su ${r.REPS} cadono sotto 0,05 (attesi ${r.expectedBelow}). ` +
      `Un p-value basso ogni tanto è normale, e prova solo che il test funziona: per questo con molti test si usa la correzione di Bonferroni e si <b>replica</b> sui dati nuovi.`);
  }

  function showEip(r) {
    R.eip = r;
    const k = r.kinds, miss = (x) => (x.n ? x.missed / x.n : 0);
    const exp = r.theoMiss * k.sostituzione.n, z = (k.sostituzione.missed - exp) / Math.sqrt(exp);
    kv("e5", table(["errore simulato", "casi", "sfuggiti", "%"], [
      ["una cifra sostituita", int(k.sostituzione.n), int(k.sostituzione.missed), pct(miss(k.sostituzione), 3)],
      ["due cifre scambiate", int(k.scambio.n), int(k.scambio.missed), pct(miss(k.scambio), 3)],
      ["maiuscola sbagliata", int(k.maiuscola.n), int(k.maiuscola.missed), pct(miss(k.maiuscola), 3)],
      ["nessun checksum", int(k.minuscolo.n), int(k.minuscolo.missed), pct(miss(k.minuscolo), 0)],
    ]) + `<br>Teoria: una sostituzione sfugge solo se TUTTE le L lettere dell'indirizzo cambiato hanno per caso la maiuscola giusta, con probabilità 2<sup>−L</sup>. Con L ~ Binomiale(40, 6/16): E[2<sup>−L</sup>] = (13/16)<sup>40</sup> = <b>${pct(r.theoMiss, 3)}</b>, cioè circa ${it(exp, 1)} casi su ${int(k.sostituzione.n)}; osservati ${k.sostituzione.missed} (z = ${it(z)}) ${Math.abs(z) < 3 ? ok("in accordo.") : warn("scostamento.")}<br>` +
      `In media un indirizzo ha ${it(r.meanLetters)} lettere, quindi circa 15 bit di checksum "gratis": rileva il <b>${pct(1 - r.theoMiss, 2)}</b> degli errori di battitura, e il 100% degli errori di sola maiuscola. Senza checksum nessun errore viene scoperto.`);
  }

  function showBirthday(r) {
    R.bd = r;
    const N = Math.sqrt((Math.PI * 2 ** 160) / 2), YEAR = 3.156e7;
    kv("bd", table(["bit dell'hash", "estrazioni fino alla prima collisione", "teoria √(πN/2)"],
      r.rows.map((w) => [w.bits, `${it(w.mean, 0)} ± ${it(w.sd / Math.sqrt(w.reps), 0)} (${w.reps} prove)`, it(w.theo, 0)])) +
      `<br>Le collisioni arrivano dopo circa √N estrazioni, non N: è il paradosso del compleanno. Un indirizzo ha 160 bit: servono circa <b>${sci(N)}</b> indirizzi per aspettarsi due indirizzi uguali. ` +
      `A 10<sup>9</sup> indirizzi al secondo (ogni indirizzo richiede una moltiplicazione su curva) sarebbero ${sci(N / 1e9 / YEAR)} anni. Trovare invece la chiave di un indirizzo <i>dato</i> costa 2<sup>160</sup>, molto di più.`);
  }

  function showBip32(r) {
    R.b3 = r;
    kv("b3", `<b>Derivazione pubblica = derivazione privata</b>: P<sub>i</sub> = P + I<sub>L</sub>·G coincide con la chiave pubblica del figlio privato per ${r.pubPriv.same}/${r.pubPriv.total} indici: è ciò che permette a una chiave pubblica estesa (xpub) di generare indirizzi senza conoscere nulla di segreto.<br>` +
      `<b>Nessuna regola tra fratelli</b>: le differenze tra chiavi pubbliche di figli consecutivi sono ${r.pubPriv.distinctDiffs}/${r.pubPriv.totalDiffs} tutte diverse. Nell'homework 1 con k, k+1, … la differenza valeva sempre G: qui l'HMAC rompe quella struttura.<br>` +
      `<b>Perdita di una chiave</b>: dalla chiave privata di UN figlio normale e dall'xpub del padre si ricava la chiave privata del padre (k<sub>padre</sub> = k<sub>figlio</sub> − I<sub>L</sub>): riuscito ${r.leak.normal}/${r.leak.total}. Con un figlio hardened: ${r.leak.hardened}/${r.leak.total}. Per questo esistono gli indici hardened.`);
  }

  /* ---------- Tabella finale: firma statistica di ogni anello ---------- */
  function renderSig() {
    const d = "—";
    const av = R.av, h = R.hash, e = R.eip, bd = R.b3, bp = R.bip39;
    const rows = [
      ["parole BIP-39", "encoding", av ? `1 bit di entropia → ${pct(av.entropia.mnemonic.mean)} dei bit` : d, "nessun avalanche: conserva la somiglianza"],
      ["checksum BIP-39", "checksum", bp ? `${pct(bp.checksum[0].valid / bp.checksum[0].N, 2)} delle frasi a caso passa (atteso 6,25%)` : d, "scopre errori, non aggiunge entropia"],
      ["PBKDF2 · HMAC-SHA512", "derivazione", av ? `seed ${pct(av.entropia.seed.mean)} · chiave figlia ${pct(av.indice.priv.mean)}` : d, "avalanche ≈ 50%, figli non imparentati"],
      ["secp256k1", "chiave pubblica", bd ? `P<sub>i</sub> = P + I<sub>L</sub>·G vale ${bd.pubPriv.same}/${bd.pubPriv.total}` : "struttura algebrica (HW1)", "linearità: è una proprietà voluta, serve alle firme"],
      ["Keccak-256", "hash", h ? `avalanche ${pct(h.hashes["Keccak-256"].avalanche.mean)} · bit bilanciati` : d, "nessuna struttura; indistinguibile da SHA3-256 con la statistica"],
      ["EIP-55", "checksum", e ? `scopre ${pct(1 - e.theoMiss, 3)} degli errori di sostituzione` : d, "≈ 15 bit nascosti nelle maiuscole"],
    ];
    $("sig").innerHTML = `<table><thead><tr><th>anello</th><th>tipo</th><th>firma misurata</th><th>significato</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("") + `</tbody></table>`;
  }

  /* ---------- Esecuzione ---------- */
  let running = false;
  async function runAll() {
    if (running) return;
    running = true;
    const btn = $("s-run"), status = $("s-status");
    btn.disabled = true;
    const t0 = performance.now();
    const say = (m) => { status.textContent = m + "…"; };
    try {
      showBip39(await Analysis2.bip39Stats(say)); renderSig();
      showAvalanche(await Analysis2.pipelineAvalanche(say)); renderSig();
      showHash(await Analysis2.hashStats(say)); renderSig();
      showAddress(await Analysis2.addressStats(say));
      showPvalue(await Analysis2.pvalueUniformity(say));
      showEip(await Analysis2.eip55Detection(say)); renderSig();
      showBirthday(await Analysis2.birthday(say));
      showBip32(await Analysis2.bip32Relations(say)); renderSig();
      status.textContent = `Fatto in ${it((performance.now() - t0) / 1000, 1)} s.`;
    } catch (err) {
      status.textContent = "Errore: " + err.message;
      console.error(err);
    }
    btn.disabled = false;
    running = false;
  }
  $("s-run").addEventListener("click", runAll);
  renderSig();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); runAll(); } }, { rootMargin: "200px" });
    io.observe(grid);
  } else runAll();
})();
