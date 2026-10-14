// Ports and protocols: flip cards for the Network+ port list, then a quick-fire drill.
// makeRound() and makeQuestion() are pure (tested in tests/labs.test.mjs); mount() is the on-page lab.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const portText = p => p.ports.join(", ");

const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// One question about one protocol. Wrong options never share a port with the right answer,
// so "which protocol uses port 22?" can't offer both SSH and SFTP.
export function makeQuestion(protos, type, p, rng = Math.random) {
  const others = protos.filter(o => o.id !== p.id);
  const options = (right, pool) => shuffle([right, ...shuffle([...new Set(pool)].filter(x => x !== right), rng).slice(0, 3)], rng);
  if (type === "port") {
    const right = portText(p);
    return { type, id: p.id, q: `Which port does ${p.name} use?`, answer: right, options: options(right, others.filter(o => !o.ports.some(n => p.ports.includes(n))).map(portText)) };
  }
  if (type === "proto") {
    const port = pick(p.ports, rng);
    return { type, id: p.id, q: `Port ${port} belongs to which protocol?`, answer: p.name, options: options(p.name, others.filter(o => !o.ports.includes(port)).map(o => o.name)) };
  }
  if (type === "transport") {
    return { type, id: p.id, q: `Does ${p.name} normally run over TCP or UDP?`, answer: p.transport, options: ["TCP", "UDP"] };
  }
  const sec = protos.find(o => o.id === p.secure);
  return { type, id: p.id, q: `What's the secure replacement for ${p.name} (port ${portText(p)})?`, answer: sec.name, options: options(sec.name, others.filter(o => o.id !== sec.id && !o.secure).map(o => o.name)) };
}

// A drill: a mix of question types, never the same question twice.
export function makeRound(protos, n, rng = Math.random) {
  const pool = [];
  for (const p of protos) {
    pool.push(["port", p], ["proto", p]);
    if (p.transport !== "TCP/UDP") pool.push(["transport", p]);
    if (p.secure) pool.push(["secure", p]);
  }
  const chosen = [], used = new Set();
  for (const [type, p] of shuffle(pool, rng)) {
    if (chosen.length >= n) break;
    if (used.has(p.id) || (type === "transport" && chosen.filter(([t]) => t === "transport").length >= 2)) continue;  // TCP/UDP is a coin flip: keep it rare
    used.add(p.id); chosen.push([type, p]);
  }
  return chosen.map(([type, p]) => makeQuestion(protos, type, p, rng));
}

