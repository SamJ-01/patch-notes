/* ---------- glossary: auto-explain jargon ---------- */
const GLOSS = Object.fromEntries(DATA.glossary.map(g => [g.id, g]));
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCH = (() => {
  const cs = new Map(), ci = new Map(), rx = [];
  DATA.glossary.forEach(g => {
    if (g.regex) rx.push({ re: new RegExp(g.regex, "g"), id: g.id });
    if (g.auto === false) return;
    g.aliases.forEach(a => /[A-Z]/.test(a) ? cs.set(a, g.id) : ci.set(a.toLowerCase(), g.id));
  });
  const make = (map, flags, plural) => {
    const keys = [...map.keys()].sort((a, b) => b.length - a.length);
    // Prefix group instead of a lookbehind so older Safari (< 16.4) can parse it.
    return new RegExp(`(^|[^A-Za-z0-9_])(${keys.map(k => reEsc(k) + (plural && /[a-z]$/.test(k) ? "(?:e?s)?" : "")).join("|")})(?![A-Za-z0-9_])`, flags);
  };
  return { cs, ci, rx, csRe: make(cs, "g", false), ciRe: make(ci, "gi", true) };
})();
function findTerms(text) {
  const hits = [];
  for (const m of text.matchAll(MATCH.csRe)) hits.push({ i: m.index + m[1].length, len: m[2].length, id: MATCH.cs.get(m[2]) });
  for (const m of text.matchAll(MATCH.ciRe)) {
    const w = m[2].toLowerCase();
    const id = MATCH.ci.get(w) || MATCH.ci.get(w.replace(/es$/, "")) || MATCH.ci.get(w.replace(/s$/, ""));
    hits.push({ i: m.index + m[1].length, len: m[2].length, id });
  }
  MATCH.rx.forEach(({ re, id }) => { for (const m of text.matchAll(re)) hits.push({ i: m.index, len: m[0].length, id }); });
  hits.sort((a, b) => a.i - b.i || b.len - a.len);
  const out = []; let end = 0;
  for (const h of hits) if (h.id && h.i >= end) { out.push(h); end = h.i + h.len; }
  return out;
}
// Escape text and wrap known jargon in explain-on-hover buttons. `seen` stops repeats within one block.
function gloss(text, max = 4, seen = new Set()) {
  text = String(text ?? "");
  let html = "", pos = 0, n = 0;
  for (const h of findTerms(text)) {
    if (n >= max || seen.has(h.id)) continue;
    seen.add(h.id); n++;
    html += esc(text.slice(pos, h.i)) + `<button type="button" class="term" data-g="${h.id}" aria-expanded="false">${esc(text.substr(h.i, h.len))}</button>`;
    pos = h.i + h.len;
  }
  return html + esc(text.slice(pos));
}
// Lab, mission and Agency modules underline their text through this hook (they fall back to plain text without it).
globalThis.PN_gloss = gloss;

const pop = $("pop");
let popAnchor = null, popPinned = false, popTimer = null;
function learnTerm(id) { if (!P.terms[id]) { P.terms[id] = 1; award(2, "New term", { quiet: true }); } }
function popHtml(id) {
  const g = GLOSS[id];
  const see = (g.see || []).filter(x => GLOSS[x]);
  return `<button class="x" aria-label="Close">×</button>
    <div class="pk">${esc(g.kind)}</div><h4>${esc(g.term)}</h4><p>${esc(g.short)}</p>${g.more ? `<p class="more-t">${esc(g.more)}</p>` : ""}
    ${see.length ? `<div class="see">Related: ${see.map(x => `<button data-see="${x}">${esc(GLOSS[x].term)}</button>`).join("")}</div>` : ""}
    <div class="acts">${g.lesson && LESSON[g.lesson] ? `<a href="#lesson-${esc(g.lesson)}">Lesson: ${esc(LESSON[g.lesson].title)} →</a>` : ""}<a href="#glossary" data-gl-focus="${esc(id)}">Full glossary</a></div>`;
}
function placePop() {
  if (!popAnchor || pop.hidden) return;
  if (innerWidth < 640) { pop.classList.add("sheet"); return; }
  pop.classList.remove("sheet");
  const r = popAnchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let top = r.bottom + 8;
  if (top + h > innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8;
  pop.style.left = Math.min(Math.max(12, r.left), innerWidth - w - 12) + "px";
  pop.style.top = top + "px";
}
function openPop(anchor, id, pinned) {
  clearTimeout(popTimer);
  if (popAnchor && popAnchor !== anchor) popAnchor.setAttribute("aria-expanded", "false");
  popAnchor = anchor; popPinned = pinned;
  anchor.setAttribute("aria-expanded", "true");
  pop.innerHTML = popHtml(id); pop.hidden = false; placePop();
}
function closePop(refocus) {
  clearTimeout(popTimer);
  if (pop.hidden) return;
  pop.hidden = true;
  if (popAnchor) { popAnchor.setAttribute("aria-expanded", "false"); if (refocus) popAnchor.focus(); }
  popAnchor = null; popPinned = false;
}
document.addEventListener("pointerover", e => {
  if (e.pointerType !== "mouse") return;
  const t = e.target.closest(".term[data-g]");
  if (t && !popPinned && innerWidth >= 640) { clearTimeout(popTimer); popTimer = setTimeout(() => openPop(t, t.dataset.g, false), 160); }
  else if (e.target.closest("#pop") && !pop.hidden) { clearTimeout(popTimer); popPinned = true; }
});
document.addEventListener("pointerout", e => {
  if (e.pointerType !== "mouse" || popPinned) return;
  if (e.target.closest(".term[data-g]")) { clearTimeout(popTimer); popTimer = setTimeout(() => closePop(), 350); }
});
document.addEventListener("click", e => {
  const t = e.target.closest(".term[data-g]");
  if (t) { e.preventDefault(); (popAnchor === t && popPinned) ? closePop() : (openPop(t, t.dataset.g, true), learnTerm(t.dataset.g)); return; }
  const see = e.target.closest("[data-see]");
  if (see) { pop.innerHTML = popHtml(see.dataset.see); popPinned = true; placePop(); learnTerm(see.dataset.see); return; }
  if (e.target.closest("#pop .x")) { closePop(true); return; }
  const gf = e.target.closest("[data-gl-focus]");
  if (gf) { GLS.focus = gf.dataset.glFocus; GLS.q = ""; GLS.kind = "All"; closePop(); if (location.hash === "#glossary") route(); return; }
  if (!e.target.closest("#pop")) closePop();
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") closePop(true); });
addEventListener("scroll", () => popPinned ? placePop() : closePop(), { passive: true });
addEventListener("resize", placePop);
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.open || !d.dataset || !d.dataset.read || P.read[d.dataset.read]) return;
  P.read[d.dataset.read] = todayStr(); award(2, "Read an explanation", { quiet: count(P.read) % 5 !== 1 });
}, true);

function shuffle(arr, rand = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Small seeded random generator, so a shuffle can be the same all day (the daily challenge) yet differ tomorrow.
const seededRand = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
// Quiz questions are written with the answer wherever the author put it; mix the options so position gives nothing away.
const mixOptions = (q, rand = Math.random) => { const order = shuffle(q.options.map((_, i) => i), rand); return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) }; };

