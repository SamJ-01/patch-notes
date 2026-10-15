// Tests for the lesson "See it" diagrams (static/js/flow.js) and their content.
// Run with:  node --test tests/flow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as flow from "../static/js/flow.js";

const lessons = JSON.parse(readFileSync(new URL("../content/lessons.json", import.meta.url), "utf8"));
const diagrams = lessons.filter(l => l.diagram);

test("every lesson diagram is valid", () => {
  assert.ok(diagrams.length >= 8);
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
  const d = diagrams.find(l => l.id === "web-sqli").diagram;
  const s = flow.describe(d, 1);
  assert.equal(s.who, "Website → Database");
  assert.match(s.msg, /OR '1'='1'/);
  assert.ok(s.stop.includes("Parameterised"));
});

test("questions pointing at the diagram are answered by it", () => {
  for (const l of lessons) for (const c of l.checks) if (c.see === "diagram") assert.ok(l.diagram, l.id);
});
