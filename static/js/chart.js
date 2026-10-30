// Small, dependency-free charts for turning tables of numbers into a picture a learner reads at a glance.
// Pure string builders (barsSVG, lineSVG) so they can be tested without a browser; mount() injects one and
// adds a screen-reader list of the same values, because a chart must carry its data to assistive tech too.
// Colours come from CSS tokens (--good, --bad, --warn, --brand, --sun), so charts match light and dark.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TONE = { good: "var(--good)", bad: "var(--bad)", warn: "var(--sun)", brand: "var(--brand)", sun: "var(--sun)", muted: "var(--muted)" };
const colour = t => TONE[t] || "var(--brand)";
const num = (v, unit = "") => `${Number.isInteger(v) ? v.toLocaleString("en-GB") : v}${unit}`;

// Shared frame. W/H are the viewBox; the SVG scales to its container width.
const W = 640, H = 220, PAD_L = 48, PAD_R = 14, PAD_T = 16, PAD_B = 46;
const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

// A vertical bar chart. spec: { title?, caption?, unit?, series: [{ label, value, tone? }], threshold?: { value, label } }.
export function barsSVG(spec) {
  const s = spec.series || [];
  if (!s.length) return "";
  const vals = s.map(d => d.value), top = Math.max(spec.threshold?.value || 0, ...vals) || 1;
  const niceTop = niceCeil(top);
  const x = i => PAD_L + (plotW / s.length) * (i + 0.5);
  const y = v => PAD_T + plotH * (1 - v / niceTop);
  const bw = Math.min(54, (plotW / s.length) * 0.62);
  const grid = gridLines(niceTop).map(g => `<line class="ch-grid" x1="${PAD_L}" y1="${y(g)}" x2="${W - PAD_R}" y2="${y(g)}"/>` +
    `<text class="ch-ytick" x="${PAD_L - 8}" y="${y(g) + 4}" text-anchor="end">${esc(num(g, spec.unit || ""))}</text>`).join("");
  const bars = s.map((d, i) => {
    const h = Math.max(0, plotH - (y(d.value) - PAD_T));
    return `<rect class="ch-bar" x="${x(i) - bw / 2}" y="${y(d.value)}" width="${bw}" height="${h}" rx="3" fill="${colour(d.tone)}"/>` +
      `<text class="ch-xtick" x="${x(i)}" y="${H - PAD_B + 18}" text-anchor="middle">${esc(d.label)}</text>`;
  }).join("");
  const thr = spec.threshold ? `<line class="ch-threshold" x1="${PAD_L}" y1="${y(spec.threshold.value)}" x2="${W - PAD_R}" y2="${y(spec.threshold.value)}"/>` +
    `<text class="ch-thlbl" x="${W - PAD_R}" y="${y(spec.threshold.value) - 5}" text-anchor="end">${esc(spec.threshold.label)}</text>` : "";
  return frame(spec, `${grid}${thr}${bars}`);
}

// A single line (trend over time). spec: { title?, caption?, unit?, points: [{ label, value }], threshold?, tone? }.
export function lineSVG(spec) {
  const p = spec.points || [];
  if (!p.length) return "";
  const vals = p.map(d => d.value), top = niceCeil(Math.max(spec.threshold?.value || 0, ...vals) || 1);
  const x = i => PAD_L + (p.length === 1 ? plotW / 2 : (plotW * i) / (p.length - 1));
  const y = v => PAD_T + plotH * (1 - v / top);
  const grid = gridLines(top).map(g => `<line class="ch-grid" x1="${PAD_L}" y1="${y(g)}" x2="${W - PAD_R}" y2="${y(g)}"/>` +
    `<text class="ch-ytick" x="${PAD_L - 8}" y="${y(g) + 4}" text-anchor="end">${esc(num(g, spec.unit || ""))}</text>`).join("");
  const d = p.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(pt.value).toFixed(1)}`).join(" ");
  const dots = p.map((pt, i) => `<circle class="ch-dot" cx="${x(i).toFixed(1)}" cy="${y(pt.value).toFixed(1)}" r="3.2" fill="${colour(spec.tone)}"/>`).join("");
  const labs = p.map((pt, i) => `<text class="ch-xtick" x="${x(i)}" y="${H - PAD_B + 18}" text-anchor="middle">${esc(pt.label)}</text>`).join("");
  const thr = spec.threshold ? `<line class="ch-threshold" x1="${PAD_L}" y1="${y(spec.threshold.value)}" x2="${W - PAD_R}" y2="${y(spec.threshold.value)}"/>` +
    `<text class="ch-thlbl" x="${W - PAD_R}" y="${y(spec.threshold.value) - 5}" text-anchor="end">${esc(spec.threshold.label)}</text>` : "";
  return frame(spec, `${grid}${thr}<path class="ch-line" pathLength="1" d="${d}" fill="none" stroke="${colour(spec.tone)}"/>${dots}${labs}`);
}

// Round a maximum up to a readable axis top (1, 2, 5 x 10^n).
function niceCeil(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v))), f = v / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * mag;
}
function gridLines(top) { return [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(top * f)); }

// The SVG is decorative (aria-hidden); the figcaption and an sr-only list carry the data for screen readers.
function frame(spec, inner) {
  return `<svg viewBox="0 0 ${W} ${H}" class="ch-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export function chartSVG(spec) { return spec.type === "line" ? lineSVG(spec) : barsSVG(spec); }

// The data behind the chart, as text, for the screen-reader list and for tests.
export function readout(spec) {
  const items = spec.type === "line" ? spec.points : spec.series;
  return (items || []).map(d => `${d.label}: ${num(d.value, spec.unit || "")}`);
}

export function mount(el, spec) {
  if (!el || !spec) return;
  const data = readout(spec);
  el.innerHTML = `<figure class="gchart">${spec.title ? `<figcaption class="gchart-title">${esc(spec.title)}</figcaption>` : ""}` +
    chartSVG(spec) +
    (spec.key ? `<ul class="gchart-key">${spec.key.map(k => `<li><span class="ch-swatch" style="background:${colour(k.tone)}"></span>${esc(k.label)}</li>`).join("")}</ul>` : "") +
    (spec.caption ? `<p class="gchart-cap muted">${esc(spec.caption)}</p>` : "") +
    `<ul class="sr-only">${data.map(d => `<li>${esc(d)}</li>`).join("")}</ul></figure>`;
}
