/* ---------- status bar ---------- */
function renderStatus() {
  const bar = $("statusbar"); if (!bar) return;
  document.body.classList.add("has-status");
  const r = rank(), mode = parseRoute().tab;
  bar.innerHTML = `<span class="mode">${esc(mode)}</span>
    <span class="live">updated ${esc(DATA.meta.generated)}</span>
    <span class="grow"></span>
    <span class="lvl">uid=${esc(r.name)} · ${P.xp} xp</span>
    <span><button type="button" data-cmd="help">? help</button></span>`;
}

/* ---------- flags (CTF) ---------- */
const FLAG_HASHES = ['8e56d2c0ff602c062fe196851ca7e6d98494aeb046610bd39a249636f73d638d', '82bca24faea43b9cb01f070becad83ea46445f0b53ab5fe7cd2c408e54ce3563', '3cf31ccd9563cd1d76c9ef4da9fe5584181a561e662d66a1ad30bc6a57bafc5e'];
const FLAG_INFO = [
  { name: "Recon", hint: "Every web page has a source. Attackers read it first, and so should you. (Right-click → View Page Source, then search for flag.)" },
  { name: "Developer tools", hint: "Developers leave notes in the browser console. This one is base64-encoded. Open DevTools (F12 or ⌥⌘I), then decode it, e.g. with CyberChef or atob() in the console." },
  { name: "Old-school crypto", hint: "Something at the very bottom of this page has been scrambled with ROT13, a cousin of the 2,000-year-old Caesar cipher. Shift every letter back by 13." },
];
async function checkFlag(input) {
  const f = String(input || "").trim();
  if (!/^flag\{[^}]+\}$/.test(f)) return { ok: false, msg: "That doesn't look like a flag. Flags look like flag{something}." };
  if (!crypto?.subtle) return { ok: false, msg: "Can't verify flags here (this browser context has no Web Crypto)." };
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(f));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const i = FLAG_HASHES.indexOf(hex);
  if (i < 0) return { ok: false, msg: "Wrong flag. Keep hunting." };
  P.flags = P.flags || {};
  if (P.flags[i]) return { ok: true, msg: `Flag ${i + 1} (${FLAG_INFO[i].name}) already captured.` };
  P.flags[i] = todayStr(); award(50, `Flag ${i + 1} captured`);
  if (count(P.flags) === 3) celebrate("All flags captured!", "CTF complete");
  return { ok: true, msg: `Flag ${i + 1} captured: ${FLAG_INFO[i].name}. +50 XP. We checked it by comparing SHA-256 hashes, so the answers aren't stored in this page.` };
}
try {
  console.log("%cPATCH//NOTES", "font: 700 22px monospace; color: #3FE0E8", "\nLooking around in DevTools? Good instinct.\nFlag 2 of 3, base64-encoded: ZmxhZ3tkM3Z0MDBsc19hcjNfeTB1cl9mcjEzbmR9\nDecode it with atob(\"...\") and submit it: press / on the page, then type submit flag{...}");
} catch (e) {}

