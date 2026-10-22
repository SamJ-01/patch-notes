// Tests for the inter-VLAN routing lab (content/labs.json "intervlan", run by static/js/labs/vlan.js): the router's
// IOS command line, its show output, 802.1Q subinterfaces, routed pings, extended ACLs and the lab's objectives.
// Run with:  node --test tests/intervlan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNet, parseRouterPort } from "../static/js/labs/vlan.js";
import * as M from "../static/js/net/model.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "intervlan");
const on = (net, dev, ...lines) => lines.map(l => net.exec(dev, l)).at(-1);
const ping = (net, from, to) => on(net, from, `ping ${lab.pcs[to].ip}`).out;
const ROUTE = ["enable", "conf t", "int g0/0", "no shut", "int g0/0.10", "encapsulation dot1Q 10", "ip address 10.10.10.1 255.255.255.0",
  "int g0/0.20", "encap dot1q 20", "ip add 10.10.20.1 255.255.255.0", "interface GigabitEthernet0/0.30", "encapsulation dot1Q 30", "ip address 10.10.30.1 255.255.255.0", "end"];
const ACL = ["conf t", "ip access-list extended STUDENTS", "deny ip 10.10.20.0 0.0.0.255 10.10.10.0 0.0.0.255", "permit ip any any", "int g0/0.20", "ip access-group STUDENTS in", "end"];
const done = net => lab.tasks.filter(t => net.isDone(t.check)).map(t => t.id);

test("router interface names: short, long and with a subinterface", () => {
  assert.deepEqual(parseRouterPort("g0/0"), { port: "G0/0", sub: null });
  assert.deepEqual(parseRouterPort("gi0/0.10"), { port: "G0/0", sub: 10 });
  assert.deepEqual(parseRouterPort("GigabitEthernet0/2.300"), { port: "G0/2", sub: 300 });
  assert.equal(parseRouterPort("g0/3"), null, "a 2911 has Gi0/0 to Gi0/2");
  assert.equal(parseRouterPort("fa0/0"), null);
});

test("the lab starts where the VLAN lab ends, with the router shut down", () => {
  const net = createNet(lab);
  assert.equal(net.reachable("PC1", "PC4"), true, "VLAN 10 already spans both switches");
  assert.equal(net.topo.devices.R1.ports["G0/0"].shutdown, true);
  const brief = on(net, "R1", "enable", "show ip interface brief").out;
  assert.match(brief, /^Interface {18}IP-Address {6}OK\? Method Status {16}Protocol$/m);
  assert.match(brief, /^GigabitEthernet0\/0 {9}unassigned {6}YES unset  administratively down down$/m);
  assert.match(ping(net, "PC1", "PC2"), /Reply from 10\.10\.10\.11: Destination host unreachable\./, "the gateway doesn't answer yet");
  assert.deepEqual(done(net), ["stuck"]);
});

test("IOS refuses an address on a subinterface before its VLAN tag, and overlapping networks", () => {
  const net = createNet(lab);
  const r = on(net, "R1", "enable", "conf t", "int g0/0.10", "ip address 10.10.10.1 255.255.255.0");
  assert.equal(r.error, true);
  assert.match(r.out, /only allowed if that\nsubinterface is already configured as part of an IEEE 802\.10, IEEE 802\.1Q,\nor ISL vLAN\./);
  assert.equal(net.prompt("R1"), "R1(config-subif)#");
  on(net, "R1", "encapsulation dot1Q 10", "ip address 10.10.10.1 255.255.255.0", "int g0/0.20", "encapsulation dot1Q 20");
  assert.match(on(net, "R1", "ip address 10.10.10.2 255.255.255.0").out, /^% 10\.10\.10\.0 overlaps with GigabitEthernet0\/0\.10$/);
  assert.match(on(net, "R1", "ip address 10.10.20.1 255.0.255.0").out, /^Bad mask 0xFF00FF00 for address 10\.10\.20\.1$/);
  assert.match(on(net, "R1", "ip address 10.10.20.0 255.255.255.0").out, /^Bad mask \/24 for address 10\.10\.20\.0$/);
  assert.equal(on(net, "R1", "encapsulation dot1Q 10").error, true, "VLAN 10 already has a subinterface");
  assert.equal(on(net, "R1", "show ip route").error, true, "show is an exec command: from config it needs do");
  assert.equal(on(net, "R1", "do show ip route").error, undefined);
});

