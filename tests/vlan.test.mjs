// Tests for the VLAN lab (static/js/labs/vlan.js): the IOS command parser, switch state, show output
// formats, the data plane (who can ping whom) and the lab's objectives.
// Run with:  node --test tests/vlan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNet, parse, parsePort, parseList, compress, PORTS } from "../static/js/labs/vlan.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "vlans");
// Run lines on a device; returns the last result.
const on = (net, dev, ...lines) => lines.map(l => net.exec(dev, l)).at(-1);
const VLANS = Object.entries(lab.vlans).flatMap(([v, n]) => [`vlan ${v}`, `name ${n}`]);
const ACCESS = ["int fa0/11", "sw mo acc", "sw acc vl 10", "int f0/18", "switchport mode access", "switchport access vlan 20", "interface FastEthernet 0/6", "switchport mode access", "switchport access vlan 30"];
const pinged = (net, from, to) => on(net, from, `ping ${lab.pcs[to].ip}`).out;
function solve(net) {
  for (const s of ["S1", "S2", "S3"]) on(net, s, "enable", "conf t", ...VLANS, "end");
  for (const s of ["S2", "S3"]) on(net, s, "conf t", ...ACCESS, "end");
  on(net, "S3", "conf t", "int fa0/11", "mls qos trust cos", "switchport voice vlan 150", "end");
  on(net, "S1", "conf t", "interface range gi0/1 - 2", "switchport mode trunk", "switchport trunk native vlan 99", "end");
  on(net, "S2", "conf t", "int g0/1", "sw tr nat vl 99", "end");
  on(net, "S3", "conf t", "int gi0/1", "switchport trunk native vlan 99", "end");
}

test("ports, VLAN lists and IOS-style ranges", () => {
  assert.equal(PORTS.length, 26);
  assert.equal(parsePort("f0/11"), "Fa0/11");
  assert.equal(parsePort("FastEthernet0/24"), "Fa0/24");
  assert.equal(parsePort("gi", "0/2"), "Gi0/2");
  assert.equal(parsePort("fa0/25"), null);
  assert.equal(parsePort("gi0/3"), null);
  assert.equal(parsePort("x0/1"), null);
  assert.deepEqual(parseList("10,20-22", 1, 4094), [10, 20, 21, 22]);
  assert.equal(parseList("0", 1, 4094), null);
  assert.equal(parseList("5-3", 1, 4094), null);
  assert.equal(compress([1, 2, 3, 10, 20, 21]), "1-3,10,20-21");
});

test("the parser takes unique abbreviations and reports IOS errors", () => {
  assert.deepEqual(parse("priv", ["sh", "vl", "br"]), { path: "show vlan brief", args: [] });
  assert.deepEqual(parse("priv", ["conf", "t"]), { path: "configure terminal", args: [] });
  assert.deepEqual(parse("if", ["sw", "mo", "dyn", "des"]), { path: "switchport mode dynamic desirable", args: [] });
  assert.deepEqual(parse("priv", ["show", "int", "fa", "0/11", "sw"]), { path: "show interfaces $port switchport", args: ["Fa0/11"] });
  assert.deepEqual(parse("priv", ["s", "v", "b"]), { path: "show vlan brief", args: [] });
  assert.equal(parse("priv", ["e"]).error, "ambiguous", "enable or exit");
  assert.equal(parse("priv", ["show", "vlam"]).at, 1);
  assert.equal(parse("priv", ["configure"]).error, "incomplete");
  assert.equal(parse("user", ["show", "running-config"]).error, "invalid", "running-config needs privileged mode");
  assert.equal(parse("vlan", ["name", "Faculty", "Staff"]).at, 2, "a VLAN name is one word");
  assert.equal(parse("config", ["vlan", "0"]).at, 1);
});

