// "One request, start to finish": follow one ride-hailing app (Hopper, a made-up company) through the ideas
// that carry every request: HTTP, TCP and UDP, TLS, load balancers, reverse proxies, firewalls and WebSockets.
// Seven stops, one picture each. The rules for each stop are pure functions below (tested in
// tests/journey.test.mjs); mount() draws them. Content (requests, certificates, rules) lives in content/labs.json.
import { hw } from "../hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Glossary underlining from the main page (gloss() in src/app/02-glossary.js), or plain escaped text without it.
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));

// ---------- 1. HTTP: a request and its response, as the bytes on the wire (HTTP/1.1, RFC 9112)
export const REASON = { 200: "OK", 201: "Created", 301: "Moved Permanently", 304: "Not Modified", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };
const bytes = s => new TextEncoder().encode(s).length;
// Header lines, a blank line, then the body. Content-Length is counted from the body, so it's always right.
export function httpMessage(start, headers = [], body = "") {
  const h = [...headers];
  if (body) h.push(["Content-Length", String(bytes(body))]);
  return `${start}\n${h.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${body}`;
}
export function exchange(x) {
  return {
    request: httpMessage(`${x.method} ${x.path} HTTP/1.1`, x.headers, x.body || ""),
    response: httpMessage(`HTTP/1.1 ${x.status} ${REASON[x.status]}`, x.responseHeaders, x.responseBody || ""),
    status: x.status, family: `${String(x.status)[0]}xx`,
  };
}

// ---------- 2. TCP and UDP: what happens when a segment goes missing
// Segments are numbered 1..n (real TCP numbers bytes, not segments). TCP's receiver ACKs the next segment it
// needs (a cumulative ACK); three duplicate ACKs make the sender resend at once (fast retransmit), otherwise a
// timeout does. `lost` is the set of segments whose first copy is lost. UDP sends once and never looks back.
export function transfer(n, lost = [], proto = "tcp") {
  const gone = new Set(lost), events = [], got = new Set(), app = [];
  if (proto === "udp") {
    for (let s = 1; s <= n; s++) {
      events.push({ t: "send", seg: s });
      if (gone.has(s)) events.push({ t: "lost", seg: s }); else { events.push({ t: "arrive", seg: s }); got.add(s); app.push(s); }
    }
    return { events, app, missing: [...gone].filter(s => s >= 1 && s <= n).sort((a, b) => a - b), resent: 0 };
  }
  let expect = 1, lastAck = 0, dups = 0, resent = 0;
  const arrive = s => {
    events.push({ t: "arrive", seg: s });
    got.add(s);
    while (got.has(expect)) app.push(expect++);
    const dup = expect === lastAck;
    dups = dup ? dups + 1 : 0; lastAck = expect;
    events.push({ t: "ack", n: expect, dup });
  };
  for (let s = 1; s <= n; s++) {
    events.push({ t: "send", seg: s });
    if (gone.has(s)) { events.push({ t: "lost", seg: s }); continue; }
    arrive(s);
    if (dups === 3 && expect <= n) { events.push({ t: "send", seg: expect, retrans: "fast" }); resent++; arrive(expect); }
  }
  for (let guard = 0; expect <= n && guard < n; guard++) {
    events.push({ t: "timeout", seg: expect });
    events.push({ t: "send", seg: expect, retrans: "timeout" }); resent++;
    arrive(expect);
  }
  return { events, app, missing: [], resent };
}
// Header layouts, 32 bits a row: [name, bits]. TCP's fixed header is 20 bytes; UDP's is 8 (RFC 9293, RFC 768).
export const HEADERS = {
  udp: [[["Source port", 16], ["Destination port", 16]], [["Length", 16], ["Checksum", 16]]],
  tcp: [[["Source port", 16], ["Destination port", 16]], [["Sequence number", 32]], [["Acknowledgment number", 32]],
    [["Offset", 4], ["Reserved", 4], ["Flags", 8], ["Window", 16]], [["Checksum", 16], ["Urgent pointer", 16]]],
};
export const headerBytes = rows => rows.flat().reduce((a, [, b]) => a + b, 0) / 8;

// ---------- 3. TLS: what an eavesdropper captures, and whether a certificate is accepted
// A small seeded generator so the "ciphertext" is the same every time for the same text (it isn't real encryption:
// it stands in for what AES-GCM output looks like, random-looking bytes).
function prng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x & 255; }; }
const seedOf = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const hex = b => b.toString(16).padStart(2, "0");
// Without TLS the capture is the plain text. With TLS 1.3 it's an application_data record: type 0x17, legacy
// version 0x0303, a 2-byte length, then the encrypted bytes (the text, one content-type byte and a 16-byte tag).
export function capture(text, tls) {
  if (!tls) return { plain: true, text };
  const len = bytes(text) + 1 + 16, next = prng(seedOf(text));
  const body = Array.from({ length: len }, next);
  const all = [0x17, 0x03, 0x03, len >> 8, len & 255, ...body];
  return { plain: false, header: all.slice(0, 5).map(hex).join(" "), bytes: all.map(hex), length: len };
}
// Does a certificate name cover this host? A wildcard covers exactly one label (RFC 6125).
export function nameMatches(pattern, host) {
  const p = pattern.toLowerCase().split("."), h = host.toLowerCase().split(".");
  if (p.length !== h.length) return false;
  return p.every((l, i) => l === h[i] || (i === 0 && l === "*"));
}
// What a TLS client decides, with Chrome's error code for each failure.
export function checkCert(cert, host, today, trusted) {
  if (!cert.names.some(n => nameMatches(n, host))) return { ok: false, code: "NET::ERR_CERT_COMMON_NAME_INVALID", why: `The certificate is for ${cert.names.join(", ")}, not ${host}.` };
  if (!trusted.includes(cert.issuer)) return { ok: false, code: "NET::ERR_CERT_AUTHORITY_INVALID", why: `"${cert.issuer}" isn't a certificate authority this device trusts.` };
  if (today < cert.from || today > cert.until) return { ok: false, code: "NET::ERR_CERT_DATE_INVALID", why: `It's only valid from ${cert.from} to ${cert.until}.` };
  return { ok: true, code: "", why: `Issued to ${host} by ${cert.issuer}, a trusted authority, and in date.` };
}

// ---------- 4. Load balancer: spreading requests, and noticing a dead server
// Requests arrive one per tick; each holds a connection for its duration. Round robin takes turns; least
// connections picks the server with fewest open. Health checks run every `every` ticks: `fall` failures mark a
// server down, `rise` passes bring it back (HAProxy's defaults are fall 3, rise 2). A request sent to a crashed
// server that's still marked healthy fails to connect and is retried on the next one, as nginx does by default.
export function lbStart(ids, { fall = 3, rise = 2, every = 1 } = {}) {
  return { tick: 0, rr: 0, fall, rise, every, served: 0, failed: 0, servers: ids.map(id => ({ id, alive: true, healthy: true, fails: 0, passes: 0, conns: [] })), log: [] };
}
const openConns = (sv, t) => sv.conns.filter(end => end > t).length;
export function lbSetAlive(state, id, alive) {
  const s = structuredClone(state), sv = s.servers.find(x => x.id === id);
  if (sv) { sv.alive = alive; if (!alive) sv.conns = []; }
  return s;
}
export function lbRequest(state, algo, dur = 1) {
  const s = structuredClone(state), t = ++s.tick;
  // Health checks first, so a state change shows up on the request that follows it.
  if (t % s.every === 0) for (const sv of s.servers) {
    if (sv.alive) { sv.fails = 0; if (!sv.healthy && ++sv.passes >= s.rise) { sv.healthy = true; sv.passes = 0; s.log.push({ t, health: sv.id, up: true }); } }
    else { sv.passes = 0; if (sv.healthy && ++sv.fails >= s.fall) { sv.healthy = false; s.log.push({ t, health: sv.id, up: false }); } }
  }
  const pool = s.servers.filter(sv => sv.healthy);
  const order = () => {
    if (algo === "least") return [...pool].sort((a, b) => openConns(a, t) - openConns(b, t) || s.servers.indexOf(a) - s.servers.indexOf(b));
    const start = s.rr % (pool.length || 1); s.rr = (start + 1) % (pool.length || 1);
    return [...pool.slice(start), ...pool.slice(0, start)];
  };
  const tried = [];
  for (const sv of order()) {
    if (!sv.alive) { tried.push(sv.id); continue; }
    sv.conns.push(t + dur);
    s.served++;
    s.log.push({ t, server: sv.id, retriedFrom: tried, open: Object.fromEntries(s.servers.map(x => [x.id, openConns(x, t)])) });
    return s;
  }
  s.failed++;
  s.log.push({ t, server: null, retriedFrom: tried, status: 503 });
  return s;
}
export const lbOpen = (state, id) => { const sv = state.servers.find(x => x.id === id); return sv ? openConns(sv, state.tick) : 0; };

