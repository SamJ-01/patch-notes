// OSI model lab: watch encapsulation step by step, browse the layers, then sort real things into them.
// Content lives in content/labs.json (kind "osi"); the pure helpers below are tested in tests/labs.test.mjs.
import { hw } from "../hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// What the receiving side does at each layer as the request comes back up the stack.
const RECEIVE = {
  1: "The server's network card turns the signals back into bits.",
  2: "Ethernet checks the FCS for errors and sees its own MAC address in the frame, so it strips the header and trailer.",
  3: "IP sees the destination address is this server, so it removes the IP header.",
  4: "TCP sees port 443, hands the data to the web server and acknowledges what arrived.",
  5: "The session layer matches this to the right ongoing conversation.",
  6: "The request is decrypted back into readable text.",
  7: "The web server reads GET /index.html and sends the page back (going down its own stack).",
};

// The 15 steps: down the sender's stack, across the wire, up the receiver's.
export function walkthrough(lab) {
  const byN = Object.fromEntries(lab.layers.map(l => [l.n, l]));
  const steps = [];
  for (let n = 7; n >= 1; n--) steps.push({ side: "send", layer: n, text: byN[n].example, pdu: byN[n].pdu });
  steps.push({ side: "wire", layer: 0, text: "The bits travel across the cable (or radio, or fibre) to the server.", pdu: "Bits" });
  for (let n = 1; n <= 7; n++) steps.push({ side: "recv", layer: n, text: RECEIVE[n], pdu: byN[n].pdu });
  return steps;
}

// Which headers wrap the data at a given step (outermost first), so the picture always matches the text.
export function wrapping(lab, step) {
  if (step.side === "wire" || (step.layer === 1)) return { bits: true, parts: [] };
  const lowest = step.side === "send" ? step.layer : step.layer + 1;  // receiving: this layer has just removed its header
  const parts = lab.layers.filter(l => l.n >= lowest && l.header).sort((a, b) => a.n - b.n)
    .map(l => ({ n: l.n, label: l.header, text: l.headerText, color: l.color }));
  const trailer = lowest <= 2 ? lab.layers.find(l => l.n === 2) : null;
  return { bits: false, parts, trailer: trailer ? { label: trailer.trailer, color: trailer.color } : null };
}

export const checkSort = (item, layer) => item.layer === layer;

