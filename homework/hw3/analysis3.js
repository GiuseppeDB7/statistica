/*
 * Esperimenti dell'homework 3, senza interfaccia: restituiscono solo numeri.
 * Dipende da: Caesar, ECIES, EC, Stats.
 */
const Analysis3 = (() => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const popcount = (b) => b.reduce((s, v) => s + Stats.popcount(v), 0);

  /* ---------- Statistiche di una sequenza di simboli ---------- */
  // Entropia di Shannon (bit per simbolo): quanta informazione porta in media un simbolo
  const entropy = (cnt) => { const n = cnt.reduce((a, b) => a + b, 0); return -cnt.reduce((s, c) => (c ? s + (c / n) * Math.log2(c / n) : s), 0); };
  // Indice di coincidenza: probabilità che due simboli pescati a caso siano uguali (1/k se uniforme)
  const coincidence = (cnt) => { const n = cnt.reduce((a, b) => a + b, 0); return cnt.reduce((s, c) => s + c * (c - 1), 0) / (n * (n - 1)); };
  // Test χ² di uniformità sui k simboli
  const uniformChi = (cnt) => Stats.chiSquare(cnt, new Array(cnt.length).fill(1 / cnt.length));
  const profile = (cnt) => ({ n: cnt.reduce((a, b) => a + b, 0), k: cnt.length, H: entropy(cnt), Hmax: Math.log2(cnt.length), IC: coincidence(cnt), ICuniform: 1 / cnt.length, ...uniformChi(cnt), counts: cnt });

  /* ---------- 1. Confronto tra i due schemi sullo stesso messaggio ---------- */
  function compareSchemes(lang = "it", length = 3000) {
    const text = Caesar.window(lang, length);
    const k = 1 + Math.floor(Math.random() * 25);
    const caesar = Caesar.encrypt(text, k);
    const kp = ECIES.keygen(20);
    const enc = ECIES.encrypt(text, kp.Q);
    const ecBytes = new Array(256).fill(0);
    for (const b of enc.c) ecBytes[b]++;

    const R = { lang, length: Caesar.indices(text).length, bytes: enc.c.length };
    R.plain = profile(Caesar.counts(text));
    R.caesar = profile(Caesar.counts(caesar));
    R.ec = profile(ecBytes);
    // il profilo del cifrato di Cesare è quello del chiaro, spostato in cerchio di k posti
    const a = R.plain.counts, b = R.caesar.counts;
    R.caesarShiftMatch = a.every((v, i) => v === b[(i + k) % 26]);
    R.key = k;

    // Effetto di un piccolo cambiamento nella CHIAVE
    const caesarNext = Caesar.encrypt(text, k + 1);
    let diffLetters = 0, tot = 0;
    for (let i = 0; i < caesar.length; i++) if (/[a-z]/i.test(caesar[i])) { tot++; if (caesar[i] !== caesarNext[i]) diffLetters++; }
    const Qnext = EC.add(ECIES.C, kp.Q, ECIES.C.G); // chiave d+1
    const enc2 = ECIES.encrypt(text, Qnext, 256, enc.r);
    R.keyChange = { caesarLetters: diffLetters / tot, ecBits: popcount(enc.c.map((v, i) => v ^ enc2.c[i])) / (8 * enc.c.length) };

    // Effetto di un piccolo cambiamento nel MESSAGGIO (una lettera in prima posizione)
    const text2 = (text[0] === "a" ? "b" : "a") + text.slice(1);
    const c2 = Caesar.encrypt(text2, k);
    let dl = 0; for (let i = 0; i < caesar.length; i++) if (caesar[i] !== c2[i]) dl++;
    const enc3 = ECIES.encrypt(text2, kp.Q, 256, enc.r);
    let db = 0; for (let i = 0; i < enc.c.length; i++) if (enc.c[i] !== enc3.c[i]) db++;
    R.msgChange = { caesarSymbols: dl / caesar.length, ecBytes: db / enc.c.length, symbols: caesar.length };
    return R;
  }

  /* ---------- 2. Attacco statistico a Cesare: successo in funzione della lunghezza ---------- */
  async function caesarSweep(lang, lens = [5, 10, 20, 40, 80, 160, 320, 640], T = 300, progress = () => {}) {
    const methods = Object.keys(Caesar.METHODS), out = { lang, lens, T, rate: {} };
    for (const m of methods) out.rate[m] = [];
    for (let li = 0; li < lens.length; li++) {
      progress(`Cesare (${lang}): ${lens[li]} lettere`);
      const good = Object.fromEntries(methods.map((m) => [m, 0]));
      for (let t = 0; t < T; t++) {
        const win = Caesar.window(lang, lens[li]), key = 1 + Math.floor(Math.random() * 25), ct = Caesar.encrypt(win, key);
        for (const m of methods) if (Caesar.attack(ct, lang, m).key === key) good[m]++;
      }
      for (const m of methods) out.rate[m].push(good[m] / T);
      await tick();
    }
    return out;
  }

  /* ---------- 3. Limiti: quando l'attacco fallisce o si indebolisce ---------- */
  async function limits(L = 160, T = 300) {
    const methods = ["peak", "chi2", "bigram", "trigram", "dict"];
    const scen = [
      ["testo normale", (lang) => [lang, Caesar.window(lang, L), lang]],
      ["corpus della lingua sbagliata", (lang) => [lang, Caesar.window(lang, L), lang === "it" ? "en" : "it"]],
      ["testo senza la lettera «e»", (lang) => [lang, Caesar.lipogram(Caesar.window(lang, 2 * L), "e"), lang]],
      ["spazi tolti dal cifrato", (lang) => [lang, Caesar.window(lang, L).replace(/ /g, ""), lang]],
      ["lettere a caso (nessuna lingua)", (lang) => [lang, Array.from({ length: L }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(""), lang]],
      ["messaggio di 8 lettere", (lang) => [lang, Caesar.window(lang, 8), lang]],
    ];
    const rows = [];
    for (const [name, make] of scen) {
      const row = { name, rate: {} };
      for (const m of methods) row.rate[m] = 0;
      for (let t = 0; t < T; t++) {
        const [lang, txt, modelLang] = make("it"), key = 1 + Math.floor(Math.random() * 25), ct = Caesar.encrypt(txt, key);
        for (const m of methods) if (Caesar.attack(ct, modelLang, m).key === key) row.rate[m]++;
      }
      for (const m of methods) row.rate[m] /= T;
      rows.push(row);
      await tick();
    }
    return { L, T, methods, rows };
  }

  /* ---------- 4. Attacco alla chiave piccola dello schema EC ---------- */
  async function ecBenchmark(bitsList = [12, 16, 20, 24, 28, 32], exhaustiveUpTo = 16, progress = () => {}) {
    const rows = [];
    for (const bits of bitsList) {
      progress(`Attacco EC: chiave da ${bits} bit`);
      const kp = ECIES.keygen(bits), row = { bits };
      row.bsgs = await ECIES.bsgs(kp.Q, bits);
      row.bsgsOk = row.bsgs.d === kp.d;
      if (bits <= exhaustiveUpTo) { row.exh = await ECIES.exhaustive(kp.Q, bits); row.exhOk = row.exh.d === kp.d; }
      rows.push(row);
    }
    // costo medio di un passo (una somma di punti con inversione modulare), dai dati misurati
    const stepsMs = rows.map((r) => r.bsgs.ms / r.bsgs.steps).filter((v) => isFinite(v) && v > 0);
    return { rows, msPerStep: stepsMs.length ? stepsMs[stepsMs.length - 1] : 0.03 };
  }

  return { entropy, coincidence, profile, compareSchemes, caesarSweep, limits, ecBenchmark };
})();

if (typeof module !== "undefined") module.exports = Analysis3;
