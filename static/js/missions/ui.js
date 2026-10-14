// Mission UI: draws a scenario, animates what the engine reports, and handles controls.
// Reusable pieces: device boxes, links, animated packets, speech bubbles, an inspection panel,
// play/pause/step/replay/speed/reset controls and a text transcript of everything shown.
import * as engine from "./engine.js";

const NS = "http://www.w3.org/2000/svg";
// Wide layout uses each device's x/y; narrow screens use the scenario's portrait layout if it has one.
const WIDE = { w: 680, h: 320, dw: 172 };
const PAD = 14, HEAD = 22, ROW = 20, MARGIN = 14;  // device box padding, header and row heights; stage margin
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = { pc: "PC", switch: "SW", server: "SRV", router: "RTR" };
const KIND_LABEL = { Investigate: "Investigate", Test: "Test", Fix: "Fix" };

export function mount(root, scenario, { mode = "guided", doneModes = [], onComplete = () => {}, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches } = {}) {
  let state, playing = false, speed = 1, details = false, selected = null, busy = false, runId = 0;
  const modes = Object.entries(scenario.modes);

  root.innerHTML = `<div class="mission">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Mission · ${esc(scenario.topic)} · ${scenario.minutes} min</div>
      <h1>${esc(scenario.title)}</h1><p>${esc(scenario.summary)}</p></div>
    <div class="row mode-tabs" role="tablist" aria-label="Mission mode">${modes.map(([k, m]) => `<button class="chip" role="tab" data-mode="${k}">${doneModes.includes(k) ? "✓ " : ""}${esc(m.label)} <span class="n">+${m.xp} XP</span></button>`).join("")}</div>
    <p class="mode-intro" id="m-intro"></p>
    <div class="mission-grid">
      <section class="panel stage" aria-label="Network simulation">
        <div class="stage-box"><svg viewBox="0 0 ${WIDE.w} ${WIDE.h}" id="m-svg" role="img" aria-label="Network diagram: ${Object.values(scenario.devices).map(d => d.label).join(", ")}"></svg><div class="bubbles" id="m-bubbles" aria-hidden="true"></div></div>
        <div class="row m-controls" id="m-controls">
          <button class="btn brand" id="m-play">▶ Play</button>
          <button class="btn" id="m-step">Step ›</button>
          <button class="btn ghost" id="m-reset">↺ Reset</button>
          <label class="m-speed">Speed <select id="m-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
        </div>
        <details class="tbl simplification"><summary>About this simulation</summary><p>${esc(scenario.simplification)} Nothing on this page sends real network traffic.</p></details>
      </section>
      <aside class="stack m-side">
        <section class="panel" id="m-task"></section>
        <section class="panel" id="m-inspect"><h2>Inspect a message</h2><p class="muted">Click a moving packet or a line in the transcript to see what's inside it.</p></section>
      </aside>
    </div>
    <section class="panel"><h2>What happened (text version)</h2><ol class="transcript" id="m-log" aria-live="polite"></ol></section>
    <section class="panel debrief" id="m-debrief" hidden></section>
  </div>`;

  const $ = id => root.querySelector("#" + id);
  const svg = $("m-svg"), bubbles = $("m-bubbles");
  const dev = id => scenario.devices[id];
  let L;  // current layout: { w, h, dw, narrow }
  const chooseLayout = () => {
    const narrow = scenario.narrow && root.clientWidth < 620;
    return narrow ? { ...scenario.narrow, narrow: true } : { ...WIDE, narrow: false };
  };
  const center = id => L.narrow ? { x: L.pos[id][0], y: L.pos[id][1] } : { x: dev(id).x, y: dev(id).y };
  // Boxes grow with what they show: a header, then an IP row and a status row only if the device has them.
  const rows = id => { const d = dev(id); return { ip: "ip" in d, status: Boolean(d.status) || d.kind === "server" || d.kind === "pc" }; };
  const height = id => { const r = rows(id); return PAD * 2 + HEAD + (r.ip ? ROW : 0) + (r.status ? ROW : 0) - (r.ip || r.status ? 0 : 4); };
  // Devices with details side by side on the same row share the tallest height, so their edges line up.
  // A name-only device (like a switch) stays compact.
  const box = id => {
    const c = center(id), r = rows(id);
    const h = r.ip || r.status
      ? Math.max(...Object.keys(scenario.devices).filter(o => center(o).y === c.y && (rows(o).ip || rows(o).status)).map(height))
      : height(id);
    return { x: c.x - L.dw / 2, y: c.y - h / 2, w: L.dw, h, cx: c.x, cy: c.y };
  };
  // Shrink text a little to fit its space, then cut it with an ellipsis as a last resort.
  function fit(el, text, maxW, minSize) {
    el.textContent = text;
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.getComputedTextLength() > maxW && size > minSize) { size -= 0.5; el.style.fontSize = size + "px"; }
    if (el.getComputedTextLength() <= maxW) return;
    let t = text;
    while (t.length > 1 && el.getComputedTextLength() > maxW) { t = t.slice(0, -1); el.textContent = t.trimEnd() + "…"; }
  }
  // Cables run at right angles with rounded corners: across then down, or down then across.
  function route(a, b) {
    const p = center(a), q = center(b);
    if (p.x === q.x || p.y === q.y) return [p, q];
    if (Math.abs(q.x - p.x) > Math.abs(q.y - p.y)) { const mx = (p.x + q.x) / 2; return [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q]; }
    const my = (p.y + q.y) / 2; return [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
  }
  function roundedPath(pts, r = 12) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
      const k = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
      const u = (from, to) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: (to.x - from.x) / l, y: (to.y - from.y) / l }; };
      const d1 = u(b, a), d2 = u(b, c);
      d += ` L${b.x + d1.x * k},${b.y + d1.y * k} Q${b.x},${b.y} ${b.x + d2.x * k},${b.y + d2.y * k}`;
    }
    const z = pts[pts.length - 1];
    return d + ` L${z.x},${z.y}`;
  }

  // ---------- drawing
  function drawTopology() {
    L = chooseLayout();
    svg.setAttribute("viewBox", `${-MARGIN} ${-MARGIN} ${L.w + MARGIN * 2} ${L.h + MARGIN * 2}`);
    svg.innerHTML = "";
    for (const [a, b] of scenario.links) {
      const l = document.createElementNS(NS, "path");
      l.setAttribute("d", roundedPath(route(a, b)));
      l.setAttribute("class", "m-link");
      svg.appendChild(l);
    }
    for (const id of Object.keys(scenario.devices)) {
      const b = box(id), r = rows(id);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "m-dev");
      g.setAttribute("id", "dev-" + id);
      const headY = b.y + PAD + HEAD / 2;
      let rowY = b.y + PAD + HEAD + ROW / 2 + 2;
      const ipY = r.ip ? rowY : null; if (r.ip) rowY += ROW;
      const statusY = r.status ? rowY : null;
      g.innerHTML = `<rect class="m-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/>
        <rect class="m-badge" x="${b.x + PAD}" y="${headY - 10}" height="20" rx="4"/>
        <text class="m-ico" x="${b.x + PAD}" y="${headY}" dominant-baseline="central">${ICON[dev(id).kind] || ""}</text>
        <text class="m-name" y="${headY}" dominant-baseline="central"></text>
        ${r.status ? `<circle class="m-dot" cx="${b.x + b.w - PAD}" cy="${headY}" r="4"/>` : ""}
        ${r.ip ? `<text class="m-ip" x="${b.x + PAD}" y="${ipY}" dominant-baseline="central"><tspan class="m-k">IP</tspan><tspan class="m-v" dx="7"></tspan></text>` : ""}
        ${r.status ? `<text class="m-status" x="${b.x + PAD}" y="${statusY}" dominant-baseline="central"></text>` : ""}`;
      svg.appendChild(g);
      // The kind badge sizes to its text; the name starts after it and gets whatever room is left.
      const ico = g.querySelector(".m-ico"), badge = g.querySelector(".m-badge"), name = g.querySelector(".m-name");
      const bw = ico.getComputedTextLength() + 12;
      badge.setAttribute("width", bw);
      ico.setAttribute("x", b.x + PAD + bw / 2);
      ico.setAttribute("text-anchor", "middle");
      name.setAttribute("x", b.x + PAD + bw + 8);
      fit(name, dev(id).label, b.w - PAD * 2 - bw - 8 - (r.status ? 12 : 0), 11.5);
    }
    updateDevices();
  }
  function updateDevices() {
    for (const [id, d] of Object.entries(state.devices)) {
      const g = svg.querySelector("#dev-" + id); if (!g) continue;
      const b = box(id), room = b.w - PAD * 2;
      const ip = g.querySelector(".m-v");
      if (ip) fit(ip, d.ip || "—", room - 24, 11);
      const st = g.querySelector(".m-status");
      const status = d.kind === "server" && d.service === "stopped" && state.mode !== "challenge" ? "Service stopped" : d.status || "";
      if (st) fit(st, status, room, 10.5);
      const ok = id === "pc" && /^192\.168\./.test(d.ip || ""), bad = id === "pc" && /^169\.254\./.test(d.ip || "");
      g.classList.toggle("ok", ok);
      g.classList.toggle("bad", bad);
    }
  }

  // ---------- speech bubbles: above the device, or below it when there's no room; never clipped.
  // A small tail points at the device that's speaking.
  function bubble(id, text, tone = "") {
    const d = box(id);
    const b = document.createElement("div");
    b.className = `bubble ${tone}`;
    b.textContent = text;
    bubbles.appendChild(b);
    const area = bubbles.getBoundingClientRect(), k = area.width / (L.w + MARGIN * 2);
    const px = v => (v + MARGIN) * k;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    const x = Math.max(6, Math.min(area.width - bw - 6, px(d.cx) - bw / 2));
    let y = px(d.y) - bh - 10, below = false;
    if (y < 6) { y = px(d.y + d.h) + 10; below = true; }
    b.classList.toggle("below", below);
    b.style.left = `${x}px`;
    b.style.top = `${Math.min(y, area.height - bh - 6)}px`;
    b.style.setProperty("--tail", `${Math.max(14, Math.min(bw - 14, px(d.cx) - x))}px`);
    return b;
  }
  const clearBubbles = () => { bubbles.innerHTML = ""; };

  // ---------- packet animation
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function packet(label, msgId) {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "m-pkt");
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `Inspect ${label}`);
    g.innerHTML = `<rect x="-50" y="-13" width="100" height="26" rx="5"/><text x="0" y="5" text-anchor="middle">${esc(label.replace("DHCP ", ""))}</text>`;
    g.addEventListener("click", () => inspect(msgId));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inspect(msgId); } });
    svg.appendChild(g);
    return g;
  }
  // Packets travel along the cable's route, easing in and out over the whole journey.
  function move(g, pts, ms, token) {
    const place = p => g.setAttribute("transform", `translate(${p.x},${p.y})`);
    const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    const at = dist => {
      for (let i = 0; i < lens.length; i++) {
        if (dist <= lens[i] || i === lens.length - 1) {
          const f = lens[i] ? Math.min(1, dist / lens[i]) : 1, a = pts[i], b = pts[i + 1];
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        }
        dist -= lens[i];
      }
    };
    return new Promise(resolve => {
      if (reducedMotion || ms <= 0) { place(pts[pts.length - 1]); return resolve(); }
      const t0 = performance.now();
      const tick = now => {
        if (token !== runId) return resolve();
        const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        place(at(e * total));
        t < 1 ? requestAnimationFrame(tick) : resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  // Packets stop just outside the receiving device so they don't hide its label.
  function arrival(from, toId) {
    const pts = route(from, toId), b = box(toId);
    const [p, q] = pts.slice(-2);
    const end = q.x === p.x
      ? { x: q.x, y: p.y < q.y ? b.y - 19 : b.y + b.h + 19 }
      : { x: p.x < q.x ? b.x - 56 : b.x + b.w + 56, y: q.y };
    return [...pts.slice(0, -1), end];
  }
  async function animateMessage(id, msg, { noReply = false } = {}) {
    const token = runId;
    const ms = 700 / speed;
    svg.querySelectorAll(".m-pkt").forEach(p => p.remove());
    clearBubbles();
    bubble(msg.from, msg.say, "say");
    svg.querySelector("#dev-" + msg.from)?.classList.add("talk");
    const p = packet(msg.name, id);
    const start = center(msg.path[0]);
    p.setAttribute("transform", `translate(${start.x},${start.y})`);
    for (let i = 1; i < msg.path.length; i++) {
      const last = i === msg.path.length - 1 && !msg.flood;
      await move(p, last ? arrival(msg.path[i - 1], msg.path[i]) : route(msg.path[i - 1], msg.path[i]), ms, token);
    }
    const hubId = msg.path[msg.path.length - 1], hub = center(hubId);
    // A switch floods broadcasts out of every other port: one copy per destination.
    const copies = (msg.flood || []).map((to, i) => { const c = i === 0 ? p : packet(msg.name, id); c.setAttribute("transform", `translate(${hub.x},${hub.y})`); return [c, to]; });
    await Promise.all(copies.map(([c, to]) => move(c, arrival(hubId, to), ms, token)));
    if (token !== runId) return;
    svg.querySelector("#dev-" + msg.from)?.classList.remove("talk");
    if (noReply) bubble((msg.flood || msg.path.slice(-1))[0], "… (no answer)", "quiet");
    else Object.entries(msg.reactions || {}).forEach(([who, text]) => bubble(who, text, who === "router" ? "quiet" : ""));
    if (!reducedMotion) await wait(500 / speed);
  }

  // ---------- inspector + transcript
  function inspect(id) {
    selected = id;
    const msg = scenario.messages[id];
    const fields = msg.fields.filter(f => details || f.level === 1);
    $("m-inspect").innerHTML = `<div class="panel-title"><h2>${esc(msg.name)}</h2><label class="m-toggle"><input type="checkbox" id="m-details" ${details ? "checked" : ""}> Protocol details</label></div>
      <p>${esc(msg.explain)}</p>
      <dl class="fields">${fields.map(f => `<div><dt>${esc(f.name)}</dt><dd><code>${esc(f.value)}</code><span>${esc(f.explain)}</span></dd></div>`).join("")}</dl>
      ${details ? "" : `<p class="muted" style="font-size:0.85rem">${msg.fields.length - fields.length} more technical fields: tick “Protocol details”.</p>`}`;
    $("m-details").addEventListener("change", e => { details = e.target.checked; inspect(id); });
  }
  function logLine(html, msgId) {
    const li = document.createElement("li");
    li.innerHTML = html;
    if (msgId) {
      const b = document.createElement("button");
      b.className = "link-btn"; b.textContent = "inspect"; b.addEventListener("click", () => inspect(msgId));
      li.append(" ", b);
    }
    $("m-log").appendChild(li);
  }
  const who = id => dev(id).label;
  const describe = (msg, noReply) => `<strong>${esc(who(msg.from))}</strong> → ${msg.flood ? "everyone on the network (broadcast)" : esc(who(msg.path.at(-1)))}: <strong>${esc(msg.name)}</strong>. “${esc(msg.say)}”${noReply ? " <em>No reply came back.</em>" : ""}`;

  // ---------- applying engine events
  async function run(result) {
    state = result.state;
    for (const ev of result.events) {
      if (ev.type === "message") { logLine(describe(ev.msg), ev.id); await animateMessage(ev.id, ev.msg); updateDevices(); if (!selected || playing) inspect(ev.id); }
      else if (ev.type === "question") showQuestion(ev);
      else if (ev.type === "answer") showAnswer(ev);
      else if (ev.type === "tool") await showTool(ev);
      else if (ev.type === "workaround") logLine(`<span class="warnline">Workaround applied. It looks fixed for this PC, but is it really solved?</span>`);
      else if (ev.type === "goal") showRootCause(ev);
      else if (ev.type === "hint") showHint(ev);
      else if (ev.type === "complete") finish(ev);
    }
    updateDevices();
    updateControls();
  }

  // ---------- guided / practice
  async function stepOnce() {
    if (busy) return; busy = true;
    try { await run(engine.next(scenario, state)); } finally { busy = false; }
  }
  async function play() {
    playing = !playing; updateControls();
    while (playing && !state.complete && !state.pending) {
      await stepOnce();
      if (!reducedMotion) await wait(250 / speed);
    }
    playing = false; updateControls();
  }
  function showQuestion(q) {
    playing = false;
    $("m-task").innerHTML = `<div class="eyebrow">Predict the next step</div><p class="q">${esc(q.q)}</p>
      <div class="opts">${q.options.map((o, i) => `<button class="opt" data-a="${i}">${esc(o)}</button>`).join("")}</div><div id="m-fb"></div>`;
    $("m-task").querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => run(engine.answer(scenario, state, Number(b.dataset.a)))));
    $("m-task").querySelector(".opt")?.focus();
  }
  function showAnswer(ev) {
    const fb = root.querySelector("#m-fb");
    if (!fb) return;
    if (ev.correct) {
      root.querySelectorAll("#m-task .opt").forEach(b => b.disabled = true);
      fb.innerHTML = `<div class="feedback"><b class="ok">Correct.</b> ${esc(ev.why)}</div>${ev.id === "rootCause" ? "" : `<button class="btn brand" id="m-cont">Show me ›</button>`}`;
      root.querySelector("#m-cont")?.addEventListener("click", () => { taskIdle(); stepOnce(); });
      root.querySelector("#m-cont")?.focus();
    } else {
      fb.innerHTML = `<div class="feedback"><b class="no">Not quite.</b> ${ev.reveal ? `The answer is “${esc(root.querySelectorAll("#m-task .opt")[ev.correctIndex].textContent)}”. ${esc(ev.why)}` : "Have another look at the network and try again."}</div>`;
    }
  }
  function taskIdle() {
    const m = scenario.modes[state.mode];
    $("m-task").innerHTML = state.mode === "practice"
      ? `<div class="eyebrow">Practice</div><p>Press <strong>Step</strong> or <strong>Play</strong>. Before each message you'll predict what happens.</p>`
      : `<div class="eyebrow">Guided</div><p>${esc(m.intro)}</p><p class="muted" style="font-size:0.88rem">Steps: ${m.sequence.map(id => esc(scenario.messages[id].name.replace("DHCP ", ""))).join(" → ")}</p>`;
  }

  // ---------- challenge
  function challengePanel() {
    const m = scenario.modes.challenge;
    const groups = [...new Set(m.tools.map(t => t.kind))];
    $("m-task").innerHTML = `<div class="eyebrow">Your tools</div>
      ${groups.map(g => `<div class="tool-group"><h3 class="eyebrow">${esc(KIND_LABEL[g] || g)}</h3><div class="row">${m.tools.filter(t => t.kind === g).map(t => `<button class="chip" data-tool="${t.id}">${esc(t.label)}</button>`).join("")}</div></div>`).join("")}
      <pre class="evidence console" id="m-console" aria-live="polite">Waiting for your first command…</pre>
      <div id="m-findings"></div>
      <div class="row"><button class="link-btn" id="m-hint">Need a hint?</button></div><div id="m-hinttext"></div>
      <div id="m-rc"></div>`;
    $("m-task").querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", async () => {
      if (busy) return; busy = true;
      try { await run(engine.useTool(scenario, state, b.dataset.tool)); } finally { busy = false; }
    }));
    $("m-hint").addEventListener("click", () => run(engine.hint(scenario, state)));
  }
  async function showTool(ev) {
    $("m-console").textContent = `$ ${ev.tool.label}\n${ev.output}`;
    logLine(`You: <strong>${esc(ev.tool.label)}</strong>${ev.finding ? ` → ${esc(ev.finding)}` : ""}`);
    renderFindings();
    for (const p of ev.played) { logLine(describe(p.msg, ev.noReply), p.id); await animateMessage(p.id, p.msg, { noReply: ev.noReply }); updateDevices(); }
  }
  function renderFindings() {
    const box = root.querySelector("#m-findings");
    if (box) box.innerHTML = state.evidence.length ? `<h3 class="eyebrow">Evidence so far</h3><ul class="findings">${state.evidence.map(e => `<li>${esc(e.finding)}</li>`).join("")}</ul>` : "";
  }
  function showHint(ev) { $("m-hinttext").innerHTML = `<div class="feedback">${esc(ev.text)}</div>`; }
  function showRootCause(q) {
    $("m-rc").innerHTML = `<div class="rc"><div class="eyebrow">It works. Now justify it</div><p class="q">${esc(q.q)}</p>
      <div class="opts">${q.options.map((o, i) => `<button class="opt" data-rc="${i}">${esc(o)}</button>`).join("")}</div><div id="m-fb"></div></div>`;
    $("m-rc").querySelectorAll("[data-rc]").forEach(b => b.addEventListener("click", () => run(engine.answerRootCause(scenario, state, Number(b.dataset.rc)))));
  }

  // ---------- completion, controls, modes
  function finish(ev) {
    playing = false;
    const d = $("m-debrief");
    d.hidden = false;
    d.innerHTML = `<div class="eyebrow">Debrief</div><h2>${esc(scenario.modes[state.mode].label)} mode complete</h2><p>${esc(ev.debrief)}</p>
      ${state.mode === "challenge" ? `<p class="muted">Tools used: ${state.toolsUsed.length} · hints: ${state.hintsUsed} · wrong answers: ${state.mistakes}</p>` : ""}
      <div class="row">${modes.filter(([k]) => k !== state.mode).map(([k, m]) => `<button class="btn" data-goto="${k}">Try ${esc(m.label)} mode</button>`).join("")}<a class="btn ghost" href="#lesson-${esc(scenario.lesson)}">Related lesson</a></div>`;
    d.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.goto)));
    onComplete(state.mode);
    const tab = root.querySelector(`[data-mode="${state.mode}"]`);
    if (tab && !tab.textContent.startsWith("✓")) tab.prepend("✓ ");
  }
  function updateControls() {
    const guidedLike = state.mode !== "challenge";
    $("m-controls").hidden = !guidedLike;
    $("m-play").textContent = playing ? "❚❚ Pause" : state.complete ? "▶ Replay" : "▶ Play";
    $("m-step").disabled = state.complete || !!state.pending || playing;
    $("m-play").disabled = !!state.pending;
  }
  function setMode(k) {
    runId++; playing = false; selected = null;
    state = engine.start(scenario, k);
    root.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-selected", b.dataset.mode === k));
    root.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === k));
    $("m-intro").textContent = scenario.modes[k].intro;
    $("m-log").innerHTML = ""; $("m-debrief").hidden = true;
    $("m-inspect").innerHTML = `<h2>Inspect a message</h2><p class="muted">Click a moving packet or a line in the transcript to see what's inside it.</p>`;
    svg.querySelectorAll(".m-pkt").forEach(p => p.remove()); clearBubbles();
    drawTopology();
    k === "challenge" ? challengePanel() : taskIdle();
    if (k === "challenge") { bubble("pc", "I've got no internet!", "say"); logLine(`Start: the PC shows <code>${esc(state.devices.pc.ip)}</code> and the user can't reach anything.`); }
    updateControls();
  }

  root.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("m-play").addEventListener("click", () => { if (state.complete) setMode(state.mode); play(); });
  $("m-step").addEventListener("click", stepOnce);
  $("m-reset").addEventListener("click", () => setMode(state.mode));
  $("m-speed").addEventListener("change", e => { speed = Number(e.target.value); });
  setMode(mode);
  const ro = new ResizeObserver(() => {
    if (!root.isConnected) return ro.disconnect();
    if (chooseLayout().narrow !== L.narrow) { runId++; clearBubbles(); drawTopology(); }
  });
  ro.observe(root);
  return { setMode, get state() { return state; } };
}