export function makeRound(items, size, rand = Math.random) {
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, size);
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved);
  const steps = walkthrough(lab);
  const byN = Object.fromEntries(lab.layers.map(l => [l.n, l]));
  let stepI = -1, cardN = 7, round = null;

  root.innerHTML = `<div class="osi">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="osi-parts"></div>

    <section class="panel"><div class="panel-title"><h2>1 · Send a web request</h2><span class="muted mono" id="osi-count"></span></div>
      <div class="osi-stage">
        <div class="osi-stack" aria-label="Your PC, sending"><div class="osi-host"><svg class="host-ic" viewBox="-34 -25 68 50" aria-hidden="true">${hw("pc")}</svg>Your PC</div>${stackRows("send")}</div>
        <div class="osi-wire" id="osi-wire" aria-hidden="true"></div>
        <div class="osi-stack" aria-label="Web server, receiving"><div class="osi-host"><svg class="host-ic" viewBox="-34 -25 68 50" aria-hidden="true">${hw("server")}</svg>Web server</div>${stackRows("recv")}</div>
      </div>
      <div class="osi-pdu" id="osi-pdu" aria-live="polite"></div>
      <p class="osi-say" id="osi-say"></p>
      <div class="row"><button class="btn ghost" id="osi-back">‹ Back</button><button class="btn brand" id="osi-next">Start ›</button><button class="btn ghost" id="osi-restart">↺ Restart</button></div>
    </section>

    <section class="panel"><div class="panel-title"><h2>2 · The layers</h2></div>
      <div class="osi-ref">
        <div class="osi-pick" role="group" aria-label="Choose a layer">${lab.layers.map(l => `<button class="osi-row" data-card="${l.n}" style="--c:${l.color}"><b>${l.n}</b> ${esc(l.name)}</button>`).join("")}</div>
        <div class="osi-card" id="osi-card" aria-live="polite"></div>
      </div>
      <div class="osi-mnem">${lab.mnemonics.map(m => `<div><span class="eyebrow">${esc(m.dir)}</span><p>${m.phrase.split(" ").map(w => `<b>${esc(w[0])}</b>${esc(w.slice(1))}`).join(" ")}</p></div>`).join("")}</div>
      <div class="osi-tcpip"><span class="eyebrow">TCP/IP model</span><div>${lab.tcpip.map(t => `<span style="flex:${t.covers.length}">${esc(t.name)} <i>(${t.covers.join(", ")})</i></span>`).join("")}</div></div>
    </section>

    <section class="panel" id="osi-sort"></section>
    <div class="row"><button class="btn ghost" id="osi-reset">↺ Reset lab</button></div>
  </div>`;

  const $ = id => root.querySelector("#" + id);

  function stackRows(side) {
    return lab.layers.map(l => `<div class="osi-layer" data-side="${side}" data-n="${l.n}" style="--c:${l.color}"><b>${l.n}</b><span>${esc(l.name)}</span></div>`).join("");
  }

  function renderParts() {
    const parts = [["walk", "Watch the journey"], ["sort", `Sort ${lab.passScore}/${lab.roundSize} correctly`]];
    $("osi-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(t)}</span>`).join("");
  }
  function markPart(k) {
    if (done.has(k)) return;
    done.add(k); onPart(k); renderParts();
    if (done.has("walk") && done.has("sort")) onComplete();
  }

  // ---------- 1. encapsulation walkthrough
  function drawStep() {
    root.querySelectorAll(".osi-layer").forEach(el => el.classList.remove("on", "past"));
    $("osi-wire").classList.toggle("on", stepI >= 0 && steps[stepI].side === "wire");
    if (stepI < 0) {
      $("osi-count").textContent = `${steps.length} steps`;
      $("osi-pdu").innerHTML = `<div class="pdu-data" style="--c:${byN[7].color}">GET /index.html</div>`;
      $("osi-say").textContent = "Your browser wants a web page. Press Start to send the request down your PC's layers.";
      $("osi-next").textContent = "Start ›"; $("osi-back").disabled = true;
      return;
    }
    const st = steps[stepI];
    $("osi-count").textContent = `Step ${stepI + 1} of ${steps.length}`;
    if (st.side !== "wire") {
      root.querySelector(`.osi-layer[data-side="${st.side}"][data-n="${st.layer}"]`)?.classList.add("on");
      root.querySelectorAll(`.osi-layer[data-side="${st.side}"]`).forEach(el => {
        const n = Number(el.dataset.n);
        if (st.side === "send" ? n > st.layer : n < st.layer) el.classList.add("past");
      });
      if (st.side === "recv") root.querySelectorAll(`.osi-layer[data-side="send"]`).forEach(el => el.classList.add("past"));
    } else root.querySelectorAll(`.osi-layer[data-side="send"]`).forEach(el => el.classList.add("past"));
    const w = wrapping(lab, st);
    $("osi-pdu").innerHTML = w.bits
      ? `<div class="pdu-bits">0110100001010100 0101010001010000 …</div><span class="pdu-name">${esc(st.pdu)}</span>`
      : `<div class="pdu-row">${w.parts.map(p => `<span class="pdu-h" style="--c:${p.color}"><b>${esc(p.label)}</b><i>${esc(p.text)}</i></span>`).join("")}<span class="pdu-data" style="--c:${byN[7].color}">GET /index.html</span>${w.trailer ? `<span class="pdu-h" style="--c:${w.trailer.color}"><b>${esc(w.trailer.label)}</b></span>` : ""}</div><span class="pdu-name">${esc(st.pdu)}</span>`;
    const where = st.side === "wire" ? "On the wire" : `${st.side === "send" ? "Sending" : "Receiving"} · Layer ${st.layer} ${byN[st.layer].name}`;
    $("osi-say").innerHTML = `<b>${esc(where)}.</b> ${esc(st.text)}`;
    $("osi-back").disabled = false;
    const last = stepI === steps.length - 1;
    $("osi-next").textContent = last ? "Done ✓" : "Next ›";
    if (last) markPart("walk");
  }
  $("osi-next").addEventListener("click", () => { if (stepI < steps.length - 1) { stepI++; drawStep(); } });
  $("osi-back").addEventListener("click", () => { if (stepI > -1) { stepI--; drawStep(); } });
  $("osi-restart").addEventListener("click", () => { stepI = -1; drawStep(); });

  // ---------- 2. layer reference
  function drawCard() {
    const l = byN[cardN];
    root.querySelectorAll("[data-card]").forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.card) === cardN));
    $("osi-card").style.setProperty("--c", l.color);
    $("osi-card").innerHTML = `<div class="eyebrow">Layer ${l.n} · PDU: ${esc(l.pdu)}</div><h3>${esc(l.name)}</h3><p class="osi-job">${esc(l.job)}</p>
      <p>${esc(l.example)}</p>
      <dl class="osi-facts"><div><dt>Protocols</dt><dd>${l.protocols.map(esc).join(" · ")}</dd></div>${l.devices.length ? `<div><dt>Devices</dt><dd>${l.devices.map(esc).join(" · ")}</dd></div>` : ""}</dl>
      <p class="osi-tip"><b>Exam tip:</b> ${esc(l.tip)}</p>`;
  }
  $("osi-card").previousElementSibling.addEventListener("click", e => { const b = e.target.closest("[data-card]"); if (b) { cardN = Number(b.dataset.card); drawCard(); } });

  // ---------- 3. sorting game
  function newRound(items) { round = { items, i: 0, score: 0, wrong: [], picked: null }; drawSort(); }
  function drawSort() {
    const box = $("osi-sort");
    if (!round) {
      box.innerHTML = `<div class="panel-title"><h2>3 · Which layer?</h2></div><p class="muted">${lab.roundSize} random items: devices, protocols, PDUs and real problems. Score ${lab.passScore} or more to finish the lab.</p><button class="btn brand" id="osi-go" style="justify-self:start">Start sorting</button>`;
      $("osi-go").addEventListener("click", () => newRound(makeRound(lab.sortItems, lab.roundSize)));
      return;
    }
    const r = round;
    if (r.i >= r.items.length) {
      const passed = r.items.length === lab.roundSize && r.score >= lab.passScore;
      box.innerHTML = `<div class="panel-title"><h2>3 · Which layer?</h2><span class="mono">${r.score}/${r.items.length}</span></div>
        <p>${passed ? "Passed. You know your layers." : r.items.length === lab.roundSize ? `You need ${lab.passScore} to pass. Go over the ones you missed, then try a new round.` : "Review round done."}</p>
        ${r.wrong.length ? `<ul class="osi-missed">${r.wrong.map(it => `<li><b>${esc(it.text)}</b> → Layer ${it.layer} ${esc(byN[it.layer].name)}. ${esc(it.why)}</li>`).join("")}</ul>` : ""}
        <div class="row">${r.wrong.length ? `<button class="btn brand" id="osi-retry">↺ Retry the ${r.wrong.length} you missed</button>` : ""}<button class="btn ${r.wrong.length ? "ghost" : "brand"}" id="osi-new">New round</button></div>`;
      if (passed) markPart("sort");
      $("osi-new").addEventListener("click", () => newRound(makeRound(lab.sortItems, lab.roundSize)));
      $("osi-retry")?.addEventListener("click", () => newRound(makeRound(r.wrong, r.wrong.length)));
      return;
    }
    const it = r.items[r.i];
    const answered = r.picked != null;
    box.innerHTML = `<div class="panel-title"><h2>3 · Which layer?</h2><span class="mono">${r.i + 1}/${r.items.length} · score ${r.score}</span></div>
      <div class="osi-item">${esc(it.text)}</div>
      <div class="osi-choices">${lab.layers.map(l => {
        const cls = answered ? (l.n === it.layer ? " right" : l.n === r.picked ? " wrong" : "") : "";
        return `<button class="opt osi-choice${cls}" data-pick="${l.n}" style="--c:${l.color}" ${answered ? "disabled" : ""}><b>${l.n}</b> ${esc(l.name)}</button>`;
      }).join("")}</div>
      ${answered ? `<div class="feedback">${checkSort(it, r.picked) ? '<b class="ok">Correct.</b>' : `<b class="no">It's Layer ${it.layer}.</b>`} ${esc(it.why)}</div><button class="btn brand" id="osi-nx" style="justify-self:start">${r.i + 1 < r.items.length ? "Next ›" : "See score"}</button>` : ""}`;
    box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
      r.picked = Number(b.dataset.pick);
      if (checkSort(it, r.picked)) r.score++; else r.wrong.push(it);
      drawSort(); $("osi-nx")?.focus();
    }));
    $("osi-nx")?.addEventListener("click", () => { r.i++; r.picked = null; drawSort(); });
  }

  $("osi-reset").addEventListener("click", onReset);
  renderParts(); drawStep(); drawCard(); drawSort();
}
