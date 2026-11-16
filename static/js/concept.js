// Concept diagrams for lessons whose topic is an idea, not a step-by-step process (the flow.js case).
// Three shapes, chosen in the lesson data: a triad (three linked goals, e.g. CIA), a cycle (a ring of
// stages, e.g. incident response), and cards (a labelled set, e.g. malware families). Click a part to
// read its example. validate() is pure and tested in tests/concept.test.mjs; mount() draws it.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Small line icons (reused across cards and nodes). Drawn in currentColor on a 24-box centred at 0.
export const ICONS = {
  lock: '<rect x="-7" y="-1" width="14" height="11" rx="2"/><path d="M-4-1v-3a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M0-10l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-5z"/><path d="M-3.5 0l2.5 2.5 4.5-5"/>',
  bolt: '<path d="M1-10l-7 11h5l-1 9 7-12h-5z"/>',
  key: '<circle cx="-4" cy="0" r="4.5"/><path d="M0.5 0h9M7 0v3.5M9.5 0v3"/>',
  bug: '<ellipse cx="0" cy="1" rx="5" ry="7"/><path d="M0-6v14M-5 0h-4M5 0h4M-5 5l-4 3M5 5l4 3M-4-3l-3-3M4-3l3-3"/>',
  eye: '<path d="M-10 0C-6-6 6-6 10 0 6 6-6 6-10 0z"/><circle cx="0" cy="0" r="3"/>',
  alert: '<path d="M0-9l9 16h-18z"/><path d="M0-3v5M0 5v.5"/>',
  chip: '<rect x="-7" y="-7" width="14" height="14" rx="2"/><path d="M-3-10v3M0-10v3M3-10v3M-3 7v3M0 7v3M3 7v3M-10-3h3M-10 0h3M-10 3h3M7-3h3M7 0h3M7 3h3"/>',
  cloud: '<path d="M-8 6a6 6 0 0 1-1-12 8 8 0 0 1 15-2 6 6 0 0 1 2 14z"/>',
  search: '<circle cx="-2" cy="-2" r="6"/><path d="M3 3l6 6"/>',
  doc: '<path d="M-6-10h8l5 5v15h-13z"/><path d="M2-10v5h5M-3 2h8M-3 6h8M-3-2h3"/>',
  cycle: '<path d="M8-3a9 9 0 1 0 1 7"/><path d="M9-9v5h-5"/>',
  server: '<rect x="-8" y="-9" width="16" height="7" rx="1.5"/><rect x="-8" y="2" width="16" height="7" rx="1.5"/><circle cx="4" cy="-5.5" r="1"/><circle cx="4" cy="5.5" r="1"/>',
  users: '<circle cx="-4" cy="-3" r="3.5"/><circle cx="5" cy="-2" r="2.8"/><path d="M-10 9a6 6 0 0 1 12 0M2 9a5 5 0 0 1 9-2.5"/>',
  wifi: '<path d="M-9-2a13 13 0 0 1 18 0M-5 2a7 7 0 0 1 10 0M-1.5 6a2 2 0 0 1 3 0"/><circle cx="0" cy="8.5" r="1"/>',
  globe: '<circle cx="0" cy="0" r="9"/><path d="M-9 0h18M0-9v18M-6-5c3 4 9 4 12 0M-6 5c3-4 9-4 12 0"/>',
  gauge: '<path d="M-9 5a9 9 0 1 1 18 0"/><path d="M0 5l6-6"/><circle cx="0" cy="5" r="1.6"/>',
  mail: '<rect x="-9" y="-6" width="18" height="12" rx="1.5"/><path d="M-9-5l9 7 9-7"/>',
  database: '<ellipse cx="0" cy="-6" rx="8" ry="3"/><path d="M-8-6v12a8 3 0 0 0 16 0V-6M-8 0a8 3 0 0 0 16 0"/>',
};
const icon = (k, cls = "") => `<svg class="cc-ic ${cls}" viewBox="-14 -14 28 28" aria-hidden="true">${ICONS[k] || ICONS.shield}</svg>`;

