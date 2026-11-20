// VLAN labs: simulated Cisco Catalyst 2960 switches (IOS 15 command line), Windows PCs and, for inter-VLAN
// routing, a Cisco 2911 router (IOS 15: subinterfaces, 802.1Q, named extended ACLs).
// createNet() is pure logic (tested in tests/vlan.test.mjs and tests/intervlan.test.mjs); mount() is the on-page lab.
// Commands follow IOS: unique abbreviations ("sh vl br"), "do" from config modes, global commands from
// submodes, and IOS's own error messages. Output formats follow a 2960 (show vlan brief, show interfaces
// trunk) and Windows (ping, ipconfig). Simplifications are listed in the lab's "simplification" text.

import * as M from "../net/model.js";
import * as V from "../net/view.js";
import * as PANEL from "../net/panel.js";
import * as WALK from "./walk.js";
import { dock, hintHtml } from "./guide.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (s, n) => String(s).padEnd(n);
// Replies the switch and the router consoles give in exactly the same words (Cisco IOS 15).
const helpList = opts => ({ out: opts.length ? opts.map(o => `  ${pad(o.word, 17)}${o.help}`).join("\n") : "% Unrecognized command" });
const unknownWord = word => ({ out: `Translating "${word}"...domain server (255.255.255.255)\n% Unknown command or computer name, or unable to find computer address`, error: true });
const notModelled = () => ({ out: "[Simulator: that command isn't modelled here.]", error: true });

// ---------- ports: a 2960-24TT has Fa0/1-24 and Gi0/1-2
export const PORTS = M.SWITCH_PORTS;
const LONG = { Fa: "FastEthernet", Gi: "GigabitEthernet" };
const longName = p => LONG[p.slice(0, 2)] + p.slice(2);
// "fa0/11", "f0/11", "FastEthernet0/11", or type and number as two words. Returns the short name or null.
export function parsePort(type, num = "") {
  const m = String(type).match(/^([a-z]+)\s*(\d+\/\d+)?$/i);
  if (!m) return null;
  const t = m[1].toLowerCase(), n = m[2] || num;
  const kind = "fastethernet".startsWith(t) ? "Fa" : "gigabitethernet".startsWith(t) ? "Gi" : null;
  const p = kind && n && `${kind}${n}`;
  return PORTS.includes(p) ? p : null;
}
// "1-5,7" style lists (VLANs or port numbers) -> sorted unique numbers, or null if malformed.
export function parseList(text, min, max) {
  const out = new Set();
  for (const part of String(text).split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (a < min || b > max || b < a) return null;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}
// [1,2,3,10,20,21] -> "1-3,10,20-21", the way IOS prints VLAN lists.
export function compress(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j > i ? `${list[i]}-${list[j]}` : `${list[i]}`);
    i = j;
  }
  return out.join(",");
}

const RESERVED = { 1002: "fddi-default", 1003: "token-ring-default", 1004: "fddinet-default", 1005: "trnet-default" };

// ---------- command grammar. Each node: help text, whether the command may end here, and what can follow.
// Special children: $vlan (one VLAN id), $vlans (a list), $word, $port (one or two words), $rest (anything).
const N = (help, kids = {}, end = true) => ({ help, kids, end });
// Real show commands this lab doesn't model. They're in the grammar so IOS abbreviations resolve (and stay ambiguous)
// as on a real device, and the learner hears "not modelled here" instead of a caret that suggests they typed it wrong.
const UNMODELLED_SHOW = { arp: "ARP table", cdp: "CDP information", clock: "Display the system clock", flash: "display information about flash: file system",
  logging: "Show the contents of logging buffers", "mac-address-table": "MAC forwarding table", mac: "MAC configuration", users: "Display information about terminal lines",
  version: "System hardware and software status" };
const SWITCH_UNMODELLED = { "spanning-tree": "Spanning tree topology", vtp: "VTP information" };
const unmodelledShow = extra => Object.fromEntries(Object.entries({ ...UNMODELLED_SHOW, ...extra }).map(([k, h]) => [k, N(h, { $rest: N("Arguments") })]));
// Saving the configuration: write [memory] and copy running-config startup-config, in privileged mode.
const SAVE = {
  copy: N("Copy from one file to another", { "running-config": N("Copy from current system configuration", { "startup-config": N("Copy to startup configuration") }, false) }, false),
  write: N("Write running configuration to memory, network, or terminal", { memory: N("Write to NV memory") }),
};
const SHOW = (priv) => N("Show running system information", {
  ...unmodelledShow(SWITCH_UNMODELLED),
  history: N("Display the session command history"),
  interfaces: N("Interface status and configuration", { trunk: N("Show interface trunk information"), status: N("Show interface line status"), switchport: N("Show interface switchport information"), $port: N("Interface name", { switchport: N("Show interface switchport information") }) }),
  ip: N("IP information", { interface: N("IP interface status and configuration", { brief: N("Brief summary of IP status and configuration") }) }, false),
  ...(priv ? { "running-config": N("Current operating configuration", { interface: N("Show interface configuration", { $port: N("Interface name") }, false) }), "startup-config": N("Contents of startup configuration") } : {}),
  vlan: N("VTP VLAN status", { brief: N("VTP all VLAN status in brief") }),
}, false);
const VLAN_ARG = { $vlan: N("VLAN ID of the VLAN") };
const SWITCHPORT = (no) => N("Set switching mode characteristics", {
  access: N("Set access mode characteristics of the interface", { vlan: N("Set VLAN when interface is in access mode", no ? {} : VLAN_ARG, no) }, false),
  ...(no ? {} : { mode: N("Set trunking mode of the interface", { access: N("Set trunking mode to ACCESS unconditionally"), dynamic: N("Set trunking mode to dynamically negotiate access or trunk mode", { auto: N("Set trunking mode dynamic negotiation parameter to AUTO"), desirable: N("Set trunking mode dynamic negotiation parameter to DESIRABLE") }, false), trunk: N("Set trunking mode to TRUNK unconditionally") }, false) }),
  trunk: N("Set trunking characteristics of the interface", {
    allowed: N("Set allowed VLAN characteristics when interface is in trunking mode", { vlan: N("Set allowed VLANs when interface is in trunking mode", no ? {} : { $rest: N("all, none, add, remove, except, or a list of VLANs") }, no) }, false),
    native: N("Set trunking native characteristics when interface is in trunking mode", { vlan: N("Set native VLAN when interface is in trunking mode", no ? {} : VLAN_ARG, no) }, false),
  }, false),
  voice: N("Voice appliance attributes", { vlan: N("Vlan for voice traffic", no ? {} : VLAN_ARG, no) }, false),
}, false);
const MLS = (no) => N("Multi-Layer Switch configuration", { qos: N("qos interface configuration commands", { trust: N("trust state", { cos: N("trust cos") }, no) }, false) }, false);
const COMMON = { do: N("To run exec commands in config mode", { $rest: N("Exec Command") }, false), end: N("Exit from configure mode"), exit: N("Exit from the current mode") };
const GRAMMAR = {
  user: { enable: N("Turn on privileged commands"), exit: N("Exit from the EXEC"), show: SHOW(false) },
  priv: { configure: N("Enter configuration mode", { terminal: N("Configure from the terminal") }, false), disable: N("Turn off privileged commands"), enable: N("Turn on privileged commands"), exit: N("Exit from the EXEC"), show: SHOW(true), ...SAVE },
  config: {
    ...COMMON,
    hostname: N("Set system's network name", { $word: N("This system's network name") }, false),
    interface: N("Select an interface to configure", { range: N("interface range command", { $rest: N("Interfaces, e.g. fa0/1 - 4, fa0/7") }, false), $port: N("Interface name") }, false),
    no: N("Negate a command or set its defaults", { vlan: N("Vlan commands", { $vlans: N("ISL VLAN IDs 1-1005") }, false) }, false),
    vlan: N("Vlan commands", { $vlans: N("ISL VLAN IDs 1-1005") }, false),
  },
  vlan: { ...COMMON, name: N("Ascii name of the VLAN", { $word: N("The ascii name for the VLAN") }, false) },
  if: {
    ...COMMON, description: N("Interface specific description", { $rest: N("Up to 240 characters describing this interface") }, false),
    mls: MLS(false), shutdown: N("Shutdown the selected interface"), switchport: SWITCHPORT(false),
    no: N("Negate a command or set its defaults", { description: N("Interface specific description"), mls: MLS(true), shutdown: N("Shutdown the selected interface"), switchport: SWITCHPORT(true) }, false),
  },
};
GRAMMAR.range = GRAMMAR.if;
const PROMPT = { user: ">", priv: "#", config: "(config)#", vlan: "(config-vlan)#", if: "(config-if)#", range: "(config-if-range)#", subif: "(config-subif)#", nacl: "(config-ext-nacl)#" };

