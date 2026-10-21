// Tests for the network builder (static/js/labs/netbuilder.js): loading networks safely, the starting
// networks, and the goals.
// Run with:  node --test tests/netbuilder.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expand, GOALS, LIMIT, W, H } from "../static/js/labs/netbuilder.js";
import { createCli } from "../static/js/labs/vlan.js";
import * as M from "../static/js/net/model.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "network-builder");
const scenario = id => expand(lab.scenarios.find(s => s.id === id).network);

test("every starting network loads whole: no device, link or position dropped", () => {
  for (const s of lab.scenarios) {
    const { topo, layout } = expand(s.network);
    assert.equal(Object.keys(topo.devices).length, Object.keys(s.network.devices).length, s.id);
    assert.equal(topo.links.length, s.network.links.length, s.id);
    for (const id of Object.keys(topo.devices)) assert.deepEqual(layout[id], s.network.layout[id], `${s.id} ${id}`);
    assert.ok(s.about && s.label);
  }
});

test("saved networks are untrusted: junk, markup and impossible values are dropped or clamped", () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { topo, layout } = expand({
    devices: {
      PC1: { kind: "pc", ip: evil, mask: 5, gw: ["x"] },
      [evil]: { kind: "pc" }, X9: { kind: "pc" }, S1: { kind: "switch", vlans: { 10: evil.repeat(3), 1002: "fddi", 5000: "big", 1: "renamed" }, ports: { "Fa0/1": { mode: "bogus", access: 99999, allowed: [10, "x", -1], shutdown: "yes" }, "Fa9/9": {} } },
      R1: { kind: "router", ports: { "G0/0": { subs: Array(20).fill({ tag: "ten", ip: "10.0.0.1" }) }, "G9": { subs: [] } } },
      S2: { kind: "laptop" },
    },
    links: [{ a: ["PC1", "NIC"], b: ["S1", "Fa0/1"] }, { a: ["PC1", "NIC"], b: ["S1", "Fa0/2"] }, { a: ["S1", "Fa0/3"], b: ["Nope", "NIC"] }, { a: ["S1", "Fa0/4"], b: ["S1", "Fa0/5"] }, "junk"],
    layout: { PC1: [-500, 99999], S1: "x" },
  });
  assert.deepEqual(Object.keys(topo.devices).sort(), ["PC1", "R1", "S1"], "unknown kinds and odd names dropped");
  assert.equal(topo.devices.PC1.ip.length <= 15, true);
  assert.equal(topo.devices.PC1.mask, "255.255.255.0");
  assert.equal(topo.devices.PC1.gw, "");
  assert.equal(topo.devices.S1.vlans[10].length, 32, "VLAN names are capped at 32 characters, as in IOS");
  assert.deepEqual(Object.keys(topo.devices.S1.vlans).sort(), ["1", "10"]);
  assert.equal(topo.devices.S1.vlans[1], "default");
  assert.deepEqual(topo.devices.S1.ports["Fa0/1"], { ...M.freshPort(), allowed: [10] });
  assert.equal(topo.devices.R1.ports["G0/0"].subs.length, LIMIT.subs);
  assert.equal(topo.devices.R1.ports["G0/0"].subs[0].tag, null);
  assert.equal(topo.links.length, 1, "one good link; a port can't be used twice; no links to missing devices or to itself");
  assert.deepEqual(layout.PC1, [50, H - 45], "positions are kept on the canvas");
  assert.deepEqual(layout.S1, [W / 2, H / 2]);
  assert.deepEqual(expand(null).topo, { devices: {}, links: [] });
  assert.deepEqual(expand({ devices: [] }).topo, { devices: {}, links: [] });
});

test("starter: two PCs on one switch ping each other straight away", () => {
  const { topo } = scenario("starter"), cli = createCli(topo);
  assert.match(cli.exec("PC1", "ping 192.168.1.20").out, /Reply from 192\.168\.1\.20/);
  assert.ok(GOALS.ping(topo, cli.pings));
  assert.ok(!GOALS.split(topo));
  topo.devices.S1.vlans[10] = "Lab";
  topo.devices.S1.ports["Fa0/2"] = { ...topo.devices.S1.ports["Fa0/2"], mode: "access", access: 10 };
  assert.ok(GOALS.split(topo), "two PCs on one switch in different VLANs");
});

test("college: each VLAN is cut in two until the uplinks trunk", () => {
  const { topo } = scenario("college");
  assert.notEqual(M.segmentOf(topo, "PC1"), M.segmentOf(topo, "PC4"));
  assert.ok(!GOALS.trunk(topo));
  const cli = createCli(topo);
  for (const l of ["enable", "conf t", "int range gi0/1 - 2", "switchport mode trunk", "end"]) cli.exec("S1", l);
  assert.equal(M.segmentOf(topo, "PC1"), M.segmentOf(topo, "PC4"));
  assert.ok(GOALS.trunk(topo));
  assert.match(cli.exec("PC1", "ping 10.10.10.14").out, /Reply from/);
});

test("router: the PCs can't reach their gateways until the router's switch port trunks, then they route", () => {
  const { topo } = scenario("router"), cli = createCli(topo);
  assert.match(cli.exec("PC1", "ping 10.0.20.12").out, /Destination host unreachable/);
  topo.devices.S1.ports["Gi0/1"].mode = "trunk";
  const out = cli.exec("PC1", "ping 10.0.20.12");
  assert.match(out.out, /Reply from 10\.0\.20\.12/);
  assert.match(out.ping.reason, /^Routed/);
  cli.pings.at(-1).routed = true;  // the page marks routed pings from the result's reason
  assert.ok(GOALS.route(topo, cli.pings));
  assert.match(cli.exec("PC1", "ping 10.0.10.1").out, /TTL=255/, "a router answers with its own TTL");
});

test("lab content is consistent", () => {
  assert.deepEqual(lab.goals.map(g => g.id).sort(), Object.keys(GOALS).sort());
  for (const g of lab.goals) assert.ok(g.text && g.why);
  assert.equal(lab.scenarios[0].id, "starter", "first visit starts with something to see");
  assert.ok(!JSON.stringify(lab).includes("—"), "no em dashes");
});