/* ---------- command palette ---------- */
const cmdk = $("cmdk"), cmdIn = $("cmdk-input"), cmdOut = $("cmdk-out");
let cmdLog = [], cmdSel = 0, cmdItems = [], sudoTried = false;
const SECTIONS = [["today", "Daily briefing"], ["news", "Security news, explained"], ["cves", "CVE Radar"], ["learn", "Lessons & paths"], ["exams", "Exam prep: Network+, Security+ and PenTest+"], ["glossary", "Glossary A–Z"], ["missions", "Practise: missions & labs"], ["agency", "PATCH//AGENCY: SOC shifts"], ["play", "Games & flag hunt"], ["careers", "Career paths & resources"], ["progress", "Your XP, badges & level"], ["stack", "Am I affected? (your tech)"]];
const HELP = [
  ["help", "show this list"], ["ls", "list sections"], ["cd <section>", "go to a section, e.g. cd news"],
  ["open <lesson>", "open a lesson, e.g. open ransomware"], ["define <term>", "explain a term, e.g. define rce"],
  ["mission <name>", "open a mission, e.g. mission dhcp"], ["lab <name>", "open a lab, e.g. lab log"], ["subnet <ip/cidr>", "subnet calculator, e.g. subnet 10.0.0.0/22"], ["path <name>", "open a learning path, e.g. path soc"], ["news <words>", "search headlines"], ["cve <id|product>", "search the CVE radar"], ["whoami", "your level, XP and progress"],
  ["flags", "hints for the 3 hidden flags"], ["submit flag{...}", "check a flag"], ["clear", "clear this screen"], ["exit", "close (or Esc)"],
];
function openCmd(prefill = "", run = false) {
  if (cmdk.hidden) cmdReturn = document.activeElement !== document.body ? document.activeElement : null;
  cmdk.hidden = false; closePop();
  cmdIn.value = prefill; cmdIn.focus();
  if (run) { runCmd(prefill); cmdIn.value = ""; }
  drawCmd();
}
let cmdReturn = null;
function closeCmd() { if (cmdk.hidden) return; cmdk.hidden = true; if (cmdReturn && cmdReturn.isConnected) cmdReturn.focus(); cmdReturn = null; }
function say(text, cls = "") { cmdLog.push({ text, cls }); if (cmdLog.length > 60) cmdLog.shift(); }
function searchAll(q) {
  q = q.toLowerCase(); const out = [];
  const hit = (str) => str.toLowerCase().includes(q);
  SECTIONS.forEach(([id, label]) => { if (hit(id) || hit(label)) out.push({ k: "section", t: label, h: "#" + id, go: () => go(id) }); });
  DATA.missions.forEach(m => { if (hit(m.title) || hit(m.topic) || hit(m.summary)) out.push({ k: "mission", t: m.title, h: m.minutes + " min", go: () => go("mission-" + m.id) }); });
  (DATA.agency || []).forEach(sh => { if (hit(sh.title) || hit("agency soc shift") || hit(sh.summary)) out.push({ k: "mission", t: "PATCH//AGENCY: " + sh.title, h: sh.minutes + " min", go: () => go("agency-" + sh.id) }); });
  if (hit("email header checker spf dkim dmarc phishing analyse")) out.push({ k: "lab", t: "Email header checker", h: "tool", go: () => go("headers-check") });
  if (hit("log search auth.log access log grep ssh nginx apache")) out.push({ k: "lab", t: "Log search", h: "tool", go: () => go("log-search") });
  if (hit("cvss decoder vector score severity")) out.push({ k: "lab", t: "CVSS decoder", h: "tool", go: () => go("cvss-decode") });
  DATA.labs.forEach(l => { if (hit(l.title) || hit(l.skill)) out.push({ k: "lab", t: l.title, h: l.minutes + " min", go: () => go("lab-" + l.id) }); });
  DATA.paths.forEach(p => { if (hit(p.title) || hit(p.id)) out.push({ k: "path", t: p.title, h: p.steps.length + " steps", go: () => go("path-" + p.id) }); });
  DATA.lessons.forEach(l => { if (hit(l.title) || hit(l.id) || hit(l.hook)) out.push({ k: "lesson", t: l.title, h: l.minutes + " min", go: () => go("lesson-" + l.id) }); });
  DATA.glossary.forEach(g => { if (hit(g.term) || g.aliases.some(hit)) out.push({ k: "term", t: g.term, h: g.kind, go: () => define(g.id) }); });
  if (/^cve-\d{4}-\d+$/i.test(q)) out.push({ k: "cve", t: q.toUpperCase(), h: "radar", go: () => { RS.q = q; RS.prio = "all"; go("cves"); } });
  DATA.news.forEach(n => { if (out.length < 40 && hit(n.title)) out.push({ k: "story", t: n.title, h: n.source, go: () => { NS.q = q; NS.topic = "all"; NS.source = "all"; go("news"); } }); });
  return out.slice(0, 9);
}
function go(id) { closeCmd(); if (location.hash === "#" + id) route(); else location.hash = id; }
function define(id) {
  const g = GLOSS[id];
  say(`${g.term} [${g.kind}]`, "ok"); say(g.short);
  if (g.lesson && LESSON[g.lesson]) say(`→ open ${g.lesson}   (lesson: ${LESSON[g.lesson].title})`);
}
// The best item for what was typed: exact id, then a word that starts with it, then anywhere in the name.
// ("lab log" should find Log detective, not topo-LOG-ies.)
function bestMatch(items, q) {
  q = q.toLowerCase().trim();
  const text = x => (x.id + " " + x.title).toLowerCase();
  return items.find(x => x.id === q)
    || items.find(x => text(x).split(/[^a-z0-9+]+/).some(w => w.startsWith(q)))
    || items.find(x => text(x).includes(q));
}
// Every word runCmd() answers to, so the palette knows not to treat it as a search (a section name only on its own).
const COMMANDS = new Set(["help", "?", "man", "ls", "cd", "goto", "open", "learn", "define", "whatis", "mission", "missions", "subnet", "ipcalc", "calc",
  "lab", "labs", "path", "paths", "progress", "badges", "news", "cve", "cves", "radar", "whoami", "id", "flags", "hint", "hints", "submit",
  "sudo", "rm", "hack", "nmap", "clear", "cls", "exit", "quit", "q"]);
