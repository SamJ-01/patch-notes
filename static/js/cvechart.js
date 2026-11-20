// CVE Radar's "What to patch first" chart (20 Nov, the owner: a visual that shows the point of the page at a glance).
// Every scored CVE is a dot: right = worse if exploited (CVSS 0-10), up = more likely to be attacked in 30 days (EPSS,
// log scale 0.01% to 100%). Red = on CISA's KEV list, attackers already use it; everything else is one neutral grey,
// because position already shows "likely" (above the 10% line) and "high/critical" (right of 7 and 9). One status
// colour, not five: the five priority colours fail colour-blind separation (dataviz validator, 20 Nov).
// Pure maths (plotPoints, epssY, ticks) is tested in tests/cvechart.test.mjs; mount() draws.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const BOX = { W: 720, H: 380, l: 58, r: 18, t: 18, b: 46 };
export const EPSS_MIN = 0.0001;  // 0.01%: anything lower sits on the floor of the chart
export const cvssX = (v, B = BOX) => B.l + (v / 10) * (B.W - B.l - B.r);
export function epssY(p, B = BOX) {
  const v = Math.log10(Math.max(EPSS_MIN, Math.min(1, p))), lo = Math.log10(EPSS_MIN);
  return B.t + (1 - (v - lo) / (0 - lo)) * (B.H - B.t - B.b);
}
export const Y_TICKS = [[0.0001, "0.01%"], [0.001, "0.1%"], [0.01, "1%"], [0.1, "10%"], [1, "100%"]];
export const X_TICKS = [0, 2, 4, 6, 8, 10];

// Only CVEs with both scores can be placed; the rest are counted so the chart can say so.
export function plotPoints(rows, B = BOX) {
  const dots = [], skipped = { total: 0 };
  for (const c of rows) {
    if (c.cvss == null || c.epss == null) { skipped.total++; continue; }
    dots.push({ id: c.id, x: +cvssX(c.cvss, B).toFixed(1), y: +epssY(c.epss, B).toFixed(1), kev: Boolean(c.kev), cvss: c.cvss, epss: c.epss,
      title: c.kev?.name || (c.description || "").slice(0, 90) });
  }
  // Draw the grey mass first and the exploited ones last, so they're never hidden.
  dots.sort((a, b) => a.kev - b.kev);
  return { dots, skipped: skipped.total, kev: dots.filter(d => d.kev).length };
}

