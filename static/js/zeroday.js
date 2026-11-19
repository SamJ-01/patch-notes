// The life of a flaw as a timeline you can drag: shipped, quietly exploited (the zero-day window, when no patch exists),
// fixed and disclosed, then the window that's yours: the days until YOU patch. Attacks are drawn as an illustrative
// curve: a trickle of targeted use before disclosure, then a surge once the fix (and so the flaw) is public. The rules
// (exposure, attackVolume) are pure and tested in tests/zeroday.test.mjs; mount() only draws them.
import { fitSvgText } from "./svgfit.js";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Days on one illustrative timeline (simplified; real cases vary widely). Day 0 is when the fix is released.
export const EVENTS = { exploited: -45, reported: -15, fixed: 0 };
export const SPAN = { from: -60, to: 90 };  // the part of the timeline drawn
export const CHOICES = [
  { days: 2, label: "2 days", note: "an emergency patch, for a flaw already being exploited" },
  { days: 14, label: "2 weeks", note: "the NCSC's Cyber Essentials limit for critical and high-risk fixes" },
  { days: 30, label: "30 days", note: "a monthly patch cycle" },
  { days: 75, label: "75 days", note: "a quarter that slipped" },
];

// Illustrative attacks per day: none before the flaw is found, a trickle of targeted use while it's a zero-day, then a
// surge after disclosure (peaking on day 3) that decays to a steady background of scanners.
export function attackVolume(day) {
  if (day < EVENTS.exploited) return 0;
  if (day < EVENTS.fixed) return 2;
  const t = day - EVENTS.fixed;
  return t < 3 ? 20 + t * 27 : Math.max(8, Math.round(100 * Math.pow(0.5, (t - 3) / 7)));
}

// Exposure if you patch `patchAfter` days after the fix is released (clamped to the drawn span).
export function exposure(patchAfter) {
  const n = Math.max(0, Math.min(SPAN.to, Math.round(Number(patchAfter) || 0)));
  let before = 0, after = 0, total = 0;
  for (let d = SPAN.from; d < SPAN.to; d++) {
    const v = attackVolume(d); total += v;
    if (d < EVENTS.fixed) before += v; else if (d < n) after += v;
  }
  return { patchAfter: n, zeroDayDays: EVENTS.fixed - EVENTS.exploited, nDayDays: n, attacksFaced: before + after, attacksTotal: total,
    shareFaced: Math.round((before + after) / total * 100), zeroDayShare: Math.round(before / total * 100) };
}

export function mount(el, { head = true } = {}) {
  let n = 30;
  const W = 760, H = 212, L = 30, R = W - 20, base = 150, top = 42;
  const x = d => L + (d - SPAN.from) / (SPAN.to - SPAN.from) * (R - L);
  const peak = Math.max(...Array.from({ length: SPAN.to - SPAN.from }, (_, k) => attackVolume(SPAN.from + k)));
  const y = v => base - v / peak * (base - top);
  const curve = Array.from({ length: SPAN.to - SPAN.from + 1 }, (_, k) => { const d = SPAN.from + k; return `${x(d).toFixed(1)},${y(attackVolume(d)).toFixed(1)}`; });
  el.innerHTML = `<figure class="xpl zd">
    ${head ? `<div class="xpl-head"><div class="eyebrow">See it at work</div><b>The life of a flaw</b></div>` : ""}
    <svg class="zd-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A timeline: the flaw is exploited 45 days before a fix exists, the fix is released on day 0, and attacks surge after that until you patch."></svg>
    <div class="zd-ctl">
      <label for="zd-n"><b>You patch</b> <span id="zd-nv"></span> after the fix is out</label>
      <input type="range" id="zd-n" min="0" max="90" step="1" value="${n}" aria-describedby="zd-read">
      <div class="row zd-chips" role="group" aria-label="Typical patch times">${CHOICES.map(c => `<button type="button" class="chip" data-n="${c.days}">${esc(c.label)}</button>`).join("")}</div>
    </div>
    <div class="zd-read" id="zd-read" aria-live="polite"></div>
    <p class="muted xpl-foot">Illustrative timeline and attack curve, not data from one case. Log4Shell, for example, was exploited within hours of going public.</p>
  </figure>`;
  const svg = el.querySelector(".zd-svg"), read = el.querySelector("#zd-read"), input = el.querySelector("#zd-n");
  const paint = () => {
    const e = exposure(n), you = x(n), fix = x(EVENTS.fixed), z0 = x(EVENTS.exploited);
    const fill = (from, to, cls) => { const pts = curve.filter(p => { const px = Number(p.split(",")[0]); return px >= from - 0.01 && px <= to + 0.01; }); return pts.length ? `<polygon class="${cls}" points="${from},${base} ${pts.join(" ")} ${to},${base}"/>` : ""; };
    svg.innerHTML = `
      <rect class="zd-band zero" x="${z0}" y="${top - 18}" width="${fix - z0}" height="${base - top + 18}"/>
      <rect class="zd-band nday" x="${fix}" y="${top - 18}" width="${Math.max(0, you - fix)}" height="${base - top + 18}"/>
      <text class="zd-band-lbl zero" x="${fix - 8}" y="${top - 4}" text-anchor="end">Zero-day: no fix exists</text>
      ${n >= 8 ? `<text class="zd-band-lbl nday" x="${fix + 8}" y="${top - 4}">${n >= 30 ? "Fix out, not applied" : "Not applied"}</text>` : ""}
      ${fill(x(SPAN.from), you, "zd-hit")}${fill(you, x(SPAN.to), "zd-miss")}
      <polyline class="zd-curve" points="${curve.join(" ")}"/>
      <line class="zd-axis" x1="${L}" y1="${base}" x2="${R}" y2="${base}"/>
      ${[[EVENTS.exploited, "Attackers find it"], [EVENTS.reported, "Reported to vendor"], [EVENTS.fixed, "Fix released, flaw public"]].map(([d, t], k) =>
        `<line class="zd-tick" x1="${x(d)}" y1="${base}" x2="${x(d)}" y2="${base + 8}"/><text class="zd-ev" x="${x(d)}" y="${base + 24 + (k % 2) * 16}" text-anchor="middle">${esc(t)}</text>`).join("")}
      <line class="zd-you" x1="${you}" y1="${top - 18}" x2="${you}" y2="${base + 8}"/>
      <text class="zd-you-lbl" x="${you}" y="${H - 6}" text-anchor="middle">You patch</text>`;
    el.querySelector("#zd-nv").textContent = `${n} day${n === 1 ? "" : "s"}`;
    const c = CHOICES.find(k => k.days === n);
    read.innerHTML = `<p><b>You'd face about ${e.shareFaced}% of the attacks.</b> ${e.zeroDayShare}% came during the ${e.zeroDayDays}-day zero-day, when no patch existed: only other defences (detection, segmentation, a workaround) help there. The rest came in the ${e.nDayDays} day${e.nDayDays === 1 ? "" : "s"} the fix was out and not applied${c ? `: ${esc(c.note)}` : ""}.</p>`;
    fitSvgText(svg, 10);
    input.value = n;
    el.querySelectorAll("[data-n]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.n) === n)));
  };
  input.addEventListener("input", () => { n = Number(input.value); paint(); });
  el.addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (b) { n = Number(b.dataset.n); paint(); } });
  paint();
  // Phone sizes draw the labels larger (site.css), so refit when that switches.
  if (typeof matchMedia === "function") matchMedia("(max-width: 520px)").addEventListener?.("change", paint);
  return { get n() { return n; } };
}
