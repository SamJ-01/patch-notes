// Log search ("bring your own evidence"): paste or open a log, search it like grep, and get the summary an analyst
// would build first. Linux sign-in logs (auth.log / secure) and web server access logs (nginx and Apache "combined")
// are recognised; anything else can still be searched. Runs in the browser only: nothing is uploaded or stored.
// The analysis functions are pure and tested (tests/logs-tool.test.mjs); mount() draws the page.
import { searchLines } from "../missions/engine.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Glossary underlining from the main page (gloss() in src/app/02-glossary.js), or plain escaped text without it.
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));
export const MAX_BYTES = 5 * 1024 * 1024;  // a quick look, not a log platform

// OpenSSH and sudo messages, wherever the timestamp and host come from (classic syslog or RFC 3339).
const AUTH = {
  failed: /sshd\[\d+\]: Failed (\S+) for (invalid user )?(\S+) from (\S+) port \d+/,
  accepted: /sshd\[\d+\]: Accepted (\S+) for (\S+) from (\S+) port \d+/,
  invalid: /sshd\[\d+\]: Invalid user (\S*) from (\S+)/,
  sudo: /sudo(?:\[\d+\])?:\s+(\S+) : .*?COMMAND=(.*)$/,
};
// "combined" format: IP - user [time] "METHOD path HTTP/x" status bytes "referrer" "user agent"
const COMBINED = /^(\S+) \S+ (\S+) \[([^\]]+)\] "(\S+) (\S+)(?: [^"]*)?" (\d{3}) (\d+|-)(?: "([^"]*)" "([^"]*)")?/;
// Requests that look like attacks, by what they ask for. Common scanner and exploit patterns, not a full rule set.
const PROBES = [
  [/\.\.\/|%2e%2e%2f|%2e%2e\//i, "path traversal (../)"],
  [/union(\s|\+|%20)+select|'\s*or\s*'?1'?\s*=\s*'?1|%27/i, "SQL injection"],
  [/<script|%3cscript|javascript:/i, "cross-site scripting"],
  [/\/\.env|\/\.git\/|\/\.aws\/|wp-config|\.bak$|backup\.(zip|tar|sql)/i, "hunting for secret files"],
  [/wp-login\.php|xmlrpc\.php|\/phpmyadmin/i, "login page scanning"],
];

export function detect(lines) {
  const sample = lines.slice(0, 200);
  const auth = sample.filter(l => /sshd\[\d+\]:|sudo(\[\d+\])?:|pam_unix|CRON\[\d+\]/.test(l)).length;
  const web = sample.filter(l => COMBINED.test(l)).length;
  if (web && web >= auth) return "web";
  if (auth) return "auth";
  return "other";
}
const tally = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };

// What an analyst works out first from a sign-in log.
export function summariseAuth(lines) {
  const failed = [], accepted = [], invalid = [], sudo = [];
  for (const l of lines) {
    let m;
    if ((m = l.match(AUTH.failed))) failed.push({ method: m[1], invalid: !!m[2], user: m[3], ip: m[4] });
    else if ((m = l.match(AUTH.accepted))) accepted.push({ method: m[1], user: m[2], ip: m[3], line: l });
    else if ((m = l.match(AUTH.invalid))) invalid.push({ user: m[1], ip: m[2] });
    else if ((m = l.match(AUTH.sudo))) sudo.push({ user: m[1], command: m[2].trim() });
  }
  const failIps = new Set(failed.map(f => f.ip));
  const flags = [];
  for (const [ip, n] of tally(failed, f => f.ip)) if (n >= 5) flags.push({ level: "warn", text: `${n} failed logins from ${ip}: someone guessing passwords.`, search: ip });
  for (const a of accepted) if (failIps.has(a.ip) && a.method === "password") flags.push({ level: "bad", text: `${a.user} logged in with a password from ${a.ip}, the same address that was guessing.`, search: `Accepted ${a.user}` });
  const users = new Set(invalid.map(i => i.user));
  if (users.size >= 3) flags.push({ level: "warn", text: `Logins tried for ${users.size} usernames that don't exist (${[...users].slice(0, 4).join(", ")}${users.size > 4 ? "…" : ""}): a username list.`, search: "Invalid user" });
  const root = accepted.filter(a => a.user === "root");
  if (root.length) flags.push({ level: "warn", text: `root logged in directly over SSH ${root.length} time${root.length === 1 ? "" : "s"}. Most servers turn that off.`, search: "Accepted root" });
  return {
    kind: "auth", flags,
    tables: [
      { title: "Failed logins by address", cols: ["Address", "Failed"], rows: tally(failed, f => f.ip).slice(0, 10) },
      { title: "Failed logins by username", cols: ["Username", "Failed"], rows: tally(failed, f => f.user + (f.invalid ? " (doesn't exist)" : "")).slice(0, 10) },
      { title: "Successful logins", cols: ["User", "From", "How"], rows: accepted.slice(0, 20).map(a => [a.user, a.ip, a.method]) },
      { title: "Commands run with sudo", cols: ["User", "Command"], rows: sudo.slice(0, 20).map(s => [s.user, s.command]) },
    ],
    counts: { failed: failed.length, accepted: accepted.length, invalid: invalid.length, sudo: sudo.length },
  };
}

