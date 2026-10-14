/*
 * Esperimenti statistici sulla pipeline del portafoglio (HW2), senza interfaccia grafica.
 * Dipende da: EC, Stats (../hw1), Keccak, Wallet, BIP39_WORDS.
 *
 * Idea guida: ogni anello della catena è di un tipo diverso (encoding, KDF, chiave pubblica,
 * hash, checksum) e lascia un'impronta statistica diversa. Qui la si misura.
 */
const Analysis2 = (() => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const rnd = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Stats.popcount(a[i] ^ b[i]); return d; };
  const hammingStr = (s, t) => { let d = 0; for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) d++; return d; };
  const wordsToBytes = (H) => { const o = new Uint8Array(32); H.forEach((w, i) => { o[4 * i] = w >>> 24; o[4 * i + 1] = (w >>> 16) & 255; o[4 * i + 2] = (w >>> 8) & 255; o[4 * i + 3] = w & 255; }); return o; };
  const sha256 = (b) => wordsToBytes(Stats.sha256(b));            // SHA-256 sincrono (hw1/stats.js)
  const hashes = { "Keccak-256": Keccak.keccak256, "SHA3-256": Keccak.sha3_256, "SHA-256": sha256 };
  const flipBit = (b, pos) => { const c = new Uint8Array(b); c[pos >> 3] ^= 128 >> (pos & 7); return c; };

  // Controllo del checksum BIP-39 sugli indici delle parole, senza WebCrypto (serve la velocità)
  function checksumOk(indices) {
    const n = indices.length, cs = n / 3, entBits = n * 11 - cs;
    const bytes = new Uint8Array(entBits / 8);
    let pos = 0, got = 0;
    for (const idx of indices) {
      for (let b = 10; b >= 0; b--, pos++) {
        const bit = (idx >> b) & 1;
        if (pos < entBits) { if (bit) bytes[pos >> 3] |= 128 >> (pos & 7); } else got = (got << 1) | bit;
      }
    }
    return got === Stats.sha256(bytes)[0] >>> (32 - cs);
  }

  // Indici delle 12 parole di una mnemonica generata correttamente da 128 bit di entropia
  function entropyToIndices(entropy) {
    const cs = entropy.length / 4;
    let bits = "";
    for (const x of entropy) bits += x.toString(2).padStart(8, "0");
    bits += (Stats.sha256(entropy)[0] >>> (32 - cs)).toString(2).padStart(cs, "0");
    const out = [];
    for (let i = 0; i < bits.length; i += 11) out.push(parseInt(bits.slice(i, i + 11), 2));
    return out;
  }

  // Chiave privata casuale in [1, n−1] (demo: bias trascurabile)
  const rand256 = (n) => {
    let v = 0n;
    for (const x of rnd(32)) v = (v << 8n) | BigInt(x);
    return (v % (n - 1n)) + 1n;
  };
  const binomZ = (obs, n, p) => (obs - n * p) / Math.sqrt(n * p * (1 - p));

  /* ================= 1. BIP-39: encoding e checksum ================= */
  async function bip39Stats(progress = () => {}) {
    const R = {};
    progress("BIP-39: checksum su sequenze di parole casuali");
    R.checksum = [];
    for (const [words, N] of [[12, 100000], [24, 100000]]) {
      let valid = 0;
      const buf = new Uint16Array(words);
      for (let t = 0; t < N; t++) {
        crypto.getRandomValues(buf);
        for (let i = 0; i < words; i++) buf[i] &= 2047;
        if (checksumOk(buf)) valid++;
      }
      const p = 1 / 2 ** (words / 3);
      R.checksum.push({ words, N, valid, p, z: binomZ(valid, N, p) });
      await tick();
    }
    progress("BIP-39: uniformità delle parole generate");
    const M = 5000, counts = new Array(2048).fill(0);
    for (let t = 0; t < M; t++) for (const i of entropyToIndices(rnd(16))) counts[i]++;
    R.words = { counts, M, ...Stats.chiSquare(counts, new Array(2048).fill(1 / 2048)) };
    return R;
  }

  /* ================= 2. Avalanche lungo la pipeline ================= */
  async function pipelineAvalanche(progress = () => {}) {
    const PATH = (i) => `m/44'/60'/0'/0/${i}`;
    async function run(entropy, pass, idx) {
      const m = await Wallet.entropyToMnemonic(entropy);
      const w = await Wallet.fromMnemonic(m.words.join(" "), pass, PATH(idx));
      return { mnemonic: m.bits, seed: w.seed, priv: Wallet.fromBig(w.k, 32), addr: w.addr };
    }
    const frac = (a, b) => (typeof a === "string" ? hammingStr(a, b) / a.length : hamming(a, b) / (8 * a.length));
    const stages = ["mnemonic", "seed", "priv", "addr"];
    const acc = { entropia: {}, passphrase: {}, indice: {} };
    for (const k in acc) for (const s of stages) acc[k][s] = [];

    progress("Avalanche: capovolgo 1 bit di entropia");
    for (let t = 0; t < 40; t++) {
      const e = rnd(16), e2 = flipBit(e, Math.floor(Math.random() * 128));
      const [a, b] = [await run(e, "", 0), await run(e2, "", 0)];
      for (const s of stages) acc.entropia[s].push(frac(a[s], b[s]));
      if (t % 10 === 9) await tick();
    }
    progress("Avalanche: cambio 1 carattere della passphrase");
    for (let t = 0; t < 40; t++) {
      const e = rnd(16), pw = Array.from(rnd(8), (x) => String.fromCharCode(97 + (x % 26))).join("");
      const pw2 = (pw[0] === "a" ? "b" : "a") + pw.slice(1);
      const [a, b] = [await run(e, pw, 0), await run(e, pw2, 0)];
      for (const s of stages.slice(1)) acc.passphrase[s].push(frac(a[s], b[s]));
      if (t % 10 === 9) await tick();
    }
    progress("Avalanche: indirizzo i contro i + 1");
    for (let t = 0; t < 30; t++) {
      const seed = rnd(64);
      let node = await Wallet.masterFromSeed(seed);
      for (const i of [44 + Wallet.HARD, 60 + Wallet.HARD, Wallet.HARD, 0]) node = await Wallet.ckdPriv(node, i);
      for (let j = 0; j < 5; j++) {
        const a = await Wallet.ckdPriv(node, j), b = await Wallet.ckdPriv(node, j + 1);
        const [pa, pb] = [Wallet.fromBig(a.k, 32), Wallet.fromBig(b.k, 32)];
        acc.indice.priv.push(frac(pa, pb));
        acc.indice.addr.push(frac(Wallet.fromHex(Wallet.addressFromPrivate(a.k).lower), Wallet.fromHex(Wallet.addressFromPrivate(b.k).lower)));
      }
      await tick();
    }
    const out = {};
    for (const k in acc) {
      out[k] = {};
      for (const s of stages) if (acc[k][s].length) out[k][s] = { mean: mean(acc[k][s]), sd: sd(acc[k][s]), n: acc[k][s].length };
    }
    return out;
  }

  /* ================= 3. Famiglia degli hash ================= */
  async function hashStats(progress = () => {}) {
    const N = 2000, A = 500;
    const R = { N, A, hashes: {} };
    const inputs = Array.from({ length: N }, () => rnd(64));
    R.family = 3 * 2 * 256;                       // tutti i test sui bit di questa tabella
    R.zCrit = Stats.zCritical(0.05, R.family);   // soglia di Bonferroni sull'intera famiglia
    for (const [name, h] of Object.entries(hashes)) {
      progress(`Hash: ${name}`);
      const ones = new Array(256).fill(0);
      for (const x of inputs) { const d = h(x); for (let b = 0; b < 256; b++) ones[b] += (d[b >> 3] >> (7 - (b & 7))) & 1; }
      const z = ones.map((o) => (o / N - 0.5) / Math.sqrt(0.25 / N));
      const av = [];
      for (let t = 0; t < A; t++) av.push(hamming(h(inputs[t]), h(flipBit(inputs[t], Math.floor(Math.random() * 512)))) / 256);
      // anche su input "strutturati": un semplice contatore 0, 1, 2, …
      const counterOnes = (from) => {
        const o = new Array(256).fill(0);
        for (let i = from; i < from + N; i++) { const d = h(new Uint8Array([i >> 8, i & 255])); for (let b = 0; b < 256; b++) o[b] += (d[b >> 3] >> (7 - (b & 7))) & 1; }
        return o;
      };
      const ones2 = counterOnes(0);
      const z2 = ones2.map((o) => (o / N - 0.5) / Math.sqrt(0.25 / N));
      const maxZ = Math.max(...z.map(Math.abs)), maxZc = Math.max(...z2.map(Math.abs));
      // probabilità, sui 256 bit di UNA tabella, che il massimo |z| sia almeno così grande per puro caso
      const pMax = (z0) => 1 - (1 - Stats.twoSidedP(z0)) ** 256;
      // replica: il bit con lo scostamento maggiore, rimisurato su dati NUOVI (contatori 2000 … 3999)
      const worst = z2.findIndex((v) => Math.abs(v) === maxZc);
      const fresh = counterOnes(N);
      const replZ = (fresh[worst] / N - 0.5) / Math.sqrt(0.25 / N);
      R.hashes[name] = {
        maxZ, maxZcounter: maxZc, pMax: pMax(maxZ), pMaxCounter: pMax(maxZc), worstBit: worst, replZ,
        avalanche: { mean: mean(av), sd: sd(av) },
        bitFreq: ones.map((o) => o / N),
      };
      await tick();
    }
    // Keccak-256 e SHA3-256 differiscono solo per il byte di padding: gli output sono correlati?
    let equal = 0; const dist = [];
    for (const x of inputs) {
      const a = Keccak.keccak256(x), b = Keccak.sha3_256(x);
      if (Keccak.hex(a) === Keccak.hex(b)) equal++;
      dist.push(hamming(a, b) / 256);
    }
    R.kvs = { equal, meanDist: mean(dist), sdDist: sd(dist) };
    return R;
  }

  /* ================= 4. Indirizzi reali ================= */
  async function addressStats(progress = () => {}) {
    const N = 1500;
    const R = { N };
    const nib = new Array(16).fill(0), Ls = [];
    let letters = 0, upper = 0;
    progress("Indirizzi: genero chiavi e indirizzi reali");
    for (let t = 0; t < N; t++) {
      const k = rand256(EC.CURVES.secp256k1.n);
      const a = Wallet.addressFromPrivate(k);
      let L = 0;
      for (const ch of a.lower) nib[parseInt(ch, 16)]++;
      const body = a.address.slice(2);
      for (const ch of body) if (/[a-fA-F]/.test(ch)) { L++; letters++; if (ch === ch.toUpperCase()) upper++; }
      Ls.push(L);
      if (t % 250 === 249) await tick();
    }
    R.nibbles = { counts: nib, ...Stats.chiSquare(nib, new Array(16).fill(1 / 16)) };
    const mL = mean(Ls), vL = 40 * (6 / 16) * (10 / 16);
    R.letters = { mean: mL, sd: sd(Ls), theoMean: 15, theoSd: Math.sqrt(vL), z: (mL - 15) / Math.sqrt(vL / N), hist: Ls };
    R.upper = { letters, upper, frac: upper / letters, z: (upper - letters / 2) / Math.sqrt(letters / 4) };
    return R;
  }

  /* ================= 4b. Il p-value sotto H0 è uniforme ================= */
  async function pvalueUniformity(progress = () => {}) {
    const REPS = 200, N = 500;                  // 200 ripetizioni dello stesso test, 500 indirizzi ciascuna
    const ps = [];
    progress("p-value: ripeto il test χ² sugli indirizzi 200 volte");
    for (let r = 0; r < REPS; r++) {
      const nib = new Array(16).fill(0);
      for (let t = 0; t < N; t++) {
        const lower = Keccak.hex(Keccak.keccak256(rnd(64)).slice(12));
        for (const ch of lower) nib[parseInt(ch, 16)]++;
      }
      ps.push(Stats.chiSquare(nib, new Array(16).fill(1 / 16)).p);
      if (r % 20 === 19) await tick();
    }
    const bins = new Array(10).fill(0);
    for (const p of ps) bins[Math.min(9, Math.floor(p * 10))]++;
    const below = ps.filter((p) => p < 0.05).length;
    return { REPS, N, bins, below, expectedBelow: REPS * 0.05, ...Stats.chiSquare(bins, new Array(10).fill(0.1)) };
  }

  /* ================= 5. EIP-55: quanti errori di battitura scopre? ================= */
  async function eip55Detection(progress = () => {}) {
    const T = 40000;
    const hexd = "0123456789abcdef";
    const R = { T, kinds: {} };
    const stats = { sostituzione: { n: 0, missed: 0 }, scambio: { n: 0, missed: 0 }, maiuscola: { n: 0, missed: 0 }, minuscolo: { n: 0, missed: 0 } };
    progress("EIP-55: errori di battitura simulati");
    const rndInt = (n) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
    let sumLetters = 0;
    for (let t = 0; t < T; t++) {
      // un indirizzo "come quelli veri": gli ultimi 20 byte di un hash di 64 byte casuali
      const lower = Keccak.hex(Keccak.keccak256(rnd(64)).slice(12));
      const good = Wallet.checksumAddress(lower);
      sumLetters += (good.slice(2).match(/[a-fA-F]/g) || []).length;
      // 1) sostituzione di un carattere: nuova cifra a caso, maiuscola/minuscola a caso
      const i = rndInt(40);
      let c = hexd[rndInt(16)]; while (c === lower[i]) c = hexd[rndInt(16)];
      if (/[a-f]/.test(c) && rndInt(2)) c = c.toUpperCase();
      const typo = "0x" + good.slice(2, i + 2) + c + good.slice(i + 3);
      stats.sostituzione.n++; if (Wallet.isValidChecksum(typo)) stats.sostituzione.missed++;
      // 2) scambio di due caratteri adiacenti diversi
      const j = rndInt(39);
      if (good[j + 2] !== good[j + 3] && good[j + 2].toLowerCase() !== good[j + 3].toLowerCase()) {
        const sw = "0x" + good.slice(2, j + 2) + good[j + 3] + good[j + 2] + good.slice(j + 4);
        stats.scambio.n++; if (Wallet.isValidChecksum(sw)) stats.scambio.missed++;
      }
      // 3) una sola lettera con la maiuscola/minuscola sbagliata
      const letterPos = [...good.slice(2)].map((ch, p) => (/[a-fA-F]/.test(ch) ? p : -1)).filter((p) => p >= 0);
      if (letterPos.length) {
        const p = letterPos[rndInt(letterPos.length)];
        const ch = good[p + 2];
        const flip = "0x" + good.slice(2, p + 2) + (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()) + good.slice(p + 3);
        stats.maiuscola.n++; if (Wallet.isValidChecksum(flip)) stats.maiuscola.missed++;
      }
      // 4) senza checksum: lo stesso errore su un indirizzo tutto minuscolo viene accettato
      stats.minuscolo.n++; if (/^0x[0-9a-f]{40}$/.test("0x" + lower.slice(0, i) + c.toLowerCase() + lower.slice(i + 1))) stats.minuscolo.missed++;
      if (t % 4000 === 3999) { progress(`EIP-55: ${t + 1}/${T}`); await tick(); }
    }
    R.kinds = stats;
    R.meanLetters = sumLetters / T;
    // Probabilità teorica che una sostituzione sfugga: E[2^-L] con L ~ Binomiale(40, 6/16)
    R.theoMiss = (1 - 3 / 16) ** 40;
    return R;
  }

  /* ================= 6. Paradosso del compleanno ================= */
  async function birthday(progress = () => {}) {
    const R = { rows: [] };
    for (const [bits, reps] of [[12, 150], [16, 150], [20, 100]]) {
      progress(`Compleanno: ${bits} bit`);
      const draws = [];
      for (let r = 0; r < reps; r++) {
        const seen = new Set();
        const salt = rnd(8);
        let i = 0;
        for (;;) {
          const m = new Uint8Array(12); m.set(salt); m[8] = i >>> 24; m[9] = (i >>> 16) & 255; m[10] = (i >>> 8) & 255; m[11] = i & 255;
          const d = Keccak.keccak256(m);
          const v = bits === 20 ? ((d[0] << 12) | (d[1] << 4) | (d[2] >> 4)) : (bits === 16 ? (d[0] << 8) | d[1] : ((d[0] << 4) | (d[1] >> 4)));
          i++;
          if (seen.has(v)) break;
          seen.add(v);
        }
        draws.push(i);
      }
      const space = 2 ** bits;
      R.rows.push({ bits, reps, mean: mean(draws), sd: sd(draws), theo: Math.sqrt((Math.PI * space) / 2), space });
      await tick();
    }
    return R;
  }

  /* ================= 7. BIP-32: struttura e perdita di una chiave ================= */
  async function bip32Relations(progress = () => {}) {
    const R = {};
    progress("BIP-32: derivazione pubblica e privata");
    const C = EC.CURVES.secp256k1;
    const seed = rnd(32);
    let m = await Wallet.masterFromSeed(seed);
    const acct = await Wallet.ckdPriv(m, 44 + Wallet.HARD);
    const parentPub = { P: Wallet.pubOf(acct.k), c: acct.c };
    // (a) il figlio pubblico coincide con la chiave pubblica del figlio privato, per 50 indici
    let same = 0; const prev = []; const diffs = new Set();
    for (let i = 0; i < 50; i++) {
      const cp = await Wallet.ckdPub(parentPub, i), cs = await Wallet.ckdPriv(acct, i);
      const P2 = Wallet.pubOf(cs.k);
      if (cp.P.x === P2.x && cp.P.y === P2.y) same++;
      prev.push(P2);
    }
    for (let i = 1; i < prev.length; i++) {
      const d = EC.add(C, prev[i], EC.neg(C, prev[i - 1]));
      diffs.add(`${d.x},${d.y}`);
    }
    R.pubPriv = { same, total: 50, distinctDiffs: diffs.size, totalDiffs: prev.length - 1 };
    // (b) attacco: chiave privata di un figlio NORMALE + chiave pubblica estesa del padre → chiave privata del padre
    let leak = 0, leakHard = 0; const T = 30;
    for (let t = 0; t < T; t++) {
      const s = rnd(32), root = await Wallet.masterFromSeed(s);
      const parent = await Wallet.ckdPriv(root, Wallet.HARD);
      const xpub = { P: Wallet.pubOf(parent.k), c: parent.c };
      const child = await Wallet.ckdPriv(parent, 7);                                  // normale
      const IL = (await Wallet.ckdPub(xpub, 7)).IL;                                    // lo calcola chiunque abbia l'xpub
      if (((child.k - IL) % C.n + C.n) % C.n === parent.k) leak++;
      const hchild = await Wallet.ckdPriv(parent, 7 + Wallet.HARD);                    // hardened
      // l'attaccante non può calcolare IL (serve la chiave privata del padre): prova con l'IL del figlio normale
      if (((hchild.k - IL) % C.n + C.n) % C.n === parent.k) leakHard++;
    }
    R.leak = { total: T, normal: leak, hardened: leakHard };
    return R;
  }

  return { bip39Stats, pipelineAvalanche, hashStats, addressStats, pvalueUniformity, eip55Detection, birthday, bip32Relations, checksumOk, entropyToIndices };
})();

if (typeof module !== "undefined") module.exports = Analysis2;
