// VLAN lab: three simulated Cisco Catalyst 2960 switches (IOS 15 command line) and six Windows PCs.
// createNet() is pure logic (tested in tests/vlan.test.mjs); mount() is the on-page lab.
// Commands follow IOS: unique abbreviations ("sh vl br"), "do" from config modes, global commands from
// submodes, and IOS's own error messages. Output formats follow a 2960 (show vlan brief, show interfaces
// trunk) and Windows (ping, ipconfig). Simplifications are listed in the lab's "simplification" text.

import * as M from "../net/model.js";
import * as V from "../net/view.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (s, n) => String(s).padEnd(n);

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
const SHOW = (priv) => N("Show running system information", {
  interfaces: N("Interface status and configuration", { trunk: N("Show interface trunk information"), $port: N("Interface name", { switchport: N("Show interface switchport information") }) }),
  ...(priv ? { "running-config": N("Current operating configuration") } : {}),
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
  priv: { configure: N("Enter configuration mode", { terminal: N("Configure from the terminal") }, false), disable: N("Turn off privileged commands"), enable: N("Turn on privileged commands"), exit: N("Exit from the EXEC"), show: SHOW(true) },
  config: {
    ...COMMON,
    hostname: N("Set system's network name", { $word: N("This system's network name") }, false),
    interface: N("Select an interface to configure", { range: N("interface range command", { $rest: N("Interfaces, e.g. fa0/1 - 4, fa0/7") }, false), $port: N("Interface name") }, false),
    no: N("Negate a command or set its defaults", { vlan: N("Vlan commands", { $vlans: N("ISL VLAN IDs 1-1005") }, false) }, false),
    vlan: N("Vlan commands", { $vlans: N("ISL VLAN IDs 1-1005") }, false),
  },
  vlan: { ...COMMON, name: N("Ascii name of the VLAN", { $word: N("The ascii name for the VLAN") }, false) },
  if: {
    ...COMMON, mls: MLS(false), shutdown: N("Shutdown the selected interface"), switchport: SWITCHPORT(false),
    no: N("Negate a command or set its defaults", { mls: MLS(true), shutdown: N("Shutdown the selected interface"), switchport: SWITCHPORT(true) }, false),
  },
};
GRAMMAR.range = GRAMMAR.if;
const PROMPT = { user: ">", priv: "#", config: "(config)#", vlan: "(config-vlan)#", if: "(config-if)#", range: "(config-if-range)#" };

// Walk the grammar: IOS accepts any unique prefix of a keyword. Returns the canonical words and arguments,
// or where and why it failed (the index of the word, for IOS's ^ marker).
export function parse(mode, words) {
  let node = { kids: GRAMMAR[mode], end: false };
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
    if (kids.$vlans) { const l = parseList(w, 1, 4094); if (!l) return { error: "invalid", at: i }; args.push(l); path.push("$vlans"); node = kids.$vlans; continue; }
    if (kids.$vlan) { const l = /^\d+$/.test(w) && Number(w) >= 1 && Number(w) <= 4094 ? Number(w) : null; if (!l) return { error: "invalid", at: i }; args.push(l); path.push("$vlan"); node = kids.$vlan; continue; }
    if (kids.$word) { args.push(w); path.push("$word"); node = kids.$word; continue; }
    return { error: "invalid", at: i };
  }
  if (!node.end) return { error: "incomplete" };
  return { path: path.join(" "), args };
}
// What can come next (for "?" and Tab): the keywords and argument hints after these words.
export function options(mode, words) {
  let kids = GRAMMAR[mode];
  for (const w of words) {
    const keys = Object.keys(kids || {});
    const k = keys.find(x => x === w.toLowerCase()) || keys.filter(x => !x.startsWith("$") && x.startsWith(w.toLowerCase())).at(0)
      || (kids.$port && parsePort(w) ? "$port" : null) || keys.find(x => x.startsWith("$") && x !== "$port");
    if (!k) return [];
    kids = kids[k].kids;
  }
  return Object.entries(kids || {}).map(([k, v]) => ({ word: k.startsWith("$") ? { $vlan: "<1-4094>", $vlans: "WORD", $word: "WORD", $port: "<interface>", $rest: "LINE" }[k] : k, help: v.help }));
}

