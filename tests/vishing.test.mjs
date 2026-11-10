// Tests for the vishing lab "The Call" (static/js/labs/vishing.js) and its content.
// Run with:  node --test tests/vishing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as vp from "../static/js/labs/vishing.js";

const labs = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8"));
const lab = labs.find(l => l.id === "vishing-call");

test("the vishing lab exists and uses its module kind", () => {
  assert.ok(lab, "vishing-call lab is present");
  assert.equal(lab.kind, "vishing");
  assert.ok(Array.isArray(lab.beats) && lab.beats.length >= 3, "has several beats");
  assert.ok(lab.simplification && /role-play|scripted|invented|fake/i.test(lab.simplification), "says it is a scripted role-play");
});

test("every beat has exactly one safe option, a flag, and feedback on each option", () => {
  for (const b of lab.beats) {
    const safe = b.options.filter(o => o.safe);
    assert.equal(safe.length, 1, `${b.id}: exactly one safe option`);
    assert.ok(b.flag && b.flag.length, `${b.id}: has a red-flag label`);
    assert.equal(vp.safeIndex(b), b.options.findIndex(o => o.safe), `${b.id}: safeIndex agrees`);
    for (const o of b.options) {
      assert.ok(o.text && o.feedback, `${b.id}: every option has text and feedback`);
      if (!o.safe) assert.ok(o.risk, `${b.id}: an unsafe option names what it gives away`);
    }
  }
});

test("beatResult reports safety, the learned flag and the risk", () => {
  const b = lab.beats[0], si = vp.safeIndex(b), ui = b.options.findIndex(o => !o.safe);
  const safe = vp.beatResult(b, si);
  assert.equal(safe.safe, true);
  assert.equal(safe.flag, b.flag, "a safe choice reveals the beat's red flag");
  const unsafe = vp.beatResult(b, ui);
  assert.equal(unsafe.safe, false);
  assert.equal(unsafe.flag, "", "an unsafe choice reveals no flag");
  assert.ok(unsafe.risk.length, "an unsafe choice explains the risk");
});

test("summary scores a run and a perfect run is safe", () => {
  const allSafe = lab.beats.map(b => vp.safeIndex(b));
  const perfect = vp.summary(lab.beats, allSafe);
  assert.equal(perfect.safe, true);
  assert.equal(perfect.caught, lab.beats.length);
  assert.equal(perfect.total, lab.beats.length);
  assert.equal(perfect.spotted.filter(Boolean).length, lab.beats.length);

  const oneWrong = allSafe.slice(); oneWrong[0] = lab.beats[0].options.findIndex(o => !o.safe);
  const slip = vp.summary(lab.beats, oneWrong);
  assert.equal(slip.safe, false);
  assert.equal(slip.caught, lab.beats.length - 1);

  const none = vp.summary(lab.beats, []);
  assert.equal(none.caught, 0, "no answers caught nothing");
});

test("the call never endorses sharing a password or a one-time code", () => {
  // The safe option on the password and code beats must be a refusal.
  for (const b of lab.beats) {
    if (/password|otp|code/i.test(b.id)) {
      const safe = b.options[vp.safeIndex(b)];
      assert.match(safe.text, /refuse|never|don't|do not/i, `${b.id}: the safe reply is a refusal`);
    }
  }
});