// What an analyst works out first from a web server access log.
export function summariseWeb(lines) {
  const reqs = [];
  for (const l of lines) {
    const m = l.match(COMBINED);
    if (m) reqs.push({ ip: m[1], method: m[4], path: m[5], status: Number(m[6]), agent: m[9] || "" });
  }
  const flags = [], probes = [];
  for (const r of reqs) { const p = PROBES.find(([re]) => re.test(decodeURIComponentSafe(r.path))); if (p) probes.push({ ...r, kind: p[1] }); }
  for (const [ip, n] of tally(reqs.filter(r => r.status === 404), r => r.ip)) if (n >= 10) flags.push({ level: "warn", text: `${n} "not found" (404) answers to ${ip}: probably a scanner trying paths.`, search: ip });
  for (const [kind, n] of tally(probes, p => p.kind)) {
    const hit = probes.find(p => p.kind === kind), ok = probes.filter(p => p.kind === kind && p.status < 400).length;
    flags.push({ level: ok ? "bad" : "warn", text: `${n} request${n === 1 ? " that looks" : "s that look"} like ${kind}${ok ? `, and ${ok} got a success code back: check what was returned` : ", all refused or not found"}.`, search: hit.ip });
  }
  for (const [ip, n] of tally(reqs.filter(r => r.status === 401 || r.status === 403), r => r.ip)) if (n >= 10) flags.push({ level: "warn", text: `${n} refused (401/403) requests from ${ip}: someone trying to get past a login.`, search: ip });
  const tools = tally(reqs.filter(r => /sqlmap|nikto|nmap|masscan|zgrab|gobuster|dirbuster|wpscan|nuclei/i.test(r.agent)), r => r.agent.match(/sqlmap|nikto|nmap|masscan|zgrab|gobuster|dirbuster|wpscan|nuclei/i)[0].toLowerCase());
  for (const [tool, n] of tools) flags.push({ level: "warn", text: `${n} request${n === 1 ? "" : "s"} name the scanning tool ${tool} as their user agent.`, search: tool });
  const band = s => `${String(s)[0]}xx`;
  return {
    kind: "web", flags,
    tables: [
      { title: "Busiest addresses", cols: ["Address", "Requests"], rows: tally(reqs, r => r.ip).slice(0, 10) },
      { title: "Answers by status", cols: ["Status", "Count"], rows: tally(reqs, r => band(r.status)) },
      { title: "Most requested paths", cols: ["Path", "Requests"], rows: tally(reqs, r => r.path.split("?")[0]).slice(0, 10) },
      { title: "Requests that look like attacks", cols: ["Address", "Looks like", "Path", "Status"], rows: probes.slice(0, 20).map(p => [p.ip, p.kind, p.path, p.status]) },
    ],
    counts: { requests: reqs.length, probes: probes.length },
  };
}
function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

export function analyse(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim());
  const kind = detect(lines);
  const sum = kind === "auth" ? summariseAuth(lines) : kind === "web" ? summariseWeb(lines) : { kind, flags: [], tables: [], counts: {} };
  return { lines, ...sum };
}