// ---------- the router: a Cisco 2911 (GigabitEthernet0/0-0/2) running IOS 15
// "g0/0", "gi0/0.10", "GigabitEthernet0/0.10": { port: "G0/0", sub: 10 | null }, or null.
export function parseRouterPort(text) {
  const m = String(text).match(/^([a-z]+)\s*(\d+\/\d+)(?:\.(\d+))?$/i);
  if (!m || !"gigabitethernet".startsWith(m[1].toLowerCase())) return null;
  const port = `G${m[2]}`, sub = m[3] == null ? null : Number(m[3]);
  return M.ROUTER_PORTS.includes(port) && (sub == null || (sub >= 1 && sub <= 4294967295)) ? { port, sub } : null;
}
const rName = (port, sub) => `GigabitEthernet${port.slice(1)}${sub != null ? "." + sub : ""}`;
const RSHOW = priv => N("Show running system information", {
  ...unmodelledShow({ interfaces: "Interface status and configuration", protocols: "Active network routing protocols" }),
  "access-lists": N("List access lists"),
  history: N("Display the session command history"),
  ip: N("IP information", { interface: N("IP interface status and configuration", { brief: N("Brief summary of IP status and configuration") }), route: N("IP routing table") }, false),
  ...(priv ? { "running-config": N("Current operating configuration", { interface: N("Show interface configuration", { $rport: N("Interface name") }, false) }), "startup-config": N("Contents of startup configuration") } : {}),
}, false);
const R_IP_IF = (no) => N("Interface Internet Protocol config commands", {
  address: N("Set the IP address of an interface", no ? {} : { $ip: N("IP address", { $ip: N("IP subnet mask") }, false) }, no),
  "access-group": N("Specify access control for packets", { $word: N("Access-list name", { in: N("inbound packets"), out: N("outbound packets") }, false) }, false),
}, false);
const R_IF = {
  ...COMMON, description: N("Interface specific description", { $rest: N("Up to 240 characters describing this interface") }, false),
  encapsulation: N("Set encapsulation type for an interface", { dot1q: N("IEEE 802.1Q Virtual LAN", { $vlan: N("IEEE 802.1Q VLAN ID", { native: N("Make this as native vlan") }) }, false) }, false),
  ip: R_IP_IF(false), shutdown: N("Shutdown the selected interface"),
  no: N("Negate a command or set its defaults", { description: N("Interface specific description"), ip: R_IP_IF(true), shutdown: N("Shutdown the selected interface"), encapsulation: N("Set encapsulation type for an interface") }, false),
};
const RGRAMMAR = {
  user: { enable: N("Turn on privileged commands"), exit: N("Exit from the EXEC"), show: RSHOW(false) },
  priv: { configure: N("Enter configuration mode", { terminal: N("Configure from the terminal") }, false), disable: N("Turn off privileged commands"), enable: N("Turn on privileged commands"), exit: N("Exit from the EXEC"), show: RSHOW(true), ...SAVE },
  config: {
    ...COMMON,
    "access-list": N("Add an access list entry", { $rest: N("IP access list number and entry") }, false),
    hostname: N("Set system's network name", { $word: N("This system's network name") }, false),
    interface: N("Select an interface to configure", { $rport: N("Interface name, e.g. g0/0 or g0/0.10") }, false),
    ip: N("Global IP configuration subcommands", {
      "access-list": N("Named access-list", { extended: N("Extended Access List", { $word: N("Access-list name") }, false), standard: N("Standard Access List", { $word: N("Access-list name") }, false) }, false),
      routing: N("Enable IP routing"),
    }, false),
    no: N("Negate a command or set its defaults", { ip: N("Global IP configuration subcommands", { "access-list": N("Named access-list", { extended: N("Extended Access List", { $word: N("Access-list name") }, false) }, false) }, false) }, false),
  },
  if: R_IF, subif: R_IF,
  nacl: {
    ...COMMON,
    deny: N("Specify packets to reject", { $rest: N("Protocol, source and destination, e.g. ip 10.10.20.0 0.0.0.255 any") }, false),
    permit: N("Specify packets to forward", { $rest: N("Protocol, source and destination, e.g. ip any any") }, false),
    remark: N("Access list entry comment", { $rest: N("Comment up to 100 characters") }, false),
    no: N("Negate a command or set its defaults", { $rest: N("Sequence number or entry to remove") }, false),
  },
};
// An ACL address: "any", "host A.B.C.D" or "A.B.C.D wildcard". Returns { spec, used } or null.
function aclAddr(words, i) {
  const w = (words[i] || "").toLowerCase();
  if (w === "any") return { spec: "any", used: 1 };
  if (w === "host") return M.ipNum(words[i + 1]) != null ? { spec: { ip: words[i + 1], wild: "0.0.0.0" }, used: 2 } : null;
  if (M.ipNum(words[i]) != null && M.ipNum(words[i + 1]) != null) {
    // IOS stores the address with the wildcard's bits cleared: 10.10.20.5 0.0.0.255 is kept as 10.10.20.0.
    const n = (M.ipNum(words[i]) & ~M.ipNum(words[i + 1])) >>> 0;
    return { spec: { ip: [24, 16, 8, 0].map(b => (n >>> b) & 255).join("."), wild: words[i + 1] }, used: 2 };
  }
  return null;
}
const addrText = a => (a === "any" ? "any" : a.wild === "0.0.0.0" ? `host ${a.ip}` : `${a.ip} ${a.wild}`);
export const aclLine = e => `${e.action} ${e.proto} ${addrText(e.src)} ${addrText(e.dst)}`;

// Walk the grammar: IOS accepts any unique prefix of a keyword. Returns the canonical words and arguments,
// or where and why it failed (the index of the word, for IOS's ^ marker).
export function parse(mode, words, G = GRAMMAR) {
  let node = { kids: G[mode], end: false };
  const path = [], args = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], kids = node.kids || {};
    const keys = Object.keys(kids).filter(k => !k.startsWith("$"));
    const hits = keys.filter(k => k.startsWith(w.toLowerCase()));
    const exact = keys.find(k => k === w.toLowerCase());
    if (exact || hits.length === 1) { const k = exact || hits[0]; path.push(k); node = kids[k]; continue; }
    if (hits.length > 1) return { error: "ambiguous", at: i };
    if (kids.$rest) { args.push(words.slice(i).join(" ")); path.push("$rest"); node = kids.$rest; break; }
    if (kids.$port) {
      const one = parsePort(w), two = !one && words[i + 1] && parsePort(w, words[i + 1]);
      if (one || two) { args.push(one || two); path.push("$port"); node = kids.$port; if (two) i++; continue; }
      return { error: "invalid", at: /\d/.test(w) || !words[i + 1] ? i : i + 1 };
    }
    if (kids.$rport) {
      const one = parseRouterPort(w), two = !one && words[i + 1] && parseRouterPort(w + words[i + 1]);
      if (one || two) { args.push(one || two); path.push("$rport"); node = kids.$rport; if (two) i++; continue; }
      return { error: "invalid", at: /\d/.test(w) || !words[i + 1] ? i : i + 1 };
    }
    if (kids.$ip) { if (M.ipNum(w) == null) return { error: "invalid", at: i }; args.push(w); path.push("$ip"); node = kids.$ip; continue; }
    if (kids.$vlans) { const l = parseList(w, 1, 4094); if (!l) return { error: "invalid", at: i }; args.push(l); path.push("$vlans"); node = kids.$vlans; continue; }
    if (kids.$vlan) { const l = /^\d+$/.test(w) && Number(w) >= 1 && Number(w) <= 4094 ? Number(w) : null; if (!l) return { error: "invalid", at: i }; args.push(l); path.push("$vlan"); node = kids.$vlan; continue; }
    if (kids.$word) { args.push(w); path.push("$word"); node = kids.$word; continue; }
    return { error: "invalid", at: i };
  }
  if (!node.end) return { error: "incomplete" };
  return { path: path.join(" "), args };
}
// What can come next (for "?" and Tab): the keywords and argument hints after these words.
export function options(mode, words, G = GRAMMAR) {
  let kids = G[mode];
  for (const w of words) {
    const keys = Object.keys(kids || {});
    const k = keys.find(x => x === w.toLowerCase()) || keys.filter(x => !x.startsWith("$") && x.startsWith(w.toLowerCase())).at(0)
      || (kids.$port && parsePort(w) ? "$port" : null) || (kids.$rport && parseRouterPort(w) ? "$rport" : null) || keys.find(x => x.startsWith("$") && x !== "$port" && x !== "$rport");
    if (!k) return [];
    kids = kids[k].kids;
  }
  return Object.entries(kids || {}).map(([k, v]) => ({ word: k.startsWith("$") ? { $vlan: "<1-4094>", $vlans: "WORD", $word: "WORD", $port: "<interface>", $rport: "<interface>", $ip: "A.B.C.D", $rest: "LINE" }[k] : k, help: v.help }));
}

// The lab's network as a model topology (static/js/net/model.js), which does the data plane: DTP, trunks,
// broadcast domains and ping results.
export function fromLab(lab) {
  const topo = { devices: {}, links: [] };
  for (const id of Object.keys(lab.switches)) topo.devices[id] = M.makeSwitch();
  for (const [id, pc] of Object.entries(lab.pcs)) topo.devices[id] = M.makePc({ ip: pc.ip, mask: pc.mask, gw: pc.gw || "" });
  for (const [s, def] of Object.entries(lab.switches)) for (const [p, [t, q]] of Object.entries(def.links || {})) if (s < t) topo.links.push({ a: [s, p], b: [t, q] });
  for (const [id, pc] of Object.entries(lab.pcs)) topo.links.push({ a: [id, "NIC"], b: [pc.sw, pc.port] });
  // Routers start as they leave the factory: every interface shut down, no addresses.
  for (const id of Object.keys(lab.routers || {})) topo.devices[id] = M.makeRouter({ ports: Object.fromEntries(M.ROUTER_PORTS.map(p => [p, { shutdown: true, subs: [] }])) });
  for (const [r, def] of Object.entries(lab.routers || {})) for (const [p, [t, q]] of Object.entries(def.links || {})) topo.links.push({ a: [r, p], b: [t, q] });
  // A lab can start where another left off (the routing lab starts with the VLAN lab's switches done).
  for (const [s, def] of Object.entries(lab.start?.switches || {})) {
    Object.assign(topo.devices[s].vlans, def.vlans || {});
    for (const [p, x] of Object.entries(def.ports || {})) Object.assign(topo.devices[s].ports[p], x);
  }
  topo.acls = {};
  return topo;
}

