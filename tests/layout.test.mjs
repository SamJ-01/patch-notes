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

// ---------- the "room" scene: cables on the floor
test("a floor cable starts and ends exactly at its two plugs and never doubles back", () => {
  for (const [p, q] of [[{ x: 110, y: 300 }, { x: 380, y: 290 }], [{ x: 380, y: 290 }, { x: 650, y: 150 }], [{ x: 190, y: 120 }, { x: 190, y: 400 }], [{ x: 190, y: 400 }, { x: 94, y: 660 }]]) {
    const pts = layout.curveRoute(p, q);
    assert.deepEqual(pts[0], p);
    assert.ok(Math.abs(pts.at(-1).x - q.x) < 1e-9 && Math.abs(pts.at(-1).y - q.y) < 1e-9);
    const main = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y) ? "x" : "y", dir = Math.sign(q[main] - p[main]);
    for (let i = 1; i < pts.length; i++) assert.ok((pts[i][main] - pts[i - 1][main]) * dir >= -1e-9, "the cable keeps heading for the other device");
  }
});

test("a cable to a device straight below leaves sideways, clear of the labels under the first device", () => {
  const pts = layout.curveRoute({ x: 190, y: 120 }, { x: 190, y: 400 });
  const besideLabels = pts.filter(p => p.y > 135 && p.y < 230);  // where the name, IP and status are printed
  assert.ok(besideLabels.length && besideLabels.every(p => p.x > 190 + 60), "the cable is well to the side while it passes the labels");
});

test("a cable to a device straight above is the same curve walked backwards, so it clears the upper labels too", () => {
  const down = layout.curveRoute({ x: 110, y: 150 }, { x: 110, y: 420 }), up = layout.curveRoute({ x: 110, y: 420 }, { x: 110, y: 150 });
  assert.deepEqual(up, [...down].reverse());
  assert.deepEqual(up[0], { x: 110, y: 420 });
});

test("a cable in one column can be told which way to swing and how far", () => {
  const p = { x: 286, y: 170 }, q = { x: 286, y: 640 };
  const left = layout.curveRoute(p, q, 24, { side: -1, reach: 80 });
  assert.ok(left.every(pt => pt.x <= 286 + 1e-9), "swings left only");
  assert.ok(Math.min(...left.map(pt => pt.x)) >= 286 - 80 - 1, "and no further than its reach");
  assert.ok(Math.max(...layout.curveRoute(p, q).map(pt => pt.x)) > 286 + 100, "unconstrained, it swings right and wide");
});

test("a shortened route stops part-way along and keeps the same start", () => {
  const pts = layout.curveRoute({ x: 0, y: 0 }, { x: 200, y: 0 });
  const cut = layout.shorten(pts, 0.5);
  assert.deepEqual(cut[0], pts[0]);
  assert.ok(Math.abs(cut.at(-1).x - 100) < 2, `stops about half way, got ${cut.at(-1).x}`);
  assert.equal(layout.shorten(pts, 1).length, pts.length);
  assert.match(layout.polyPath(cut), /^M0,0 L/);
});

test("a layout can draw its hardware larger, and the cards grow to hold it", () => {
  const scenario = JSON.parse(readFileSync(new URL("../content/missions/dhcp.json", import.meta.url), "utf8"));
  const width = t => t.length * 6;
  const L = layout.chooseLayout(scenario, false);
  const small = layout.cardGeometry(scenario, L, width), big = layout.cardGeometry(scenario, { ...L, art: 110 }, width);
  for (const id of Object.keys(scenario.devices)) assert.equal(big[id].h - small[id].h, 110 - layout.CARD.art, id);
});

test("every mission is drawn as a room: devices on a floor, not cards on a chart", () => {
  assert.deepEqual(missions.filter(m => m.scene !== "room").map(m => m.id), [], "the room is the house standard for device diagrams");
});