const GROUP_ORDER = ["Web", "Email", "File transfer", "Remote access", "Network services", "Directory and databases", "Voice"];

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const protos = lab.protocols;
  const done = new Set(solved), flipped = new Set();
  let drill = null;

  const groups = GROUP_ORDER.filter(g => protos.some(p => p.group === g));
  const pairs = protos.filter(p => p.secure).map(p => [p, protos.find(o => o.id === p.secure)]);
  root.innerHTML = `<div class="ports">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="pp-parts"></div>
    <section class="panel"><div class="panel-title"><h2>The port cards</h2><button class="btn ghost" id="pp-all" type="button">Flip all</button></div>
      <p class="muted">Guess the port, then tap the card to check.</p>
      ${groups.map(g => `<h3 class="eyebrow">${esc(g)}</h3><div class="port-grid">${protos.filter(p => p.group === g).map(p => `
        <button class="port-card" type="button" data-p="${p.id}" aria-pressed="false">
          <span class="pc-front"><b>${esc(p.name)}</b><span>${esc(p.full)}</span></span>
          <span class="pc-back"><span class="pc-name">${esc(p.name)}</span><b class="pc-num">${esc(portText(p))}</b><span class="pc-tr">${esc(p.transport)}</span><span class="pc-what">${esc(p.what)}</span></span>
        </button>`).join("")}</div>`).join("")}
    </section>
    <section class="panel"><div class="panel-title"><h2>Swap the insecure ones</h2></div>
      <p class="muted">The exam loves these pairs: the plain-text protocol and the encrypted protocol that replaced it.</p>
      <div class="pair-list">${pairs.map(([a, b]) => `<div class="pair"><span class="bad-p">${esc(a.name)} <i>${esc(portText(a))}</i></span><span aria-hidden="true">→</span><span class="sr-only">is replaced by</span><span class="good-p">${esc(b.name)} <i>${esc(portText(b))}</i></span></div>`).join("")}</div>
    </section>
    <section class="panel" id="pp-drill"></section>
    <div class="row"><button class="btn ghost" id="pp-reset">↺ Reset lab</button></div>
  </div>`;
  const $ = id => root.querySelector("#" + id);

  function renderParts() {
    const parts = [["flip", `Flip ${lab.flipGoal} cards (${Math.min(flipped.size, lab.flipGoal)}/${lab.flipGoal})`], ["drill", `Score ${lab.passScore}/${lab.drillLength} in the drill`]];
    $("pp-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(done.has(k) && k === "flip" ? "Learn the cards" : t)}</span>`).join("");
  }
  function markPart(k) { if (done.has(k)) return; done.add(k); onPart(k); renderParts(); if (done.has("flip") && done.has("drill")) onComplete(); }

  function flip(card, open) {
    card.setAttribute("aria-pressed", open); card.classList.toggle("open", open);
    if (open) { flipped.add(card.dataset.p); if (flipped.size >= lab.flipGoal) markPart("flip"); renderParts(); }
  }
  root.querySelectorAll(".port-card").forEach(c => c.addEventListener("click", () => flip(c, c.getAttribute("aria-pressed") !== "true")));
  $("pp-all").addEventListener("click", () => {
    const cards = [...root.querySelectorAll(".port-card")], open = cards.some(c => c.getAttribute("aria-pressed") !== "true");
    cards.forEach(c => { c.setAttribute("aria-pressed", open); c.classList.toggle("open", open); });  // a peek: doesn't count as studying
    $("pp-all").textContent = open ? "Hide all" : "Flip all";
  });

  function drawDrill() {
    const box = $("pp-drill");
    if (!drill) {
      box.innerHTML = `<div class="panel-title"><h2>Quick-fire drill</h2></div><p class="muted">${lab.drillLength} questions: ports, protocols, TCP or UDP, and secure swaps.</p><button class="btn brand" id="pd-go" style="justify-self:start">Start the drill</button>`;
      $("pd-go").addEventListener("click", () => start(makeRound(protos, lab.drillLength)));
      return;
    }
    const z = drill;
    if (z.i >= z.qs.length) {
      const full = z.qs.length === lab.drillLength, passed = full && z.score >= lab.passScore;
      if (passed) markPart("drill");
      box.innerHTML = `<div class="panel-title"><h2>Quick-fire drill</h2><span class="mono">${z.score}/${z.qs.length}</span></div>
        <p>${passed ? `Passed. Best streak: ${z.best}.` : full ? `You need ${lab.passScore} to pass. Best streak: ${z.best}.` : "Review done."}</p>
        <div class="row">${z.wrong.length ? `<button class="btn brand" id="pd-retry">↺ Retry the ${z.wrong.length} you missed</button>` : ""}<button class="btn ${z.wrong.length ? "ghost" : "brand"}" id="pd-again">New drill</button></div>`;
      $("pd-again").addEventListener("click", () => start(makeRound(protos, lab.drillLength)));
      $("pd-retry")?.addEventListener("click", () => start(z.wrong.map(q => makeQuestion(protos, q.type, protos.find(p => p.id === q.id)))));
      $(z.wrong.length ? "pd-retry" : "pd-again").focus();
      return;
    }
    const q = z.qs[z.i], answered = z.picked != null, p = protos.find(x => x.id === q.id);
    box.innerHTML = `<div class="panel-title"><h2>Quick-fire drill</h2><span class="mono">${z.i + 1}/${z.qs.length}${z.streak > 1 ? ` · streak ${z.streak}` : ""}</span></div>
      <p class="q">${esc(q.q)}</p>
      <div class="osi-choices">${q.options.map(o => `<button class="opt${answered ? (o === q.answer ? " right" : o === z.picked ? " wrong" : "") : ""}" data-ans="${esc(o)}" ${answered ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${answered ? `<div class="feedback">${z.picked === q.answer ? '<b class="ok">Correct.</b>' : `<b class="no">It's ${esc(q.answer)}.</b>`} ${esc(p.name)}: port ${esc(portText(p))}, ${esc(p.transport)}. ${esc(p.what)}</div>
        <button class="btn brand" id="pd-next" style="justify-self:start">${z.i + 1 < z.qs.length ? "Next ›" : "See score"}</button>` : ""}`;
    box.querySelectorAll("[data-ans]").forEach(b => b.addEventListener("click", () => {
      z.picked = b.dataset.ans;
      if (z.picked === q.answer) { z.score++; z.streak++; z.best = Math.max(z.best, z.streak); } else { z.wrong.push(q); z.streak = 0; }
      drawDrill(); $("pd-next")?.focus();
    }));
    $("pd-next")?.addEventListener("click", () => { z.i++; z.picked = null; drawDrill(); box.querySelector("[data-ans]")?.focus(); });
  }
  function start(qs) { drill = { qs, i: 0, score: 0, wrong: [], picked: null, streak: 0, best: 0 }; drawDrill(); $("pp-drill").querySelector("[data-ans]")?.focus(); }

  $("pp-reset").addEventListener("click", onReset);
  renderParts(); drawDrill();
}
