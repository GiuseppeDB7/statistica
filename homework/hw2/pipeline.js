/*
 * Pipeline interattiva: dalla mnemonica all'indirizzo Ethereum con checksum, un anello per volta.
 * Ogni anello mostra il TIPO di primitiva (generazione, derivazione, encoding, chiave pubblica,
 * hash, checksum) e il valore intermedio. Tutto si calcola nel browser con wallet.js.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const out = $("pl-out");
  if (!out) return;

  const hex = Wallet.hex;
  const KINDS = { gen: "generazione", enc: "encoding", kdf: "derivazione", pub: "chiave pubblica", hash: "hash", chk: "checksum" };
  const TEST_MN = "test test test test test test test test test test test junk";
  const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  // Indirizzi di riferimento noti (frase di prova, passphrase vuota): sono la prova che la pipeline è corretta
  const REF = {
    [TEST_MN + "|m/44'/60'/0'/0/0"]: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "Hardhat / Anvil, account 0"],
    [TEST_MN + "|m/44'/60'/0'/0/1"]: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "Hardhat / Anvil, account 1"],
    [ABANDON + "|m/44'/60'/0'/0/0"]: ["0x9858EfFD232B4033E47d90003D41EC34EcaEda94", "vettore di test «abandon … about»"],
  };
  const LEVELS = [["purpose", "BIP-44"], ["coin_type", "60 = Ethereum (SLIP-44)"], ["account", "primo account"], ["change", "0 = indirizzi esterni"], ["address_index", "indirizzo n."]];

  let token = 0, n = 0, timer;
  const short = (h, a = 12, b = 6) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
  const stage = (kind, title, desc, body, cls = "") => {
    n++;
    return `<div class="stage ${cls}"><div class="stage-head"><span class="stage-n">${String(n).padStart(2, "0")}</span>` +
      `<span class="kind k-${kind}">${KINDS[kind]}</span><h4>${title}</h4></div><div class="desc">${desc}</div>${body}</div>`;
  };
  const box = (label, html) => `<div class="hexbox"><span class="lbl">${label}</span>${html}</div>`;
  const banner = (cls, html) => `<div class="banner ${cls}">${html}</div>`;

  async function update() {
    const my = ++token;
    const text = $("pl-mn").value, pass = $("pl-pass").value, path = $("pl-path").value.trim();
    n = 0;
    let html = "";
    try { Wallet.parsePath(path); } catch (e) { out.innerHTML = banner("bad", "Percorso non valido: " + e.message); return; }

    const ins = await Wallet.inspectMnemonic(text);
    if (my !== token) return;
    const sentence = ins.words.join(" ");
    html += ins.valid
      ? banner("good", `Frase valida: ${ins.words.length} parole, checksum ${ins.checksumBits} ✓`)
      : banner("bad", `Frase non valida: ${ins.reason}.<br>Il seed si può calcolare comunque (PBKDF2 accetta qualunque testo): i portafogli però la rifiutano. Di seguito continuo lo stesso.`);

    /* 1-3: dalla frase all'entropia */
    if (ins.indices) {
      const cs = ins.checksumBits.length;
      html += stage("gen", "Entropia",
        "Un numero casuale di 128–256 bit: l'unica vera fonte di segretezza. Tutto il resto è derivato in modo deterministico. Qui è quella nascosta nella frase che hai scritto.",
        box(`${ins.entropy.length * 8} bit`, hex(ins.entropy)));
      const h = await Wallet.sha256(ins.entropy);
      html += stage("chk", "Checksum BIP-39",
        `Si aggiungono ENT/32 = ${cs} bit presi dall'inizio di SHA-256(entropia). Servono solo a scoprire errori di trascrizione: non aggiungono sicurezza.`,
        box("SHA-256(entropia)", `<span class="hi">${hex(h.slice(0, 1))}</span><span class="dim">${hex(h.slice(1))}</span>`) +
        box("primi bit", `atteso <b>${ins.expectedChecksum}</b> · nella frase <b>${ins.checksumBits}</b> ${ins.valid ? '<span class="hi">✓</span>' : "✗"}`));
      const chips = ins.indices.map((ix, i) => {
        const b = ix.toString(2).padStart(11, "0");
        const last = i === ins.indices.length - 1;
        return `<div class="chip"><span class="n">${i + 1}</span> <span class="ix">#${ix}</span><span class="w">${ins.words[i]}</span>` +
          `<span class="b">${last ? b.slice(0, 11 - cs) + `<span class="cs">${b.slice(11 - cs)}</span>` : b}</span></div>`;
      }).join("");
      html += stage("enc", "Mnemonica",
        `I bit (entropia + checksum) si leggono a gruppi di 11: ogni gruppo è l'indice di una parola nella lista da 2048. È pura <b>codifica</b>, reversibile e senza chiavi: 1 bit cambiato fa cambiare 1 parola. I bit arancioni sono il checksum.`,
        `<div class="chips">${chips}</div>`);
    }

    /* 4-10: dalla frase all'indirizzo */
    let w;
    try { w = await Wallet.fromMnemonic(sentence, pass, path); } catch (e) { out.innerHTML = html + banner("bad", "Errore: " + e.message); return; }
    if (my !== token) return;
    const [master] = w.nodes;
    html += stage("kdf", "Seed",
      `PBKDF2-HMAC-SHA512 con 2048 iterazioni, password = la frase, sale = «mnemonic» + passphrase${pass ? ` (qui: «${pass.replace(/[<&>]/g, "")}»)` : " (qui vuota)"}. È una <b>derivazione</b> costosa apposta, per rallentare chi prova a indovinare. La passphrase cambia tutto il seed: portafogli diversi, nessun errore.`,
      box("64 byte", hex(w.seed)));
    html += stage("kdf", "Chiave master (BIP-32)",
      "I = HMAC-SHA512(chiave = «Bitcoin seed», dato = seed). La metà sinistra è la chiave privata master, la destra è il <i>chain code</i>, un secondo segreto che serve solo a derivare i figli.",
      box("chiave privata master (I<sub>L</sub>)", hex(Wallet.fromBig(master.k, 32))) + box("chain code (I<sub>R</sub>)", hex(master.c)));

    const rows = w.nodes.map((nd, i) => {
      const lvl = w.nodes.length === 6 && i > 0 ? LEVELS[i - 1] : [i === 0 ? "radice" : `livello ${i}`, ""];
      const hard = nd.hardened;
      return `<tr><td>${nd.label}</td><td>${lvl[0]}</td><td>${lvl[1]}</td><td class="${hard ? "hard" : ""}">${i === 0 ? "—" : hard ? "hardened" : "normale"}</td><td>${short(hex(Wallet.fromBig(nd.k, 32)))}</td><td>${short(hex(nd.c))}</td></tr>`;
    }).join("");
    html += stage("kdf", `Percorso BIP-44: ${path}`,
      `Ogni passo è un HMAC-SHA512 che usa il chain code del padre. Con indice hardened (≥ 2³¹, l'apostrofo) il dato include la chiave <i>privata</i> del padre; con indice normale usa la chiave <i>pubblica</i> (per questo da una chiave pubblica estesa si possono derivare i figli normali, ma non quelli hardened). Il nuovo k = I<sub>L</sub> + k<sub>padre</sub> mod n.`,
      `<table class="path"><thead><tr><th>percorso</th><th>livello</th><th>significato</th><th>tipo</th><th>chiave privata</th><th>chain code</th></tr></thead><tbody>${rows}</tbody></table>`);
    html += stage("gen", "Chiave privata",
      "L'ultimo k: un intero in [1, n−1] con n ≈ 2<sup>256</sup>. Non è <i>generata</i> qui: è <i>derivata</i> in modo deterministico dalla frase. Stessa frase, stesso percorso, stessa chiave, sempre.",
      box("32 byte", hex(Wallet.fromBig(w.k, 32))));
    html += stage("pub", "Chiave pubblica (secp256k1)",
      "Q = k·G, la moltiplicazione scalare dell'homework 1 su secp256k1: facile in avanti, impraticabile da invertire (ECDLP). È l'anello <b>a chiave pubblica</b>, quello che permette di firmare.",
      box("x", hex(Wallet.fromBig(w.P.x, 32))) + box("y", hex(Wallet.fromBig(w.P.y, 32))) +
      box("non compressa: 04 ‖ x ‖ y (65 byte)", `<span class="dim">04</span>${hex(Wallet.xy64(w.P))}`));
    const xy = Wallet.xy64(w.P), dig = Keccak.keccak256(xy), wrong = Keccak.sha3_256(xy).slice(12);
    html += stage("hash", "Keccak-256",
      "Si fa l'hash dei 64 byte x ‖ y (senza il prefisso 04) e si tengono gli ultimi 20 byte (160 bit). L'hash comprime e <b>cancella la struttura algebrica</b> della chiave pubblica. Attenzione: è Keccak-256 originale, non SHA3-256.",
      box("keccak256(x ‖ y), 32 byte", `<span class="dim">${hex(dig.slice(0, 12))}</span><span class="hi">${hex(dig.slice(12))}</span>`) +
      `<div class="desc">In verde gli ultimi 20 byte. Con SHA3-256 standard (padding diverso) si otterrebbe l'indirizzo <span class="hexbox" style="display:inline;padding:1px 6px">0x${hex(wrong)}</span>, sbagliato.</div>`);
    html += stage("enc", "Indirizzo",
      "Nessun calcolo nuovo: i 20 byte scritti in esadecimale con prefisso 0x. È solo <b>encoding</b> (due cifre esadecimali per byte).",
      box("20 byte = 40 cifre esadecimali", "0x" + w.lower));
    const h2 = hex(Keccak.keccak256(new TextEncoder().encode(w.lower)));
    let r1 = "", r2 = "", r3 = "";
    for (let i = 0; i < 40; i++) {
      const ch = w.lower[i], nb = parseInt(h2[i], 16), letter = /[a-f]/.test(ch), up = letter && nb >= 8;
      r1 += `<span class="c ${letter ? "letter" : ""}">${ch}</span>`;
      r2 += `<span class="c ${letter && nb >= 8 ? "big" : ""}">${h2[i]}</span>`;
      r3 += `<span class="c ${up ? "up" : letter ? "letter" : ""}">${up ? ch.toUpperCase() : ch}</span>`;
    }
    html += stage("chk", "EIP-55: checksum nelle maiuscole",
      "Si calcola keccak256 del testo dell'indirizzo in minuscolo: ogni lettera a–f diventa maiuscola se la cifra esadecimale dell'hash nella stessa posizione è ≥ 8. Non allunga l'indirizzo: il checksum è <b>nascosto nella capitalizzazione</b> (circa 15 lettere → circa 15 bit).",
      `<div class="align"><span class="row-l">indirizzo</span>${r1}<br><span class="row-l">hash (nibble)</span>${r2}<br><span class="row-l">risultato</span>${r3}</div>`);

    const ref = REF[sentence + "|" + path];
    const refLine = ref && !pass
      ? (ref[0] === w.address ? `<div class="ref-ok">✓ coincide con l'indirizzo di riferimento noto (${ref[1]}): ${ref[0]}</div>` : `<div class="banner bad">✗ NON coincide con il valore di riferimento ${ref[0]}</div>`)
      : "";
    html += `<div class="stage final"><div class="stage-head"><span class="stage-n">fine</span><span class="kind k-chk">indirizzo con checksum</span></div>` +
      `<div class="addr">${w.address}</div><div class="desc">Chiave privata ${path.split("/").length - 1} livelli sotto la radice, derivata da ${ins.words.length} parole e una passphrase ${pass ? "non vuota" : "vuota"}.</div>${refLine}</div>`;
    out.innerHTML = html;
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 200); };
  async function generate(words) {
    const e = crypto.getRandomValues(new Uint8Array((words * 4) / 3));
    $("pl-mn").value = (await Wallet.entropyToMnemonic(e)).words.join(" ");
    update();
  }
  $("pl-mn").addEventListener("input", schedule);
  $("pl-pass").addEventListener("input", schedule);
  $("pl-path").addEventListener("input", schedule);
  $("pl-test").addEventListener("click", () => { $("pl-mn").value = TEST_MN; update(); });
  $("pl-abandon").addEventListener("click", () => { $("pl-mn").value = ABANDON; update(); });
  $("pl-gen12").addEventListener("click", () => generate(12));
  $("pl-gen24").addEventListener("click", () => generate(24));
  $("pl-next").addEventListener("click", () => {
    const m = /^(.*\/)(\d+)$/.exec($("pl-path").value.trim());
    if (m) { $("pl-path").value = m[1] + (Number(m[2]) + 1); update(); }
  });
  $("pl-mn").value = TEST_MN;
  update();

  /* ================= Keccak-256 contro SHA3-256 ================= */
  const kdIn = $("kd-in");
  if (kdIn) {
    const bytesHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
    const padLine = (msg, pad) => {
      const rate = 136, k = msg.length % rate, tail = msg.slice(msg.length - k);
      const shown = tail.slice(0, 12);
      const merged = k === rate - 1;
      return `<span class="m">${bytesHex(shown)}${k > 12 ? " …" : ""}</span> ` +
        (merged ? `<span class="e">${(pad | 0x80).toString(16).padStart(2, "0")}</span>` :
          `<span class="p">${pad.toString(16).padStart(2, "0")}</span> <span class="z">00 × ${rate - k - 2}</span> <span class="e">80</span>`);
    };
    let kt = 0;
    const run = async () => {
      const my = ++kt;
      const b = Keccak.utf8(kdIn.value);
      const [s256, s512] = [await Wallet.sha256(b), await Wallet.sha512(b)];
      if (my !== kt) return;
      const k = Keccak.keccak256(b), s3 = Keccak.sha3_256(b);
      let diff = 0;
      for (let i = 0; i < 32; i++) { let x = k[i] ^ s3[i]; while (x) { diff += x & 1; x >>= 1; } }
      $("kd-out").innerHTML =
        `<table class="digests"><thead><tr><th>funzione</th><th>famiglia</th><th>digest</th></tr></thead><tbody>` +
        `<tr><td>SHA-256</td><td>SHA-2 (Merkle–Damgård)</td><td><code>${hex(s256)}</code></td></tr>` +
        `<tr><td>SHA-512</td><td>SHA-2 (Merkle–Damgård)</td><td><code>${hex(s512)}</code></td></tr>` +
        `<tr><td>SHA3-256</td><td>Keccak, FIPS 202 (2015)</td><td><code>${hex(s3)}</code></td></tr>` +
        `<tr><td>Keccak-256</td><td>Keccak originale (Ethereum)</td><td><code>${hex(k)}</code></td></tr></tbody></table>` +
        `<div class="padrow"><b>Keccak-256</b> ultimo blocco di ${136} byte: ${padLine(b, 0x01)}</div>` +
        `<div class="padrow"><b>SHA3-256</b> ultimo blocco di ${136} byte: ${padLine(b, 0x06)}</div>` +
        `<div class="small">Stessa permutazione Keccak-f[1600], stesso rate, stessa lunghezza d'uscita. Cambia un solo byte (<span class="padrow"><span class="p">01</span></span> contro <span class="padrow"><span class="p">06</span></span>): i due digest differiscono in <b>${diff}</b> bit su 256 (${Math.round((diff / 256) * 100)}%), cioè sono indipendenti.</div>`;
    };
    kdIn.addEventListener("input", run);
    run();
  }
})();
