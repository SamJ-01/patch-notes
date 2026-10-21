// Draws a network so its structure is obvious at a glance: every broadcast domain (segment) has its own
// colour, links show a stripe for each segment they carry (one for an access link, several for a trunk), and
// devices wear the colours of the segments they're in. Used by the VLAN lab and the network builder.
// Pure string output, so it's cheap to redraw on every change. Colours come from the --seg0..7 CSS tokens.
import * as M from "./model.js";
import { HW } from "../hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const SEG_COLOURS = 8;
const segClass = i => `seg${i % SEG_COLOURS}`;
const GLYPH = { switch: "switch", pc: "pc", router: "router" };
const SIZE = { switch: [78, 46], pc: [62, 56], router: [70, 52] };

// One line per carried segment, offset side by side so a trunk reads as a bundle of coloured wires.
function linkSvg(topo, l, pos, seg, focus) {
  const [x1, y1] = pos[l.a[0]], [x2, y2] = pos[l.b[0]];
  const carried = M.carried(topo, l, seg);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len, gap = 4.5;
  const dim = focus != null && !carried.includes(focus) ? " dim" : "";
  const trunk = topo.devices[l.a[0]].kind === "switch" && topo.devices[l.b[0]].kind === "switch" && M.opMode(topo, ...l.a) === "trunk";
  const lines = carried.length
    ? carried.map((s, i) => { const o = (i - (carried.length - 1) / 2) * gap; return `<line class="nv-wire ${segClass(s)}" x1="${x1 + nx * o}" y1="${y1 + ny * o}" x2="${x2 + nx * o}" y2="${y2 + ny * o}"/>`; }).join("")
    : `<line class="nv-wire dead" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tag = trunk ? `<text class="nv-tag" x="${mx - nx * 16}" y="${my - ny * 16 + 3}" text-anchor="middle">trunk</text>` : "";
  // Port names sit just off the wire, a fixed distance from their device, on the side away from the bundle.
  // A switch port cabled to a PC is labelled halfway along its cable, where cables have fanned out.
  const ends = [[l.a, x1, y1, 1, l.b], [l.b, x2, y2, -1, l.a]];
  const ports = ends.map(([[id, p], ax, ay, dir, [otherId]]) => {
    if (topo.devices[id].kind === "pc") return "";
    if (topo.devices[otherId].kind === "pc") return `<text class="nv-port" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 3}" text-anchor="middle">${esc(p)}</text>`;
    const along = (Math.max(...SIZE[topo.devices[id].kind]) / 2 + 20) * dir, side = 9 + gap * carried.length / 2;
    const px = ax + ((x2 - x1) / len) * along + nx * side, py = ay + ((y2 - y1) / len) * along + ny * side;
    return `<text class="nv-port" x="${px}" y="${py + 3}" text-anchor="middle">${esc(p)}</text>`;
  }).join("");
  return `<g class="nv-link${dim}">${lines}${tag}${ports}</g>`;
}