const pct = p => (p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(2)}%`);

export function mount(el, rows, { onPick = () => {} } = {}) {
  const B = BOX, P = plotPoints(rows, B), x7 = cvssX(7), x9 = cvssX(9), y10 = epssY(0.1), right = B.W - B.r, bottom = B.H - B.b;
  el.innerHTML = `<div class="cvc-head"><h2>What to patch first</h2>
      <p class="muted">Each dot is one vulnerability. <b>Right</b>: worse if exploited (CVSS). <b>Up</b>: more likely to be attacked in the next 30 days (EPSS). <b class="cvc-red">Red</b>: attackers are already using it.</p></div>
    <div class="cvc-wrap"><svg class="cvc" viewBox="0 0 ${B.W} ${B.H}" role="group" aria-label="${esc(`Scatter of ${P.dots.length.toLocaleString()} vulnerabilities by severity and likelihood. ${P.kev} are exploited. The list below has every one.`)}">
      <rect class="cvc-hot" x="${x7}" y="${B.t}" width="${right - x7}" height="${y10 - B.t}" rx="6"/>
      ${Y_TICKS.map(([p, l]) => `<line class="cvc-grid" x1="${B.l}" x2="${right}" y1="${epssY(p)}" y2="${epssY(p)}"/><text class="cvc-tick" x="${B.l - 8}" y="${epssY(p) + 4}" text-anchor="end">${l}</text>`).join("")}
      ${X_TICKS.map(v => `<text class="cvc-tick" x="${cvssX(v)}" y="${bottom + 18}" text-anchor="middle">${v}</text>`).join("")}
      <line class="cvc-th" x1="${x7}" x2="${x7}" y1="${B.t}" y2="${bottom}"/><line class="cvc-th" x1="${x9}" x2="${x9}" y1="${B.t}" y2="${bottom}"/>
      <line class="cvc-th" x1="${B.l}" x2="${right}" y1="${y10}" y2="${y10}"/>
      <text class="cvc-th-l" x="${x7 + 4}" y="${bottom - 6}">high 7</text><text class="cvc-th-l" x="${right - 2}" y="${bottom - 6}" text-anchor="end">critical 9</text>
      <text class="cvc-th-l" x="${B.l + 6}" y="${y10 - 6}">likely 10%</text>
      <text class="cvc-zone" x="${right - 8}" y="${B.t + 18}" text-anchor="end">Patch first</text>
      <text class="cvc-zone dim" x="${right - 8}" y="${bottom - 22}" text-anchor="end">Severe, not attacked yet</text>
      <text class="cvc-axis" x="${(B.l + right) / 2}" y="${B.H - 6}" text-anchor="middle">Severity if exploited (CVSS) →</text>
      <text class="cvc-axis" transform="translate(14 ${(B.t + bottom) / 2}) rotate(-90)" text-anchor="middle">Chance of attack (EPSS) →</text>
      <g class="cvc-dots">${P.dots.map((d, i) => d.kev
        ? `<circle class="cvc-kev" data-i="${i}" cx="${d.x}" cy="${d.y}" r="5.5" tabindex="0" role="button" aria-label="${esc(`${d.id}, exploited: ${d.title}. CVSS ${d.cvss}, EPSS ${pct(d.epss)}. Show it in the list.`)}"/>`
        : `<circle class="cvc-dot" data-i="${i}" cx="${d.x}" cy="${d.y}" r="2.4"/>`).join("")}</g>
    </svg><div class="cvc-tip" role="status" hidden></div></div>
    <p class="cvc-legend"><span><i class="cvc-k" aria-hidden="true"></i>Exploited (on CISA's KEV list): ${P.kev}</span><span><i class="cvc-o" aria-hidden="true"></i>Everything else: ${(P.dots.length - P.kev).toLocaleString()}</span>${P.skipped ? `<span class="muted">${P.skipped.toLocaleString()} not scored yet aren't shown</span>` : ""}<span class="muted">Hover a dot for details; click to find it in the list.</span></p>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".cvc-tip"), wrap = el.querySelector(".cvc-wrap");
  const show = c => {
    const d = P.dots[Number(c.dataset.i)], r = c.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(d.id)}</b>${d.kev ? ' <span class="cvc-red">exploited</span>' : ""}<span>${esc(d.title)}</span><span class="mono">CVSS ${d.cvss} · EPSS ${pct(d.epss)}</span>`;
    tip.hidden = false;
    // Open on the side away from the dot, so it never covers the dot it describes.
    const cx = r.left - w.left + r.width / 2, cy = r.top - w.top + r.height / 2, rightHalf = cx > w.width / 2;
    const left = rightHalf ? cx - tip.offsetWidth - 14 : cx + 14;
    tip.style.left = `${Math.min(Math.max(left, 4), w.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${Math.min(Math.max(cy - tip.offsetHeight / 2, 4), w.height - tip.offsetHeight - 4)}px`;
  };
  // Hit target bigger than the dot: the nearest dot within 10 px of the pointer.
  svg.addEventListener("pointermove", e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = null, bd = 100; const circles = svg.querySelectorAll("circle");
    for (let i = circles.length - 1; i >= 0; i--) { const c = circles[i], dx = c.cx.baseVal.value - p.x, dy = c.cy.baseVal.value - p.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } }
    svg.querySelectorAll(".on").forEach(c => c.classList.remove("on"));
    if (best) { best.classList.add("on"); show(best); svg.style.cursor = "pointer"; svg.dataset.pick = best.dataset.i; } else { tip.hidden = true; svg.style.cursor = ""; delete svg.dataset.pick; }
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; svg.querySelectorAll(".on").forEach(c => c.classList.remove("on")); delete svg.dataset.pick; });
  svg.addEventListener("click", () => { if (svg.dataset.pick != null) onPick(P.dots[Number(svg.dataset.pick)].id); });
  svg.addEventListener("focusin", e => { if (e.target.dataset?.i != null) show(e.target); });
  svg.addEventListener("focusout", () => { tip.hidden = true; });
  svg.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset?.i != null) { e.preventDefault(); onPick(P.dots[Number(e.target.dataset.i)].id); } });
  return P;
}