const isCommand = q => { const [w, ...more] = q.split(/\s+/), c = w.toLowerCase(); return COMMANDS.has(c) || c.startsWith("flag{") || (!more.length && SECTIONS.some(([s]) => s === c)); };
async function runCmd(raw) {
  const line = raw.trim(); if (!line) return;
  say(line, "echo");
  const [cmd, ...rest] = line.split(/\s+/); const arg = rest.join(" "); const c = cmd.toLowerCase();
  if (c === "help" || c === "?" || c === "man" && !arg) HELP.forEach(([a, b]) => say(`${a.padEnd(18)} ${b}`));
  else if (c === "ls") say(SECTIONS.map(([id]) => id + "/").join("   "));
  else if (c === "cd" || c === "goto") {
    const id = arg.replace(/^[~/.]+/, "").replace(/\/$/, "").toLowerCase() || "today";
    const map = { radar: "cves", cve: "cves", home: "today", "..": "today", games: "play", jobs: "careers" };
    const target = map[id] || id;
    if (SECTIONS.some(([s]) => s === target)) go(target); else say(`cd: no such section: ${arg}. Try ls`, "err");
  }
  else if (SECTIONS.some(([s]) => s === c) && !arg) go(c);
  else if (c === "open" || c === "man" || c === "learn") {
    const l = arg && bestMatch(DATA.lessons, arg);
    if (arg && l) go("lesson-" + l.id); else say(`No lesson matches "${arg}". Lessons: ${DATA.lessons.map(l => l.id).join(", ")}`, "err");
  }
  else if (c === "define" || c === "whatis") {
    const m = arg.toLowerCase();
    const g = DATA.glossary.find(g => g.term.toLowerCase() === m || g.aliases.some(a => a.toLowerCase() === m)) || DATA.glossary.find(g => g.term.toLowerCase().includes(m));
    if (m && g) define(g.id); else say(`No glossary entry for "${arg}" yet.`, "err");
  }
  else if (c === "mission" || c === "missions") {
    const ms = arg && bestMatch(DATA.missions, arg);
    if (ms) go("mission-" + ms.id); else if (!arg) go("missions"); else say(`No mission matches "${arg}". Missions: ${DATA.missions.map(x => x.id).join(", ")}`, "err");
  }
  else if (c === "subnet" || c === "ipcalc" || c === "calc") {
    if (!arg) go("subnet-calc");
    else if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(arg)) go("subnet-calc/" + arg);
    else say(`Usage: subnet 192.168.1.10/24`, "err");
  }
  else if (c === "lab" || c === "labs") {
    const l = arg && bestMatch(DATA.labs, arg);
    if (l) go("lab-" + l.id); else if (!arg) go("missions"); else say(`No lab matches "${arg}". Labs: ${DATA.labs.map(l => l.id).join(", ")}`, "err");
  }
  else if (c === "path" || c === "paths") {
    const p = arg && bestMatch(DATA.paths, arg);
    if (p) go("path-" + p.id); else if (!arg) go("learn"); else say(`No path matches "${arg}". Paths: ${DATA.paths.map(p => p.id).join(", ")}`, "err");
  }
  else if (c === "progress" || c === "badges") go("progress");
  else if (c === "news") { NS.q = arg; NS.topic = "all"; NS.source = "all"; go("news"); }
  else if (c === "cve" || c === "cves" || c === "radar") { RS.q = arg.toLowerCase(); RS.prio = "all"; RS.onlyWatch = false; go("cves"); }
  else if (c === "whoami" || c === "id") {
    const r = rank();
    say(`uid=${r.name}  xp=${P.xp}${r.next ? `  next=${r.nextName} at ${r.next}` : ""}`, "ok");
    say(`lessons ${Object.keys(P.done).length}/${DATA.lessons.length} · flags ${Object.keys(P.flags || {}).length}/3 · days practised ${count(P.days)}`);
  }
  else if (c === "flags" || c === "hint" || c === "hints") FLAG_INFO.forEach((f, i) => say(`${(P.flags || {})[i] ? "[x]" : "[ ]"} flag ${i + 1} · ${f.name}: ${f.hint}`));
  else if (c === "submit" || c.startsWith("flag{")) { const r = await checkFlag(c === "submit" ? arg : line); say(r.msg, r.ok ? "ok" : "err"); }
  else if (c === "sudo") {
    say("guest is not in the sudoers file. This incident will be reported.", "err");
    if (!sudoTried) { sudoTried = true; if (!P.egg) { P.egg = 1; award(5, "Nice try"); } }
  }
  else if (c === "rm") say("Nice try. Deleting things is a job for incident response, not you.", "err");
  else if (c === "hack" || c === "nmap") say("Only test systems you own or have written permission to test. Try: cd play", "err");
  else if (c === "clear" || c === "cls") cmdLog = [];
  else if (c === "exit" || c === "quit" || c === "q") closeCmd();
  else {
    const r = searchAll(line);
    if (r.length) { r[0].go(); }
    else say(`${cmd}: command not found. Type help`, "err");
  }
  drawCmd();
}
function drawCmd() {
  const q = cmdIn.value.trim();
  cmdItems = q && !isCommand(q) ? searchAll(q) : [];
  if (cmdSel >= cmdItems.length) cmdSel = 0;
  const log = cmdLog.map(l => `<div class="cmdk-line ${l.cls}">${esc(l.text).replace(/→ open (\S+)/, '→ <b>open $1</b>')}</div>`).join("");
  const res = cmdItems.map((it, i) => `<div class="cmdk-res" role="option" data-i="${i}" aria-selected="${i === cmdSel}"><span class="k">${esc(it.k)}</span><span class="t">${esc(it.t)}</span><span class="h">${esc(it.h)}</span></div>`).join("");
  const tip = !q && !cmdLog.length ? `<div class="cmdk-line">Search lessons, terms and headlines, or type <b>help</b> for commands.</div>` : "";
  cmdOut.innerHTML = log + res + tip;
  cmdOut.scrollTop = cmdOut.scrollHeight;
}
cmdIn.addEventListener("input", () => { cmdSel = 0; drawCmd(); });
cmdIn.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" && cmdItems.length) { e.preventDefault(); cmdSel = (cmdSel + 1) % cmdItems.length; drawCmd(); }
  else if (e.key === "ArrowUp" && cmdItems.length) { e.preventDefault(); cmdSel = (cmdSel - 1 + cmdItems.length) % cmdItems.length; drawCmd(); }
  else if (e.key === "Tab" && cmdItems.length) { e.preventDefault(); cmdIn.value = cmdItems[cmdSel].t; drawCmd(); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (cmdItems.length) { const it = cmdItems[cmdSel]; say(cmdIn.value, "echo"); cmdIn.value = ""; it.go(); drawCmd(); }
    else { const v = cmdIn.value; cmdIn.value = ""; runCmd(v); }
  }
  else if (e.key === "Escape") { e.preventDefault(); closeCmd(); }
});
cmdOut.addEventListener("click", e => { const r = e.target.closest(".cmdk-res"); if (r) { cmdItems[Number(r.dataset.i)].go(); } });
cmdk.addEventListener("click", e => { if (e.target === cmdk) closeCmd(); });
$("cmd-btn").addEventListener("click", () => openCmd());
document.addEventListener("click", e => { const c = e.target.closest("[data-cmd]"); if (c) { e.preventDefault(); openCmd(c.dataset.cmd, true); } });
// A "Prove it" link carries which objective questions to run; stash it before the #cert hash navigation lands.
document.addEventListener("click", e => { const p = e.target.closest("[data-prove]"); if (p) { try { pendingProve = JSON.parse(p.dataset.prove); } catch (err) {} } });
document.addEventListener("keydown", e => {
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); cmdk.hidden ? openCmd() : closeCmd(); return; }
  if (typing || !cmdk.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); openCmd(); }
  else if (e.key === "?") { e.preventDefault(); openCmd("help", true); }
  else if (/^[1-8]$/.test(e.key)) { const tabs = ["today", "learn", "missions", "agency", "exams", "progress", "news", "cves"]; location.hash = tabs[Number(e.key) - 1]; }
});

