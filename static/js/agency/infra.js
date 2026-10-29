// A small "what you're watching" infrastructure map for a shift's client file: the client's key assets, the way
// in (internet/attacker), and the SOC/SIEM that watches them. Pure string output from the shift's `infra` data,
// so it's cheap to draw. Decorative SVG (aria-hidden); the caption and the client file carry the meaning.
// Layout is explicit: each node gives a grid [x, y]; links join node centres. Icons are drawn in currentColor.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Line icons on a 24-box centred at 0 (same style as the lesson concept icons).
const ICONS = {
  globe: '<circle cx="0" cy="0" r="8"/><path d="M-8 0h16M0-8v16M-5-5c3 3 7 3 10 0M-5 5c3-3 7-3 10 0"/>',
  lock: '<rect x="-6" y="-1" width="12" height="9" rx="1.5"/><path d="M-3.5-1v-3a3.5 3.5 0 0 1 7 0v3"/>',
  server: '<rect x="-8" y="-9" width="16" height="7" rx="1.5"/><rect x="-8" y="2" width="16" height="7" rx="1.5"/><circle cx="4" cy="-5.5" r="1"/><circle cx="4" cy="5.5" r="1"/>',
  database: '<ellipse cx="0" cy="-6" rx="8" ry="3"/><path d="M-8-6v12a8 3 0 0 0 16 0V-6M-8 0a8 3 0 0 0 16 0"/>',
  pc: '<rect x="-8" y="-7" width="16" height="11" rx="1.5"/><path d="M-4 8h8M0 4v4"/>',
  mail: '<rect x="-9" y="-6" width="18" height="12" rx="1.5"/><path d="M-9-5l9 7 9-7"/>',
  cloud: '<path d="M-8 6a6 6 0 0 1-1-12 8 8 0 0 1 15-2 6 6 0 0 1 2 14z"/>',
  eye: '<path d="M-10 0C-6-6 6-6 10 0 6 6-6 6-10 0z"/><circle cx="0" cy="0" r="3"/>',
  users: '<circle cx="-4" cy="-3" r="3.5"/><circle cx="5" cy="-2" r="2.8"/><path d="M-10 9a6 6 0 0 1 12 0M2 9a5 5 0 0 1 9-2.5"/>',
  shield: '<path d="M0-9l7 2.5v4.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-4.5z"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
const icon = k => ICONS[k] || ICONS.server;

const COLW = 132, ROWH = 94, NW = 96, NH = 58;

// The diagram for a shift's `infra` (see a shift JSON). Nodes: { id, label, sub?, icon, at: [x, y], bad? }.
// Links: [fromId, toId] or [fromId, toId, { watch, label }]. `highlight` is a set/array of node ids to lift.
export function svg(infra, { highlight = [] } = {}) {
  if (!infra || !infra.nodes?.length) return "";
  const hi = new Set(highlight);
  const pos = {};
  let maxX = 0, maxY = 0;
  for (const n of infra.nodes) { const [x, y] = n.at; pos[n.id] = [COLW / 2 + x * COLW, ROWH / 2 + y * ROWH]; maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const W = (maxX + 1) * COLW, H = (maxY + 1) * ROWH;
  const links = (infra.links || []).map(([a, b, o = {}]) => {
    if (!pos[a] || !pos[b]) return "";
    const [x1, y1] = pos[a], [x2, y2] = pos[b];
    const mid = o.label ? `<text class="im-llbl" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 3}" text-anchor="middle">${esc(o.label)}</text>` : "";
    return `<line class="im-link${o.watch ? " watch" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${mid}`;
  }).join("");
  const nodes = infra.nodes.map(n => {
    const [cx, cy] = pos[n.id], on = hi.has(n.id);
    return `<g class="im-node${n.bad ? " bad" : ""}${on ? " on" : ""}" transform="translate(${cx},${cy})">
      <rect class="im-plate" x="${-NW / 2}" y="${-NH / 2}" width="${NW}" height="${NH}" rx="9"/>
      <g class="im-ic" transform="translate(${-NW / 2 + 17},0) scale(0.82)">${icon(n.icon)}</g>
      <text class="im-lbl" x="${-NW / 2 + 33}" y="${n.sub ? -2 : 4}">${esc(n.label)}</text>
      ${n.sub ? `<text class="im-sub" x="${-NW / 2 + 33}" y="11">${esc(n.sub)}</text>` : ""}</g>`;
  }).join("");
  // The SVG is decorative; the figcaption carries the meaning for screen readers (so it isn't announced twice).
  return `<figure class="infra-map"><svg viewBox="0 0 ${W} ${H}" class="im-svg" aria-hidden="true" focusable="false">${links}${nodes}</svg>
    ${infra.caption ? `<figcaption class="muted">${esc(infra.caption)}</figcaption>` : ""}</figure>`;
}