function deviceSvg(topo, id, [x, y], seg, opts) {
  const d = topo.devices[id], [w, h] = SIZE[d.kind];
  const mine = memberships(topo, id, seg);
  const dim = opts.focus != null && !mine.includes(opts.focus) ? " dim" : "";
  const sel = opts.selected === id ? " sel" : "";
  const ring = d.kind === "pc" && mine.length ? ` ${segClass(mine[0])}` : "";
  const dots = d.kind !== "pc" ? mine.map((s, i) => `<circle class="nv-dot ${segClass(s)}" cx="${-w / 2 + 9 + i * 9}" cy="${-h / 2 - 1}" r="4"/>`).join("") : "";
  const sub = d.kind === "pc" ? (d.ip || "no IP") : d.kind === "router" ? `${Object.values(d.ports).reduce((n, p) => n + p.subs.length, 0)} addresses` : "";
  const r = opts.reach?.[id];
  const badge = r ? `<g class="nv-badge ${r.result === "ok" ? "ok" : "no"}" transform="translate(${w / 2 - 4},${-h / 2 + 4})"><circle r="9"/><text y="4" text-anchor="middle">${r.result === "ok" ? "✓" : "✗"}</text></g>` : "";
  const scale = d.kind === "switch" ? 0.95 : d.kind === "router" ? 0.7 : 0.6;
  const a11y = opts.interactive ? ` tabindex="0" role="button" aria-label="${esc(describe(topo, id, seg, r))}" aria-pressed="${opts.selected === id}"` : "";
  return `<g class="nv-dev nv-${d.kind}${dim}${sel}" data-node="${esc(id)}" transform="translate(${x},${y})"${a11y}>
    <rect class="nv-plate${ring}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9"/>${dots}
    <g transform="translate(0,${d.kind === "pc" ? -4 : 2}) scale(${scale})">${HW[GLYPH[d.kind]]}</g>
    <text class="nv-name" y="${-h / 2 - 8}" text-anchor="middle">${esc(id)}</text>
    ${sub ? `<text class="nv-sub" y="${h / 2 + 13}" text-anchor="middle">${esc(sub)}</text>` : ""}${badge}</g>`;
}
// The segments a device takes part in.
export function memberships(topo, id, seg) {
  const d = topo.devices[id];
  if (d.kind === "pc") { const s = seg.of[`pc:${id}`]; return s == null ? [] : [s]; }
  return [...new Set(Object.entries(seg.of).filter(([k]) => k.startsWith(d.kind === "switch" ? `sw:${id}:` : `r:${id}:`)).map(([, s]) => s))].sort((a, b) => a - b);
}
// One sentence per device, for screen readers and the device's title.
export function describe(topo, id, seg, reach) {
  const d = topo.devices[id], names = memberships(topo, id, seg).map(s => seg.segments[s].name);
  const where = names.length ? `in ${names.join(", ")}` : "not in any working network";
  const own = d.kind === "pc" ? `PC ${id}, ${d.ip ? `${d.ip} ${M.network(d.ip, d.mask)}` : "no IP address"}${d.gw ? `, gateway ${d.gw}` : ""}` : `${d.kind === "switch" ? "Switch" : "Router"} ${id}`;
  return `${own}, ${where}.${reach ? ` ${reach.result === "ok" ? "Reachable" : "Not reachable"}: ${reach.reason}` : ""}`;
}

// The whole picture. opts: { layout: { id: [x, y] }, width, height, focus: segment index, selected: device id,
// reach: { id: pingResult } (badges), interactive: devices are focusable buttons }.
export function svg(topo, opts) {
  const seg = opts.seg || M.segments(topo), pos = opts.layout;
  const ids = Object.keys(topo.devices).filter(id => pos[id]);
  const links = topo.links.filter(l => pos[l.a[0]] && pos[l.b[0]]).map(l => linkSvg(topo, l, pos, seg, opts.focus)).join("");
  const devs = ids.map(id => deviceSvg(topo, id, pos[id], seg, opts)).join("");
  const summary = seg.segments.length ? seg.segments.map(s => `${s.name}: ${[...s.hosts, ...s.routers.map(r => r.id)].join(", ") || "no devices"}`).join(". ") : "No working networks yet";
  return `<svg class="netview" viewBox="0 0 ${opts.width} ${opts.height}" ${opts.interactive ? 'role="group"' : 'role="img"'} aria-label="${esc(`Network diagram. ${summary}.`)}">${links}${devs}</svg>`;
}

// The key to the colours: one row per broadcast domain with devices in it (who, and which subnets). Domains
// with no devices yet (VLANs carried on a trunk but unused) are listed together underneath.
export function legend(topo, seg = M.segments(topo), focus = null) {
  if (!seg.segments.length) return `<p class="muted">Nothing is connected yet.</p>`;
  const used = seg.segments.filter(s => s.hosts.length || s.routers.length), idle = seg.segments.filter(s => !s.hosts.length && !s.routers.length);
  const row = s => {
    const who = [...s.hosts, ...s.routers.map(r => `${r.id} ${r.port}${r.tag ? "." + r.tag : ""}`)];
    return `<li><button type="button" class="nv-key${focus === s.index ? " on" : ""}" data-seg="${s.index}" aria-pressed="${focus === s.index}">
      <span class="nv-swatch ${segClass(s.index)}" aria-hidden="true"></span><b>${esc(s.name)}</b>
      <span class="muted">${esc(who.join(", "))} · ${s.subnets.length ? esc(s.subnets.join(", ")) : "no addresses yet"}${s.switches.length ? ` · across ${esc(s.switches.join(", "))}` : ""}</span></button></li>`;
  };
  return `<ul class="nv-legend">${used.map(row).join("")}</ul>${idle.length ? `<p class="muted nv-idle">Also carried, with no devices yet: ${idle.map(s => `<button type="button" class="nv-chip${focus === s.index ? " on" : ""}" data-seg="${s.index}" aria-pressed="${focus === s.index}"><span class="nv-swatch ${segClass(s.index)}" aria-hidden="true"></span>${esc(s.name)}</button>`).join(" ")}</p>` : ""}`;
}
