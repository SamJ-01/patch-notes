// A switch's front panel, drawn like the real thing (an unbranded 1U, 24-port 10/100 switch with two gigabit uplinks):
// rack ears, vents, the console port, status LEDs, and each port with its link light. A port with a cable in it
// shows the plug and its LED in the colour of the broadcast domain it's in (the same colours as the network diagram),
// so you watch ports change colour as you configure VLANs. A trunk's light shows a stripe for each VLAN it carries.
// portStates is pure and tested (tests/panel.test.mjs); svg() only draws it.
import * as M from "./model.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const col = i => `var(--seg${i % 8})`;

// Each port: { name, peer: "PC1" | "S1 Gi0/1" | null, mode: "access"|"trunk", vlan, voice, segs: [segment index],
// shutdown }. Access ports sit in the segment of their VLAN on this switch; a trunk carries every segment on its link.
export function portStates(topo, sw, seg = M.segments(topo)) {
  const d = topo.devices[sw];
  return Object.keys(d.ports).map(name => {
    const p = d.ports[name], link = M.linkOf(topo, sw, name);
    const far = link ? (link.a[0] === sw && link.a[1] === name ? link.b : link.a) : null;
    const peer = far ? (topo.devices[far[0]].kind === "pc" ? far[0] : `${far[0]} ${far[1]}`) : null;
    const mode = M.opMode(topo, sw, name);
    let segs = [];
    if (link && !p.shutdown) {
      if (mode === "trunk") segs = M.carried(topo, link, seg);
      else { const s = seg.of[`sw:${sw}:${p.access}`]; if (s != null) segs = [s]; if (p.voice != null && seg.of[`sw:${sw}:${p.voice}`] != null) segs.push(seg.of[`sw:${sw}:${p.voice}`]); }
    }
    return { name, peer, mode, vlan: mode === "access" ? p.access : null, voice: p.voice ?? null, native: p.native, segs, shutdown: !!p.shutdown };
  });
}

