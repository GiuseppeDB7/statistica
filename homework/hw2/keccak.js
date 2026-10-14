/*
 * Keccak-f[1600] e funzione spugna (sponge), scritti da zero.
 *
 * Keccak-256 (usata da Ethereum) e SHA3-256 (standard NIST, FIPS 202) hanno la stessa
 * permutazione, lo stesso rate (136 byte) e la stessa uscita (32 byte). L'UNICA differenza
 * è il byte di padding: 0x01 per Keccak originale, 0x06 per SHA-3 (che aggiunge due bit
 * di "separazione di dominio" prima del padding).
 *
 * Ogni lanza da 64 bit è tenuta come due parole da 32 bit (hi, lo): è molto più veloce
 * di BigInt e basta per le migliaia di hash usate negli esperimenti.
 */
const Keccak = (() => {
  /* ---------- Costanti, calcolate con gli algoritmi di FIPS 202 ---------- */

  // Bit rc(t) del registro a scorrimento (polinomio x⁸ + x⁶ + x⁵ + x⁴ + 1)
  function rcBit(t) {
    if (t % 255 === 0) return 1;
    let R = 1;
    for (let i = 1; i <= t % 255; i++) {
      R <<= 1;
      if (R & 0x100) R ^= 0x171;
    }
    return R & 1;
  }

  // Costanti di round RC[ir]: 24 numeri da 64 bit ( ι)
  const RC_HI = new Int32Array(24), RC_LO = new Int32Array(24);
  for (let ir = 0; ir < 24; ir++) {
    let lane = 0n;
    for (let j = 0; j <= 6; j++) if (rcBit(j + 7 * ir)) lane |= 1n << BigInt((1 << j) - 1);
    RC_HI[ir] = Number(lane >> 32n);
    RC_LO[ir] = Number(lane & 0xffffffffn);
  }

  // Rotazioni di ρ per ogni lanza (indice x + 5y)
  const ROT = new Array(25).fill(0);
  {
    let x = 1, y = 0;
    for (let t = 0; t < 24; t++) {
      ROT[x + 5 * y] = (((t + 1) * (t + 2)) / 2) % 64;
      [x, y] = [y, (2 * x + 3 * y) % 5];
    }
  }
  // Destinazione di π: la lanza (x, y) finisce in (y, 2x + 3y)
  const PI = new Array(25);
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) PI[x + 5 * y] = y + 5 * ((2 * x + 3 * y) % 5);

  /* ---------- Permutazione Keccak-f[1600] ---------- */
  let rh = 0, rl = 0; // risultato di rotl()
  function rotl(h, l, n) { // rotazione a sinistra di una lanza (h, l) di n bit
    if (n === 0) { rh = h; rl = l; }
    else if (n === 32) { rh = l; rl = h; }
    else if (n < 32) { rh = (h << n) | (l >>> (32 - n)); rl = (l << n) | (h >>> (32 - n)); }
    else { const m = n - 32; rh = (l << m) | (h >>> (32 - m)); rl = (h << m) | (l >>> (32 - m)); }
  }

  const Ch = new Int32Array(5), Cl = new Int32Array(5);
  const Bh = new Int32Array(25), Bl = new Int32Array(25);

  function permute(H, L) {
    for (let round = 0; round < 24; round++) {
      // θ: ogni colonna viene mescolata con le due colonne vicine
      for (let x = 0; x < 5; x++) {
        Ch[x] = H[x] ^ H[x + 5] ^ H[x + 10] ^ H[x + 15] ^ H[x + 20];
        Cl[x] = L[x] ^ L[x + 5] ^ L[x + 10] ^ L[x + 15] ^ L[x + 20];
      }
      for (let x = 0; x < 5; x++) {
        const a = (x + 4) % 5, b = (x + 1) % 5;
        rotl(Ch[b], Cl[b], 1);
        const dh = Ch[a] ^ rh, dl = Cl[a] ^ rl;
        for (let y = 0; y < 25; y += 5) { H[x + y] ^= dh; L[x + y] ^= dl; }
      }
      // ρ e π: rotazione di ogni lanza e spostamento in un'altra posizione
      for (let i = 0; i < 25; i++) {
        rotl(H[i], L[i], ROT[i]);
        Bh[PI[i]] = rh; Bl[PI[i]] = rl;
      }
      // χ: unica operazione non lineare (AND + NOT) lungo ogni riga
      for (let y = 0; y < 25; y += 5) {
        for (let x = 0; x < 5; x++) {
          const i1 = y + ((x + 1) % 5), i2 = y + ((x + 2) % 5);
          H[y + x] = Bh[y + x] ^ (~Bh[i1] & Bh[i2]);
          L[y + x] = Bl[y + x] ^ (~Bl[i1] & Bl[i2]);
        }
      }
      // ι: costante di round, rompe la simmetria tra i round
      H[0] ^= RC_HI[round];
      L[0] ^= RC_LO[round];
    }
  }

  /* ---------- Funzione spugna ---------- */
  // rate = byte assorbiti per blocco (136 per le versioni a 256 bit), pad = byte di padding
  function sponge(bytes, rate, pad, outLen) {
    const total = Math.ceil((bytes.length + 1) / rate) * rate;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[bytes.length] ^= pad; // 0x01 (Keccak) oppure 0x06 (SHA-3)
    buf[total - 1] ^= 0x80;   // ultimo bit del padding

    const H = new Int32Array(25), L = new Int32Array(25);
    for (let off = 0; off < total; off += rate) {
      for (let i = 0; i < rate / 8; i++) { // lanze in little-endian
        const o = off + 8 * i;
        L[i] ^= buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
        H[i] ^= buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24);
      }
      permute(H, L);
    }
    const out = new Uint8Array(outLen);
    for (let j = 0; j < outLen; j++) {
      const w = (j & 4) ? H[j >> 3] : L[j >> 3];
      out[j] = (w >>> (8 * (j & 3))) & 255;
    }
    return out;
  }

  // Il blocco dopo il padding (per mostrarlo): messaggio | byte di dominio | zeri | 0x80
  function padded(bytes, rate, pad) {
    const total = Math.ceil((bytes.length + 1) / rate) * rate;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[bytes.length] ^= pad;
    buf[total - 1] ^= 0x80;
    return buf;
  }

  const keccak256 = (bytes) => sponge(bytes, 136, 0x01, 32); // Ethereum
  const sha3_256 = (bytes) => sponge(bytes, 136, 0x06, 32);  // FIPS 202

  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const utf8 = (s) => new TextEncoder().encode(s);

  return { keccak256, sha3_256, sponge, padded, permute, hex, utf8, constants: { RC_HI, RC_LO, ROT } };
})();

if (typeof module !== "undefined") module.exports = Keccak;
