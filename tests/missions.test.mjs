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
  assert.equal(rc.events.at(-1).type, "evidenceCheck", "the right answer opens the reasoning check");
  assert.ok(!rc.state.complete, "naming the cause isn't enough: the learner must back it with evidence");
  assert.equal(rc.state.evidence.length, 5);
  const done = run(engine.answerEvidence, rc.state, required());
  assert.ok(done.state.complete);
  assert.equal(done.events.at(-1).type, "complete");
});

// Indexes of the evidence items a learner must tick, and of the ones that aren't evidence.
const items = dhcp.modes.challenge.rootCause.evidence;
const required = () => items.flatMap((e, i) => (e.required ? [i] : []));
const notEvidence = () => items.flatMap((e, i) => (e.supports ? [] : [i]));
function atReasoningCheck() {
  let s = engine.start(dhcp, "challenge");
  for (const t of ["ipconfig", "link", "service", "start", "renew"]) s = run(engine.useTool, s, t).state;
  return run(engine.answerRootCause, s, dhcp.modes.challenge.rootCause.answer).state;
}

test("reasoning check: ticking something that isn't evidence fails, with feedback on every item", () => {
  const s = atReasoningCheck();
  const r = run(engine.answerEvidence, s, [...required(), notEvidence()[0]]);
  const [res] = r.events;
  assert.equal(res.type, "evidenceResult");
  assert.equal(res.pass, false);
  assert.equal(res.items.length, items.length, "every item gets a verdict");
  assert.ok(res.items.every(i => i.why), "every verdict explains itself");
  assert.equal(res.items.filter(i => !i.ok).length, 1);
  assert.ok(!r.state.complete);
  assert.equal(r.state.mistakes, s.mistakes + 1);
});

test("reasoning check: missing key evidence fails; optional evidence can be left out", () => {
  const s = atReasoningCheck();
  const missing = run(engine.answerEvidence, s, required().slice(1));
  assert.equal(missing.events[0].pass, false);
  const optional = items.flatMap((e, i) => (e.supports && !e.required ? [i] : []));
  assert.ok(optional.length, "the scenario has optional evidence");
  const withOptional = run(engine.answerEvidence, missing.state, [...required(), ...optional]);
  assert.equal(withOptional.events[0].pass, true);
  assert.equal(withOptional.state.evidenceTries, 2);
  assert.ok(withOptional.state.complete);
});

test("reasoning check can't be answered early, twice, or by re-answering the root cause", () => {
  const before = engine.start(dhcp, "challenge");
  assert.deepEqual(run(engine.answerEvidence, before, required()).events, []);
  const s = atReasoningCheck();
  assert.deepEqual(run(engine.answerRootCause, s, 1).events, [], "root cause is already settled");
  const done = run(engine.answerEvidence, s, required()).state;
  assert.deepEqual(run(engine.answerEvidence, done, required()).events, []);
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
    assert.ok(msg.short && msg.short.length <= 12, `${msg.name} needs a short packet label (12 characters at most)`);
    for (const [d, r] of Object.entries(msg.reactions || {})) {
      assert.ok(dhcp.devices[d], `${msg.name}: reaction from unknown device ${d}`);
      assert.ok(typeof r === "string" || (r.text && ["", "quiet"].includes(r.tone || "")), `${msg.name}: bad reaction from ${d}`);
    }
  }
  for (const [id, rules] of Object.entries(dhcp.appearance || {})) {
    assert.ok(dhcp.devices[id], `appearance for unknown device ${id}`);
    for (const r of rules) assert.ok(["ok", "bad", "warn"].includes(r.state), `${id}: unknown appearance ${r.state}`);
  }
  for (const [k, m] of Object.entries(dhcp.modes)) if (m.opening) assert.ok(dhcp.devices[m.opening.device], `${k}: opening from unknown device`);
  for (const L of [dhcp.wide, dhcp.narrow].filter(Boolean)) for (const id of Object.keys(dhcp.devices)) assert.ok(L.pos[id], `layout is missing ${id}`);
  const tools = new Set(dhcp.modes.challenge.tools.map(t => t.id));
  assert.ok(items.some(e => e.required) && items.some(e => !e.supports), "evidence needs key items and items that aren't evidence");
  for (const e of items) {
    assert.ok(e.text && e.why, "every evidence item has text and an explanation");
    assert.ok(!e.required || e.supports, `${e.text}: only supporting evidence can be required`);
    if (e.tool) assert.ok(tools.has(e.tool), `${e.text}: unknown tool ${e.tool}`);
  }
});

test("each Wireshark view agrees with the message's own fields", () => {
  assert.equal(dhcp.wireshark.filter, "dhcp");
  for (const [id, msg] of Object.entries(dhcp.messages)) {
    const w = msg.wireshark;
    assert.ok(w, `${id} needs a Wireshark view`);
    const [eth, ip, udp, app] = w.layers.map(l => l.line);
    assert.match(eth, /^Ethernet II/); assert.match(ip, /^Internet Protocol Version 4/); assert.match(udp, /^User Datagram Protocol/);
    assert.match(app, /^Dynamic Host Configuration Protocol/);
    const field = name => msg.fields.find(f => f.name === name)?.value;
    const xid = field("Transaction ID").toLowerCase();
    assert.ok(w.info.endsWith(xid), `${id}: info shows transaction ID ${xid}`);
    assert.ok(w.layers.at(-1).children.includes(`Transaction ID: ${xid}`), `${id}: details show transaction ID`);
    if (field("Source IP")) assert.equal(w.src, field("Source IP"), `${id}: source IP`);
    if (field("Destination IP")) assert.equal(w.dst, field("Destination IP"), `${id}: destination IP`);
    if (field("Source MAC")) assert.ok(eth.includes(`Src: ${field("Source MAC")}`), `${id}: source MAC`);
    const ports = field("UDP ports");
    if (ports) { const [a, b] = ports.split(" → "); assert.equal(udp, `User Datagram Protocol, Src Port: ${a}, Dst Port: ${b}`); }
    const type = { DHCPDISCOVER: "Discover", DHCPOFFER: "Offer", DHCPREQUEST: "Request", DHCPACK: "ACK" }[field("Message type").split(" ")[0]];
    assert.ok(w.layers.at(-1).children.includes(`Option: (53) DHCP Message Type (${type})`), `${id}: option 53 matches`);
    assert.ok(w.layers.every(l => l.note), `${id}: every layer is explained`);
  }
});

test("appearance comes from the scenario's rules, not from code", () => {
  const look = s => engine.appearance(dhcp, s.devices);
  assert.deepEqual(look(engine.start(dhcp, "guided")), {}, "no address yet: nothing to flag");
  const challenge = engine.start(dhcp, "challenge");
  assert.equal(look(challenge).pc, "bad", "a 169.254 address is a problem");
  let s = challenge;
  for (const t of ["start", "renew"]) s = run(engine.useTool, s, t).state;
  assert.equal(look(s).pc, "ok");
  assert.deepEqual(engine.appearance({ devices: {} }, {}), {}, "scenarios without rules are fine");
});

test("a request with no reply undoes whatever its messages changed", () => {
  const s = engine.start(dhcp, "challenge");
  const r = run(engine.useTool, s, "renew");
  for (const path of Object.keys(dhcp.messages.discover.effects)) {
    assert.equal(engine.get(r.state.devices, path), engine.get(s.devices, path), path);
  }
});
