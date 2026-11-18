// Tests for the lesson "See it" diagrams (static/js/flow.js) and their content.
// Run with:  node --test tests/flow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as flow from "../static/js/flow.js";

const lessons = JSON.parse(readFileSync(new URL("../content/lessons.json", import.meta.url), "utf8"));
const diagrams = lessons.filter(l => l.diagram);

test("every lesson diagram is valid", () => {
  assert.ok(diagrams.length >= 5);  // ransomware moved to its own explainer (17 Nov)
  for (const l of diagrams) assert.deepEqual(flow.validate(l.diagram), [], l.id);
});

test("validate catches broken diagrams", () => {
  const ok = { title: "t", nodes: [{ id: "a", kind: "pc", label: "A" }, { id: "b", kind: "server", label: "B" }], steps: [{ from: "a", to: "b", msg: "m", text: "t" }] };
  assert.deepEqual(flow.validate(ok), []);
  assert.match(flow.validate({ ...ok, nodes: [...ok.nodes, { id: "c", kind: "toaster", label: "C" }] }).join(), /no drawing for kind "toaster"/);
  assert.match(flow.validate({ ...ok, steps: [{ from: "a", to: "z", msg: "m", text: "t" }] }).join(), /unknown node/);
  assert.match(flow.validate({ ...ok, steps: [{ from: "a", to: "a", msg: "m", text: "t" }] }).join(), /same/);
  assert.match(flow.validate({ ...ok, steps: [] }).join(), /no steps/);
});

test("describe names both ends of each step", () => {
  const d = {
    nodes: [{ id: "w", kind: "server", label: "Website" }, { id: "d", kind: "db", label: "Database" }],
    steps: [{ from: "w", to: "d", msg: "SELECT OR '1'='1", text: "The site pastes the input in.", stop: "Parameterised queries keep input as data." }],
  };
  const s = flow.describe(d, 0);
  assert.equal(s.who, "Website → Database");
  assert.ok(s.msg.includes("1'='1"));
  assert.ok(s.stop.includes("Parameterised"));
});

test("the MFA diagram shows the login and the phone, not just a moving dot", () => {
  const d = diagrams.find(l => l.id === "identity").diagram;
  assert.equal(d.scene, "screens");
  assert.equal(d.steps.at(-1).screens.a.line, "Access denied");
  assert.equal(d.steps[1].screens.p.tone, "ask");
});

test("the MFA diagram follows the owner's choice: Approve lets the attacker in, Deny or no choice keeps them out", () => {
  const d = diagrams.find(l => l.id === "identity").diagram;
  assert.deepEqual(flow.validate(d), []);
  const end = choice => flow.phonePath(d, choice).at(-1).screens;
  assert.equal(end("approve").a.line, "Signed in", "approving the prompt ends with the attacker signed in");
  assert.equal(end("approve").l.line, "Session created");
  assert.equal(end("deny").a.line, "Access denied");
  assert.equal(end(null).a.line, "Access denied", "pressing Next without choosing follows the owner refusing");
  const k = flow.askIndex(d), approved = flow.phonePath(d, "approve");
  assert.deepEqual(approved.slice(0, k + 1), d.steps.slice(0, k + 1), "both stories are the same up to the prompt");
  assert.ok(approved.slice(k + 1).every(s => s.tone === "bad"), "the approve ending is the bad path");
  assert.ok(approved.slice(k + 1).some(s => /number matching/i.test(s.stop)), "and says what stops MFA fatigue");
  assert.ok(flow.validate({ ...d, scene: "stage" }).some(e => /approved branch/.test(e)), "an approve branch needs a phone prompt");
});

test("questions pointing at the diagram are answered by it", () => {
  for (const l of lessons) for (const c of l.checks) if (c.see === "diagram") assert.ok(l.diagram, l.id);
});

test("route: the packet stops where each step's caption says it goes, with addresses that fit", () => {
  const route = { title: "t", scene: "route", nodes: [{ id: "a", kind: "pc", label: "A" }, { id: "b", kind: "router", label: "B" }],
    steps: [{ from: "a", to: "b", msg: "m", text: "t", packet: { from: "x", to: "y", at: 0 } }] };
  assert.match(flow.validate(route).join(), /should be at "b"/, "a step a→b with the packet still at a is caught (18 Nov)");
  const net = diagrams.find(l => l.id === "networking").diagram;
  const ix = Object.fromEntries(net.nodes.map((n, k) => [n.id, k]));
  for (const s of net.steps) assert.equal(s.packet.at, ix[s.to]);
  // The gateway is on the PC's own subnet, and the packet stays addressed to the website on the way out (only the
  // frame goes to the router), so "To" is never the router.
  const out = net.steps.filter(s => !s.packet.back);
  assert.ok(out.every(s => s.packet.to === "203.0.113.10"), "outbound packets are addressed to the website");
  assert.ok(net.steps.filter(s => s.packet.via).every(s => /10\.0\.0\.\d+/.test(s.packet.via)), "the next hop is on 10.0.0.0/24");
});
