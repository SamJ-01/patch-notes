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

test("risk matrix: scores and bands, and the risk lesson's heat map is consistent", () => {
  assert.equal(concept.riskScore(4, 5), 20);
  assert.deepEqual([1, 4, 5, 9, 10, 16, 20, 25].map(n => concept.riskBand(n).key), ["low", "low", "medium", "medium", "high", "high", "critical", "critical"]);
  assert.match(concept.validate({ type: "matrix", items: [{ label: "a", text: "x", l: 6, i: 1 }, { label: "b", text: "y", l: 1, i: 1 }] }).join(), /1 to 5/);
  assert.match(concept.validate({ type: "matrix", appetite: 30, items: [{ label: "a", text: "x", l: 1, i: 1 }, { label: "b", text: "y", l: 1, i: 1 }] }).join(), /appetite/);
  const risk = lessons.find(l => l.id === "risk").concept;
  assert.equal(risk.type, "matrix");
  const over = risk.items.filter(it => concept.riskScore(it.l, it.i) >= risk.appetite);
  assert.ok(over.length && over.length < risk.items.length, "some risks over the appetite and some within it");
  for (const it of over) assert.match(it.treat, /^(Mitigate|Avoid|Transfer)/, `${it.label} is over the appetite, so it can't just be accepted`);
});

test("photo scenes: hotspots in percent, a real webp with its size and alt text", () => {
  const ok = { type: "scene", title: "t", image: { src: "img/scenes/x.webp", width: 1536, height: 1024, alt: "A counter" },
    items: [{ label: "a", text: "x", at: [10, 20], tone: "c" }, { label: "b", text: "y", at: [90, 80] }] };
  assert.deepEqual(concept.validate(ok), []);
  assert.match(concept.validate({ ...ok, items: [{ label: "a", text: "x", at: [120, 20] }, ok.items[1]] }).join(), /percent/);
  assert.match(concept.validate({ ...ok, items: [{ label: "a", text: "x", at: [1, 2], tone: "pink" }, ok.items[1]] }).join(), /tone/);
  assert.match(concept.validate({ ...ok, image: { src: "https://evil.example/x.webp", width: 1, height: 1, alt: "a" } }).join(), /img\//);
  assert.match(concept.validate({ ...ok, image: { ...ok.image, alt: "" } }).join(), /alt/);
  assert.match(concept.validate({ ...ok, items: [ok.items[0]] }).join(), /2–8 hotspots/);
});

test("lesson photo scenes (the 'scene' field beside a diagram) are valid scenes", () => {
  const withScene = lessons.filter(l => l.scene);
  assert.ok(withScene.length >= 3);
  for (const l of withScene) {
    assert.equal(l.scene.type, "scene", l.id);
    assert.deepEqual(concept.validate(l.scene), [], l.id);
    assert.ok(!l.diagram && !l.explainer, `${l.id}: a scene sits beside a concept, never a second picture beside a diagram`);
  }
});