// Command lines for every device in a topology: IOS on switches, the Windows prompt on PCs. Commands change the
// topology in place, so a diagram drawn from it stays in step. `ran` and `pings` record what was done.
export function createCli(topo) {
  const cli = {}, ran = [], pings = [];
  const st = id => (cli[id] ||= { mode: "user", ctx: [], history: [], recipe: [] });
  const sw = id => topo.devices[id];
  const kind = id => topo.devices[id]?.kind;
  const prompt = dev => (kind(dev) === "pc" ? "C:\\>" : `${dev}${PROMPT[st(dev).mode]}`);
  const hasVlan = (s, v) => v in sw(s).vlans;
  const opMode = (s, p) => M.opMode(topo, s, p);
  const peerOf = (s, p) => { const l = M.linkOf(topo, s, p); return l ? (l.a[0] === s && l.a[1] === p ? l.b : l.a) : null; };
  const allowed = (port, v) => !port.allowed || port.allowed.includes(v);
  // Real commands outside this lab: say so (with what is modelled) rather than a caret that implies a typing mistake.
  const unmodelled = (line, modelled) => ({ out: `[Simulator: "${line.trim().replace(/^do\s+/i, "")}" is a real IOS command, but this lab doesn't model it. Modelled here: ${modelled}.]`, error: true });
  // Saving: write memory / copy running-config startup-config keep a copy of the running configuration as it is now,
  // which show startup-config prints. NVRAM sizes: 64 KB on a 2960, 255 KB on a 2911.
  const save = (dev, runText, prompted) => { st(dev).saved = runText.split("\n").slice(2).join("\n"); return { out: `${prompted ? "Destination filename [startup-config]? \n" : ""}Building configuration...\n[OK]` }; };
  const startup = (dev, nvram) => {
    const t = st(dev).saved;
    return t ? { out: `Using ${t.length} out of ${nvram} bytes\n${t}` } : { out: "startup-config is not present", error: true };
  };
  // show running-config interface X: that interface's block from the full configuration.
  const runBlock = (runText, name) => {
    const lines = runText.split("\n"), i = lines.indexOf(`interface ${name}`);
    if (i < 0) return { out: "% Invalid input: that interface isn't in the configuration.", error: true };
    const block = [];
    for (let j = i; j < lines.length && lines[j] !== "!"; j++) block.push(lines[j]);
    const text = [...block, "end"].join("\n");
    return { out: `Building configuration...\n\nCurrent configuration : ${text.length} bytes\n!\n${text}` };
  };
  const historyOut = dev => ({ out: st(dev).history.slice(-10).map(h => `  ${h}`).join("\n") });

  // ---------- IOS output
  function showVlanBrief(s) {
    const S = sw(s), rows = ["VLAN Name                             Status    Ports", "---- -------------------------------- --------- -------------------------------"];
    const ids = Object.keys(S.vlans).map(Number).sort((x, y) => x - y);
    for (const id of ids) {
      const ports = PORTS.filter(p => (opMode(s, p) === "access" && S.ports[p].access === id) || S.ports[p].voice === id);
      const chunks = [];
      for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(", "));
      rows.push(`${pad(id, 4)} ${pad(S.vlans[id], 32)} ${pad("active", 9)} ${chunks[0] || ""}`.trimEnd());
      for (const c of chunks.slice(1)) rows.push(" ".repeat(48) + c);
    }
    for (const [id, name] of Object.entries(RESERVED)) rows.push(`${pad(id, 4)} ${pad(name, 32)} act/unsup`);
    return rows.join("\n");
  }
  function showTrunk(s) {
    const S = sw(s), trunks = PORTS.filter(p => !S.ports[p].shutdown && peerOf(s, p) && opMode(s, p) === "trunk");
    if (!trunks.length) return "";
    const active = Object.keys(S.vlans).map(Number).sort((x, y) => x - y);
    const list = p => compress(active.filter(v => allowed(S.ports[p], v)));
    const MODE = { trunk: "on", "dynamic auto": "auto", "dynamic desirable": "desirable" };
    return [
      `${pad("Port", 12)}${pad("Mode", 17)}${pad("Encapsulation", 15)}${pad("Status", 14)}Native vlan`,
      ...trunks.map(p => `${pad(p, 12)}${pad(MODE[S.ports[p].mode], 17)}${pad("802.1q", 15)}${pad("trunking", 14)}${S.ports[p].native}`),
      "", `${pad("Port", 12)}Vlans allowed on trunk`, ...trunks.map(p => `${pad(p, 12)}${S.ports[p].allowed ? compress(S.ports[p].allowed) || "none" : "1-4094"}`),
      "", `${pad("Port", 12)}Vlans allowed and active in management domain`, ...trunks.map(p => `${pad(p, 12)}${list(p) || "none"}`),
      "", `${pad("Port", 12)}Vlans in spanning tree forwarding state and not pruned`, ...trunks.map(p => `${pad(p, 12)}${list(p) || "none"}`),
    ].join("\n");
  }
  const vlanLabel = (s, v) => `${v} (${sw(s).vlans[v] ?? "Inactive"})`;
  function showSwitchport(s, p) {
    const port = sw(s).ports[p], op = opMode(s, p);
    const admin = { access: "static access", trunk: "trunk", "dynamic auto": "dynamic auto", "dynamic desirable": "dynamic desirable" }[port.mode];
    return [
      `Name: ${p}`, "Switchport: Enabled", `Administrative Mode: ${admin}`,
      `Operational Mode: ${port.shutdown ? "down" : op === "trunk" ? "trunk" : "static access"}`,
      "Administrative Trunking Encapsulation: dot1q", `Operational Trunking Encapsulation: ${op === "trunk" ? "dot1q" : "native"}`,
      `Negotiation of Trunking: ${port.mode === "access" ? "Off" : "On"}`,
      `Access Mode VLAN: ${vlanLabel(s, port.access)}`, `Trunking Native Mode VLAN: ${vlanLabel(s, port.native)}`,
      "Administrative Native VLAN tagging: enabled", `Voice VLAN: ${port.voice ? vlanLabel(s, port.voice) : "none"}`,
      `Trunking VLANs Enabled: ${port.allowed ? compress(port.allowed) || "NONE" : "ALL"}`,
      "[Simulator: the rest of this output (private VLANs, pruning, capture and so on) is left out.]",
    ].join("\n");
  }
  function showIpBriefSwitch(s) {
    const S = sw(s), rows = [`${pad("Interface", 23)}${pad("IP-Address", 16)}${pad("OK?", 4)}${pad("Method", 7)}${pad("Status", 22)}Protocol`];
    for (const p of PORTS) {
      const x = S.ports[p], pe = peerOf(s, p), up = !x.shutdown && pe && !sw(pe[0])?.ports?.[pe[1]]?.shutdown;
      rows.push(`${pad(longName(p), 23)}${pad("unassigned", 16)}${pad("YES", 4)}${pad("unset", 7)}${pad(x.shutdown ? "administratively down" : up ? "up" : "down", 22)}${up ? "up" : "down"}`);
    }
    return [...rows, "[Simulator: the management interface (Vlan1) isn't modelled, so it's left out.]"].join("\n");
  }
  const SWITCH_SHOWS = "show vlan brief, show interfaces trunk, show interfaces <port> switchport, show ip interface brief, show running-config, show startup-config, show history";
  function showRun(s) {
    const S = sw(s), out = ["Building configuration...", "", "[Simulator: only the hostname and interfaces are shown. VLANs 1-1005 live in vlan.dat, not here.]", "!", `hostname ${s}`, "!"];
    for (const p of PORTS) {
      const x = S.ports[p];
      out.push(`interface ${longName(p)}`);
      if (x.desc) out.push(` description ${x.desc}`);
      if (x.access !== 1) out.push(` switchport access vlan ${x.access}`);
      if (x.native !== 1) out.push(` switchport trunk native vlan ${x.native}`);
      if (x.allowed) out.push(` switchport trunk allowed vlan ${compress(x.allowed) || "none"}`);
      if (x.mode !== "dynamic auto") out.push(` switchport mode ${x.mode}`);
      if (x.voice) out.push(` switchport voice vlan ${x.voice}`);
      if (x.trust) out.push(" mls qos trust cos");
      if (x.shutdown) out.push(" shutdown");
      out.push("!");
    }
    return [...out, "end"].join("\n");
  }

  // ---------- running commands on a switch
  const caret = (dev, line, words, at) => {
    let i = 0, idx = 0;
    for (let w = 0; w <= at && w < words.length; w++) { idx = line.indexOf(words[w], i); i = idx + words[w].length; }
    return " ".repeat(prompt(dev).length + Math.max(idx, 0)) + "^\n% Invalid input detected at '^' marker.";
  };
  const CONFIG_I = "%SYS-5-CONFIG_I: Configured from console by console";
  // CDP notices when the two ends of a trunk disagree about the native VLAN (a real switch repeats this every minute).
  const mismatches = s => st(s).ctx.filter(p => peerOf(s, p) && kind(peerOf(s, p)[0]) === "switch" && opMode(s, p) === "trunk").flatMap(p => {
    const [t, q] = peerOf(s, p), a = sw(s).ports[p].native, b = sw(t).ports[q].native;
    return a !== b && opMode(t, q) === "trunk" ? [`%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on ${longName(p)} (${a}), with ${t} ${longName(q)} (${b}).`] : [];
  }).join("\n");
  function iosLine(s, line) {
    const C = st(s), words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { out: "" };
    // A common slip is typing ping at a switch prompt (often in config mode). Point to the PC consoles instead of
    // a bare caret error, and say how to leave config mode. The switch still doesn't run ping here.
    if (["ping", "traceroute", "tracert"].includes(words[0].toLowerCase()))
      return { out: `[Simulator: the switch doesn't run ping here. Pick a PC console above (for example PC1) and run "ping <ip>".${["vlan", "if", "range", "config"].includes(C.mode) ? " Type end first to leave configuration mode." : ""}]`, error: true };
    if (words.at(-1).endsWith("?")) {
      const last = words.at(-1).slice(0, -1);  // "sh?" lists words starting "sh"; "show ?" lists what follows show
      const opts = options(C.mode, words.slice(0, -1)).filter(o => !last || o.word.startsWith(last.toLowerCase()));
      return helpList(opts);
    }
    let r = parse(C.mode, words);
    // IOS runs global configuration commands from any configuration submode, and moves to that mode.
    if (r.error && ["vlan", "if", "range"].includes(C.mode)) {
      const g = parse("config", words);
      if (!g.error) { r = g; C.mode = "config"; C.ctx = []; }
    }
    if (r.error === "ambiguous") return { out: `% Ambiguous command:  "${line.trim()}"`, error: true };
    if (r.error === "incomplete") return { out: "% Incomplete command.", error: true };
    if (r.error) {
      if (["user", "priv"].includes(C.mode) && r.at === 0 && words.length === 1)
        return unknownWord(words[0]);
      return { out: caret(s, line, words, r.at), error: true };
    }
    const out = run(s, r.path, r.args, line, words);
    if (!out.error) ran.push(`${s}:${r.path}`);
    return out;
  }
  function run(s, path, args, line, words) {
    const S = sw(s), C = st(s);
    if (/^show (arp|cdp|clock|flash|logging|mac-address-table|mac|users|version|spanning-tree|vtp)( |$)/.test(path) || path === "show interfaces status") return unmodelled(line, SWITCH_SHOWS);
    const each = fn => C.ctx.forEach(p => fn(S.ports[p], p));
    const create = (v, kind) => (hasVlan(s, v) ? "" : ((S.vlans[v] = `VLAN${String(v).padStart(4, "0")}`), `% ${kind} VLAN does not exist. Creating vlan ${v}`));
    // Ports only go in VLANs 2 to 1001 here: 1002-1005 are the reserved Token Ring/FDDI VLANs, and 1006+ need VTP transparent mode.
    const offLimits = v => (v > 1001 ? { out: `[Simulator: VLAN ${v} is ${v <= 1005 ? "a reserved VLAN (1002-1005)" : "an extended VLAN, which needs VTP transparent mode"}, not modelled for ports here. Use a VLAN from 2 to 1001.]`, error: true } : null);
    switch (path) {
      case "enable": C.mode = "priv"; return { out: "" };
      case "disable": C.mode = "user"; return { out: "" };
      case "exit":
        if (C.mode === "user" || C.mode === "priv") { C.mode = "user"; return { out: `\n${s} con0 is now available\n\nPress RETURN to get started.` }; }
        if (C.mode === "config") { C.mode = "priv"; return { out: CONFIG_I }; }
        C.mode = "config"; C.ctx = []; return { out: "" };
      case "end": C.mode = "priv"; C.ctx = []; return { out: CONFIG_I };
      case "configure terminal": C.mode = "config"; return { out: "Enter configuration commands, one per line.  End with CNTL/Z." };
      case "do $rest": {
        const mode = C.mode, ctx = C.ctx, inner = args[0].split(/\s+/);
        const r = parse("priv", inner);
        if (r.error || r.path.startsWith("configure") || ["exit", "disable", "enable"].includes(r.path)) return { out: caret(s, line, words, 1 + (r.at || 0)), error: true };
        const out = run(s, r.path, r.args, line, words);
        C.mode = mode; C.ctx = ctx;
        if (!out.error) ran.push(`${s}:${r.path}`);
        return out;
      }
      case "show vlan brief": return { out: showVlanBrief(s) };
      case "show vlan": return { out: "[Simulator: the full \"show vlan\" table isn't modelled. Use show vlan brief: it shows each VLAN's name, status and ports.]" };
      case "show interfaces trunk": return { out: showTrunk(s) };
      case "show interfaces": case "show interfaces $port": return { out: "[Simulator: interface counters aren't modelled. Try show interfaces trunk, or show interfaces fa0/11 switchport.]" };
      case "show interfaces $port switchport": return { out: showSwitchport(s, args[0]) };
      case "show interfaces switchport": return { out: "[Simulator: every port's switchport details at once isn't modelled. Name one port: show interfaces fa0/11 switchport]" };
      case "show running-config": return { out: showRun(s) };
      case "show running-config interface $port": return runBlock(showRun(s), longName(args[0]));
      case "show startup-config": return startup(s, 65536);
      case "show ip interface brief": return { out: showIpBriefSwitch(s) };
      case "show history": return historyOut(s);
      case "write": case "write memory": return save(s, showRun(s), false);
      case "copy running-config startup-config": return save(s, showRun(s), true);
      case "description $rest": each(p => { p.desc = args[0].slice(0, 240); }); return { out: "" };
      case "no description": each(p => { delete p.desc; }); return { out: "" };
      case "hostname $word": return { out: `[Simulator: switch names are fixed here (${s}).]` };
      case "vlan $vlans": {
        const ext = args[0].filter(v => v > 1005);
        if (ext.length) return { out: `Extended VLAN(s) not allowed in current VTP mode.\n%Failed to commit extended VLAN(s) changes.`, error: true };
        if (args[0].some(v => RESERVED[v])) return { out: `Default VLAN ${args[0].find(v => RESERVED[v])} may not be modified.`, error: true };
        for (const v of args[0]) if (!hasVlan(s, v)) S.vlans[v] = `VLAN${String(v).padStart(4, "0")}`;
        C.mode = "vlan"; C.ctx = args[0]; return { out: "" };
      }
      case "no vlan $vlans": {
        if (args[0].includes(1) || args[0].some(v => RESERVED[v])) return { out: `Default VLAN ${args[0].includes(1) ? 1 : args[0].find(v => RESERVED[v])} may not be deleted.`, error: true };
        for (const v of args[0]) delete S.vlans[v];
        return { out: "" };
      }
      case "name $word":
        if (C.ctx.includes(1)) return { out: "Default VLAN 1 may not have its name changed.", error: true };
        if (args[0].length > 32) return { out: caret(s, line, words, 1), error: true };
        if (C.ctx.length > 1) return { out: "% Applying VLAN changes may take few minutes.  Please wait...\n[Simulator: name each VLAN on its own; a name has to be unique.]", error: true };
        if (Object.entries(S.vlans).some(([id, n]) => n === args[0] && Number(id) !== C.ctx[0])) return { out: `VLAN name ${args[0]} is already in use by another VLAN.`, error: true };
        S.vlans[C.ctx[0]] = args[0]; return { out: "" };
      case "interface $port": C.mode = "if"; C.ctx = [args[0]]; return { out: "" };
      case "interface range $rest": {
        const ports = [];
        for (const part of args[0].split(",")) {
          const m = part.trim().match(/^([a-z]+)\s*(\d+)\/(\d+)\s*(?:-\s*(\d+))?$/i);
          const first = m && parsePort(m[1], `${m[2]}/${m[3]}`), last = m && parsePort(m[1], `${m[2]}/${m[4] ?? m[3]}`);
          if (!first || !last || PORTS.indexOf(last) < PORTS.indexOf(first)) return { out: caret(s, line, words, 2), error: true };
          ports.push(...PORTS.slice(PORTS.indexOf(first), PORTS.indexOf(last) + 1));
        }
        C.mode = "range"; C.ctx = [...new Set(ports)]; return { out: "" };
      }
      case "switchport mode access": each(p => { p.mode = "access"; }); return { out: "" };
      case "switchport mode trunk": each(p => { p.mode = "trunk"; }); return { out: "" };
      case "switchport mode dynamic auto": each(p => { p.mode = "dynamic auto"; }); return { out: "" };
      case "switchport mode dynamic desirable": each(p => { p.mode = "dynamic desirable"; }); return { out: "" };
      case "switchport access vlan $vlan": { if (offLimits(args[0])) return offLimits(args[0]); const msg = create(args[0], "Access"); each(p => { p.access = args[0]; }); return { out: msg }; }
      case "no switchport access vlan": each(p => { p.access = 1; }); return { out: "" };
      case "switchport voice vlan $vlan": { if (offLimits(args[0])) return offLimits(args[0]); const msg = create(args[0], "Voice"); each(p => { p.voice = args[0]; }); return { out: msg }; }
      case "no switchport voice vlan": each(p => { p.voice = null; }); return { out: "" };
      case "switchport trunk native vlan $vlan": each(p => { p.native = args[0]; }); return { out: mismatches(s) };
      case "no switchport trunk native vlan": each(p => { p.native = 1; }); return { out: mismatches(s) };
      case "switchport trunk allowed vlan $rest": {
        const m = args[0].trim().match(/^(all|none|add|remove|except)?\s*(.*)$/i), op = (m[1] || "").toLowerCase();
        if (op === "all" || op === "none") { if (m[2]) return { out: caret(s, line, words, 5), error: true }; each(p => { p.allowed = op === "all" ? null : []; }); return { out: "" }; }
        const list = parseList(m[2].replace(/\s+/g, ""), 1, 4094);
        if (!list) return { out: caret(s, line, words, op ? 5 : 4), error: true };
        const ALL = Array.from({ length: 4094 }, (_, i) => i + 1);
        each(p => {
          const cur = p.allowed ?? ALL;
          p.allowed = op === "add" ? [...new Set([...cur, ...list])].sort((x, y) => x - y) : op === "remove" ? cur.filter(v => !list.includes(v)) : op === "except" ? ALL.filter(v => !list.includes(v)) : list;
          if (p.allowed.length === 4094) p.allowed = null;
        });
        return { out: "" };
      }
      case "no switchport trunk allowed vlan": each(p => { p.allowed = null; }); return { out: "" };
      case "mls qos trust cos": each(p => { p.trust = true; }); return { out: "" };
      case "no mls qos trust": case "no mls qos trust cos": each(p => { p.trust = false; }); return { out: "" };
      case "shutdown": case "no shutdown": {
        const down = path === "shutdown", msgs = [];
        each((p, name) => {
          if (p.shutdown === down) return;
          p.shutdown = down;
          // IOS logs going admin down as LINK-5-CHANGED and a link coming up as LINK-3-UPDOWN; with no cable it stays down.
          const cabled = !!peerOf(s, name);
          msgs.push(down ? `%LINK-5-CHANGED: Interface ${longName(name)}, changed state to administratively down` : cabled ? `%LINK-3-UPDOWN: Interface ${longName(name)}, changed state to up` : `%LINK-3-UPDOWN: Interface ${longName(name)}, changed state to down`);
          if (cabled) msgs.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longName(name)}, changed state to ${down ? "down" : "up"}`);
        });
        return { out: msgs.join("\n") };
      }
    }
    return notModelled();
  }

  // ---------- the router. Interfaces and subinterfaces live in the topology (so the data plane sees them); this
  // keeps what IOS remembers that the model doesn't need: subinterfaces before they have a VLAN, addresses on them.
  const rs = {};  // id -> { ifs: { "G0/0": { ip, mask, aclIn, subs: { 10: { tag, native, ip, mask, aclIn, shutdown } } } } }
  const rt = id => (rs[id] ||= { ifs: Object.fromEntries(M.ROUTER_PORTS.map(p => [p, { subs: {} }])) });
  // Rebuild a router's model ports from what's configured: the physical address (untagged), then each
  // subinterface that has a VLAN (a native one sends untagged frames).
  function sync(r) {
    for (const [p, x] of Object.entries(rt(r).ifs)) {
      topo.devices[r].ports[p].subs = [
        ...(x.ip ? [{ tag: null, ip: x.ip, mask: x.mask, aclIn: x.aclIn, sub: null }] : []),
        ...Object.entries(x.subs).filter(([, y]) => y.tag != null && !y.shutdown).map(([n, y]) => ({ tag: y.native ? null : y.tag, ip: y.ip, mask: y.mask, aclIn: y.aclIn, sub: Number(n) })),
      ];
    }
  }
  const ifUp = (r, p) => !topo.devices[r].ports[p].shutdown;
  const cabled = (r, p) => !!M.linkOf(topo, r, p);
  // Every interface with an address: [{ name, ip, mask }] (for overlap checks and the routing table).
  const addressed = r => Object.entries(rt(r).ifs).flatMap(([p, x]) => [
    ...(x.ip ? [{ name: rName(p, null), ip: x.ip, mask: x.mask, up: ifUp(r, p) && cabled(r, p), p, sub: null }] : []),
    ...Object.entries(x.subs).filter(([, y]) => y.ip).map(([n, y]) => ({ name: rName(p, n), ip: y.ip, mask: y.mask, up: ifUp(r, p) && cabled(r, p) && !y.shutdown && y.tag != null, p, sub: Number(n) })),
  ]);
  function showIpIntBrief(r) {
    const rows = [`${pad("Interface", 27)}${pad("IP-Address", 16)}${pad("OK?", 4)}${pad("Method", 7)}${pad("Status", 22)}Protocol`];
    for (const [p, x] of Object.entries(rt(r).ifs)) {
      const admin = !ifUp(r, p), up = !admin && cabled(r, p);
      rows.push(`${pad(rName(p, null), 27)}${pad(x.ip || "unassigned", 16)}${pad("YES", 4)}${pad(x.ip ? "manual" : "unset", 7)}${pad(admin ? "administratively down" : up ? "up" : "down", 22)}${up ? "up" : "down"}`);
      for (const [n, y] of Object.entries(x.subs).sort((a, b) => a[0] - b[0])) {
        const sAdmin = y.shutdown, sUp = up && !sAdmin;
        rows.push(`${pad(rName(p, n), 27)}${pad(y.ip || "unassigned", 16)}${pad("YES", 4)}${pad(y.ip ? "manual" : "unset", 7)}${pad(sAdmin ? "administratively down" : sUp ? "up" : "down", 22)}${sUp ? "up" : "down"}`);
      }
    }
    return rows.join("\n");
  }
  function showIpRoute(r) {
    const head = ["Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP", "[Simulator: the rest of the codes list is left out.]", "", "Gateway of last resort is not set", ""];
    const up = addressed(r).filter(a => a.up);
    // Grouped under their classful network, as IOS prints them.
    const classful = ip => { const o = Number(ip.split(".")[0]); const bits = o < 128 ? 8 : o < 192 ? 16 : 24; return M.network(ip, ["255.0.0.0", "255.255.0.0", "255.255.255.0"][bits / 8 - 1]); };
    const groups = {};
    for (const a of up) (groups[classful(a.ip)] ||= []).push(a);
    const out = [...head];
    for (const [major, list] of Object.entries(groups)) {
      list.sort((a, b) => M.ipNum(a.ip) - M.ipNum(b.ip));
      const masks = new Set([...list.map(a => a.mask), "255.255.255.255"]);
      out.push(`      ${major} is variably subnetted, ${list.length * 2} subnets, ${masks.size} masks`);
      for (const a of list) {
        out.push(`C        ${M.network(a.ip, a.mask)} is directly connected, ${a.name}`);
        out.push(`L        ${a.ip}/32 is directly connected, ${a.name}`);
      }
    }
    return out.join("\n");
  }
  function showAcls() {
    return Object.entries(topo.acls).map(([name, list]) => [`Extended IP access list ${name}`, ...list.map(e => `    ${e.seq} ${aclLine(e)}${e.matches ? ` (${e.matches} matches)` : ""}`)].join("\n")).join("\n");
  }
  function showRouterRun(r) {
    const out = ["Building configuration...", "", "[Simulator: only the hostname, interfaces and access lists are shown; speed, duplex and the rest are left out.]", "!", `hostname ${r}`, "!"];
    for (const [p, x] of Object.entries(rt(r).ifs)) {
      out.push(`interface ${rName(p, null)}`);
      if (x.desc) out.push(` description ${x.desc}`);
      if (x.ip) out.push(` ip address ${x.ip} ${x.mask}`); else out.push(" no ip address");
      if (x.aclIn) out.push(` ip access-group ${x.aclIn} in`);
      if (!ifUp(r, p)) out.push(" shutdown");
      out.push("!");
      for (const [n, y] of Object.entries(x.subs).sort((a, b) => a[0] - b[0])) {
        out.push(`interface ${rName(p, n)}`);
        if (y.desc) out.push(` description ${y.desc}`);
        if (y.tag != null) out.push(` encapsulation dot1Q ${y.tag}${y.native ? " native" : ""}`);
        if (y.ip) out.push(` ip address ${y.ip} ${y.mask}`);
        if (y.aclIn) out.push(` ip access-group ${y.aclIn} in`);
        if (y.shutdown) out.push(" shutdown");
        out.push("!");
      }
    }
    for (const [name, list] of Object.entries(topo.acls)) {
      out.push(`ip access-list extended ${name}`, ...list.map(e => ` ${e.action === "deny" ? "deny  " : "permit"} ${aclLine(e).replace(/^\S+ /, "")}`), "!");
    }
    return [...out, "end"].join("\n");
  }
  function routerLine(r, line) {
    const C = st(r), words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { out: "" };
    // A real router can ping, but this lab's model sends pings from the PCs. Point there rather than show a caret.
    if (["ping", "traceroute", "tracert"].includes(words[0].toLowerCase()))
      return { out: `[Simulator: in this lab, ping runs from the PCs. Pick a PC console above (for example PC1) and run "ping <ip>".${["if", "subif", "nacl", "config"].includes(C.mode) ? " Type end first to leave configuration mode." : ""}]`, error: true };
    if (words.at(-1).endsWith("?")) {
      const last = words.at(-1).slice(0, -1);
      const opts = options(C.mode, words.slice(0, -1), RGRAMMAR).filter(o => !last || o.word.startsWith(last.toLowerCase()));
      return helpList(opts);
    }
    let r2 = parse(C.mode, words, RGRAMMAR);
    if (r2.error && ["if", "subif", "nacl"].includes(C.mode)) {
      const g = parse("config", words, RGRAMMAR);
      if (!g.error) { r2 = g; C.mode = "config"; C.ctx = []; }
    }
    if (r2.error === "ambiguous") return { out: `% Ambiguous command:  "${line.trim()}"`, error: true };
    if (r2.error === "incomplete") return { out: "% Incomplete command.", error: true };
    if (r2.error) {
      if (["user", "priv"].includes(C.mode) && r2.at === 0 && words.length === 1)
        return unknownWord(words[0]);
      return { out: caret(r, line, words, r2.at), error: true };
    }
    const out = routerRun(r, r2.path, r2.args, line, words);
    if (!out.error) ran.push(`${r}:${r2.path}`);
    return out;
  }
  function routerRun(r, path, args, line, words) {
    const C = st(r), R = rt(r);
    const cur = () => (C.mode === "subif" ? R.ifs[C.ctx.port].subs[C.ctx.sub] : R.ifs[C.ctx.port]);
    const curName = () => rName(C.ctx.port, C.mode === "subif" ? C.ctx.sub : null);
    const done = (o = "") => { sync(r); return { out: o }; };
    if (/^show (arp|cdp|clock|flash|logging|mac-address-table|mac|users|version|interfaces|protocols)( |$)/.test(path))
      return unmodelled(line, "show ip interface brief, show ip route, show access-lists, show running-config, show startup-config, show history");
    switch (path) {
      case "enable": C.mode = "priv"; return { out: "" };
      case "disable": C.mode = "user"; return { out: "" };
      case "exit":
        if (C.mode === "user" || C.mode === "priv") { C.mode = "user"; return { out: `\n${r} con0 is now available\n\nPress RETURN to get started.` }; }
        if (C.mode === "config") { C.mode = "priv"; return { out: CONFIG_I }; }
        C.mode = "config"; C.ctx = []; return { out: "" };
      case "end": C.mode = "priv"; C.ctx = []; return { out: CONFIG_I };
      case "configure terminal": C.mode = "config"; return { out: "Enter configuration commands, one per line.  End with CNTL/Z." };
      case "do $rest": {
        const mode = C.mode, ctx = C.ctx, inner = args[0].split(/\s+/);
        const p2 = parse("priv", inner, RGRAMMAR);
        if (p2.error || p2.path.startsWith("configure") || ["exit", "disable", "enable"].includes(p2.path)) return { out: caret(r, line, words, 1 + (p2.at || 0)), error: true };
        const out = routerRun(r, p2.path, p2.args, line, words);
        C.mode = mode; C.ctx = ctx;
        if (!out.error) ran.push(`${r}:${p2.path}`);
        return out;
      }
      case "show ip interface brief": return { out: showIpIntBrief(r) };
      case "show ip interface": return { out: "[Simulator: the detailed output isn't modelled. Try show ip interface brief.]" };
      case "show ip route": return { out: showIpRoute(r) };
      case "show access-lists": return { out: showAcls() };
      case "show running-config": return { out: showRouterRun(r) };
      case "show running-config interface $rport": return runBlock(showRouterRun(r), rName(args[0].port, args[0].sub));
      case "show startup-config": return startup(r, 262136);
      case "show history": return historyOut(r);
      case "write": case "write memory": return save(r, showRouterRun(r), false);
      case "copy running-config startup-config": return save(r, showRouterRun(r), true);
      case "hostname $word": return { out: `[Simulator: device names are fixed here (${r}).]` };
      case "ip routing": return { out: "" };  // already on: a router routes by default
      case "access-list $rest": return { out: "[Simulator: numbered access lists aren't modelled here. Use a named one: ip access-list extended NAME]", error: true };
      case "ip access-list standard $word": return { out: "[Simulator: standard access lists aren't modelled here. Use an extended one: ip access-list extended NAME]", error: true };
      case "ip access-list extended $word": topo.acls[args[0]] ||= []; C.mode = "nacl"; C.ctx = args[0]; return { out: "" };
      case "no ip access-list extended $word": delete topo.acls[args[0]]; return done();
      case "interface $rport": {
        const { port, sub } = args[0];
        if (sub == null) { C.mode = "if"; C.ctx = { port }; return { out: "" }; }
        R.ifs[port].subs[sub] ||= { tag: null, ip: "", mask: "", shutdown: false };
        C.mode = "subif"; C.ctx = { port, sub }; return done();
      }
      case "description $rest": cur().desc = args[0].slice(0, 240); return { out: "" };
      case "no description": delete cur().desc; return { out: "" };
      case "shutdown": case "no shutdown": {
        const down = path === "shutdown";
        if (C.mode === "subif") {
          const y = cur(); if (y.shutdown === down) return { out: "" };
          y.shutdown = down;
          return done(down ? `%LINK-5-CHANGED: Interface ${curName()}, changed state to administratively down\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${curName()}, changed state to down` : "");
        }
        const port = topo.devices[r].ports[C.ctx.port];
        if (port.shutdown === down) return { out: "" };
        port.shutdown = down;
        const name = curName(), wire = cabled(r, C.ctx.port);
        return done(down ? `%LINK-5-CHANGED: Interface ${name}, changed state to administratively down${wire ? `\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to down` : ""}`
          : wire ? `%LINK-3-UPDOWN: Interface ${name}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to up` : `%LINK-3-UPDOWN: Interface ${name}, changed state to down`);
      }
      case "encapsulation dot1q $vlan": case "encapsulation dot1q $vlan native": {
        if (C.mode !== "subif") return { out: `[Simulator: on this lab's router, 802.1Q tagging goes on a subinterface, e.g. interface ${rName(C.ctx.port, 10).toLowerCase().replace("gigabitethernet", "g")}]`, error: true };
        const clash = Object.entries(R.ifs[C.ctx.port].subs).find(([n, y]) => Number(n) !== C.ctx.sub && y.tag === args[0]);
        if (clash) return { out: `[Simulator: VLAN ${args[0]} is already used by ${rName(C.ctx.port, clash[0])}. Each subinterface needs its own VLAN.]`, error: true };
        Object.assign(cur(), { tag: args[0], native: path.endsWith("native") });
        return done();
      }
      case "no encapsulation": if (C.mode === "subif") Object.assign(cur(), { tag: null, native: false, ip: "", mask: "" }); return done();
      case "ip address $ip $ip": {
        const [ip, mask] = args, pre = M.prefixOf(mask);
        if (C.mode === "subif" && cur().tag == null)
          return { out: "% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.", error: true };
        if (pre == null) return { out: `Bad mask 0x${(M.ipNum(mask) >>> 0).toString(16).toUpperCase().padStart(8, "0")} for address ${ip}`, error: true };
        if (!M.hostOk(ip, mask)) return { out: `Bad mask /${pre} for address ${ip}`, error: true };
        const me = curName(), clash = addressed(r).find(a => a.name !== me && (M.sameNet(a.ip, ip, mask) || M.sameNet(ip, a.ip, a.mask)));
        if (clash) return { out: `% ${M.network(ip, mask).split("/")[0]} overlaps with ${clash.name}`, error: true };
        Object.assign(cur(), { ip, mask });
        return done();
      }
      case "no ip address": Object.assign(cur(), { ip: "", mask: "" }); return done();
      case "ip access-group $word in": cur().aclIn = args[0]; return done();
      case "ip access-group $word out": return { out: "[Simulator: only inbound access lists (in) are modelled here.]", error: true };
      case "no ip access-group $word in": case "no ip access-group $word out": if (cur().aclIn === args[0]) delete cur().aclIn; return done();
      case "deny $rest": case "permit $rest": {
        const action = path.split(" ")[0], w = args[0].split(/\s+/), proto = w[0].toLowerCase();
        if (["tcp", "udp", "gre", "esp", "ahp", "ospf", "eigrp", "pim", "igmp"].includes(proto)) return { out: "[Simulator: only ip and icmp entries are modelled here (ping uses ICMP).]", error: true };
        if (!["ip", "icmp"].includes(proto)) return { out: caret(r, line, words, 1), error: true };
        const src = aclAddr(w, 1), dst = src && aclAddr(w, 1 + src.used);
        if (!src) return { out: caret(r, line, words, 2), error: true };
        if (!dst) return { out: caret(r, line, words, 2 + src.used), error: true };
        if (w.length > 1 + src.used + dst.used) return { out: "[Simulator: options after the addresses (ICMP types, log and so on) aren't modelled here.]", error: true };
        const list = topo.acls[C.ctx], seq = (list.at(-1)?.seq || 0) + 10;
        list.push({ seq, action, proto, src: src.spec, dst: dst.spec });
        return done();
      }
      case "remark $rest": return { out: "" };
      case "no $rest": {
        const list = topo.acls[C.ctx], n = Number(args[0]);
        const i = Number.isInteger(n) ? list.findIndex(e => e.seq === n) : list.findIndex(e => aclLine(e) === args[0].trim().toLowerCase().replace(/\s+/g, " "));
        if (i >= 0) { list.splice(i, 1); return done(); }
        // Not an entry: IOS tries it as a global command (no ip access-list ...), as from any submode.
        const g = parse("config", words, RGRAMMAR);
        if (!g.error) { C.mode = "config"; C.ctx = []; return routerRun(r, g.path, g.args, line, words); }
        return done();
      }
    }
    return notModelled();
  }

  // ---------- Windows PCs: ping results come from the model, printed the way Windows prints them
  function pcLine(id, line) {
    const pc = sw(id), words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { out: "" };
    const cmd = words[0].toLowerCase();
    if (cmd === "ipconfig") {
      ran.push(`${id}:ipconfig`);
      return { out: `\nWindows IP Configuration\n\n\nEthernet adapter Ethernet:\n\n   Connection-specific DNS Suffix  . :\n   IPv4 Address. . . . . . . . . . . : ${pc.ip}\n   Subnet Mask . . . . . . . . . . . : ${pc.mask}\n   Default Gateway . . . . . . . . . : ${pc.gw || ""}\n` };
    }
    if (cmd === "hostname") return { out: id };
    if (["tracert", "arp", "nslookup", "netstat", "getmac", "route", "pathping", "nbtstat", "net", "systeminfo"].includes(cmd))
      return { out: `[Simulator: ${cmd} is a real Windows command, but these PCs only model ipconfig, ping and hostname.]`, error: true };
    if (cmd !== "ping") return { out: `'${words[0]}' is not recognized as an internal or external command,\noperable program or batch file.`, error: true };
    // Windows ping options: -n count, -t (until Ctrl+C), -a, -4, and -l size / -w timeout, which take a value.
    let count = 4, forever = false, ip = null;
    for (let i = 1; i < words.length; i++) {
      const w = words[i].toLowerCase();
      if (w === "-n" || w === "/n") { count = Number(words[++i]); if (!Number.isInteger(count) || count < 1) return { out: `Bad value for option -n, valid range is from 1 to 4294967295.`, error: true }; }
      else if (w === "-t" || w === "/t") forever = true;
      else if (["-l", "-w", "-i", "/l", "/w", "/i"].includes(w)) i++;
      else if (/^[-/]/.test(w)) continue;
      else if (!ip) ip = words[i];
    }
    const shown = Math.min(forever ? 4 : count, 10);
    if (!ip) return { out: "\nUsage: ping [-t] [-a] [-n count] [-l size] target_name\n[Simulator: try ping followed by an IP address, e.g. ping 10.10.10.14]", error: true };
    if (M.ipNum(ip) == null) return { out: `Ping request could not find host ${ip}. Please check the name and try again.`, error: true };
    const r = M.ping(topo, id, ip), to = M.owners(topo, ip)[0]?.id;
    const head = `\nPinging ${ip} with 32 bytes of data:`, four = l => `${l}\n`.repeat(shown);
    const note = forever ? "[Simulator: -t pings until you press Ctrl+C; four are shown.]\n" : count > 10 ? `[Simulator: ${count} pings asked for; the first 10 are shown.]\n` : "";
    const stats = (rx, rtt) => `${note}\nPing statistics for ${ip}:\n    Packets: Sent = ${shown}, Received = ${rx}, Lost = ${shown - rx} (${Math.floor((shown - rx) * 100 / shown)}% loss),${rtt ? "\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 0ms, Average = 0ms" : ""}`;
    const body = {
      ok: () => `${four(`Reply from ${ip}: bytes=32 time<1ms TTL=${to && kind(to) === "router" ? 255 : 128}`)}${stats(shown, true)}`,
      general: () => `${four("PING: transmit failed. General failure.")}${stats(0)}`,
      host: () => `${four(`Reply from ${pc.ip}: Destination host unreachable.`)}${stats(shown)}`,  // Windows counts these as "received"
      net: () => `${four(`Reply from ${r.reply}: Destination net unreachable.`)}${stats(shown)}`,
      timeout: () => `${four("Request timed out.")}${stats(0)}`,
    }[r.result]();
    // Each ACL line the ping met counts four matches (four echoes, or four replies), as show access-lists reports.
    for (const a of r.acl || []) { const e = a.seq != null && topo.acls[a.name]?.find(x => x.seq === a.seq); if (e) e.matches = (e.matches || 0) + shown; }
    const withAcl = Object.values(topo.devices).some(d => d.kind === "router" && Object.values(d.ports).some(p => p.subs.some(x => x.aclIn)));
    pings.push({ from: id, to: to || ip, ok: r.result === "ok", vlan: M.vlanOf(topo, id), result: r.result, reason: r.reason, blocked: !!r.blocked, withAcl });
    return { out: `${head}\n${body}`, ping: r };
  }

  // A line is a reusable configuration step if, in the mode it ran in, it resolves to a command that changes
  // configuration: not show / do / configure / enable / disable / end / exit, whatever IOS abbreviation was typed
  // (so "sh vl br" and "conf t" are dropped, but an abbreviated "shut" in interface mode is kept).
  const recordable = (k, mode, line) => {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length || words.at(-1).endsWith("?")) return false;
    const G = k === "router" ? RGRAMMAR : GRAMMAR;
    let r = parse(mode, words, G);
    if (r.error && ["vlan", "if", "range", "subif"].includes(mode)) r = parse("config", words, G);
    const p = r.path || "";
    return !!p && !/^(show|do |configure|enable|disable|end|exit)/.test(p);
  };
  function exec(dev, line) {
    if (line.trim()) st(dev).history.push(line);
    const k = kind(dev), preMode = st(dev).mode;
    const res = k === "pc" ? pcLine(dev, line) : k === "router" ? routerLine(dev, line) : iosLine(dev, line);
    // Record this device's successful configuration lines for the "Reuse a command" picker (switches/routers only).
    const t = line.trim();
    if (k !== "pc" && t && !res.error && !st(dev).recipe.includes(t) && recordable(k, preMode, t)) st(dev).recipe.push(t);
    return res;
  }
  // Tab: complete the last word if exactly one keyword fits (IOS beeps otherwise).
  function complete(dev, line) {
    if (kind(dev) === "pc") return line;
    const words = line.split(/\s+/), last = words.pop() || "";
    const hits = options(st(dev).mode, words.filter(Boolean), kind(dev) === "router" ? RGRAMMAR : GRAMMAR).map(o => o.word).filter(w => /^[a-z]/.test(w) && w.startsWith(last.toLowerCase()));
    return hits.length === 1 && last ? [...words, hits[0]].join(" ") + " " : line;
  }
  // Saved since the last change: the startup copy matches the running configuration now (PBQs check this).
  const isSaved = dev => !!st(dev).saved && st(dev).saved === (kind(dev) === "router" ? showRouterRun(dev) : showRun(dev)).split("\n").slice(2).join("\n");
  return { prompt, exec, complete, history: dev => st(dev).history, recipe: dev => st(dev).recipe, ran, pings, isSaved, forget: id => { delete cli[id]; } };
}