export function validate(c) {
  const errors = [];
  if (!c || !c.type) return ["missing type"];
  if (!["triad", "cycle", "cards", "matrix"].includes(c.type)) errors.push(`unknown type ${c.type}`);
  const items = c.items || [];
  if (c.type === "triad" && items.length !== 3) errors.push("a triad needs exactly 3 items");
  if (c.type === "cycle" && (items.length < 3 || items.length > 7)) errors.push("a cycle needs 3–7 items");
  if (c.type === "cards" && (items.length < 2 || items.length > 8)) errors.push("cards need 2–8 items");
  if (c.type === "matrix" && (items.length < 2 || items.length > 8)) errors.push("a matrix needs 2–8 risks");
  if (c.type === "matrix" && c.appetite != null && !(Number.isInteger(c.appetite) && c.appetite >= 1 && c.appetite <= 25)) errors.push("appetite must be a score from 1 to 25");
  items.forEach((it, i) => {
    if (!it.label) errors.push(`item ${i + 1}: missing label`);
    if (it.icon && !ICONS[it.icon]) errors.push(`item ${i + 1}: no icon "${it.icon}"`);
    if ((c.type === "triad" || c.type === "cards" || c.type === "matrix") && !it.text) errors.push(`item ${i + 1}: needs text`);
    if (c.type === "matrix" && !([it.l, it.i].every(v => Number.isInteger(v) && v >= 1 && v <= 5))) errors.push(`item ${i + 1}: needs likelihood l and impact i from 1 to 5`);
  });
  return errors;
}

// Risk scoring for the matrix: likelihood x impact on 1-5 scales, in four bands (the usual 5 x 5 heat map).
export function riskScore(l, i) { return l * i; }
export function riskBand(score) {
  return score >= 20 ? { key: "critical", label: "Critical" } : score >= 10 ? { key: "high", label: "High" } : score >= 5 ? { key: "medium", label: "Medium" } : { key: "low", label: "Low" };
}

export function mount(el, c) {
  if (c.type === "cards") return mountCards(el, c);
  if (c.type === "matrix") return mountMatrix(el, c);
  return mountNodes(el, c);  // triad and cycle share the click-a-node + caption pattern
}

// Cards: a row of picture tiles (the overview) and one big spotlight beneath for the selected tile, opened on the
// first so the picture explains itself before anyone clicks. `ordered: true` numbers the tiles and joins them
// with arrows, for sets that run in sequence (a flaw's life, a certificate chain, weakest to strongest).
function mountCards(el, c) {
  const n = c.items.length, ordered = !!c.ordered;
  el.innerHTML = `<figure class="concept cc-spot${ordered ? " ordered" : ""}"><figcaption class="cc-title">${esc(c.title)}</figcaption>
    <div class="cs-stage">
      <div class="cs-tiles" role="group" aria-label="${esc(c.title)}">${c.items.map((it, i) => `<button type="button" class="cs-tile" data-i="${i}" aria-pressed="false">
        ${ordered ? `<span class="cs-num" aria-hidden="true">${i + 1}</span>` : ""}${icon(it.icon || "shield", "cs-ic")}<span class="cs-lbl">${esc(it.label)}</span></button>`).join("")}</div>
      <div class="cs-detail" aria-live="polite"></div>
    </div></figure>`;
  const detail = el.querySelector(".cs-detail");
  let cur = 0;
  const select = i => {
    cur = (i + n) % n;
    el.querySelectorAll(".cs-tile").forEach((b, k) => { b.classList.toggle("on", k === cur); b.setAttribute("aria-pressed", String(k === cur)); });
    const it = c.items[cur];
    detail.innerHTML = `${icon(it.icon || "shield", "cs-big")}<div class="cs-body"><span class="eyebrow">${ordered ? "Step" : ""} ${cur + 1} of ${n}</span><b>${esc(it.label)}</b><p>${esc(it.text)}</p>${it.example ? `<p class="cc-eg"><span class="eyebrow">Example</span> ${esc(it.example)}</p>` : ""}</div>
      <div class="cc-step"><button type="button" class="btn ghost sm" data-step="-1">‹ Back</button><button type="button" class="btn brand sm" data-step="1">Next ›</button></div>`;
  };
  el.addEventListener("click", e => { const t = e.target.closest(".cs-tile"); if (t) return select(Number(t.dataset.i)); const b = e.target.closest("[data-step]"); if (b) select(cur + Number(b.dataset.step)); });
  select(0);
}