// The lab's network as a model topology (static/js/net/model.js), which does the data plane: DTP, trunks,
// broadcast domains and ping results.
export function fromLab(lab) {
  const topo = { devices: {}, links: [] };
  for (const id of Object.keys(lab.switches)) topo.devices[id] = M.makeSwitch();
  for (const [id, pc] of Object.entries(lab.pcs)) topo.devices[id] = M.makePc({ ip: pc.ip, mask: pc.mask, gw: pc.gw || "" });
  for (const [s, def] of Object.entries(lab.switches)) for (const [p, [t, q]] of Object.entries(def.links || {})) if (s < t) topo.links.push({ a: [s, p], b: [t, q] });
  for (const [id, pc] of Object.entries(lab.pcs)) topo.links.push({ a: [id, "NIC"], b: [pc.sw, pc.port] });
  return topo;
}

// Command lines for every device in a topology: IOS on switches, the Windows prompt on PCs. Commands change the
// topology in place, so a diagram drawn from it stays in step. `ran` and `pings` record what was done.
export function createCli(topo) {
  const cli = {}, ran = [], pings = [];
  const st = id => (cli[id] ||= { mode: "user", ctx: [], history: [] });
  const sw = id => topo.devices[id];
  const kind = id => topo.devices[id]?.kind;
  const prompt = dev => (kind(dev) === "pc" ? "C:\\>" : kind(dev) === "router" ? `${dev}#` : `${dev}${PROMPT[st(dev).mode]}`);
  const hasVlan = (s, v) => v in sw(s).vlans;
  const opMode = (s, p) => M.opMode(topo, s, p);
  const peerOf = (s, p) => { const l = M.linkOf(topo, s, p); return l ? (l.a[0] === s && l.a[1] === p ? l.b : l.a) : null; };
  const allowed = (port, v) => !port.allowed || port.allowed.includes(v);

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
  function showRun(s) {
    const S = sw(s), out = ["Building configuration...", "", "[Simulator: only the hostname and interfaces are shown. VLANs 1-1005 live in vlan.dat, not here.]", "!", `hostname ${s}`, "!"];
    for (const p of PORTS) {
      const x = S.ports[p];
      out.push(`interface ${longName(p)}`);
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
    if (words.at(-1).endsWith("?")) {
      const last = words.at(-1).slice(0, -1);  // "sh?" lists words starting "sh"; "show ?" lists what follows show
      const opts = options(C.mode, words.slice(0, -1)).filter(o => !last || o.word.startsWith(last.toLowerCase()));
      return { out: opts.length ? opts.map(o => `  ${pad(o.word, 17)}${o.help}`).join("\n") : "% Unrecognized command" };
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
        return { out: `Translating "${words[0]}"...domain server (255.255.255.255)\n% Unknown command or computer name, or unable to find computer address`, error: true };
      return { out: caret(s, line, words, r.at), error: true };
    }
    const out = run(s, r.path, r.args, line, words);
    if (!out.error) ran.push(`${s}:${r.path}`);
    return out;
  }
  function run(s, path, args, line, words) {
    const S = sw(s), C = st(s);
    const each = fn => C.ctx.forEach(p => fn(S.ports[p], p));
    const create = (v, kind) => (hasVlan(s, v) ? "" : ((S.vlans[v] = `VLAN${String(v).padStart(4, "0")}`), `% ${kind} VLAN does not exist. Creating vlan ${v}`));
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
      case "show running-config": return { out: showRun(s) };
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
      case "switchport access vlan $vlan": { const msg = create(args[0], "Access"); each(p => { p.access = args[0]; }); return { out: msg }; }
      case "no switchport access vlan": each(p => { p.access = 1; }); return { out: "" };
      case "switchport voice vlan $vlan": { const msg = create(args[0], "Voice"); each(p => { p.voice = args[0]; }); return { out: msg }; }
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
          msgs.push(`%LINK-5-CHANGED: Interface ${longName(name)}, changed state to ${down ? "administratively down" : "up"}`);
          if (peerOf(s, name)) msgs.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longName(name)}, changed state to ${down ? "down" : "up"}`);
        });
        return { out: msgs.join("\n") };
      }
    }
    return { out: "[Simulator: that command isn't modelled here.]", error: true };
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
    if (cmd !== "ping") return { out: `'${words[0]}' is not recognized as an internal or external command,\noperable program or batch file.`, error: true };
    const ip = words[1];
    if (!ip) return { out: "\nUsage: ping [-t] [-a] [-n count] [-l size] target_name\n[Simulator: try ping followed by an IP address, e.g. ping 10.10.10.14]", error: true };
    if (M.ipNum(ip) == null) return { out: `Ping request could not find host ${ip}. Please check the name and try again.`, error: true };
    const r = M.ping(topo, id, ip), to = M.owners(topo, ip)[0]?.id;
    const head = `\nPinging ${ip} with 32 bytes of data:`, four = l => `${l}\n`.repeat(4);
    const stats = (rx, rtt) => `\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = ${rx}, Lost = ${4 - rx} (${(4 - rx) * 25}% loss),${rtt ? "\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 0ms, Average = 0ms" : ""}`;
    const body = {
      ok: () => `${four(`Reply from ${ip}: bytes=32 time<1ms TTL=${to && kind(to) === "router" ? 255 : 128}`)}${stats(4, true)}`,
      general: () => `${four("PING: transmit failed. General failure.")}${stats(0)}`,
      host: () => `${four(`Reply from ${pc.ip}: Destination host unreachable.`)}${stats(4)}`,  // Windows counts these as "received"
      net: () => `${four(`Reply from ${r.reply}: Destination net unreachable.`)}${stats(4)}`,
      timeout: () => `${four("Request timed out.")}${stats(0)}`,
    }[r.result]();
    pings.push({ from: id, to: to || ip, ok: r.result === "ok", vlan: M.vlanOf(topo, id), result: r.result, reason: r.reason });
    return { out: `${head}\n${body}`, ping: r };
  }

  function exec(dev, line) {
    if (line.trim()) st(dev).history.push(line);
    if (kind(dev) === "pc") return pcLine(dev, line);
    if (kind(dev) === "router") return { out: "[Simulator: configure routers with the settings panel.]", error: true };
    return iosLine(dev, line);
  }
  // Tab: complete the last word if exactly one keyword fits (IOS beeps otherwise).
  function complete(dev, line) {
    if (kind(dev) !== "switch") return line;
    const words = line.split(/\s+/), last = words.pop() || "";
    const hits = options(st(dev).mode, words.filter(Boolean)).map(o => o.word).filter(w => /^[a-z]/.test(w) && w.startsWith(last.toLowerCase()));
    return hits.length === 1 && last ? [...words, hits[0]].join(" ") + " " : line;
  }
  return { prompt, exec, complete, history: dev => st(dev).history, ran, pings, forget: id => { delete cli[id]; } };
}

export function createNet(lab) {
  const topo = fromLab(lab), cli = createCli(topo);
  const sw = id => topo.devices[id], opMode = (s, p) => M.opMode(topo, s, p);
  // ---------- objectives
  function isDone(c) {
    if (c.ran) return cli.ran.includes(`${c.ran.device}:${c.ran.cmd}`);
    if (c.pinged) return cli.pings.some(p => p.from === c.pinged.from && p.to === c.pinged.to && p.ok === c.pinged.ok && (c.pinged.vlan === undefined || p.vlan === c.pinged.vlan));
    if (c.vlans) return c.vlans.devices.every(d => Object.entries(c.vlans.names).every(([v, n]) => sw(d).vlans[v] === n));
    if (c.access) return Object.entries(c.access.ports).every(([p, v]) => sw(c.access.device).ports[p].mode === "access" && sw(c.access.device).ports[p].access === v);
    if (c.voice) { const p = sw(c.voice.device).ports[c.voice.port]; return p.voice === c.voice.vlan && p.trust === c.voice.trust; }
    if (c.trunks) return c.trunks.every(([s, p]) => opMode(s, p) === "trunk" && !sw(s).ports[p].shutdown);
    if (c.native) return c.native.ports.every(([s, p]) => sw(s).ports[p].native === c.native.vlan);
    if (c.all) return c.all.every(isDone);
    return false;
  }
  return {
    topo, state: { ran: cli.ran, pings: cli.pings }, prompt: cli.prompt, exec: cli.exec, complete: cli.complete, history: cli.history,
    isDone, opMode, pcVlan: id => M.vlanOf(topo, id),
    reachable: (a, b) => M.ping(topo, a, sw(b).ip).result === "ok",
  };
}

// ---------- the on-page lab
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const net = createNet(lab);
  const done = new Set(solved), devices = [...Object.keys(lab.switches), ...Object.keys(lab.pcs)];
  const outs = Object.fromEntries(devices.map(d => [d, ""]));
  let dev = Object.keys(lab.switches)[0], histI = null, finished = lab.tasks.every(t => done.has(t.id));

  root.innerHTML = `<div class="term-lab vlan-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <section class="panel"><div class="panel-title"><h2>The network</h2><span class="sim-tag">Simulation</span></div>
      <div class="vl-diagram" id="v-diagram"></div>
      <div class="vl-table" role="region" aria-label="Addressing table" tabindex="0"><table class="tbl"><caption class="sr-only">Addressing table</caption><thead><tr><th scope="col">PC</th><th scope="col">IP address</th><th scope="col">Mask</th><th scope="col">Connected to</th><th scope="col">Planned VLAN</th></tr></thead>
        <tbody>${Object.entries(lab.pcs).map(([id, pc]) => `<tr><th scope="row">${id}</th><td class="mono">${pc.ip}</td><td class="mono">${pc.mask}</td><td>${pc.sw} ${pc.port}${pc.phone ? " (through an IP phone)" : ""}</td><td>${pc.vlan} (${esc(lab.vlans[pc.vlan])})</td></tr>`).join("")}</tbody></table></div>
      <details class="tbl simplification"><summary>How this simulation differs from real switches</summary><p>${esc(lab.simplification)}</p></details></section>
    <div class="term-grid">
      <section class="term-shell" aria-label="Simulated consoles">
        <div class="term-bar vl-tabs" role="group" aria-label="Choose a device">${devices.map(d => `<button type="button" class="chip" data-dev="${d}" aria-pressed="${d === dev}">${d}</button>`).join("")}</div>
        <div class="term-out" id="v-out" aria-live="polite" tabindex="0" aria-label="Console output"></div>
        <form class="term-in" id="v-form"><label class="sr" for="v-in">Command for the selected device</label><span class="term-ps" id="v-ps"></span><input id="v-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
      </section>
      <aside class="panel term-tasks"><div class="panel-title"><h2>Objectives</h2><span class="mono" id="v-count"></span></div><ol id="v-tasks"></ol>
        <div class="row"><button class="link-btn" id="v-hint">Show a hint</button></div><div id="v-hinttext"></div>
        <div class="row"><button class="btn ghost" id="v-reset">↺ Reset lab</button></div></aside>
    </div>
    ${lab.next ? `<section class="panel" id="v-next" hidden><h2>Take it further</h2><ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>` : ""}
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const out = $("v-out"), input = $("v-in");

  // The live diagram: each broadcast domain in its own colour, trunks as bundles of the colours they carry.
  let focus = null;
  function drawDiagram() {
    const seg = M.segments(net.topo);
    if (focus != null && !seg.segments[focus]) focus = null;
    $("v-diagram").innerHTML = V.svg(net.topo, { layout: lab.layout, width: 600, height: 320, seg, focus })
      + `<h3 class="eyebrow">Who can talk to whom</h3>${V.legend(net.topo, seg, focus)}`;
    $("v-diagram").querySelectorAll("[data-seg]").forEach(b => b.addEventListener("click", () => { focus = focus === Number(b.dataset.seg) ? null : Number(b.dataset.seg); drawDiagram(); $("v-diagram").querySelector(`[data-seg="${b.dataset.seg}"]`)?.focus(); }));
  }
  const print = html => { outs[dev] += html; out.insertAdjacentHTML("beforeend", html); out.scrollTop = out.scrollHeight; };
  function renderTasks() {
    lab.tasks.forEach(t => { if (!done.has(t.id) && net.isDone(t.check)) { done.add(t.id); onPart(t.id); } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("v-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}${done.has(t.id) && t.why ? `<span class="vl-why">${esc(t.why)}</span>` : ""}</li>`).join("");
    $("v-count").textContent = `${done.size}/${lab.tasks.length}`;
    $("v-hinttext").innerHTML = ""; $("v-hint").hidden = !next;
    if (!next) { if ($("v-next")) $("v-next").hidden = false; if (!finished) { finished = true; onComplete(); } }
  }
  const ps = () => { $("v-ps").textContent = net.prompt(dev); };
  function choose(d, focus = true) {
    dev = d; histI = null;
    root.querySelectorAll("[data-dev]").forEach(b => b.setAttribute("aria-pressed", b.dataset.dev === d));
    out.innerHTML = outs[d] || `<div class="muted">${lab.pcs[d] ? `${esc(d)}: Windows command prompt. Try ipconfig or ping.` : `${esc(d)}: Cisco Catalyst 2960 console. Type ? for help; abbreviations like "sh vl br" work.`}</div>`;
    if (!outs[d]) outs[d] = out.innerHTML;
    ps(); if (focus) input.focus();
  }

  $("v-form").addEventListener("submit", e => {
    e.preventDefault();
    const line = input.value;
    print(`<div><span class="term-ps">${esc(net.prompt(dev))}</span>${esc(line)}</div>`);
    const res = net.exec(dev, line);
    if (res.out) print(`<div class="${res.error ? "t-err" : ""}">${esc(res.out)}</div>`);
    input.value = ""; histI = null; ps(); drawDiagram(); renderTasks();
  });
  input.addEventListener("keydown", e => {
    const h = net.history(dev);
    if (e.key === "ArrowUp" && h.length) { e.preventDefault(); histI = histI == null ? h.length - 1 : Math.max(0, histI - 1); input.value = h[histI]; }
    else if (e.key === "ArrowDown" && histI != null) { e.preventDefault(); histI = Math.min(h.length, histI + 1); input.value = h[histI] || ""; if (histI >= h.length) histI = null; }
    else if (e.key === "Tab" && input.value) { e.preventDefault(); input.value = net.complete(dev, input.value); }
  });
  root.querySelectorAll("[data-dev]").forEach(b => b.addEventListener("click", () => choose(b.dataset.dev)));
  out.addEventListener("click", () => input.focus());
  $("v-hint").addEventListener("click", () => { const t = lab.tasks.find(x => !done.has(x.id)); if (t) $("v-hinttext").innerHTML = `<div class="feedback">${esc(t.hint)}</div>`; });
  $("v-reset").addEventListener("click", onReset);

  drawDiagram(); renderTasks(); choose(dev, false);
  return { net };
}
