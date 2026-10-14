/*
 * Scala 1: laboratorio sulla curva giocattolo y² = x³ + 7 (mod 17).
 * Calcola kG, stampa i passaggi e li anima su una griglia 17×17.
 *
 * Su un campo finito la "retta" per due punti non è un segmento: è l'insieme
 * dei 17 punti (x, λ(x − x₁) + y₁ mod 17), uno per colonna. È questa la vera
 * geometria che il disegno mostra.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $("toy-canvas");
  if (!canvas) return;

  const C = EC.CURVES.toy, P17 = C.p, p = Number(P17);
  const ctx = canvas.getContext("2d");
  const pts = EC.points(C);
  const key = (P) => `${P.x},${P.y}`;
  const orderOf = new Map(pts.map((P) => [key(P), EC.order(C, P)]));
  const fm = (m) => (m === 1n ? "G" : `${m}G`); // "6G"
  const fp = (P) => (P === null ? "O" : `(${P.x}, ${P.y})`);
  const KIND = { double: "raddoppio", add: "somma", inverse: "P + (−P)", id: "O + P" };

  const S = { G: C.G, k: 6n, method: "naive", plan: null, t: 0, timer: null, touched: false };

  /* ---------- Controlli ---------- */
  const sel = $("toy-g");
  pts.forEach((P) => {
    const o = document.createElement("option");
    o.value = key(P);
    o.textContent = `(${P.x}, ${P.y})  ·  ordine ${orderOf.get(key(P))}`;
    if (EC.eq(P, C.G)) o.selected = true;
    sel.appendChild(o);
  });
  $("toy-npts").textContent = pts.length + 1;

  function setMethod(m) {
    S.method = m;
    $("m-naive").setAttribute("aria-pressed", String(m === "naive"));
    $("m-dna").setAttribute("aria-pressed", String(m === "dna"));
  }

  function compute() {
    const raw = $("toy-k").value.trim();
    const err = $("toy-err");
    if (!/^\d{1,30}$/.test(raw) || BigInt(raw) < 1n) {
      err.textContent = "Inserisci un intero positivo (al massimo 30 cifre).";
      return;
    }
    err.textContent = "";
    const k = BigInt(raw);
    S.k = k;
    S.G = pts.find((P) => key(P) === sel.value);
    let note = "";
    if (S.method === "naive" && k > 200n) {
      setMethod("dna");
      note = "Per k > 200 passo al double-and-add: contare una somma alla volta sarebbe troppo lungo.";
    }
    $("toy-note").textContent = note;
    S.plan = S.method === "naive" ? EC.planNaive(C, k, S.G) : EC.planDoubleAdd(C, k, S.G);
    // controllo incrociato: il piano deve dare lo stesso punto di mul()
    console.assert(EC.eq(S.plan.R, EC.mul(C, k, S.G)), "piano e mul() discordano");
    stop();
    S.t = 0;
    renderResult();
    renderTable();
    render();
  }

  const nOps = () => S.plan.ops.length;
  const last = () => 1 + 4 * nOps(); // indice dell'ultimo fotogramma
  function at(t) {
    if (t === 0) return { stage: "intro" };
    if (t >= last()) return { stage: "final" };
    return { stage: "op", i: Math.floor((t - 1) / 4), phase: (t - 1) % 4 };
  }

  /* ---------- Risultato e tabella dei passaggi ---------- */
  function renderResult() {
    const { k, G, R } = S.plan;
    const ord = BigInt(orderOf.get(key(G)));
    const wrap = k >= ord
      ? `<div class="small">k ≥ ${ord} = ordine di G, e ${ord}·G = O: quindi kG = (k mod ${ord})·G = ${k % ord}·G.</div>` : "";
    $("toy-result").innerHTML = `
      <div>chiave privata <b>k = ${k}</b> <span class="dim">(binario ${k.toString(2)})</span></div>
      <div>punto base <b>G = ${fp(G)}</b> <span class="dim">(ordine ${ord})</span></div>${wrap}
      <div class="pk">TOY PUBLIC KEY &nbsp; Q = ${k}·G = <span class="big">${fp(R)}</span></div>`;
  }

  function renderTable() {
    const { ops, method, G } = S.plan;
    const head = method === "naive" ? "#" : "bit";
    let rows = `<tr data-f="0"><td>1</td><td>parto da G</td><td>G = ${fp(G)}</td></tr>`;
    ops.forEach((op, i) => {
      const lead = method === "naive" ? i + 2 : op.bit;
      rows += `<tr data-f="${1 + 4 * i}" data-i="${i}"><td>${lead}</td>` +
        `<td>${fm(op.ma)} + ${fm(op.mb)} <span class="dim">${KIND[op.kind]}</span></td>` +
        `<td>${fm(op.m)} = ${fp(op.R)}</td></tr>`;
    });
    $("toy-table").innerHTML = `<thead><tr><th>${head}</th><th>operazione</th><th>risultato</th></tr></thead><tbody>${rows}</tbody>`;
    $("toy-table").querySelectorAll("tbody tr").forEach((tr) =>
      tr.addEventListener("click", () => { S.touched = true; stop(); S.t = Number(tr.dataset.f); render(); }));
  }

  /* ---------- Testo del fotogramma ---------- */
  function lambdaText(op) {
    const p0 = P17;
    if (op.kind === "add") {
      const dy = EC.mod(op.Q.y - op.P.y, p0), dx = EC.mod(op.Q.x - op.P.x, p0), di = EC.inv(dx, p0);
      return `λ = (y₂−y₁)·(x₂−x₁)⁻¹ = (${op.Q.y}−${op.P.y})·(${op.Q.x}−${op.P.x})⁻¹ = ${dy}·${dx}⁻¹ = ${dy}·${di} = <b>${op.lambda}</b> (mod ${p})`;
    }
    const num = EC.mod(3n * op.P.x * op.P.x, p0), den = EC.mod(2n * op.P.y, p0), di = EC.inv(den, p0);
    return `λ = 3x₁²·(2y₁)⁻¹ = 3·${op.P.x}²·(2·${op.P.y})⁻¹ = ${num}·${den}⁻¹ = ${num}·${di} = <b>${op.lambda}</b> (mod ${p})`;
  }

  function caption(st) {
    const { ops, k, G, R } = S.plan;
    if (st.stage === "intro") {
      return S.plan.method === "naive"
        ? `Parto da <b>G = ${fp(G)}</b> e sommo G a se stesso ${k - 1n} volte per ottenere ${k}G.`
        : `Parto da <b>G = ${fp(G)}</b>. Leggo k = ${S.plan.bits} (binario) dal bit più alto: ad ogni bit raddoppio, e se il bit è 1 sommo anche G.`;
    }
    if (st.stage === "final") {
      return `<b>Fine.</b> ${k}·G = <b>${fp(R)}</b> è la chiave pubblica giocattolo Q.`;
    }
    const op = ops[st.i];
    const head = `Passo ${st.i + 1}/${ops.length} · <b>${fm(op.m)} = ${fm(op.ma)} + ${fm(op.mb)}</b> (${KIND[op.kind]})`;
    if (op.kind === "id") return `${head}<br>O è l'elemento neutro: O + P = P.`;
    const x1 = op.P.x, y1 = op.P.y, x2 = op.Q.x;
    if (st.phase === 0) {
      return `${head}<br>Operandi: P = ${fp(op.P)}${op.kind === "double" ? " (P = Q)" : `, Q = ${fp(op.Q)}`}.`;
    }
    if (op.kind === "inverse") {
      return `${head}<br>Qui x₁ = x₂ e y₁ + y₂ ≡ 0 (mod ${p}): la retta è <b>verticale</b> e non incontra più la curva. P + (−P) = <b>O</b> (punto all'infinito).`;
    }
    const x3 = op.R.x, yT = EC.mod(-op.R.y, P17);
    if (st.phase === 1) {
      return `${head}<br>${op.kind === "double" ? "Tangente in P" : "Retta per P e Q"}: ${lambdaText(op)}.<br>I quadratini sono i punti (x, λ(x−x₁)+y₁ mod ${p}).`;
    }
    if (st.phase === 2) {
      return `${head}<br>Terzo punto di intersezione T: x₃ = λ² − x₁ − x₂ = ${op.lambda}² − ${x1} − ${x2} = <b>${x3}</b>, y_T = λ(x₃ − x₁) + y₁ = <b>${yT}</b>. T = (${x3}, ${yT}).`;
    }
    return `${head}<br>Rifletto T rispetto all'asse x: y₃ = −y_T = ${p} − ${yT} = ${op.R.y}. Risultato <b>${fm(op.m)} = ${fp(op.R)}</b>.`;
  }

  /* ---------- Disegno ---------- */
  const COL = { grid: "#0f2415", dot: "#1f6b34", label: "#7fc794", axis: "#3f6e4c", p: "#00ff41", q: "#6ee7ff", line: "#ffcc66", res: "#d6ffe0", refl: "#ff6b9d" };

  function draw() {
    const dpr = window.devicePixelRatio || 1, size = canvas.clientWidth;
    if (!size) return;
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#060b07"; ctx.fillRect(0, 0, size, size);
    const M = 30, T = 12, cell = (size - M - 12) / p;
    const cx = (x) => M + (Number(x) + 0.5) * cell, cy = (y) => T + (p - 1 - Number(y) + 0.5) * cell;
    ctx.font = `${Math.max(9, Math.min(11, cell * 0.42))}px "JetBrains Mono", monospace`;

    // griglia e assi
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= p; i++) {
      const gx = Math.round(M + i * cell) + 0.5, gy = Math.round(T + i * cell) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, T); ctx.lineTo(gx, T + p * cell); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(M, gy); ctx.lineTo(M + p * cell, gy); ctx.stroke();
    }
    ctx.fillStyle = COL.axis; ctx.textBaseline = "middle";
    for (let i = 0; i < p; i++) {
      ctx.textAlign = "center"; ctx.fillText(i, cx(i), T + p * cell + 10);
      ctx.textAlign = "right"; ctx.fillText(i, M - 6, cy(i));
    }

    // tutti i punti della curva
    ctx.fillStyle = COL.dot;
    pts.forEach((P) => { ctx.beginPath(); ctx.arc(cx(P.x), cy(P.y), cell * 0.13, 0, 7); ctx.fill(); });

    const st = at(S.t), { ops, G } = S.plan;
    const ring = (P, color, r = 0.34, w = 2) => {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(cx(P.x), cy(P.y), cell * r, 0, 7); ctx.stroke();
    };
    const tag = (P, text, color, dx = 0.4, dy = -0.45) => {
      ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(text, cx(P.x) + cell * dx, cy(P.y) + cell * dy);
    };

    // multipli già calcolati, etichettati la prima volta che compaiono
    const seen = new Set([key(G)]);
    const marks = [{ P: G, text: "G" }];
    const done = st.stage === "final" ? ops.length : st.stage === "op" ? st.i + (st.phase === 3 ? 1 : 0) : 0;
    for (let j = 0; j < done; j++) {
      const R = ops[j].R;
      if (R && !seen.has(key(R))) { seen.add(key(R)); marks.push({ P: R, text: fm(ops[j].m) }); }
    }
    marks.forEach(({ P, text }) => {
      ctx.fillStyle = "#16a13a"; ctx.beginPath(); ctx.arc(cx(P.x), cy(P.y), cell * 0.22, 0, 7); ctx.fill();
      tag(P, text, COL.label, 0.3, -0.3);
    });

    if (st.stage === "op") {
      const op = ops[st.i];
      if (op.P) ring(op.P, COL.p); // P può essere O (punto all'infinito): non ha una posizione
      if (op.Q && !EC.eq(op.P, op.Q)) ring(op.Q, COL.q);
      if (st.phase >= 1 && (op.kind === "add" || op.kind === "double")) {
        ctx.fillStyle = COL.line; ctx.globalAlpha = 0.8;
        const sq = cell * 0.2;
        for (let x = 0; x < p; x++) {
          const y = Number(EC.mod(op.lambda * (BigInt(x) - op.P.x) + op.P.y, P17));
          ctx.fillRect(cx(x) - sq / 2, cy(y) - sq / 2, sq, sq);
        }
        ctx.globalAlpha = 1;
      }
      if (st.phase >= 1 && op.kind === "inverse") {
        ctx.fillStyle = COL.line; ctx.globalAlpha = 0.8;
        const sq = cell * 0.2;
        for (let y = 0; y < p; y++) ctx.fillRect(cx(op.P.x) - sq / 2, cy(y) - sq / 2, sq, sq);
        ctx.globalAlpha = 1;
      }
      if (op.R && (op.kind === "add" || op.kind === "double")) {
        const T3 = { x: op.R.x, y: EC.mod(-op.R.y, P17) };
        if (st.phase >= 2) { ring(T3, COL.line, 0.34, 2.5); tag(T3, "T", COL.line); }
        if (st.phase >= 3) {
          ctx.strokeStyle = COL.refl; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(cx(T3.x), cy(T3.y)); ctx.lineTo(cx(op.R.x), cy(op.R.y)); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (st.phase >= 3 && op.R) {
        ctx.fillStyle = COL.res; ctx.beginPath(); ctx.arc(cx(op.R.x), cy(op.R.y), cell * 0.27, 0, 7); ctx.fill();
        ring(op.R, COL.res, 0.4);
        tag(op.R, fm(op.m), COL.res, 0.45, -0.4);
      }
    } else if (st.stage === "intro") {
      ring(G, COL.p, 0.4, 2.5);
    } else if (S.plan.R) {
      ring(S.plan.R, COL.res, 0.42, 3);
      tag(S.plan.R, "Q", COL.res, 0.5, -0.5);
    }
  }

  /* ---------- Rendering di tutto il pannello ---------- */
  function render() {
    draw();
    const st = at(S.t);
    $("toy-caption").innerHTML = caption(st);
    $("toy-counter").textContent = `${S.t + 1} / ${last() + 1}`;
    $("toy-play").textContent = S.timer ? "⏸ pausa" : "▶ avvia";
    $("toy-table").querySelectorAll("tbody tr").forEach((tr) => {
      const cur = (st.stage === "intro" && tr.dataset.f === "0") || (st.stage === "op" && Number(tr.dataset.i) === st.i);
      tr.classList.toggle("cur", cur);
      if (cur) { const box = tr.closest(".steps-wrap"); box.scrollTop = Math.max(0, tr.offsetTop - box.clientHeight / 2); }
    });
  }

  function stop() { clearInterval(S.timer); S.timer = null; }
  function play() {
    stop();
    if (S.t >= last()) S.t = 0;
    S.timer = setInterval(() => {
      if (S.t >= last()) { stop(); render(); return; }
      S.t++; render();
      if (S.t >= last()) { stop(); render(); }
    }, Number($("toy-speed").value));
    render();
  }
  const go = (t) => { S.touched = true; stop(); S.t = Math.max(0, Math.min(last(), t)); render(); };

  $("toy-go").addEventListener("click", () => { S.touched = true; compute(); });
  $("toy-k").addEventListener("keydown", (e) => { if (e.key === "Enter") { S.touched = true; compute(); } });
  sel.addEventListener("change", () => { S.touched = true; compute(); });
  $("m-naive").addEventListener("click", () => { setMethod("naive"); compute(); });
  $("m-dna").addEventListener("click", () => { setMethod("dna"); compute(); });
  $("toy-first").addEventListener("click", () => go(0));
  $("toy-prev").addEventListener("click", () => go(S.t - 1));
  $("toy-next").addEventListener("click", () => go(S.t + 1));
  $("toy-last").addEventListener("click", () => go(last()));
  $("toy-play").addEventListener("click", () => { S.touched = true; S.timer ? (stop(), render()) : play(); });
  $("toy-speed").addEventListener("input", () => { if (S.timer) play(); });
  window.addEventListener("resize", () => draw());

  compute();

  // l'animazione parte da sola la prima volta che il disegno è visibile
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !S.touched) { io.disconnect(); play(); }
    }, { threshold: 0.6 });
    io.observe(canvas);
  }
})();
