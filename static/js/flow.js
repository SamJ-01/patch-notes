// Step-through flow diagrams for lessons ("See it"): who sends what to whom, one step at a time.
// Devices come from the shared library (hw.js). A diagram is data in content/lessons.json:
//   { title, nodes: [{ id, kind, label }], steps: [{ from, to, msg, text, tone?: "bad"|"good", stop? }] }
// The pure helpers (validate, describe) are tested in tests/flow.test.mjs; mount() draws it on the page.
import { HW, hw } from "./hw.js";
import { MAIL } from "./mail.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Glossary underlining from the main page (gloss() in src/app/02-glossary.js), or plain escaped text without it.
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));
export const MAX_NODES = 5;
export const STAGE_KINDS = ["mail", "url", "field", "log", "file", "packet", "cert", "alert", "bytes", "login", "sent"];

export function stageHtml(g = {}) {
  const row = (k, v, bad) => `<p class="obj-row${bad ? " bad" : ""}"><span>${esc(k)}</span><b>${esc(v)}</b></p>`;
  const rows = (g.rows || []).map(r => row(r.k, r.v, r.bad)).join("");
  if (g.kind === "mail") {
    // Render as a real email in the shared mail-app look (MAIL), not a flat field list. Build a minimal raw
    // header block so MAIL parses the sender, flags a spoofed Reply-To and marks an outside sender.
    const headers = [`From: ${g.from}`, g.reply ? `Reply-To: ${g.reply}` : "", `To: ${g.to || "you@company.example"}`, `Subject: ${g.subject || ""}`].filter(Boolean).join("\n");
    const links = g.link ? [g.link] : [];
    return MAIL.card({ headers, body: g.body || "", links, date: g.date || "" }, { id: "flow-em", views: [], org: g.org, client: true });
  }
  if (g.kind === "url") return `<div class="obj url"><span class="mech-k">Address bar</span>${g.rows ? rows : `<p class="stage-line">${esc(g.line)}</p>`}</div>`;
  if (g.kind === "field") return `<div class="obj field"><span class="mech-k">${esc(g.kicker || "")}</span>${g.rows ? rows : `<p class="stage-line">${esc(g.line)}</p>`}</div>`;
  if (g.kind === "log") return `<div class="obj log"><span class="mech-k">${esc(g.kicker || "Log")}</span><pre>${(g.lines || []).map(esc).join("\n")}</pre></div>`;
  if (g.kind === "file") return `<div class="obj file"><span class="mech-k">${esc(g.kicker || "File")}</span>${g.rows ? rows : `<p class="stage-line">${esc(g.line)}</p>`}</div>`;
  if (g.kind === "packet" || g.kind === "cert") return `<div class="obj ${g.kind}"><span class="mech-k">${esc(g.kicker || "")}</span>${rows}</div>`;
  if (g.kind === "alert") return `<div class="obj alert"><span class="mech-k">Alert</span>${g.rows ? rows : `<p class="stage-line">${esc(g.line)}</p>`}</div>`;
  if (g.kind === "bytes") return `<div class="obj bytes"><span class="mech-k">${esc(g.kicker || "On the wire")}</span><p class="stage-line">${esc(g.line)}</p>${g.rows ? rows : ""}</div>`;
  if (g.kind === "login" || g.kind === "sent") {
    const sent = g.kind === "sent";
    return `<div class="signin">
      <div class="signin-chrome"><span class="signin-dots" aria-hidden="true"></span><span class="signin-url">${esc(g.url || g.line || "")}</span></div>
      <form class="signin-page" action="#">
        <div class="signin-brand">${esc(g.brand || "Sign in")}</div>
        <h2>${sent ? "Signing in…" : "Sign in"}</h2>
        <label>Email<input value="${esc(g.user || "")}" readonly></label>
        <label>Password<input type="password" value="${sent ? "password" : ""}" placeholder="Password" ${sent ? "readonly" : ""}></label>
        ${sent
          ? `<p class="signin-sent">Posted to ${esc(g.posted || "the attacker")}</p><button type="button" class="signin-go" data-act="open-next">Open the mailbox</button>`
          : `<button type="button" class="signin-go" data-act="open-next">Sign in</button>`}
      </form>
    </div>`;
  }
  return `<p class="stage-line">${esc(g.line || "")}</p>`;
}

