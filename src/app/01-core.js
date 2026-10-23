
const DATA = /*__DATA__*/null;
/* ---------- device library (static/js/hw.js, inlined by build.py) ---------- */
/*__HW__*/
/* ---------- email component (static/js/mail.js, inlined by build.py) ---------- */
/*__MAIL__*/
/* ---------- service desk component: tickets and staff messages (static/js/desk.js, inlined by build.py) ---------- */
/*__DESK__*/

/* ---------- helpers ---------- */
// Highlight search terms: match in the raw text, merge overlaps, then escape each piece (same as engine.markText).
function markText(text, terms) {
  const s = String(text ?? ""), low = s.toLowerCase(), hits = [];
  for (const t of terms) {
    const w = String(t || "").toLowerCase(); if (!w) continue;
    for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + w.length)) hits.push([i, i + w.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const spans = [];
  for (const h of hits) { const last = spans.at(-1); if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]); else spans.push([...h]); }
  let out = "", pos = 0;
  for (const [a, b] of spans) { out += esc(s.slice(pos, a)) + `<mark>${esc(s.slice(a, b))}</mark>`; pos = b; }
  return out + esc(s.slice(pos));
}
// A link to the public feedback form (a GitHub issue form), titled with the page it came from.
// A GitHub issue form gets a title naming what the feedback is about; any other form link (Google, Microsoft) is used as it is.
const feedbackHref = what => { const f = DATA.site.feedback || ""; return /^https:\/\/github\.com\//.test(f) ? `${f}&title=${encodeURIComponent("Feedback: " + what)}` : f; };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const pct = x => x == null ? "—" : (x * 100 < 1 ? (x * 100).toFixed(2) : (x * 100).toFixed(1)) + "%";
DATA.cves = DATA.kev.slice();  // replaced by the full list once data/cves.json arrives
let CVES_READY = false, CVES_FAILED = false;
// IDs the news links to are inlined, so story chips work without downloading the full list.
const CVE_IDS = new Set([...DATA.cves.map(c => c.id), ...(DATA.newsCves || [])]);
const LESSON = Object.fromEntries(DATA.lessons.map(l => [l.id, l]));
const TOPIC_NAME = id => (LESSON[id] ? LESSON[id].title.split(" & ")[0].split(" (")[0] : id);
const dateStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => dateStr(new Date());
const dayNumber = () => Math.floor(new Date(todayStr() + "T00:00:00Z").getTime() / 864e5);
function ago(iso) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 36 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
