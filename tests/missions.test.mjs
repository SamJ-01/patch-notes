// Mission Engine tests: correct AND incorrect learner actions, against the real scenario data.
// Run with:  node --test tests/missions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as engine from "../static/js/missions/engine.js";

const dhcp = JSON.parse(readFileSync(new URL("../content/missions/dhcp.json", import.meta.url), "utf8"));
const run = (fn, ...args) => fn(dhcp, ...args);

function playAll(state) {
  const seen = [];
  for (let i = 0; i < 10 && !state.complete; i++) {
    const r = run(engine.next, state);
    r.events.filter(e => e.type === "message").forEach(e => seen.push(e.id));
    state = r.state;
  }
  return { state, seen };
}

test("guided mode plays DORA in order and leases an address", () => {
  const s0 = engine.start(dhcp, "guided");
  assert.equal(s0.devices.pc.ip, "none yet");
  const { state, seen } = playAll(s0);
  assert.deepEqual(seen, ["discover", "offer", "request", "ack"]);
  assert.equal(state.devices.pc.ip, "192.168.1.50");
  assert.equal(state.devices.pc.gateway, "192.168.1.1");
  assert.ok(state.complete);
  assert.equal(s0.devices.pc.ip, "none yet", "start state must not be mutated");
});

test("practice mode stops at each prediction and needs the right answer", () => {
  let s = engine.start(dhcp, "practice");
  let r = run(engine.next, s);
  assert.equal(r.events[0].type, "question");
  assert.equal(r.state.pos, 0);
  // Stepping again while a question is pending does nothing
  assert.deepEqual(run(engine.next, r.state).events, []);
  // Wrong answer: no progress, mistake counted, no reveal yet
  r = run(engine.answer, r.state, 0);
  assert.equal(r.events[0].correct, false);
  assert.equal(r.events[0].reveal, false);
  assert.equal(r.state.mistakes, 1);
  // Second wrong answer reveals the explanation
  r = run(engine.answer, r.state, 2);
  assert.equal(r.events[0].reveal, true);
  assert.equal(r.events[0].correctIndex, 1);
  // Right answer unlocks the message
  r = run(engine.answer, r.state, 1);
  assert.equal(r.events[0].correct, true);
  r = run(engine.next, r.state);
  assert.equal(r.events[0].id, "discover");
});

test("challenge: renewing before the fix keeps the self-assigned address", () => {
  let s = engine.start(dhcp, "challenge");
  assert.equal(s.devices.pc.ip, "169.254.23.7");
  const r = run(engine.useTool, s, "renew");
  assert.equal(r.events[0].noReply, true);
  assert.deepEqual(r.events[0].played.map(p => p.id), ["discover"]);
  assert.equal(r.state.devices.pc.ip, "169.254.23.7");
  assert.equal(r.state.devices.pc.status, "Self-assigned address");
  assert.equal(r.state.goalMet, false);
});

test("challenge: tool output reflects live state", () => {
  let s = engine.start(dhcp, "challenge");
  let r = run(engine.useTool, s, "ipconfig");
  assert.match(r.events[0].output, /Autoconfiguration IPv4 Address: 169\.254\.23\.7/);
  assert.match(r.events[0].finding, /self-assigned/);
  r = run(engine.useTool, r.state, "ping");
  assert.match(r.events[0].output, /Request timed out/);
});

test("challenge: a static IP is a workaround, not the goal", () => {
  let r = run(engine.useTool, engine.start(dhcp, "challenge"), "static");
  assert.equal(r.state.devices.pc.ip, "192.168.1.99");
  assert.ok(r.events.some(e => e.type === "workaround"));
  assert.equal(r.state.goalMet, false);
  r = run(engine.useTool, r.state, "renew");
  assert.match(r.events[0].output, /DHCP is not enabled/);
});

test("challenge: fix the service, renew, then justify the root cause", () => {
  let s = engine.start(dhcp, "challenge");
  for (const t of ["ipconfig", "link", "service", "start"]) s = run(engine.useTool, s, t).state;
  assert.equal(s.devices.server.service, "running");
  let r = run(engine.useTool, s, "renew");
  assert.deepEqual(r.events[0].played.map(p => p.id), ["discover", "offer", "request", "ack"]);
  assert.equal(r.state.devices.pc.ip, "192.168.1.50");
  assert.ok(r.events.some(e => e.type === "goal"));
  assert.ok(!r.state.complete, "fixing it isn't enough: the learner must explain the cause");
  let rc = run(engine.answerRootCause, r.state, 2);
  assert.equal(rc.events[0].correct, false);
  rc = run(engine.answerRootCause, rc.state, 1);
  assert.ok(rc.state.complete);
  assert.equal(rc.events.at(-1).type, "complete");
  assert.equal(rc.state.evidence.length, 5);
});

test("challenge: undoing a static workaround puts the PC back on DHCP", () => {
  let s = engine.start(dhcp, "challenge");
  for (const t of ["static", "start", "auto", "renew"]) s = run(engine.useTool, s, t).state;
  assert.equal(s.devices.pc.method, "dhcp");
  assert.equal(s.devices.pc.ip, "192.168.1.50");
  assert.ok(s.goalMet);
});

test("root cause can't be answered before the fix, and hints run out gracefully", () => {
  const s = engine.start(dhcp, "challenge");
  assert.deepEqual(run(engine.answerRootCause, s, 1).events, []);
  let h = s;
  const texts = [];
  for (let i = 0; i < 5; i++) { const r = run(engine.hint, h); texts.push(r.events[0].text); h = r.state; }
  assert.equal(new Set(texts).size, dhcp.modes.challenge.hints.length);
});

test("scenario data is internally consistent", () => {
  for (const [k, m] of Object.entries(dhcp.modes)) {
    for (const id of m.sequence || []) assert.ok(dhcp.messages[id], `${k}: unknown message ${id}`);
    for (const id of Object.keys(m.checkpoints || {})) assert.ok((m.sequence || []).includes(id), `${k}: checkpoint ${id} not in sequence`);
    for (const t of m.tools || []) {
      assert.ok(t.outcomes.some(o => !Object.keys(o.when).length), `${t.id} needs a fallback outcome`);
      for (const o of t.outcomes) for (const id of o.play || []) assert.ok(dhcp.messages[id], `${t.id}: unknown message ${id}`);
    }
  }
  for (const msg of Object.values(dhcp.messages)) {
    for (const d of [msg.from, ...msg.path, ...(msg.flood || [])]) assert.ok(dhcp.devices[d], `unknown device ${d}`);
    assert.ok(msg.fields.some(f => f.level === 1) && msg.fields.some(f => f.level === 2), `${msg.name} needs basic and detailed fields`);
  }
});
