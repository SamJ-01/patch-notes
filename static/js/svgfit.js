// Keep every label inside its drawing with room to breathe. On a phone the labels are drawn larger (site.css), so a
// centred address near an edge ran off it and an IP sat on top of the MAC under it (18 Nov: the ARP stop in the journey labs; also used by the zero-day timeline). After a
// scene draws, and whenever its text or the phone breakpoint changes: pull labels back inside the edges, move a label
// down off the one above it, and make the drawing taller if that needs more room. Labels inside transformed groups
// (device drawings) are left alone. Positions are reset each time, so it never drifts.
export function fitSvgText(svg, pad = 16) {
  const vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || !vb.width) return;
  if (svg.dataset.h0 == null) svg.dataset.h0 = vb.height;
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${svg.dataset.h0}`);
  const texts = [...svg.querySelectorAll("text")].filter(t => t.textContent.trim() && !t.closest("[transform]") && t.getAttribute("x") !== null);
  for (const t of texts) {
    if (t.dataset.x0 == null) { t.dataset.x0 = t.getAttribute("x"); t.dataset.y0 = t.getAttribute("y"); }
    t.setAttribute("x", t.dataset.x0); t.setAttribute("y", t.dataset.y0);
  }
  const box = t => { try { return t.getBBox(); } catch { return null; } };
  for (const t of texts) {
    const b = box(t); if (!b || !b.width) continue;
    const lo = vb.x + pad, hi = vb.x + vb.width - pad;
    const dx = b.x < lo ? lo - b.x : b.x + b.width > hi ? hi - (b.x + b.width) : 0;
    if (dx) t.setAttribute("x", Number(t.getAttribute("x")) + dx);
  }
  const placed = [];
  for (const t of texts.slice().sort((p, q) => (box(p)?.y ?? 0) - (box(q)?.y ?? 0))) {
    let b = box(t); if (!b || !b.width) continue;
    for (let guard = 0; guard < 6; guard++) {
      const hit = placed.find(o => Math.min(o.x + o.width, b.x + b.width) - Math.max(o.x, b.x) > 2 && Math.min(o.y + o.height, b.y + b.height) - Math.max(o.y, b.y) > 1);
      if (!hit) break;
      t.setAttribute("y", Number(t.getAttribute("y")) + (hit.y + hit.height + 2 - b.y)); b = box(t);
    }
    placed.push(b);
  }
  // Grow the drawing (and any zone box drawn to its full height) if labels were moved below the bottom.
  const h0 = Number(svg.dataset.h0), bottom = Math.max(0, ...placed.map(b => b.y + b.height + pad));
  const grow = Math.max(0, Math.ceil(bottom - (vb.y + h0)));
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${h0 + grow}`);
  for (const z of svg.querySelectorAll("rect.jr-zone")) {
    if (z.dataset.h0 == null) z.dataset.h0 = z.getAttribute("height");
    const zb = Number(z.getAttribute("y")) + Number(z.dataset.h0);
    z.setAttribute("height", Number(z.dataset.h0) + (zb >= vb.y + h0 - 12 ? grow : 0));
  }
}

