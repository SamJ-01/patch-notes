// Network topologies lab: break cables or devices and see who can still reach the target.
// Reachability and single points of failure are computed from the graph (tested in tests/labs.test.mjs).

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const linkKey = (a, b) => [a, b].sort().join("|");

// End devices whose connectivity we report: PCs and servers, or (for router-only WANs) every site.
export function endpoints(topo) {
  if (topo.endpoints) return topo.endpoints;  // a scenario can name its end devices (e.g. branch offices)
  const ends = topo.nodes.filter(n => (n.kind === "pc" || n.kind === "server") && n.id !== topo.target).map(n => n.id);
  return ends.length ? ends : topo.nodes.filter(n => n.id !== topo.target && n.kind !== "tap").map(n => n.id);
}

// Which nodes can reach the target, given broken links and failed devices.
export function reachable(topo, broken = new Set(), failed = new Set()) {
  if (failed.has(topo.target)) return new Set();
  // A bus is one shared cable: a break leaves an unterminated end, and reflections take the whole segment down.
  if (topo.backbone && topo.backbone.some(([a, b]) => broken.has(linkKey(a, b)) || failed.has(a) || failed.has(b))) return new Set();
  const adj = {};
  for (const [a, b] of topo.links) {
    if (broken.has(linkKey(a, b)) || failed.has(a) || failed.has(b)) continue;
    (adj[a] ??= []).push(b); (adj[b] ??= []).push(a);
  }
  const seen = new Set([topo.target]), queue = [topo.target];
  while (queue.length) for (const n of adj[queue.shift()] || []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  return seen;
}

// Single points of failure: one device or cable whose loss cuts two or more end devices off from the target.
export function singlePoints(topo) {
  const ends = endpoints(topo);
  const cut = r => ends.filter(e => !r.has(e)).length;
  const nodes = topo.nodes.filter(n => n.kind !== "tap" && n.id !== topo.target && !ends.includes(n.id) && cut(reachable(topo, new Set(), new Set([n.id]))) >= 2).map(n => n.id);
  const links = topo.links.filter(([a, b]) => cut(reachable(topo, new Set([linkKey(a, b)]))) >= 2).map(([a, b]) => linkKey(a, b));
  return { nodes, links };
}

const ICON = { pc: "PC", server: "SRV", switch: "SW", router: "R" };

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved);
  const explored = new Set();
  let topo = lab.topologies[0], broken = new Set(), failed = new Set(), showSpof = false, quiz = null;

  root.innerHTML = `<div class="topo">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="tp-parts"></div>
    <div class="row" role="group" aria-label="Topology" id="tp-tabs">${lab.topologies.map(t => `<button class="chip" data-topo="${t.id}">${esc(t.name)}</button>`).join("")}</div>
    <div class="topo-grid">
      <section class="panel"><div class="stage-box"><svg viewBox="0 0 600 340" id="tp-svg" role="group" aria-label="Network diagram"></svg></div>
        <div class="row"><button class="btn ghost" id="tp-fix">↺ Repair everything</button><label class="m-toggle"><input type="checkbox" id="tp-spof"> Show single points of failure</label></div>
        <p class="topo-status" id="tp-status" aria-live="polite"></p></section>
      <aside class="panel" id="tp-info"></aside>
    </div>
    <section class="panel" id="tp-quiz"></section>
    <div class="row"><button class="btn ghost" id="tp-reset">↺ Reset lab</button></div>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const byId = id => topo.nodes.find(n => n.id === id);
  const label = n => n.label || ({ pc: "PC", server: "Server", switch: "Switch", router: "Router" }[n.kind] || "");

  function renderParts() {
    const parts = [["explore", `Break something in ${lab.exploreGoal} topologies (${Math.min(explored.size, lab.exploreGoal)}/${lab.exploreGoal})`], ["quiz", `Name ${lab.passScore} of ${lab.quiz.length} topologies`]];
    $("tp-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(done.has(k) && k === "explore" ? "Explore the topologies" : t)}</span>`).join("");
  }
  function markPart(k) { if (done.has(k)) return; done.add(k); onPart(k); renderParts(); if (done.has("explore") && done.has("quiz")) onComplete(); }

  function draw() {
    const r = reachable(topo, broken, failed);
    const spof = showSpof ? singlePoints(topo) : { nodes: [], links: [] };
    const ends = endpoints(topo);
    let svg = "";
    if (topo.terminators) for (const id of topo.terminators) { const n = byId(id); const dx = id === topo.terminators[0] ? -22 : 22; svg += `<rect class="tp-term" x="${n.x + dx - 5}" y="${n.y - 9}" width="10" height="18" rx="2"><title>Terminator</title></rect>`; }
    for (const [a, b] of topo.links) {
      const p = byId(a), q = byId(b), k = linkKey(a, b);
      const cls = broken.has(k) ? "broken" : spof.links.includes(k) ? "spof" : topo.backbone?.some(([x, y]) => linkKey(x, y) === k) ? "backbone" : "";
      svg += `<g class="tp-link ${cls}" data-link="${k}" tabindex="0" role="button" aria-label="${broken.has(k) ? "Repair" : "Break"} the cable between ${esc(label(p) || a)} and ${esc(label(q) || b)}"><line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="hit"/><line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="wire"/></g>`;
    }
    for (const n of topo.nodes) {
      if (n.kind === "tap") { svg += `<circle class="tp-tap" cx="${n.x}" cy="${n.y}" r="4"/>`; continue; }
      const isEnd = ends.includes(n.id), isTarget = n.id === topo.target, down = failed.has(n.id);
      const state = down ? "down" : isTarget ? "target" : isEnd ? (r.has(n.id) ? "ok" : "bad") : r.has(n.id) ? "" : "bad";
      const w = n.kind === "switch" || n.kind === "server" ? 74 : n.kind === "router" ? 56 : 48;
      const shape = n.kind === "router" ? `<circle r="22"/>` : `<rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="${n.kind === "pc" ? 6 : 4}"/>`;
      svg += `<g class="tp-node ${state} ${spof.nodes.includes(n.id) ? "spof" : ""}" data-node="${n.id}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${esc(label(n))}${isTarget ? " (target)" : ""}: ${down ? "failed, select to repair" : state === "bad" ? "cut off" : "working, select to make it fail"}">
        ${shape}<text y="4" text-anchor="middle" class="ico">${ICON[n.kind] || ""}</text>${n.label ? `<text y="${n.kind === "router" ? 36 : 29}" text-anchor="middle" class="lbl">${esc(n.label)}</text>` : ""}${down ? `<path d="M-12,-12L12,12M12,-12L-12,12" class="x"/>` : ""}</g>`;
    }
    $("tp-svg").innerHTML = svg;
    const cut = ends.filter(e => !r.has(e)).length;
    $("tp-status").innerHTML = broken.size || failed.size
      ? cut ? `<b class="no">${cut} of ${ends.length}</b> end devices can't reach <b>${esc(label(byId(topo.target)))}</b>.` : `<b class="ok">Everyone can still reach ${esc(label(byId(topo.target)))}.</b> The network routed around the damage.`
      : `Everything is connected. Break a cable or device to see what happens.`;
    drawInfo();
  }
  function drawInfo() {
    const sp = singlePoints(topo);
    root.querySelectorAll("[data-topo]").forEach(b => b.setAttribute("aria-pressed", b.dataset.topo === topo.id));
    $("tp-info").innerHTML = `<h2>${esc(topo.name)}</h2><p class="muted">${esc(topo.where)}</p>
      <dl class="osi-facts"><div><dt>Strengths</dt><dd>${esc(topo.pros)}</dd></div><div><dt>Weaknesses</dt><dd>${esc(topo.cons)}</dd></div></dl>
      <div class="stat-row topo-stats"><div class="stat"><span class="eyebrow">Cables</span><b>${topo.links.length}</b></div><div class="stat"><span class="eyebrow">Single points of failure</span><b>${sp.nodes.length + sp.links.length}</b></div></div>
      <p class="osi-tip"><b>Exam tip:</b> ${esc(topo.tip)}</p>`;
  }
  function toggle(set, key) {
    set.has(key) ? set.delete(key) : set.add(key);
    if (broken.size || failed.size) { explored.add(topo.id); if (explored.size >= lab.exploreGoal) markPart("explore"); renderParts(); }
    draw();
  }
  $("tp-svg").addEventListener("click", e => {
    const l = e.target.closest("[data-link]"), n = e.target.closest("[data-node]");
    if (n) toggle(failed, n.dataset.node); else if (l) toggle(broken, l.dataset.link);
  });
  $("tp-svg").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-link],[data-node]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
  $("tp-tabs").addEventListener("click", e => { const b = e.target.closest("[data-topo]"); if (!b) return; topo = lab.topologies.find(t => t.id === b.dataset.topo); broken = new Set(); failed = new Set(); draw(); });
  $("tp-fix").addEventListener("click", () => { broken = new Set(); failed = new Set(); draw(); });
  $("tp-spof").addEventListener("change", e => { showSpof = e.target.checked; draw(); });

  // ---------- quiz: name the topology
  function drawQuiz() {
    const box = $("tp-quiz");
    if (!quiz) {
      box.innerHTML = `<div class="panel-title"><h2>Name that topology</h2></div><button class="btn brand" id="tq-go" style="justify-self:start">Start (${lab.quiz.length} questions)</button>`;
      $("tq-go").addEventListener("click", () => { quiz = { qs: lab.quiz.slice(), i: 0, score: 0, wrong: [], picked: null }; drawQuiz(); });
      return;
    }
    const z = quiz;
    if (z.i >= z.qs.length) {
      const full = z.qs.length === lab.quiz.length, passed = full && z.score >= lab.passScore;
      if (passed) markPart("quiz");
      box.innerHTML = `<div class="panel-title"><h2>Name that topology</h2><span class="mono">${z.score}/${z.qs.length}</span></div>
        <p>${passed ? "Passed." : full ? `You need ${lab.passScore} to pass.` : "Review done."}</p>
        <div class="row">${z.wrong.length ? `<button class="btn brand" id="tq-retry">↺ Retry the ${z.wrong.length} you missed</button>` : ""}<button class="btn ${z.wrong.length ? "ghost" : "brand"}" id="tq-again">Start again</button></div>`;
      $("tq-again").addEventListener("click", () => { quiz = { qs: lab.quiz.slice(), i: 0, score: 0, wrong: [], picked: null }; drawQuiz(); });
      $("tq-retry")?.addEventListener("click", () => { quiz = { qs: z.wrong.slice(), i: 0, score: 0, wrong: [], picked: null }; drawQuiz(); });
      return;
    }
    const q = z.qs[z.i], answered = z.picked != null;
    const name = id => lab.topologies.find(t => t.id === id).name;
    box.innerHTML = `<div class="panel-title"><h2>Name that topology</h2><span class="mono">${z.i + 1}/${z.qs.length}</span></div>
      <p class="q">${esc(q.q)}</p>
      <div class="osi-choices">${lab.topologies.map(t => `<button class="opt${answered ? (t.id === q.answer ? " right" : t.id === z.picked ? " wrong" : "") : ""}" data-ans="${t.id}" ${answered ? "disabled" : ""}>${esc(t.name)}</button>`).join("")}</div>
      ${answered ? `<div class="feedback">${z.picked === q.answer ? '<b class="ok">Correct.</b>' : `<b class="no">It's ${esc(name(q.answer))}.</b>`}</div><button class="btn brand" id="tq-next" style="justify-self:start">${z.i + 1 < z.qs.length ? "Next ›" : "See score"}</button>` : ""}`;
    box.querySelectorAll("[data-ans]").forEach(b => b.addEventListener("click", () => { z.picked = b.dataset.ans; if (z.picked === q.answer) z.score++; else z.wrong.push(q); drawQuiz(); $("tq-next")?.focus(); }));
    $("tq-next")?.addEventListener("click", () => { z.i++; z.picked = null; drawQuiz(); });
  }

  $("tp-reset").addEventListener("click", onReset);
  renderParts(); draw(); drawQuiz();
}
