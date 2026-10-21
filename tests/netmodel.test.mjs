// Tests for the shared network model (static/js/net/model.js): segments, link carriage, ping results with
// reasons, inter-VLAN routing and the issues it points out.
// Run with:  node --test tests/netmodel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../static/js/net/model.js";

// A small builder: switches, PCs (ip/mask/gw), and links.
function net({ switches = [], pcs = {}, routers = {}, links = [] }) {
  const topo = { devices: {}, links: [] };
  for (const s of switches) topo.devices[s] = M.makeSwitch();
  for (const [id, cfg] of Object.entries(pcs)) topo.devices[id] = M.makePc(cfg);
  for (const [id, ports] of Object.entries(routers)) { topo.devices[id] = M.makeRouter(); for (const [p, subs] of Object.entries(ports)) topo.devices[id].ports[p].subs = subs; }
  for (const [a, pa, b, pb] of links) topo.links.push({ a: [a, pa], b: [b, pb] });
  return topo;
}
const port = (topo, sw, p, cfg) => Object.assign(topo.devices[sw].ports[p], cfg);
const vlans = (topo, sw, list) => Object.assign(topo.devices[sw].vlans, list);
const pc = (ip, gw = "") => ({ ip, mask: "255.255.255.0", gw });

test("IPv4 helpers", () => {
  assert.equal(M.ipNum("10.0.0.1"), 167772161);
  assert.equal(M.ipNum("10.0.0.256"), null);
  assert.equal(M.prefixOf("255.255.255.0"), 24);
  assert.equal(M.prefixOf("255.255.0.255"), null, "masks must be contiguous");
  assert.equal(M.network("10.1.2.3", "255.255.255.192"), "10.1.2.0/26");
  assert.ok(M.sameNet("10.0.0.5", "10.0.0.200", "255.255.255.0"));
  assert.ok(!M.hostOk("10.0.0.0", "255.255.255.0") && !M.hostOk("10.0.0.255", "255.255.255.0") && M.hostOk("10.0.0.1", "255.255.255.0"));
});

test("a flat network: one switch, everything in VLAN 1, one segment", () => {
  const t = net({ switches: ["S1"], pcs: { PC1: pc("10.0.0.11"), PC2: pc("10.0.0.12") }, links: [["PC1", "NIC", "S1", "Fa0/1"], ["PC2", "NIC", "S1", "Fa0/2"]] });
  const s = M.segments(t);
  assert.equal(s.segments.length, 1);
  assert.deepEqual(s.segments[0].hosts.sort(), ["PC1", "PC2"]);
  assert.equal(s.segments[0].name, "VLAN 1");
  assert.equal(M.ping(t, "PC1", "10.0.0.12").result, "ok");
  assert.equal(M.ping(t, "PC1", "10.0.0.99").result, "host", "nobody has that address: ARP fails");
  assert.equal(M.ping(t, "PC1", "10.0.9.9").result, "general", "off-subnet with no gateway");
});

