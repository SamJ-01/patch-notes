// Network tools lab: a simulated shell with ping, traceroute, nslookup/dig, ipconfig, arp, netstat and curl
// over a small made-up network described in content/labs.json (kind "nettools"). Used for troubleshooting labs.
// A lab may also enable "discover" (a host/port check) for authorised-recon practice: it ONLY reports on
// targets inside the lab's written in-scope range and refuses anything else, which is the point being taught.
// createNetShell() is pure logic (tested in tests/labs.test.mjs); mount() is the on-page terminal.
import { ipToInt, intToIp, maskOf } from "./subnet.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isIp = s => ipToInt(s) !== null;
export const inCidr = (ip, cidr) => { const [net, p] = cidr.split("/"); const m = maskOf(Number(p)); return ((ipToInt(ip) & m) >>> 0) === ((ipToInt(net) & m) >>> 0); };

const MAN = {
  help: "help: list the commands",
  ipconfig: "ipconfig (or ip a): show this computer's IP address, mask, gateway and DNS servers",
  ping: "ping host: send echo requests. Tests whether a host answers and how quickly",
  traceroute: "traceroute host (or tracert): list each router hop on the way to a host",
  nslookup: "nslookup name [server] (or dig name): ask DNS for a name's IP address",
  arp: "arp -a: show the local cache of IP addresses and their MAC addresses",
  netstat: "netstat -an: show this computer's connections and listening ports",
  curl: "curl url: fetch a web page and show the response headers",
  discover: "discover target: list which hosts are up and which well-known ports answer. Only works inside this lab's authorised scope",
  cat: "cat file: print a file",
  clear: "clear: clear the screen",
};
const WELL_KNOWN = { 22: "ssh", 25: "smtp", 53: "domain", 80: "http", 443: "https", 3389: "ms-wbt-server" };

