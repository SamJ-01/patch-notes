// The ransomware "walk the network" explainer (static/js/ransomware.js): the attack rules, pure.
// Run with:  node --test tests/ransomware.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAttack, deviceStates, STAGES, DEFENCES, DEVICES, BUDGET } from "../static/js/ransomware.js";

test("with no defences the attack runs to the end: stolen, backups gone, encrypted", () => {
  const r = runAttack([]);
  assert.equal(r.stoppedAt, null);
  assert.deepEqual(r.steps.map(s => s.state), ["done", "done", "done", "done", "done"]);
  assert.deepEqual(r.lost, { stolen: true, backups: true, encrypted: true });
  assert.equal(r.outcome.kind, "lost");
});

test("each defence stops the attack at its own stage, and the earlier the less is lost", () => {
  const mfa = runAttack(["mfa"]);
  assert.equal(mfa.stoppedAt, "access"); assert.deepEqual(mfa.lost, { stolen: false, backups: false, encrypted: false });
  assert.deepEqual(mfa.steps.map(s => s.state), ["blocked", "never", "never", "never", "never"]);
  assert.equal(runAttack(["segment"]).stoppedAt, "spread");
  const egress = runAttack(["egress"]); assert.equal(egress.stoppedAt, "steal"); assert.equal(egress.lost.stolen, false);
  const edr = runAttack(["edr"]); assert.equal(edr.stoppedAt, "encrypt");
  assert.deepEqual(edr.lost, { stolen: true, backups: true, encrypted: false }, "EDR at the end: the data was already stolen and the backups wiped");
  assert.match(edr.outcome.text, /data breach/);
});

test("offline backups don't stop the attack, but make it recoverable", () => {
  const r = runAttack(["offline"]);
  assert.equal(r.stoppedAt, null);
  assert.equal(r.steps.find(s => s.id === "backups").state, "survived");
  assert.deepEqual(r.lost, { stolen: true, backups: false, encrypted: true });
  assert.equal(r.outcome.kind, "recovered");
});

test("the budget is enforced and junk is ignored", () => {
  assert.equal(BUDGET, 2);
  const r = runAttack(["edr", "offline", "mfa", "nonsense", "edr"]);
  assert.deepEqual(r.chosen, ["edr", "offline"], "only the first two real, distinct choices count");
  assert.equal(r.stoppedAt, "encrypt");
  assert.equal(runAttack(["<script>"]).chosen.length, 0);
});

test("every stage names a real device and a real defence, and the picture follows the run", () => {
  const ids = new Set(DEVICES.map(d => d.id));
  for (const s of STAGES) { assert.ok(ids.has(s.device), s.id); assert.ok(DEFENCES[s.by], s.id); assert.ok(s.stop && s.text && s.when, s.id); }
  for (const [k, d] of Object.entries(DEFENCES)) if (d.stops) assert.ok(STAGES.some(s => s.id === d.stops && s.by === k), k);
  const full = deviceStates(runAttack([]), 4);
  assert.deepEqual(full, { vpn: "bad", laptop: "bad", server: "locked", backup: "wiped" });
  assert.deepEqual(deviceStates(runAttack(["mfa"]), 0), { vpn: "guarded" });
  assert.equal(deviceStates(runAttack(["offline"]), 3).backup, "safe");
});
