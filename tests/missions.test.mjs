// Mission Engine tests: correct AND incorrect learner actions, against the real scenario data.
// Run with:  node --test tests/missions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as engine from "../static/js/missions/engine.js";

const dhcp = JSON.parse(readFileSync(new URL("../content/missions/dhcp.json", import.meta.url), "utf8"));
const run = (fn, ...args) => fn(dhcp, ...args);

// Every mission scenario, for the protocol-agnostic structural checks.
const missionsDir = new URL("../content/missions/", import.meta.url);
const allMissions = readdirSync(missionsDir).filter(f => f.endsWith(".json"))
  .map(f => [f, JSON.parse(readFileSync(new URL(f, missionsDir), "utf8"))]);

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

test("every mission scenario is structurally consistent and playable", () => {
  assert.ok(allMissions.length >= 2, "there should be more than one mission");
  for (const [file, m] of allMissions) {
    const where = (s) => `${file}: ${s}`;
    assert.ok(m.id && m.title && m.lesson, where("needs id, title and lesson"));
    const devIds = new Set(Object.keys(m.devices));
    for (const id of devIds) assert.ok(m.devices[id].kind, where(`${id} needs a kind`));
    for (const [a, b] of m.links) { assert.ok(devIds.has(a) && devIds.has(b), where(`link ${a}-${b} uses a real device`)); }
    // Messages
    for (const [id, msg] of Object.entries(m.messages)) {
      for (const d of [msg.from, ...msg.path, ...(msg.flood || [])]) assert.ok(devIds.has(d), where(`${id}: unknown device ${d}`));
      assert.ok(msg.short && msg.short.length <= 12, where(`${id} needs a short label (≤12 chars)`));
      assert.ok(msg.fields.some(f => f.level === 1) && msg.fields.some(f => f.level === 2), where(`${id} needs basic and detailed fields`));
      for (const [d, r] of Object.entries(msg.reactions || {})) {
        assert.ok(devIds.has(d), where(`${id}: reaction from unknown device ${d}`));
        assert.ok(typeof r === "string" || (r.text && ["", "quiet"].includes(r.tone || "")), where(`${id}: bad reaction from ${d}`));
      }
      if (msg.wireshark) {
        assert.ok(msg.wireshark.layers.every(l => l.note), where(`${id}: every Wireshark layer is explained`));
        // The UDP layer line must match the message's own "UDP ports" field, so the two never drift apart.
        const ports = msg.fields.find(f => f.name === "UDP ports")?.value;
        const udpLine = msg.wireshark.layers.find(l => /^User Datagram Protocol/.test(l.line))?.line;
        if (ports && udpLine) {
          const [a, b] = ports.split(" → ");
          assert.equal(udpLine, `User Datagram Protocol, Src Port: ${a}, Dst Port: ${b}`, where(`${id}: Wireshark UDP ports match the field`));
        }
      }
    }
    // Modes
    for (const [k, mode] of Object.entries(m.modes)) {
      assert.ok(mode.label && mode.xp && mode.intro && mode.debrief, where(`mode ${k} needs label, xp, intro, debrief`));
      for (const sid of mode.sequence || []) assert.ok(m.messages[sid], where(`${k}: unknown message ${sid}`));
      for (const cid of Object.keys(mode.checkpoints || {})) assert.ok((mode.sequence || []).includes(cid), where(`${k}: checkpoint ${cid} not in sequence`));
      for (const t of mode.tools || []) {
        assert.ok(t.id && t.label && t.kind, where(`${k}: a tool needs id, label and kind`));
        assert.ok(t.outcomes.some(o => !Object.keys(o.when).length), where(`${k}: ${t.id} needs a fallback outcome`));
        for (const o of t.outcomes) for (const pid of o.play || []) assert.ok(m.messages[pid], where(`${k}: ${t.id} plays unknown message ${pid}`));
      }
      if (mode.opening) assert.ok(devIds.has(mode.opening.device), where(`${k}: opening from unknown device`));
      const rc = mode.rootCause;
      if (rc?.evidence) {
        const tools = new Set((mode.tools || []).map(t => t.id));
        assert.ok(rc.evidence.some(e => e.required) && rc.evidence.some(e => !e.supports), where(`${k}: evidence needs key items and non-evidence`));
        for (const e of rc.evidence) {
          assert.ok(e.text && e.why, where(`${k}: every evidence item has text and why`));
          assert.ok(!e.required || e.supports, where(`${k}: only supporting evidence can be required`));
          if (e.tool) assert.ok(tools.has(e.tool) || (e.tool === "log" && m.log) || (e.tool === "email" && m.emails), where(`${k}: evidence tool ${e.tool} is a real tool`));
        }
        assert.ok(typeof rc.answer === "number" && rc.options[rc.answer], where(`${k}: rootCause answer indexes a real option`));
      }
    }
    // Appearance + layout
    for (const [id, rules] of Object.entries(m.appearance || {})) {
      assert.ok(devIds.has(id), where(`appearance for unknown device ${id}`));
      for (const r of rules) assert.ok(["ok", "bad", "warn"].includes(r.state), where(`${id}: unknown appearance ${r.state}`));
    }
    for (const L of [m.wide, m.narrow].filter(Boolean)) for (const id of devIds) assert.ok(L.pos?.[id], where(`layout is missing ${id}`));
    // Reported emails: each parses, has a reporter and a finding, and ids are unique.
    if (m.emails) {
      assert.ok(m.emails.org && m.emails.intro && m.emails.items.length, where("emails need org, intro and items"));
      assert.equal(new Set(m.emails.items.map(e => e.id)).size, m.emails.items.length, where("email ids are unique"));
      for (const e of m.emails.items) {
        const h = engine.parseHeaders(e.headers);
        assert.ok(e.label && e.reportedBy && e.body && e.findings?.length, where(`${e.id} needs label, reportedBy, body and findings`));
        assert.ok(h.from.address && h.received.length && h.received.every(r => r.ip), where(`${e.id}: headers parse`));
      }
    }
    // Every mode starts and completes cleanly through the engine.
    for (const k of Object.keys(m.modes)) assert.doesNotThrow(() => engine.start(m, k), where(`mode ${k} starts`));
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

// ---------- "The 3am logins": the log viewer and an SSH brute-force investigation
const ssh = JSON.parse(readFileSync(new URL("../content/missions/ssh-brute.json", import.meta.url), "utf8"));
const types = r => r.events.map(e => e.type);

test("log search works like grep: every term must appear, any case", () => {
  let s = engine.start(ssh, "challenge");
  const all = engine.searchLog(ssh, s, "");
  assert.equal(all.events[0].lines.length, ssh.log.lines.length);
  assert.equal(all.state.evidence.length, 0, "showing everything isn't a finding");
  const failed = engine.searchLog(ssh, s, "failed PASSWORD");
  assert.equal(failed.events[0].lines.length, 11);
  assert.ok(failed.events[0].lines.every(l => l.includes("Failed password")));
  assert.equal(engine.searchLog(ssh, s, "deploy accepted").events[0].lines.length, 1, "terms combine");
  assert.equal(engine.searchLog(ssh, s, "nothing-like-this").events[0].lines.length, 0);
  assert.ok(failed.state.toolsUsed.includes("log"));
});

test("ssh-brute: the log agrees with every finding and evidence item", () => {
  const lines = ssh.log.lines, A = ssh.devices.attacker.ip;
  const fails = lines.filter(l => l.includes("Failed password") && l.includes(A));
  assert.equal(fails.length, lines.filter(l => l.includes("Failed password")).length, "every failure came from the attacker");
  for (const f of ssh.log.findings) {
    assert.ok(lines.some(l => l.includes(f.match)), `${f.match} is in the log`);
    const r = engine.searchLog(ssh, engine.start(ssh, "challenge"), f.match);
    assert.ok(r.state.evidence.some(e => e.finding === f.finding), `searching "${f.match}" records its finding`);
  }
  assert.match(ssh.log.findings[0].finding, new RegExp(`^${fails.length} failed`));
  assert.ok(ssh.modes.challenge.rootCause.evidence[1].text.includes(`${fails.length} 'Failed password'`));
  const accepted = lines.filter(l => l.includes("Accepted password"));
  assert.equal(accepted.length, 1);
  assert.ok(accepted[0].includes("deploy") && accepted[0].includes(A));
  const users = [...new Set(fails.map(l => l.match(/for (?:invalid user )?(\S+) from/)[1]))];
  assert.deepEqual(users, ["root", "admin", "test", "oracle", "deploy"]);
  assert.match(ssh.log.intro, new RegExp(`\\(${lines.length} lines\\)`));
});

test("ssh-brute: blocking the IP alone is a workaround, full containment meets the goal", () => {
  let r = engine.useTool(ssh, engine.start(ssh, "challenge"), "block");
  assert.ok(types(r).includes("workaround"));
  assert.ok(!r.state.goalMet);
  let s = engine.searchLog(ssh, r.state, "Accepted").state;
  for (const t of ["who", "sshdcfg", "kill", "lock"]) s = engine.useTool(ssh, s, t).state;
  assert.ok(!s.goalMet, "still accepting passwords");
  r = engine.useTool(ssh, s, "keysonly");
  assert.ok(types(r).includes("goal"));
  assert.equal(engine.useTool(ssh, r.state, "who").events[0].output.includes("deploy"), false, "the session is gone");
  // Root cause, then the reasoning check: required items in, non-evidence out.
  let rc = engine.answerRootCause(ssh, r.state, 2);
  assert.equal(rc.events[0].correct, false);
  rc = engine.answerRootCause(ssh, rc.state, ssh.modes.challenge.rootCause.answer);
  assert.ok(types(rc).includes("evidenceCheck"));
  const ev = ssh.modes.challenge.rootCause.evidence;
  const wrong = engine.answerEvidence(ssh, rc.state, ev.map((_, i) => i));
  assert.equal(wrong.events[0].pass, false, "ticking everything includes non-evidence");
  const right = engine.answerEvidence(ssh, rc.state, ev.map((e, i) => (e.required ? i : -1)).filter(i => i >= 0));
  assert.equal(right.events[0].pass, true);
  assert.ok(right.state.complete);
});

test("ssh-brute: guided and practice play through", () => {
  let s = engine.start(ssh, "guided");
  while (!s.complete) s = engine.next(ssh, s).state;
  assert.equal(s.devices.server.state, "compromised");
  s = engine.start(ssh, "practice");
  while (!s.complete) {
    const r = engine.next(ssh, s); s = r.state;
    const q = r.events.find(e => e.type === "question");
    if (q) s = engine.answer(ssh, s, q.answer).state;
  }
  assert.ok(s.complete);
});

// ---------- "Which email was it?": the email inspector and a phishing triage
const phish = JSON.parse(readFileSync(new URL("../content/missions/phish-triage.json", import.meta.url), "utf8"));
const email = id => phish.emails.items.find(e => e.id === id);

test("headers parse like an analyst reads them: real sender, reply-to, route and verdicts", () => {
  const boss = engine.parseHeaders(email("boss").headers);
  assert.deepEqual(boss.from, { name: "Daniel Ashby", address: "daniel.ashby@ashbylane.example", domain: "ashbylane.example" });
  assert.equal(boss.replyTo.domain, "freemail.example");
  assert.deepEqual(boss.received.map(r => [r.rdns, r.ip, r.by]), [["relay7.sendfast.example", "198.51.100.61", "mail01.ashbylane.example"]]);
  assert.deepEqual([boss.auth.spf.result, boss.auth.dkim.result, boss.auth.dmarc.result], ["softfail", "none", "fail"]);
  assert.match(boss.auth.dmarc.detail, /p=quarantine/);
  const look = engine.parseHeaders(email("itreset").headers);
  assert.equal(look.from.domain, "ashby1ane.example");
  assert.equal(look.replyTo, null);
  assert.deepEqual([look.auth.spf.result, look.auth.dkim.result, look.auth.dmarc.result], ["pass", "pass", "pass"], "the lookalike passes everything");
  // Received headers are newest first; the parser puts them in travel order.
  const two = engine.parseHeaders("Received: from b.example (b.example [192.0.2.2])\n\tby c.example; date\nReceived: from a.example (a.example [192.0.2.1]) by b.example; date\nFrom: x@a.example");
  assert.deepEqual(two.received.map(r => r.by), ["b.example", "c.example"]);
  assert.equal(engine.parseHeaders("").from.address, "");
});

test("links: the host in the href is what counts, not the text", () => {
  assert.deepEqual(engine.linkFacts({ text: "https://mail.ashbylane.example/reset", href: "https://login.ashby1ane.example/x" }).mismatch, true);
  assert.equal(engine.linkFacts({ text: "View your proof", href: "https://proofs.harlowprint.example/job" }).mismatch, false, "plain words aren't a claim");
  assert.equal(engine.linkFacts({ text: "x", href: "javascript:alert(1)" }).real, "");
});

test("phish-triage: the headers, logs and findings agree", () => {
  const A = phish.devices.attacker.ip, lines = phish.log.lines;
  for (const f of phish.log.findings) {
    assert.ok(lines.some(l => l.includes(f.match)), `${f.match} is in the log`);
    assert.ok(engine.searchLog(phish, engine.start(phish, "challenge"), f.match).state.evidence.some(e => e.finding === f.finding), `searching "${f.match}" records its finding`);
  }
  // Every email's queue ID and Message-ID in its Received header match the mail log.
  for (const e of phish.emails.items) {
    const qid = e.headers.match(/ id ([0-9A-F]{10})/)[1], mid = engine.parseHeaders(e.headers).messageId;
    assert.ok(lines.some(l => l.includes(`${qid}: message-id=${mid}`)), `${e.id}: cleanup line for ${qid}`);
    assert.ok(lines.some(l => l.includes(`client=`) && l.includes(qid) && l.includes(engine.parseHeaders(e.headers).received[0].ip)), `${e.id}: sending IP`);
  }
  const delivered = lines.filter(l => l.includes("4A7B21C0D9: to=<")).map(l => l.match(/to=<([^@]+)@/)[1]);
  assert.deepEqual(delivered, ["accounts", "owen.reed", "priya.shah"]);
  assert.ok(lines.some(l => l.includes("4A7B21C0D9") && l.includes(`nrcpt=${delivered.length}`)));
  const visits = lines.filter(l => l.includes("login.ashby1ane.example"));
  assert.equal(visits.length, 1, "one person visited the fake page");
  assert.ok(visits[0].includes("10.0.5.41") && visits[0].includes(`HIER_DIRECT/${A}`));
  // Squid logs when the tunnel closes: its epoch matches the syslog time, and the elapsed time matches "74 seconds from 09:27".
  const [, hhmmss, epoch, ms] = visits[0].match(/(\d\d:\d\d:\d\d) proxy01 squid\[\d+\]: (\d+)\.\d+\s+(\d+)/);
  assert.equal(new Date(Number(epoch) * 1000).toISOString().slice(11, 19), hhmmss);
  assert.equal(Math.round(ms / 1000), 74);
  assert.equal(new Date((epoch - ms / 1000) * 1000).toISOString().slice(11, 16), "09:27");
  const logins = lines.filter(l => l.includes("Login: user=<priya.shah>"));
  assert.deepEqual(logins.map(l => l.match(/rip=([\d.]+)/)[1]), [phish.devices.user.ip, A]);
  assert.ok(lines.every((l, i) => i === 0 || l.slice(7, 15) >= lines[i - 1].slice(7, 15)), "the log is in time order");
  assert.match(phish.log.intro, new RegExp(`\\(${lines.length} lines`));
  assert.ok(!JSON.stringify(phish).includes("—"), "no em dashes");
});

test("phish-triage: inspecting an email records its findings once, and only in tool modes", () => {
  let s = engine.start(phish, "challenge");
  const r = engine.inspectEmail(phish, s, "itreset");
  assert.equal(r.events[0].type, "email");
  assert.equal(r.events[0].links[0].mismatch, true);
  assert.equal(r.state.evidence.length, email("itreset").findings.length);
  assert.ok(r.state.toolsUsed.includes("email"));
  assert.equal(engine.inspectEmail(phish, r.state, "itreset").events[0].found.length, 0, "no duplicate evidence");
  assert.deepEqual(engine.inspectEmail(phish, s, "nope").events, []);
  assert.equal(s.evidence.length, 0, "state isn't mutated");
});

test("phish-triage: deleting one copy is a workaround; kicking before the reset lets the attacker back", () => {
  let r = engine.useTool(phish, engine.start(phish, "challenge"), "delone");
  assert.ok(types(r).includes("workaround"));
  assert.match(engine.useTool(phish, r.state, "search").events[0].output, /owen\.reed/);
  let s = engine.useTool(phish, r.state, "kick").state;
  assert.equal(s.devices.mail.session, "attacker", "the stolen password still works");
  for (const t of ["purge", "block", "reset"]) s = engine.useTool(phish, s, t).state;
  assert.ok(!s.goalMet, "a reset doesn't end open sessions");
  assert.match(engine.useTool(phish, s, "who").events[0].output, /203\.0\.113\.77/);
  r = engine.useTool(phish, s, "kick");
  assert.ok(types(r).includes("goal"));
  assert.doesNotMatch(engine.useTool(phish, r.state, "who").events[0].output, /priya/);
  assert.equal(engine.useTool(phish, r.state, "kick").events[0].output, "no users kicked");
  let rc = engine.answerRootCause(phish, r.state, 2);
  assert.equal(rc.events[0].correct, false);
  rc = engine.answerRootCause(phish, rc.state, phish.modes.challenge.rootCause.answer);
  const ev = phish.modes.challenge.rootCause.evidence;
  assert.equal(engine.answerEvidence(phish, rc.state, ev.map((_, i) => i)).events[0].pass, false);
  const done = engine.answerEvidence(phish, rc.state, ev.flatMap((e, i) => (e.required ? [i] : [])));
  assert.ok(done.state.complete);
});

test("phish-triage: guided and practice play through", () => {
  let s = engine.start(phish, "guided");
  while (!s.complete) s = engine.next(phish, s).state;
  assert.equal(s.devices.mail.session, "attacker");
  s = engine.start(phish, "practice");
  while (!s.complete) {
    const r = engine.next(phish, s); s = r.state;
    const q = r.events.find(e => e.type === "question");
    if (q) s = engine.answer(phish, s, q.answer).state;
  }
  assert.ok(s.complete);
});