// ---------- 5. Reverse proxy: nginx-style prefix locations; the longest matching prefix wins
// Like nginx, the path is cleaned before matching: %-codes decoded, repeated slashes merged (merge_slashes) and
// ./ and ../ resolved. So /pay//admin/ or /rides/../pay/admin/ can't slip past the /pay/admin/ rule.
export function normalisePath(path) {
  let p = String(path || "").split("?")[0];
  try { p = decodeURIComponent(p); } catch { /* keep it as typed */ }
  if (!p.startsWith("/")) return null;
  const out = [];
  for (const seg of p.replace(/\/{2,}/g, "/").split("/").slice(1)) {
    if (seg === "..") out.pop(); else if (seg !== ".") out.push(seg);
  }
  return "/" + out.join("/");
}
export function routePath(locations, path) {
  const p = normalisePath(path);
  if (p === null) return null;
  return locations.filter(l => p.startsWith(l.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0] || null;
}

// ---------- 6. Firewall: rules are read top to bottom, the first match decides, and anything unmatched is denied
const hit = (want, have) => want === "any" || String(want) === String(have);
export function evaluate(rules, flow) {
  const i = rules.findIndex(r => hit(r.src, flow.src) && hit(r.dst, flow.dst) && hit(r.port, flow.port));
  return i < 0 ? { action: "deny", rule: -1 } : { action: rules[i].action, rule: i };
}
export const fwSolved = (rules, tests) => tests.every(t => evaluate(rules, t).action === t.expect);

// ---------- 7. Polling vs a WebSocket: how many requests to hear about the same updates
// Over `seconds`, a poller asks every `interval` seconds; news arrives at the times in `updates`. A WebSocket
// is one HTTP request (the Upgrade) and then one message per update, pushed as it happens.
export function compareLive(seconds, interval, updates) {
  const polls = [];
  for (let t = interval; t <= seconds; t += interval) {
    const fresh = updates.filter(u => u > t - interval && u <= t);
    polls.push({ t, news: fresh.length > 0, lag: fresh.length ? Math.max(...fresh.map(u => t - u)) : 0 });
  }
  return { polls, pollRequests: polls.length, wasted: polls.filter(p => !p.news).length, pushes: updates.filter(u => u <= seconds).length, wsRequests: 1 };
}

// ---------- Part 1, stop: DNS, and why answers are cached for a TTL
// A resolver asks the root, then the TLD's servers, then the domain's own name server, and keeps the answer for
// its TTL (time to live). Until then, it answers from its cache, counting the TTL down, even if the record changed.
export function dnsStart(zone) { return { zone: structuredClone(zone), cache: {} }; }
export function dnsLookup(state, name, now) {
  const s = structuredClone(state), hit = s.cache[name];
  if (hit && hit.expires > now) return { state: s, from: "cache", ip: hit.ip, ttl: hit.expires - now, chain: [] };
  const rec = s.zone[name];
  if (!rec) return { state: s, from: "servers", ip: null, ttl: 0, chain: ["root", "tld", "auth"] };
  s.cache[name] = { ip: rec.ip, expires: now + rec.ttl };
  return { state: s, from: "servers", ip: rec.ip, ttl: rec.ttl, chain: ["root", "tld", "auth"] };
}
// dig's answer section (BIND 9.18): name, the TTL left, class, type, address.
export const digAnswer = (name, r, server) => r.ip
  ? `;; ANSWER SECTION:\n${name}.\t${r.ttl}\tIN\tA\t${r.ip}\n\n;; Query time: ${r.from === "cache" ? 1 : 48} msec\n;; SERVER: ${server}#53(${server}) (UDP)`
  : `;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN\n\n;; SERVER: ${server}#53(${server}) (UDP)`;

// ---------- Part 1, stop: ports, and listening on localhost
// A service listens on an address and a port. 0.0.0.0 means every address the server has, so other machines can
// connect; 127.0.0.1 (localhost) means only programs on the same machine can.
export const PORT_NAMES = { 22: "ssh", 80: "http", 443: "https", 5432: "postgresql", 6379: "redis" };
export function nc(services, from, host, port) {
  const sv = services.find(x => x.port === port);
  const ok = sv && (from === "local" || sv.bind === "0.0.0.0");
  return { ok, out: ok ? `Connection to ${host} ${port} port [tcp/${PORT_NAMES[port] || "*"}] succeeded!` : `nc: connect to ${host} port ${port} (tcp) failed: Connection refused` };
}
// `ss -tlnp` as Ubuntu 22.04 prints it.
export function ssLines(services) {
  const rows = [["State", "Recv-Q", "Send-Q", "Local Address:Port", "Peer Address:Port", "Process"],
    ...services.map(x => ["LISTEN", "0", String(x.backlog), `${x.bind}:${x.port}`, "0.0.0.0:*", `users:(("${x.process}",pid=${x.pid},fd=${x.fd}))`])];
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
  return rows.map(r => r.map((c, i) => (i === 3 ? c.padStart(w[i]) : c.padEnd(w[i]))).join("  ").trimEnd()).join("\n");
}

// ---------- Part 1, stop: MAC addresses and ARP
// On the local network, frames go to MAC addresses. To send to an IP, a device first works out the next hop: the
// address itself if it's on the same network, otherwise the default gateway. Then it asks everyone (an ARP
// broadcast) "who has <next hop>?", and only that device answers with its MAC.
const ipNum = ip => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);
export const sameNetwork = (a, b, mask) => ipNum(a) - (ipNum(a) % (2 ** 32 - ipNum(mask))) === ipNum(b) - (ipNum(b) % (2 ** 32 - ipNum(mask)));
export const nextHop = (me, dest) => (sameNetwork(me.ip, dest, me.mask) ? dest : me.gw);
export function arpResolve(state, lan, me, dest) {
  const s = structuredClone(state), hop = nextHop(me, dest);
  if (s[hop] && s[hop] !== "FAILED") return { state: s, hop, cached: true, mac: s[hop], replier: lan.find(h => h.ip === hop)?.name };
  const owner = lan.find(h => h.ip === hop);
  s[hop] = owner ? owner.mac : "FAILED";
  return { state: s, hop, cached: false, mac: owner?.mac || null, replier: owner?.name || null };
}
// `ip neigh` (iproute2), which Android and Linux both use.
export const ipNeigh = (table, dev = "wlan0") => Object.entries(table).map(([ip, mac]) => (mac === "FAILED" ? `${ip} dev ${dev} FAILED` : `${ip} dev ${dev} lladdr ${mac} REACHABLE`)).join("\n");

// ---------- Part 1, stop: routing and traceroute
// traceroute sends probes with TTL 1, 2, 3…; each router takes one off, and the one that hits 0 drops the probe and
// sends back ICMP "time exceeded", so every hop gives itself away. The destination answers "port unreachable"
// (Linux traceroute sends UDP to an unlikely port). Some routers never reply: that's a row of stars.
export function probe(hops, ttl) {
  const h = hops[Math.min(ttl, hops.length) - 1], last = ttl >= hops.length;
  return { hop: h, reached: last, silent: !!h.silent, icmp: h.silent ? null : last ? "port unreachable" : "time exceeded" };
}
const times = (rtt, n) => [0, 1, 2].map(i => (rtt + ((n * 7 + i * 13) % 9) / 10 - 0.4).toFixed(3));
export function tracerouteLine(hops, n) {
  const h = hops[n - 1], pad = String(n).padStart(2);
  if (h.silent) return `${pad}  * * *`;
  return `${pad}  ${h.rdns || h.ip} (${h.ip})  ${times(h.rtt, n).map(t => `${t} ms`).join("  ")}`;
}

// ---------- Part 1, stop: NAT
// Many inside devices share one public address. Going out, the router rewrites the source to its public address and
// a port of its own, and remembers the pair. A packet coming in is let through only if it answers one of those.
export function natStart(pub, firstPort = 40001) { return { pub, next: firstPort, table: [] }; }
export function natOut(state, inside, dest) {
  const s = structuredClone(state);
  let row = s.table.find(r => r.inside === inside && r.dest === dest);
  if (!row) { row = { inside, outside: `${s.pub}:${s.next++}`, dest }; s.table.push(row); }
  return { state: s, row };
}
export function natIn(state, from, to) {
  const row = state.table.find(r => r.dest === from && r.outside === to);
  return row ? { allowed: true, row } : { allowed: false, row: null };
}

// ---------- Part 1, stop: network tiers (public, app and data subnets with security groups)
// Two layers decide whether traffic gets through. First the network: only the public subnet can be reached from the
// internet. Then the security group of the target: allow rules only, each from "anywhere" or from another group.
export function tierCheck(tiers, flow) {
  const to = tiers[flow.to], fromTier = flow.from === "internet" ? null : tiers[flow.from];
  if (!fromTier && !to.public) return { ok: false, layer: "network", why: `${to.label} is in a private subnet: nothing on the internet can route to it.` };
  const rule = to.rules.find(r => r.port === flow.port && (r.from === "anywhere" || r.from === flow.from));
  if (!rule) return { ok: false, layer: "group", why: `${to.label}'s security group has no rule allowing this.` };
  return { ok: true, layer: "group", why: `Allowed by ${to.label}'s rule: port ${rule.port} from ${rule.from === "anywhere" ? "anywhere" : tiers[rule.from].label}.` };
}

