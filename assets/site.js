/*
 * Elenco degli homework.
 * Per aggiungerne uno: copia la cartella homework/hw1 in homework/hwN,
 * modifica il suo index.html e aggiungi qui una voce.
 * status: "pubblicato" (cliccabile) oppure "in-arrivo" (grigio, non cliccabile).
 */
const HOMEWORK = [
  {
    id: "hw1",
    title: "Homework 1 · Chiave privata → chiave pubblica",
    summary: "Moltiplicazione scalare su curva ellittica (secp256k1): curva giocattolo animata ed esplorazione statistica su tre scale.",
    date: "2026-10-14",
    tags: ["curve ellittiche", "uniformità", "avalanche"],
    status: "pubblicato",
  },
  {
    id: "hw2",
    title: "Homework 2 · Dal seed all'indirizzo Ethereum",
    summary: "BIP-39, BIP-32/44, secp256k1, Keccak-256 ed EIP-55 implementati anello per anello, con le proprietà statistiche di ogni passaggio.",
    date: "2026-10-14",
    tags: ["BIP-39/32/44", "Keccak-256", "EIP-55"],
    status: "pubblicato",
  },
  {
    id: "hw3",
    title: "Homework 3 · Cesare contro curva ellittica",
    summary: "Cifrare e decifrare con Cesare e con uno schema giocattolo su secp256k1, poi attaccarli: statistica contro algebra.",
    date: "2026-10-22",
    tags: ["Cesare", "n-grammi", "chiave piccola"],
    status: "pubblicato",
  },
  {
    id: "hw4",
    title: "Homework 4 · n sistemi, m attaccanti",
    summary: "Legge dei grandi numeri e teorema del limite centrale su punteggi Bernoulli e Rademacher, con migliaia di traiettorie simulate.",
    date: "2026-10-29",
    tags: ["LLN", "CLT", "simulazione"],
    status: "pubblicato",
  },
];

/* ---------- Helpers ---------- */
const ROOT = document.currentScript.src.replace(/assets\/site\.js.*$/, "");
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789μσχβλπΣΔ∫√±≈";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- Pioggia Matrix (hero della home) ---------- */
function startRain(canvas) {
  const ctx = canvas.getContext("2d");
  const size = 16;
  let cols = 0, drops = [], w = 0, h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / size);
    drops = Array.from({ length: cols }, () => Math.random() * h / size);
    ctx.fillStyle = "#050805";
    ctx.fillRect(0, 0, w, h);
    // Pre-riempie lo schermo così la pioggia è visibile da subito
    for (let i = 0; i < 40; i++) frame();
  }

  function frame() {
    ctx.fillStyle = "rgba(5, 8, 5, 0.08)";
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${size - 2}px "JetBrains Mono", monospace`;
    for (let i = 0; i < cols; i++) {
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      const x = i * size, y = drops[i] * size;
      ctx.fillStyle = Math.random() > 0.97 ? "#d6ffe0" : "#00ff41";
      ctx.globalAlpha = 0.35 + Math.random() * 0.5;
      ctx.fillText(ch, x, y);
      if (y > h && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
    ctx.globalAlpha = 1;
  }

  resize();
  window.addEventListener("resize", resize);

  if (REDUCED_MOTION) {
    // Resta la schermata statica disegnata da resize(), senza animazione
    return;
  }
  let last = 0, visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  (function loop(t) {
    if (visible && t - last > 50) { frame(); last = t; }
    requestAnimationFrame(loop);
  })(0);
}

/* ---------- Titolo che si "decifra" ---------- */
function decrypt(el) {
  const final = el.textContent;
  if (REDUCED_MOTION) return;
  let step = 0;
  const timer = setInterval(() => {
    el.textContent = [...final].map((c, i) =>
      i < step / 1.5 || c === " " ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]
    ).join("");
    if (++step > final.length * 1.5) { clearInterval(timer); el.textContent = final; }
  }, 30);
}

/* ---------- Testo digitato carattere per carattere ---------- */
function typeText(el) {
  const full = el.innerHTML;
  if (REDUCED_MOTION) return;
  const text = el.textContent;
  el.textContent = "";
  let i = 0;
  const timer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) { clearInterval(timer); el.innerHTML = full; }
  }, 35);
}

/* ---------- Home: elenco homework ---------- */
function renderList() {
  const list = document.getElementById("hw-list");
  if (!list) return;
  const count = document.getElementById("hw-count");
  const published = HOMEWORK.filter((h) => h.status === "pubblicato").length;
  if (count) count.textContent = `${published}/${HOMEWORK.length} pubblicati`;

  list.innerHTML = HOMEWORK.map((h, i) => {
    const n = "[" + String(i + 1).padStart(2, "0") + "]";
    const live = h.status === "pubblicato";
    const tags = h.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const side = live
      ? `${formatDate(h.date)}<br><span class="hw-arrow" aria-hidden="true">→</span>`
      : `<span class="status">[locked]</span>`;
    const inner = `
      <span class="hw-num">${n}</span>
      <div class="hw-body">
        <h3>${esc(h.title)}</h3>
        <p>${esc(h.summary)}</p>
        ${tags ? `<div class="hw-tags">${tags}</div>` : ""}
      </div>
      <div class="hw-side">${side}</div>`;
    return `<li class="hw-item${live ? "" : " upcoming"}">${
      live ? `<a class="hw-link" href="${ROOT}homework/${h.id}/">${inner}</a>` : `<div class="hw-link">${inner}</div>`
    }</li>`;
  }).join("");
}

/* ---------- Pagina homework: precedente / successivo ---------- */
function renderPager() {
  const pager = document.getElementById("pager");
  if (!pager) return;
  const live = HOMEWORK.filter((h) => h.status === "pubblicato");
  const i = live.findIndex((h) => h.id === pager.dataset.id);
  const prev = live[i - 1];
  const next = live[i + 1];
  const link = (h, cls, label) =>
    `<a class="${cls}" href="${ROOT}homework/${h.id}/"><small>${label}</small>${esc(h.title)}</a>`;
  pager.innerHTML =
    (prev ? link(prev, "prev", "← cd ..prev") : "<span></span>") +
    (next ? link(next, "next", "cd next →") : "");
}

document.addEventListener("DOMContentLoaded", () => {
  renderList();
  renderPager();
  const canvas = document.getElementById("rain");
  if (canvas) startRain(canvas);
  document.querySelectorAll("[data-decrypt]").forEach(decrypt);
  document.querySelectorAll("[data-type]").forEach(typeText);
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
});