// Triad: three corners of a triangle. Cycle: a ring with arrows. Both let you select a part to read its detail.
function mountNodes(el, c) {
  const n = c.items.length, triad = c.type === "triad";
  const R = 78, cx = 110, cy = triad ? 104 : 98;
  // triad corners: top, bottom-left, bottom-right. cycle: evenly spaced clockwise from the top.
  const pos = i => {
    const a = triad ? [-90, 150, 30][i] : (-90 + (360 / n) * i);
    return { x: cx + R * Math.cos(a * Math.PI / 180), y: cy + R * Math.sin(a * Math.PI / 180), a };
  };
  const pts = c.items.map((_, i) => pos(i));
  const edges = triad
    ? [[0, 1], [1, 2], [2, 0]].map(([a, b]) => `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"/>`).join("")
    : pts.map((p, i) => { const q = pts[(i + 1) % n]; return `<path d="M${p.x} ${p.y} A${R} ${R} 0 0 1 ${q.x} ${q.y}" marker-end="url(#cc-arrow-${el.id})"/>`; }).join("");
  el.innerHTML = `<figure class="concept cc-nodes"><figcaption class="cc-title">${esc(c.title)}</figcaption>
    <div class="cc-stage">
      <svg viewBox="0 0 220 ${triad ? 210 : 200}" class="cc-svg" role="group" aria-label="${esc(c.title)}: select a part to read more">
        <defs><marker id="cc-arrow-${el.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>
        <g class="cc-edges">${edges}</g>
        ${c.items.map((it, i) => `<g class="cc-node" data-i="${i}" tabindex="0" role="button" aria-label="${esc(it.label)}" transform="translate(${pts[i].x},${pts[i].y})">
          <circle r="26"/>${it.icon ? `<g class="cc-gi" transform="scale(1.15)">${ICONS[it.icon]}</g>` : `<text class="cc-num" y="5">${i + 1}</text>`}
          <text class="cc-node-lbl" y="42">${esc(it.label)}</text></g>`).join("")}
      </svg>
      <div class="cc-side"><div class="cc-detail" id="cc-detail-${el.id}" aria-live="polite"></div>
        <div class="cc-step"><button type="button" class="btn ghost sm" data-step="-1">‹ Back</button><button type="button" class="btn brand sm" data-step="1">Next ›</button></div></div>
    </div></figure>`;
  const svg = el.querySelector(".cc-svg"), detail = el.querySelector(`#cc-detail-${el.id}`), word = triad ? "Goal" : "Stage";
  let cur = 0;
  const select = i => {
    cur = (i + n) % n;
    svg.querySelectorAll(".cc-node").forEach((g, k) => g.classList.toggle("on", k === cur));
    svg.querySelectorAll(".cc-edges > *").forEach((e, k) => e.classList.toggle("on", triad ? false : (k + 1) % n === cur));
    const it = c.items[cur];
    detail.innerHTML = `<span class="eyebrow">${word} ${cur + 1} of ${n}</span><b>${esc(it.label)}</b>${it.text ? `<p>${esc(it.text)}</p>` : ""}${it.example ? `<p class="cc-eg"><span class="eyebrow">Example</span> ${esc(it.example)}</p>` : ""}`;
  };
  svg.addEventListener("click", e => { const g = e.target.closest(".cc-node"); if (g) select(Number(g.dataset.i)); });
  svg.addEventListener("keydown", e => { const g = e.target.closest(".cc-node"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(Number(g.dataset.i)); } });
  el.querySelector(".cc-step").addEventListener("click", e => { const b = e.target.closest("[data-step]"); if (b) select(cur + Number(b.dataset.step)); });
  select(0);
}

