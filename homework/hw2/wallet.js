/*
 * La pipeline di un portafoglio Ethereum, un passo per volta:
 *
 *   entropia → mnemonica (BIP-39) → seed (PBKDF2) → chiave master (BIP-32) → percorso (BIP-44)
 *   → chiave privata → chiave pubblica (secp256k1) → Keccak-256 → indirizzo → checksum (EIP-55)
 *
 * SHA-256, HMAC-SHA512 e PBKDF2 vengono da WebCrypto (async); Keccak-256 e secp256k1
 * sono quelli scritti in questa cartella e in ../hw1/ec.js.
 * Dipende da: EC (ec.js), Keccak (keccak.js), BIP39_WORDS (wordlist.js).
 */
const Wallet = (() => {
  const subtle = globalThis.crypto.subtle;
  const C = EC.CURVES.secp256k1;
  const N = C.n;
  const enc = new TextEncoder();

  /* ---------- Byte, esadecimale, interi ---------- */
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const fromHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));
  const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const toBig = (b) => (b.length ? BigInt("0x" + hex(b)) : 0n);
  const fromBig = (v, len) => fromHex(v.toString(16).padStart(len * 2, "0"));
  const ser32 = (i) => new Uint8Array([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);
  const bin = (b) => Array.from(b, (x) => x.toString(2).padStart(8, "0")).join("");

  /* ---------- Primitive WebCrypto ---------- */
  const sha256 = async (b) => new Uint8Array(await subtle.digest("SHA-256", b));
  const sha512 = async (b) => new Uint8Array(await subtle.digest("SHA-512", b));
  async function hmacSha512(key, data) {
    const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    return new Uint8Array(await subtle.sign("HMAC", k, data));
  }
  async function pbkdf2Sha512(password, salt, iterations) {
    const k = await subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt, iterations }, k, 512));
  }

  /* ================= BIP-39: entropia ↔ mnemonica ↔ seed ================= */

  // L'entropia (128–256 bit) riceve ENT/32 bit di checksum (i primi bit di SHA-256), poi si
  // legge a gruppi di 11 bit: ogni gruppo è l'indice di una parola nella lista da 2048.
  async function entropyToMnemonic(entropy) {
    if (![16, 20, 24, 28, 32].includes(entropy.length)) throw new Error("entropia non valida");
    const csBits = entropy.length / 4;
    const hash = await sha256(entropy);
    const bits = bin(entropy) + bin(hash.slice(0, 1)).slice(0, csBits);
    const indices = [];
    for (let i = 0; i < bits.length; i += 11) indices.push(parseInt(bits.slice(i, i + 11), 2));
    return { words: indices.map((i) => BIP39_WORDS[i]), indices, bits, entropyBits: bits.slice(0, entropy.length * 8), checksumBits: bits.slice(entropy.length * 8) };
  }

  // Analizza una mnemonica: parole valide? checksum corretto?
  async function inspectMnemonic(text) {
    const words = text.normalize("NFKD").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const r = { words, valid: false };
    if (![12, 15, 18, 21, 24].includes(words.length)) { r.reason = `${words.length} parole: ne servono 12, 15, 18, 21 o 24`; return r; }
    const indices = words.map((w) => BIP39_WORDS.indexOf(w));
    const bad = words.filter((w, i) => indices[i] < 0);
    if (bad.length) { r.reason = `parola non nella lista BIP-39: «${bad[0]}»`; return r; }
    const bits = indices.map((i) => i.toString(2).padStart(11, "0")).join("");
    const csLen = words.length / 3;
    const entropy = fromHex(bits.slice(0, bits.length - csLen).match(/.{8}/g).map((b) => parseInt(b, 2).toString(16).padStart(2, "0")).join(""));
    const expected = bin((await sha256(entropy)).slice(0, 1)).slice(0, csLen);
    Object.assign(r, { indices, bits, entropy, entropyBits: bits.slice(0, bits.length - csLen), checksumBits: bits.slice(bits.length - csLen), expectedChecksum: expected });
    r.valid = r.checksumBits === expected;
    if (!r.valid) r.reason = `checksum errato: nella mnemonica ${r.checksumBits}, atteso ${expected}`;
    return r;
  }

  // PBKDF2-HMAC-SHA512, 2048 iterazioni, sale = "mnemonic" + passphrase → seed di 64 byte.
  // Nota: non controlla il checksum, e funziona con QUALSIASI testo (è proprio così nello standard).
  async function mnemonicToSeed(mnemonic, passphrase = "") {
    const pw = enc.encode(mnemonic.normalize("NFKD"));
    const salt = enc.encode("mnemonic" + passphrase.normalize("NFKD"));
    return pbkdf2Sha512(pw, salt, 2048);
  }

  /* ================= BIP-32: derivazione gerarchica ================= */
  const pubOf = (k) => EC.mulJac(C, k, C.G);
  const serP = (P) => concat(new Uint8Array([P.y & 1n ? 3 : 2]), fromBig(P.x, 32)); // pubkey compressa, 33 byte
  const HARD = 0x80000000;

  // Dal seed: I = HMAC-SHA512(chiave "Bitcoin seed", seed); metà sinistra = chiave, destra = chain code
  async function masterFromSeed(seed) {
    const I = await hmacSha512(enc.encode("Bitcoin seed"), seed);
    const k = toBig(I.slice(0, 32));
    if (k === 0n || k >= N) throw new Error("chiave master non valida");
    return { k, c: I.slice(32), depth: 0 };
  }

  // Figlio di una chiave privata. Indici ≥ 2³¹ sono "hardened": l'HMAC usa la chiave PRIVATA
  // del genitore, quindi chi ha solo la chiave pubblica non può calcolarli.
  async function ckdPriv(parent, i) {
    const hardened = i >= HARD;
    const data = hardened ? concat(new Uint8Array([0]), fromBig(parent.k, 32), ser32(i)) : concat(serP(pubOf(parent.k)), ser32(i));
    const I = await hmacSha512(parent.c, data);
    const IL = toBig(I.slice(0, 32));
    const k = (IL + parent.k) % N;
    if (IL >= N || k === 0n) throw new Error("indice non valido, provare il successivo");
    return { k, c: I.slice(32), IL, depth: parent.depth + 1, index: i, hardened };
  }

  // Figlio di una chiave PUBBLICA (solo indici normali): P_i = P + IL·G
  async function ckdPub(parent, i) {
    if (i >= HARD) throw new Error("impossibile derivare un figlio hardened da una chiave pubblica");
    const I = await hmacSha512(parent.c, concat(serP(parent.P), ser32(i)));
    const IL = toBig(I.slice(0, 32));
    if (IL >= N) throw new Error("indice non valido");
    return { P: EC.add(C, parent.P, EC.mulJac(C, IL, C.G)), c: I.slice(32), IL };
  }

  // "m/44'/60'/0'/0/0" → [44+2³¹, 60+2³¹, 0+2³¹, 0, 0]
  function parsePath(path) {
    const parts = path.trim().split("/");
    if (parts[0] !== "m") throw new Error("il percorso deve iniziare con m");
    return parts.slice(1).map((p) => {
      const m = /^(\d{1,10})('|h)?$/.exec(p);
      if (!m || Number(m[1]) >= HARD) throw new Error(`componente non valida: «${p}»`);
      return Number(m[1]) + (m[2] ? HARD : 0);
    });
  }
  const pathLabel = (i) => (i >= HARD ? `${i - HARD}'` : String(i));

  /* ================= Indirizzo Ethereum ================= */
  const xy64 = (P) => concat(fromBig(P.x, 32), fromBig(P.y, 32));         // chiave pubblica "nuda", 64 byte
  const addressBytes = (P) => Keccak.keccak256(xy64(P)).slice(12);        // ultimi 20 byte dell'hash
  const lowerHex = (b) => hex(b);

  // EIP-55: una lettera a-f è maiuscola se il nibble corrispondente di keccak256(indirizzo minuscolo) è ≥ 8
  function checksumAddress(lower) {
    const h = hex(Keccak.keccak256(enc.encode(lower)));
    let out = "0x";
    for (let i = 0; i < 40; i++) out += /[a-f]/.test(lower[i]) && parseInt(h[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
    return out;
  }
  // Un indirizzo misto è valido solo se coincide con la propria versione ricalcolata
  const isValidChecksum = (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr) && checksumAddress(addr.slice(2).toLowerCase()) === addr;

  /* ================= Pipeline completa ================= */
  async function fromMnemonic(mnemonic, passphrase = "", path = "m/44'/60'/0'/0/0") {
    const seed = await mnemonicToSeed(mnemonic, passphrase);
    let node = await masterFromSeed(seed);
    const nodes = [{ label: "m", ...node }];
    let acc = "m";
    for (const i of parsePath(path)) {
      node = await ckdPriv(node, i);
      acc += "/" + pathLabel(i);
      nodes.push({ label: acc, ...node });
    }
    const P = pubOf(node.k);
    const addr = addressBytes(P);
    return { seed, nodes, k: node.k, P, addr, lower: lowerHex(addr), address: checksumAddress(lowerHex(addr)) };
  }

  // Solo l'ultima parte (da una chiave privata): usata dagli esperimenti
  function addressFromPrivate(k) {
    const P = pubOf(k);
    const lower = lowerHex(addressBytes(P));
    return { P, lower, address: checksumAddress(lower) };
  }

  return {
    hex, fromHex, concat, toBig, fromBig, bin, ser32, serP, HARD,
    sha256, sha512, hmacSha512, pbkdf2Sha512,
    entropyToMnemonic, inspectMnemonic, mnemonicToSeed,
    masterFromSeed, ckdPriv, ckdPub, parsePath, pathLabel, pubOf,
    xy64, addressBytes, checksumAddress, isValidChecksum, fromMnemonic, addressFromPrivate,
  };
})();

if (typeof module !== "undefined") module.exports = Wallet;
