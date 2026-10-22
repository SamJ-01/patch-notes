// Step-through flow diagrams for lessons ("See it"): who sends what to whom, one step at a time.
// Devices come from the shared library (hw.js). A diagram is data in content/lessons.json:
//   { title, nodes: [{ id, kind, label }], steps: [{ from, to, msg, text, tone?: "bad"|"good", stop? }] }
// The pure helpers (validate, describe) are tested in tests/flow.test.mjs; mount() draws it on the page.
import { HW, hw } from "./hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Glossary underlining from the main page (gloss() in src/app/02-glossary.js), or plain escaped text without it.
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));
export const MAX_NODES = 5;

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
  (d?.steps || []).forEach((s, i) => {
    if (!ids.has(s.from) || !ids.has(s.to)) errors.push(`step ${i + 1}: unknown node`);
    if (s.from === s.to) errors.push(`step ${i + 1}: from and to are the same`);
    if (!s.msg || !s.text) errors.push(`step ${i + 1}: needs msg and text`);
    if (s.tone && !["bad", "good"].includes(s.tone)) errors.push(`step ${i + 1}: tone must be bad or good`);
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
  let i = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.innerHTML = `<figure class="flow">
    <figcaption class="flow-title">${esc(d.title)}</figcaption>
    <div class="flow-stage" style="--n:${d.nodes.length}">
      <svg class="flow-wire" aria-hidden="true"><defs><marker id="flow-arrow-${el.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><line/></svg>
      ${d.nodes.map(n => `<div class="flow-node" data-id="${esc(n.id)}"><svg viewBox="-36 -27 72 54" aria-hidden="true">${hw(n.kind)}</svg><span>${esc(n.label)}</span></div>`).join("")}
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
  function draw(animate = true) {
    const s = d.steps[i], t = describe(d, i);
    stage.dataset.tone = t.tone;
    stage.querySelectorAll(".flow-node").forEach(n => { n.classList.toggle("send", n.dataset.id === s.from); n.classList.toggle("recv", n.dataset.id === s.to); });
    box.innerHTML = caption(i);
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    const next = el.querySelector('[data-go="1"]');
    next.disabled = i === d.steps.length - 1;
    next.textContent = i === d.steps.length - 1 ? "End of the flow" : "Next step ›";
    place(animate);
  }
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
