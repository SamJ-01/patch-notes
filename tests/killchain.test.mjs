import test from "node:test";
import assert from "node:assert/strict";
import { STAGES, DEFENCES, runChain } from "../static/js/killchain.js";

test("seven Kill Chain stages, each with a well-formed ATT&CK technique ID", () => {
  assert.equal(STAGES.length, 7);
  for (const s of STAGES) assert.match(s.attack[0], /^T\d{4}(\.\d{3})?$/, s.id);
});
test("every defence acts on a real stage", () => {
  for (const [k, d] of Object.entries(DEFENCES)) assert.ok(STAGES.some(s => s.id === d.at), k);
});
test("no defence: the chain runs to the end", () => {
  const r = runChain(null);
  assert.equal(r.stoppedAt, null); assert.equal(r.outcome.kind, "lost");
  assert.ok(r.steps.every(s => s.state === "done"));
});
test("a defence that doesn't stop it only slows its stage", () => {
  const r = runChain("profiles");
  assert.equal(r.steps[0].state, "slowed"); assert.equal(r.outcome.kind, "lost");
});
test("each stopping defence blocks its stage and nothing after it happens", () => {
  for (const [k, d] of Object.entries(DEFENCES)) {
    if (d.stops === false) continue;
    const r = runChain(k), at = STAGES.findIndex(s => s.id === d.at);
    assert.equal(r.stoppedAt, d.at, k);
    assert.equal(r.steps[at].state, "blocked");
    assert.ok(r.steps.slice(at + 1).every(s => s.state === "never"), k);
    assert.ok(r.steps.slice(0, at).every(s => s.state === "done"), k);
  }
  assert.equal(runChain("quarantine").outcome.kind, "stopped");
  assert.equal(runChain("dlp").outcome.kind, "late");
});
test("unknown or inherited names count as no defence", () => {
  assert.equal(runChain("toString").defence, null);
  assert.equal(runChain("nope").outcome.kind, "lost");
});