// Problems with a diagram's data, as readable messages (empty when it's fine).
export function validate(d) {
  const errors = [];
  if (!d || !d.title) errors.push("missing title");
  const nodes = d?.nodes || [], ids = new Set(nodes.map(n => n.id));
  if (nodes.length < 2 || nodes.length > MAX_NODES) errors.push(`needs 2–${MAX_NODES} nodes, has ${nodes.length}`);
  if (ids.size !== nodes.length) errors.push("duplicate node ids");
  for (const n of nodes) {
    if (!HW[n.kind]) errors.push(`node ${n.id}: no drawing for kind "${n.kind}"`);
    if (!n.label) errors.push(`node ${n.id}: missing label`);
  }
  if (d?.scene && d.scene !== "screens" && d.scene !== "stage" && d.scene !== "route") errors.push(`unknown scene "${d.scene}"`);
  if (d?.approved && (d.scene !== "screens" || askIndex(d) < 0)) errors.push("an approved branch needs a screens scene with an ask step");
  [...(d?.steps || []), ...(d?.approved || [])].forEach((s, i) => {
    if (!ids.has(s.from) || !ids.has(s.to)) errors.push(`step ${i + 1}: unknown node`);
    if (s.from === s.to) errors.push(`step ${i + 1}: from and to are the same`);
    if (!s.msg || !s.text) errors.push(`step ${i + 1}: needs msg and text`);
    if (s.tone && !["bad", "good"].includes(s.tone)) errors.push(`step ${i + 1}: tone must be bad or good`);
    if (d?.scene === "screens") {
      if (!s.screens) errors.push(`step ${i + 1}: a screens scene needs a screen for each step`);
      else for (const [id, sc] of Object.entries(s.screens)) {
        if (!ids.has(id)) errors.push(`step ${i + 1}: screen for unknown node ${id}`);
        if (!sc?.line) errors.push(`step ${i + 1}: screen ${id} needs a line`);
        if (sc?.tone && !["bad", "good", "wait", "ask", "stop", "idle"].includes(sc.tone)) errors.push(`step ${i + 1}: screen ${id} has a bad tone`);
      }
    }
    if (d?.scene === "route") {
      const p = s.packet || {};
      if (!p.from || !p.to) errors.push(`step ${i + 1}: a route packet needs from and to`);
      // The slab stops where the caption says the step goes, so the glow and the words always agree.
      const want = nodes.findIndex(n => n.id === s.to);
      if (i < (d.steps || []).length && Number(p.at) !== want) errors.push(`step ${i + 1}: the packet should be at "${s.to}" (at: ${want}), not at ${p.at}`);
    }
    if (d?.scene === "stage") {
      const g = s.stage || {};
      if (!STAGE_KINDS.includes(g.kind)) errors.push(`step ${i + 1}: stage kind must be one of ${STAGE_KINDS.join(", ")}`);
      if (!g.line && g.kind !== "packet" && g.kind !== "cert" && g.kind !== "log") errors.push(`step ${i + 1}: a stage needs a line`);
      if (g.kind === "mail" && (!g.from || !g.subject)) errors.push(`step ${i + 1}: a mail stage needs from and subject`);
      if (g.kind === "log" && !(g.lines || []).length) errors.push(`step ${i + 1}: a log stage needs lines`);
      if ((g.kind === "packet" || g.kind === "cert") && !(g.rows || []).length) errors.push(`step ${i + 1}: ${g.kind} needs rows`);
      if (g.tone && !["bad", "good", "wait", "stop"].includes(g.tone)) errors.push(`step ${i + 1}: stage has a bad tone`);
    }
  });
  if (!(d?.steps || []).length) errors.push("no steps");
  return errors;
}

// The MFA phone story branches on the owner's choice at its "ask" step: Approve follows d.approved (the attacker
// gets in); Deny, no choice or just pressing Next follows the main steps (the owner refuses).
export const askIndex = d => (d?.steps || []).findIndex(s => s.screens?.p?.tone === "ask");
export function phonePath(d, choice) {
  const k = askIndex(d);
  return choice === "approve" && k >= 0 && d.approved?.length ? [...d.steps.slice(0, k + 1), ...d.approved] : d.steps;
}

// One step as a sentence, for the caption and the text version.
export function describe(d, i) {
  const s = d.steps[i], name = id => d.nodes.find(n => n.id === id).label;
  return { who: `${name(s.from)} → ${name(s.to)}`, msg: s.msg, text: s.text, stop: s.stop || "", tone: s.tone || "" };
}