// ---------- the page
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {} } = {}) {
  const C = lab.chapters, done = new Set(solved);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let at = Math.max(0, C.findIndex(c => !done.has(c.id)));
  let finished = C.every(c => done.has(c.id));
  const mark = id => {
    if (!done.has(id)) { done.add(id); onPart(id); }
    stops();
    const box = root.querySelector(`#jr-goal`); if (box && C[at].id === id) box.classList.add("met");
    if (!finished && C.every(c => done.has(c.id))) { finished = true; onComplete(); }
  };
  root.innerHTML = `<div class="journey stack">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${lab.part ? `${esc(lab.series)}, part ${lab.part} of 2` : esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${gl(lab.intro)}</p>
      ${lab.prev ? `<p><a class="link-btn" href="#lab-${esc(lab.prev)}">← Part ${lab.part - 1}: finding the server first</a></p>` : ""}</div>
    <nav class="jr-stops" aria-label="Stops on the journey"><ol id="jr-stops" style="--n:${C.length}"></ol></nav>
    <section class="panel jr-chapter" id="jr-ch" aria-live="polite"></section>
    <details class="tbl simplification"><summary>How this lab differs from real systems</summary><p>${esc(lab.simplification)}</p></details>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  function stops() {
    $("jr-stops").innerHTML = C.map((c, i) => `<li class="${done.has(c.id) ? "done" : ""}${i === at ? " here" : ""}"><button type="button" data-stop="${i}"${i === at ? ' aria-current="step"' : ""}>
      <span class="jr-dot" aria-hidden="true">${done.has(c.id) ? "✓" : i + 1}</span><span class="jr-name">${esc(c.label)}</span><span class="sr-only">${done.has(c.id) ? " (done)" : ""}</span></button></li>`).join("");
  }
  $("jr-stops").addEventListener("click", e => { const b = e.target.closest("[data-stop]"); if (b) { at = Number(b.dataset.stop); show(true); } });
  function show(focus) {
    stops();
    const c = C[at], seen = new Set();
    $("jr-ch").innerHTML = `<div class="eyebrow">Stop ${at + 1} of ${C.length}</div><h2 tabindex="-1" id="jr-title">${esc(c.title)}</h2><p class="jr-idea">${gl(c.idea, 4, seen)}</p>
      <div id="jr-body"></div>
      <p class="jr-goal${done.has(c.id) ? " met" : ""}" id="jr-goal"><span class="jr-tick" aria-hidden="true"></span><b>Try it:</b> ${esc(c.goal)}</p>
      <div class="jr-angle"><b>Security angle</b><p>${gl(c.security, 3, seen)}</p></div>
      ${c.deeper ? `<p class="jr-small">Go deeper: <a href="${esc(c.deeper.href)}">${esc(c.deeper.label)}</a></p>` : ""}
      <div class="row jr-nav">${at > 0 ? `<button class="btn ghost" type="button" data-go="-1">‹ ${esc(C[at - 1].label)}</button>` : ""}${at < C.length - 1 ? `<button class="btn" type="button" data-go="1">Next: ${esc(C[at + 1].label)} ›</button>` : lab.next ? `<a class="btn" href="#lab-${esc(lab.next)}">Part ${lab.part + 1}: what happens once it's found ›</a>` : ""}</div>`;
    $("jr-ch").querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { at += Number(b.dataset.go); show(true); }));
    SCENES[c.id]($("jr-body"), c, () => mark(c.id));
    if (focus) { $("jr-title").focus({ preventScroll: true }); $("jr-ch").scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); }
  }
  // A packet dot that glides along a line in the scene's SVG (or jumps there with reduced motion).
  const fly = (svg, [x1, y1], [x2, y2], cls = "") => new Promise(res => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    g.setAttribute("r", "7"); g.setAttribute("class", `jr-pkt ${cls}`);
    g.style.transform = `translate(${x1}px, ${y1}px)`; svg.appendChild(g);
    if (reduced) { g.style.transform = `translate(${x2}px, ${y2}px)`; setTimeout(() => { g.remove(); res(); }, 60); return; }
    void g.getBoundingClientRect();
    g.style.transition = "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)";
    g.style.transform = `translate(${x2}px, ${y2}px)`;
    setTimeout(() => { g.remove(); res(); }, 720);
  });
  // Animated handlers ignore clicks until they've finished, so two answers can't interleave.
  const guard = fn => {
    let busy = false;
    return async (...a) => {
      if (busy) return;
      busy = true; root.querySelector("#jr-body")?.setAttribute("aria-busy", "true");
      try { await fn(...a); } finally { busy = false; root.querySelector("#jr-body")?.removeAttribute("aria-busy"); }
    };
  };
  const dev = (kind, x, y, label, cls = "", s = 1) => `<g class="jr-dev ${cls}">${hw(kind, x, y, s)}<text x="${x}" y="${y + 40 * s}" text-anchor="middle" class="jr-label">${esc(label)}</text></g>`;
  const wire = (x1, y1, x2, y2, cls = "") => `<line class="jr-wire ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const code = (title, text, cls = "") => `<figure class="jr-code ${cls}"><figcaption>${esc(title)}</figcaption><pre tabindex="0">${esc(text)}</pre></figure>`;

  const SCENES = {
    // Part 1: DNS
    dns(el, c, met) {
      let st = dnsStart(c.zone), now = 0, cached = false, expired = false, moved = false;
      const N = [["phone", 60, 90, "Hopper app"], ["server", 220, 90, "Resolver"], ["cloud", 400, 40, "Root servers"], ["cloud", 400, 140, ".example servers"], ["server", 570, 90, "ns1.hopper.example"]];
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 215" role="img" aria-label="The app asks a resolver. On a miss, the resolver asks the root servers, the .example servers and Hopper's name server, then caches the answer.">
          ${wire(90, 90, 190, 90)}${wire(250, 80, 370, 40)}${wire(250, 100, 370, 140)}${wire(250, 90, 540, 90, "jr-inside")}
          ${N.map(([k, x, y, l]) => dev(k, x, y, l, "", k === "cloud" ? 0.9 : 1)).join("")}
          <text class="jr-tag" id="jr-cache" x="220" y="205" text-anchor="middle">cache empty</text></svg>
        <div class="row"><button class="btn brand" type="button" id="jr-look">Look up ${esc(c.host)}</button><button class="btn" type="button" data-wait="60">Wait 1 minute</button><button class="btn" type="button" data-wait="300">Wait 5 minutes</button><button class="btn ghost" type="button" id="jr-move">Hopper moves server</button></div>
        <p class="muted jr-small" id="jr-clock" aria-live="polite"></p>
        <div class="jr-pair"><div id="jr-dig"></div><div id="jr-dnsnote" aria-live="polite"></div></div>`;
      const svg = el.querySelector("svg"), clock = () => { el.querySelector("#jr-clock").textContent = `Clock: ${Math.floor(now / 60)} min ${now % 60} s. ${st.cache[c.host] ? `Cached answer expires in ${Math.max(0, st.cache[c.host].expires - now)} s.` : "Nothing cached yet."}`; };
      const tag = () => { const k = st.cache[c.host]; el.querySelector("#jr-cache").textContent = k && k.expires > now ? `cached: ${k.ip} (${k.expires - now} s left)` : k ? "cached answer expired" : "cache empty"; };
      el.querySelector("#jr-look").addEventListener("click", guard(() => look()));
      async function look() {
        const hadExpired = !!st.cache[c.host] && st.cache[c.host].expires <= now;
        const r = dnsLookup(st, c.host, now); st = r.state;
        await fly(svg, [90, 90], [190, 90]);
        if (r.from === "servers") for (const [x, y] of [[370, 40], [370, 140], [540, 90]]) { await fly(svg, [250, 90], [x, y]); await fly(svg, [x, y], [250, 90], "s2xx"); }
        await fly(svg, [190, 90], [90, 90], "s2xx");
        el.querySelector("#jr-dig").innerHTML = code(`dig ${c.host}`, digAnswer(c.host, r, c.resolver));
        el.querySelector("#jr-dnsnote").innerHTML = `<p class="jr-note">${r.from === "cache"
          ? `<b>From the cache</b> in 1 ms, with ${r.ttl} seconds of its TTL left. The resolver didn't ask anyone.${moved && r.ip !== st.zone[c.host].ip ? ` <b class="no">But Hopper moved to ${esc(st.zone[c.host].ip)}: this answer is out of date until the TTL runs out.</b>` : ""}`
          : `<b>Asked the servers</b>: the root pointed to the .example servers, they pointed to ns1.hopper.example, and it gave the answer with a TTL of ${r.ttl} seconds.${hadExpired ? " The cached copy had expired, so the resolver had to ask again." : ""}`}</p>`;
        if (r.from === "cache") cached = true;
        if (hadExpired) expired = true;
        tag(); clock();
        if (cached && expired) met();
      }
      el.querySelectorAll("[data-wait]").forEach(b => b.addEventListener("click", () => { now += Number(b.dataset.wait); tag(); clock(); }));
      el.querySelector("#jr-move").addEventListener("click", e => {
        moved = true; st.zone[c.host].ip = c.movedIp; e.target.disabled = true;
        el.querySelector("#jr-dnsnote").innerHTML = `<p class="jr-note">Hopper's name server now says <span class="mono">${esc(c.movedIp)}</span>. Anyone with the old answer cached keeps using <span class="mono">${esc(c.zone[c.host].ip)}</span> until its TTL runs out. Try a lookup.</p>`;
      });
      tag(); clock();
    },
    // Part 1: ports and localhost
    ports(el, c, met) {
      const sv = structuredClone(c.services);
      el.innerHTML = `<div class="jr-ports" id="jr-ports"></div>
        <div class="row"><span class="jr-small muted">Test with <span class="mono">nc -zv</span> from:</span><button class="btn" type="button" data-from="local">The server itself</button><button class="btn brand" type="button" data-from="remote">Another machine</button></div>
        <div class="jr-pair"><div id="jr-ss"></div><div id="jr-nc" aria-live="polite"></div></div>`;
      const ok = () => sv.every(x => (x.bind === "0.0.0.0") === x.public);
      const draw = () => {
        el.querySelector("#jr-ports").innerHTML = `<div class="jr-box-host"><div class="jr-host-t"><b>One server</b><span class="mono">${esc(c.host)}</span></div>
          <ul class="jr-svcs">${sv.map((x, i) => `<li class="${x.bind === "0.0.0.0" ? "open" : "local"}"><span class="jr-port mono">:${x.port}</span><b>${esc(x.name)}</b>
            <label>Listens on <select data-bind="${i}"><option value="0.0.0.0"${x.bind === "0.0.0.0" ? " selected" : ""}>0.0.0.0 (every address)</option><option value="127.0.0.1"${x.bind === "127.0.0.1" ? " selected" : ""}>127.0.0.1 (localhost only)</option></select></label>
            <span class="jr-reach">${x.bind === "0.0.0.0" ? "Up, reachable from other machines" : "Up, reachable only from this server"}</span></li>`).join("")}</ul></div>`;
        el.querySelector("#jr-ss").innerHTML = code("ss -tlnp (what's listening, and where)", ssLines(sv));
        el.querySelectorAll("[data-bind]").forEach(k => k.addEventListener("change", () => { sv[Number(k.dataset.bind)].bind = k.value; draw(); el.querySelector(`[data-bind="${k.dataset.bind}"]`).focus(); }));
      };
      // What the outside test shows when it isn't locked down: private services exposed, the public one hidden, or both.
      const remoteNote = () => {
        const open = sv.filter(x => !x.public && x.bind === "0.0.0.0"), hidden = sv.filter(x => x.public && x.bind !== "0.0.0.0"), notes = [];
        if (open.length) notes.push(`${open.map(x => esc(x.name)).join(" and ")} answer${open.length === 1 ? "s" : ""} from outside. Should ${open.length === 1 ? "it" : "they"}?`);
        if (hidden.length) notes.push(`${hidden.map(x => esc(x.name)).join(" and ")} ${hidden.length === 1 ? "is" : "are"} only on localhost now, so customers can't reach ${hidden.length === 1 ? "it" : "them"}.`);
        return notes.join(" ");
      };
      el.querySelectorAll("[data-from]").forEach(b => b.addEventListener("click", () => {
        const from = b.dataset.from, host = from === "local" ? "127.0.0.1" : c.host;
        const out = sv.map(x => nc(sv, from, host, x.port).out).join("\n");
        el.querySelector("#jr-nc").innerHTML = `${code(`${from === "local" ? "On the server" : "From another machine"}: nc -zv ${host} ${sv.map(x => x.port).join(" ")}`, out)}
          <p class="jr-note">${ok() && from === "remote" ? `<b class="ok">Locked down.</b> Only the website answers from outside; the database and cache still work for the website on the same machine.` : from === "local" ? "On the server itself, everything answers: localhost reaches every service." : remoteNote()}</p>`;
        if (ok() && from === "remote") met();
      }));
      draw();
    },
    // Part 1: MAC and ARP
    arp(el, c, met) {
      let table = {}; const did = new Set();
      const P = { "192.168.1.1": [320, 40], "192.168.1.31": [560, 100], "192.168.1.40": [560, 190] }, ME = [90, 120];
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 240" role="img" aria-label="A home network: the phone, the home router, a laptop and a smart TV, each with an IP and a MAC address.">
          <rect class="jr-zone" x="6" y="6" width="628" height="228" rx="12"/><text class="jr-sub" x="18" y="24">Home network 192.168.1.0/24</text>
          ${c.lan.map(h => wire(ME[0] + 30, ME[1], P[h.ip][0] - 30, P[h.ip][1])).join("")}
          ${dev("phone", ME[0], ME[1], `${c.me.ip}`)}<text class="jr-sub" x="${ME[0]}" y="${ME[1] + 58}" text-anchor="middle">${esc(c.me.mac)}</text>
          ${c.lan.map(h => `${dev(h.kind, P[h.ip][0], P[h.ip][1], h.ip, "", 0.8)}<text class="jr-sub" x="${P[h.ip][0]}" y="${P[h.ip][1] + 48}" text-anchor="middle">${esc(h.mac)}</text>`).join("")}
          <text class="jr-tag" id="jr-say" x="250" y="150" text-anchor="middle"></text></svg>
        <div class="row jr-picks" role="group" aria-label="Send to">${c.destinations.map((d, i) => `<button type="button" class="chip" data-d="${i}" aria-pressed="false">${esc(d.label)} <span class="n">${esc(d.ip)}</span></button>`).join("")}</div>
        <div class="jr-pair"><div id="jr-arpnote" aria-live="polite"><p class="muted">Pick where to send something.</p></div><div id="jr-neigh"></div></div>`;
      const svg = el.querySelector("svg");
      const neigh = () => { el.querySelector("#jr-neigh").innerHTML = code("ip neigh (the phone's ARP table)", ipNeigh(table) || "(empty)"); };
      el.querySelector(".jr-picks").addEventListener("click", guard(async e => {
        const b = e.target.closest("[data-d]"); if (!b) return;
        const d = c.destinations[Number(b.dataset.d)];
        el.querySelectorAll("[data-d]").forEach(x => x.setAttribute("aria-pressed", x === b));
        const r = arpResolve(table, c.lan, c.me, d.ip); table = r.state;
        const say = el.querySelector("#jr-say");
        say.textContent = r.cached ? "" : `Who has ${r.hop}? Tell ${c.me.ip}`;
        if (!r.cached) {
          await Promise.all(c.lan.map(h => fly(svg, [ME[0] + 30, ME[1]], [P[h.ip][0] - 30, P[h.ip][1]])));
          const o = c.lan.find(h => h.ip === r.hop);
          if (o) { say.textContent = `${r.hop} is at ${o.mac}`; await fly(svg, [P[o.ip][0] - 30, P[o.ip][1]], [ME[0] + 30, ME[1]], "s2xx"); }
          else say.textContent = "No reply";
        }
        const local = r.hop === d.ip;
        el.querySelector("#jr-arpnote").innerHTML = `<p class="jr-note">${local ? `${esc(d.ip)} is on the same network (192.168.1.0/24), so the phone asks for it directly.` : `<b>${esc(d.ip)} isn't on this network</b>, so the phone doesn't ARP for it at all. It sends the frame to its default gateway, <b>${esc(c.me.gw)}</b>, and the router takes it from there.`}
          ${r.cached ? ` The MAC was already in the ARP table, so there was no broadcast.` : r.mac ? ` It broadcast "who has ${esc(r.hop)}?" to every device; only ${esc(r.replier)} replied, with <span class="mono">${esc(r.mac)}</span>.` : ` It broadcast "who has ${esc(r.hop)}?" and nobody replied: nothing can be sent.`}</p>`;
        neigh();
        did.add(local ? "local" : "remote");
        if (did.has("local") && did.has("remote")) met();
      }));
      neigh();
    },
    // Part 1: routing and traceroute
    route(el, c, met) {
      // Across on wide screens; down on a phone, where six hops side by side would be too small to read.
      let ttl = 0; const H = c.hops, narrow = el.clientWidth < 520;
      const at = i => (narrow ? [70, 70 + i * 62] : [62 + i * (540 / (H.length - 1)), 70]), ME = narrow ? [70, 14] : [22, 70];
      const towards = i => { const [x, y] = at(i); return narrow ? [x, y - 22] : [x - 22, y]; };
      const svgW = narrow ? 360 : 640, svgH = narrow ? 70 + (H.length - 1) * 62 + 30 : 150;
      el.innerHTML = `<svg class="jr-svg${narrow ? " tall" : ""}" viewBox="0 ${narrow ? -10 : 0} ${svgW} ${svgH}" role="img" aria-label="${esc(`The path from the phone to Hopper: ${H.map(h => h.name).join(", ")}.`)}">
          ${H.map((_, i) => { const [x, y] = at(i), [px, py] = i ? at(i - 1) : ME; return wire(px, py + (narrow ? 18 : 0), x, y - (narrow ? 18 : 0)); }).join("")}
          ${dev("phone", ...ME, "", "", narrow ? 0.45 : 0.7)}
          ${H.map((h, i) => { const [x, y] = at(i), k = i === H.length - 1 ? "server" : "router";
            return narrow ? `<g data-hop="${i}">${hw(k, x, y, 0.55)}<text class="jr-label" x="${x + 44}" y="${y - 2}">${i + 1}. ${esc(h.name)}</text><text class="jr-sub" x="${x + 44}" y="${y + 14}">${esc(h.ip)}</text></g>`
              : `<g data-hop="${i}">${dev(k, x, y, h.name, "", 0.62)}<text class="jr-sub" x="${x}" y="108" text-anchor="middle">${esc(h.ip)}</text></g>`; }).join("")}</svg>
        <div class="row"><button class="btn brand" type="button" id="jr-probe">Send probe with TTL 1</button><button class="btn ghost" type="button" id="jr-rreset">Start again</button></div>
        <div class="jr-pair"><div id="jr-tr"></div><div id="jr-rnote" aria-live="polite"><p class="muted">Each probe can cross only TTL routers before it's dropped.</p></div></div>
        <p class="jr-small"><b>IP vs MAC:</b> ${esc(c.ipmac)}</p>`;
      const svg = el.querySelector("svg");
      const lines = () => [`traceroute to ${c.host} (${H.at(-1).ip}), 30 hops max, 60 byte packets`, ...Array.from({ length: ttl }, (_, i) => tracerouteLine(H, i + 1))].join("\n");
      const draw = () => { el.querySelector("#jr-tr").innerHTML = code(`traceroute ${c.host}`, lines()); el.querySelector("#jr-probe").textContent = ttl >= H.length ? "Reached the server" : `Send probe with TTL ${ttl + 1}`; el.querySelector("#jr-probe").disabled = ttl >= H.length; };
      el.querySelector("#jr-probe").addEventListener("click", async () => {
        if (ttl >= H.length) return;
        ttl++;
        const r = probe(H, ttl);
        el.querySelector("#jr-probe").disabled = true;
        await fly(svg, ME, towards(ttl - 1));
        if (!r.silent) await fly(svg, towards(ttl - 1), ME, r.reached ? "s2xx" : "");
        svg.querySelectorAll("[data-hop]").forEach(g => g.classList.toggle("on", Number(g.dataset.hop) === ttl - 1));
        el.querySelector("#jr-rnote").innerHTML = `<p class="jr-note">${r.silent ? `<b>Hop ${ttl}: no answer.</b> ${esc(r.hop.name)} dropped the probe but doesn't send "time exceeded" messages (many routers are set not to), so traceroute prints stars and carries on.`
          : r.reached ? `<b>Reached ${esc(r.hop.ip)}.</b> The server isn't a router, so instead of "time exceeded" it answers "port unreachable" (traceroute aimed at a port nobody uses). ${ttl} hops end to end.`
          : `<b>Hop ${ttl}: ${esc(r.hop.name)}.</b> The probe's TTL hit 0 here, so the router dropped it and sent back ICMP "time exceeded", revealing its address ${esc(r.hop.ip)}.`}</p>`;
        draw();
        if (r.reached) met();
      });
      el.querySelector("#jr-rreset").addEventListener("click", () => { ttl = 0; svg.querySelectorAll("[data-hop]").forEach(g => g.classList.remove("on")); el.querySelector("#jr-rnote").innerHTML = ""; draw(); });
      draw();
    },
    // Part 1: NAT
    nat(el, c, met) {
      let st = natStart(c.pub); const did = new Set(); const flows = [];
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 170" role="img" aria-label="Inside the home, the phone and laptop have private addresses. The router has one public address on the internet side.">
          <rect class="jr-zone" x="6" y="6" width="300" height="158" rx="12"/><text class="jr-sub" x="18" y="24">Inside: private addresses</text>
          ${wire(90, 55, 270, 90)}${wire(90, 125, 270, 90)}${wire(330, 90, 540, 90)}
          ${dev("phone", 70, 55, "192.168.1.24", "", 0.7)}${dev("laptop", 70, 125, "192.168.1.31", "", 0.6)}${dev("router", 300, 90, "", "", 0.8)}
          <text class="jr-label" x="300" y="130" text-anchor="middle">${esc(c.pub)}</text><text class="jr-sub" x="300" y="146" text-anchor="middle">public address</text>${dev("cloud", 575, 90, "Internet", "", 0.9)}</svg>
        <div class="row jr-picks">${c.actions.map((a, i) => `<button type="button" class="btn${a.kind === "in" ? " ghost" : ""}" data-act="${i}">${esc(a.label)}</button>`).join("")}</div>
        <div id="jr-nattab"></div><div id="jr-natnote" aria-live="polite"></div>`;
      const svg = el.querySelector("svg");
      const table = () => { el.querySelector("#jr-nattab").innerHTML = `<div class="vl-table" role="region" aria-label="NAT table" tabindex="0"><table class="tbl"><thead><tr><th scope="col">Inside address</th><th scope="col">Rewritten to</th><th scope="col">Talking to</th></tr></thead><tbody>${st.table.length ? st.table.map(r => `<tr><td class="mono">${esc(r.inside)}</td><td class="mono">${esc(r.outside)}</td><td class="mono">${esc(r.dest)}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">Empty: nothing has gone out yet.</td></tr>`}</tbody></table></div>`; };
      el.querySelector(".jr-picks").addEventListener("click", guard(async e => {
        const b = e.target.closest("[data-act]"); if (!b) return;
        const a = c.actions[Number(b.dataset.act)];
        let msg;
        if (a.kind === "out") {
          const r = natOut(st, a.inside, a.dest); st = r.state; flows[Number(b.dataset.act)] = r.row;
          await fly(svg, a.inside.startsWith("192.168.1.24") ? [90, 55] : [90, 125], [270, 90]); await fly(svg, [330, 90], [540, 90]);
          msg = `Out: from <span class="mono">${esc(a.inside)}</span> becomes from <span class="mono">${esc(r.row.outside)}</span>. The router noted the pair, so it'll know where the reply belongs.`;
          did.add("out");
        } else {
          const ref = a.kind === "reply" ? flows[a.of] : null;
          const from = ref ? ref.dest : a.from, to = ref ? ref.outside : a.to;
          if (a.kind === "reply" && !ref) { el.querySelector("#jr-natnote").innerHTML = `<p class="jr-note">Nothing to reply to yet: send something out first.</p>`; return; }
          const r = natIn(st, from, to);
          await fly(svg, [540, 90], [335, 90], r.allowed ? "s2xx" : "bad");
          if (r.allowed) await fly(svg, [270, 90], r.row.inside.startsWith("192.168.1.24") ? [90, 55] : [90, 125], "s2xx");
          msg = r.allowed ? `In: <span class="mono">${esc(from)}</span> → <span class="mono">${esc(to)}</span> matches the table, so the router rewrites it back to <span class="mono">${esc(r.row.inside)}</span> and delivers it.`
            : `In: <span class="mono">${esc(from)}</span> → <span class="mono">${esc(to)}</span> matches nothing in the table. Nobody inside asked for it, and the router doesn't know who it would be for, so it's dropped.`;
          did.add(r.allowed ? "reply" : "dropped");
        }
        el.querySelector("#jr-natnote").innerHTML = `<p class="jr-note">${msg}</p>`;
        table();
        if (did.size === 3) met();
      }));
      table();
    },
    // Part 1: network tiers
    tiers(el, c, met) {
      const tiers = structuredClone(c.tiers), ed = c.editable, X = { internet: 60, lb: 230, app: 400, db: 570 };
      const name = id => (id === "internet" ? "Internet" : tiers[id].label);
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 190" role="img" aria-label="Three subnets: public with the load balancer, a private app subnet and a private data subnet with the database.">
          ${["lb", "app", "db"].map(k => `<rect class="jr-zone${tiers[k].public ? "" : " priv"}" x="${X[k] - 72}" y="14" width="144" height="146" rx="10"/><text class="jr-sub" x="${X[k]}" y="32" text-anchor="middle">${esc(tiers[k].public ? "public" : "private")}</text>`).join("")}
          ${wire(90, 90, 200, 90)}${wire(260, 90, 370, 90)}${wire(430, 90, 545, 90)}
          ${dev("cloud", X.internet, 90, "Internet", "", 0.9)}${dev("switch", X.lb, 90, name("lb"), "", 0.7)}${dev("server", X.app, 90, name("app"), "", 0.8)}${dev("db", X.db, 90, name("db"), "", 0.8)}</svg>
        <div class="jr-sgs" id="jr-sgs"></div>
        <div class="vl-table" role="region" aria-label="Test traffic" tabindex="0"><table class="tbl jr-tests"><thead><tr><th scope="col">Test traffic</th><th scope="col">Should be</th><th scope="col">Is</th><th scope="col">Why</th></tr></thead><tbody id="jr-ttb"></tbody></table></div>
        <div id="jr-tmsg" aria-live="polite"></div>`;
      const draw = () => {
        el.querySelector("#jr-sgs").innerHTML = ["lb", "app", "db"].map(k => `<div class="jr-sg"><b>${esc(tiers[k].label)}</b> <span class="muted jr-small">security group</span>
          ${tiers[k].rules.map((r, i) => `<p class="mono jr-small">allow tcp/${r.port} from ${k === ed ? `<label class="sr-only" for="jr-sg-${i}">Allow from</label><select id="jr-sg-${i}" data-rule="${i}">${["anywhere", "lb", "app"].map(o => `<option value="${o}"${r.from === o ? " selected" : ""}>${esc(o === "anywhere" ? "anywhere (0.0.0.0/0)" : `${tiers[o].label} group`)}</option>`).join("")}</select>` : esc(r.from === "anywhere" ? "anywhere (0.0.0.0/0)" : `${tiers[r.from].label} group`)}</p>`).join("")}</div>`).join("");
        el.querySelectorAll("[data-rule]").forEach(k => k.addEventListener("change", () => { tiers[ed].rules[Number(k.dataset.rule)].from = k.value; draw(); el.querySelector(`[data-rule="${k.dataset.rule}"]`).focus(); }));
        const res = c.tests.map(t => ({ t, r: tierCheck(tiers, t) }));
        el.querySelector("#jr-ttb").innerHTML = res.map(({ t, r }) => `<tr class="${r.ok === t.expect ? "right" : "wrong"}"><td>${esc(name(t.from))} → ${esc(name(t.to))} <span class="mono">tcp/${t.port}</span></td><td>${t.expect ? "allowed" : "blocked"}</td>
          <td><b class="${r.ok === t.expect ? "ok" : "no"}">${r.ok === t.expect ? "✓" : "✗"} ${r.ok ? "allowed" : "blocked"}</b></td><td class="jr-why">${esc(r.why)}</td></tr>`).join("");
        const wrong = res.filter(x => x.r.ok !== x.t.expect).length;
        el.querySelector("#jr-tmsg").innerHTML = wrong ? `<p class="jr-note">${wrong} test${wrong === 1 ? "" : "s"} wrong.</p>` : `<p class="jr-note"><b class="ok">Every test passes.</b> Each tier now accepts only the one in front of it.</p>`;
        if (!wrong) met();
      };
      draw();
    },
    // 1. HTTP
    http(el, c, met) {
      const tried = new Set();
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 150" role="img" aria-label="The Hopper app on a phone sends an HTTP request to the API server and gets a response.">
        ${wire(110, 70, 530, 70)}${dev("phone", 80, 70, "Hopper app")}${dev("server", 560, 70, c.host)}
        <text class="jr-tag" id="jr-st" x="320" y="58" text-anchor="middle"></text></svg>
        <div class="row jr-picks" role="group" aria-label="Choose a request">${c.exchanges.map((x, i) => `<button type="button" class="chip" data-x="${i}" aria-pressed="false">${esc(x.label)}</button>`).join("")}</div>
        <div class="jr-pair" id="jr-pair"><p class="muted">Pick a request to send it.</p></div>`;
      const svg = el.querySelector("svg");
      el.querySelector(".jr-picks").addEventListener("click", guard(async e => {
        const b = e.target.closest("[data-x]"); if (!b) return;
        const x = c.exchanges[Number(b.dataset.x)], r = exchange(x);
        el.querySelectorAll("[data-x]").forEach(k => k.setAttribute("aria-pressed", k === b));
        el.querySelector("#jr-st").textContent = "";
        el.querySelector("#jr-pair").innerHTML = `${code("Request: phone → server", r.request)}<p class="muted">Sending…</p>`;
        await fly(svg, [110, 70], [530, 70]);
        await fly(svg, [530, 70], [110, 70], `s${r.family}`);
        el.querySelector("#jr-st").textContent = `${r.status} ${REASON[r.status]}`;
        el.querySelector("#jr-st").setAttribute("class", `jr-tag s${r.family}`);
        el.querySelector("#jr-pair").innerHTML = `${code("Request: phone → server", r.request)}${code("Response: server → phone", r.response, `s${r.family}`)}<p class="jr-note"><b class="jr-status s${r.family}">${r.status} ${esc(REASON[r.status])}</b> ${esc(x.note)}</p>`;
        tried.add(x.label);
        if (tried.size === c.exchanges.length) met();
      }));
    },
    // 2. TCP and UDP
    tcp(el, c, met) {
      const n = 5, lost = new Set([3]); let proto = "tcp";
      const did = new Set();
      el.innerHTML = `<div class="row jr-picks" role="group" aria-label="Protocol"><button type="button" class="chip" data-p="tcp" aria-pressed="true">TCP</button><button type="button" class="chip" data-p="udp" aria-pressed="false">UDP</button></div>
        <p class="muted jr-small">Tap segments to lose them on the way, then send.</p>
        <div class="row jr-segs" role="group" aria-label="Segments to lose">${Array.from({ length: n }, (_, i) => `<button type="button" class="chip jr-seg" data-s="${i + 1}" aria-pressed="false">Segment ${i + 1}</button>`).join("")}</div>
        <div class="row"><button class="btn brand" type="button" id="jr-send">Send all ${n}</button></div>
        <div id="jr-seq"></div><div id="jr-tcpres" aria-live="polite"></div>
        <h3 class="eyebrow jr-h">The headers: what each one carries</h3>
        <div class="jr-heads">${["udp", "tcp"].map(k => `<div class="jr-head"><div class="jr-head-t"><b>${k.toUpperCase()} header</b><span>${headerBytes(HEADERS[k])} bytes</span></div>
          <div class="jr-bits" aria-hidden="true"><span>0</span><span>16</span><span>31</span></div>
          ${HEADERS[k].map(row => `<div class="jr-row">${row.map(([f, b]) => `<span class="jr-f${/Sequence|Acknowledgment/.test(f) ? " key" : ""}" style="flex:${b}" title="${b} bits">${esc(f)}</span>`).join("")}</div>`).join("")}</div>`).join("")}</div>
        <p class="muted jr-small">${esc(c.headerNote)}</p>`;
      const segBtns = () => el.querySelectorAll(".jr-seg").forEach(b => b.setAttribute("aria-pressed", lost.has(Number(b.dataset.s))));
      segBtns();
      el.querySelector(".jr-segs").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; const s = Number(b.dataset.s); lost.has(s) ? lost.delete(s) : lost.add(s); segBtns(); });
      el.querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => { proto = b.dataset.p; el.querySelectorAll("[data-p]").forEach(k => k.setAttribute("aria-pressed", k === b)); }));
      el.querySelector("#jr-send").addEventListener("click", () => {
        const r = transfer(n, [...lost], proto);
        // A sequence diagram: phone on the left, server on the right, time running down. Drawn at the box's real
        // width so the text stays readable on a phone. Every arrow gets its own row.
        const W = Math.min(Math.max(el.clientWidth, 300), 720), X1 = 46, X2 = W - 46, mid = (X1 + X2) / 2, rows = [];
        let y = 40;
        for (const ev of r.events) {
          if (ev.t === "send") { rows.push({ y, kind: "send", label: ev.retrans ? `Segment ${ev.seg} resent (${ev.retrans === "fast" ? "3 duplicate ACKs" : "timeout"})` : `Segment ${ev.seg}`, re: !!ev.retrans }); y += 34; }
          else if (ev.t === "lost") rows.at(-1).lost = true;
          else if (ev.t === "ack") { rows.push({ y, kind: "ack", label: ev.dup ? `ACK ${ev.n} again: still missing ${ev.n}` : `ACK ${ev.n}`, dup: ev.dup }); y += 34; }
          else if (ev.t === "timeout") { rows.push({ y, kind: "timeout", label: `Timer runs out: no ACK for ${ev.seg}` }); y += 30; }
        }
        const H = y + 6;
        const lines = rows.map(rw => {
          if (rw.kind === "timeout") return `<text class="jr-seq-l to" x="${X1 + 8}" y="${rw.y + 8}">⏱ ${esc(rw.label)}</text>`;
          if (rw.kind === "send") {
            const x2 = rw.lost ? mid : X2, y2 = rw.y + (rw.lost ? 8 : 16);
            return `<line class="jr-seq-a ${rw.lost ? "lost" : rw.re ? "re" : ""}" x1="${X1}" y1="${rw.y}" x2="${x2}" y2="${y2}"/>${rw.lost ? `<text class="jr-seq-x" x="${x2 + 6}" y="${y2 + 4}">✗ lost</text>` : ""}<text class="jr-seq-l" x="${X1 + 8}" y="${rw.y - 5}">${esc(rw.label)}</text>`;
          }
          return `<line class="jr-seq-a ack${rw.dup ? " dup" : ""}" x1="${X2}" y1="${rw.y}" x2="${X1}" y2="${rw.y + 16}"/><text class="jr-seq-l" x="${X2 - 8}" y="${rw.y - 5}" text-anchor="end">${esc(rw.label)}</text>`;
        }).join("");
        el.querySelector("#jr-seq").innerHTML = `<svg class="jr-seqsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${proto.toUpperCase()} sequence: ${rows.map(rw => rw.label + (rw.lost ? ", lost" : "")).join("; ")}`)}">
          <text class="jr-label" x="${X1}" y="14" text-anchor="middle">Phone</text><text class="jr-label" x="${X2}" y="14" text-anchor="middle">Server</text>
          <line class="jr-lane" x1="${X1}" y1="20" x2="${X1}" y2="${H}"/><line class="jr-lane" x1="${X2}" y1="20" x2="${X2}" y2="${H}"/>${lines}</svg>`;
        const boxes = Array.from({ length: n }, (_, i) => `<span class="jr-box${r.app.includes(i + 1) ? " got" : " gap"}">${r.app.includes(i + 1) ? i + 1 : "?"}</span>`).join("");
        el.querySelector("#jr-tcpres").innerHTML = `<div class="jr-buffer"><b>The app receives</b> <span class="jr-boxes">${boxes}</span></div>
          <p class="jr-note">${proto === "tcp" ? (lost.size ? `Every segment arrived, in order, after ${r.resent} resend${r.resent === 1 ? "" : "s"}. The app never saw the gap; it just waited a little.` : "Nothing was lost: one ACK back for each segment.")
            : lost.size ? `Segment${r.missing.length > 1 ? "s" : ""} ${r.missing.join(", ")} never arrived and nobody resent ${r.missing.length > 1 ? "them" : "it"}. For a video call that's a glitch of a few milliseconds, better than freezing to wait.` : "Nothing was lost this time, and no ACKs were sent at all."}</p>`;
        if (lost.size) { did.add(proto); if (did.size === 2) met(); }
      });
    },
    // 3. TLS
    tls(el, c, met) {
      let on = false; const saw = new Set();
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 190" role="img" aria-label="The phone sends a request over café Wi-Fi, across the internet, to the Hopper API. An eavesdropper on the Wi-Fi captures every packet.">
        ${wire(100, 70, 300, 70, "jr-tlswire")}${wire(300, 70, 540, 70, "jr-tlswire")}${wire(300, 90, 300, 130, "jr-tap")}
        ${dev("phone", 70, 70, "Your phone")}${dev("ap", 300, 64, "Café Wi-Fi", "", 0.9)}${dev("server", 570, 70, c.host)}${dev("attacker", 300, 150, "", "", 0.8)}
        <text class="jr-tag" id="jr-lock" x="420" y="56" text-anchor="middle"></text></svg>
        <div class="row jr-picks"><button type="button" class="chip" id="jr-tlson" aria-pressed="false">🔒 Use HTTPS (TLS)</button></div>
        <div id="jr-cap"></div>
        <h3 class="eyebrow jr-h">Is this really ${esc(c.host)}?</h3>
        <p class="muted jr-small">${esc(c.certIntro)}</p>
        <div class="row jr-picks" role="group" aria-label="Certificates to try">${c.certs.map((k, i) => `<button type="button" class="chip" data-cert="${i}" aria-pressed="false">${esc(k.label)}</button>`).join("")}</div>
        <div id="jr-cert" aria-live="polite"></div>`;
      const draw = () => {
        const cap = capture(c.payload, on);
        el.querySelector("#jr-tlson").setAttribute("aria-pressed", on);
        el.querySelector("svg").classList.toggle("tls", on);
        el.querySelector("#jr-lock").textContent = on ? "🔒 encrypted in transit" : "plain text";
        el.querySelector("#jr-cap").innerHTML = cap.plain
          ? `<figure class="jr-code bad"><figcaption>What the eavesdropper captures</figcaption><pre tabindex="0">${esc(cap.text)}</pre></figure><p class="jr-note">Everything, readable: the token that logs in as you, where you are, the card.</p>`
          : `<figure class="jr-code good"><figcaption>What the eavesdropper captures: a TLS 1.3 record (${cap.length} bytes after the header)</figcaption><pre tabindex="0"><b>${cap.header}</b> ${cap.bytes.slice(5).join(" ")}</pre></figure><p class="jr-note"><b>17 03 03</b> says "application data, TLS"; the rest is ciphertext. They can still see <i>which server</i> you talked to and roughly how much, but not what was said.</p>`;
        saw.add(on ? "tls" : "plain");
      };
      el.querySelector("#jr-tlson").addEventListener("click", () => { on = !on; draw(); });
      el.querySelector("[aria-label='Certificates to try']").addEventListener("click", e => {
        const b = e.target.closest("[data-cert]"); if (!b) return;
        const k = c.certs[Number(b.dataset.cert)], r = checkCert(k, c.host, c.today, c.trusted);
        el.querySelectorAll("[data-cert]").forEach(x => x.setAttribute("aria-pressed", x === b));
        el.querySelector("#jr-cert").innerHTML = `<div class="jr-cert ${r.ok ? "good" : "bad"}"><dl class="fields">
          <div><dt>Issued to</dt><dd class="mono">${esc(k.names.join(", "))}</dd></div><div><dt>Issued by</dt><dd>${esc(k.issuer)}</dd></div><div><dt>Valid</dt><dd class="mono">${esc(k.from)} to ${esc(k.until)}</dd></div></dl>
          <p class="jr-verdict">${r.ok ? "✓ The app connects." : `✗ The app refuses to connect. <span class="mono">${esc(r.code)}</span>`}</p><p>${esc(r.why)}</p>${r.ok ? "" : `<p class="muted jr-small">${esc(k.story)}</p>`}</div>`;
        if (!r.ok) saw.add("refused");
        if (saw.has("tls") && saw.has("refused")) met();
      });
      draw();
    },
    // 4. Load balancer
    lb(el, c, met) {
      const ids = c.servers; let st = lbStart(ids), algo = "rr", k = 0; let crashedSeen = false;
      const Y = [40, 110, 180], X = 520;
      el.innerHTML = `<div class="row jr-picks" role="group" aria-label="How to share requests"><button type="button" class="chip" data-a="rr" aria-pressed="true">Round robin</button><button type="button" class="chip" data-a="least" aria-pressed="false">Least connections</button></div>
        <svg class="jr-svg" viewBox="0 0 640 220" role="img" aria-label="Phones send requests to a load balancer, which shares them across three app servers." id="jr-lbsvg">
          ${wire(100, 110, 270, 110)}${Y.map(y => wire(330, 110, X - 30, y)).join("")}
          ${dev("phone", 60, 110, "Riders")}${dev("switch", 300, 110, "Load balancer", "", 0.8)}
          ${ids.map((id, i) => `<g class="jr-srv" data-srv="${esc(id)}">${dev("server", X, Y[i], "", "", 0.8)}<text class="jr-label" x="${X + 26}" y="${Y[i] + 5}">${esc(id)}</text></g>`).join("")}</svg>
        <ul class="jr-srvs">${ids.map((id, i) => `<li id="jr-c-${i}"><b>${esc(id)}</b><span id="jr-o-${i}"></span></li>`).join("")}</ul>
        <div class="row"><button class="btn brand" type="button" id="jr-one">Send a request</button><button class="btn" type="button" id="jr-six">Send 6</button>
          ${ids.map(id => `<button class="btn ghost" type="button" data-crash="${esc(id)}">Crash ${esc(id)}</button>`).join("")}</div>
        <ul class="jr-lblog" id="jr-lblog" aria-live="polite" aria-label="What happened, newest first" tabindex="0"></ul>`;
      const svg = el.querySelector("svg");
      const paint = () => {
        ids.forEach((id, i) => {
          const sv = st.servers[i], g = svg.querySelector(`[data-srv="${CSS.escape(id)}"]`);
          g.classList.toggle("dead", !sv.alive); g.classList.toggle("out", !sv.healthy);
          el.querySelector(`#jr-c-${i}`).className = !sv.alive && sv.healthy ? "warn" : !sv.healthy ? "bad" : "ok";
          el.querySelector(`#jr-o-${i}`).textContent = !sv.alive && sv.healthy ? `crashed, still in the pool (${sv.fails}/${st.fall} checks failed)` : !sv.healthy ? "out of the pool" : `${lbOpen(st, id)} open connection${lbOpen(st, id) === 1 ? "" : "s"}`;
          el.querySelector(`[data-crash="${CSS.escape(id)}"]`).textContent = sv.alive ? `Crash ${id}` : `Restart ${id}`;
        });
      };
      const send = async () => {
        st = lbRequest(st, algo, c.durations[k++ % c.durations.length]);
        const last = st.log.filter(l => "server" in l).at(-1), news = st.log.filter(l => l.t === st.tick && l.health);
        const i = ids.indexOf(last.server);
        for (const r of last.retriedFrom) { const j = ids.indexOf(r); await fly(svg, [330, 110], [X - 30, Y[j]], "bad"); }
        if (i >= 0) await fly(svg, [330, 110], [X - 30, Y[i]]);
        const item = document.createElement("li");
        item.innerHTML = `${news.map(h => `<b class="${h.up ? "ok" : "no"}">Health check: ${esc(h.health)} ${h.up ? "is back in the pool" : "failed 3 times, taken out of the pool"}.</b> `).join("")}Request ${st.tick} → ${last.server ? `<b>${esc(last.server)}</b>` : "<b class='no'>503: no healthy server</b>"}${last.retriedFrom.length ? ` <span class="muted">(${esc(last.retriedFrom.join(", "))} refused the connection, so it was retried)</span>` : ""}`;
        el.querySelector("#jr-lblog").prepend(item);
        paint();
        if (crashedSeen && last.server && st.servers.some(s => !s.alive && !s.healthy)) met();
      };
      el.querySelector("#jr-one").addEventListener("click", guard(send));
      el.querySelector("#jr-six").addEventListener("click", guard(async () => { for (let j = 0; j < 6; j++) await send(); }));
      el.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { algo = b.dataset.a; el.querySelectorAll("[data-a]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
      el.querySelectorAll("[data-crash]").forEach(b => b.addEventListener("click", () => {
        const sv = st.servers.find(s => s.id === b.dataset.crash);
        st = lbSetAlive(st, sv.id, !sv.alive); if (sv.alive) crashedSeen = true;
        const li = document.createElement("li"); li.innerHTML = `<b class="${sv.alive ? "no" : "ok"}">${esc(sv.id)} ${sv.alive ? "crashed" : "restarted"}.</b>`; el.querySelector("#jr-lblog").prepend(li);
        paint();
      }));
      paint();
    },
    // 5. Reverse proxy
    proxy(el, c, met) {
      const tried = new Set(); let miss = false;
      const svcs = [...new Set(c.locations.filter(l => l.to).map(l => l.to))], Y = [40, 110, 180];
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 220" role="img" aria-label="Requests to ${esc(c.host)} reach the reverse proxy, which sends each one to an internal service by its path.">
          ${wire(100, 110, 260, 110, "jr-tlswire")}${svcs.map((s, i) => wire(340, 110, 490, Y[i])).join("")}
          <rect class="jr-zone" x="440" y="6" width="196" height="208" rx="10"/><text class="jr-sub" x="452" y="22">Internal network</text>
          ${dev("phone", 60, 110, "Hopper app")}${dev("router", 300, 110, "Reverse proxy", "", 0.8)}
          ${svcs.map((s, i) => `<g data-svc="${esc(s)}">${dev("server", 520, Y[i], "", "", 0.7)}<text class="jr-label" x="545" y="${Y[i] + 4}">${esc(s)}</text></g>`).join("")}
          <text class="jr-sub" x="180" y="96" text-anchor="middle">HTTPS</text><text class="jr-sub" x="410" y="100" text-anchor="middle">HTTP</text></svg>
        <form class="row jr-path" id="jr-pathf"><label for="jr-pathin" class="mono">https://${esc(c.host)}</label><input id="jr-pathin" class="mono" value="/rides/42" autocomplete="off" spellcheck="false" aria-describedby="jr-pathhelp"><button class="btn brand" type="submit">Send</button></form>
        <p class="muted jr-small" id="jr-pathhelp">Try: ${c.examples.map(p => `<button type="button" class="link-btn mono" data-path="${esc(p)}">${esc(p)}</button>`).join(" · ")}</p>
        <div class="jr-pair">${code("nginx.conf (the routing rules)", c.locations.map(l => `location ${l.prefix} { ${l.to ? `proxy_pass http://${l.to}:8080;` : "return 404;"} }`).join("\n"))}<div id="jr-route" aria-live="polite"></div></div>`;
      const svg = el.querySelector("svg"), pre = el.querySelector(".jr-code pre");
      const go = guard(async path => {
        const loc = routePath(c.locations, path), clean = normalisePath(path);
        const shown = clean && clean !== path.split("?")[0] ? `<b>${esc(path)}</b> (cleaned up to <span class="mono">${esc(clean)}</span>, as nginx does)` : `<b>${esc(path)}</b>`;
        pre.innerHTML = c.locations.map(l => { const t = esc(`location ${l.prefix} { ${l.to ? `proxy_pass http://${l.to}:8080;` : "return 404;"} }`); return l === loc ? `<mark>${t}</mark>` : t; }).join("\n");
        svg.querySelectorAll("[data-svc]").forEach(g => g.classList.toggle("on", !!loc && g.dataset.svc === loc.to));
        await fly(svg, [100, 110], [270, 110]);
        if (loc?.to) await fly(svg, [340, 110], [490, Y[svcs.indexOf(loc.to)]]);
        el.querySelector("#jr-route").innerHTML = !path.startsWith("/") ? `<p class="jr-note">A path starts with /.</p>` : loc?.to
          ? `<p class="jr-note">${shown} matched <span class="mono">location ${esc(loc.prefix)}</span>, the longest prefix that fits, so it goes to <b>${esc(loc.to)}</b>. The proxy ended the HTTPS connection and passed the request on over the internal network, adding <span class="mono">X-Forwarded-For</span> with the phone's address.</p>`
          : `<p class="jr-note">${shown} matched <span class="mono">location ${esc(loc ? loc.prefix : "/")}</span>, which returns 404, so the proxy answered <b>404 Not Found</b> itself. Nothing inside was ever reached.</p>`;
        if (path.startsWith("/")) { if (loc?.to) tried.add(loc.to); else miss = true; }
        if (tried.size >= 3 && miss) met();
      });
      el.querySelector("#jr-pathf").addEventListener("submit", e => { e.preventDefault(); go(el.querySelector("#jr-pathin").value.trim()); });
      el.querySelectorAll("[data-path]").forEach(b => b.addEventListener("click", () => { el.querySelector("#jr-pathin").value = b.dataset.path; go(b.dataset.path); }));
    },
    // 6. Firewall
    fw(el, c, met) {
      let rules = structuredClone(c.rules);
      const name = id => c.hosts[id]?.label || id;
      el.innerHTML = `<svg class="jr-svg" viewBox="0 0 640 200" role="img" aria-label="Riders and an attacker on the internet reach a firewall in front of the Hopper API server and its database.">
          ${wire(100, 50, 270, 100)}${wire(100, 160, 270, 100)}${wire(330, 100, 470, 50)}${wire(330, 100, 470, 160)}${wire(520, 70, 520, 135, "jr-inside")}
          ${dev("phone", 70, 50, name("rider"), "", 0.9)}${dev("attacker", 70, 160, name("attacker"), "", 0.8)}${dev("firewall", 300, 100, "Firewall", "", 0.9)}
          ${dev("server", 520, 40, name("api"), "", 0.7)}${dev("db", 520, 160, name("db"), "", 0.7)}</svg>
        <div class="vl-table" role="region" aria-label="Firewall rules" tabindex="0"><table class="tbl jr-rules"><thead><tr><th scope="col">#</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Port</th><th scope="col">Action</th><th scope="col"><span class="sr-only">Order</span></th></tr></thead><tbody id="jr-rb"></tbody></table></div>
        <p class="muted jr-small">Rules are read top to bottom; the first one that matches decides. Anything no rule matches is denied.</p>
        <div class="vl-table" role="region" aria-label="Test traffic" tabindex="0"><table class="tbl jr-tests"><thead><tr><th scope="col">Test traffic</th><th scope="col">Should be</th><th scope="col">Is</th><th scope="col">Decided by</th></tr></thead><tbody id="jr-tb"></tbody></table></div>
        <div id="jr-fwmsg" aria-live="polite"></div>`;
      const draw = () => {
        el.querySelector("#jr-rb").innerHTML = rules.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.src === "any" ? "anyone" : name(r.src))}</td><td>${esc(name(r.dst))}</td><td class="mono">${esc(r.port === "any" ? "any" : "tcp/" + r.port)}</td>
          <td><button type="button" class="chip jr-act ${r.action}" data-flip="${i}" aria-label="Rule ${i + 1}: ${r.action}. Switch to ${r.action === "allow" ? "deny" : "allow"}">${r.action.toUpperCase()}</button></td>
          <td class="jr-ord"><button type="button" class="link-btn" data-up="${i}" aria-label="Move rule ${i + 1} up" ${i ? "" : "disabled"}>▲</button><button type="button" class="link-btn" data-down="${i}" aria-label="Move rule ${i + 1} down" ${i < rules.length - 1 ? "" : "disabled"}>▼</button></td></tr>`).join("");
        const res = c.tests.map(t => ({ t, r: evaluate(rules, t) }));
        el.querySelector("#jr-tb").innerHTML = res.map(({ t, r }) => `<tr class="${r.action === t.expect ? "right" : "wrong"}"><td>${esc(name(t.src))} → ${esc(name(t.dst))} <span class="mono">tcp/${t.port}</span></td><td>${t.expect}</td>
          <td><b class="${r.action === t.expect ? "ok" : "no"}">${r.action === t.expect ? "✓" : "✗"} ${r.action}</b></td><td>${r.rule < 0 ? "no rule matched (default deny)" : `rule ${r.rule + 1}`}</td></tr>`).join("");
        const ok = fwSolved(rules, c.tests);
        el.querySelector("#jr-fwmsg").innerHTML = ok ? `<p class="jr-note"><b class="ok">Every test passes.</b> ${esc(c.solvedNote)}</p>` : `<p class="jr-note">${res.filter(x => x.r.action !== x.t.expect).length} test${res.filter(x => x.r.action !== x.t.expect).length === 1 ? "" : "s"} wrong. Change an action or move a rule.</p>`;
        if (ok) met();
      };
      el.querySelector("#jr-rb").addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        const swap = (i, j) => { [rules[i], rules[j]] = [rules[j], rules[i]]; };
        // Keep keyboard focus on the same control after the table redraws (following a moved rule).
        let again;
        if (b.dataset.flip) { const i = Number(b.dataset.flip); rules[i].action = rules[i].action === "allow" ? "deny" : "allow"; again = `[data-flip="${i}"]`; }
        else if (b.dataset.up) { const i = Number(b.dataset.up); swap(i, i - 1); again = i - 1 ? `[data-up="${i - 1}"]` : `[data-down="0"]`; }
        else if (b.dataset.down) { const i = Number(b.dataset.down); swap(i, i + 1); again = i + 1 < rules.length - 1 ? `[data-down="${i + 1}"]` : `[data-up="${i + 1}"]`; }
        draw();
        if (again) el.querySelector(`#jr-rb ${again}`)?.focus();
      });
      draw();
    },
    // 7. WebSockets
    ws(el, c, met) {
      const ran = new Set();
      el.innerHTML = `<div class="row jr-picks" role="group" aria-label="How the app hears about the driver"><button type="button" class="chip" data-m="poll" aria-pressed="false">Ask every ${c.interval} seconds (polling)</button><button type="button" class="chip" data-m="ws" aria-pressed="false">Keep a WebSocket open</button></div>
        <div id="jr-live"><p class="muted">Pick one to watch ${c.seconds} seconds of a ride. The driver's position changes ${c.updates.length} times.</p></div>`;
      el.querySelector(".jr-picks").addEventListener("click", e => {
        const b = e.target.closest("[data-m]"); if (!b) return;
        el.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", x === b));
        const r = compareLive(c.seconds, c.interval, c.updates), W = 560, x = t => 40 + (t / c.seconds) * W;
        const marks = c.updates.map(u => `<line class="jr-upd" x1="${x(u)}" y1="20" x2="${x(u)}" y2="110"/>`).join("");
        const body = b.dataset.m === "poll"
          ? r.polls.map(p => `<line class="jr-seq-a ${p.news ? "" : "waste"}" x1="${x(p.t)}" y1="40" x2="${x(p.t)}" y2="92"/><circle class="jr-dotp ${p.news ? "news" : "waste"}" cx="${x(p.t)}" cy="92" r="5"/>`).join("")
          : `<line class="jr-seq-a" x1="${x(0)}" y1="40" x2="${x(0)}" y2="92"/>${c.updates.map(u => `<line class="jr-seq-a ack" x1="${x(u)}" y1="92" x2="${x(u)}" y2="40"/><circle class="jr-dotp news" cx="${x(u)}" cy="40" r="5"/>`).join("")}`;
        el.querySelector("#jr-live").innerHTML = `<svg class="jr-svg" viewBox="0 0 640 140" role="img" aria-label="${esc(b.dataset.m === "poll" ? `Polling: ${r.pollRequests} requests, ${r.wasted} with nothing new` : `WebSocket: 1 upgrade request, then ${r.pushes} pushed updates`)}">
            <text class="jr-label" x="8" y="44">App</text><text class="jr-label" x="8" y="96">API</text>
            <line class="jr-lane" x1="40" y1="40" x2="${40 + W}" y2="40"/><line class="jr-lane" x1="40" y1="92" x2="${40 + W}" y2="92"/>${marks}${body}
            <text class="jr-sub" x="40" y="128">0 s</text><text class="jr-sub" x="${40 + W}" y="128" text-anchor="end">${c.seconds} s</text><text class="jr-sub" x="${x(c.updates[0])}" y="16" text-anchor="middle">driver moves</text></svg>
          ${b.dataset.m === "poll"
            ? `<p class="jr-note"><b>${r.pollRequests} requests</b>, ${r.wasted} of them answered "nothing new". Each update waited up to ${c.interval} seconds to be noticed. Ask more often and you waste more; less often and the map lags.</p>`
            : `<div class="jr-pair">${code("1. One HTTP request asks to upgrade", c.upgrade.request)}${code("2. The server agrees, and the connection stays open", c.upgrade.response, "s1xx")}</div>
               <p class="jr-note"><b>1 request, then ${r.pushes} messages</b>, each pushed the moment the driver moved. Either side can send at any time over the same connection.</p>`}`;
        ran.add(b.dataset.m);
        if (ran.size === 2) met();
      });
    },
  };
  show(false);
}
