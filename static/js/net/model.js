// A small network model shared by the VLAN lab and the network builder: Cisco 2960-style switches, Windows PCs
// and routers (with 802.1Q subinterfaces), joined by links. Pure: no DOM. Everything a diagram needs to show
// how things are connected comes from here: which devices share a broadcast domain (segment), which segments
// each link carries, who can reach whom, and if not, why not (as Windows ping would report it).
//
// Topology (plain JSON, so it can be saved, copied and tested):
//   devices: { id: { kind: "switch", vlans: { 1: "default" }, ports: { "Fa0/1": port, ... } }
//              { kind: "pc", ip, mask, gw }
//              { kind: "router", ports: { "G0/0": { shutdown, subs: [{ tag: null | vlanId, ip, mask, sub, aclIn }] } } } }
//   links: [{ a: [deviceId, port], b: [deviceId, port] }]       (a PC's only port is "NIC")
//   acls: { NAME: [{ seq, action: "permit" | "deny", proto: "ip" | "icmp", src, dst }] }   (optional; src/dst are
//         { ip, wild } or "any"). A router subinterface's aclIn filters packets arriving on it, as "ip access-group
//         NAME in" does: first match wins, and an unmatched packet is dropped (the implicit deny at the end).
// A switch port: { mode: "access" | "trunk" | "dynamic auto" | "dynamic desirable", access, voice, native,
//                  allowed: null (all) | [vlanIds], shutdown }

export const SWITCH_PORTS = [...Array.from({ length: 24 }, (_, i) => `Fa0/${i + 1}`), "Gi0/1", "Gi0/2"];
export const ROUTER_PORTS = ["G0/0", "G0/1", "G0/2"];
export const freshPort = () => ({ mode: "dynamic auto", access: 1, voice: null, native: 1, allowed: null, shutdown: false });
export const makeSwitch = (extra = {}) => ({ kind: "switch", vlans: { 1: "default" }, ports: Object.fromEntries(SWITCH_PORTS.map(p => [p, freshPort()])), ...extra });
export const makePc = (extra = {}) => ({ kind: "pc", ip: "", mask: "255.255.255.0", gw: "", ...extra });
export const makeRouter = (extra = {}) => ({ kind: "router", ports: Object.fromEntries(ROUTER_PORTS.map(p => [p, { shutdown: false, subs: [] }])), ...extra });
export const portsOf = dev => (dev.kind === "pc" ? ["NIC"] : Object.keys(dev.ports));