export function createNet(lab) {
  const topo = fromLab(lab), cli = createCli(topo);
  const sw = id => topo.devices[id], opMode = (s, p) => M.opMode(topo, s, p);
  // ---------- objectives
  function isDone(c) {
    if (c.ran) return cli.ran.includes(`${c.ran.device}:${c.ran.cmd}`);
    if (c.pinged) return cli.pings.some(p => p.from === c.pinged.from && p.to === c.pinged.to && p.ok === c.pinged.ok && (c.pinged.vlan === undefined || p.vlan === c.pinged.vlan)
      && (c.pinged.blocked === undefined || p.blocked === c.pinged.blocked) && (c.pinged.withAcl === undefined || p.withAcl === c.pinged.withAcl));
    if (c.routerUp) return !sw(c.routerUp.device).ports[c.routerUp.port].shutdown;
    if (c.subif) return sw(c.subif.device).ports[c.subif.port].subs.some(x => x.tag === c.subif.tag && x.ip === c.subif.ip && x.mask === c.subif.mask);
    if (c.aclIn) return sw(c.aclIn.device).ports[c.aclIn.port].subs.some(x => x.tag === c.aclIn.tag && x.aclIn === c.aclIn.name);
    if (c.aclRule) return [...(c.aclRule.deny || []).map(x => [x, false]), ...(c.aclRule.permit || []).map(x => [x, true])].every(([[a, b], want]) => !M.aclCheck(topo, c.aclRule.name, a, b).missing && M.aclCheck(topo, c.aclRule.name, a, b).permit === want);
    if (c.vlans) return c.vlans.devices.every(d => Object.entries(c.vlans.names).every(([v, n]) => sw(d).vlans[v] === n));
    if (c.access) return Object.entries(c.access.ports).every(([p, v]) => sw(c.access.device).ports[p].mode === "access" && sw(c.access.device).ports[p].access === v);
    if (c.voice) { const p = sw(c.voice.device).ports[c.voice.port]; return p.voice === c.voice.vlan && p.trust === c.voice.trust; }
    if (c.trunks) return c.trunks.every(([s, p]) => opMode(s, p) === "trunk" && !sw(s).ports[p].shutdown);
    if (c.native) return c.native.ports.every(([s, p]) => sw(s).ports[p].native === c.native.vlan);
    if (c.saved) return cli.isSaved(c.saved);
    if (c.all) return c.all.every(isDone);
    return false;
  }
  return {
    topo, state: { ran: cli.ran, pings: cli.pings }, prompt: cli.prompt, exec: cli.exec, complete: cli.complete, history: cli.history, recipe: cli.recipe,
    isDone, opMode, pcVlan: id => M.vlanOf(topo, id),
    reachable: (a, b) => M.ping(topo, a, sw(b).ip).result === "ok",
  };
}

