/*
 * Aritmetica sulle curve ellittiche  y² = x³ + b  (mod p),  con BigInt.
 *
 * Convenzioni
 *   - un punto è {x, y} con coordinate BigInt;
 *   - il "punto all'infinito" O, elemento neutro della somma, è null;
 *   - a = 0 (curve della famiglia secp256k1), quindi le formule sono semplificate.
 *
 * Lo stesso codice gira su tutte e tre le scale: cambiano solo p, b, G.
 */
const EC = (() => {
  const mod = (a, p) => {
    const r = a % p;
    return r >= 0n ? r : r + p;
  };

  function modpow(base, exp, p) {
    let r = 1n;
    base = mod(base, p);
    while (exp > 0n) {
      if (exp & 1n) r = (r * base) % p;
      base = (base * base) % p;
      exp >>= 1n;
    }
    return r;
  }

  // Inverso modulare con Euclide esteso:  a · inv(a) ≡ 1 (mod p).
  // In campo finito "dividere per d" significa "moltiplicare per inv(d)".
  function inv(a, p) {
    let t = 0n, nt = 1n, r = p, nr = mod(a, p);
    while (nr !== 0n) {
      const q = r / nr;
      [t, nt] = [nt, t - q * nt];
      [r, nr] = [nr, r - q * nr];
    }
    if (r !== 1n) throw new Error("elemento non invertibile");
    return mod(t, p);
  }

  /* ---------- Le tre curve: stessa equazione, p sempre più grande ---------- */
  const CURVES = {
    // n = ordine di G, cioè quanti punti distinti genera
    toy: { id: "toy", label: "giocattolo (p = 17)", p: 17n, b: 7n, G: { x: 1n, y: 5n }, n: 9n },
    // p ≡ 1 (mod 3) come secp256k1, e numero di punti primo (cofattore 1)
    mid: { id: "mid", label: "intermedia (p = 7537)", p: 7537n, b: 7n, G: { x: 1n, y: 3725n }, n: 7369n },
    // La curva di Ethereum e Bitcoin
    secp256k1: {
      id: "secp256k1",
      label: "secp256k1",
      p: 2n ** 256n - 2n ** 32n - 977n,
      b: 7n,
      G: {
        x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
        y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
      },
      n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,
    },
  };

  const isOnCurve = (C, P) =>
    P === null || mod(P.y * P.y - P.x * P.x * P.x - C.b, C.p) === 0n;
  const neg = (C, P) => (P === null ? null : { x: P.x, y: mod(-P.y, C.p) });
  const eq = (P, Q) => P === Q || (P !== null && Q !== null && P.x === Q.x && P.y === Q.y);
  const fmt = (P) => (P === null ? "O" : `(${P.x}, ${P.y})`);

  /*
   * Somma di due punti. Oltre al risultato R restituisce i dettagli
   * (tipo di operazione e pendenza λ) usati dalla visualizzazione.
   *
   *   P ≠ Q :  λ = (y₂ − y₁) / (x₂ − x₁)      retta per P e Q
   *   P = Q :  λ = 3x₁² / 2y₁                 retta tangente (a = 0)
   *   x₃ = λ² − x₁ − x₂,   y₃ = λ(x₁ − x₃) − y₁
   *
   * Se x₁ = x₂ e y₁ = −y₂ la retta è verticale: P + (−P) = O.
   */
  function addDetailed(C, P, Q) {
    const p = C.p;
    if (P === null) return { R: Q, kind: "id" };
    if (Q === null) return { R: P, kind: "id" };
    if (P.x === Q.x && mod(P.y + Q.y, p) === 0n) return { R: null, kind: "inverse" };
    let lambda, kind;
    if (P.x === Q.x) {
      kind = "double";
      lambda = mod(3n * P.x * P.x * inv(2n * P.y, p), p);
    } else {
      kind = "add";
      lambda = mod((Q.y - P.y) * inv(Q.x - P.x, p), p);
    }
    const x3 = mod(lambda * lambda - P.x - Q.x, p);
    const y3 = mod(lambda * (P.x - x3) - P.y, p);
    return { R: { x: x3, y: y3 }, kind, lambda };
  }

  const add = (C, P, Q) => addDetailed(C, P, Q).R;

  // Moltiplicazione scalare veloce (double-and-add): circa log₂(k) passi invece di k.
  function mul(C, k, P) {
    let R = null; // O, punto all'infinito
    for (const bit of k.toString(2)) { // dal bit più significativo
      R = add(C, R, R); // raddoppio
      if (bit === "1") R = add(C, R, P); // somma G
    }
    return R;
  }

  /* ---------- "Piani" di calcolo: l'elenco delle operazioni, per tabella e animazione ---------- */

  // Metodo ingenuo: G, 2G, 3G, ..., kG (k − 1 somme).
  function planNaive(C, k, P) {
    const ops = [];
    let R = P;
    for (let m = 2n; m <= k; m++) {
      const d = addDetailed(C, R, P);
      ops.push({ kind: d.kind, P: R, Q: P, R: d.R, lambda: d.lambda, ma: m - 1n, mb: 1n, m });
      R = d.R;
    }
    return { method: "naive", k, G: P, R, ops };
  }

  // Double-and-add letto dal bit più significativo (es. 6 = 110₂: G → 2G → 3G → 6G).
  function planDoubleAdd(C, k, P) {
    const bits = k.toString(2);
    const ops = [];
    let R = P, m = 1n; // il primo bit vale sempre 1: si parte da G
    for (let i = 1; i < bits.length; i++) {
      let d = addDetailed(C, R, R);
      ops.push({ kind: d.kind, P: R, Q: R, R: d.R, lambda: d.lambda, ma: m, mb: m, m: 2n * m, bit: bits[i] });
      R = d.R; m *= 2n;
      if (bits[i] === "1") {
        d = addDetailed(C, R, P);
        ops.push({ kind: d.kind, P: R, Q: P, R: d.R, lambda: d.lambda, ma: m, mb: 1n, m: m + 1n, bit: bits[i] });
        R = d.R; m += 1n;
      }
    }
    return { method: "dna", k, G: P, R, bits, ops };
  }

  /* ---------- Utilità per le curve piccole ---------- */

  // Tutti i punti affini (esclusa O). Solo per p piccoli: costa O(p).
  function points(C) {
    const p = Number(C.p), b = Number(C.b);
    const roots = new Map(); // quadrato → radici y
    for (let y = 0; y < p; y++) {
      const s = (y * y) % p;
      if (!roots.has(s)) roots.set(s, []);
      roots.get(s).push(y);
    }
    const out = [];
    for (let x = 0; x < p; x++) {
      for (const y of roots.get((x * x * x + b) % p) || []) out.push({ x: BigInt(x), y: BigInt(y) });
    }
    return out;
  }

  // Ordine di P: il più piccolo m > 0 con mP = O (per curve piccole).
  function order(C, P, limit = 200000) {
    let R = P, m = 1;
    while (R !== null) {
      R = add(C, R, P);
      if (++m > limit) throw new Error("ordine troppo grande");
    }
    return m;
  }

  /* ---------- Coordinate jacobiane: niente inversioni, per secp256k1 ---------- */
  // Un punto (X, Y, Z) rappresenta (X/Z², Y/Z³). Si inverte una sola volta, alla fine.

  function jacDouble(C, P) {
    if (P === null || P.Y === 0n) return null;
    const p = C.p;
    const A = (P.X * P.X) % p, B = (P.Y * P.Y) % p, Cc = (B * B) % p;
    const D = mod(2n * ((P.X + B) * (P.X + B) - A - Cc), p);
    const E = 3n * A, F = (E * E) % p;
    const X3 = mod(F - 2n * D, p);
    return { X: X3, Y: mod(E * (D - X3) - 8n * Cc, p), Z: mod(2n * P.Y * P.Z, p) };
  }

  function jacAdd(C, P, Q) {
    if (P === null) return Q;
    if (Q === null) return P;
    const p = C.p;
    const Z1Z1 = (P.Z * P.Z) % p, Z2Z2 = (Q.Z * Q.Z) % p;
    const U1 = (P.X * Z2Z2) % p, U2 = (Q.X * Z1Z1) % p;
    const S1 = (P.Y * Q.Z % p) * Z2Z2 % p, S2 = (Q.Y * P.Z % p) * Z1Z1 % p;
    const H = mod(U2 - U1, p), r = mod(2n * (S2 - S1), p);
    if (H === 0n) return r === 0n ? jacDouble(C, P) : null;
    const I = (4n * H * H) % p, J = (H * I) % p, V = (U1 * I) % p;
    const X3 = mod(r * r - J - 2n * V, p);
    const Y3 = mod(r * (V - X3) - 2n * S1 * J, p);
    const Z3 = mod(((P.Z + Q.Z) * (P.Z + Q.Z) - Z1Z1 - Z2Z2) * H, p);
    return { X: X3, Y: Y3, Z: Z3 };
  }

  function jacToAffine(C, P) {
    if (P === null) return null;
    const zi = inv(P.Z, C.p), zi2 = (zi * zi) % C.p;
    return { x: (P.X * zi2) % C.p, y: (P.Y * zi2 % C.p) * zi % C.p };
  }

  // Come mul(), ma in coordinate jacobiane (molto più veloce su 256 bit).
  function mulJac(C, k, P) {
    const Pj = { X: P.x, Y: P.y, Z: 1n };
    let R = null;
    for (const bit of k.toString(2)) {
      R = jacDouble(C, R);
      if (bit === "1") R = jacAdd(C, R, Pj);
    }
    return jacToAffine(C, R);
  }

  const toHex = (v, width = 64) => v.toString(16).padStart(width, "0");

  return {
    CURVES, mod, modpow, inv, isOnCurve, neg, eq, fmt,
    addDetailed, add, mul, planNaive, planDoubleAdd, points, order, mulJac, toHex,
  };
})();

if (typeof module !== "undefined") module.exports = EC;