export function createNetShell(lab) {
  const net = lab.net, me = net.me;
  const state = { history: [], events: [] };
  const host = ip => net.hosts.find(h => h.ip === ip);
  const sameSubnet = ip => inCidr(ip, `${me.ip}/${me.prefix}`);
  const log = ev => state.events.push(ev);
  const err = msg => ({ out: msg, error: true });

  // A packet reaches ip if the host is up and either local or routable through a working gateway.
  function reachable(ip) {
    const h = host(ip);
    if (!h || !h.up) return false;
    if (sameSubnet(ip)) return true;
    const gw = host(me.gateway);
    return !!(gw && gw.up && !net.wanDown);
  }
  // DNS lookup: { ip } on success, else { timeout } (server unreachable) or { nx } (no such name).
  function resolve(name, server = me.dns[0]) {
    if (isIp(name)) return { ip: name };
    if (!reachable(server) || !(net.dnsServers || []).includes(server)) return { timeout: true, server };
    const ip = (net.records || {})[name.toLowerCase()];
    return ip ? { ip, server } : { nx: true, server };
  }
  const nameTag = ip => (host(ip)?.name ? `${host(ip).name} [${ip}]` : ip);

  const cmds = {
    help: () => ({ out: "Commands: " + Object.keys(MAN).join(", ") + "\nType man <command> for details." }),
    man: a => (MAN[a[0]] ? { out: MAN[a[0]] } : err(`No manual entry for ${a[0] || "(nothing)"}`)),
    clear: () => ({ out: "", clear: true }),
    cat: a => { const f = (lab.files || {})[a[0]]; log({ cmd: "cat", arg: a[0] }); return f ? { out: f } : err(`cat: ${a[0] || ""}: No such file or directory`); },
    ipconfig: () => {
      log({ cmd: "ipconfig" });
      return { out: [`Adapter Ethernet0:`, `   IPv4 address . . . : ${me.ip}`, `   Subnet mask  . . . : ${intToIp(maskOf(me.prefix))}`,
        `   Default gateway  . : ${me.gateway}`, `   DNS servers  . . . : ${me.dns.join(", ")}`].join("\n") };
    },
    ping: a => {
      const target = a[0]; if (!target) return err("Usage: ping host");
      const r = resolve(target);
      log({ cmd: "ping", target, ip: r.ip || null, ok: !!(r.ip && reachable(r.ip)) });
      if (!r.ip) return err(`ping: cannot resolve ${target}: Unknown host`);
      if (!reachable(r.ip)) return { out: `Pinging ${r.ip} with 32 bytes of data:\n` + "Request timed out.\n".repeat(4) + `\nPackets: Sent = 4, Received = 0 (100% loss)`, error: true };
      const ms = host(r.ip).ms || (sameSubnet(r.ip) ? 1 : 18), ttl = sameSubnet(r.ip) ? 64 : 57;
      return { out: `Pinging ${nameTag(r.ip)} with 32 bytes of data:\n` + [0, 1, 2, 3].map(k => `Reply from ${r.ip}: bytes=32 time=${ms + (k % 2)}ms TTL=${ttl}`).join("\n") + `\n\nPackets: Sent = 4, Received = 4 (0% loss)` };
    },
    traceroute: a => {
      const target = a[0]; if (!target) return err("Usage: traceroute host");
      const r = resolve(target);
      log({ cmd: "traceroute", target, ip: r.ip || null });
      if (!r.ip) return err(`traceroute: unknown host ${target}`);
      const path = sameSubnet(r.ip) ? [] : [me.gateway, ...(net.isp || [])];
      const lines = []; let n = 0, dead = false;
      for (const hop of path) {
        n++; const h = host(hop);
        if (dead || !h || !h.up || (n > 1 && net.wanDown)) { lines.push(`${String(n).padStart(2)}  * * *  Request timed out.`); dead = true; }
        else lines.push(`${String(n).padStart(2)}  ${h.ms || n * 4} ms  ${nameTag(hop)}`);
      }
      n++;
      lines.push(reachable(r.ip) && !dead ? `${String(n).padStart(2)}  ${host(r.ip).ms || 18} ms  ${nameTag(r.ip)}` : `${String(n).padStart(2)}  * * *  Request timed out.`);
      return { out: `Tracing route to ${nameTag(r.ip)}:\n` + lines.join("\n") + (reachable(r.ip) && !dead ? "\n\nTrace complete." : "") };
    },
    nslookup: a => {
      const [name, serverArg] = a; if (!name) return err("Usage: nslookup name [server]");
      const server = (serverArg || "").replace(/^@/, "") || me.dns[0];
      const r = resolve(name, server);
      log({ cmd: "nslookup", target: name, server, ok: !!r.ip });
      if (r.timeout) return err(`Server:  ${server}\nAddress:  ${server}\n\n*** Request to ${server} timed out.`);
      if (r.nx) return err(`Server:  ${server}\nAddress:  ${server}\n\n*** ${server} can't find ${name}: Non-existent domain`);
      return { out: `Server:  ${host(server)?.name || server}\nAddress:  ${server}\n\nNon-authoritative answer:\nName:    ${name}\nAddress:  ${r.ip}` };
    },
    arp: () => {
      log({ cmd: "arp" });
      const rows = net.hosts.filter(h => sameSubnet(h.ip) && h.up && h.mac).map(h => `  ${h.ip.padEnd(16)} ${h.mac}     dynamic`);
      return { out: `Interface: ${me.ip}\n  Internet Address      Physical Address      Type\n` + rows.join("\n") };
    },
    netstat: () => {
      log({ cmd: "netstat" });
      return { out: "Proto  Local Address          Foreign Address        State\n" + (me.connections || []).map(c => `${c.proto.padEnd(6)} ${c.local.padEnd(22)} ${c.remote.padEnd(22)} ${c.state}`).join("\n") };
    },
    curl: a => {
      const url = a.find(x => !x.startsWith("-")); if (!url) return err("Usage: curl url");
      const name = url.replace(/^https?:\/\//, "").split(/[/:]/)[0];
      const r = resolve(name);
      log({ cmd: "curl", target: name, ok: !!(r.ip && reachable(r.ip)) });
      if (r.timeout || r.nx) return err(`curl: (6) Could not resolve host: ${name}`);
      if (!reachable(r.ip)) return err(`curl: (28) Failed to connect to ${name}: Timeout was reached`);
      return { out: host(r.ip).http || "HTTP/2 200\ncontent-type: text/html\nserver: nginx" };
    },
    // Authorised-recon practice only. The lab sets net.scope (a CIDR you're allowed to check); anything else is refused.
    discover: a => {
      const target = a.find(x => !x.startsWith("-")); if (!target) return err("Usage: discover target  (an address or range inside the authorised scope)");
      if (!net.scope) return err("No authorised scope is set for this lab.");
      const first = target.split("/")[0];
      if (!isIp(first)) return err(`discover: '${target}' is not an IP address or range.`);
      const insideScope = ip => inCidr(ip, net.scope);
      // A range is only allowed if it sits entirely within the authorised scope.
      const targets = target.includes("/")
        ? net.hosts.filter(h => inCidr(h.ip, target)).map(h => h.ip)
        : [first];
      if (!insideScope(first) || (target.includes("/") && targets.some(ip => !insideScope(ip)))) {
        log({ cmd: "discover", target, refused: true });
        return err(`Refused: ${target} is outside the authorised scope (${net.scope}).\nOnly test systems you have written permission to test.`);
      }
      log({ cmd: "discover", target, refused: false, scope: net.scope });
      const found = net.hosts.filter(h => targets.includes(h.ip) && h.up && insideScope(h.ip));
      if (!found.length) return { out: `Scanned ${target}. No hosts responded in the authorised scope.` };
      return { out: `Authorised scan of ${target} (scope ${net.scope}):\n\n` + found.map(h => {
        const ports = (h.ports || []).sort((x, y) => x - y);
        return `Host ${h.ip}${h.name ? ` (${h.name})` : ""} is up.\n` + (ports.length
          ? ports.map(p => `  ${String(p).padEnd(5)} open   ${WELL_KNOWN[p] || "unknown"}`).join("\n")
          : "  no well-known ports answered");
      }).join("\n\n") + `\n\nDone: ${found.length} host${found.length === 1 ? "" : "s"} up.` };
    },
  };
  // Aliases to the real-world command names people type.
  const ALIAS = { tracert: "traceroute", dig: "nslookup", ss: "netstat", ifconfig: "ipconfig", "ip": "ipconfig" };

  function run(line) {
    const raw = line.trim(); if (!raw) return { out: "" };
    state.history.push(raw);
    const parts = raw.split(/\s+/);
    let cmd = parts[0].toLowerCase();
    cmd = ALIAS[cmd] || cmd;
    const rest = parts.slice(1);
    // `ip a` / `ip addr` means ipconfig; otherwise drop a leading sub-word like `arp -a`.
    const args = rest.filter(x => !x.startsWith("-"));
    if (!cmds[cmd]) return err(`${parts[0]}: command not found. Type help to list commands.`);
    return cmds[cmd](args, rest.filter(x => x.startsWith("-")), rest);
  }

  function isDone(check) {
    const ev = state.events;
    if (check.ran) return check.ran.every(c => ev.some(e => e.cmd === c));
    if (check.pinged) return ev.some(e => e.cmd === "ping" && (e.target === check.pinged || e.ip === check.pinged));
    if (check.resolved) return ev.some(e => e.cmd === "nslookup" && e.ok && (!check.server || e.server === check.server));
    if (check.found) return ev.some(e => e.cmd === "discover" && !e.refused);
    if (check.refused) return ev.some(e => e.cmd === "discover" && e.refused);  // learned to stay in scope
    if (check.read) return ev.some(e => e.cmd === "cat" && e.arg === check.read);
    return false;
  }
  function complete(prefix) {
    const names = [...Object.keys(MAN), ...Object.keys(ALIAS)];
    const words = prefix.split(/\s+/);
    if (words.length === 1) { const opts = names.filter(n => n.startsWith(words[0])); return opts.length === 1 ? { line: opts[0] + " ", options: [] } : { line: prefix, options: opts }; }
    const hosts = net.hosts.map(h => h.name).filter(Boolean).concat(Object.keys(net.records || {}));
    const last = words[words.length - 1], opts = hosts.filter(h => h.startsWith(last));
    return opts.length === 1 ? { line: words.slice(0, -1).concat(opts[0] + " ").join(" "), options: [] } : { line: prefix, options: opts };
  }
  return { run, isDone, complete, state, prompt: () => `${me.name || "pc"}:~$` };
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const sh = createNetShell(lab);
  const done = new Set(solved);
  let histI = null, finished = lab.tasks.every(t => done.has(t.id));

  root.innerHTML = `<div class="term-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    ${lab.net.scope ? `<p class="scope-note"><b>Authorised scope:</b> you may only scan <span class="mono">${esc(lab.net.scope)}</span> in this lab. In real life, written permission comes first, every time.</p>` : ""}
    <div class="term-grid">
      <section class="term-shell" aria-label="Simulated terminal">
        <div class="term-bar"><span>${esc((lab.net.me.name || "pc"))}@${esc(lab.host || "workstation")}</span><span class="tag">Simulated</span></div>
        <div class="term-out" id="t-out" aria-live="polite"></div>
        <form class="term-in" id="t-form"><label class="sr" for="t-in">Command</label><span class="term-ps" id="t-ps"></span><input id="t-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
      </section>
      <aside class="panel term-tasks"><div class="panel-title"><h2>Objectives</h2><span class="mono" id="t-count"></span></div><ol id="t-tasks"></ol>
        <div class="row"><button class="link-btn" id="t-hint">Show a hint</button></div><div id="t-hinttext"></div>
        <div class="row"><button class="btn ghost" id="t-reset">↺ Reset lab</button></div></aside>
    </div>
    ${lab.next ? `<section class="panel" id="t-next" hidden><h2>Take it further</h2><ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>` : ""}
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const out = $("t-out"), input = $("t-in");

  const print = html => { out.insertAdjacentHTML("beforeend", html); out.scrollTop = out.scrollHeight; };
  const format = res => res.error ? `<div class="t-err">${esc(res.out)}</div>` : res.out ? `<div>${esc(res.out)}</div>` : "";
  function renderTasks() {
    lab.tasks.forEach(t => { if (!done.has(t.id) && sh.isDone(t.check)) { done.add(t.id); onPart(t.id); } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("t-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}</li>`).join("");
    $("t-count").textContent = `${done.size}/${lab.tasks.length}`;
    $("t-hinttext").innerHTML = ""; $("t-hint").hidden = !next;
    if (!next) { if ($("t-next")) $("t-next").hidden = false; if (!finished) { finished = true; onComplete(); } }
  }
  const ps = () => { $("t-ps").textContent = sh.prompt(); };

  $("t-form").addEventListener("submit", e => {
    e.preventDefault();
    const line = input.value;
    print(`<div><span class="term-ps">${esc(sh.prompt())}</span> ${esc(line)}</div>`);
    const res = sh.run(line);
    if (res.clear) out.innerHTML = ""; else print(format(res));
    input.value = ""; histI = null; ps(); renderTasks();
  });
  input.addEventListener("keydown", e => {
    const h = sh.state.history;
    if (e.key === "ArrowUp" && h.length) { e.preventDefault(); histI = histI == null ? h.length - 1 : Math.max(0, histI - 1); input.value = h[histI]; }
    else if (e.key === "ArrowDown" && histI != null) { e.preventDefault(); histI = Math.min(h.length, histI + 1); input.value = h[histI] || ""; if (histI >= h.length) histI = null; }
    else if (e.key === "Tab") { e.preventDefault(); const r = sh.complete(input.value); input.value = r.line; if (r.options.length > 1) print(`<div><span class="term-ps">${esc(sh.prompt())}</span> ${esc(input.value)}</div><div>${r.options.map(esc).join("  ")}</div>`); }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
  });
  out.addEventListener("click", () => input.focus());
  $("t-hint").addEventListener("click", () => { const t = lab.tasks.find(x => !done.has(x.id)); if (t) $("t-hinttext").innerHTML = `<div class="feedback">Try: <code>${esc(t.hint)}</code></div>`; });
  $("t-reset").addEventListener("click", onReset);

  print(`<div class="muted">Type <b>help</b> to list commands. ↑/↓ for history, Tab to complete names.</div>`);
  ps(); renderTasks();
}
