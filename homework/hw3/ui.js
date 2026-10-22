/*
 * Prove interattive: messaggio, schema su curva ellittica, cifrario di Cesare, attacchi.
 * Lo stato condiviso (chiavi, ultimo cifrato) sta in window.HW3.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$("ec-out")) return;
  const H = (window.HW3 = { kp: null, enc: null, ct: "", key: null, found: null });

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const it = (v, d = 1) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const int = (v) => Math.round(v).toLocaleString("it-IT");
  const short = (h, a = 16, b = 8) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
  const box = (label, html, cls = "") => `<div class="hexbox ${cls}"><span class="lbl">${label}</span>${html}</div>`;
  const banner = (cls, html) => `<div class="banner ${cls}">${html}</div>`;
  const compress = (P) => (P.y & 1n ? "03" : "02") + P.x.toString(16).padStart(64, "0");
  const msgText = () => $("msg").value;
  const bitsNow = () => Number($("ec-bits").value);
  const mark = (ok) => (ok ? '<span class="mark-ok">✓</span>' : '<span class="mark-ko">✗</span>');

  /* ================= Messaggio ================= */
  const SHORT = "Ci vediamo domani all'alba al solito posto. Porta il documento e non dire niente a nessuno.";
  function setMsg(t) { $("msg").value = t; H.enc = null; renderEc(); renderCaesar(); }
  $("msg-short").addEventListener("click", () => setMsg(SHORT));
  $("msg-it").addEventListener("click", () => setMsg(Caesar.window("it", 600)));
  $("msg-en").addEventListener("click", () => setMsg(Caesar.window("en", 600)));
  $("msg").addEventListener("input", () => { H.enc = null; renderEc(); renderCaesar(); });

  /* ================= Schema su curva ellittica ================= */
  function renderEc() {
    const kp = H.kp, e = H.enc;
    let html = "";
    if (kp) {
      html += box(`chiave privata d (${kp.bits} bit: spazio di 2<sup>${kp.bits}</sup> = ${int(2 ** kp.bits)} chiavi)`, `${kp.d} <span class="dim">(0x${kp.d.toString(16)})</span>`);
      html += box("chiave pubblica Q = d·G (compressa, 33 byte)", compress(kp.Q));
    }
    if (e) {
      html += box(`chiave effimera r (${e.rBits} bit, segreta, usata una volta)`, short(e.r.toString(16).padStart(e.rBits >= 256 ? 64 : 1, "0"), 40, 8));
      html += box("C₁ = r·G (si invia)", compress(e.C1));
      html += box("segreto condiviso S = r·Q, coordinata x (non si invia)", short(e.S.x.toString(16).padStart(64, "0"), 40, 8));
      html += box("flusso di chiave SHA-256(x ‖ 0), SHA-256(x ‖ 1), … (primi 16 byte)", ECIES.hex(e.ks.slice(0, 16)));
      html += box(`cifrato c = messaggio ⊕ flusso (${e.c.length} byte; primi 48 in esadecimale)`, ECIES.hex(e.c.slice(0, 48)) + (e.c.length > 48 ? "…" : ""));
      if (e.decrypted !== undefined) {
        html += box("decifrato: S = d·C₁, stesso flusso, m = c ⊕ flusso", `<span class="${e.decrypted === e.msg ? "hi" : "bad"}">${esc(e.decrypted)}</span>`, "scroll") +
          (e.decrypted === e.msg ? banner("good", "Il messaggio decifrato coincide con l'originale ✓") : banner("bad", "Non coincide"));
      }
    }
    $("ec-out").innerHTML = html || '<span class="small">Premi «genera le chiavi».</span>';
    renderAttackInfo();
  }
  $("ec-bits").addEventListener("input", () => { $("ec-bits-out").textContent = `${bitsNow()} bit`; });
  $("ec-gen").addEventListener("click", () => {
    H.kp = ECIES.keygen(bitsNow()); H.enc = null; H.found = null;
    renderEc();
  });
  $("ec-enc").addEventListener("click", () => {
    if (!H.kp) H.kp = ECIES.keygen(bitsNow());
    const bits = $("ec-small-r").checked ? H.kp.bits : 256;
    const msg = msgText(), enc = ECIES.encrypt(msg, H.kp.Q, bits);
    H.enc = { ...enc, rBits: bits, msg, decrypted: undefined };
    renderEc();
  });
  $("ec-dec").addEventListener("click", () => {
    if (!H.enc) { $("ec-enc").click(); }
    H.enc.decrypted = ECIES.text(ECIES.decrypt(H.enc.C1, H.enc.c, H.kp.d));
    renderEc();
  });

  /* ================= Cesare ================= */
  function renderCaesar() {
    const k = Number($("cs-shift").value);
    $("cs-shift-out").textContent = k;
    const plain = Caesar.plain(msgText()), ct = Caesar.encrypt(plain, k), dec = Caesar.decrypt(ct, k);
    H.ct = ct; H.key = k;
    $("cs-out").innerHTML =
      box("messaggio (senza accenti)", esc(plain), "scroll") +
      box(`cifrato con k = ${k}`, esc(ct), "scroll") +
      box("decifrato con la stessa chiave", `<span class="${dec === plain ? "hi" : "bad"}">${esc(dec)}</span> ${mark(dec === plain)}`, "scroll");
    const fr = (t) => { const c = Caesar.counts(t), n = c.reduce((a, b) => a + b, 0) || 1; return c.map((v) => v / n); };
    const a = fr(plain), b = fr(ct), ymax = Math.max(0.05, Math.ceil(Math.max(...a, ...b) * 22) / 20);
    Charts.bars($("ch-cs"), {
      series: [{ name: "messaggio", values: a, color: Charts.colors.a }, { name: `cifrato (k = ${k})`, values: b, color: Charts.colors.sha }],
      ymax, yFmt: (v) => it(v * 100, 0) + "%", xLabel: (i) => String.fromCharCode(97 + i), xTitle: "lettera: il profilo del cifrato è quello del messaggio, spostato di k posti",
    });
  }
  $("cs-shift").addEventListener("input", renderCaesar);
  $("cs-send").addEventListener("click", () => {
    $("ca-text").value = H.ct;
    $("cesare-attacco").scrollIntoView({ behavior: "smooth" });
    $("ca-go").click();
  });

  /* ================= Attacco a Cesare ================= */
  $("ca-go").addEventListener("click", () => {
    const text = $("ca-text").value, lang = $("ca-lang").value;
    if (Caesar.indices(text).length < 3) { $("ca-out").innerHTML = banner("bad", "Servono almeno 3 lettere."); return; }
    const known = text === H.ct ? H.key : null;
    const rows = Object.entries(Caesar.METHODS).map(([m, info]) => {
      const { key, scores } = Caesar.attack(text, lang, m);
      // distacco della chiave migliore dalla seconda, in rapporto al punteggio della migliore (al massimo 100%)
      const sorted = [...scores].sort((x, y) => y - x);
      const margin = Math.min(1, (sorted[0] - sorted[1]) / (Math.abs(sorted[0]) || 1));
      const plain = Caesar.decrypt(text, key);
      return `<tr><td>${info.label}</td><td class="num">${key}${known !== null ? " " + mark(key === known) : ""}</td><td class="num">${it(margin * 100, 0)}%</td><td>${esc(plain.slice(0, 70))}${plain.length > 70 ? "…" : ""}</td></tr>`;
    }).join("");
    $("ca-out").innerHTML = `<table class="res-table"><thead><tr><th>giudice</th><th>chiave scelta</th><th>distacco</th><th>decifrazione</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="small">Lunghezza: ${Caesar.indices(text).length} lettere. «Distacco» = quanto la chiave scelta supera la seconda in classifica, in rapporto al suo punteggio: più è basso, meno il giudice è sicuro della scelta.${known !== null ? ` La chiave vera è ${known}.` : ""}</div>`;
  });

  /* ================= Attacco allo schema EC ================= */
  function renderAttackInfo() {
    const kp = H.kp;
    $("at-info").innerHTML = kp
      ? `Attacco a una chiave da <b>${kp.bits} bit</b>: lo spazio ha ${int(2 ** kp.bits)} chiavi. L'attaccante conosce solo Q e il limite ${kp.bits}. Stima: ricerca esaustiva ≈ ${it((2 ** kp.bits * 0.032) / 1000, 1)} s, baby-step giant-step ≈ ${it((2 * Math.sqrt(2 ** kp.bits) * 0.032) / 1000, 2)} s.`
      : "Genera prima le chiavi e cifra il messaggio nella sezione «schema» qui sopra.";
  }
  let busy = false;
  async function runAttack(kind) {
    if (busy) return;
    if (!H.kp) { $("at-out").innerHTML = banner("warn", "Genera prima le chiavi nella sezione «schema»."); return; }
    const bits = H.kp.bits;
    if (kind === "exh" && bits > 20) { $("at-out").innerHTML = banner("warn", `La ricerca esaustiva su ${bits} bit richiede 2<sup>${bits}</sup> passi (circa ${it((2 ** bits * 0.032) / 3.6e6, 0)} ore): riduci la chiave a 20 bit o prova la baby-step giant-step.`); return; }
    busy = true;
    const prog = $("at-prog"), say = (p) => { prog.textContent = `${Math.round(p * 100)}%`; };
    $("at-out").innerHTML = "";
    const r = kind === "exh" ? await ECIES.exhaustive(H.kp.Q, bits, say) : await ECIES.bsgs(H.kp.Q, bits, say);
    prog.textContent = "";
    busy = false;
    if (r.d === null) { $("at-out").innerHTML = banner("bad", "Chiave non trovata"); return; }
    H.found = r.d;
    const okKey = r.d === H.kp.d;
    $("at-out").innerHTML = box(kind === "exh" ? "ricerca esaustiva" : "baby-step giant-step",
      `chiave trovata: <b>${r.d}</b> ${mark(okKey)} (la vera è ${H.kp.d})<br>passi: <b>${int(r.steps)}</b> (2<sup>${bits}</sup> = ${int(2 ** bits)}) · tempo: <b>${it(r.ms / 1000, 2)} s</b>` +
      (r.table ? ` · memoria: ${int(r.table)} voci` : "")) +
      `<div class="small">Verifica esatta: d·G coincide con Q ${mark(ECIES.same(EC.mulJac(ECIES.C, r.d, ECIES.C.G), H.kp.Q))}</div>`;
  }
  $("at-exh").addEventListener("click", () => runAttack("exh"));
  $("at-bsgs").addEventListener("click", () => runAttack("bsgs"));
  $("at-dec").addEventListener("click", () => {
    if (!H.enc) { $("at-out").innerHTML = banner("warn", "Cifra prima il messaggio nella sezione «schema»."); return; }
    if (H.found === null) { $("at-out").innerHTML = banner("warn", "Recupera prima la chiave con uno dei due attacchi."); return; }
    const out = ECIES.text(ECIES.decrypt(H.enc.C1, H.enc.c, H.found));
    $("at-out").innerHTML += box("decifrato con la chiave trovata (senza conoscere d)", `<span class="${out === H.enc.msg ? "hi" : "bad"}">${esc(out)}</span>`, "scroll");
  });

  /* ================= Debolezze del progetto ================= */
  $("wk-r").addEventListener("click", async () => {
    if (busy) return; busy = true;
    $("wk-out").innerHTML = "<span class='small'>calcolo…</span>";
    const kp = ECIES.keygen(256), msg = msgText(), enc = ECIES.encrypt(msg, kp.Q, 24);
    const rec = await ECIES.bsgs(enc.C1, 24);
    const out = ECIES.text(ECIES.decryptWithR(enc.c, kp.Q, rec.d));
    busy = false;
    $("wk-out").innerHTML =
      box("chiave privata d: 256 bit, mai toccata", short(kp.d.toString(16), 24, 8)) +
      box(`r da 24 bit, recuperata da C₁ in ${it(rec.ms / 1000, 2)} s (${int(rec.steps)} passi)`, `${rec.d} ${mark(rec.d === enc.r)}`) +
      box("decifrato con S = r·Q, senza d", `<span class="${out === msg ? "hi" : "bad"}">${esc(out)}</span>`, "scroll") +
      banner("good", "Anche con una chiave privata sicura il messaggio cade, perché la chiave effimera era piccola.");
  });
  $("wk-flip").addEventListener("click", () => {
    if (!H.kp) H.kp = ECIES.keygen(bitsNow());
    const msg = msgText(), bytes = ECIES.utf8(msg), pos = [];
    bytes.forEach((b, i) => { if (b >= 97 && b <= 122) pos.push(i); });
    if (!pos.length) { $("wk-out").innerHTML = banner("warn", "Il messaggio non ha lettere minuscole."); return; }
    const enc = ECIES.encrypt(msg, H.kp.Q, 256), p = pos[Math.floor(Math.random() * pos.length)];
    const c2 = new Uint8Array(enc.c); c2[p] ^= 0x20;                     // un solo bit del cifrato
    const out = ECIES.text(ECIES.decrypt(enc.C1, c2, H.kp.d));
    const hl = [...out].map((ch, i) => (i === p ? `<span class="hl">${esc(ch)}</span>` : esc(ch))).join("");
    $("wk-out").innerHTML = box(`un solo bit cambiato nel byte ${p} del cifrato; il destinatario decifra senza accorgersi di nulla`, hl, "scroll") +
      banner("warn", "Nessun controllo di integrità: chi altera il cifrato altera il messaggio nello stesso punto (malleabilità).");
  });

  renderEc();
  renderCaesar();
  $("ca-text").value = Caesar.encrypt(Caesar.plain(SHORT), 7);
})();
