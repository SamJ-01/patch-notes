// Mission UI: draws a scenario, animates what the engine reports, and handles controls.
// Reusable pieces: device cards, links, animated packets, speech bubbles, an inspection panel,
// play/pause/step/replay/speed/reset controls and a text transcript of everything shown.
// Nothing here knows about a particular protocol: what devices say, how they look and how the
// challenge opens all come from the scenario's data. Geometry lives in layout.js; rules in engine.js.
import * as engine from "./engine.js";
import * as layout from "./layout.js";
import { HW } from "../hw.js";

const NS = "http://www.w3.org/2000/svg";
const { CARD } = layout;
const MARGIN = 14;  // space around the stage, in diagram units
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KIND_LABEL = { Investigate: "Investigate", Test: "Test", Fix: "Fix" };
// A mode with tools is a challenge (investigate and fix); one with a sequence plays messages in order.
const isToolMode = m => Array.isArray(m.tools);

// Hardware drawings come from the shared device library (static/js/hw.js), the same ones every diagram uses.
const STATE_WORDS = { ok: "working", bad: "problem", warn: "warning" };

export function mount(root, scenario, { mode = "guided", doneModes = [], next = null, onComplete = () => {}, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches } = {}) {
  let state, playing = false, speed = 1, details = false, selected = null, busy = false, runId = 0;
  const modes = Object.entries(scenario.modes);

  root.innerHTML = `<div class="mission">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Mission · ${esc(scenario.topic)} · ${scenario.minutes} min</div>
      <h1>${esc(scenario.title)}</h1><p>${esc(scenario.summary)}</p></div>
    <div class="row mode-tabs" role="group" aria-label="Mission mode">${modes.map(([k, m]) => `<button class="chip" data-mode="${k}" aria-pressed="false">${doneModes.includes(k) ? "✓ " : ""}${esc(m.label)} <span class="n">+${m.xp} XP</span></button>`).join("")}</div>
    <p class="mode-intro" id="m-intro"></p>
    <div class="mission-grid">
      <section class="panel stage" aria-labelledby="m-stage-title">
        <div class="stage-head"><span class="sim-tag">Simulation</span><span id="m-stage-title">Modelled in your browser. No real network traffic is sent or captured.</span></div>
        <div class="stage-box"><svg id="m-svg" role="group" aria-label="Network diagram: ${esc(Object.values(scenario.devices).map(d => d.label).join(", "))}"></svg><div class="bubbles" id="m-bubbles" aria-hidden="true"></div></div>
        <div class="row m-controls" id="m-controls">
          <button class="btn brand" id="m-play">▶ Play</button>
          <button class="btn" id="m-step">Step ›</button>
          <button class="btn ghost" id="m-reset">↺ Reset</button>
          <label class="m-speed">Speed <select id="m-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
        </div>
        <details class="tbl simplification"><summary>How this simulation differs from a real network</summary><p>${esc(scenario.simplification)} Nothing on this page sends real network traffic.</p></details>
      </section>
      <aside class="stack m-side">
        <section class="panel" id="m-task"></section>
        <section class="panel" id="m-inspect"></section>
      </aside>
    </div>
    <section class="panel m-mailview" id="m-mailview" hidden></section>
    <section class="panel m-logview" id="m-logview" hidden></section>
    <section class="panel"><h2>What happened (text version)</h2><ol class="transcript" id="m-log" aria-live="polite"></ol></section>
    <section class="panel debrief" id="m-debrief" hidden></section>
  </div>`;

  const $ = id => root.querySelector("#" + id);
  const svg = $("m-svg"), bubbles = $("m-bubbles");
  const dev = id => scenario.devices[id];
  // With reduced motion, nothing slides: Step is the main control and Play pauses on each message.
  if (reducedMotion) { $("m-step").classList.add("brand"); $("m-play").classList.remove("brand"); }
  let L, geo = {}, zones = [];  // current layout, card rectangles and network zones
  const center = id => layout.centerOf(scenario, L, id);
  const box = id => geo[id];
  const hasIp = id => layout.hasIp(scenario, id);
  const hasStatus = id => layout.hasStatus(scenario, id);
  const route = (a, b) => layout.route(center(a), center(b));
  const arrival = (from, to) => layout.arrivalRoute(route(from, to), box(to));

  // Real text measurement in the stage's own font.
  function measurer(cls) {
    const probe = document.createElementNS(NS, "text");
    probe.setAttribute("class", cls);
    svg.appendChild(probe);
    return { width: t => { probe.textContent = t; return probe.getComputedTextLength(); }, done: () => probe.remove() };
  }
  // Shrink a single line a little to fit, then cut it with an ellipsis as a last resort.
  function fit(el, text, maxW, minSize) {
    el.textContent = text;
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.getComputedTextLength() > maxW && size > minSize) { size -= 0.5; el.style.fontSize = size + "px"; }
    let t = text;
    while (t.length > 1 && el.getComputedTextLength() > maxW) { t = t.slice(0, -1); el.textContent = t.trimEnd() + "…"; }
  }

  // ---------- drawing
  function drawTopology() {
    L = layout.chooseLayout(scenario, root.clientWidth < 620);
    svg.setAttribute("viewBox", `${-MARGIN} ${-MARGIN} ${L.w + MARGIN * 2} ${L.h + MARGIN * 2}`);
    svg.innerHTML = "";
    const m = measurer("m-status");
    geo = layout.cardGeometry(scenario, L, m.width);
    m.done();
    zones = layout.zoneRects(scenario, L, geo);
    for (const z of zones) {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "m-zone");
      g.innerHTML = `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="14"/><text x="${z.x + 14}" y="${z.y + 17}">${esc(z.label)}</text>`;
      svg.appendChild(g);
    }
    for (const [a, b] of scenario.links) {
      const l = document.createElementNS(NS, "path");
      l.setAttribute("d", layout.roundedPath(route(a, b)));
      l.setAttribute("class", "m-link");
      l.setAttribute("aria-hidden", "true");
      svg.appendChild(l);
    }
    for (const id of Object.keys(scenario.devices)) {
      const b = box(id);
      let y = b.top;
      const artY = y + CARD.art / 2; y += CARD.art + CARD.gap;
      const nameY = y + CARD.name / 2; y += CARD.name;
      const ipY = y + CARD.ip / 2; if (hasIp(id)) y += CARD.ip;
      const statusY = y + CARD.statusGap;
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `m-dev kind-${dev(id).kind}`);
      g.setAttribute("id", "dev-" + id);
      g.setAttribute("role", "img");
      g.innerHTML = `<rect class="m-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12"/>
        <g class="hw hw-k-${dev(id).kind}" transform="translate(${b.cx},${artY})">${HW[dev(id).kind] || ""}</g>
        <text class="m-name" x="${b.cx}" y="${nameY}" text-anchor="middle" dominant-baseline="central"></text>
        ${hasStatus(id) ? `<circle class="m-dot" cx="${b.x + b.w - 16}" cy="${b.y + 16}" r="4"/>` : ""}
        ${hasIp(id) ? `<text class="m-ip" x="${b.cx}" y="${ipY}" text-anchor="middle" dominant-baseline="central"><tspan class="m-k">IP</tspan><tspan class="m-v" dx="7"></tspan></text>` : ""}
        ${hasStatus(id) ? `<text class="m-status" x="${b.cx}" y="${statusY}" text-anchor="middle"></text>` : ""}`;
      svg.appendChild(g);
      fit(g.querySelector(".m-name"), dev(id).label, b.w - CARD.pad * 2, 12);
    }
    updateDevices();
  }
  function updateDevices() {
    const looks = engine.appearance(scenario, state.devices);
    for (const [id, d] of Object.entries(state.devices)) {
      const g = svg.querySelector("#dev-" + id); if (!g) continue;
      const b = box(id), room = b.w - CARD.pad * 2;
      const ip = g.querySelector(".m-v");
      if (ip) fit(ip, d.ip || "—", room - 24, 11);
      const st = g.querySelector(".m-status");
      if (st) {
        const lines = layout.wrapLines(d.status || "", room, t => { st.textContent = t; return st.getComputedTextLength(); }, b.lines);
        const x = st.getAttribute("x"), y0 = parseFloat(st.getAttribute("y"));
        st.innerHTML = lines.map((t, i) => `<tspan x="${x}" y="${y0 + CARD.line / 2 + i * CARD.line}" dominant-baseline="central">${esc(t)}</tspan>`).join("");
      }
      for (const s of Object.keys(STATE_WORDS)) g.classList.toggle(s, looks[id] === s);
      // Screen readers get the whole card as one sentence.
      g.setAttribute("aria-label", [d.label || dev(id).label, d.ip && `IP ${d.ip}`, d.status, STATE_WORDS[looks[id]]].filter(Boolean).join(", "));
    }
  }

  // ---------- speech bubbles (placement rules in layout.placeBubble)
  function bubble(id, text, tone = "") {
    const d = box(id);
    const b = document.createElement("div");
    b.className = `bubble ${tone}`;
    b.textContent = text;
    bubbles.appendChild(b);
    const area = bubbles.getBoundingClientRect(), k = area.width / (L.w + MARGIN * 2);
    const px = v => (v + MARGIN) * k;
    const rectOf = g => ({ l: px(g.x), t: px(g.y), r: px(g.x + g.w), b: px(g.y + g.h) });
    const obstacles = [...Object.values(geo).map(rectOf), ...zones.map(z => rectOf(z.labelBox)),
      ...[...bubbles.children].filter(o => o !== b).map(o => ({ l: o.offsetLeft, t: o.offsetTop, r: o.offsetLeft + o.offsetWidth, b: o.offsetTop + o.offsetHeight }))];
    const spot = layout.placeBubble({ w: b.offsetWidth, h: b.offsetHeight }, rectOf(d), obstacles, { width: area.width, height: area.height });
    b.classList.add(spot.side);
    b.style.left = `${spot.x}px`;
    b.style.top = `${spot.y}px`;
    b.style.setProperty("--tail", `${spot.tail}px`);
    return b;
  }
  const clearBubbles = () => { bubbles.innerHTML = ""; };
  // A reaction is either plain text or { text, tone }: "quiet" for bystanders that ignore a message.
  const reaction = r => (typeof r === "string" ? { text: r, tone: "" } : { text: r.text, tone: r.tone || "" });

  // ---------- packet animation
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function packet(msg, msgId) {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "m-pkt");
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `Inspect ${msg.name}`);
    g.innerHTML = `<rect x="-50" y="-13" width="100" height="26" rx="5"/><text x="0" y="5" text-anchor="middle">${esc(msg.short || msg.name)}</text>`;
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
  async function animateMessage(id, msg, { noReply = false } = {}) {
    const token = runId;
    const ms = 980 / speed;  // packet travel time; slower so each step is easy to follow
    svg.querySelectorAll(".m-pkt").forEach(p => p.remove());
    clearBubbles();
    bubble(msg.from, msg.say, "say");
    svg.querySelector("#dev-" + msg.from)?.classList.add("talk");
    const p = packet(msg, id);
    const start = center(msg.path[0]);
    p.setAttribute("transform", `translate(${start.x},${start.y})`);
    for (let i = 1; i < msg.path.length; i++) {
      const last = i === msg.path.length - 1 && !msg.flood;
      await move(p, last ? arrival(msg.path[i - 1], msg.path[i]) : route(msg.path[i - 1], msg.path[i]), ms, token);
    }
    const hubId = msg.path[msg.path.length - 1], hub = center(hubId);
    // A switch floods broadcasts out of every other port: one copy per destination.
    const copies = (msg.flood || []).map((to, i) => { const c = i === 0 ? p : packet(msg, id); c.setAttribute("transform", `translate(${hub.x},${hub.y})`); return [c, to]; });
    await Promise.all(copies.map(([c, to]) => move(c, arrival(hubId, to), ms, token)));
    if (token !== runId) return;
    // Delivered packets fade away so they never sit on top of a card or its label.
    svg.querySelectorAll(".m-pkt").forEach(c => c.classList.add("arrived"));
    svg.querySelector("#dev-" + msg.from)?.classList.remove("talk");
    if (noReply) bubble((msg.flood || msg.path.slice(-1))[0], "… (no answer)", "quiet");
    else Object.entries(msg.reactions || {}).forEach(([who, r]) => { const { text, tone } = reaction(r); bubble(who, text, tone); });
    if (!reducedMotion) await wait(700 / speed);
  }

  // ---------- inspector + transcript
  function inspectIdle() {
    $("m-inspect").innerHTML = `<h2>Inspect a message</h2><p class="muted">Select a moving packet, or “inspect” on any line of the text version below, to see what's inside a message.</p>`;
  }
  function inspect(id) {
    selected = id;
    const msg = scenario.messages[id];
    const fields = msg.fields.filter(f => details || f.level === 1);
    $("m-inspect").innerHTML = `<div class="panel-title"><h2>${esc(msg.name)}</h2><label class="m-toggle"><input type="checkbox" id="m-details" ${details ? "checked" : ""}> Protocol details</label></div>
      <p>${esc(msg.explain)}</p>
      <dl class="fields">${fields.map(f => `<div><dt>${esc(f.name)}</dt><dd><code>${esc(f.value)}</code><span>${esc(f.explain)}</span></dd></div>`).join("")}</dl>
      ${details ? wiresharkView(msg) : `<p class="muted" style="font-size:0.85rem">${msg.fields.length - fields.length} more technical fields${msg.wireshark ? ", and how this message looks in Wireshark" : ""}: tick “Protocol details”.</p>`}`;
    $("m-details").addEventListener("change", e => { details = e.target.checked; inspect(id); $("m-details").focus(); });
  }
  // The advanced layer: the same message as Wireshark's packet list and packet details would show it,
  // one protocol layer per row. Clearly labelled as an illustration, with a safe way to see the real thing.
  function wiresharkView(msg) {
    const w = msg.wireshark, meta = scenario.wireshark || {};
    if (!w) return "";
    const layer = l => `<li><code class="ws-line">${esc(l.line)}</code>${l.note ? `<p>${esc(l.note)}</p>` : ""}
      ${l.children?.length ? `<ul class="ws-children">${l.children.map(c => `<li><code>${esc(c)}</code></li>`).join("")}</ul>` : ""}</li>`;
    return `<section class="ws" aria-labelledby="ws-title">
      <div class="ws-head"><span class="sim-tag">Illustration</span><h3 id="ws-title">What you'd see in Wireshark</h3></div>
      ${meta.filter ? `<p class="ws-filter">Display filter <code>${esc(meta.filter)}</code>${meta.filterNote ? ` <span class="muted">${esc(meta.filterNote)}</span>` : ""}</p>` : ""}
      <h4 class="eyebrow">Packet list</h4>
      <dl class="ws-row"><div><dt>Source</dt><dd><code>${esc(w.src)}</code></dd></div><div><dt>Destination</dt><dd><code>${esc(w.dst)}</code></dd></div>
        <div><dt>Protocol</dt><dd><code>${esc(w.protocol)}</code></dd></div><div class="wide"><dt>Info</dt><dd><code>${esc(w.info)}</code></dd></div></dl>
      <h4 class="eyebrow">Packet details, outermost layer first</h4>
      <ol class="ws-tree">${w.layers.map(layer).join("")}</ol>
      ${meta.honesty ? `<p class="ws-note">${esc(meta.honesty)}</p>` : ""}
      ${meta.tryIt ? `<details class="tbl"><summary>See it for real</summary><p class="ws-note">${esc(meta.tryIt)}</p></details>` : ""}
    </section>`;
  }
  function logLine(html, msgId) {
    const li = document.createElement("li");
    li.innerHTML = html;
    if (msgId) {
      const b = document.createElement("button");
      b.className = "link-btn"; b.textContent = "inspect";
      b.setAttribute("aria-label", `Inspect ${scenario.messages[msgId].name}`);
      b.addEventListener("click", () => inspect(msgId));
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
      else if (ev.type === "log") showLog(ev);
      else if (ev.type === "email") showEmail(ev);
      else if (ev.type === "workaround") logLine(`<span class="warnline">Workaround applied. It looks fixed for this device, but is it really solved?</span>`);
      else if (ev.type === "goal") showRootCause(ev);
      else if (ev.type === "evidenceCheck") showEvidenceCheck(ev);
      else if (ev.type === "evidenceResult") showEvidenceResult(ev);
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
      // Without motion there's nothing to watch between messages, so pause long enough to read each one.
      await wait((reducedMotion ? 2500 : 350) / speed);
    }
    playing = false; updateControls();
  }
  function showQuestion(q) {
    playing = false;
    $("m-task").innerHTML = `<div class="eyebrow">Predict the next step</div><p class="q">${esc(q.q)}</p>
      <div class="opts">${q.options.map((o, i) => `<button class="opt" data-a="${i}">${esc(o)}</button>`).join("")}</div><div id="m-fb" aria-live="polite"></div>`;
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
    $("m-task").innerHTML = m.checkpoints
      ? `<div class="eyebrow">${esc(m.label)}</div><p>Press <strong>Step</strong> or <strong>Play</strong>. Before each message you'll predict what happens.</p>`
      : `<div class="eyebrow">${esc(m.label)}</div><p>${esc(m.intro)}</p><p class="muted" style="font-size:0.88rem">Steps: ${m.sequence.map(id => esc(scenario.messages[id].short || scenario.messages[id].name)).join(" → ")}</p>`;
  }

  // ---------- challenge
  function challengePanel() {
    const m = scenario.modes[state.mode];
    const groups = [...new Set(m.tools.map(t => t.kind))];
    $("m-task").innerHTML = `<div class="eyebrow">Your tools</div>${scenario.emails ? `<div class="tool-group"><h3 class="eyebrow">Reported emails</h3><div class="row"><button class="chip" type="button" id="m-tomail">Inspect ${scenario.emails.items.length} emails ↓</button></div></div>` : ""}${scenario.log ? `<div class="tool-group"><h3 class="eyebrow">Logs</h3><div class="row"><button class="chip" type="button" id="m-tolog">Search ${esc(scenario.log.name)} ↓</button></div></div>` : ""}
      ${groups.map(g => `<div class="tool-group"><h3 class="eyebrow">${esc(KIND_LABEL[g] || g)}</h3><div class="row">${m.tools.filter(t => t.kind === g).map(t => `<button class="chip" data-tool="${t.id}">${esc(t.label)}</button>`).join("")}</div></div>`).join("")}
      <div class="console-head" id="m-console-label"><span class="sim-tag">Simulated output</span><span>Scripted results that mirror real tools. Nothing runs on your computer.</span></div>
      <pre class="evidence console" id="m-console" tabindex="0" aria-live="polite" aria-labelledby="m-console-label">Waiting for your first command…</pre>
      <div id="m-findings"></div>
      <div class="row"><button class="link-btn" id="m-hint">Need a hint?</button></div><div id="m-hinttext" aria-live="polite"></div>
      <div id="m-rc"></div>`;
    $("m-task").querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", async () => {
      if (busy) return; busy = true;
      try { await run(engine.useTool(scenario, state, b.dataset.tool)); } finally { busy = false; }
    }));
    $("m-hint").addEventListener("click", () => run(engine.hint(scenario, state)));
    $("m-tomail")?.addEventListener("click", () => { $("m-mailview").scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" }); $("m-mailview").querySelector("[data-email]")?.focus({ preventScroll: true }); });
    $("m-tolog")?.addEventListener("click", () => { $("m-logview").scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" }); $("m-logq").focus({ preventScroll: true }); });
  }
  async function showTool(ev) {
    $("m-console").textContent = `$ ${ev.tool.label}\n${ev.output}`;
    logLine(`You: <strong>${esc(ev.tool.label)}</strong>${ev.finding ? ` → ${esc(ev.finding)}` : ""}`);
    renderFindings();
    for (const p of ev.played) { logLine(describe(p.msg, ev.noReply), p.id); await animateMessage(p.id, p.msg, { noReply: ev.noReply }); updateDevices(); }
  }
  // ---------- log viewer (challenge modes of scenarios with a log): search it like grep
  const markTerms = (line, terms) => {
    let html = esc(line);
    for (const t of terms) html = html.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
    return html;
  };
  function drawLog(lines, terms = []) {
    $("m-logout").innerHTML = lines.length ? lines.map(l => markTerms(l, terms)).join("\n") : "No lines match. Check the spelling, or try fewer words.";
  }
  function logViewer() {
    const v = $("m-logview"), on = isToolMode(scenario.modes[state.mode]) && !!scenario.log;
    v.hidden = !on; if (!on) return;
    const log = scenario.log;
    v.innerHTML = `<div class="panel-title"><h2>Log viewer: <span class="mono">${esc(log.name)}</span></h2><span class="sim-tag">Simulated log</span></div>
      <p class="muted" style="margin:0">${esc(log.intro)}</p>
      <form class="row log-search" id="m-logform" role="search"><label class="sr-only" for="m-logq">Search the log</label>
        <input type="search" id="m-logq" placeholder="Search like grep: a word, a user or an IP" autocomplete="off" spellcheck="false">
        <button class="btn brand" type="submit">Search</button><button class="btn ghost" type="button" id="m-logall">Show all</button></form>
      <p class="muted log-count" id="m-logcount" aria-live="polite">Showing all ${log.lines.length} lines.</p>
      <pre class="evidence console log-out" id="m-logout" tabindex="0" aria-labelledby="m-logcount"></pre>`;
    drawLog(log.lines);
    $("m-logform").addEventListener("submit", e => { e.preventDefault(); run(engine.searchLog(scenario, state, $("m-logq").value)); });
    $("m-logall").addEventListener("click", () => { $("m-logq").value = ""; run(engine.searchLog(scenario, state, "")); });
  }
  function showLog(ev) {
    const terms = ev.query ? ev.query.split(" ") : [];
    drawLog(ev.lines, terms);
    $("m-logcount").textContent = ev.query ? `${ev.lines.length} of ${ev.total} lines contain “${ev.query}”.` : `Showing all ${ev.total} lines. Search to narrow it down.`;
    if (ev.query) logLine(`You searched the log for <strong>${esc(ev.query)}</strong>: ${ev.lines.length} line${ev.lines.length === 1 ? "" : "s"}${ev.found.length ? ` → ${ev.found.map(esc).join(" ")}` : ""}`);
    renderFindings();
  }
  // ---------- email inspector (challenge modes of scenarios with reported emails): read headers as pictures
  function emailViewer() {
    const v = $("m-mailview"), on = isToolMode(scenario.modes[state.mode]) && !!scenario.emails;
    v.hidden = !on; if (!on) return;
    v.innerHTML = `<div class="panel-title"><h2>Reported emails</h2><span class="sim-tag">Simulated email</span></div>
      <p class="muted" style="margin:0">${esc(scenario.emails.intro)}</p>
      <div class="row mail-tabs" role="group" aria-label="Choose a reported email">${scenario.emails.items.map(e => `<button class="chip" type="button" data-email="${esc(e.id)}" aria-pressed="false">${esc(e.label)} <span class="n">${esc(e.reportedBy)}</span></button>`).join("")}</div>
      <div id="m-mail" aria-live="polite"><p class="muted">Pick an email above to inspect it.</p></div>`;
    v.querySelectorAll("[data-email]").forEach(b => b.addEventListener("click", () => run(engine.inspectEmail(scenario, state, b.dataset.email))));
  }
  const RESULT_TONE = { pass: "ok", fail: "bad", softfail: "warn", neutral: "warn", none: "warn", temperror: "warn", permerror: "bad" };
  // The domain part of an address, set apart in a fixed-width font so a 1 and an l look different.
  const showAddr = a => a.domain ? `${esc(a.address.slice(0, -a.domain.length))}<b class="mail-domain">${esc(a.domain)}</b>` : esc(a.address);
  const hostAt = l => (l.real ? l.href.toLowerCase().indexOf(l.real) : -1);
  const outside = d => d !== scenario.emails.org && !d.endsWith("." + scenario.emails.org);
  function showEmail(ev) {
    const { email: e, parsed: h, links } = ev, auth = h.auth;
    $("m-mailview").querySelectorAll("[data-email]").forEach(b => b.setAttribute("aria-pressed", b.dataset.email === e.id));
    const reply = h.replyTo && h.replyTo.address.toLowerCase() !== h.from.address.toLowerCase()
      ? `<p class="mail-row warn"><span class="mail-k">Replies go to</span><span class="mono">${showAddr(h.replyTo)}</span><span class="tag">not the From address</span></p>` : "";
    const verdict = (k, label, what) => { const r = auth[k]; return `<li class="mail-check ${RESULT_TONE[r.result] || "warn"}"><b>${label}</b><span class="mail-res">${esc(r.result)}</span><span class="muted">${esc(what)}</span>${r.detail ? `<code>${esc(r.detail)}</code>` : ""}</li>`; };
    const hops = h.received.map(r => `<li><span class="mail-hop ${outside(r.rdns || r.helo) ? "out" : "in"}"><b>${esc(r.rdns || r.helo || "unknown")}</b><span class="mono">${esc(r.ip)}</span><span class="tag">${outside(r.rdns || r.helo) ? "outside" : "your network"}</span></span><span class="mail-arrow" aria-hidden="true">→</span><span class="mail-hop in"><b>${esc(r.by)}</b><span class="tag">your server</span></span></li>`).join("");
    const linkRows = links.length ? `<ul class="mail-links">${links.map(l => `<li class="${l.mismatch ? "bad" : ""}"><span class="mail-k">Link says</span><span class="mono">${esc(l.text)}</span><span class="mail-k">Really goes to</span><span class="mono">${hostAt(l) >= 0 ? `${esc(l.href.slice(0, hostAt(l)))}<b class="mail-domain">${esc(l.href.slice(hostAt(l), hostAt(l) + l.real.length))}</b>${esc(l.href.slice(hostAt(l) + l.real.length))}` : esc(l.href)}</span>${l.mismatch ? `<span class="tag no">doesn't match the text</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">No links.</p>`;
    $("m-mail").innerHTML = `<article class="mail-card">
      <header><div class="eyebrow">Reported by ${esc(e.reportedBy)} · found in ${esc(e.folder)}</div><h3>${esc(h.subject)}</h3>${e.note ? `<p class="mail-note">${esc(e.note)}</p>` : ""}</header>
      <section><h4 class="eyebrow">Who sent it</h4>
        <p class="mail-row"><span class="mail-k">Name shown</span><span class="mail-name">${esc(h.from.name || "(none)")}</span><span class="muted">anyone can type any name</span></p>
        <p class="mail-row"><span class="mail-k">Real address</span><span class="mono">${showAddr(h.from)}</span><span class="tag ${outside(h.from.domain) ? "" : "watch"}">${outside(h.from.domain) ? "outside the firm" : "claims to be from the firm"}</span></p>${reply}</section>
      <section><h4 class="eyebrow">How it reached you</h4><ol class="mail-route">${hops}</ol></section>
      <section><h4 class="eyebrow">${esc(h.received.at(-1)?.by || "Your server")}'s checks</h4><ul class="mail-checks">
        ${verdict("spf", "SPF", "Was the sending server allowed to send for this domain?")}${verdict("dkim", "DKIM", "Was it signed by the domain, unchanged?")}${verdict("dmarc", "DMARC", "Does the From domain match what SPF or DKIM proved?")}</ul>
        <p class="muted mail-fine">Passing proves which domain sent it, not that the domain is honest.</p></section>
      <section><h4 class="eyebrow">The message</h4><div class="mail-body">${esc(e.body)}</div>${linkRows}</section>
      <details class="tbl"><summary>Raw headers</summary><pre class="evidence console mail-raw" tabindex="0">${esc(e.headers)}</pre></details></article>`;
    logLine(`You inspected <strong>${esc(e.label)}</strong> (reported by ${esc(e.reportedBy)})${ev.found.length ? ` → ${ev.found.map(esc).join(" ")}` : ""}`);
    renderFindings();
  }
  function renderFindings() {
    const box = root.querySelector("#m-findings");
    if (box) box.innerHTML = state.evidence.length ? `<h3 class="eyebrow">Evidence so far</h3><ul class="findings">${state.evidence.map(e => `<li>${esc(e.finding)}</li>`).join("")}</ul>` : "";
  }
  function showHint(ev) { $("m-hinttext").innerHTML = `<div class="feedback">${esc(ev.text)}</div>`; }
  function showRootCause(q) {
    $("m-rc").innerHTML = `<div class="rc"><div class="eyebrow">It works. Now justify it</div><p class="q">${esc(q.q)}</p>
      <div class="opts">${q.options.map((o, i) => `<button class="opt" data-rc="${i}">${esc(o)}</button>`).join("")}</div><div id="m-fb" aria-live="polite"></div></div>`;
    $("m-rc").querySelectorAll("[data-rc]").forEach(b => b.addEventListener("click", () => run(engine.answerRootCause(scenario, state, Number(b.dataset.rc)))));
    $("m-rc").querySelector(".opt")?.focus();
  }
  // After the right answer, the learner shows why: tick the evidence that supports it.
  function showEvidenceCheck(ev) {
    const box = document.createElement("div");
    box.className = "ev";
    box.innerHTML = `<fieldset class="ev-set"><legend class="q">${esc(ev.q)}</legend>
      ${ev.items.map((it, i) => `<div class="ev-item" id="m-ev-${i}"><label><input type="checkbox" value="${i}"><span>${esc(it.text)}</span></label>
        ${it.tool && state.toolsUsed.includes(it.tool) ? `<span class="tag">you ran the related check</span>` : ""}<p class="ev-why" hidden></p></div>`).join("")}
      </fieldset>
      <div class="row"><button class="btn brand" id="m-ev-go">Check my reasoning</button></div><div id="m-ev-fb" aria-live="polite"></div>`;
    $("m-rc").querySelector(".rc").appendChild(box);
    $("m-ev-go").addEventListener("click", () => {
      const chosen = [...box.querySelectorAll("input:checked")].map(i => Number(i.value));
      run(engine.answerEvidence(scenario, state, chosen));
    });
    box.querySelector("input")?.focus();
  }
  function showEvidenceResult(ev) {
    for (const r of ev.items) {
      const el = $(`m-ev-${r.index}`), why = el.querySelector(".ev-why");
      el.classList.toggle("right", r.ok);
      el.classList.toggle("wrong", !r.ok);
      const verdict = r.ok
        ? (r.supports ? (r.selected ? "Supports it." : "Supports it, but optional.") : "Right to leave out.")
        : (r.supports ? "Missed: this is key evidence." : "Not evidence for this.");
      why.innerHTML = `<b>${verdict}</b> ${esc(r.why)}`;
      why.hidden = false;
    }
    const wrong = ev.items.filter(r => !r.ok).length;
    $("m-ev-fb").innerHTML = ev.pass
      ? `<div class="feedback"><b class="ok">Your reasoning holds up.</b> Every piece you ticked supports the diagnosis, and you left out what doesn't.</div>`
      : `<div class="feedback"><b class="no">${wrong === 1 ? "One choice needs" : `${wrong} choices need`} another look.</b> Read the notes under each item, change your ticks, then check again.</div>`;
    if (ev.pass) { $("m-rc").querySelectorAll(".ev input, #m-ev-go").forEach(i => i.disabled = true); }
  }

  // ---------- completion, controls, modes
  function finish(ev) {
    playing = false;
    const d = $("m-debrief");
    d.hidden = false;
    d.innerHTML = `<div class="eyebrow">Debrief</div><h2 tabindex="-1" id="m-debrief-title">${esc(scenario.modes[state.mode].label)} mode complete</h2><p>${esc(ev.debrief)}</p>
      ${isToolMode(scenario.modes[state.mode]) ? `<p class="muted">Tools used: ${state.toolsUsed.length} · hints: ${state.hintsUsed} · wrong answers: ${state.mistakes}${state.evidenceTries ? ` · reasoning checked ${state.evidenceTries === 1 ? "first time" : `in ${state.evidenceTries} tries`}` : ""}</p>` : ""}
      <div class="row">${next ? `<a class="btn brand" href="#mission-${esc(next.id)}">Next mission: ${esc(next.title)}</a>` : ""}${modes.filter(([k]) => k !== state.mode).map(([k, m]) => `<button class="btn" data-goto="${k}">Try ${esc(m.label)} mode</button>`).join("")}<a class="btn ghost" href="#lesson-${esc(scenario.lesson)}">Related lesson</a></div>`;
    d.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.goto)));
    onComplete(state.mode);
    const tab = root.querySelector(`[data-mode="${state.mode}"]`);
    if (tab && !tab.textContent.startsWith("✓")) tab.prepend("✓ ");
    // Tool modes finish after a question in the side panel, so move focus to the result.
    if (isToolMode(scenario.modes[state.mode])) $("m-debrief-title").focus();
  }
  function updateControls() {
    $("m-controls").hidden = isToolMode(scenario.modes[state.mode]);
    $("m-play").textContent = playing ? "❚❚ Pause" : state.complete ? "▶ Replay" : "▶ Play";
    $("m-step").disabled = state.complete || !!state.pending || playing;
    $("m-play").disabled = !!state.pending;
  }
  function setMode(k) {
    runId++; playing = false; selected = null;
    state = engine.start(scenario, k);
    const m = scenario.modes[k];
    root.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === k));
    $("m-intro").textContent = m.intro;
    $("m-log").innerHTML = ""; $("m-debrief").hidden = true;
    inspectIdle();
    svg.querySelectorAll(".m-pkt").forEach(p => p.remove()); clearBubbles();
    drawTopology();
    isToolMode(m) ? challengePanel() : taskIdle();
    emailViewer();
    logViewer();
    if (m.opening) { bubble(m.opening.device, m.opening.say, "say"); logLine(esc(engine.fill(m.opening.log, state.devices))); }
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
    if (layout.chooseLayout(scenario, root.clientWidth < 620).narrow !== L.narrow) { runId++; clearBubbles(); drawTopology(); }
  });
  ro.observe(root);
  return { setMode, get state() { return state; } };
}