test("a fresh switch: user mode, every port in VLAN 1, IOS messages", () => {
  const net = createNet(lab);
  assert.equal(net.prompt("S1"), "S1>");
  const r = on(net, "S1", "foo");
  assert.match(r.out, /^Translating "foo"\.\.\.domain server \(255\.255\.255\.255\)\n% Unknown command/);
  assert.equal(on(net, "S1", "configure terminal").out, "   ^\n% Invalid input detected at '^' marker.", "caret under the bad word, after the 3-character prompt");
  assert.equal(on(net, "S1", "show vlam").out, "        ^\n% Invalid input detected at '^' marker.");
  on(net, "S1", "en");
  assert.equal(net.prompt("S1"), "S1#");
  const brief = on(net, "S1", "sh vl br").out.split("\n");
  assert.equal(brief[0], "VLAN Name                             Status    Ports");
  assert.equal(brief[1], "---- -------------------------------- --------- -------------------------------");
  assert.equal(brief[2], "1    default                          active    Fa0/1, Fa0/2, Fa0/3, Fa0/4");
  assert.equal(brief[3], " ".repeat(48) + "Fa0/5, Fa0/6, Fa0/7, Fa0/8");
  assert.ok(brief.includes(" ".repeat(48) + "Fa0/21, Fa0/22, Fa0/23, Fa0/24"));
  assert.ok(brief.includes(" ".repeat(48) + "Gi0/1, Gi0/2"), "untrunked uplinks are access ports in VLAN 1");
  assert.deepEqual(brief.slice(-4), ["1002 fddi-default                     act/unsup", "1003 token-ring-default               act/unsup", "1004 fddinet-default                  act/unsup", "1005 trnet-default                    act/unsup"]);
  assert.equal(on(net, "S1", "show interfaces trunk").out, "", "no trunks yet: IOS prints nothing");
  assert.equal(on(net, "S1", "e").out, '% Ambiguous command:  "e"');
});

test("modes: configure, VLAN and interface submodes, exit, end and do", () => {
  const net = createNet(lab);
  on(net, "S1", "enable");
  assert.match(on(net, "S1", "conf t").out, /^Enter configuration commands/);
  assert.equal(net.prompt("S1"), "S1(config)#");
  on(net, "S1", "vlan 10");
  assert.equal(net.prompt("S1"), "S1(config-vlan)#");
  on(net, "S1", "name Staff");
  assert.match(on(net, "S1", "do show vlan brief").out, /^10   Staff\s+active\s*$/m);
  on(net, "S1", "int fa0/1");  // a global command from a submode moves there
  assert.equal(net.prompt("S1"), "S1(config-if)#");
  on(net, "S1", "vlan 20");
  assert.equal(net.prompt("S1"), "S1(config-vlan)#");
  on(net, "S1", "exit");
  assert.equal(net.prompt("S1"), "S1(config)#");
  on(net, "S1", "interface range fa0/1 - 3, fa0/5");
  assert.equal(net.prompt("S1"), "S1(config-if-range)#");
  on(net, "S1", "switchport access vlan 20");
  assert.equal(on(net, "S1", "end").out, "%SYS-5-CONFIG_I: Configured from console by console");
  assert.match(on(net, "S1", "show vlan brief").out, /^20   VLAN0020\s+active    Fa0\/1, Fa0\/2, Fa0\/3, Fa0\/5$/m, "a VLAN created without a name gets VLAN00nn");
  assert.match(on(net, "S1", "exit").out, /con0 is now available/);
  assert.equal(net.prompt("S1"), "S1>");
});

test("VLAN rules match IOS", () => {
  const net = createNet(lab);
  on(net, "S1", "en", "conf t");
  assert.equal(on(net, "S1", "vlan 2000").out.split("\n")[0], "Extended VLAN(s) not allowed in current VTP mode.");
  on(net, "S1", "vlan 1");
  assert.equal(on(net, "S1", "name Main").out, "Default VLAN 1 may not have its name changed.");
  on(net, "S1", "vlan 10", "name Staff", "vlan 20");
  assert.match(on(net, "S1", "name Staff").out, /already in use/);
  assert.match(on(net, "S1", "no vlan 1").out, /may not be deleted/);
  on(net, "S1", "int fa0/2");
  assert.equal(on(net, "S1", "switchport access vlan 40").out, "% Access VLAN does not exist. Creating vlan 40");
  assert.equal(on(net, "S1", "switchport voice vlan 150").out, "% Voice VLAN does not exist. Creating vlan 150");
  assert.equal(on(net, "S1", "switchport trunk encapsulation dot1q").error, true, "a 2960 only does 802.1Q: no encapsulation command");
  on(net, "S1", "no vlan 40");
  assert.doesNotMatch(on(net, "S1", "do sh vl br").out, /Fa0\/2,/, "a port in a deleted VLAN is inactive and listed nowhere");
});