test("VLANs split one switch into separate broadcast domains", () => {
  const t = net({ switches: ["S1"], pcs: { PC1: pc("10.0.0.11"), PC2: pc("10.0.0.12") }, links: [["PC1", "NIC", "S1", "Fa0/1"], ["PC2", "NIC", "S1", "Fa0/2"]] });
  vlans(t, "S1", { 10: "Staff", 20: "Students" });
  port(t, "S1", "Fa0/1", { mode: "access", access: 10 });
  port(t, "S1", "Fa0/2", { mode: "access", access: 20 });
  const s = M.segments(t);
  assert.deepEqual(s.segments.map(x => x.name).sort(), ["VLAN 10 (Staff)", "VLAN 20 (Students)"]);
  const r = M.ping(t, "PC1", "10.0.0.12");
  assert.equal(r.result, "host");
  assert.match(r.reason, /PC2 has 10\.0\.0\.12, but it's in VLAN 20 \(Students\)/);
  assert.ok(M.issues(t).some(i => /VLAN 10/.test(i.text)) === false, "same subnet in two VLANs isn't flagged as one segment holding two subnets");
});

test("two switches: VLAN 10 only crosses once the uplink trunks (DTP)", () => {
  const t = net({ switches: ["S1", "S2"], pcs: { PC1: pc("10.0.10.11"), PC2: pc("10.0.10.12") }, links: [["S1", "Gi0/1", "S2", "Gi0/1"], ["PC1", "NIC", "S1", "Fa0/1"], ["PC2", "NIC", "S2", "Fa0/1"]] });
  for (const s of ["S1", "S2"]) { vlans(t, s, { 10: "Staff" }); port(t, s, "Fa0/1", { mode: "access", access: 10 }); }
  const uplink = t.links[0];
  assert.equal(M.opMode(t, "S1", "Gi0/1"), "access", "two dynamic auto ends don't trunk");
  assert.notEqual(M.segmentOf(t, "PC1"), M.segmentOf(t, "PC2"));
  assert.equal(M.ping(t, "PC1", "10.0.10.12").result, "host");
  port(t, "S1", "Gi0/1", { mode: "trunk" });
  const s = M.segments(t);
  assert.equal(M.opMode(t, "S2", "Gi0/1"), "trunk");
  assert.equal(M.segmentOf(t, "PC1", s), M.segmentOf(t, "PC2", s));
  assert.equal(M.carried(t, uplink, s).length, 2, "the trunk carries VLAN 1 and VLAN 10");
  assert.equal(M.ping(t, "PC1", "10.0.10.12").result, "ok");
  port(t, "S1", "Gi0/1", { allowed: [1] });
  assert.equal(M.ping(t, "PC1", "10.0.10.12").result, "host", "pruned from the trunk");
});

test("native VLAN mismatch joins two VLANs into one domain, and is flagged", () => {
  const t = net({ switches: ["S1", "S2"], pcs: { PC1: pc("10.0.0.11"), PC2: pc("10.0.0.12") }, links: [["S1", "Gi0/1", "S2", "Gi0/1"], ["PC1", "NIC", "S1", "Fa0/1"], ["PC2", "NIC", "S2", "Fa0/1"]] });
  vlans(t, "S1", { 99: "Native" });
  port(t, "S1", "Gi0/1", { mode: "trunk", native: 99 });
  port(t, "S2", "Gi0/1", { mode: "trunk" });
  port(t, "S1", "Fa0/1", { mode: "access", access: 99 });
  assert.equal(M.ping(t, "PC1", "10.0.0.12").result, "ok", "VLAN 99 on S1 lands in VLAN 1 on S2");
  const texts = M.issues(t).map(i => i.text).join("\n");
  assert.match(texts, /Native VLAN mismatch on S1 Gi0\/1 \(99\) and S2 Gi0\/1 \(1\)/);
  assert.match(texts, /One broadcast domain spans VLAN 1 and VLAN 99/);
});

test("inter-VLAN routing: router on a stick, gateways, and each way it can fail", () => {
  const t = net({
    switches: ["S1"],
    pcs: { PC1: pc("10.0.10.11", "10.0.10.1"), PC2: pc("10.0.20.12", "10.0.20.1") },
    routers: { R1: { "G0/0": [{ tag: 10, ip: "10.0.10.1", mask: "255.255.255.0" }, { tag: 20, ip: "10.0.20.1", mask: "255.255.255.0" }] } },
    links: [["R1", "G0/0", "S1", "Gi0/1"], ["PC1", "NIC", "S1", "Fa0/1"], ["PC2", "NIC", "S1", "Fa0/2"]],
  });
  vlans(t, "S1", { 10: "Staff", 20: "Students" });
  port(t, "S1", "Fa0/1", { mode: "access", access: 10 });
  port(t, "S1", "Fa0/2", { mode: "access", access: 20 });
  assert.equal(M.ping(t, "PC1", "10.0.20.12").result, "host", "the switch port to the router isn't a trunk yet: tagged frames are dropped");
  port(t, "S1", "Gi0/1", { mode: "trunk" });
  const ok = M.ping(t, "PC1", "10.0.20.12");
  assert.equal(ok.result, "ok");
  assert.match(ok.reason, /Routed: PC1 → gateway R1/);
  assert.deepEqual(M.route(t, "PC1", "R1"), ["PC1", "S1", "R1"]);
  assert.equal(M.ping(t, "PC1", "10.0.10.1").result, "ok", "the gateway itself answers");
  t.devices.PC2.gw = "";
  assert.equal(M.ping(t, "PC1", "10.0.20.12").result, "timeout", "PC2 can't send the reply back");
  t.devices.PC2.gw = "10.0.20.1";
  assert.equal(M.ping(t, "PC1", "10.0.30.5").result, "net", "the router has no route to 10.0.30.0/24");
  assert.equal(M.ping(t, "PC1", "10.0.30.5").reply, "10.0.10.1", "Destination net unreachable comes from the gateway");
  t.devices.PC1.gw = "10.0.20.1";
  assert.equal(M.ping(t, "PC1", "10.0.20.12").result, "general", "gateway not on PC1's network");
  assert.ok(M.issues(t).some(i => /PC1: its gateway 10\.0\.20\.1 isn't on its own network/.test(i.text)));
});

test("issues: duplicates, bad addresses, unplugged PCs, inactive VLANs", () => {
  const t = net({ switches: ["S1"], pcs: { PC1: pc("10.0.0.11"), PC2: pc("10.0.0.11"), PC3: pc("10.0.0.255"), PC4: pc("10.0.0.14") }, links: [["PC1", "NIC", "S1", "Fa0/1"], ["PC2", "NIC", "S1", "Fa0/2"], ["PC3", "NIC", "S1", "Fa0/3"]] });
  port(t, "S1", "Fa0/3", { mode: "access", access: 40 });
  const texts = M.issues(t).map(i => i.text).join("\n");
  assert.match(texts, /10\.0\.0\.11 is used by PC1 and PC2: duplicate address/);
  assert.match(texts, /PC3: 10\.0\.0\.255 is the network or broadcast address/);
  assert.match(texts, /PC4 isn't connected to anything/);
  assert.match(texts, /S1 Fa0\/3 is in VLAN 40, which doesn't exist on S1/);
  assert.equal(M.ping(t, "PC4", "10.0.0.11").result, "general", "no cable");
});

test("connect picks sensible ports, refuses impossible links, and remove cleans up", () => {
  const t = net({ switches: ["S1", "S2"], pcs: { PC1: pc("10.0.0.1") } });
  assert.deepEqual(M.connect(t, "S1", "S2").link, { a: ["S1", "Gi0/1"], b: ["S2", "Gi0/1"] }, "switches link on gigabit uplinks");
  assert.deepEqual(M.connect(t, "PC1", "S1").link, { a: ["PC1", "NIC"], b: ["S1", "Fa0/1"] });
  assert.match(M.connect(t, "PC1", "S2").error, /PC1 has no free port/);
  assert.match(M.connect(t, "S1", "S1").error, /itself/);
  assert.equal(M.nextId(t, "PC"), "PC2");
  M.removeDevice(t, "S1");
  assert.equal(t.links.length, 0);
});
