// "What you're watching" on a shift's client file: one card per source the learner will search on the desk
// (logs, a mailbox, the client notes), built from the shift's own `sources` so it can't drift from the desk.
// Pure (tests/agency.test.mjs); the page only places the HTML. Icons are decorative; the words carry the meaning.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Line icons on a 24-box centred at 0, stroked with currentColor.
const ICONS = {
  key: '<circle cx="-4" cy="0" r="4.5"/><path d="M0.5 0H10M6 0v3.5M9 0v2.5"/>',
  mail: '<rect x="-9" y="-6" width="18" height="12" rx="1.5"/><path d="M-9-5l9 7 9-7"/>',
  inbox: '<path d="M-9 1l3-8h12l3 8v6h-18z"/><path d="M-9 1h5l1.5 3h5L4 1h5"/>',
  route: '<circle cx="-7" cy="-5" r="2.2"/><circle cx="7" cy="5" r="2.2"/><path d="M-4.8-5H2a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 7h0"/>',
  notes: '<path d="M-6-9h8l5 5v13h-13z"/><path d="M2-9v5h5M-3 0h6M-3 4h6"/>',
  shield: '<path d="M0-9l7 2.5v4.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-4.5z"/><path d="M-3 0l2 2 4-4"/>',
  server: '<rect x="-8" y="-9" width="16" height="7" rx="1.5"/><rect x="-8" y="2" width="16" height="7" rx="1.5"/><circle cx="4" cy="-5.5" r="1"/><circle cx="4" cy="5.5" r="1"/>',
  globe: '<circle cx="0" cy="0" r="8"/><path d="M-8 0h16M0-8v16M-5-5c3 3 7 3 10 0M-5 5c3-3 7-3 10 0"/>',
  app: '<rect x="-9" y="-7" width="18" height="14" rx="1.5"/><path d="M-9-3h18M-6-5h1M-3-5h1"/>',
  cloud: '<path d="M-8 6a6 6 0 0 1-1-12 8 8 0 0 1 15-2 6 6 0 0 1 2 14z"/>',
  log: '<rect x="-8" y="-9" width="16" height="18" rx="1.5"/><path d="M-4-4h8M-4 0h8M-4 4h5"/>',
};
export const ICON_NAMES = Object.keys(ICONS);

// Which icon a source gets: its own `icon` if set, else read from its kind, id and name.
export function sourceIcon(id, src = {}) {
  if (src.icon && ICONS[src.icon]) return src.icon;
  if (src.kind === "email") return "mail";
  const s = `${id} ${src.name || ""}`.toLowerCase();
  const rules = [[/notes/, "notes"], [/sign-?in|auth\.log|\bauth\b/, "key"], [/mailbox audit|mail-audit/, "inbox"], [/mail ?trace/, "route"],
    [/edr|endpoint/, "shield"], [/cloud/, "cloud"], [/server|fs\d/, "server"], [/web|nginx|waf/, "globe"], [/app/, "app"]];
  return (rules.find(([re]) => re.test(s)) || [null, "log"])[1];
}

// Split a source's name into a short title and a tag: "Sign-in log (SIEM export)" -> "Sign-in log" + "SIEM export";
// "Mailbox: accounts@x.example" -> "Mailbox" + the address. The about line is cut to its first sentence.
export function watchList(shift) {
  return Object.entries(shift?.sources || {}).map(([id, src]) => {
    let name = String(src.name || id).trim(); const tags = [];
    name = name.replace(/\s*\(([^)]+)\)\s*$/, (_, t) => { tags.push(t.trim()); return ""; });
    const colon = name.indexOf(": ");
    if (colon > 0) { tags.unshift(name.slice(colon + 2).trim()); name = name.slice(0, colon).trim(); }
    // first sentence (up to the first full stop followed by a space); no look-behind, which iOS before 16.4 cannot parse
    const full = String(src.about || "").trim(), first = full.match(/^[\s\S]*?\.(?=\s)/), about = first ? first[0] : full;
    return { id, icon: sourceIcon(id, src), name, tag: tags.filter(Boolean).join(" · "), about };
  });
}

export function html(shift) {
  const list = watchList(shift);
  if (!list.length) return "";
  return `<section class="ag-watch" aria-labelledby="ag-watch-h"><div class="ag-watch-head"><h3 class="eyebrow" id="ag-watch-h">What you're watching</h3><span class="muted">${list.length} source${list.length === 1 ? "" : "s"} to search on the desk</span></div>
    <ul class="ag-watch-list">${list.map(w => `<li class="ag-src"><svg class="ag-src-ico" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">${ICONS[w.icon]}</svg>
      <div><b>${esc(w.name)}</b>${w.tag ? `<span class="ag-src-tag mono">${esc(w.tag)}</span>` : ""}<p>${esc(w.about)}</p></div></li>`).join("")}</ul></section>`;
}