test("the data plane: same VLAN pings, different subnets can't, untrunked links block VLANs", () => {
  const net = createNet(lab);
  assert.match(pinged(net, "PC1", "PC4"), /Reply from 10\.10\.10\.14: bytes=32 time<1ms TTL=128[\s\S]*Received = 4, Lost = 0 \(0% loss\)/);
  assert.match(pinged(net, "PC1", "PC2"), /PING: transmit failed\. General failure\.[\s\S]*Received = 0, Lost = 4 \(100% loss\)/);
  for (const s of ["S2", "S3"]) on(net, s, "en", "conf t", ...ACCESS, "end");
  const out = pinged(net, "PC1", "PC4");
  assert.match(out, /Reply from 10\.10\.10\.11: Destination host unreachable\./, "ARP fails: Windows answers from its own address");
  assert.match(out, /Received = 4, Lost = 0/, "and counts those as received");
  assert.equal(net.state.pings.at(-1).ok, false);
  on(net, "S1", "en", "conf t", "int range g0/1-2", "sw mo trunk", "end");
  assert.equal(net.opMode("S2", "Gi0/1"), "trunk", "dynamic auto agrees to trunk when the other end is trunk");
  assert.equal(net.reachable("PC1", "PC4"), false, "VLAN 10 doesn't exist on the switches yet");
  for (const s of ["S1", "S2", "S3"]) on(net, s, "conf t", ...VLANS, "end");
  assert.equal(net.reachable("PC1", "PC4"), true);
  assert.equal(net.reachable("PC2", "PC5"), true);
  assert.equal(net.reachable("PC1", "PC5"), false, "different VLANs stay apart");
  on(net, "S1", "conf t", "int g0/2", "switchport trunk allowed vlan remove 10", "end");
  assert.equal(net.reachable("PC1", "PC4"), false, "pruned from the trunk");
  assert.equal(net.reachable("PC2", "PC5"), true);
  on(net, "S1", "conf t", "int g0/2", "switchport trunk allowed vlan all", "shutdown", "end");
  assert.equal(net.reachable("PC2", "PC5"), false, "a shut port carries nothing");
});

test("two dynamic auto ends never trunk; desirable does; access refuses", () => {
  const net = createNet(lab);
  assert.equal(net.opMode("S1", "Gi0/1"), "access");
  on(net, "S2", "en", "conf t", "int g0/1", "switchport mode dynamic desirable", "end");
  assert.equal(net.opMode("S1", "Gi0/1"), "trunk");
  on(net, "S1", "en", "conf t", "int g0/1", "switchport mode access", "end");
  assert.equal(net.opMode("S2", "Gi0/1"), "access");
});