export function mount(el, d) {
  if (d.scene === "stage") return mountStage(el, d);
  if (d.scene === "screens") return mountPhone(el, d);
  if (d.scene === "route") return mountRoute(el, d);
  let i = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.innerHTML = `<figure class="flow${d.scene === "screens" ? " is-screens" : ""}">
    <figcaption class="flow-title">${esc(d.title)}</figcaption>
    <div class="flow-stage" style="--n:${d.nodes.length}">
      <svg class="flow-wire" aria-hidden="true"><defs><marker id="flow-arrow-${el.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><line/></svg>
      ${d.nodes.map(n => `<div class="flow-node" data-id="${esc(n.id)}"><svg viewBox="-36 -27 72 54" aria-hidden="true">${hw(n.kind)}</svg><span>${esc(n.label)}</span>${d.scene === "screens" ? `<div class="flow-screen" data-screen></div>` : ""}</div>`).join("")}
      <span class="flow-pkt" aria-hidden="true"></span>
    </div>
    <div class="flow-step" aria-live="polite"></div>
    <div class="row flow-ctl">
      <button class="btn ghost" type="button" data-go="-1">‹ Back</button>
      <button class="btn brand" type="button" data-go="1">Next step ›</button>
      <button class="btn ghost" type="button" data-go="0">↺ Start again</button>
    </div>
    <details class="flow-text"><summary>All steps as text</summary><ol>${d.steps.map((_, k) => { const s = describe(d, k); return `<li><b>${esc(s.who)}</b>: ${esc(s.msg)}. ${esc(s.text)}${s.stop ? ` <em>Stopped by: ${esc(s.stop)}</em>` : ""}</li>`; }).join("")}</ol></details>
  </figure>`;
  const stage = el.querySelector(".flow-stage"), line = el.querySelector(".flow-wire line"), pkt = el.querySelector(".flow-pkt");
  line.setAttribute("marker-end", `url(#flow-arrow-${el.id})`);
  const node = id => stage.querySelector(`.flow-node[data-id="${CSS.escape(id)}"]`);
  // Centre of a node's device drawing, relative to the stage.
  const centre = id => { const r = node(id).querySelector("svg").getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width }; };

  function place(animate) {
    const s = d.steps[i], a = centre(s.from), b = centre(s.to), dir = Math.sign(b.x - a.x) || 1, pad = a.w * 0.45;
    line.setAttribute("x1", a.x + dir * pad); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x - dir * pad); line.setAttribute("y2", b.y);
    pkt.style.transition = "none";
    pkt.style.transform = `translate(${a.x}px, ${a.y}px)`;
    if (reduced || !animate) { pkt.style.transform = `translate(${b.x}px, ${b.y}px)`; return; }
    void pkt.offsetWidth;  // start from the sender, then glide to the receiver
    pkt.style.transition = "transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)";
    pkt.style.transform = `translate(${b.x}px, ${b.y}px)`;
  }
  const box = el.querySelector(".flow-step");
  const caption = k => { const t = describe(d, k); return `<div class="eyebrow">Step ${k + 1} of ${d.steps.length} · ${esc(t.who)}</div>
      <p class="flow-msg ${t.tone}">${esc(t.msg)}</p><p>${gl(t.text, 2)}</p>${t.stop ? `<p class="flow-stop"><b>How it's stopped here:</b> ${esc(t.stop)}</p>` : ""}`; };
  // Reserve room for the longest step so the buttons and page below never jump between steps.
  function reserve() {
    box.style.minHeight = "";
    let max = 0;
    for (let k = 0; k < d.steps.length; k++) { box.innerHTML = caption(k); max = Math.max(max, box.offsetHeight); }
    box.style.minHeight = max + "px";
    box.innerHTML = caption(i);
  }
  clearInterval(el._flowIdle);
  let choice = null;
  const askStep = d.steps.findIndex(s => s.screens?.p?.tone === "ask");
  const paths = {
    deny: {
      a: { kicker: "Sign in", line: "Access denied", tone: "stop" },
      l: { kicker: "Login service", line: "No session created", tone: "good" },
      p: { kicker: "Sign-in attempt", line: "Denied", tone: "stop" },
      cap: `<div class="eyebrow">Path: deny</div><p class="flow-msg good">The owner refuses. No session is created.</p><p>The password was not enough. Press Approve to see the other path.</p>`,
    },
    approve: {
      a: { kicker: "Sign in", line: "Signed in", tone: "bad" },
      l: { kicker: "Login service", line: "Session created", tone: "bad" },
      p: { kicker: "Sign-in attempt", line: "Approved", tone: "bad" },
      cap: `<div class="eyebrow">Path: approve</div><p class="flow-msg bad">The owner approves. The attacker has a session.</p><p>That is the path MFA is there to stop. Press Deny to see it refused.</p>`,
    },
  };
  function draw(animate = true) {
    const s = d.steps[i], t = describe(d, i);
    const onAsk = i === askStep;
    if (!onAsk) choice = null;
    const chosen = onAsk ? paths[choice] : null;
    stage.dataset.tone = chosen ? (choice === "approve" ? "bad" : "good") : t.tone;
    stage.querySelectorAll(".flow-node").forEach(n => {
      n.classList.toggle("send", n.dataset.id === s.from);
      n.classList.toggle("recv", n.dataset.id === s.to);
      const card = n.querySelector("[data-screen]");
      if (!card) return;
      const sc = chosen?.[n.dataset.id] || s.screens?.[n.dataset.id];
      card.className = "flow-screen" + (sc?.tone ? " " + sc.tone : "");
      const buttons = onAsk && n.dataset.id === "p"
        ? `<span class="flow-choice"><button type="button" data-act="deny" aria-pressed="${choice === "deny"}">Deny</button><button type="button" data-act="approve" aria-pressed="${choice === "approve"}">Approve</button></span>`
        : "";
      card.innerHTML = sc ? `<span class="k">${esc(sc.kicker || "")}</span><span class="ln">${esc(sc.line)}</span>${buttons}` : "";
    });
    box.innerHTML = chosen ? chosen.cap : caption(i);
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    const next = el.querySelector('[data-go="1"]');
    next.disabled = i === d.steps.length - 1;
    next.textContent = i === d.steps.length - 1 ? "End of the flow" : "Next step ›";
    place(animate);
    clearInterval(el._flowIdle);
    if (!reduced && d.scene !== "screens") el._flowIdle = setInterval(() => { if (!el.isConnected) { clearInterval(el._flowIdle); return; } place(true); }, 4200);
  }
  el.addEventListener("click", e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act !== "deny" && act !== "approve") return;
    if (askStep < 0) return;
    i = askStep;
    choice = act;
    draw(false);
  });
  el.querySelector(".flow-ctl").addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const go = Number(b.dataset.go);
    i = go === 0 ? 0 : Math.max(0, Math.min(d.steps.length - 1, i + go));
    draw();
  });
  let lastW = 0;
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { place(false); if (el.clientWidth !== lastW) { lastW = el.clientWidth; reserve(); } }).observe(el);
  reserve();
  draw(false);
}