// One RJ45 socket (with its LED, and the plug if cabled) at x, y. `up` = the latch faces up (top row) or down.
function rj45(x, y, st, up, i) {
  const live = st.peer && !st.shutdown, ledY = up ? y - 7 : y + 30;
  const led = ledHtml(x + 11, ledY, st, live);
  const latch = up ? `M${x + 7} ${y + 2}h8v4h-8z` : `M${x + 7} ${y + 18}h8v4h-8z`;
  const plug = live ? `<g class="sp-plug"><rect x="${x + 2}" y="${y + 2}" width="18" height="20" rx="2" style="fill:${st.segs.length === 1 ? col(st.segs[0]) : "#6b7785"}"/>
      <rect x="${x + 4}" y="${up ? y + 4 : y + 6}" width="14" height="14" rx="1.5" class="sp-boot"/></g>` : "";
  return `<g class="sp-port" data-port="${esc(st.name)}" tabindex="0" role="img" aria-label="${esc(label(st))}"><title>${esc(label(st))}</title>
    <rect x="${x}" y="${y}" width="22" height="24" rx="2.5" class="sp-socket"/><path d="${latch}" class="sp-latch"/>
    <path d="M${x + 4} ${up ? y + 9 : y + 6}h14v9h-14z" class="sp-pins"/>${plug}${led}<text x="${x + 11}" y="${up ? y - 14 : y + 44}" class="sp-num">${i}</text></g>`;
}
function ledHtml(cx, cy, st, live) {
  if (!live) return `<circle class="sp-led off" cx="${cx}" cy="${cy}" r="2.6"/>`;
  if (!st.segs.length) return `<circle class="sp-led amber" cx="${cx}" cy="${cy}" r="2.6"/>`;
  if (st.segs.length === 1) return `<circle class="sp-led on" cx="${cx}" cy="${cy}" r="2.6" style="fill:${col(st.segs[0])};color:${col(st.segs[0])}"/>`;
  const w = 3 * st.segs.length;  // a trunk: a short bar, one stripe per VLAN it carries
  return `<g class="sp-led trunk">${st.segs.map((s, k) => `<rect x="${cx - w / 2 + k * 3}" y="${cy - 2.4}" width="3" height="4.8" style="fill:${col(s)}"/>`).join("")}</g>`;
}
export function label(st) {
  if (!st.peer) return `${st.name}: empty`;
  if (st.shutdown) return `${st.name}: ${st.peer}, shut down`;
  return `${st.name}: ${st.peer}, ${st.mode === "trunk" ? `trunk (native VLAN ${st.native})` : `access VLAN ${st.vlan}${st.voice != null ? `, voice VLAN ${st.voice}` : ""}`}`;
}
function sfp(x, y, st, n) {
  const live = st.peer && !st.shutdown;
  return `<g class="sp-port" data-port="${esc(st.name)}" tabindex="0" role="img" aria-label="${esc(label(st))}"><title>${esc(label(st))}</title>
    <rect x="${x}" y="${y}" width="30" height="16" rx="1.5" class="sp-sfp"/><rect x="${x + 3}" y="${y + 3}" width="24" height="10" rx="1" class="sp-sfp-in"/>
    ${live ? `<rect x="${x + 4}" y="${y + 4}" width="22" height="8" rx="1" style="fill:${st.segs.length === 1 ? col(st.segs[0]) : "#6b7785"}" class="sp-sfp-mod"/>` : ""}
    ${ledHtml(x + 15, y + 24, st, live)}
    <text x="${x + 15}" y="${y - 6}" class="sp-num">G${n}</text></g>`;
}

export function svg(topo, sw, seg = M.segments(topo)) {
  const sts = portStates(topo, sw, seg), by = Object.fromEntries(sts.map(s => [s.name, s]));
  const W = 900, H = 112, x0 = 150;
  let ports = "";
  for (let k = 0; k < 12; k++) {  // odd ports on top, even below, in groups of six pairs, as on most 24-port switches
    const x = x0 + k * 30 + Math.floor(k / 6) * 16;
    ports += rj45(x, 26, by[`Fa0/${k * 2 + 1}`], true, k * 2 + 1) + rj45(x, 56, by[`Fa0/${k * 2 + 2}`], false, k * 2 + 2);
  }
  const ux = x0 + 12 * 30 + 16 + 40;
  ports += sfp(ux, 34, by["Gi0/1"], 1) + sfp(ux + 40, 34, by["Gi0/2"], 2);
  const vents = Array.from({ length: 9 }, (_, i) => `<rect x="${ux + 92 + i * 9}" y="30" width="4" height="52" rx="2" class="sp-vent"/>`).join("");
  return `<svg class="sw-panel" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(sw)} front panel: ${sts.filter(s => s.peer).map(label).join("; ")}">
    <defs><linearGradient id="sp-metal-${esc(sw)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a525c"/><stop offset="0.08" stop-color="#2d333a"/><stop offset="0.92" stop-color="#22272d"/><stop offset="1" stop-color="#15191d"/></linearGradient></defs>
    <rect x="0" y="6" width="${W}" height="${H - 12}" rx="4" class="sp-ear"/>
    <rect x="22" y="8" width="${W - 44}" height="${H - 16}" rx="3" fill="url(#sp-metal-${esc(sw)})" class="sp-body"/>
    ${[8, W - 14].map(x => `<rect x="${x}" y="22" width="6" height="12" rx="3" class="sp-hole"/><rect x="${x}" y="${H - 34}" width="6" height="12" rx="3" class="sp-hole"/>`).join("")}
    <text x="40" y="34" class="sp-name">${esc(sw)}</text><text x="40" y="48" class="sp-model">24-port 10/100 + 2 SFP</text>
    <g class="sp-sys"><circle cx="44" cy="66" r="3" class="sp-led on sys"/><text x="52" y="69" class="sp-tiny">SYST</text>
      <circle cx="44" cy="80" r="3" class="sp-led on sys"/><text x="52" y="83" class="sp-tiny">STAT</text></g>
    <g><rect x="96" y="56" width="22" height="20" rx="2" class="sp-console"/><text x="107" y="90" class="sp-tiny mid">CONSOLE</text></g>
    ${ports}${vents}
  </svg>`;
}

// ---------- the photo skin: a real-looking switch photo (static/img/kit/switch-24.webp, unbranded, made for the site) with
// the live state drawn over it: each cabled port gets a plug in its network's colour and a link light in the jack's corner.
// Coordinates are the original photo's pixels (2000 x 667); the saved image is its chassis band (y 160 to 460).
export const PHOTO = {
  src: "img/kit/switch-24.webp", box: [0, 160, 2000, 300],
  // 15 jack columns in three blocks; this photo shows 30 jacks, the lab's switches have 24: the first 12 columns are Fa0/1-24
  // (odd on top, even below), the last three stay empty.
  cols: [[534, 595], [603, 664], [672, 732], [741, 801], [810, 871], [905, 966], [974, 1035], [1043, 1103], [1111, 1171], [1180, 1240], [1273, 1334], [1342, 1402], [1411, 1470], [1479, 1539], [1547, 1607]],
  rows: [[285, 333], [360, 410]],
  sfp: [[1667, 366, 1737, 406], [1751, 366, 1822, 406]],
  sys: [[310, 340], [310, 368], [310, 395]],
};
// Where each modelled port sits on the photo: name -> [x0, y0, x1, y1, row] (pure; tested: inside the photo, no overlaps).
export function photoPorts(photo = PHOTO) {
  const out = {};
  for (let c = 0; c < 12 && c < photo.cols.length; c++) {
    const [x0, x1] = photo.cols[c];
    out[`Fa0/${c * 2 + 1}`] = [x0, photo.rows[0][0], x1, photo.rows[0][1], 0];
    out[`Fa0/${c * 2 + 2}`] = [x0, photo.rows[1][0], x1, photo.rows[1][1], 1];
  }
  photo.sfp.forEach(([x0, y0, x1, y1], i) => { out[`Gi0/${i + 1}`] = [x0, y0, x1, y1, 2]; });
  return out;
}
export function photoSvg(topo, sw, seg = M.segments(topo), photo = PHOTO) {
  const sts = portStates(topo, sw, seg), at = photoPorts(photo), [bx, by, bw, bh] = photo.box;
  const fill = st => (st.segs.length === 1 ? col(st.segs[0]) : "#7d8893");
  const ports = sts.filter(st => at[st.name]).map(st => {
    const [x0, y0, x1, y1, row] = at[st.name], live = st.peer && !st.shutdown, w = x1 - x0, h = y1 - y0;
    const plug = live ? `<rect x="${x0 + 4}" y="${y0 + 4}" width="${w - 8}" height="${h - 8}" rx="4" class="pp-plug" style="fill:${fill(st)}"/>
      <rect x="${x0 + 12}" y="${y0 + (row === 1 ? 10 : 14)}" width="${w - 24}" height="${h - 24}" rx="3" class="pp-boot"/>` : "";
    const lx = x0 + 7, ly = row === 1 ? y1 - 7 : y0 + 7;
    let led = "";
    if (live && st.segs.length > 1) { const s = 7; led = `<g class="pp-led">${st.segs.map((k, i) => `<rect x="${lx - 3 + i * s}" y="${ly - 3}" width="${s}" height="6" rx="1" style="fill:${col(k)}"/>`).join("")}</g>`; }
    else if (live) led = `<circle cx="${lx}" cy="${ly}" r="4.5" class="pp-led on" style="fill:${st.segs.length ? col(st.segs[0]) : "#ffb000"};color:${st.segs.length ? col(st.segs[0]) : "#ffb000"}"/>`;
    const num = row === 2 ? `G${st.name.slice(-1)}` : st.name.slice(4);
    const ny = row === 0 ? y0 - 10 : row === 1 ? y1 + 22 : y0 - 12;
    return `<g class="sp-port" data-port="${esc(st.name)}" tabindex="0" role="img" aria-label="${esc(label(st))}"><title>${esc(label(st))}</title>
      <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="4" class="pp-hit"/>${plug}${led}<text x="${(x0 + x1) / 2}" y="${ny}" class="pp-num">${num}</text></g>`;
  }).join("");
  const sys = photo.sys.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.5" class="pp-led on sys${i === 2 ? " idle" : ""}"/>`).join("");
  return `<svg class="sw-panel sw-photo" viewBox="${bx} ${by} ${bw} ${bh}" role="group" aria-label="${esc(sw)} front panel: ${sts.filter(s => s.peer).map(label).join("; ")}">
    <image href="${esc(photo.src)}" x="${bx}" y="${by}" width="${bw}" height="${bh}" preserveAspectRatio="none"/>
    <text x="420" y="345" class="pp-name">${esc(sw)}</text>${sys}${ports}</svg>`;
}
