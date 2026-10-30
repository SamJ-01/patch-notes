// Small bespoke drawings for a few Diagnose cases where a picture beats a list: a Linux permission grid,
// a crypto "is it really locked?" row, and a Wi-Fi rogue-AP map. Pure string output; the SVG is decorative
// (aria-hidden) and the figcaption plus an sr-only list carry the meaning, like infra.js. Themed with tokens.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fig = (svg, caption, sr = []) => `<figure class="caseart">${svg}` +
  (caption ? `<figcaption class="muted">${esc(caption)}</figcaption>` : "") +
  (sr.length ? `<ul class="sr-only">${sr.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "") + `</figure>`;

// ---- Linux permissions: a 3x3 grid (owner/group/other x r/w/x) from a mode like "rwxrwxrwx". -------------
function perms(v) {
  const mode = (v.mode || "rwxrwxrwx").slice(-9);
  const who = ["owner", "group", "other"], bit = ["r", "w", "x"];
  const danger = new Set(v.danger || ["other:w"]);  // cells to flag red
  const cell = (c, r) => {
    const on = mode[c * 3 + r] !== "-", key = who[c] + ":" + bit[r], bad = danger.has(key) && on;
    return `<g transform="translate(${30 + r * 34},${34 + c * 34})"><rect class="ca-cell ${on ? "on" : "off"}${bad ? " bad" : ""}" x="0" y="0" width="28" height="28" rx="5"/>` +
      `<text class="ca-bit" x="14" y="19" text-anchor="middle">${on ? bit[r] : "-"}</text></g>`;
  };
  const rows = who.map((w, c) => `<text class="ca-rlbl" x="24" y="${53 + c * 34}" text-anchor="end">${w}</text>` + bit.map((_, r) => cell(c, r)).join("")).join("");
  const cols = bit.map((b, r) => `<text class="ca-clbl" x="${44 + r * 34}" y="22" text-anchor="middle">${({ r: "read", w: "write", x: "run" })[b]}</text>`).join("");
  const svg = `<svg viewBox="-30 0 180 150" class="ca-svg" aria-hidden="true" focusable="false">${cols}${rows}</svg>`;
  return fig(svg, v.caption, [`Permissions ${mode}`, ...[...danger].map(d => d + " is set, which is the risk")]);
}

// ---- Crypto: three padlocks showing open (encoding), weak (fast hash) and strong (real encryption). ------
const PAD = {
  open: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',   // shackle swung open
  weak: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M9 14l6 4M15 14l-6 4"/>',  // closed but cracked
  strong: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>',
};
function locks(v) {
  const items = v.items || [];
  const step = 68, w = step * items.length;
  const g = items.map((it, i) => {
    const cx = step * (i + 0.5);
    return `<g transform="translate(${cx - 12},26)" class="ca-lock ${esc(it.state)}">${PAD[it.state] || PAD.strong}</g>` +
      `<text class="ca-llbl" x="${cx}" y="70" text-anchor="middle">${esc(it.label)}</text>` +
      `<text class="ca-lsub ${esc(it.state)}" x="${cx}" y="84" text-anchor="middle">${esc(it.verdict)}</text>`;
  }).join("");
  return fig(`<svg viewBox="0 0 ${w} 92" class="ca-svg" aria-hidden="true" focusable="false">${g}</svg>`, v.caption,
    items.map(it => `${it.label}: ${it.verdict}`));
}

// ---- Wi-Fi: the device in the middle, the real AP, an evil twin and a harmless neighbour around it. ------
function aps(v) {
  const laptop = `<g transform="translate(75,58)"><rect class="ca-dev" x="-13" y="-9" width="26" height="17" rx="2"/><path class="ca-dev-l" d="M-17 11h34"/></g>`;
  const nodes = [
    { x: 20, y: 20, label: "Real AP", sub: "802.1X", tone: "good", link: "trust" },
    { x: 130, y: 20, label: "Evil twin", sub: "same name, open", tone: "bad", link: "danger" },
    { x: 130, y: 96, label: "Neighbour", sub: "other owner", tone: "muted", link: "ignore" },
  ];
  const links = nodes.map(n => `<line class="ca-link ${n.link}" x1="75" y1="58" x2="${n.x}" y2="${n.y}"/>`).join("");
  // Top-row labels sit well above the node (the circle spans y-12 to y+12); bottom-row labels sit below it,
  // so the text never lands on an AP icon.
  const aps = nodes.map(n => { const top = n.y < 58, lblY = top ? n.y - 27 : n.y + 25, subY = top ? n.y - 16 : n.y + 36;
    return `<g transform="translate(${n.x},${n.y})" class="ca-ap ${n.tone}"><circle r="12"/>` +
    `<path class="ca-ap-ic" d="M-6-2a9 9 0 0 1 12 0M-3 1a4.5 4.5 0 0 1 6 0"/><circle cx="0" cy="4" r="1.3"/></g>` +
    `<text class="ca-aplbl" x="${n.x}" y="${lblY}" text-anchor="middle">${esc(n.label)}</text>` +
    `<text class="ca-apsub" x="${n.x}" y="${subY}" text-anchor="middle">${esc(n.sub)}</text>`; }).join("");
  return fig(`<svg viewBox="-34 -20 218 162" class="ca-svg" aria-hidden="true" focusable="false">${links}${laptop}${aps}</svg>`, v.caption,
    ["Real AP uses 802.1X", "Evil twin copies the name and is open: the threat", "Neighbour is a different owner: harmless"]);
}

const SCENES = { perms, locks, aps };

export function sceneSVG(v) { return (SCENES[v.art] || (() => ""))(v); }
export function mount(el, v) { if (el && v) el.innerHTML = sceneSVG(v); }