// One request, drawn in a room (docs/diagram-standard.md). The devices stand on a floor and a plain slab rides
// the cable to the device it is at (`packet.at`, 0 = the first stop); the stretch it just travelled glows.
// The addresses are the lesson, so they sit in one fixed card above the room; the card does not chase the slab.
// Every step's card and caption are drawn stacked in the same grid cell and only the current one shows, so the
// whole figure is the height of its tallest step on every step and nothing below it moves.
function mountRoute(el, d) {
  let i = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const n = d.nodes.length;
  const atOf = k => Math.max(0, Math.min(n - 1, Number(d.steps[k].packet?.at) || 0));
  // A "next hop" row (the device the frame goes to, when that isn't the packet's destination) is reserved on every
  // step's card if any step has one, so the card stays one height.
  const hasVia = d.steps.some(s => s.packet?.via);
  const face = p => {
    // The old address always has its own line, empty until an address is rewritten, so NAT can't make the card taller.
    const line = (k, old, now) => `<span>${k}</span><span class="vals"><b class="was${old && now ? " on" : ""}">${old && now ? esc(old) : "&nbsp;"}</b><b>${esc(now || old || "")}</b></span>`;
    return `<p class="route-note">${p.back ? "←" : "→"} ${esc(p.note || "Packet")}</p>
      <p class="route-addr">${line("From", p.from, p.fromNow)}</p>
      <p class="route-addr">${line("To", p.to, p.toNow)}</p>
      ${hasVia ? `<p class="route-addr route-via"><span>Next hop</span><span class="vals"><b>${p.via ? esc(p.via) : "&nbsp;"}</b></span></p>` : ""}`;
  };
  const caption = k => { const t = describe(d, k); return `<div class="eyebrow">Step ${k + 1} of ${d.steps.length} · ${esc(t.who)}</div>
      <p class="flow-msg ${t.tone}">${esc(t.msg)}</p><p class="route-text">${gl(t.text, 2)}</p>${t.stop ? `<p class="flow-stop"><b>How it's stopped here:</b> ${esc(t.stop)}</p>` : ""}`; };
  const pct = at => `${((at + 0.5) / n) * 100}%`;
  el.innerHTML = `<figure class="flow is-route" style="--n:${n}">
    <figcaption class="flow-title">${esc(d.title)}</figcaption>
    <div class="route">
      <div class="route-cards" aria-hidden="true">${d.steps.map((s, k) => `<div class="route-pkt${s.packet?.back ? " back" : ""}" data-k="${k}">${face(s.packet || {})}</div>`).join("")}</div>
      <div class="route-track">
        <span class="route-line" aria-hidden="true"></span>
        <span class="route-lit" aria-hidden="true"></span>
        <span class="route-slab" aria-hidden="true"></span>
        ${d.nodes.map(nd => `<div class="route-stop" data-id="${esc(nd.id)}"><svg viewBox="-36 -27 72 54" aria-hidden="true">${hw(nd.kind)}</svg><span>${esc(nd.label)}</span></div>`).join("")}
      </div>
    </div>
    <div class="route-dots" aria-hidden="true">${d.steps.map((s, k) => `<span data-k="${k}"${s.packet?.back ? ' class="back"' : ""}></span>`).join("")}</div>
    <div class="flow-steps route-caption" aria-live="polite">${d.steps.map((_, k) => `<div class="flow-step" data-k="${k}">${caption(k)}</div>`).join("")}</div>
    <div class="row flow-ctl">
      <button class="btn ghost" type="button" data-go="-1">‹ Back</button>
      <button class="btn brand" type="button" data-go="1">Next step ›</button>
      <button class="btn ghost" type="button" data-go="0">↺ Start again</button>
    </div>
    <details class="flow-text"><summary>All steps as text</summary><ol>${d.steps.map((_, k) => { const s = describe(d, k); return `<li><b>${esc(s.who)}</b>: ${esc(s.msg)}. ${esc(s.text)}${s.stop ? ` <em>Stopped by: ${esc(s.stop)}</em>` : ""}</li>`; }).join("")}</ol></details>
  </figure>`;
  const slab = el.querySelector(".route-slab"), lit = el.querySelector(".route-lit");
  const stops = [...el.querySelectorAll(".route-stop")];
  if (reduced) [slab, lit].forEach(x => { x.style.transition = "none"; });
  function draw(speak) {
    // The glow is the step's own leg (from → to, as the caption says), so it's right on the first step and after Back.
    const s = d.steps[i], p = s.packet || {}, at = atOf(i), from = Math.max(0, d.nodes.findIndex(nd => nd.id === s.from));
    el.querySelectorAll(".route-pkt").forEach(c => c.classList.toggle("now", Number(c.dataset.k) === i));
    el.querySelectorAll(".route-dots span").forEach(c => { const k = Number(c.dataset.k); c.classList.toggle("now", k === i); c.classList.toggle("done", k < i); });
    el.querySelector(".route-caption").classList.toggle("back", !!p.back);
    el.querySelectorAll(".flow-step").forEach(c => { const on = Number(c.dataset.k) === i; c.classList.toggle("now", on); c.toggleAttribute("aria-hidden", !on); });
    slab.classList.toggle("back", !!p.back);
    lit.classList.toggle("back", !!p.back);
    // The packet travels this step's leg (from -> to) and the glow grows behind it as it goes: both start at the sender
    // (no transition), then move together with the same timing, so the trail's leading edge is always the packet.
    // (They used to slide from the last step's position as a block, which looked like a fixed packet and line jumping.)
    const end = () => { slab.style.left = pct(at); lit.style.left = pct(Math.min(from, at)); lit.style.width = `${(Math.abs(at - from) / n) * 100}%`; };
    if (speak && !reduced && from !== at) {
      [slab, lit].forEach(x => { x.style.transition = "none"; });
      slab.style.left = pct(from); lit.style.left = pct(from); lit.style.width = "0%";
      void slab.offsetWidth;
      [slab, lit].forEach(x => { x.style.transition = ""; });
      requestAnimationFrame(end);
    } else end();
    stops.forEach((nd, k) => nd.classList.toggle("on", k === at));
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    const next = el.querySelector('[data-go="1"]');
    next.disabled = i === d.steps.length - 1;
    next.textContent = i === d.steps.length - 1 ? "End of the flow" : "Next step ›";
    if (speak && p.patch) globalThis.PN_patch?.(p.patch, 7000);
  }
  el.querySelector(".flow-ctl").addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const go = Number(b.dataset.go);
    i = go === 0 ? 0 : Math.max(0, Math.min(d.steps.length - 1, i + go));
    draw(true);
  });
  draw(false);
}

