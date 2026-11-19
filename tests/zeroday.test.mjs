import test from "node:test";
import assert from "node:assert/strict";
import { EVENTS, SPAN, CHOICES, attackVolume, exposure } from "../static/js/zeroday.js";

test("events run in order inside the drawn span", () => {
  assert.ok(SPAN.from < EVENTS.exploited && EVENTS.exploited < EVENTS.reported && EVENTS.reported < EVENTS.fixed && EVENTS.fixed < SPAN.to);
});
test("no attacks before the flaw is found; more after disclosure than during the zero-day", () => {
  assert.equal(attackVolume(EVENTS.exploited - 1), 0);
  assert.ok(attackVolume(3) > attackVolume(-1));
});
test("patching later never means facing fewer attacks", () => {
  let prev = -1;
  for (let n = 0; n <= SPAN.to; n++) { const e = exposure(n); assert.ok(e.shareFaced >= prev, String(n)); prev = e.shareFaced; }
});
test("patching on day 0 still leaves the zero-day share", () => {
  const e = exposure(0);
  assert.equal(e.shareFaced, e.zeroDayShare); assert.ok(e.zeroDayShare > 0);
  assert.equal(e.zeroDayDays, EVENTS.fixed - EVENTS.exploited);
});
test("input is clamped and rounded", () => {
  assert.equal(exposure(-5).patchAfter, 0); assert.equal(exposure(500).patchAfter, SPAN.to);
  assert.equal(exposure("x").patchAfter, 0); assert.equal(exposure(2.6).patchAfter, 3);
  assert.equal(exposure(SPAN.to).shareFaced, 100);
});
test("choices are inside the slider's range, in order", () => {
  const d = CHOICES.map(c => c.days);
  assert.deepEqual(d, [...d].sort((a, b) => a - b)); assert.ok(d.every(n => n >= 0 && n <= SPAN.to));
});
