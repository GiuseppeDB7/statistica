/*
 * Cifrario di Cesare e crittoanalisi statistica.
 *
 * Cifrare: ogni lettera si sposta di k posti nell'alfabeto di 26 lettere (a→d con k = 3).
 * Decifrare: si sposta all'indietro. Spazi, punteggiatura e maiuscole restano al loro posto.
 *
 * Attaccare: lo spazio delle chiavi ha solo 26 elementi, quindi si può provare ogni chiave.
 * Il problema è riconoscere quale delle 26 decifrazioni è quella giusta: non c'è un modo
 * esatto di verificarlo, bisogna giudicare se il testo "somiglia" alla lingua. I quattro
 * giudici qui sotto sono quattro modi diversi di misurare questa somiglianza.
 * Dipende da: CORPUS (corpus.js).
 */
const Caesar = (() => {
  /* ---------- Cifrare e decifrare ---------- */
  function shift(text, k) {
    return text.replace(/[a-zA-Z]/g, (ch) => {
      const base = ch <= "Z" ? 65 : 97;
      return String.fromCharCode((((ch.charCodeAt(0) - base + k) % 26) + 26) % 26 + base);
    });
  }
  const encrypt = (t, k) => shift(t, k);
  const decrypt = (t, k) => shift(t, -k);

  // Toglie gli accenti (Cesare lavora su 26 lettere) e tiene lettere, spazi e punteggiatura semplice
  const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Solo lettere a-z minuscole e spazi (per le statistiche)
  const norm = (s) => plain(s).toLowerCase().replace(/[^a-z]+/g, " ").trim();

  // Indici 0..25 delle sole lettere
  function indices(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c >= 65 && c <= 90) c += 32;
      if (c >= 97 && c <= 122) out.push(c - 97);
    }
    return out;
  }
  function counts(text) {
    const n = new Array(26).fill(0);
    for (const c of indices(text)) n[c]++;
    return n;
  }

  /* ---------- Modelli di lingua (dal corpus) ---------- */
  const models = {};
  function model(lang) {
    if (models[lang]) return models[lang];
    const L = CORPUS[lang];
    const total = L.uni.reduce((a, b) => a + b, 0);
    // frequenza di ogni lettera; +1 a ogni conteggio evita frequenze nulle (il χ² dividerebbe per zero)
    const p = L.uni.map((c) => (c + 1) / (total + 26));
    // log P(b | a): bigrammi, con un piccolo valore aggiunto ai conteggi (smoothing)
    const logBi = new Float64Array(676);
    for (let a = 0; a < 26; a++) {
      let row = 0;
      for (let b = 0; b < 26; b++) row += L.bi[a * 26 + b];
      for (let b = 0; b < 26; b++) logBi[a * 26 + b] = Math.log((L.bi[a * 26 + b] + 0.5) / (row + 13));
    }
    // log P(c | a, b): trigrammi
    const logTri = new Float64Array(17576);
    for (let ab = 0; ab < 676; ab++) {
      let row = 0;
      for (let c = 0; c < 26; c++) row += L.tri[ab * 26 + c];
      for (let c = 0; c < 26; c++) logTri[ab * 26 + c] = Math.log((L.tri[ab * 26 + c] + 0.1) / (row + 2.6));
    }
    const dict = new Set(L.words.split(" "));
    const peak = p.indexOf(Math.max(...p));
    return (models[lang] = { lang, name: L.name, p, logBi, logTri, dict, peak, test: L.test, trainLetters: L.trainLetters });
  }

  /* ---------- I giudici: più alto = decifrazione più plausibile ---------- */
  // 1) Picco: la lettera più frequente del cifrato dovrebbe essere la più frequente della lingua.
  function scorePeak(c, m) {
    const cnt = new Array(26).fill(0);
    for (const x of c) cnt[x]++;
    return Array.from({ length: 26 }, (_, s) => cnt[(m.peak + s) % 26]);
  }
  // 2) Distribuzione intera: χ² tra le frequenze della decifrazione e quelle della lingua (più basso = meglio)
  function scoreChi2(c, m) {
    const cnt = new Array(26).fill(0);
    for (const x of c) cnt[x]++;
    const L = c.length;
    return Array.from({ length: 26 }, (_, s) => {
      let chi = 0;
      for (let j = 0; j < 26; j++) {
        const e = L * m.p[j], o = cnt[(j + s) % 26];
        chi += ((o - e) * (o - e)) / e;
      }
      return -chi;
    });
  }
  // 3) Bigrammi e 4) trigrammi: log-verosimiglianza della decifrazione sotto il modello di lingua
  function scoreBigram(c, m) {
    return Array.from({ length: 26 }, (_, s) => {
      let ll = 0, prev = (c[0] - s + 26) % 26;
      for (let i = 1; i < c.length; i++) {
        const cur = (c[i] - s + 26) % 26;
        ll += m.logBi[prev * 26 + cur];
        prev = cur;
      }
      return ll;
    });
  }
  function scoreTrigram(c, m) {
    return Array.from({ length: 26 }, (_, s) => {
      let ll = 0;
      let a = (c[0] - s + 26) % 26, b = (c[1] - s + 26) % 26;
      for (let i = 2; i < c.length; i++) {
        const cur = (c[i] - s + 26) % 26;
        ll += m.logTri[(a * 26 + b) * 26 + cur];
        a = b; b = cur;
      }
      return ll;
    });
  }
  // Ricerca esaustiva + dizionario: si prova ogni chiave e si contano le lettere coperte da parole note.
  // Richiede che gli spazi tra le parole siano visibili.
  function scoreDict(text, m) {
    const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return Array.from({ length: 26 }, (_, s) => {
      let hit = 0;
      for (const w of words) {
        let d = "";
        for (let i = 0; i < w.length; i++) d += String.fromCharCode(((w.charCodeAt(i) - 97 - s + 26) % 26) + 97);
        if (m.dict.has(d)) hit += d.length;
      }
      return hit;
    });
  }

  const METHODS = {
    peak: { label: "picco della lettera più frequente", run: (t, c, m) => scorePeak(c, m) },
    chi2: { label: "distribuzione delle lettere (χ²)", run: (t, c, m) => scoreChi2(c, m) },
    bigram: { label: "bigrammi", run: (t, c, m) => scoreBigram(c, m) },
    trigram: { label: "trigrammi", run: (t, c, m) => scoreTrigram(c, m) },
    dict: { label: "ricerca esaustiva + dizionario", run: (t, c, m) => scoreDict(t, m) },
  };

  const argmax = (a) => a.indexOf(Math.max(...a));

  // Prova una chiave per ciascuno dei 26 spostamenti e restituisce chiave scelta e punteggi
  function attack(text, lang, method) {
    const m = model(lang), c = indices(text);
    if (c.length < 3) return { key: 0, scores: new Array(26).fill(0) };
    const scores = METHODS[method].run(text, c, m);
    return { key: argmax(scores), scores };
  }

  /* ---------- Per gli esperimenti ---------- */
  // Finestra casuale di L lettere (con gli spazi) dal testo di prova, mai visto in allenamento
  function window(lang, L, rnd = Math.random) {
    const t = model(lang).test;
    let i = Math.floor(rnd() * (t.length - 3 * L - 50));
    while (t[i] !== " ") i++;
    i++;
    let n = 0, j = i;
    while (j < t.length && n < L) { if (t[j] !== " ") n++; j++; }
    return t.slice(i, j);
  }
  // Lipogramma: via ogni parola che contiene la lettera `ch` (un testo con statistiche "strane")
  const lipogram = (text, ch) => text.split(" ").filter((w) => !w.includes(ch)).join(" ");

  return { encrypt, decrypt, plain, norm, indices, counts, model, METHODS, attack, window, lipogram, argmax };
})();

if (typeof module !== "undefined") module.exports = Caesar;
