// Tests for the lesson concept diagrams (static/js/concept.js) and their content.
// Run with:  node --test tests/concept.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as concept from "../static/js/concept.js";

const lessons = JSON.parse(readFileSync(new URL("../content/lessons.json", import.meta.url), "utf8"));
const withConcept = lessons.filter(l => l.concept);

test("every lesson concept is valid", () => {
  assert.ok(withConcept.length >= 12);
  for (const l of withConcept) assert.deepEqual(concept.validate(l.concept), [], l.id);
});

test("a lesson has a flow diagram or a concept, never both", () => {
  for (const l of lessons) assert.ok(!(l.diagram && l.concept), l.id);
});

test("every concept icon exists in the icon set", () => {
  for (const l of withConcept)
    for (const it of l.concept.items)
      if (it.icon) assert.ok(it.icon in concept.ICONS, `${l.id}: ${it.icon}`);
});

test("validate catches broken concepts", () => {
  assert.match(concept.validate({ type: "triad", items: [] }).join(), /exactly 3/);
  assert.match(concept.validate({ type: "cycle", items: [{ label: "a" }, { label: "b" }] }).join(), /3–7/);
  assert.match(concept.validate({ type: "cards", items: [{ label: "a", text: "x" }] }).join(), /2–8/);
  assert.match(concept.validate({ type: "wobble", items: [] }).join(), /unknown type/);
  assert.match(concept.validate({ type: "cards", items: [{ text: "x" }, { label: "b", text: "y" }] }).join(), /missing label/);
  assert.match(concept.validate({ type: "cards", items: [{ label: "a", text: "x", icon: "nope" }, { label: "b", text: "y" }] }).join(), /no icon/);
  assert.match(concept.validate({ type: "triad", items: [{ label: "a" }, { label: "b" }, { label: "c" }] }).join(), /needs text/);
  assert.deepEqual(concept.validate({ type: "triad", items: [{ label: "a", text: "1" }, { label: "b", text: "2" }, { label: "c", text: "3" }] }), []);
});
