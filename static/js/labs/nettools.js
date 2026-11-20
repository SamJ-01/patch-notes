// Network tools lab: a simulated shell with ping, traceroute, nslookup/dig, ipconfig, arp, netstat and curl
// over a small made-up network described in content/labs.json (kind "nettools"). Used for troubleshooting labs.
// A lab may also enable "discover" (a host/port check) for authorised-recon practice: it ONLY reports on
// targets inside the lab's written in-scope range and refuses anything else, which is the point being taught.
// createNetShell() is pure logic (tested in tests/labs.test.mjs); mount() is the on-page terminal.
import { ipToInt, intToIp, maskOf } from "./subnet.js";
import { guide, dock } from "./guide.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isIp = s => ipToInt(s) !== null;
export const inCidr = (ip, cidr) => { const [net, p] = cidr.split("/"); const m = maskOf(Number(p)); return ((ipToInt(ip) & m) >>> 0) === ((ipToInt(net) & m) >>> 0); };

const MAN = {
  help: "help: list the commands",
  ipconfig: "ipconfig (or ip a): show this computer's IP address, mask, gateway and DNS servers",
  ping: "ping host: send echo requests. Tests whether a host answers and how quickly. -c N (Linux) or -n N (Windows) sets how many",
  traceroute: "traceroute host (or tracert): list each router hop on the way to a host",
  nslookup: "nslookup name [server]: ask DNS for a name's IP address",
  dig: "dig name [@server] [+short]: ask DNS for a name's address, showing the full answer (+short prints just the address)",
  host: "host name: the shortest way to ask DNS for a name's address",
  arp: "arp -a: show the local cache of IP addresses and their MAC addresses",
  netstat: "netstat -an: show this computer's connections and listening ports",
  ip: "ip a (addresses), ip r (routes) or ip n (neighbours, like arp): Linux's network commands",
  hostname: "hostname: print this computer's name",
  curl: "curl url: fetch a web page and show the response headers",
  discover: "discover target: list which hosts are up and which well-known ports answer. Only works inside this lab's authorised scope",
  cat: "cat file: print a file",
  ls: "ls: list the files in this folder (dir on Windows)",
  clear: "clear: clear the screen",
};
const WELL_KNOWN = { 22: "ssh", 25: "smtp", 53: "domain", 80: "http", 443: "https", 445: "microsoft-ds", 3389: "ms-wbt-server" };  // Nmap's service names

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
    ls: () => ({ out: Object.keys(lab.files || {}).join("  ") }),
    cat: a => { const f = (lab.files || {})[a[0]]; log({ cmd: "cat", arg: a[0] }); return f ? { out: f } : err(`cat: ${a[0] || ""}: No such file or directory`); },
    ipconfig: () => {
      log({ cmd: "ipconfig" });
      return { out: [`Adapter Ethernet0:`, `   IPv4 address . . . : ${me.ip}`, `   Subnet mask  . . . : ${intToIp(maskOf(me.prefix))}`,
        `   Default gateway  . : ${me.gateway}`, `   DNS servers  . . . : ${me.dns.join(", ")}`].join("\n") };
    },
    ping: (a, f, all, opt = {}) => {
      const target = a[0]; if (!target) return err("Usage: ping host");
      const n = Math.min(opt.count || 4, 10);
      const r = resolve(target);
      log({ cmd: "ping", target, ip: r.ip || null, ok: !!(r.ip && reachable(r.ip)) });
      if (!r.ip) return err(`ping: cannot resolve ${target}: Unknown host`);
      if (!reachable(r.ip)) return { out: `Pinging ${r.ip} with 32 bytes of data:\n` + "Request timed out.\n".repeat(n) + `\nPackets: Sent = ${n}, Received = 0 (100% loss)`, error: true };
      const ms = host(r.ip).ms || (sameSubnet(r.ip) ? 1 : 18), ttl = sameSubnet(r.ip) ? 64 : 57;
      return { out: `Pinging ${nameTag(r.ip)} with 32 bytes of data:\n` + Array.from({ length: n }, (_, k) => `Reply from ${r.ip}: bytes=32 time=${ms + (k % 2)}ms TTL=${ttl}`).join("\n") + `\n\nPackets: Sent = ${n}, Received = ${n} (0% loss)` };
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
    dig: (a, f = []) => {
      if (f.includes("-x") || (a[0] && isIp(a.filter(x => !/^[+@]/.test(x))[0] || ""))) return err("[Simulator: reverse lookups (dig -x) aren't modelled here.]");
      const short = a.includes("+short"), words = a.filter(x => !x.startsWith("+"));
      const server = (words.find(x => x.startsWith("@")) || "").slice(1) || me.dns[0];
      const [name, type = "A"] = words.filter(x => !x.startsWith("@"));
      if (!name) return err("Usage: dig name [@server] [+short]");
      if (type.toUpperCase() !== "A") return err(`[Simulator: this lab's DNS only holds A records (IPv4 addresses), so dig ${name} ${type} isn't modelled.]`);
      const r = resolve(name, server), banner = `; <<>> DiG 9.18.28 <<>> ${a.join(" ")}\n;; global options: +cmd`;
      log({ cmd: "nslookup", target: name, server, ok: !!r.ip });
      if (r.timeout) return err(`${`;; communications error to ${server}#53: timed out\n`.repeat(3)}\n${banner}\n;; no servers could be reached`);
      if (short) return { out: r.ip && !isIp(name) ? r.ip : "" };
      const status = r.nx ? "NXDOMAIN" : "NOERROR", fq = name.replace(/\.?$/, ".");
      return { out: [`\n${banner}`, ";; Got answer:", `;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: 4242`,
        `;; flags: qr rd ra; QUERY: 1, ANSWER: ${r.nx ? 0 : 1}, AUTHORITY: 0, ADDITIONAL: 1`, "", ";; QUESTION SECTION:", `;${fq}\t\t\tIN\tA`,
        ...(r.nx ? [] : ["", ";; ANSWER SECTION:", `${fq}\t\t300\tIN\tA\t${r.ip}`]), "", `;; Query time: ${host(server)?.ms || 12} msec`,
        `;; SERVER: ${server}#53(${server}) (UDP)`, "[Simulator: the EDNS, authority and timing lines are left out.]"].join("\n"), error: !!r.nx };
    },
    host: a => {
      const name = a[0]; if (!name) return err("Usage: host name");
      const r = resolve(name);
      log({ cmd: "nslookup", target: name, server: me.dns[0], ok: !!r.ip });
      if (r.timeout) return err(`;; communications error to ${r.server}#53: timed out\n;; no servers could be reached`);
      if (r.nx) return err(`Host ${name} not found: 3(NXDOMAIN)`);
      return { out: isIp(name) ? `[Simulator: reverse lookups aren't modelled here.]` : `${name} has address ${r.ip}` };
    },
    hostname: () => ({ out: me.name || "pc" }),
    // iproute2: ip a / ip addr [show], ip r / ip route, ip n / ip neigh. Shown as on a Linux machine with one wired NIC (eth0).
    ip: a => {
      const sub = (a[0] || "a").toLowerCase(), mac = (me.mac || "").replace(/-/g, ":").toLowerCase();
      const net4 = intToIp((ipToInt(me.ip) & maskOf(me.prefix)) >>> 0), bcast = intToIp(((ipToInt(me.ip) & maskOf(me.prefix)) | (~maskOf(me.prefix) >>> 0)) >>> 0);
      if ("address".startsWith(sub)) {
        log({ cmd: "ipconfig" });
        return { out: ["1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000", "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
          "    inet 127.0.0.1/8 scope host lo", "       valid_lft forever preferred_lft forever",
          "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000", `    link/ether ${mac} brd ff:ff:ff:ff:ff:ff`,
          `    inet ${me.ip}/${me.prefix} brd ${bcast} scope global eth0`, "       valid_lft forever preferred_lft forever"].join("\n") };
      }
      if ("route".startsWith(sub)) { log({ cmd: "ipconfig" }); return { out: `default via ${me.gateway} dev eth0\n${net4}/${me.prefix} dev eth0 proto kernel scope link src ${me.ip}` }; }
      if ("neighbour".startsWith(sub) || "neighbor".startsWith(sub)) {
        log({ cmd: "arp" });
        return { out: net.hosts.filter(h => sameSubnet(h.ip) && h.up && h.mac).map(h => `${h.ip} dev eth0 lladdr ${h.mac.replace(/-/g, ":").toLowerCase()} REACHABLE`).join("\n") };
      }
      return err(`Object "${a[0]}" is unknown, try "ip help".`);
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
  const ALIAS = { dir: "ls", tracert: "traceroute", tracepath: "traceroute", ss: "netstat", ifconfig: "ipconfig" };
  // Options that take a value (so "ping -c 4 host" doesn't read 4 as the host).
  const VALUE = { ping: /^-[cnwWilsI]$/, traceroute: /^-[mqwpf]$/, curl: /^-[oHXdAumebcx]$/, discover: /^-p$/ };
  // Real tools this shell doesn't model, with where to look instead.
  const REAL = { whois: "it isn't part of this lab", telnet: "try curl for web servers", nc: "try curl for web servers", ssh: "it isn't part of this lab",
    wget: "try curl", mtr: "try traceroute", pathping: "try traceroute", route: "try ip r", getmac: "try arp -a", nbtstat: "it isn't part of this lab" };

  function run(line) {
    const raw = line.trim(); if (!raw) return { out: "" };
    state.history.push(raw);
    // Words as a shell splits them: "quoted text" stays one word, without its quotes.
    const parts = (raw.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(w => w.replace(/^(["'])(.*)\1$/, "$2"));
    let cmd = parts[0].toLowerCase();
    cmd = ALIAS[cmd] || cmd;
    const rest = parts.slice(1);
    if (rest.includes("--help") && MAN[cmd]) return { out: `Usage: ${MAN[cmd]}` };
    if (cmd === "nmap") return err(net.scope ? `[Simulator: in this lab the scanner is called discover, and it only scans the authorised scope. Try: discover ${net.scope}]` : "[Simulator: nmap isn't part of this lab.]");
    if (REAL[cmd]) return err(`[Simulator: ${cmd} is a real tool, but this shell doesn't model it: ${REAL[cmd]}.]`);
    // Words that aren't options, skipping an option's value; ping's count is kept (-c 4, -c4, -n 4).
    const args = [], opt = {};
    for (let i = 0; i < rest.length; i++) {
      const x = rest[i], m = x.match(/^-([cn])(\d+)$/);
      if (m && cmd === "ping") { opt.count = Number(m[2]); continue; }
      if (VALUE[cmd]?.test(x) && rest[i + 1] != null && (cmd !== "ping" && cmd !== "traceroute" || /^\d+$/.test(rest[i + 1]))) {
        if (cmd === "ping" && /^-[cn]$/.test(x)) opt.count = Number(rest[i + 1]);
        i++; continue;
      }
      if (!x.startsWith("-")) args.push(x);
    }
    if (!cmds[cmd]) return err(`${parts[0]}: command not found. Type help to list commands.`);
    return cmds[cmd](args, rest.filter(x => x.startsWith("-")), rest, opt);
  }

  function isDone(check) {
    const ev = state.events;
    if (check.ran) return check.ran.every(c => ev.some(e => e.cmd === c));
    if (check.pinged) return ev.some(e => e.cmd === "ping" && (e.target === check.pinged || e.ip === check.pinged));
    if (check.resolved) return ev.some(e => e.cmd === "nslookup" && e.ok && (!check.server || e.server === check.server));
    if (check.found) return ev.some(e => e.cmd === "discover" && !e.refused);
    if (check.refused) return ev.some(e => e.cmd === "discover" && e.refused);  // learned to stay in scope
    // Compared two DNS servers: the "bad" one failed and the "good" one answered (the point is the comparison).
    if (check.lookup) return ev.some(e => e.cmd === "nslookup" && e.server === check.lookup.bad && !e.ok) && ev.some(e => e.cmd === "nslookup" && e.server === check.lookup.good && e.ok);
    if (check.read) return ev.some(e => e.cmd === "cat" && e.arg === check.read);
    return false;
  }
  function complete(prefix) {
    const names = [...Object.keys(MAN), ...Object.keys(ALIAS)];
    const words = prefix.split(/\s+/);
    if (words.length === 1) { const opts = names.filter(n => n.startsWith(words[0])); return opts.length === 1 ? { line: opts[0] + " ", options: [] } : { line: prefix, options: opts }; }
    const hosts = net.hosts.map(h => h.name).filter(Boolean).concat(Object.keys(net.records || {}), Object.keys(lab.files || {}));
    const last = words[words.length - 1], opts = hosts.filter(h => h.startsWith(last));
    return opts.length === 1 ? { line: words.slice(0, -1).concat(opts[0] + " ").join(" "), options: [] } : { line: prefix, options: opts };
  }
  // One link of the "Where's the fault?" chain: "ok", "bad" or null (not tested yet), from the latest matching event.
  function probe(p) {
    const last = f => [...state.events].reverse().find(f);
    if (p.ran) return state.events.some(e => e.cmd === p.ran) ? "ok" : null;
    const e = p.ping ? last(e => e.cmd === "ping" && (e.target === p.ping || e.ip === p.ping)) : p.lookup ? last(e => e.cmd === "nslookup" && e.server === p.lookup) : null;
    return e ? (e.ok ? "ok" : "bad") : null;
  }

  // Guided mode: does a typed line do the same as a walk step? Names as the real tools spell them (tracert, ifconfig,
  // ip a), DNS lookups by any of nslookup, dig or host (with @server or a second word), ping counts ignored.
  function canon(line) {
    const parts = (String(line).trim().match(/"[^"]*"|'[^']*'|\S+/g) || []).map(w => w.replace(/^(["'])(.*)\1$/, "$2"));
    let cmd = (parts[0] || "").toLowerCase(); cmd = ALIAS[cmd] || cmd;
    const words = []; for (let i = 1; i < parts.length; i++) { const x = parts[i]; if (VALUE[cmd]?.test(x) && /^\d+$/.test(parts[i + 1] || "")) { i++; continue; } if (!x.startsWith("-") && !x.startsWith("+")) words.push(x); }
    if (cmd === "ip" && (!words[0] || "address".startsWith(words[0].toLowerCase()))) return "ipconfig";
    if (cmd === "dig" || cmd === "host" || cmd === "nslookup") {
      const at = words.find(w => w.startsWith("@")), rest = words.filter(w => !w.startsWith("@") && !/^a$/i.test(w));
      return `lookup ${(rest[0] || "").toLowerCase()} ${(at ? at.slice(1) : cmd === "nslookup" && rest[1]) || me.dns[0]}`;
    }
    return [cmd, ...words.map(w => w.toLowerCase())].join(" ");
  }
  const same = (a, b) => canon(a) === canon(b);

  // Failsafes: the real tools only say "timed out" or "Unknown host". explain() says what that tells you, or null.
  // Call it straight after run(line) returned res. Pure; tested in tests/walk.test.mjs.
  const near = (a, b) => { if (Math.abs(a.length - b.length) > 1 || a === b) return false; let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)); };
  function explain(line, res) {
    if (!res || !res.error) return null;
    const msg = res.out || "", c = canon(line).split(" "), cmd = c[0], target = c[1] || "";
    if (/command not found/.test(msg)) { const g = [...Object.keys(MAN), ...Object.keys(ALIAS)].find(k => near(cmd, k)); return g ? `Did you mean ${g}?` : null; }
    if (/^Refused: /.test(msg)) return `The scope, ${net.scope}, covers ${intToIp(ipToInt(net.scope.split("/")[0]))} to ${intToIp(((ipToInt(net.scope.split("/")[0]) & maskOf(+net.scope.split("/")[1])) | (~maskOf(+net.scope.split("/")[1]) >>> 0)) >>> 0)}. Anything else is off limits, however close it looks. If a target matters, ask for the scope to be changed in writing.`;
    if (cmd === "discover" && /not an IP address/.test(msg)) return "discover takes an address or a range like 10.10.10.0/24. To scan a name, look up its address first with nslookup, then check that address is in scope.";
    if (cmd === "cat") { const names = Object.keys(lab.files || {}); return names.length ? `The files here are: ${names.join(", ")}. Tab completes names.` : null; }
    if (cmd === "lookup" && /timed out|no servers could be reached/.test(msg)) return `The DNS server ${c[2]} didn't answer at all. Ask a different one to compare, for example nslookup ${target || "www.example.com"} 8.8.8.8. If that works, the fault is the server, not the name.`;
    if (cmd === "lookup" && /Non-existent domain|NXDOMAIN|not found/.test(msg)) return "The DNS server answered: that name doesn't exist. Check the spelling, and whether it's an internal name only your own DNS server knows.";
    if (cmd === "ping" && /cannot resolve/.test(msg)) return `ping couldn't turn ${target} into an address, so it never sent a packet. If ping to an address (such as 8.8.8.8) works, suspect DNS: try nslookup ${target} 8.8.8.8.`;
    if (cmd === "ping" && /Request timed out/.test(msg)) {
      const r = resolve(target), ip = r.ip || target;
      if (sameSubnet(ip)) return `${ip} is on your own network but didn't reply: it's off, unplugged, or a firewall drops ping. Check the address with ipconfig, then the device itself.`;
      return `No reply from ${ip}. Ping your gateway (${me.gateway}) first: if that answers, the problem is further out, and tracert ${ip} shows where replies stop.`;
    }
    if (cmd === "curl" && /Could not resolve host/.test(msg)) return "curl needs DNS to find the server, and the lookup failed. Try nslookup with the name to see why.";
    return null;
  }

  return { run, isDone, complete, state, probe, same, canon, explain, prompt: () => `${me.name || "pc"}:~$` };
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const sh = createNetShell(lab);
  const done = new Set(solved);
  let histI = null, finished = lab.tasks.every(t => done.has(t.id));

  root.innerHTML = `<div class="term-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    ${lab.net.scope ? `<p class="scope-note"><b>Authorised scope:</b> you may only scan <span class="mono">${esc(lab.net.scope)}</span> in this lab. In real life, written permission comes first, every time.</p>` : ""}
    ${lab.ladder ? `<section class="nd-chain" aria-labelledby="nd-title"><h2 class="eyebrow" id="nd-title">${esc(lab.ladder.title)}</h2><ol class="nd-links" id="nd-links"></ol><p class="nd-verdict" id="nd-verdict" aria-live="polite" hidden></p></section>` : ""}
    <div class="term-grid">
      <section class="term-shell t-guided" aria-label="Simulated terminal">
        <div class="vl-now" id="t-now" aria-live="polite"></div>
        <div class="term-bar"><span>${esc((lab.net.me.name || "pc"))}@${esc(lab.host || "workstation")}</span><span class="tag">Simulated</span></div>
        <div class="term-out" id="t-out" aria-live="polite" tabindex="0" aria-label="Terminal output"></div>
        <form class="term-in" id="t-form"><label class="sr" for="t-in">Command</label><span class="term-ps" id="t-ps"></span><input id="t-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
      </section>
      <aside class="panel term-tasks"><div class="panel-title"><h2>Objectives</h2><span class="mono" id="t-count"></span></div><ol id="t-tasks"></ol>
        <div id="t-hintslot"></div>
        <div class="row"><button class="btn ghost" id="t-reset">↺ Reset lab</button></div></aside>
    </div>
    ${lab.simplification ? `<details class="simplification"><summary>How this simulation differs from the real thing</summary><p>${esc(lab.simplification)}</p></details>` : ""}
    ${lab.next ? `<section class="panel" id="t-next" hidden><h2>Take it further</h2><ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>` : ""}
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const out = $("t-out"), input = $("t-in");

  const print = html => { out.insertAdjacentHTML("beforeend", html); out.scrollTop = out.scrollHeight; };
  const format = res => res.error ? `<div class="t-err">${esc(res.out)}</div>` : res.out ? `<div>${esc(res.out)}</div>` : "";
  // "Where's the fault?": each link from the PC outwards turns green or red as it's tested, with what that result means;
  // once the deciding links agree (lab.ladder.when: [index, state]), the verdict says why.
  function drawChain() {
    const L = lab.ladder; if (!L) return;
    const st = L.links.map(k => sh.probe(k.probe));
    $("nd-links").innerHTML = L.links.map((k, i) => `<li class="nd-link ${st[i] || "todo"}"><span class="nd-dot" aria-hidden="true">${st[i] === "ok" ? "✓" : st[i] === "bad" ? "✗" : "?"}</span>
      <b>${esc(k.label)}</b><span class="nd-sub mono">${esc(k.sub)}</span><span class="nd-say">${st[i] ? esc(k[st[i]] || "") : `Not tested yet<span class="nd-try">Try: <code>${esc(k.todo)}</code></span>`}</span>
      <span class="sr">${st[i] === "ok" ? "Working." : st[i] === "bad" ? "Fault." : ""}</span></li>`).join("");
    const v = $("nd-verdict"), hit = (L.when || []).every(([i, want]) => st[i] === want);
    v.hidden = !hit; v.innerHTML = hit ? `<b>Verdict:</b> ${esc(L.verdict)}` : "";
  }
  function renderTasks() {
    drawChain();
    lab.tasks.forEach(t => { if (!done.has(t.id) && sh.isDone(t.check)) { done.add(t.id); onPart(t.id); } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("t-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}</li>`).join("");
    $("t-count").textContent = `${done.size}/${lab.tasks.length}`;
    if (!next) { if ($("t-next")) $("t-next").hidden = false; if (!finished) { finished = true; onComplete(); } }
  }
  const ps = () => { $("t-ps").textContent = sh.prompt(); };
  // Objective strip, on-demand hints with Run it, tips and the rescue (static/js/labs/guide.js). Some steps are meant to fail (a DNS server that's down, an
  // out-of-scope target), so a step that matches moves the walk on whatever the tool answered.
  const g = guide($("t-now"), lab, { done, input, form: $("t-form"), same: sh.same, advanceOnError: true });

  $("t-form").addEventListener("submit", e => {
    e.preventDefault();
    const line = input.value;
    print(`<div><span class="term-ps">${esc(sh.prompt())}</span> ${esc(line)}</div>`);
    const pre = g.before(), res = sh.run(line);
    if (res.clear) out.innerHTML = ""; else print(format(res));
    const tip = sh.explain(line, res);  // the tool says what failed; this says what that tells you
    if (tip) print(`<div class="t-tip">[Tip: ${esc(tip)}]</div>`);
    input.value = ""; histI = null; ps(); renderTasks(); g.after(line, res, pre); g.draw();
  });
  input.addEventListener("keydown", e => {
    const h = sh.state.history;
    if (e.key === "ArrowUp" && h.length) { e.preventDefault(); histI = histI == null ? h.length - 1 : Math.max(0, histI - 1); input.value = h[histI]; }
    else if (e.key === "ArrowDown" && histI != null) { e.preventDefault(); histI = Math.min(h.length, histI + 1); input.value = h[histI] || ""; if (histI >= h.length) histI = null; }
    else if (e.key === "Tab") { e.preventDefault(); const r = sh.complete(input.value); input.value = r.line; if (r.options.length > 1) print(`<div><span class="term-ps">${esc(sh.prompt())}</span> ${esc(input.value)}</div><div>${r.options.map(esc).join("  ")}</div>`); }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
  });
  out.addEventListener("click", () => input.focus());
  dock($("t-now"), $("t-hintslot"), root.querySelector(".term-shell"));  // one hint area: the panel, or above the terminal on a phone
  $("t-reset").addEventListener("click", onReset);

  print(`<div class="muted">Type <b>help</b> to list commands. ↑/↓ for history, Tab to complete names.</div>`);
  ps(); renderTasks(); g.draw();
}
