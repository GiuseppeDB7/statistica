/*
 * Lo schema giocattolo su secp256k1: cifratura "ECIES" in miniatura.
 *
 *   chiave privata  d   (intero segreto, qui limitato a b bit: è la restrizione del giocattolo)
 *   chiave pubblica Q = d·G
 *
 *   cifrare un messaggio m per Q:
 *     1. si sceglie un numero r a caso, usato una volta sola ("chiave effimera");
 *     2. C1 = r·G (si invia) e il segreto condiviso S = r·Q (non si invia);
 *     3. dal segreto si ricava un flusso di byte: SHA-256(x(S) ‖ 0), SHA-256(x(S) ‖ 1), ...
 *     4. c = m XOR flusso.
 *   decifrare (C1, c) con d:
 *     S = d·C1  (= d·r·G = r·d·G = r·Q: lo stesso segreto)  →  stesso flusso  →  m = c XOR flusso.
 *
 * Gli attacchi sono in fondo: ricerca esaustiva e baby-step giant-step sulla chiave piccola.
 * Dipende da: EC (../hw1/ec.js) e Stats (../hw1/stats.js, per SHA-256).
 */
const ECIES = (() => {
  const C = EC.CURVES.secp256k1, G = C.G, N = C.n;

  /* ---------- Utilità ---------- */
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const fromHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));
  const bytes32 = (v) => fromHex(v.toString(16).padStart(64, "0"));
  const utf8 = (s) => new TextEncoder().encode(s);
  const text = (b) => new TextDecoder().decode(b);

  // Intero casuale uniforme in [1, 2^bits − 1] (per bits ≥ 256: in [1, n − 1])
  function randBelow(bits) {
    const n = Math.ceil(Math.min(bits, 256) / 8), buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    let v = 0n;
    for (const x of buf) v = (v << 8n) | BigInt(x);
    const limit = bits >= 256 ? N - 1n : (1n << BigInt(bits)) - 1n;
    return (v % limit) + 1n;
  }

  // SHA-256 sincrona (da stats.js) che restituisce byte
  function sha256(b) {
    const w = Stats.sha256(b), out = new Uint8Array(32);
    w.forEach((x, i) => { out[4 * i] = x >>> 24; out[4 * i + 1] = (x >>> 16) & 255; out[4 * i + 2] = (x >>> 8) & 255; out[4 * i + 3] = x & 255; });
    return out;
  }
  // Flusso di chiave: SHA-256(x(S) ‖ contatore), concatenato fino a `len` byte
  function keystream(S, len) {
    const x = bytes32(S.x), out = new Uint8Array(len);
    for (let i = 0; i * 32 < len; i++) {
      const blk = new Uint8Array(36);
      blk.set(x);
      new DataView(blk.buffer).setUint32(32, i);
      out.set(sha256(blk).subarray(0, Math.min(32, len - i * 32)), i * 32);
    }
    return out;
  }
  const xor = (a, b) => a.map((v, i) => v ^ b[i]);

  /* ---------- Chiavi, cifratura, decifratura ---------- */
  function keygen(bits) {
    const d = randBelow(bits);
    return { d, Q: EC.mulJac(C, d, G), bits };
  }

  // rBits: ampiezza della chiave effimera r (default 256 bit: sicura; piccola = difetto di progetto)
  function encrypt(message, Q, rBits = 256, r = randBelow(rBits)) {
    const m = typeof message === "string" ? utf8(message) : message;
    const C1 = EC.mulJac(C, r, G);
    const S = EC.mulJac(C, r, Q);
    const ks = keystream(S, m.length);
    return { r, C1, S, ks, c: xor(m, ks) };
  }
  function decrypt(C1, c, d) {
    const S = EC.mulJac(C, d, C1);
    return xor(c, keystream(S, c.length));
  }
  // Decifra conoscendo il numero effimero r (invece di d): S = r·Q
  function decryptWithR(c, Q, r) {
    return xor(c, keystream(EC.mulJac(C, r, Q), c.length));
  }

  /* ---------- Attacchi alla chiave piccola ---------- */
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const same = (P, Q) => P !== null && Q !== null && P.x === Q.x && P.y === Q.y;
  const LOW52 = (1n << 52n) - 1n;
  const key52 = (P) => Number(P.x & LOW52);

  // 1) Ricerca esaustiva: prova d = 1, 2, 3, ... finché d·G = Q. Al più 2^bits passi.
  async function exhaustive(Q, bits, progress = () => {}) {
    const t0 = performance.now(), max = 2 ** bits;
    let R = G, steps = 0;
    for (let d = 1; d <= max; d++) {
      steps++;
      if (same(R, Q)) return { d: BigInt(d), steps, ms: performance.now() - t0 };
      R = EC.add(C, R, G);
      if (d % 4000 === 0) { progress(d / max); await tick(); }
    }
    return { d: null, steps, ms: performance.now() - t0 };
  }

  // 2) Baby-step giant-step: scrivo d = i·m + j con m = ⌈√(2^bits)⌉ e j < m.
  //    Passi "piccoli": tabella di j·G per j = 1..m−1.  Passi "grandi": Q − i·m·G per i = 0, 1, ...
  //    Quando un passo grande coincide con ±j·G si ha d = i·m ± j. Costo ≈ 2·√(2^bits) invece di 2^bits.
  async function bsgs(Q, bits, progress = () => {}) {
    const t0 = performance.now();
    const m = Math.ceil(Math.sqrt(2 ** bits));
    const table = new Map();
    let R = G, steps = 0;
    for (let j = 1; j < m; j++) {
      const k = key52(R);
      const prev = table.get(k);
      table.set(k, prev === undefined ? j : Array.isArray(prev) ? [...prev, j] : [prev, j]);
      R = EC.add(C, R, G); steps++;
      if (j % 4000 === 0) { progress(0.5 * j / m); await tick(); }
    }
    const negMG = EC.neg(C, EC.mulJac(C, BigInt(m), G));
    let S = Q;
    for (let i = 0; i <= m + 1; i++) {
      if (S === null) return done(BigInt(i) * BigInt(m));
      const hit = table.get(key52(S));
      if (hit !== undefined) {
        for (const j of Array.isArray(hit) ? hit : [hit]) {
          for (const d of [BigInt(i) * BigInt(m) + BigInt(j), BigInt(i) * BigInt(m) - BigInt(j)]) {
            if (d > 0n && same(EC.mulJac(C, d, G), Q)) return done(d);
          }
        }
      }
      S = EC.add(C, S, negMG); steps++;
      if (i % 4000 === 0) { progress(0.5 + 0.5 * i / m); await tick(); }
    }
    return { d: null, steps, ms: performance.now() - t0, table: table.size };
    function done(d) { return { d, steps, ms: performance.now() - t0, table: table.size }; }
  }

  return { C, hex, fromHex, utf8, text, randBelow, sha256, keystream, keygen, encrypt, decrypt, decryptWithR, exhaustive, bsgs, same };
})();

if (typeof module !== "undefined") module.exports = ECIES;
