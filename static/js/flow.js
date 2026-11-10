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
export const STAGE_KINDS = ["mail", "url", "field", "log", "file", "packet", "cert", "alert", "bytes"];

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
  if (d?.scene && d.scene !== "screens" && d.scene !== "stage") errors.push(`unknown scene "${d.scene}"`);
  (d?.steps || []).forEach((s, i) => {
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

// One step as a sentence, for the caption and the text version.
export function describe(d, i) {
  const s = d.steps[i], name = id => d.nodes.find(n => n.id === id).label;
  return { who: `${name(s.from)} → ${name(s.to)}`, msg: s.msg, text: s.text, stop: s.stop || "", tone: s.tone || "" };
}

export function mount(el, d) {
  if (d.scene === "stage") return mountStage(el, d);
  if (d.scene === "screens") return mountPhone(el, d);
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

// The MFA lesson is one object: the sign-in, then the phone, then what the owner chose.
function mountPhone(el, d) {
  let i = 0, choice = null;
  const askStep = d.steps.findIndex(s => s.screens?.p?.tone === "ask");
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
    <details class="flow-text"><summary>All steps as text</summary><ol>${d.steps.map((_, k) => { const s = describe(d, k); return `<li><b>${esc(s.who)}</b>: ${esc(s.msg)}. ${esc(s.text)}${s.stop ? ` <em>Stopped by: ${esc(s.stop)}</em>` : ""}</li>`; }).join("")}</ol></details>
  </figure>`;
  const card = el.querySelector("[data-stage]");
  const box = el.querySelector(".flow-step");
  const view = () => {
    if (choice === "deny") return { tone: "stop", kicker: "Phone", rows: [{ k: "Prompt", v: "Denied" }, { k: "Session", v: "none" }] };
    if (choice === "approve") return { tone: "bad", kicker: "Phone", rows: [{ k: "Prompt", v: "Approved" }, { k: "Session", v: "created" }] };
    const s = d.steps[i], phone = s.screens?.p, login = s.screens?.a;
    if (phone?.tone === "ask") return { tone: "", kicker: "Phone", line: phone.line, ask: true };
    if (i === 0) return { tone: "bad", kicker: "Sign in", rows: [{ k: "Password", v: "accepted" }, { k: "Second factor", v: "still required", bad: true }] };
    const dest = s.screens?.[s.to] || login;
    const tone = dest?.tone === "stop" || dest?.tone === "good" ? "stop" : (s.tone || "");
    return { tone, kicker: dest?.kicker || "Sign in", line: dest?.line || s.msg, sub: s.stop ? "" : "" };
  };
  function draw(dir) {
    const v = view();
    card.className = "stage-card" + (v.tone ? " " + v.tone : "");
    const buttons = (v.ask || choice) ? `<span class="flow-choice"><button type="button" data-act="deny" aria-pressed="${choice === "deny"}">Deny</button><button type="button" data-act="approve" aria-pressed="${choice === "approve"}">Approve</button></span>` : "";
    const body = v.rows ? v.rows.map(r => `<p class="obj-row${r.bad ? " bad" : ""}"><span>${esc(r.k)}</span><b>${esc(r.v)}</b></p>`).join("") : `<p class="stage-line">${esc(v.line || "")}</p>`;
    card.innerHTML = `<div class="obj field"><span class="mech-k">${esc(v.kicker)}</span>${body}${buttons}</div>`;
    const t = describe(d, choice ? askStep : i);
    box.innerHTML = choice
      ? `<div class="eyebrow">Path: ${choice}</div><p>${choice === "deny" ? "The owner refuses. The password was not enough." : "The owner approves. That is the path the second factor is there to stop."}</p>`
      : `<div class="eyebrow">Step ${i + 1} of ${d.steps.length}</div><p>${gl(t.text, 2)}</p>${t.stop ? `<p class="flow-stop"><b>How it's stopped here:</b> ${esc(t.stop)}</p>` : ""}`;
    if (!reduced && dir) {
      card.classList.remove("is-in");
      card.dataset.dir = dir > 0 ? "next" : "back";
      void card.offsetWidth;
      card.classList.add("is-in");
    }
    el.querySelector('[data-go="-1"]').disabled = i === 0 && !choice;
    const next = el.querySelector('[data-go="1"]');
    next.disabled = i === d.steps.length - 1;
    next.textContent = i === d.steps.length - 1 ? "End of the flow" : "Next step ›";
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
    if (go === 0) { i = 0; choice = null; }
    else { choice = null; i = Math.max(0, Math.min(d.steps.length - 1, i + go)); }
    draw(i === prev ? 0 : 1);
  });
  el.querySelector(".flow-ctl").addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const go = Number(b.dataset.go);
    const prev = i;
    if (go === 0) { i = 0; choice = null; }
    else { choice = null; i = Math.max(0, Math.min(d.steps.length - 1, i + go)); }
    draw(i === prev ? 0 : 1);
  });
  draw(0);
}

function mountStage(el, d) {
  let i = 0;
  el.innerHTML = `<figure class="flow is-stage">
    <figcaption class="flow-title">${esc(d.title)}</figcaption>
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
  const caption = k => { const t = describe(d, k); return `<div class="eyebrow">Step ${k + 1} of ${d.steps.length}</div>
      <p>${gl(t.text, 2)}</p>${t.stop ? `<p class="flow-stop"><b>How it's stopped here:</b> ${esc(t.stop)}</p>` : ""}`; };
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
  MAIL.wire(el);
  draw(0);
}