// The MFA lesson is one object: the sign-in, then the phone, then what the owner chose.
function mountPhone(el, d) {
  let i = 0, choice = null;
  const askStep = askIndex(d);
  const path = () => phonePath(d, choice);  // the steps for the owner's choice so far
  const asText = steps => steps.map((_, k) => { const s = describe({ ...d, steps }, k); return `<li><b>${esc(s.who)}</b>: ${esc(s.msg)}. ${esc(s.text)}${s.stop ? ` <em>Stopped by: ${esc(s.stop)}</em>` : ""}</li>`; }).join("");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.innerHTML = `<figure class="flow is-stage">
    <figcaption class="flow-title">${esc(d.title)}</figcaption>
    <div class="stage-card" data-stage></div>
    <div class="flow-step" aria-live="polite"></div>
    <div class="row flow-ctl">
      <button class="btn ghost" type="button" data-go="-1">‹ Back</button>
      <button class="btn brand" type="button" data-go="1">Next step ›</button>
      <button class="btn ghost" type="button" data-go="0">↺ Start again</button>
    </div>
    <details class="flow-text"><summary>All steps as text</summary><ol>${asText(d.steps)}</ol>${d.approved?.length ? `<p>If the owner taps Approve instead:</p><ol start="${askStep + 2}">${asText(d.approved)}</ol>` : ""}</details>
  </figure>`;
  const card = el.querySelector("[data-stage]");
  const box = el.querySelector(".flow-step");
  const view = () => {
    if (i === askStep && choice === "deny") return { tone: "stop", kicker: "Phone", rows: [{ k: "Prompt", v: "Denied" }, { k: "Session", v: "none" }], ask: true };
    if (i === askStep && choice === "approve") return { tone: "bad", kicker: "Phone", rows: [{ k: "Prompt", v: "Approved" }, { k: "Session", v: "created" }], ask: true };
    const s = path()[i], phone = s.screens?.p, login = s.screens?.a;
    if (phone?.tone === "ask") return { tone: "", kicker: "Phone", line: phone.line, ask: true };
    if (i === 0) return { tone: "bad", kicker: "Sign in", rows: [{ k: "Password", v: "accepted" }, { k: "Second factor", v: "still required", bad: true }] };
    const dest = s.screens?.[s.to] || login;
    const tone = dest?.tone === "stop" || dest?.tone === "good" ? "stop" : (s.tone || "");
    return { tone, kicker: dest?.kicker || "Sign in", line: dest?.line || s.msg, sub: s.stop ? "" : "" };
  };
  function draw(dir) {
    const v = view();
    card.className = "stage-card" + (v.tone ? " " + v.tone : "");
    const buttons = v.ask ? `<span class="flow-choice"><button type="button" data-act="deny" aria-pressed="${choice === "deny"}">Deny</button><button type="button" data-act="approve" aria-pressed="${choice === "approve"}">Approve</button></span>` : "";
    const body = v.rows ? v.rows.map(r => `<p class="obj-row${r.bad ? " bad" : ""}"><span>${esc(r.k)}</span><b>${esc(r.v)}</b></p>`).join("") : `<p class="stage-line">${esc(v.line || "")}</p>`;
    card.innerHTML = `<div class="obj field"><span class="mech-k">${esc(v.kicker)}</span>${body}${buttons}</div>`;
    const steps = path(), t = describe({ ...d, steps }, i);
    box.innerHTML = i === askStep && choice
      ? `<div class="eyebrow">Step ${i + 1} of ${steps.length} · You chose ${choice === "deny" ? "Deny" : "Approve"}</div><p>${choice === "deny" ? "The owner refuses. Press Next to see what the attacker gets." : "The owner approves. Press Next to see what that lets the attacker do."}</p>`
      : `<div class="eyebrow">Step ${i + 1} of ${steps.length} · ${esc(t.who)}</div><p class="flow-msg ${t.tone}">${esc(t.msg)}</p><p>${gl(t.text, 2)}</p>${t.stop ? `<p class="flow-stop"><b>How it's stopped here:</b> ${esc(t.stop)}</p>` : ""}`;
    if (!reduced && dir) {
      card.classList.remove("is-in");
      card.dataset.dir = dir > 0 ? "next" : "back";
      void card.offsetWidth;
      card.classList.add("is-in");
    }
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    const next = el.querySelector('[data-go="1"]'), last = i === steps.length - 1;
    next.disabled = last;
    next.textContent = last ? "End of the flow" : "Next step ›";
  }
  el.addEventListener("click", e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act !== "deny" && act !== "approve") return;
    i = askStep < 0 ? i : askStep;
    choice = act;
    draw(1);
  });
  el.querySelector(".flow-ctl").addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const go = Number(b.dataset.go);
    const prev = i;
    // The choice stands while you go on from it (or come back to it); going back before the prompt clears it.
    if (go === 0) { i = 0; choice = null; }
    else { i = Math.max(0, Math.min(path().length - 1, i + go)); if (i < askStep) choice = null; }
    draw(i === prev ? 0 : 1);
  });
  draw(0);
}

