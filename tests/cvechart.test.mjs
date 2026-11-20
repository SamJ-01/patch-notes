// CVE Radar's "What to patch first" chart (static/js/cvechart.js): scales and points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX, cvssX, epssY, plotPoints, Y_TICKS } from "../static/js/cvechart.js";

test("CVSS runs left to right and EPSS bottom to top on a log scale", () => {
  assert.equal(cvssX(0), BOX.l); assert.equal(cvssX(10), BOX.W - BOX.r);
  assert.equal(epssY(1), BOX.t); assert.equal(epssY(0.0001), BOX.H - BOX.b);
  assert.equal(epssY(0.00001), epssY(0.0001), "below 0.01% sits on the floor");
  const steps = Y_TICKS.map(([p]) => epssY(p));
  for (let i = 1; i < steps.length; i++) assert.ok(Math.abs((steps[i - 1] - steps[i]) - (steps[0] - steps[1])) < 1e-9, "each tenfold step is the same height");
});

test("plotPoints places scored CVEs, counts the unscored, and draws exploited ones last", () => {
  const rows = [
    { id: "CVE-A", cvss: 9.8, epss: 0.9, kev: { name: "Exploited thing" } },
    { id: "CVE-B", cvss: 5.0, epss: 0.001 },
    { id: "CVE-C", cvss: null, epss: 0.2 },
    { id: "CVE-D", cvss: 7.5, epss: null },
  ];
  const P = plotPoints(rows);
  assert.equal(P.dots.length, 2); assert.equal(P.skipped, 2); assert.equal(P.kev, 1);
  assert.equal(P.dots[P.dots.length - 1].id, "CVE-A", "exploited drawn on top");
  assert.equal(P.dots[1].title, "Exploited thing");
  assert.ok(P.dots[1].x > P.dots[0].x && P.dots[1].y < P.dots[0].y, "the worse, likelier one is up and to the right");
});