// ---------- IPv4
export function ipNum(ip) {
  const m = String(ip ?? "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m || m.slice(1).some(o => Number(o) > 255)) return null;
  return m.slice(1).reduce((n, o) => n * 256 + Number(o), 0);
}
const numIp = n => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join(".");
// A subnet mask's prefix length, or null if it isn't a valid contiguous mask.
export function prefixOf(mask) {
  const n = ipNum(mask);
  if (n == null) return null;
  const bits = n.toString(2).padStart(32, "0");
  return /^1*0*$/.test(bits) ? bits.indexOf("0") === -1 ? 32 : bits.indexOf("0") : null;
}
const netOf = (ip, mask) => { const i = ipNum(ip), p = prefixOf(mask); return i == null || p == null ? null : p === 0 ? 0 : Math.floor(i / 2 ** (32 - p)) * 2 ** (32 - p); };
export const network = (ip, mask) => { const n = netOf(ip, mask); return n == null ? "" : `${numIp(n)}/${prefixOf(mask)}`; };
export const sameNet = (a, b, mask) => netOf(a, mask) != null && netOf(a, mask) === netOf(b, mask);
// A usable host address: not the network or broadcast address (/31 and /32 have neither).
export function hostOk(ip, mask) {
  const i = ipNum(ip), p = prefixOf(mask);
  if (i == null || p == null) return false;
  if (p >= 31) return true;
  const net = netOf(ip, mask);
  return i !== net && i !== net + 2 ** (32 - p) - 1;
}

// ---------- layer 2
const peer = (topo, dev, port) => {
  for (const l of topo.links) {
    if (l.a[0] === dev && l.a[1] === port) return l.b;
    if (l.b[0] === dev && l.b[1] === port) return l.a;
  }
  return null;
};
export const linkOf = (topo, dev, port) => topo.links.find(l => (l.a[0] === dev && l.a[1] === port) || (l.b[0] === dev && l.b[1] === port)) || null;
const isUp = (topo, dev, port) => { const d = topo.devices[dev]; return d.kind === "pc" || !d.ports[port]?.shutdown; };
// DTP: a link trunks if either end is "trunk" and the other isn't "access", or one end is "desirable" and the
// other is dynamic. Two "dynamic auto" ends (the default) never trunk. Only switches speak DTP.
export function opMode(topo, sw, port) {
  const p = topo.devices[sw].ports[port], other = peer(topo, sw, port);
  if (p.mode === "trunk") return "trunk";
  if (p.mode === "access" || !other || topo.devices[other[0]].kind !== "switch") return "access";
  const q = topo.devices[other[0]].ports[other[1]];
  if (q.mode === "access") return "access";
  return q.mode === "trunk" || p.mode === "dynamic desirable" || q.mode === "dynamic desirable" ? "trunk" : "access";
}
const allowed = (port, v) => !port.allowed || port.allowed.includes(v);
const hasVlan = (topo, sw, v) => v in topo.devices[sw].vlans;
// The VLAN an untagged frame joins on arriving at a switch port, or null if it's dropped.
function untaggedInto(topo, sw, port) {
  const p = topo.devices[sw].ports[port];
  const v = opMode(topo, sw, port) === "trunk" ? (allowed(p, p.native) ? p.native : null) : p.access;
  return v != null && hasVlan(topo, sw, v) ? v : null;
}
// The VLAN a tagged frame (tag t) joins on arriving at a switch port: only trunks accept tags.
function taggedInto(topo, sw, port, t) {
  const p = topo.devices[sw].ports[port];
  return opMode(topo, sw, port) === "trunk" && allowed(p, t) && hasVlan(topo, sw, t) ? t : null;
}
// What leaves a switch port for VLAN v: { tagged } or null if v doesn't go out of this port.
function egress(topo, sw, port, v) {
  const p = topo.devices[sw].ports[port];
  if (opMode(topo, sw, port) === "trunk") return allowed(p, v) ? { tagged: v !== p.native } : null;
  return v === p.access ? { tagged: false } : null;
}

// Every place a frame can be: a VLAN on a switch ("sw:S1:10"), a PC ("pc:PC1") or a router subinterface
// ("r:R1:G0/0:10", "r:R1:G0/0:-" for untagged). Segments are the connected groups of these.
const key = { sw: (s, v) => `sw:${s}:${v}`, pc: id => `pc:${id}`, r: (id, port, tag) => `r:${id}:${port}:${tag ?? "-"}` };
function edges(topo) {
  const out = [];
  for (const l of topo.links) {
    const [A, B] = [l.a, l.b], da = topo.devices[A[0]], db = topo.devices[B[0]];
    if (!da || !db || !isUp(topo, ...A) || !isUp(topo, ...B)) continue;
    // Endpoints on this side of the link: what they send (untagged or tagged) and their node key.
    const ends = (d, [id, port]) => d.kind === "pc" ? [{ tag: null, k: key.pc(id) }]
      : d.kind === "router" ? d.ports[port].subs.map(s => ({ tag: s.tag ?? null, k: key.r(id, port, s.tag) })) : null;
    if (da.kind === "switch" && db.kind === "switch") {
      for (const v of Object.keys(da.vlans).map(Number)) {
        const e = egress(topo, A[0], A[1], v);
        if (!e) continue;
        const into = e.tagged ? taggedInto(topo, B[0], B[1], v) : untaggedInto(topo, B[0], B[1]);
        if (into != null) out.push([key.sw(A[0], v), key.sw(B[0], into), l]);
      }
      for (const v of Object.keys(db.vlans).map(Number)) {
        const e = egress(topo, B[0], B[1], v);
        if (!e) continue;
        const into = e.tagged ? taggedInto(topo, A[0], A[1], v) : untaggedInto(topo, A[0], A[1]);
        if (into != null) out.push([key.sw(B[0], v), key.sw(A[0], into), l]);
      }
    } else if (da.kind === "switch" || db.kind === "switch") {
      const [S, H, dh] = da.kind === "switch" ? [A, B, db] : [B, A, da];
      for (const end of ends(dh, H)) {
        const into = end.tag == null ? untaggedInto(topo, S[0], S[1]) : taggedInto(topo, S[0], S[1], end.tag);
        if (into != null) out.push([end.k, key.sw(S[0], into), l]);
      }
    } else {
      // Host to host (a PC cabled straight to a router or another PC): untagged ends meet.
      const ea = ends(da, A).filter(e => e.tag == null), eb = ends(db, B).filter(e => e.tag == null);
      for (const x of ea) for (const y of eb) out.push([x.k, y.k, l]);
    }
  }
  return out;
}

// Broadcast domains. Returns segments (each with its VLANs, switches, hosts, router addresses and subnets)
// and a lookup from node key to segment index.
export function segments(topo) {
  const parent = {}, find = k => (parent[k] === k ? k : (parent[k] = find(parent[k]))), add = k => { if (!(k in parent)) parent[k] = k; };
  const unite = (a, b) => { add(a); add(b); parent[find(a)] = find(b); };
  for (const [id, d] of Object.entries(topo.devices)) {
    if (d.kind === "switch") for (const v of Object.keys(d.vlans)) add(key.sw(id, v));
    if (d.kind === "pc") add(key.pc(id));
    if (d.kind === "router") for (const [p, port] of Object.entries(d.ports)) if (!port.shutdown) for (const s of port.subs) add(key.r(id, p, s.tag));
  }
  for (const [a, b] of edges(topo)) unite(a, b);
  const groups = {};
  for (const k of Object.keys(parent)) (groups[find(k)] ||= []).push(k);
  const segs = [], of = {};
  for (const nodes of Object.values(groups)) {
    const hosts = nodes.filter(k => k.startsWith("pc:")).map(k => k.slice(3));
    const routers = nodes.filter(k => k.startsWith("r:")).map(k => { const [, id, port, tag] = k.split(":"); const sub = topo.devices[id].ports[port].subs.find(s => String(s.tag ?? "-") === tag); return { id, port, tag: sub.tag ?? null, ip: sub.ip, mask: sub.mask }; });
    const swv = nodes.filter(k => k.startsWith("sw:")).map(k => { const [, s, v] = k.split(":"); return { sw: s, vlan: Number(v) }; });
    if (!hosts.length && !routers.length && !swv.some(x => portsInVlan(topo, x.sw, x.vlan).length)) continue;  // an unused VLAN
    const vlans = [...new Set(swv.map(x => x.vlan))].sort((x, y) => x - y);
    const subnets = [...new Set([...hosts.map(h => network(topo.devices[h].ip, topo.devices[h].mask)), ...routers.map(r => network(r.ip, r.mask))].filter(Boolean))];
    const seg = { index: segs.length, vlans, switches: [...new Set(swv.map(x => x.sw))], hosts, routers, subnets,
      name: vlans.length ? vlans.map(v => `VLAN ${v}${nameOfVlan(topo, swv, v)}`).join(" + ") : "Direct link" };
    for (const k of nodes) of[k] = seg.index;
    segs.push(seg);
  }
  return { segments: segs, of };
}
const nameOfVlan = (topo, swv, v) => { const n = swv.filter(x => x.vlan === v).map(x => topo.devices[x.sw].vlans[v]).find(n => n && !/^VLAN\d{4}$/.test(n) && n !== "default"); return n ? ` (${n})` : ""; };
// Ports that put traffic into VLAN v on a switch (access or voice members, and trunks carrying it).
export function portsInVlan(topo, sw, v) {
  const d = topo.devices[sw];
  return Object.keys(d.ports).filter(p => !d.ports[p].shutdown && linkOf(topo, sw, p) && (egress(topo, sw, p, v) || d.ports[p].voice === v));
}
// Which segments a link carries, and how (tagged or not): a trunk carries several, an access link one.
export function carried(topo, link, seg = segments(topo)) {
  const out = new Map();
  for (const [a, b, l] of edges(topo)) if (l === link) { const i = seg.of[a]; if (i != null && seg.of[b] === i) out.set(i, true); }
  return [...out.keys()].sort((x, y) => x - y);
}
export const segmentOf = (topo, id, seg = segments(topo)) => seg.of[key.pc(id)] ?? null;
// The VLAN a PC's untagged frames join at its switch port (null if it isn't on a switch or the port is dead).
export function vlanOf(topo, id) {
  const l = linkOf(topo, id, "NIC"), other = l && (l.a[0] === id ? l.b : l.a);
  return other && topo.devices[other[0]].kind === "switch" && isUp(topo, ...other) ? untaggedInto(topo, ...other) : null;
}

// ---------- access lists
// Does an address match an ACL address spec? A wildcard's 1 bits are "don't care".
export function aclMatch(spec, ip) {
  if (spec === "any") return true;
  const a = ipNum(ip), n = ipNum(spec.ip), w = ipNum(spec.wild);
  return a != null && n != null && w != null && ((a & ~w) >>> 0) === ((n & ~w) >>> 0);
}
// Run a packet (src -> dst, a ping) through ACL `name`: { permit, seq } (seq null for the implicit deny).
export function aclCheck(topo, name, src, dst) {
  const list = topo.acls?.[name];
  if (!list) return { permit: true, seq: null, missing: true };  // IOS lets everything through a missing ACL
  const hit = list.find(e => aclMatch(e.src, src) && aclMatch(e.dst, dst));
  return hit ? { permit: hit.action === "permit", seq: hit.seq } : { permit: false, seq: null };
}
// The inbound ACL on the router subinterface a packet arrives on, if any: { name, permit, seq, where }.
function inbound(topo, r, src, dst) {
  if (!r?.aclIn) return null;
  return { name: r.aclIn, where: `${r.id} ${r.port}${r.tag != null ? "." + (r.sub ?? r.tag) : ""}`, ...aclCheck(topo, r.aclIn, src, dst) };
}

// ---------- layer 3: who answers an address, and can a PC reach it?
export function owners(topo, ip) {
  const out = [];
  for (const [id, d] of Object.entries(topo.devices)) {
    if (d.kind === "pc" && d.ip === ip) out.push({ id, key: key.pc(id), ip: d.ip, mask: d.mask });
    if (d.kind === "router") for (const [p, port] of Object.entries(d.ports)) if (!port.shutdown) for (const s of port.subs) if (s.ip === ip) out.push({ id, port: p, key: key.r(id, p, s.tag), ip: s.ip, mask: s.mask, router: true, tag: s.tag ?? null, sub: s.sub, aclIn: s.aclIn });
  }
  return out;
}
const label = (topo, seg, i) => (i == null ? "nothing" : seg.segments[i].name);
// Ping from PC `from` to `ip`. Returns { result, reply, reason, via } where result is what Windows prints:
//   "ok" (Reply from ip), "general" (PING: transmit failed. General failure.), "host" (Reply from <own ip>:
//   Destination host unreachable), "net" (Reply from <router>: Destination net unreachable), "timeout". When a
//   router's ACL is involved, `acl` lists each check ({ name, permit, seq, where }) and `blocked` is the one that
//   dropped the ping.
export function ping(topo, from, ip, seg = segments(topo)) {
  const pc = topo.devices[from];
  if (ipNum(pc.ip) == null || prefixOf(pc.mask) == null) return { result: "general", reason: `${from} has no valid IP address and mask.` };
  const link = linkOf(topo, from, "NIC"), here = seg.of[key.pc(from)];
  if (!link || !isUp(topo, ...(link.a[0] === from ? link.b : link.a))) return { result: "general", reason: `${from}'s network cable isn't connected (or the switch port is shut down).` };
  if (ip === pc.ip) return { result: "ok", reason: `That's ${from}'s own address.` };
  const target = owners(topo, ip);
  if (sameNet(pc.ip, ip, pc.mask)) {
    const t = target.find(o => seg.of[o.key] === here);
    if (!t) return { result: "host", reason: target.length ? `${target[0].id} has ${ip}, but it's in ${label(topo, seg, seg.of[target[0].key])} and ${from} is in ${label(topo, seg, here)}: ${from}'s ARP request never reaches it.` : `Nothing in ${from}'s broadcast domain has ${ip}, so ARP gets no answer.` };
    if (!t.router && !sameNet(t.ip, pc.ip, t.mask)) return { result: "timeout", reason: `${t.id} hears ${from}, but its mask puts ${pc.ip} on another network, so it sends the reply to its gateway instead.` };
    return { result: "ok", reason: `${t.id} is in the same broadcast domain (${label(topo, seg, here)}) and the same subnet.`, via: [t.id] };
  }
  // Off-subnet: the PC sends to its default gateway.
  if (!pc.gw) return { result: "general", reason: `${ip} isn't on ${from}'s network (${network(pc.ip, pc.mask)}) and ${from} has no default gateway.` };
  if (!sameNet(pc.gw, pc.ip, pc.mask)) return { result: "general", reason: `${from}'s gateway ${pc.gw} isn't on its own network (${network(pc.ip, pc.mask)}).` };
  const gw = owners(topo, pc.gw).find(o => o.router && seg.of[o.key] === here);
  if (!gw) return { result: "host", reason: `No router in ${from}'s broadcast domain answers for the gateway ${pc.gw}.` };
  const router = topo.devices[gw.id], acl = [];
  // The ping arrives on the gateway subinterface: its inbound ACL sees it first. (A denied packet just times out
  // here, as on a router with "no ip unreachables"; see the lab's simplification note.)
  const into = inbound(topo, gw, pc.ip, ip);
  if (into) { acl.push(into); if (!into.permit) return { result: "timeout", acl, blocked: into, reason: `${into.where}'s inbound access list ${into.name} ${into.seq == null ? "has no line matching" : `line ${into.seq} denies`} ${pc.ip} to ${ip}, so ${gw.id} drops the ping.`, via: [gw.id] }; }
  // Connected routes only: the router must have an address on the target's network.
  const outSub = Object.entries(router.ports).flatMap(([p, port]) => (port.shutdown ? [] : port.subs.map(s => ({ ...s, port: p, key: key.r(gw.id, p, s.tag) })))).find(s => sameNet(s.ip, ip, s.mask));
  if (!outSub) return { result: "net", reply: pc.gw, reason: `${gw.id} has no interface on ${ip}'s network, so it has no route there.` };
  if (outSub.ip === ip) return { result: "ok", acl, reason: `${ip} is ${gw.id}'s own address.`, via: [gw.id] };
  const t = target.find(o => seg.of[o.key] === seg.of[outSub.key]);
  if (!t) return { result: "timeout", reason: `${gw.id} forwards into ${label(topo, seg, seg.of[outSub.key])}, but nothing there has ${ip}.`, via: [gw.id] };
  if (t.router) return { result: "ok", acl, reason: `${ip} belongs to ${t.id}.`, via: [gw.id] };
  const back = topo.devices[t.id], backGw = back.gw && owners(topo, back.gw).find(o => o.router && seg.of[o.key] === seg.of[t.key]);
  if (!backGw) return { result: "timeout", acl, reason: `${t.id} gets the ping through ${gw.id}, but has no working default gateway to send the reply back.`, via: [gw.id, t.id] };
  // The reply comes back in through the target's gateway subinterface, and meets that ACL too: ACLs are
  // stateless, so a rule written for one direction also catches replies.
  const reply = inbound(topo, backGw, ip, pc.ip);
  if (reply) { acl.push(reply); if (!reply.permit) return { result: "timeout", acl, blocked: reply, reason: `The ping reaches ${t.id}, but its reply (${ip} to ${pc.ip}) arrives on ${reply.where}, whose inbound access list ${reply.name} ${reply.seq == null ? "has no line matching it" : `denies it at line ${reply.seq}`}. ACLs check each packet on its own, so the reply is dropped.`, via: [gw.id, t.id] }; }
  return { result: "ok", acl, reason: `Routed: ${from} → gateway ${gw.id} (${pc.gw}) → ${t.id} on ${network(outSub.ip, outSub.mask)}, and back through ${t.id}'s gateway.`, via: [gw.id, t.id] };
}

// ---------- problems worth pointing out, in plain words
export function issues(topo, seg = segments(topo)) {
  const out = [], ips = {};
  for (const [id, d] of Object.entries(topo.devices)) {
    if (d.kind === "pc") {
      if (d.ip && ipNum(d.ip) == null) out.push({ id, text: `${id}: "${d.ip}" isn't a valid IPv4 address.` });
      else if (d.ip && prefixOf(d.mask) == null) out.push({ id, text: `${id}: "${d.mask}" isn't a valid subnet mask.` });
      else if (d.ip && !hostOk(d.ip, d.mask)) out.push({ id, text: `${id}: ${d.ip} is the network or broadcast address of ${network(d.ip, d.mask)}, not a host address.` });
      if (d.ip) (ips[d.ip] ||= []).push(id);
      if (d.ip && d.gw && ipNum(d.gw) != null && prefixOf(d.mask) != null && !sameNet(d.ip, d.gw, d.mask)) out.push({ id, text: `${id}: its gateway ${d.gw} isn't on its own network (${network(d.ip, d.mask)}).` });
      if (!linkOf(topo, id, "NIC")) out.push({ id, text: `${id} isn't connected to anything.` });
    }
    if (d.kind === "router") for (const [p, port] of Object.entries(d.ports)) for (const s of port.subs) if (s.ip) (ips[s.ip] ||= []).push(`${id} ${p}${s.tag ? "." + s.tag : ""}`);
    if (d.kind === "switch") for (const [p, port] of Object.entries(d.ports)) {
      const l = linkOf(topo, id, p);
      if (!l || port.shutdown) continue;
      const v = opMode(topo, id, p) === "trunk" ? port.native : port.access;
      if (!hasVlan(topo, id, v)) out.push({ id, text: `${id} ${p} is in VLAN ${v}, which doesn't exist on ${id}: the port is inactive.` });
      const other = peer(topo, id, p);
      if (other && topo.devices[other[0]].kind === "switch" && id < other[0]) {
        const q = topo.devices[other[0]].ports[other[1]], ma = opMode(topo, id, p), mb = opMode(topo, ...other);
        if (ma !== mb) out.push({ id, text: `${id} ${p} is a ${ma} port but ${other[0]} ${other[1]} is a ${mb} port: only untagged traffic gets across.` });
        else if (ma === "trunk" && port.native !== q.native) out.push({ id, text: `Native VLAN mismatch on ${id} ${p} (${port.native}) and ${other[0]} ${other[1]} (${q.native}): untagged traffic changes VLAN as it crosses.` });
      }
    }
  }
  for (const [ip, who] of Object.entries(ips)) if (who.length > 1) out.push({ id: who[0].split(" ")[0], text: `${ip} is used by ${who.join(" and ")}: duplicate address.` });
  for (const s of seg.segments) {
    if (s.vlans.length > 1) out.push({ id: s.switches[0], text: `One broadcast domain spans ${s.vlans.map(v => `VLAN ${v}`).join(" and ")}: traffic is leaking between VLANs.` });
    if (s.subnets.length > 1 && s.hosts.length > 1) out.push({ id: s.hosts[0], text: `${s.name} holds more than one subnet (${s.subnets.join(", ")}): those devices share a broadcast domain but can't talk without a router.` });
  }
  return out;
}

// A free port on a device for a new link: the one asked for, or the first free one. Switches use their
// gigabit uplinks for links to other switches and Fast Ethernet ports for everything else.
function freePort(topo, id, other, want) {
  const d = topo.devices[id], free = portsOf(d).filter(p => !linkOf(topo, id, p));
  if (want) return free.includes(want) ? want : null;
  if (d.kind !== "switch") return free[0] ?? null;
  const uplink = topo.devices[other].kind === "switch";
  return free.find(p => p.startsWith(uplink ? "Gi" : "Fa")) ?? free[0] ?? null;
}
// Cable two devices together. Returns { link } or { error }.
export function connect(topo, a, b, pa, pb) {
  if (a === b) return { error: "A device can't connect to itself." };
  const fa = freePort(topo, a, b, pa), fb = freePort(topo, b, a, pb);
  if (!fa) return { error: `${a} has no free port${pa ? ` called ${pa}` : ""}.` };
  if (!fb) return { error: `${b} has no free port${pb ? ` called ${pb}` : ""}.` };
  const link = { a: [a, fa], b: [b, fb] };
  topo.links.push(link);
  return { link };
}
export function disconnect(topo, link) { topo.links = topo.links.filter(l => l !== link); }
export function removeDevice(topo, id) { delete topo.devices[id]; topo.links = topo.links.filter(l => l.a[0] !== id && l.b[0] !== id); }
// The next free name for a new device: PC7, S4, R2...
export function nextId(topo, prefix) { let n = 1; while (topo.devices[`${prefix}${n}`]) n++; return `${prefix}${n}`; }

// The physical route a ping animation follows: devices from a to b over links that carry the segments involved.
export function route(topo, from, to, seg = segments(topo)) {
  const prev = { [from]: null }, queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const l of topo.links) {
      const next = l.a[0] === cur ? l.b[0] : l.b[0] === cur ? l.a[0] : null;
      if (next && !(next in prev) && carried(topo, l, seg).length) { prev[next] = cur; queue.push(next); }
    }
  }
  if (!(to in prev)) return [];
  const path = [];
  for (let c = to; c != null; c = prev[c]) path.unshift(c);
  return path;
}
