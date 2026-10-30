// Spaced-repetition scheduler tests. Run with:  node --test tests/review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, dueCards, deckStats, nextDue, freshCard, dayNum } from "../static/js/review.js";

test("good grade pushes the interval out on the SM-2 ladder", () => {
  const t = 1000;
  let c = freshCard(t);                       // new, due today
  c = schedule(c, "good", t);
  assert.equal(c.i, 1); assert.equal(c.due, t + 1); assert.equal(c.reps, 1);
  c = schedule(c, "good", t + 1);
  assert.equal(c.i, 3); assert.equal(c.due, t + 4);
  c = schedule(c, "good", t + 4);
  assert.equal(c.i, Math.round(3 * c.e), "third+ interval is previous x ease");
  assert.ok(c.due > t + 4);
});

test("again resets to today and lowers ease; easy grows faster and raises ease", () => {
  const t = 500;
  let c = schedule(freshCard(t), "good", t);  // e 2.5, i 1
  const again = schedule(c, "again", t + 1);
  assert.equal(again.i, 0); assert.equal(again.due, t + 1); assert.equal(again.reps, 0);
  assert.ok(again.e < 2.5, "ease drops on a lapse");
  const easy = schedule(freshCard(t), "easy", t);
  assert.equal(easy.i, 3); assert.ok(easy.e > 2.5, "ease rises on easy");
});

test("ease is clamped to a sane band", () => {
  let c = { e: 3, i: 10, reps: 5 };
  for (let k = 0; k < 10; k++) c = schedule(c, "easy", 0);
  assert.ok(c.e <= 3, "ease never exceeds the cap");
  let d = { e: 1.3, i: 1, reps: 1 };
  for (let k = 0; k < 10; k++) d = schedule(d, "again", 0);
  assert.ok(d.e >= 1.3, "ease never drops below the floor");
});

test("dueCards: overdue first, then new; future cards excluded", () => {
  const ids = ["a", "b", "c", "d"];
  const review = { a: { due: 5, e: 2.5, i: 2, reps: 1 }, b: { due: 9, e: 2.5, i: 2, reps: 1 }, c: { due: 7, e: 2.5, i: 2, reps: 1 } };
  // today = 7: a (due 5) and c (due 7) are due, b (due 9) is not, d is new
  assert.deepEqual(dueCards(ids, review, 7), ["a", "c", "d"]);
  const s = deckStats(ids, review, 7);
  assert.equal(s.total, 4); assert.equal(s.due, 3); assert.equal(s.fresh, 1); assert.equal(s.learning, 3);
});

test("nextDue returns the soonest future review", () => {
  const review = { a: { due: 12 }, b: { due: 20 }, c: { due: 8 } };
  assert.equal(nextDue(["a", "b", "c"], review, 7), 8);
  assert.equal(nextDue(["a", "b", "c"], review, 25), null, "nothing ahead");
});

test("dayNum advances by one each calendar day", () => {
  const a = dayNum(new Date("2026-03-01T23:30:00"));
  const b = dayNum(new Date("2026-03-02T00:30:00"));
  assert.equal(b - a, 1);
});