function mountStage(el, d) {
  let i = 0;
  const leadMail = d.steps[0]?.stage?.kind === "mail";
  el.innerHTML = `<figure class="flow is-stage">
    ${leadMail ? "" : `<figcaption class="flow-title">${esc(d.title)}</figcaption>`}
    <div class="stage-card" data-stage></div>
    <div class="flow-step" aria-live="polite"></div>
    <div class="row flow-ctl">
      <button class="btn ghost" type="button" data-go="-1">‹ Back</button>
      <button class="btn brand" type="button" data-go="1">Next step ›</button>
      <button class="btn ghost" type="button" data-go="0">↺ Start again</button>
    </div>
    <details class="flow-text"><summary>All steps as text</summary><ol>${d.steps.map((_, k) => { const s = describe(d, k); return `<li><b>${esc(s.who)}</b>: ${esc(s.msg)}. ${esc(s.text)}${s.stop ? ` <em>Stopped by: ${esc(s.stop)}</em>` : ""}</li>`; }).join("")}</ol></details>
  </figure>`;
  const card = el.querySelector("[data-stage]");
  const box = el.querySelector(".flow-step");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const caption = k => { const t = describe(d, k); return `<div class="eyebrow">Step ${k + 1} of ${d.steps.length} · ${esc(t.who)}</div>
      <p class="flow-msg ${t.tone}">${esc(t.msg)}</p><p>${gl(t.text, 2)}</p>${t.stop ? `<p class="flow-stop"><b>How it's stopped here:</b> ${esc(t.stop)}</p>` : ""}`; };
  function draw(dir) {
    const s = d.steps[i], g = s.stage || {};
    card.className = "stage-card" + (g.tone ? " " + g.tone : "");
    card.innerHTML = stageHtml(g);
    if (!reduced && dir) {
      card.classList.remove("is-in");
      card.dataset.dir = dir > 0 ? "next" : "back";
      void card.offsetWidth;
      card.classList.add("is-in");
    }
    box.innerHTML = caption(i);
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    const next = el.querySelector('[data-go="1"]');
    next.disabled = i === d.steps.length - 1;
    next.textContent = i === d.steps.length - 1 ? "End of the flow" : "Next step ›";
  }
  el.querySelector(".flow-ctl").addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const go = Number(b.dataset.go);
    const prev = i;
    i = go === 0 ? 0 : Math.max(0, Math.min(d.steps.length - 1, i + go));
    draw(i === prev ? 0 : i > prev || go === 0 ? 1 : -1);
  });
  el.addEventListener("click", e => {
    if (!e.target.closest("[data-act='open-next']")) return;
    if (i < d.steps.length - 1) { i++; draw(1); }
  });
  MAIL.wire(el, { onLink: () => { if (i < d.steps.length - 1) { i++; draw(1); } } });
  draw(0);
}