test("native VLAN: a mismatch is reported by CDP, and untagged traffic changes VLAN across it", () => {
  const net = createNet(lab);
  for (const s of ["S1", "S2", "S3"]) on(net, s, "en", "conf t", ...VLANS, "end");
  on(net, "S1", "conf t", "int range gi0/1 - 2", "switchport mode trunk", "end");
  const r = on(net, "S1", "conf t", "int g0/1", "switchport trunk native vlan 99");
  assert.equal(r.out, "%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/1 (99), with S2 GigabitEthernet0/1 (1).");
  on(net, "S1", "end");
  // S1 sends VLAN 99 untagged; S2 (native 1) puts it in VLAN 1. So a VLAN 99 port on S1's side and a VLAN 1
  // port on S2 end up in one broadcast domain, while VLAN 1 itself no longer crosses cleanly.
  on(net, "S2", "conf t", "int fa0/11", "switchport mode access", "switchport access vlan 1", "end");
  on(net, "S3", "conf t", "int g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "end");
  on(net, "S3", "conf t", "int fa0/11", "switchport mode access", "switchport access vlan 99", "end");
  assert.equal(net.reachable("PC1", "PC4"), true, "PC1 (VLAN 1 on S2) reaches PC4 (VLAN 99 on S3)");
});

test("show interfaces trunk and switchport follow the 2960 layout", () => {
  const net = createNet(lab);
  solve(net);
  const t = on(net, "S1", "show interfaces trunk").out.split("\n");
  assert.equal(t[0], "Port        Mode             Encapsulation  Status        Native vlan");
  assert.equal(t[1], "Gi0/1       on               802.1q         trunking      99");
  assert.ok(t.includes("Gi0/1       1-4094"));
  assert.ok(t.includes("Gi0/1       1,10,20,30,99,150"));
  const s2 = on(net, "S2", "show interfaces trunk").out.split("\n");
  assert.equal(s2[1], "Gi0/1       auto             802.1q         trunking      99", "S2 trunks by negotiation");
  const sp = on(net, "S3", "show interfaces fa0/11 switchport").out;
  assert.match(sp, /^Administrative Mode: static access$/m);
  assert.match(sp, /^Access Mode VLAN: 10 \(Staff\)$/m);
  assert.match(sp, /^Voice VLAN: 150 \(Voice\)$/m);
  assert.match(on(net, "S3", "show vlan brief").out, /^150  Voice\s+active    Fa0\/11$/m, "a voice port is listed under its voice VLAN too");
  const run = on(net, "S3", "show running-config").out;
  assert.match(run, /interface FastEthernet0\/11\n switchport access vlan 10\n switchport mode access\n switchport voice vlan 150\n mls qos trust cos\n!/);
});

test("PCs: ipconfig and Windows errors", () => {
  const net = createNet(lab);
  assert.match(on(net, "PC1", "ipconfig").out, /IPv4 Address\. \. \. \. \. \. \. \. \. \. \. : 10\.10\.10\.11/);
  assert.match(on(net, "PC1", "dir").out, /^'dir' is not recognized as an internal or external command,/);
  assert.match(on(net, "PC1", "ping 10.10.10.999").out, /could not find host/);
  assert.match(on(net, "PC1", "ping 10.10.10.200").out, /Destination host unreachable/, "nobody has that address");
  on(net, "S2", "en", "conf t", "int fa0/11", "shutdown", "end");
  assert.match(on(net, "PC1", "ping 10.10.10.14").out, /General failure/, "a shut port looks like an unplugged cable");
  assert.doesNotMatch(on(net, "S2", "show interfaces fa0/11").out, /Incomplete/, "a valid IOS command, even if not modelled");
});

test("? lists what can come next; Tab completes a unique keyword", () => {
  const net = createNet(lab);
  on(net, "S1", "en");
  assert.match(on(net, "S1", "?").out, /^  configure\s+Enter configuration mode$/m);
  assert.match(on(net, "S1", "show ?").out, /vlan\s+VTP VLAN status/);
  assert.equal(net.complete("S1", "conf"), "configure ");
  assert.equal(net.complete("S1", "e"), "e", "ambiguous: no completion");
});

test("the lab's objectives complete in order and reflect real state", () => {
  const net = createNet(lab);
  const done = () => lab.tasks.filter(t => net.isDone(t.check)).map(t => t.id);
  on(net, "S1", "enable", "show vlan brief");
  pinged(net, "PC1", "PC4"); pinged(net, "PC1", "PC2");
  assert.deepEqual(done(), ["look", "same", "other"]);
  for (const s of ["S1", "S2", "S3"]) on(net, s, "en", "conf t", ...VLANS, "end");
  for (const s of ["S2", "S3"]) on(net, s, "conf t", ...ACCESS, "end");
  on(net, "S3", "conf t", "int fa0/11", "mls qos trust cos", "switchport voice vlan 150", "end");
  pinged(net, "PC1", "PC4");
  assert.ok(done().includes("broken") && !done().includes("verify"));
  on(net, "S1", "conf t", "interface range gi0/1 - 2", "switchport mode trunk", "switchport trunk native vlan 99", "end");
  on(net, "S2", "conf t", "int g0/1", "sw tr nat vl 99", "end");
  on(net, "S3", "conf t", "int gi0/1", "switchport trunk native vlan 99", "end");
  for (const [a, b] of [["PC1", "PC4"], ["PC2", "PC5"], ["PC3", "PC6"]]) assert.match(pinged(net, a, b), /Reply from/);
  assert.deepEqual(done(), lab.tasks.map(t => t.id));
});

test("lab content is consistent", () => {
  for (const [id, pc] of Object.entries(lab.pcs)) {
    assert.ok(lab.switches[pc.sw] && PORTS.includes(pc.port), id);
    assert.ok(lab.vlans[pc.vlan], id);
    assert.ok(lab.layout[id], id);
  }
  for (const [s, def] of Object.entries(lab.switches)) for (const [p, [t, q]] of Object.entries(def.links || {})) assert.deepEqual(lab.switches[t].links[q], [s, p], `${s} ${p} is linked both ways`);
  for (const t of lab.tasks) assert.ok(t.text && t.hint && t.why && t.check, t.id);
  assert.ok(!JSON.stringify(lab).includes("—"), "no em dashes");
});

test("found in review: ports stay out of reserved and extended VLANs; an unplugged port doesn't come up", () => {
  const net = createNet(lab);
  on(net, "S1", "en", "conf t", "int fa0/20");
  for (const v of ["1002", "1500"]) {
    const r = on(net, "S1", `switchport access vlan ${v}`);
    assert.equal(r.error, true, v); assert.match(r.out, /2 to 1001/);
  }
  assert.equal((on(net, "S1", "do sh vl br").out.match(/^1002 /gm) || []).length, 1, "VLAN 1002 listed once");
  on(net, "S1", "int fa0/21", "shutdown");
  assert.equal(on(net, "S1", "no shutdown").out, "%LINK-3-UPDOWN: Interface FastEthernet0/21, changed state to down");
  on(net, "S1", "int gi0/1", "shutdown");
  assert.match(on(net, "S1", "no shutdown").out, /^%LINK-3-UPDOWN: Interface GigabitEthernet0\/1, changed state to up\n%LINEPROTO-5-UPDOWN/);
});
