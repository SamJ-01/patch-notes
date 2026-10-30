// Patch, the site guide (static/js/patch.js): the SVG builder is pure, so check every pose is well formed
// and carries the brand's own parts. Run with:  node --test tests/patch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PATCH } from "../static/js/patch.js";

const poses = ["idle", "happy", "think", "point", "talk"];

test("Patch: every pose returns one labelled svg built from the brand parts", () => {
  for (const p of poses) {
    const s = PATCH.svg(p, { id: "t" });
    assert.match(s, /^<svg[\s\S]*<\/svg>\s*$/, p);
    assert.equal((s.match(/<svg/g) || []).length, 1, `${p}: one svg`);
    assert.equal((s.match(/<svg/g) || []).length, (s.match(/<\/svg>/g) || []).length, `${p}: balanced`);
    assert.match(s, /aria-label="Patch/, `${p}: labelled`);
    assert.match(s, /pn-caret/, `${p}: caret eye`);     // the blinking terminal caret
    assert.match(s, /pn-ant/, `${p}: // antenna`);       // the wordmark's double slash
    assert.match(s, /pn-plate/, `${p}: + patch plate`);  // the changelog mark on the chest
  }
});

test("Patch: live flag toggles the bob/blink class and ids are namespaced", () => {
  assert.match(PATCH.svg("idle", { live: true, id: "a" }), /class="patch pn-live"/);
  assert.doesNotMatch(PATCH.svg("idle", { live: false, id: "b" }), /pn-live/);
  // Two Patches on one page must not share a gradient id.
  assert.match(PATCH.svg("idle", { id: "xyz" }), /id="xyz-sheen"/);
  assert.match(PATCH.svg("idle", { id: "xyz" }), /url\(#xyz-sheen\)/);
});

test("Patch: point raises the arm, happy uses arc eyes, idle does not", () => {
  assert.match(PATCH.svg("point"), /pn-live-arm/);
  assert.match(PATCH.svg("happy"), /pn-arc/);
  assert.doesNotMatch(PATCH.svg("idle"), /pn-arc/);
});