// ---------- the page
const KIND_NAME = { auth: "a Linux sign-in log (auth.log)", web: "a web server access log", other: "a log this page doesn't recognise, so it's search only" };
export function mount(root, { samples = [] } = {}) {
  let log = null;
  root.innerHTML = `<div class="hc">
    <section class="panel hc-in"><div class="panel-title"><h2>Paste or open a log</h2><span class="sim-tag hc-private">🔒 Stays on your device</span></div>
      <p class="muted hc-how">Recognised: Linux sign-in logs (<span class="mono">/var/log/auth.log</span> or <span class="mono">secure</span>) and nginx or Apache access logs. Anything else can still be searched.</p>
      <label class="sr-only" for="lg-raw">Log lines</label>
      <textarea id="lg-raw" class="hc-raw" rows="8" spellcheck="false" autocomplete="off" placeholder="Oct 21 03:04:09 web01 sshd[2205]: Failed password for root from …"></textarea>
      <div class="row"><button class="btn brand" type="button" id="lg-go">Read the log</button><label class="btn ghost" for="lg-file">Open a file</label><input type="file" id="lg-file" class="sr-only" accept=".log,.txt,text/plain">
        ${samples.length ? `<span class="muted hc-try">or try an example:</span>${samples.map((x, i) => `<button class="chip" type="button" data-sample="${i}">${esc(x.label)}</button>`).join("")}` : ""}</div>
      <p class="muted hc-small">Files are read by your browser, never uploaded. Up to ${MAX_BYTES / 1024 / 1024} MB.</p></section>
    <div id="lg-out" aria-live="polite"></div></div>`;
  const $ = id => root.querySelector("#" + id);
  const mark = (line, terms) => { let h = esc(line); for (const t of terms) h = h.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`); return h; };
  const SHOW = 500;
  function search(q) {
    const r = searchLines({ lines: log.lines, findings: [] }, q), terms = r.query ? r.query.split(" ") : [];
    $("lg-q").value = r.query;
    $("lg-count").textContent = r.query ? `${r.lines.length} of ${r.total} lines contain “${r.query}”.` : `All ${r.total} lines.`;
    $("lg-lines").innerHTML = r.lines.length ? r.lines.slice(0, SHOW).map(l => mark(l, terms)).join("\n") + (r.lines.length > SHOW ? `\n… and ${r.lines.length - SHOW} more. Search to narrow it down.` : "") : "No lines match. Check the spelling, or try fewer words.";
  }
  const tooBig = () => { $("lg-out").innerHTML = `<div class="feedback"><b class="no">Too big.</b> This page reads up to ${MAX_BYTES / 1024 / 1024} MB. Cut the log down first, for example with <span class="mono">tail -n 20000</span>.</div>`; };
  function read(text) {
    if (text.length > MAX_BYTES) return tooBig();
    log = analyse(text);
    if (!log.lines.length) { $("lg-out").innerHTML = `<div class="feedback"><b class="no">Nothing to read.</b> Paste some log lines first.</div>`; return; }
    const icon = { bad: "⚠", warn: "⚠", info: "ℹ" };
    $("lg-out").innerHTML = `<section class="panel"><div class="panel-title"><h2 tabindex="-1" id="lg-h">${log.flags.length ? `${log.flags.length} thing${log.flags.length === 1 ? "" : "s"} worth a look` : "Nothing stood out"}</h2><span class="muted hc-small">${log.lines.length} lines · ${esc(KIND_NAME[log.kind])}</span></div>
        ${log.flags.length ? `<ul class="hc-find">${log.flags.map((f, i) => `<li class="${f.level === "bad" ? "warn" : "info"}"><span class="hc-ic" aria-hidden="true">${icon[f.level]}</span><div><p>${gl(f.text, 2)}</p><button type="button" class="link-btn" data-lg-search="${i}">Show these lines</button></div></li>`).join("")}</ul>`
          : `<p class="muted hc-small">${log.kind === "other" ? "Search below to look through it." : "No guessing, scanning or attack patterns this page knows about. That isn't proof nothing happened."}</p>`}</section>
      ${log.tables.filter(t => t.rows.length).length ? `<section class="panel"><h2>Summary</h2><div class="lg-tables">${log.tables.filter(t => t.rows.length).map(t => `<div class="vl-table${t.cols.length > 3 ? " wide" : ""}" role="region" aria-label="${esc(t.title)}" tabindex="0"><table class="tbl"><caption>${esc(t.title)}</caption><thead><tr>${t.cols.map(c => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${t.rows.map(r => `<tr>${r.map((c, k) => `<td${k === 0 ? ` class="mono"` : ""}>${k === 0 ? `<button type="button" class="link-btn mono" data-lg-q="${esc(String(c).replace(/ \(doesn't exist\)$/, ""))}">${esc(c)}</button>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("")}</div></section>` : ""}
      <section class="panel"><h2>Search the log</h2>
        <form class="row log-search" id="lg-form" role="search"><label class="sr-only" for="lg-q">Search the log</label><input type="search" id="lg-q" placeholder="Like grep: every word must appear" autocomplete="off" spellcheck="false"><button class="btn brand" type="submit">Search</button><button class="btn ghost" type="button" id="lg-all">Show all</button></form>
        <p class="muted log-count" id="lg-count" aria-live="polite"></p><pre class="evidence console log-out" id="lg-lines" tabindex="0" aria-labelledby="lg-count"></pre></section>`;
    search("");
    $("lg-form").addEventListener("submit", e => { e.preventDefault(); search($("lg-q").value); });
    $("lg-all").addEventListener("click", () => search(""));
    const jump = q => { search(q); $("lg-lines").scrollIntoView({ block: "start" }); $("lg-lines").focus({ preventScroll: true }); };
    $("lg-out").querySelectorAll("[data-lg-search]").forEach(b => b.addEventListener("click", () => jump(log.flags[Number(b.dataset.lgSearch)].search)));
    $("lg-out").querySelectorAll("[data-lg-q]").forEach(b => b.addEventListener("click", () => jump(b.dataset.lgQ)));
    $("lg-h").focus();
  }
  $("lg-go").addEventListener("click", () => read($("lg-raw").value));
  $("lg-file").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > MAX_BYTES) return tooBig();
    const fr = new FileReader();
    fr.onload = () => { $("lg-raw").value = String(fr.result).slice(0, 20000) + (fr.result.length > 20000 ? "\n…" : ""); read(String(fr.result)); };
    fr.readAsText(file);
  });
  root.querySelectorAll("[data-sample]").forEach(b => b.addEventListener("click", () => { const x = samples[Number(b.dataset.sample)]; $("lg-raw").value = x.lines.join("\n"); read($("lg-raw").value); }));
}