// Matrix: a 5 x 5 likelihood x impact heat map with example risks plotted on it. Each risk is a button (in its
// cell and in the list); selecting one shows its score, band, whether it's over the appetite, and its treatment.
function mountMatrix(el, c) {
  const rows = [5, 4, 3, 2, 1], cols = [1, 2, 3, 4, 5], ap = c.appetite;
  const over = s => ap != null && s >= ap;
  const cell = (l, i) => { const s = riskScore(l, i), here = c.items.map((it, k) => ({ it, k })).filter(x => x.it.l === l && x.it.i === i);
    return `<div class="rm-cell rm-${riskBand(s).key}${over(s) ? " over" : ""}"><span class="rm-s" aria-hidden="true">${s}</span>${here.map(x => `<button type="button" class="rm-dot" data-k="${x.k}" tabindex="-1" aria-label="${esc(x.it.label)}: likelihood ${l}, impact ${i}">${x.k + 1}</button>`).join("")}</div>`; };
  el.innerHTML = `<figure class="concept cc-matrix"><figcaption class="cc-title">${esc(c.title)}</figcaption>
    <div class="rm-stage">
      <div class="rm-plot"><span class="rm-ylab" aria-hidden="true">Likelihood →</span>
        <div class="rm-grid">${rows.map(l => `<div class="rm-row">${cols.map(i => cell(l, i)).join("")}</div>`).join("")}</div>
        <span class="rm-xlab" aria-hidden="true">Impact →</span></div>
      <div class="rm-side"><div class="rm-detail" aria-live="polite"></div>
        <ol class="rm-list">${c.items.map((it, k) => `<li><button type="button" class="rm-pick" data-k="${k}"><span class="rm-n" aria-hidden="true">${k + 1}</span>${esc(it.label)}<span class="rm-b rm-${riskBand(riskScore(it.l, it.i)).key}">${riskScore(it.l, it.i)}</span></button></li>`).join("")}</ol>
        <p class="rm-key"><span class="rm-sw rm-low"></span>Low <span class="rm-sw rm-medium"></span>Medium <span class="rm-sw rm-high"></span>High <span class="rm-sw rm-critical"></span>Critical${ap != null ? ` <span class="rm-sw over"></span>At or over the appetite (${ap})` : ""}</p></div>
    </div></figure>`;
  const detail = el.querySelector(".rm-detail");
  const select = k => {
    const it = c.items[k], s = riskScore(it.l, it.i), b = riskBand(s);
    el.querySelectorAll("[data-k]").forEach(x => { const on = Number(x.dataset.k) === k; x.classList.toggle("on", on); if (x.classList.contains("rm-pick")) x.setAttribute("aria-pressed", String(on)); });
    detail.innerHTML = `<span class="eyebrow">Risk ${k + 1} of ${c.items.length}</span><b>${esc(it.label)}</b>
      <p class="rm-sum"><span class="rm-calc">Likelihood ${it.l} × impact ${it.i} = <strong>${s}</strong></span><span class="rm-b rm-${b.key}">${b.label}</span>${ap != null ? `<span class="rm-ap${over(s) ? " over" : ""}">${over(s) ? "Over the appetite: must be treated" : "Within the appetite"}</span>` : ""}</p>
      <p>${esc(it.text)}</p>${it.treat ? `<p class="cc-eg"><span class="eyebrow">Decision</span> ${esc(it.treat)}</p>` : ""}`;
  };
  el.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) select(Number(b.dataset.k)); });
  // Open on the biggest risk, so the picture explains itself before anyone clicks.
  select(c.items.reduce((best, it, k) => riskScore(it.l, it.i) > riskScore(c.items[best].l, c.items[best].i) ? k : best, 0));
}