// The device an objective is done on, read from its check (so the console can offer "Use S1"). Pure; tested.
export function taskDevice(t) {
  const c = t?.check || {}, first = x => (Array.isArray(x) ? x[0] : x);
  return c.ran?.device || c.pinged?.from || c.vlans?.devices?.[0] || c.access?.device || c.voice?.device
    || first(first(c.trunks)) || first(first(c.native?.ports)) || c.subif?.device || c.aclIn?.device || c.routerUp?.device || Object.values(c).find(v => v && typeof v.device === "string")?.device || (typeof c.saved === "string" ? c.saved : null)
    || (c.all ? c.all.map(x => taskDevice({ check: x })).find(Boolean) : null) || null;
}

// ---------- the on-page lab
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const net = createNet(lab);
  const done = new Set(solved), devices = [...Object.keys(lab.switches), ...Object.keys(lab.routers || {}), ...Object.keys(lab.pcs)];
  const outs = Object.fromEntries(devices.map(d => [d, ""]));
  let dev = Object.keys(lab.switches)[0], histI = null, finished = lab.tasks.every(t => done.has(t.id));

  root.innerHTML = `<div class="term-lab vlan-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <p class="eyebrow vn-intro">Try it first: what a VLAN does. Then build it in the console below.</p>
    <section class="vn-scene" id="v-scene" aria-label="Two rooms on one switch">
      <div class="vn-chassis"><span>Switch</span><b>one network, two rooms</b></div>
      <div class="vn-floor" id="vn-floor">
        <div class="vn-room staff"><span class="vn-tag">Staff · VLAN 10</span><span class="vn-host" id="vn-a">PC-A</span><span class="vn-host" id="vn-b">PC-B</span></div>
        <div class="vn-wall" id="vn-wall" aria-hidden="true"></div>
        <div class="vn-room students"><span class="vn-tag">Students · VLAN 20</span><span class="vn-host" id="vn-c">PC-C</span></div>
        <div class="vn-trunk" id="vn-trunk" aria-hidden="true"></div>
        <div class="vn-far" id="vn-far"><span>Next switch</span><b>Staff</b></div>
        <span class="vn-pkt" id="v-pkt">packet <em id="v-stamp" hidden>10</em></span>
      </div>
      <div class="vn-controls">
        <button type="button" class="btn ghost" data-vn="same">Send to the other Staff PC</button>
        <button type="button" class="btn ghost" data-vn="cross">Send into Students</button>
        <button type="button" class="btn ghost" data-vn="trunk">Send across the trunk</button>
      </div>
      <p class="vn-say" id="v-say" aria-live="polite"></p>
      <p class="vn-next" id="vn-next" hidden>That's what a VLAN does. Now build it for real on three switches.
        <button type="button" class="btn brand sm" id="vn-go">Start objective 1 ↓</button></p>
    </section>
    <section class="panel vl-net"><div class="panel-title"><h2>The network</h2><span class="sim-tag">Live: changes as you configure</span></div>
      <div class="vl-diagram" id="v-diagram"></div>
      <div class="vl-front"><div class="vl-front-head"><h3 class="eyebrow">Front panel</h3>
        <div class="row" role="group" aria-label="How to show it"><button type="button" class="chip" data-pview="photo" aria-pressed="true">Photo</button><button type="button" class="chip" data-pview="draw" aria-pressed="false">Drawing</button></div>
        <div class="row" role="group" aria-label="Which switch">${Object.keys(lab.switches).map(sw => `<button type="button" class="chip" data-panel="${sw}" aria-pressed="false">${sw}</button>`).join("")}</div></div>
        <div class="vl-panel-wrap" id="v-panel"></div><p class="muted vl-port-info" id="v-port-info" aria-live="polite">Each port's light shows the colour of its network. Tap a port to see what's plugged in.</p></div>
      ${(gw => `<div class="vl-table" role="region" aria-label="Addressing table" tabindex="0"><table class="tbl"><caption class="sr-only">Addressing table</caption><thead><tr><th scope="col">PC</th><th scope="col">IP address</th><th scope="col">Mask</th>${gw ? '<th scope="col">Gateway</th>' : ""}<th scope="col">Connected to</th><th scope="col">Planned VLAN</th></tr></thead>
        <tbody>${Object.entries(lab.pcs).map(([id, pc]) => `<tr><th scope="row">${id}</th><td class="mono">${pc.ip}</td><td class="mono">${pc.mask}</td>${gw ? `<td class="mono">${esc(pc.gw || "")}</td>` : ""}<td>${pc.sw} ${pc.port}${pc.phone ? " (through an IP phone)" : ""}</td><td>${pc.vlan} (${esc(lab.vlans[pc.vlan])})</td></tr>`).join("")}</tbody></table></div>`)(Object.values(lab.pcs).some(pc => pc.gw))}
      <details class="tbl simplification"><summary>How this simulation differs from real switches</summary><p>${esc(lab.simplification)}</p></details></section>
    <div class="term-grid">
      <section class="term-shell" aria-label="Simulated consoles">
        <div class="vl-now" id="v-now" aria-live="polite"></div>
        <div class="term-bar vl-tabs" role="group" aria-label="Choose a device">${devices.map(d => `<button type="button" class="chip" data-dev="${d}" aria-pressed="${d === dev}">${d}</button>`).join("")}</div>
        <div class="term-out" id="v-out" aria-live="polite" tabindex="0" aria-label="Console output"></div>
        <form class="term-in" id="v-form"><label class="sr" for="v-in">Command for the selected device</label><span class="term-ps" id="v-ps"></span><input id="v-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
        <div class="vl-reuse" id="v-reuse-wrap" hidden><label class="eyebrow" for="v-reuse" id="v-reuse-lbl"></label>
          <select id="v-reuse"></select><span class="muted vl-reuse-note">Fills the box; you still press Enter.</span></div>
      </section>
      <aside class="panel term-tasks"><div class="panel-title"><h2>Objectives</h2><span class="mono" id="v-count"></span></div><ol id="v-tasks"></ol>
        <div id="v-hintslot"></div>
        <div class="row"><button class="btn ghost" id="v-reset">↺ Reset lab</button></div></aside>
    </div>
    ${lab.next ? `<section class="panel" id="v-next" hidden><h2>Take it further</h2><ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>` : ""}
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const out = $("v-out"), input = $("v-in");
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let vnBusy = false;
  function vnMove(target, animate, dock = false) {
    const floor = $("vn-floor"), pkt = $("v-pkt");
    const fr = floor.getBoundingClientRect(), tr = target.getBoundingClientRect();
    if (!tr.width || !tr.height) return false;  // not drawn at this size: never fly the packet to the corner
    pkt.style.transition = animate && !reduced ? "transform .7s cubic-bezier(.2,.7,.2,1)" : "none";
    // dock: stop at the target's left edge (arriving at the next switch) instead of covering its label (deep check, 19 Nov)
    // measured with the VLAN tag showing, since it appears on arrival and widens the packet
    const tag = $("v-stamp"), hid = tag.hidden; if (dock) tag.hidden = false; const pw = pkt.offsetWidth; tag.hidden = hid;
    const x = dock ? Math.max(0, tr.left - fr.left - pw - 8) : tr.left - fr.left + tr.width / 2 - pw / 2;
    pkt.style.transform = `translate(${x}px, ${tr.top - fr.top + tr.height / 2 - pkt.offsetHeight / 2}px)`;
    return true;
  }
  function vnGo(kind) {
    if (vnBusy) return;
    vnBusy = true;
    const stamp = $("v-stamp"), wall = $("vn-wall"), say = $("v-say");
    stamp.hidden = true; wall.classList.remove("hit");
    vnMove($("vn-a"), false);
    // On a phone the trunk runs under the rooms: the packet rides the trunk instead of covering the next switch's label.
    const target = kind === "same" ? $("vn-b") : kind === "cross" ? wall : matchMedia("(max-width: 720px)").matches ? $("vn-trunk") : $("vn-far");
    requestAnimationFrame(() => vnMove(target, true, target.id === "vn-far"));
    setTimeout(() => {
      if (kind === "same") say.textContent = "Same room. The packet arrives.";
      if (kind === "cross") { wall.classList.add("hit"); say.textContent = "Stopped. Staff and Students cannot see each other."; }
      if (kind === "trunk") { stamp.hidden = false; say.textContent = "The trunk stamps it VLAN 10, so the next switch still knows it is Staff."; }
      vnBusy = false; $("vn-next").hidden = false;
    }, reduced ? 0 : 740);
  }
  root.querySelectorAll("[data-vn]").forEach(b => b.addEventListener("click", () => vnGo(b.dataset.vn)));
  requestAnimationFrame(() => vnMove($("vn-a"), false));

  // The live diagram (restored 19 Nov; dropped on 10 Nov when the two-rooms demo arrived): each broadcast domain in its
  // own colour, trunks as bundles of the colours they carry. It redraws after every command, so you watch the network
  // split into VLANs as you configure it. Tap a colour in the legend to light just that domain.
  let focus = null, panelSw = Object.keys(lab.switches)[0], panelView = "photo";
  // The switch you're typing on is the one shown, so its lights change as you press Enter.
  function drawPanel() {
    const box = $("v-panel"); if (!box) return;
    box.innerHTML = panelView === "photo" ? PANEL.photoSvg(net.topo, panelSw) : PANEL.svg(net.topo, panelSw);
    root.querySelectorAll("[data-pview]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pview === panelView)));
    root.querySelectorAll("[data-panel]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.panel === panelSw)));
  }
  function drawDiagram() {
    drawPanel();
    const box = $("v-diagram"); if (!box) return;
    const seg = M.segments(net.topo);
    if (focus != null && !seg.segments[focus]) focus = null;
    // 16 px of headroom: S1 and R1 sit near the top and their names are drawn above them (svg_check, 19 Nov).
    box.innerHTML = V.svg(net.topo, { layout: lab.layout, viewBox: "0 -16 600 336", seg, focus })
      + `<h3 class="eyebrow">Who can talk to whom</h3>${V.legend(net.topo, seg, focus)}`;
    box.querySelectorAll("[data-seg]").forEach(b => b.addEventListener("click", () => { focus = focus === Number(b.dataset.seg) ? null : Number(b.dataset.seg); drawDiagram(); box.querySelector(`[data-seg="${b.dataset.seg}"]`)?.focus(); }));
  }
  const print = html => { outs[dev] += html; out.insertAdjacentHTML("beforeend", html); out.scrollTop = out.scrollHeight; };
  function renderTasks() {
    lab.tasks.forEach(t => { if (!done.has(t.id) && net.isDone(t.check)) { done.add(t.id); onPart(t.id); lastDone = t; } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("v-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}${done.has(t.id) && t.why ? `<span class="vl-why">${esc(t.why)}</span>` : ""}</li>`).join("");
    $("v-count").textContent = `${done.size}/${lab.tasks.length}`;
    drawNow(next);
    if (!next) { if ($("v-next")) $("v-next").hidden = false; if (!finished) { finished = true; onComplete(); } }
  }
  // The objective you're on sits at the top of the console (on a phone the list is far below), with "Use S1" when it's
  // done on another device and its hint one tap away; a finished one shows why it worked before the next appears.
  let lastDone = null;
  // Hints on demand in three steps, as in the Linux and network tools labs (guide.js hintHtml; the owner's call, 19 Nov):
  // the objective's nudge, then the command's shape with the values blanked, then the full command with Run it (it types
  // the command into the right console and runs it). The hint stays open while the console is moved towards a step
  // (enable, conf t, the interface) and closes once the step itself has run; the nudge shows once per objective. Two
  // errors in a row open it by themselves. Typing a step yourself moves the walk on too.
  let level = 0, seen = false;
  let walkTask = null, walkK = 0, sugg = null, errStreak = 0; const inside = {};
  function suggestion(next) {
    if (!next || !next.walk) return null;
    if (walkTask !== next.id) { walkTask = next.id; walkK = 0; level = 0; seen = false; }
    const st = WALK.steps(next); if (walkK >= st.length) return null;
    return WALK.nextCommand(st[walkK], net.prompt(st[walkK].dev), inside[st[walkK].dev] || null);
  }
  function drawNow(next) {
    const box = $("v-now"); if (!box) return;
    if (!next) { sugg = null; box.innerHTML = `<b class="ok">All ${lab.tasks.length} objectives done.</b>`; return; }
    const n = lab.tasks.indexOf(next) + 1, d = taskDevice(next);
    const s = suggestion(next), rescue = !level && errStreak >= 2 && !!s;  // two errors in a row: show the way on
    const lv = level || (rescue ? Math.max(2, opening(next, s)) : 0);
    if (lv === 1) seen = true;
    sugg = lv ? s : null;
    box.dataset.level = lv;
    box.innerHTML = `${lastDone ? `<p class="vl-done">✓ ${esc(lastDone.why || "Done.")}</p>` : ""}
      <div class="vl-objrow"><p class="vl-obj"><span class="eyebrow">Objective ${n} of ${lab.tasks.length}</span> ${esc(next.text)}</p></div>
      ${sugg ? hintHtml({ level: lv, nudge: next.nudge, step: sugg, rescue, on: sugg.dev !== dev ? ` · on ${esc(sugg.dev)}` : "" })
      : `<div class="row">${d && d !== dev && devices.includes(d) ? `<button type="button" class="chip" data-use="${esc(d)}">Use ${esc(d)}</button>` : ""}${s ? `<button type="button" class="link-btn" data-nowhint aria-expanded="false">Show a hint</button>` : ""}</div>`}`;
  }
  const opening = (t, s) => WALK.openLevel({ nudge: t.nudge, shaped: !!WALK.shape(s.cmd), seen });
  function runSugg() {  // types the hinted command into the right console and runs it
    if (!sugg) return;
    const c = sugg; if (c.dev !== dev) choose(c.dev, false);
    input.value = c.cmd; input.focus({ preventScroll: true });
    $("v-form").requestSubmit();
  }
  const ps = () => { $("v-ps").textContent = net.prompt(dev); };
  // "Reuse a command": once a switch (or router) has been configured, offer its proven config lines on another
  // device of the same kind, so a repeated sequence (e.g. the same VLANs on S2 and S3) needn't be retyped.
  // It only fills the box with lines this device hasn't run yet; the learner reviews and presses Enter.
  function updateReuse() {
    const wrap = $("v-reuse-wrap"), sel = $("v-reuse");
    if (!wrap) return;
    const k = net.topo.devices[dev]?.kind;
    if (k === "pc") { wrap.hidden = true; return; }
    const siblings = devices.filter(d => d !== dev && net.topo.devices[d]?.kind === k && net.recipe(d).length);
    const source = siblings.sort((a, b) => net.recipe(b).length - net.recipe(a).length)[0];
    const mine = source ? new Set(net.recipe(dev)) : null;
    const lines = source ? net.recipe(source).filter(l => !mine.has(l)) : [];
    if (!lines.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $("v-reuse-lbl").textContent = `Reuse a command from ${source}`;
    sel.innerHTML = `<option value="">Pick a command to fill…</option>` + lines.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
    sel.value = "";
  }
  function choose(d, focus = true) {
    dev = d; histI = null;
    if (lab.switches[d] && d !== panelSw) { panelSw = d; drawPanel(); }
    root.querySelectorAll("[data-dev]").forEach(b => b.setAttribute("aria-pressed", b.dataset.dev === d));
    out.innerHTML = outs[d] || `<div class="muted">${lab.pcs[d] ? `${esc(d)}: Windows command prompt. Try ipconfig or ping.` : lab.routers?.[d] ? `${esc(d)}: Cisco 2911 router console. Type ? for help; abbreviations like "sh ip int br" work.` : `${esc(d)}: Cisco Catalyst 2960 console. Type ? for help; abbreviations like "sh vl br" work.`}</div>`;
    if (!outs[d]) outs[d] = out.innerHTML;
    ps(); updateReuse(); drawNow(lab.tasks.find(t => !done.has(t.id))); if (focus) input.focus();
  }

  $("v-form").addEventListener("submit", e => {
    e.preventDefault();
    const line = input.value;
    print(`<div><span class="term-ps">${esc(net.prompt(dev))}</span>${esc(line)}</div>`);
    const pre = suggestion(lab.tasks.find(t => !done.has(t.id))), before = net.prompt(dev), res = net.exec(dev, line);  // pre: the walk's next step, followed even with Guided off
    if (res.out) print(`<div class="${res.error ? "t-err" : ""}">${esc(res.out)}</div>`);
    // Failsafes: the real device only says "Invalid input"; say what went wrong, in plain words, under it.
    const tip = res.error ? WALK.explainError(line, before) : WALK.caseSlip(line, lab.tasks.find(t => !done.has(t.id)) || {});
    if (tip) print(`<div class="t-tip">[Tip: ${esc(tip)}]</div>`);
    errStreak = res.error ? errStreak + 1 : 0;
    { const m = WALK.modeOf(net.prompt(dev)), was = pre;  // keep guided mode in step with what actually ran
      if (!res.error) inside[dev] = m === "sub" ? (WALK.opensSub(line) ? line : inside[dev]) : null;  // a rejected command moves nothing
      if (was && !res.error && was.dev === dev && WALK.same(line, was.cmd) && was.own) { walkK++; level = 0; errStreak = 0; } }
    input.value = ""; histI = null; ps(); drawDiagram(); renderTasks(); updateReuse();
  });
  // Choosing a proven command fills the input (never runs it): the learner reviews it and presses Enter.
  $("v-reuse").addEventListener("change", e => { const v = e.target.value; if (v) { input.value = v; input.focus(); input.setSelectionRange(v.length, v.length); } e.target.value = ""; });
  input.addEventListener("keydown", e => {
    const h = net.history(dev);
    if (e.key === "ArrowUp" && h.length) { e.preventDefault(); histI = histI == null ? h.length - 1 : Math.max(0, histI - 1); input.value = h[histI]; }
    else if (e.key === "ArrowDown" && histI != null) { e.preventDefault(); histI = Math.min(h.length, histI + 1); input.value = h[histI] || ""; if (histI >= h.length) histI = null; }
    else if (e.key === "Tab" && input.value) { e.preventDefault(); input.value = net.complete(dev, input.value); }
  });
  root.querySelectorAll("[data-dev]").forEach(b => b.addEventListener("click", () => choose(b.dataset.dev)));
  out.addEventListener("click", () => input.focus());
  // "Show a hint" opens the same hint in the strip above the console, with Run it.
  const focusHint = () => $("v-now").querySelector("[data-runit], [data-more]")?.focus({ preventScroll: true });
  const openHint = () => { const t = lab.tasks.find(x => !done.has(x.id)), s = suggestion(t); if (!s) return; level = opening(t, s); drawNow(t); focusHint(); };
  dock($("v-now"), $("v-hintslot"), root.querySelector(".term-shell"));  // one hint area: the panel, or above the console on a phone
  $("v-reset").addEventListener("click", onReset);
  root.querySelectorAll("[data-pview]").forEach(b => b.addEventListener("click", () => { panelView = b.dataset.pview; drawPanel(); }));
  root.querySelectorAll("[data-panel]").forEach(b => b.addEventListener("click", () => { panelSw = b.dataset.panel; drawPanel(); $("v-port-info").textContent = "Tap a port to see what's plugged in."; }));
  const portInfo = e => { const g = e.target.closest?.(".sp-port"); if (!g) return; const st = PANEL.portStates(net.topo, panelSw).find(p => p.name === g.dataset.port); if (st) $("v-port-info").textContent = `${panelSw} ${PANEL.label(st)}`; };
  $("v-panel").addEventListener("click", portInfo); $("v-panel").addEventListener("focusin", portInfo);
  $("v-now").addEventListener("click", e => {
    if (e.target.closest("[data-runit]")) return runSugg();
    const u = e.target.closest("[data-use]"); if (u) return choose(u.dataset.use);
    if (e.target.closest("[data-nowhint]")) return openHint();
    if (e.target.closest("[data-more]")) { const t = lab.tasks.find(x => !done.has(x.id)), s = suggestion(t); if (s) { level = WALK.more(+$("v-now").dataset.level || 1, { shaped: !!WALK.shape(s.cmd) }); drawNow(t); focusHint(); } return; }
    if (e.target.closest("[data-hidehint]")) { level = 0; errStreak = 0; drawNow(lab.tasks.find(t => !done.has(t.id))); input.focus({ preventScroll: true }); }
  });
  $("vn-go").addEventListener("click", () => { const sh = root.querySelector(".term-shell"); sh.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); input.focus({ preventScroll: true }); });

  drawDiagram(); renderTasks(); choose(dev, false);
  return { net };
}