/* ---------- router ---------- */
// Which tab each route lives under, and what draws it.
const CVE_VIEWS = ["cves", "today/stack"];
// Sections without their own nav tab, and the tab that's highlighted for them.
const NAV_PARENT = { play: "missions", careers: "progress" };
function parseRoute() {
  const h = (location.hash || "#today").slice(1);
  if (h.startsWith("lesson-")) return { tab: "learn", path: "learn/" + h.slice(7), draw: () => lessonView(h.slice(7)) };
  if (h.startsWith("path-")) return { tab: "learn", path: "learn/paths/" + h.slice(5), draw: () => pathView(h.slice(5)) };
  if (h.startsWith("cert-")) return { tab: "exams", path: "exams/" + h.slice(5), draw: () => certView(h.slice(5)) };
  if (h.startsWith("lab-")) return { tab: "missions", path: "missions/" + h.slice(4), draw: () => labView(h.slice(4)) };
  if (h.startsWith("agency-")) return { tab: "agency", path: "agency/" + h.slice(7), draw: () => agencyView(h.slice(7)) };
  if (h.startsWith("mission-")) return { tab: "missions", path: "missions/" + h.slice(8), draw: () => missionView(h.slice(8)) };
  if (h === "labs") return { tab: "missions", path: "missions", draw: VIEWS.missions };
  if (h === "headers-check") return { tab: "missions", path: "tools/headers-check", draw: headersToolView };
  if (h === "log-search") return { tab: "missions", path: "tools/log-search", draw: logToolView };
  if (h === "cvss-decode" || h.startsWith("cvss-decode/")) return { tab: "missions", path: "tools/cvss-decode", draw: () => cvssToolView(h) };
  if (h === "subnet-calc" || h.startsWith("subnet-calc/")) return { tab: "missions", path: "tools/subnet-calc", draw: () => calcView(h) };
  if (h === "glossary") return { tab: "learn", path: "learn/glossary", draw: VIEWS.glossary };
  if (h === "stack") return { tab: "today", path: "today/stack", draw: VIEWS.stack };
  const view = VIEWS[h] ? h : "today";
  return { tab: NAV_PARENT[view] || view, path: view, draw: VIEWS[view] };
}
let lastHash = location.hash;
function pageName(h) {
  const k = h.slice(1), id = k.slice(k.indexOf("-") + 1);
  if (k.startsWith("lesson-")) return LESSON[id]?.title;
  if (k.startsWith("lab-")) return DATA.labs.find(x => x.id === id)?.title;
  if (k.startsWith("mission-")) return MISSION(id)?.title;
  if (k.startsWith("path-")) return DATA.paths.find(x => x.id === id)?.title;
  if (k.startsWith("agency-")) return SHIFT(id)?.title;
  return { today: "Home", learn: "Learn", missions: "Practise", agency: "The Agency", exams: "Exam prep" }[k];
}
// A "← Section" link becomes "← The page you came from" (modules render theirs later, so this watches the page).
const SECTION_BACK = new Set(["#today", "#learn", "#missions", "#agency", "#exams"]);
function relabelBack() {
  const prev = crumbs.at(-2), name = prev && pageName(prev);
  if (!name) return;
  main.querySelectorAll("a.link-btn:not([data-back])").forEach(a => {
    const href = a.getAttribute("href");
    if (!SECTION_BACK.has(href) || href === prev || !a.textContent.trim().startsWith("←")) return;
    a.dataset.back = "1"; a.setAttribute("href", prev); a.textContent = "← " + name;
  });
}
new MutationObserver(relabelBack).observe(main, { childList: true, subtree: true });
function route() {
  if (agencyShift?.inProgress && $("agency-root") && location.hash !== lastHash) {
    if (!confirm(LEAVE_SHIFT)) { history.replaceState(null, "", lastHash || "#today"); return; }
  }
  agencyShift = null; lastHash = location.hash;
  noteCrumb(location.hash || "#today");
  const r = parseRoute();
  document.querySelectorAll("nav.tabs a").forEach(a => a.dataset.tab === r.tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  closePop();
  main.onclick = null;
  $("cwd").textContent = "~/" + r.path;
  renderStatus();
  window.scrollTo(0, 0);
  if (CVE_VIEWS.includes(r.path)) loadCves();
  r.draw();
  drawTrail();
  main.classList.remove("enter"); void main.offsetWidth; main.classList.add("enter");
  revealLater();
}
// Cards and panels below the fold fade up as they scroll into view. Anything already on screen is left alone,
// and the classes are removed afterwards so nothing keeps a transform (which would break fixed-position children).
let revealQueue = [];
function revealCheck() {
  if (!revealQueue.length) return;
  const limit = innerHeight - 30;
  revealQueue = revealQueue.filter(el => {
    if (!el.isConnected) return false;
    if (el.getBoundingClientRect().top > limit) return true;
    el.classList.add("in"); setTimeout(() => el.classList.remove("rv", "in"), 900);
    return false;
  });
}
addEventListener("scroll", revealCheck, { passive: true });
addEventListener("resize", revealCheck);
document.addEventListener("visibilitychange", revealCheck);
function revealLater() {
  revealQueue.forEach(el => el.classList.remove("rv", "in")); revealQueue = [];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const groups = new Map();
  main.querySelectorAll(".lcard, .view > .panel, .split .panel, .changelog, .path, .glance > *").forEach(el => {
    if (el.getBoundingClientRect().top < innerHeight) return;
    const parent = el.parentElement, k = groups.get(parent) || 0; groups.set(parent, k + 1);
    el.style.setProperty("--rd", `${Math.min(k % 3, 2) * 70}ms`);
    el.classList.add("rv"); revealQueue.push(el);
  });
}
// Redraw the current view in place (no scroll jump), e.g. when the CVE list finishes loading.
function rerender() { const y = scrollY; parseRoute().draw(); scrollTo(0, y); }
document.addEventListener("click", e => {
  const pr = e.target.closest("[data-radar-prio]");
  if (pr) { RS.prio = pr.dataset.radarPrio; RS.onlyWatch = false; RS.q = ""; if (location.hash === "#cves") route(); return; }
  const cv = e.target.closest("[data-cve]");
  if (cv) { RS.q = cv.dataset.cve.toLowerCase(); RS.prio = "all"; RS.onlyWatch = false; RS.onlyNew = false;
    if (location.hash === "#cves") route(); else location.hash = "cves"; return; }
  const ns = e.target.closest("[data-news-stack]");
  if (ns) { NS.stack = true; NS.topic = "all"; NS.q = ""; NS.source = "all"; }
  const pm = e.target.closest("[data-play-mode]");
  if (pm) GS.mode = pm.dataset.playMode;
  const nt = e.target.closest("[data-news-topic]");
  if (nt) { NS.topic = nt.dataset.newsTopic; NS.q = ""; NS.source = "all"; location.hash = "news"; }
});
window.addEventListener("hashchange", route);
// Card photos fade in when they've loaded (load doesn't bubble, so listen while it's on its way down).
document.addEventListener("load", e => { if (e.target.classList?.contains("card-img")) e.target.classList.add("in"); }, true);
document.addEventListener("error", e => { if (e.target.classList?.contains("card-img")) e.target.closest(".card-art")?.classList.add("missing"); }, true);

// Scroll boxes (terminals, logs, raw headers, wide tables) move along one axis per gesture, never diagonally.
// Wheel and trackpad: only the stronger axis moves the box; once the box can't go further that way, the page
// carries on. Touch: CSS leaves up/down to the browser (touch-action: pan-y) and sideways drags move only sideways.
const SCROLL_BOX = ".log-out, .term-out, .evidence, .em-raw, .tap-capture, .pm-ls, .pm-scroll, .jr-code pre, .vl-table, .tbl-wrap, .table-wrap, .chart, .ag-comms";
const canScroll = (el, axis, d) => axis === "x"
  ? (d < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  : (d < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1);
document.addEventListener("wheel", e => {
  const el = e.target.closest?.(SCROLL_BOX);
  if (!el || e.ctrlKey) return;
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1, dx = e.deltaX * k, dy = e.deltaY * k;
  if (!dx || !dy) return;  // already one axis: the browser's own scrolling is fine
  e.preventDefault();
  if (Math.abs(dx) > Math.abs(dy)) { if (canScroll(el, "x", dx)) el.scrollLeft += dx; }
  else if (canScroll(el, "y", dy)) el.scrollTop += dy;
  else window.scrollBy(0, dy);
}, { passive: false });
let drag = null;
document.addEventListener("touchstart", e => {
  const el = e.touches.length === 1 && e.target.closest?.(SCROLL_BOX);
  drag = el && el.scrollWidth > el.clientWidth + 1 ? { el, x: e.touches[0].clientX, y: e.touches[0].clientY, left: el.scrollLeft, axis: null } : null;
}, { passive: true });
document.addEventListener("touchmove", e => {
  if (!drag || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
  if (!drag.axis && Math.hypot(dx, dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  if (drag.axis === "x") drag.el.scrollLeft = drag.left - dx;
}, { passive: true });
document.addEventListener("touchend", () => { drag = null; }, { passive: true });

$("ver").textContent = "v" + DATA.meta.version;
$("foot-meta").textContent = `Updated ${DATA.meta.generated}.` + (DATA.site.author ? ` Built by ${DATA.site.author}.` : "");
$("xp").addEventListener("click", () => { location.hash = "progress"; });
$("xp").style.cursor = "pointer";
if (DATA.site.url) $("lessons-link").href = DATA.site.url + "lessons/";
if (DATA.site.feedback) $("feedback-link").href = DATA.site.feedback;
// The full CVE list (~600 KB) is only fetched by the views that use it.
let cvesLoading = null;
function loadCves() {
  if (cvesLoading) return;
  cvesLoading = fetch("data/cves.json")
    .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
    .then(rows => { DATA.cves = rows; rows.forEach(c => CVE_IDS.add(c.id)); CVES_READY = true; })
    .catch(() => { CVES_FAILED = true; })
    .finally(() => { if (CVE_VIEWS.includes(parseRoute().path)) rerender(); renderStatus(); });
}
renderXP();
route();
