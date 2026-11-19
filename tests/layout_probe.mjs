// Layout probes shared by tests/box_check.mjs and tests/deep_check.mjs. Each runs inside the page (page.evaluate).
// measureBoxes: content sticking out of its card or panel, text cut by its own box, text overlapping other text.
// measureEscapes: moved or positioned things (packets, chips, popovers) that ended up outside the diagram they belong
// to, or off the side of the page. measureText: broken output on screen ("undefined", "NaN", "[object Object]").
export function measureBoxes() {
  const out = [], sel = el => { let s = el.tagName.toLowerCase(); if (el.id) return s + "#" + el.id; const c = [...el.classList].slice(0, 2).join("."); return s + (c ? "." + c : ""); };
  const path = el => { const a = []; for (let e = el; e && e !== document.body && a.length < 3; e = e.parentElement) a.unshift(sel(e)); return a.join(" > "); };
  const warped = el => { for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).transform.startsWith("matrix3d")) return true; return false; };  // tilted boxes (the hero screen) overlap as rectangles but not on screen
  const folded = el => { for (let d = el.closest("details"); d; d = d.parentElement?.closest("details")) { if (!d.open) { const sm = d.querySelector(":scope > summary"); if (!(sm && sm.contains(el)) && el !== d) return true; } } return false; };
  const vis = el => { if (folded(el) || warped(el)) return false; const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length; };
  const isBox = el => { const cs = getComputedStyle(el); return (parseFloat(cs.borderRightWidth) > 0 || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent")) && !["HTML", "BODY", "MAIN"].includes(el.tagName); };
  const scrolls = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) return e; } return null; };
  // The visible area: every clipping ancestor, not just the nearest (a prompt with its own ellipsis inside a scrolled terminal).
  const clipOf = el => { let c = null; for (let e = el; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e); if (/(auto|scroll|hidden|clip)/.test(o.overflowX) || /(auto|scroll|hidden|clip)/.test(o.overflowY)) { const r = e.getBoundingClientRect(); c = c ? { left: Math.max(c.left, r.left), right: Math.min(c.right, r.right), top: Math.max(c.top, r.top), bottom: Math.min(c.bottom, r.bottom) } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; } } return c; };
  const clip = (x, c) => { if (!c) return x; const l = Math.max(x.left, c.left), r = Math.min(x.right, c.right), t = Math.max(x.top, c.top), b = Math.min(x.bottom, c.bottom); return r - l > 1 && b - t > 1 ? { left: l, right: r, top: t, bottom: b, width: r - l, height: b - t } : null; };
  const stuck = el => { for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === "sticky") return e; return null; };
  const main = document.querySelector("main"); if (!main) return out;
  const all = [...main.querySelectorAll("*")].filter(e => !e.closest("svg") || e.tagName === "svg").filter(vis);
  for (const el of all) {
    const cs = getComputedStyle(el); if (cs.position === "fixed" || cs.position === "absolute" || el.closest(".sr, .sr-only")) continue;
    const r0 = el.getBoundingClientRect(); if (r0.width < 1 || r0.height < 1) continue;
    let r = { left: r0.left, right: r0.right };
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { const cb = clipOf(el); for (const tn of el.childNodes) { if (tn.nodeType !== 3) continue; const rg = document.createRange(); rg.selectNodeContents(tn); for (const x0 of rg.getClientRects()) { const x = clip(x0, cb); if (x && x.width > 1) { r.left = Math.min(r.left, x.left); r.right = Math.max(r.right, x.right); } } } }
    // nearest boxed ancestor
    let box = null; for (let e = el.parentElement; e && e !== main; e = e.parentElement) { if (isBox(e)) { box = e; break; } }
    if (box) {
      const sc = scrolls(el); if (!(sc && (box.contains(sc) && sc !== box ? true : false))) {
        const br = box.getBoundingClientRect(), over = Math.max(r.right - br.right, br.left - r.left);
        if (over > 1.5 && !(sc && sc === box)) out.push(`${path(el)} sticks out of ${sel(box)} by ${Math.round(over)}px`);
      }
    }
    // text cut by its own box
    if (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && el.tagName !== "PRE" && el.children.length === 0 && el.textContent.trim() && (() => { const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect().width > el.clientWidth + 2; })()) out.push(`${path(el)} text cut off (${el.scrollWidth} > ${el.clientWidth})`);
  }
  // overlapping text leaves
  const leaves = all.filter(e => !e.closest("svg") && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(e).position !== "absolute" && getComputedStyle(e).position !== "fixed");
  const rects = leaves.map(e => { const cb = clipOf(e), all = []; for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); all.push(...[...rg.getClientRects()].map(x => clip(x, cb)).filter(x => x && x.width > 2 && x.height > 2)); } return all; });
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
    if (stuck(leaves[i]) !== stuck(leaves[j])) continue;  // a sticky bar floats over the page by design
    hit: for (const a of rects[i]) for (const c of rects[j]) { const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (w > 3 && h > 3) { out.push(`${path(leaves[i])} overlaps ${path(leaves[j])}`); break hit; } }
  }
  return [...new Set(out)];
}

export function measureEscapes() {
  const out = [], main = document.querySelector("main"); if (!main) return out;
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) return s + "#" + el.id; const c = [...el.classList].slice(0, 2).join("."); return s + (c ? "." + c : ""); };
  const path = el => { const a = []; for (let e = el; e && e !== document.body && a.length < 3; e = e.parentElement) a.unshift(sel(e)); return a.join(" > "); };
  const clipped = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e); if (/(hidden|clip)/.test(o.overflowX) && /(hidden|clip)/.test(o.overflowY)) return true; } return false; };
  const mr = main.getBoundingClientRect();
  for (const el of main.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName !== "svg") continue;
    const cs = getComputedStyle(el);
    const moved = cs.position === "absolute" || cs.position === "fixed" || (cs.transform !== "none" && !cs.transform.startsWith("matrix3d"));
    if (!moved || cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0 || el.closest("[hidden], .sr, .sr-only")) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (cs.position === "fixed") { if (r.right > innerWidth + 2 || r.left < -2) out.push(`${path(el)} is off the side of the screen`); continue; }
    if (clipped(el)) continue;
    if (r.left < mr.left - 4 || r.right > mr.right + 4) out.push(`${path(el)} sits outside the page column (${Math.round(r.left)}..${Math.round(r.right)})`);
    const op = el.offsetParent;
    if (op && op !== document.body && op !== main && cs.position === "absolute") {
      const o = op.getBoundingClientRect();
      const meets = Math.min(r.right, o.right) > Math.max(r.left, o.left) && Math.min(r.bottom, o.bottom) > Math.max(r.top, o.top);
      if (!meets && o.width > 0) out.push(`${path(el)} is detached from ${sel(op)} it belongs to`);
    }
  }
  return [...new Set(out)];
}

export function measureText() {
  const main = document.querySelector("main"); if (!main) return [];
  const t = main.innerText, out = [];
  for (const [re, name] of [[/\bundefined\b/, "undefined"], [/\bNaN\b/, "NaN"], [/\[object Object\]/, "[object Object]"], [/(?<!\/dev\/|for |a |is |to )\bnull\b(?! (byte|session|route|pointer|cipher|hypothesis|value|before))/, "null"], [/\$\{/, "${"]])
    if (re.test(t)) { const i = t.search(re); out.push(`shows "${name}": …${t.slice(Math.max(0, i - 40), i + 30).replace(/\s+/g, " ")}…`); }
  return out;
}
