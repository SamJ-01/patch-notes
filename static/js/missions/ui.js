// Mission UI: draws a scenario, animates what the engine reports, and handles controls.
// Reusable pieces: device boxes, links, animated packets, speech bubbles, an inspection panel,
// play/pause/step/replay/speed/reset controls and a text transcript of everything shown.
import * as engine from "./engine.js";

const NS = "http://www.w3.org/2000/svg";
// Wide layout uses each device's x/y; narrow screens use the scenario's portrait layout if it has one.
const WIDE = { w: 680, h: 320, dw: 172 };
// Card spacing: padding, hardware drawing, gaps and the height of each text row. Stage margin around it all.
const CARD = { pad: 16, art: 46, gap: 10, name: 20, ip: 20, statusGap: 6, line: 16 };
const MARGIN = 14;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  let L;  // current layout: { w, h, dw, pos?, narrow }
  const chooseLayout = () => {
    const narrow = scenario.narrow && root.clientWidth < 620;
    return narrow ? { ...scenario.narrow, narrow: true } : { ...WIDE, ...(scenario.wide || {}), narrow: false };
  };
  const center = id => L.pos ? { x: L.pos[id][0], y: L.pos[id][1] } : { x: dev(id).x, y: dev(id).y };

  // ---------- card geometry
  // Each device is a card: a drawing of the hardware, its name, its IP, then its status, wrapped onto
  // as many lines as the longest status it will ever show needs. Cards with details on the same row share
  // a height so their edges line up, and the content sits in the vertical middle.
  let geo = {};
  const box = id => geo[id];
  const hasIp = id => "ip" in dev(id);
  const hasStatus = id => Boolean(dev(id).status) || dev(id).kind === "server" || dev(id).kind === "pc";
  // Every status text a device can show in this scenario, so its card is sized once and never jumps.
  function statusTexts(id) {
    const out = new Set([dev(id).status || ""]);
    if (dev(id).kind === "server") out.add("Service stopped");
    const walk = o => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) k === `${id}.status` && typeof v === "string" ? out.add(v) : walk(v);
    };
    walk(scenario.messages); walk(scenario.modes);
    return [...out];
  }
  // Break text into lines no wider than maxW, measured in the real font. Over maxLines, the last line gets "…".
  function wrap(probe, text, maxW, maxLines = 3) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = [];
    let line = "";
    const width = t => { probe.textContent = t; return probe.getComputedTextLength(); };
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (!line || width(next) <= maxW) line = next; else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1] + "…";
      while (last.length > 1 && width(last) > maxW) last = last.slice(0, -2) + "…";
      lines[maxLines - 1] = last;
    }
    return lines;
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
  function measure() {
    const probe = document.createElementNS(NS, "text");
    probe.setAttribute("class", "m-status");
    svg.appendChild(probe);
    const inner = L.dw - CARD.pad * 2;
    const content = {};
    for (const id of Object.keys(scenario.devices)) {
      const lines = hasStatus(id) ? Math.max(1, ...statusTexts(id).map(t => wrap(probe, t, inner).length)) : 0;
      content[id] = { lines, h: CARD.art + CARD.gap + CARD.name + (hasIp(id) ? CARD.ip : 0) + (lines ? CARD.statusGap + lines * CARD.line : 0) };
    }
    probe.remove();
    geo = {};
    for (const id of Object.keys(scenario.devices)) {
      const c = center(id);
      const detailed = o => hasIp(o) || hasStatus(o);  // name-only devices (a switch) keep a compact card
      const rowH = detailed(id) ? Math.max(...Object.keys(scenario.devices).filter(o => center(o).y === c.y && detailed(o)).map(o => content[o].h)) : content[id].h;
      const h = rowH + CARD.pad * 2;
      geo[id] = { x: c.x - L.dw / 2, y: c.y - h / 2, w: L.dw, h, cx: c.x, cy: c.y, top: c.y - content[id].h / 2, lines: content[id].lines };
    }
  }

  // ---------- hardware drawings, centred on (0,0) in a 64×46 frame
  const HW = {
    pc: `<rect class="hw-body" x="-31" y="-21" width="44" height="31" rx="3"/><rect class="hw-screen" x="-28" y="-18" width="38" height="24" rx="1.5"/>
      <path class="hw-line" d="M-9 10v5M-17 16h16"/><rect class="hw-body" x="18" y="-21" width="14" height="37" rx="2"/>
      <circle class="hw-led" cx="25" cy="-15" r="1.6"/><path class="hw-line" d="M21-8h8M21-4h8"/>`,
    switch: `<rect class="hw-body" x="-32" y="-11" width="64" height="22" rx="3"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle class="hw-led" cx="${-24.5 + i * 7}" cy="-5" r="1.1"/><rect class="hw-port" x="${-27 + i * 7}" y="-1" width="5" height="6" rx="0.8"/>`).join("")}`,
    router: `<path class="hw-line" d="M-17-3l-5-17M17-3l5-17"/><circle class="hw-tip" cx="-22" cy="-20" r="2"/><circle class="hw-tip" cx="22" cy="-20" r="2"/>
      <rect class="hw-body" x="-29" y="-3" width="58" height="18" rx="5"/>
      ${[0, 1, 2, 3].map(i => `<circle class="hw-led" cx="${-19 + i * 7}" cy="6" r="1.4"/>`).join("")}<path class="hw-line" d="M12 6h10"/>`,
    server: `<rect class="hw-body" x="-17" y="-22" width="34" height="44" rx="3"/>
      ${[0, 1, 2].map(i => `<rect class="hw-port" x="-12" y="${-17 + i * 10}" width="24" height="7" rx="1"/><circle class="hw-led" cx="8" cy="${-13.5 + i * 10}" r="1.2"/>`).join("")}
      <path class="hw-line" d="M-10 16h20M-10 19h20"/>`,
  };

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
    measure();
    for (const [a, b] of scenario.links) {
      const l = document.createElementNS(NS, "path");
      l.setAttribute("d", roundedPath(route(a, b)));
      l.setAttribute("class", "m-link");
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
      g.innerHTML = `<rect class="m-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12"/>
        <g class="hw" transform="translate(${b.cx},${artY})">${HW[dev(id).kind] || ""}</g>
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
    for (const [id, d] of Object.entries(state.devices)) {
      const g = svg.querySelector("#dev-" + id); if (!g) continue;
      const b = box(id), room = b.w - CARD.pad * 2;
      const ip = g.querySelector(".m-v");
      if (ip) fit(ip, d.ip || "—", room - 24, 11);
      const st = g.querySelector(".m-status");
      if (st) {
        const status = d.kind === "server" && d.service === "stopped" && state.mode !== "challenge" ? "Service stopped" : d.status || "";
        const lines = wrap(st, status, room, b.lines);
        const x = st.getAttribute("x"), y0 = parseFloat(st.getAttribute("y"));
        st.innerHTML = lines.map((t, i) => `<tspan x="${x}" y="${y0 + CARD.line / 2 + i * CARD.line}" dominant-baseline="central">${esc(t)}</tspan>`).join("");
      }
      g.classList.toggle("ok", id === "pc" && /^192\.168\./.test(d.ip || ""));
      g.classList.toggle("bad", id === "pc" && /^169\.254\./.test(d.ip || ""));
      g.classList.toggle("down", d.kind === "server" && d.service === "stopped" && state.mode !== "challenge");
    }
  }

  // ---------- speech bubbles
  // Each bubble tries above, below, right and left of its device and takes the first spot that's
  // inside the stage and clear of every card and every other bubble. A tail points at the speaker.
  function bubble(id, text, tone = "") {
    const d = box(id);
    const b = document.createElement("div");
    b.className = `bubble ${tone}`;
    b.textContent = text;
    bubbles.appendChild(b);
    const area = bubbles.getBoundingClientRect(), k = area.width / (L.w + MARGIN * 2);
    const px = v => (v + MARGIN) * k;
    const rectOf = g => ({ l: px(g.x), t: px(g.y), r: px(g.x + g.w), b: px(g.y + g.h) });
    const D = rectOf(d), cx = px(d.cx), cy = px(d.cy), gap = 12, edge = 6;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    const clampX = x => Math.max(edge, Math.min(area.width - bw - edge, x));
    const spots = [
      { side: "above", x: clampX(cx - bw / 2), y: D.t - bh - gap },
      { side: "below", x: clampX(cx - bw / 2), y: D.b + gap },
      { side: "right", x: D.r + gap, y: cy - bh / 2 },
      { side: "left", x: D.l - bw - gap, y: cy - bh / 2 },
    ];
    const others = [...Object.values(geo).map(rectOf),
      ...[...bubbles.children].filter(o => o !== b).map(o => ({ l: o.offsetLeft, t: o.offsetTop, r: o.offsetLeft + o.offsetWidth, b: o.offsetTop + o.offsetHeight }))];
    const overlap = (a, o) => Math.max(0, Math.min(a.r, o.r) - Math.max(a.l, o.l) + 4) * Math.max(0, Math.min(a.b, o.b) - Math.max(a.t, o.t) + 4);
    const score = s => {
      const r = { l: s.x, t: s.y, r: s.x + bw, b: s.y + bh };
      const out = Math.max(0, edge - r.l) + Math.max(0, edge - r.t) + Math.max(0, r.r - area.width + edge) + Math.max(0, r.b - area.height + edge);
      return out * 1000 + others.reduce((n, o) => n + overlap(r, o), 0);
    };
    const best = spots.map(s => ({ ...s, cost: score(s) })).reduce((a, s) => (s.cost < a.cost ? s : a));
    b.classList.add(best.side);
    b.style.left = `${best.x}px`;
    b.style.top = `${Math.max(edge, Math.min(area.height - bh - edge, best.y))}px`;
    const tail = best.side === "above" || best.side === "below"
      ? Math.max(14, Math.min(bw - 14, cx - best.x))
      : Math.max(12, Math.min(bh - 12, cy - Math.max(edge, best.y)));
    b.style.setProperty("--tail", `${tail}px`);
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
    // Delivered packets fade away so they never sit on top of a card or its label.
    svg.querySelectorAll(".m-pkt").forEach(c => c.classList.add("arrived"));
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