test("routing between VLANs needs the trunk, the interface up and a subinterface per VLAN", () => {
  const net = createNet(lab);
  on(net, "R1", ...ROUTE);
  assert.match(ping(net, "PC1", "PC2"), /Destination host unreachable/, "S1 Fa0/24 isn't a trunk yet, so the tagged frames are dropped");
  on(net, "S1", "enable", "conf t", "int fa0/24", "switchport mode trunk", "end");
  const out = ping(net, "PC1", "PC2");
  assert.match(out, /Reply from 10\.10\.20\.12: bytes=32 time<1ms TTL=128/);
  assert.match(ping(net, "PC3", "PC5"), /Reply from 10\.10\.20\.15/, "across the switches, to the other VLAN");
  assert.match(on(net, "PC2", "ping 10.10.20.1").out, /TTL=255/, "the router answers its own address");
  const brief = on(net, "R1", "show ip interface brief").out;
  assert.match(brief, /^GigabitEthernet0\/0\.10 {6}10\.10\.10\.1 {6}YES manual up {20}up$/m);
  const route = on(net, "R1", "show ip route").out;
  assert.match(route, /^ {6}10\.0\.0\.0\/8 is variably subnetted, 6 subnets, 2 masks$/m);
  assert.match(route, /^C {8}10\.10\.20\.0\/24 is directly connected, GigabitEthernet0\/0\.20$/m);
  assert.match(route, /^L {8}10\.10\.30\.1\/32 is directly connected, GigabitEthernet0\/0\.30$/m);
  assert.match(route, /Gateway of last resort is not set/);
  // Shutting the physical interface takes every subinterface with it.
  on(net, "R1", "conf t", "int g0/0", "shutdown", "end");
  assert.match(ping(net, "PC1", "PC2"), /Destination host unreachable/);
});

test("an extended ACL: first match wins, an implicit deny, and replies are filtered too", () => {
  const net = createNet(lab);
  on(net, "S1", "enable", "conf t", "int fa0/24", "switchport mode trunk", "end");
  on(net, "R1", ...ROUTE, ...ACL);
  assert.match(ping(net, "PC2", "PC1"), /Request timed out\./);
  assert.match(ping(net, "PC2", "PC3"), /Reply from 10\.10\.30\.13/);
  assert.match(ping(net, "PC1", "PC2"), /Request timed out\./, "the request gets through; the reply is denied on its way back");
  assert.match(ping(net, "PC1", "PC4"), /Reply from 10\.10\.10\.14/, "same VLAN: never reaches the router");
  const r = M.ping(net.topo, "PC1", "10.10.20.12");
  assert.equal(r.blocked.name, "STUDENTS");
  assert.match(r.reason, /reply/);
  assert.equal(on(net, "R1", "show access-lists").out,
    "Extended IP access list STUDENTS\n    10 deny ip 10.10.20.0 0.0.0.255 10.10.10.0 0.0.0.255 (8 matches)\n    20 permit ip any any (4 matches)");
  const run = on(net, "R1", "show running-config").out;
  assert.match(run, /^ip access-list extended STUDENTS\n deny   ip 10\.10\.20\.0 0\.0\.0\.255 10\.10\.10\.0 0\.0\.0\.255\n permit ip any any$/m);
  assert.match(run, /^interface GigabitEthernet0\/0\.20\n encapsulation dot1Q 20\n ip address 10\.10\.20\.1 255\.255\.255\.0\n ip access-group STUDENTS in$/m);
  // Without the permit line, the implicit deny cuts students off from everything off their VLAN.
  on(net, "R1", "conf t", "ip access-list extended STUDENTS", "no 20", "end");
  assert.match(ping(net, "PC2", "PC3"), /Request timed out\./);
  // Addresses are stored with the wildcard bits cleared, as IOS does; host and any are understood.
  on(net, "R1", "conf t", "ip access-list extended STUDENTS", "permit icmp 10.10.20.77 0.0.0.255 host 10.10.30.13", "end");
  assert.match(on(net, "R1", "show access-lists").out, /^    20 permit icmp 10\.10\.20\.0 0\.0\.0\.255 host 10\.10\.30\.13$/m, "numbered after the highest line left, as IOS does");
  assert.equal(on(net, "R1", "conf t", "ip access-list extended STUDENTS", "permit tcp any any").error, true, "only ip and icmp entries are modelled");
});

test("the lab can be finished from its own hints, every objective in order", () => {
  const net = createNet(lab);
  ping(net, "PC1", "PC2");
  on(net, "S1", "enable", "conf t", "interface fa0/24", "switchport mode trunk", "end");
  on(net, "R1", ...ROUTE);
  ping(net, "PC1", "PC2");
  on(net, "R1", "show ip route");
  on(net, "R1", ...ACL);
  ping(net, "PC2", "PC1"); ping(net, "PC2", "PC3"); ping(net, "PC1", "PC2");
  assert.deepEqual(done(net), lab.tasks.map(t => t.id));
  for (const t of lab.tasks) assert.ok(t.hint && t.why && !/—/.test(t.text + t.hint + t.why), t.id);
});

test("objectives that need the ACL can't be ticked off early", () => {
  const net = createNet(lab);
  on(net, "S1", "enable", "conf t", "int fa0/24", "switchport mode trunk", "end");
  on(net, "R1", ...ROUTE);
  ping(net, "PC2", "PC3");
  assert.equal(net.isDone(lab.tasks.find(t => t.id === "guest").check), false, "PC2 to PC3 before the ACL doesn't count");
  on(net, "R1", "enable", "conf t", "int g0/0", "shutdown", "end");
  ping(net, "PC1", "PC2");
  assert.equal(net.isDone(lab.tasks.find(t => t.id === "twist").check), false, "a failure without the ACL isn't the twist");
});
