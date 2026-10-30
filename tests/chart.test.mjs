// Chart builder tests: pure SVG/string output, so no browser needed.
// Run with:  node --test tests/chart.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as chart from "../static/js/chart.js";

test("bars: one rect per value, with ticks and an accessible readout", () => {
  const spec = { type: "bars", title: "Requests", unit: "", series: [
    { label: "09:58", value: 1210, tone: "good" }, { label: "10:00", value: 38400, tone: "warn" }] };
  const svg = chart.barsSVG(spec);
  assert.equal((svg.match(/class="ch-bar"/g) || []).length, 2, "a bar per series point");
  assert.ok(svg.includes("09:58") && svg.includes("10:00"), "x labels drawn");
  assert.match(svg, /aria-hidden="true"/, "the svg itself is decorative");
  assert.deepEqual(chart.readout(spec), ["09:58: 1,210", "10:00: 38,400"], "data is available as text");
});

test("bars: a threshold draws a reference line and label", () => {
  const svg = chart.barsSVG({ type: "bars", series: [{ label: "x", value: 500 }], threshold: { value: 1000, label: "link full" } });
  assert.match(svg, /class="ch-threshold"/);
  assert.ok(svg.includes("link full"));
});

test("line: a path with one point per value, in order", () => {
  const spec = { type: "line", unit: " ms", points: [{ label: "1", value: 3 }, { label: "2", value: 96 }, { label: "3", value: 4 }] };
  const svg = chart.lineSVG(spec);
  assert.match(svg, /<path class="ch-line"/);
  assert.equal((svg.match(/class="ch-dot"/g) || []).length, 3);
  // The path starts with a move and then line-tos: one command per point.
  const d = svg.match(/d="([^"]+)"/)[1];
  assert.equal((d.match(/[ML]/g) || []).length, 3);
  assert.deepEqual(chart.readout(spec), ["1: 3 ms", "2: 96 ms", "3: 4 ms"]);
});

test("empty data renders nothing, not a broken chart", () => {
  assert.equal(chart.barsSVG({ series: [] }), "");
  assert.equal(chart.lineSVG({ points: [] }), "");
});

test("chartSVG routes by type and mount writes a figure with the data list", () => {
  assert.ok(chart.chartSVG({ type: "line", points: [{ label: "a", value: 1 }] }).includes("ch-line"));
  assert.ok(chart.chartSVG({ type: "bars", series: [{ label: "a", value: 1 }] }).includes("ch-bar"));
  let html = "";
  chart.mount({ set innerHTML(v) { html = v; } }, { type: "bars", title: "T", caption: "C", series: [{ label: "a", value: 2 }], key: [{ label: "k", tone: "bad" }] });
  assert.ok(html.includes("<figure") && html.includes("chart-title") && html.includes("sr-only") && html.includes("chart-key"));
  assert.ok(html.includes("a: 2"), "the readout list carries the values");
});
