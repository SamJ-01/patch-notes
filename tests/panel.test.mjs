// The switch front panel (static/js/net/panel.js): each port's state comes from the same network model as the diagram.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { portStates, label, svg } from "../static/js/net/panel.js";
import { createNet } from "../static/js/labs/vlan.js";

const L = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url))), lab = (L.labs || L).find(l => l.id === "vlans");
const run = (net, dev, cmds) => cmds.forEach(c => net.exec(dev, c));

test("out of the box: cabled ports are lit in one domain, empty ports are dark", () => {
  const net = createNet(lab), s2 = portStates(net.topo, "S2");
  assert.equal(s2.length, 26);
  const fa11 = s2.find(p => p.name === "Fa0/11"), fa1 = s2.find(p => p.name === "Fa0/1");
  assert.equal(fa11.peer, "PC1"); assert.equal(fa11.mode, "access"); assert.equal(fa11.vlan, 1); assert.equal(fa11.segs.length, 1);
  assert.equal(fa1.peer, null); assert.deepEqual(fa1.segs, []);
  assert.equal(label(fa11), "Fa0/11: PC1, access VLAN 1"); assert.equal(label(fa1), "Fa0/1: empty");
});
test("putting a port in a new VLAN moves it to another domain (another colour)", () => {
  const net = createNet(lab);
  const before = portStates(net.topo, "S2").find(p => p.name === "Fa0/11").segs[0];
  run(net, "S2", ["enable", "conf t", "vlan 10", "name Staff", "exit", "int fa0/11", "switchport mode access", "switchport access vlan 10", "end"]);
  const st = portStates(net.topo, "S2"), fa11 = st.find(p => p.name === "Fa0/11"), fa18 = st.find(p => p.name === "Fa0/18");
  assert.equal(fa11.vlan, 10); assert.notEqual(fa11.segs[0], before); assert.notEqual(fa11.segs[0], fa18.segs[0]);
  assert.match(label(fa11), /access VLAN 10/);
});
test("a trunk carries every VLAN on both switches, and its light shows each one", () => {
  const net = createNet(lab);
  for (const sw of ["S1", "S2"]) run(net, sw, ["enable", "conf t", "vlan 10", "vlan 20", "exit", "int gi0/1", "switchport mode trunk", "end"]);
  run(net, "S2", ["conf t", "int fa0/11", "sw mode acc", "sw acc vlan 10", "int fa0/18", "sw mode acc", "sw acc vlan 20", "end"]);
  const up = portStates(net.topo, "S2").find(p => p.name === "Gi0/1");
  assert.equal(up.mode, "trunk"); assert.equal(up.peer, "S1 Gi0/1"); assert.ok(up.segs.length >= 2);
  assert.match(svg(net.topo, "S2"), /class="sp-led trunk"/);
});
test("the drawing names every cabled port for screen readers, and has no brand", () => {
  const net = createNet(lab), out = svg(net.topo, "S3");
  for (const p of portStates(net.topo, "S3").filter(p => p.peer)) assert.ok(out.includes(label(p)), p.name);
  assert.doesNotMatch(out, /cisco|catalyst|netgear|juniper/i);
});

test("the photo skin puts all 26 ports inside the photo, one per jack, none overlapping", async () => {
  const { photoPorts, PHOTO, photoSvg } = await import("../static/js/net/panel.js");
  const at = photoPorts(), names = Object.keys(at), [bx, by, bw, bh] = PHOTO.box;
  assert.equal(names.length, 26);
  for (const [x0, y0, x1, y1] of Object.values(at)) assert.ok(x0 >= bx && x1 <= bx + bw && y0 >= by && y1 <= by + bh && x1 > x0 && y1 > y0);
  const rects = Object.values(at);
  rects.forEach((a, i) => rects.slice(i + 1).forEach(b => assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], "overlap")));
  assert.deepEqual(at["Fa0/1"].slice(0, 2), [534, 285]); assert.deepEqual(at["Fa0/2"].slice(0, 2), [534, 360]);
  const net = createNet(lab), out = photoSvg(net.topo, "S2");
  assert.match(out, /img\/kit\/switch-24\.webp/); assert.equal((out.match(/class="pp-plug"/g) || []).length, portStates(net.topo, "S2").filter(p => p.peer).length);
});
