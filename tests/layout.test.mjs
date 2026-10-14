// Mission Layout tests: cable routes, text wrapping, card geometry and speech-bubble placement.
// Every mission's layouts are checked so a new scenario can't ship with clashing cards.
// Run with:  node --test tests/layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as layout from "../static/js/missions/layout.js";

const dir = new URL("../content/missions/", import.meta.url);
const missions = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const dhcp = missions.find(m => m.id === "dhcp");

// A deliberately generous text-width estimate (real 12px text averages about 6px a character), so
// a layout that passes here has room to spare in the browser.
const width = t => t.length * 7;
const rect = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });
const hit = (a, b) => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t);

test("cables go across then down for wide gaps, down then across for tall ones", () => {
  assert.deepEqual(layout.route({ x: 0, y: 0 }, { x: 100, y: 0 }), [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  assert.deepEqual(layout.route({ x: 0, y: 0 }, { x: 200, y: 50 }), [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 50 }]);
  assert.deepEqual(layout.route({ x: 0, y: 0 }, { x: 50, y: 200 }), [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 100 }, { x: 50, y: 200 }]);
  const d = layout.roundedPath(layout.route({ x: 0, y: 0 }, { x: 200, y: 50 }));
  assert.ok(d.startsWith("M0,0") && d.endsWith("L200,50"), d);
});

test("packets stop just outside the card they're heading for", () => {
  const card = { x: 100, y: 100, w: 80, h: 60 };
  const fromAbove = layout.arrivalRoute([{ x: 140, y: 0 }, { x: 140, y: 130 }], card);
  assert.ok(fromAbove.at(-1).y < card.y - 13, "stops above the card's top edge");
  const fromLeft = layout.arrivalRoute([{ x: 0, y: 130 }, { x: 140, y: 130 }], card);
  assert.ok(fromLeft.at(-1).x < card.x - 50, "stops left of the card's left edge");
});

test("text wraps at word boundaries and ends with an ellipsis past the line limit", () => {
  assert.deepEqual(layout.wrapLines("Lease granted for 24 hours", 100, width), ["Lease granted", "for 24 hours"]);
  assert.deepEqual(layout.wrapLines("", 100, width), []);
  const cut = layout.wrapLines("one two three four five six seven", 40, width, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith("…"));
  assert.ok(cut.every(l => width(l) <= 40 || !l.includes(" ")), "no line is wider than allowed");
});

test("status texts include every status a device can reach", () => {
  const pc = layout.statusTexts(dhcp, "pc");
  for (const s of ["No address yet", "Self-assigned address", "Lease granted for 24 hours", "Fixed address, set by hand"]) assert.ok(pc.includes(s), s);
  assert.equal(layout.hasStatus(dhcp, "switch"), false);
  assert.equal(layout.hasStatus(dhcp, "server"), true);
});

test("a bubble goes above its speaker when there's room", () => {
  const spot = layout.placeBubble({ w: 100, h: 40 }, rect(200, 200, 100, 80), [], { width: 600, height: 600 });
  assert.equal(spot.side, "above");
  assert.ok(spot.y + 40 <= 200 - 12, "clear of the speaker");
  assert.ok(spot.clear);
});

test("a bubble goes below when the top of the stage is too close", () => {
  const spot = layout.placeBubble({ w: 100, h: 40 }, rect(200, 10, 100, 80), [], { width: 600, height: 600 });
  assert.equal(spot.side, "below");
});

test("a bubble steps around other cards and bubbles", () => {
  const speaker = rect(200, 200, 100, 80);
  const above = rect(150, 100, 200, 90), below = rect(150, 290, 200, 90);
  const spot = layout.placeBubble({ w: 100, h: 40 }, speaker, [speaker, above, below], { width: 600, height: 600 });
  assert.equal(spot.side, "right");
  assert.ok(spot.clear);
  const placed = rect(spot.x, spot.y, 100, 40);
  for (const o of [speaker, above, below]) assert.ok(!hit(placed, o), "no overlap");
});

test("a bubble never leaves the stage, even when no spot is free", () => {
  const speaker = rect(0, 0, 600, 600);
  const spot = layout.placeBubble({ w: 100, h: 40 }, speaker, [speaker], { width: 600, height: 600 });
  assert.equal(spot.clear, false);
  assert.ok(spot.x >= 0 && spot.y >= 0 && spot.x + 100 <= 600 && spot.y + 40 <= 600);
});

for (const m of missions) {
  for (const narrow of [false, true]) {
    const L = layout.chooseLayout(m, narrow);
    test(`${m.id} (${narrow ? "narrow" : "wide"}): cards fit the stage and keep their distance`, () => {
      const geo = layout.cardGeometry(m, L, width);
      const cards = Object.entries(geo);
      for (const [id, g] of cards) {
        assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= L.w && g.y + g.h <= L.h, `${id} is inside the stage`);
      }
      // At least 24 units between cards, so cables and packets have room to pass.
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const [a, ga] = cards[i], [b, gb] = cards[j];
        const ra = rect(ga.x - 12, ga.y - 12, ga.w + 24, ga.h + 24);
        assert.ok(!hit(ra, rect(gb.x, gb.y, gb.w, gb.h)), `${a} and ${b} are at least 24 apart`);
      }
    });
  }
}
