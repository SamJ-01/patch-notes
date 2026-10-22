// Tests for PATCH//AGENCY shift rules (static/js/agency/shift.js) and the shift content.
// Run with:  node --test tests/agency.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as A from "../static/js/agency/shift.js";
import { matches } from "../static/js/missions/engine.js";

const dir = new URL("../content/agency/", import.meta.url);
const shifts = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const shift = shifts.find(s => s.id === "shift-01");

// Apply actions in turn, collecting every event.
function play(steps, s = A.start(shift).state) {
  const events = [];
  for (const [fn, ...args] of steps) { const r = A[fn](shift, s, ...args); s = r.state; events.push(...r.events); }
  return { s, events };
}
const evidenceFor = (id, picks) => picks ?? shift.alerts.find(a => a.id === id).evidence.flatMap((e, i) => (e.required ? [i] : []));
const closeRight = id => {
  const a = shift.alerts.find(x => x.id === id);
  return ["close", id, { verdict: a.answer.verdict, severity: a.answer.severity[0], evidence: evidenceFor(id), related: a.answer.related }];
};
const perfect = [
  ["search", "signin", "203.0.113.77"], ["search", "files01-auth", "svcbackup2"],
  closeRight("a1"), closeRight("a2"), closeRight("a3"),
  ["ask", "identity:lock-svcbackup2", "files-useradd"], ["ask", "identity:reset-mokafor", "spray-success"],
  ["ask", "netops:block-77"], ["ask", "client:report-incident"],
  closeRight("a4"), closeRight("a5"),
];
const goodHandover = () => ({
  status: Object.fromEntries(shift.alerts.map(a => [a.id, a.answer.status])),
  summary: Object.fromEntries(shift.alerts.map(a => [a.id, a.answer.summary])),
  note: "Spray got m.okafor; svcbackup2 locked.",
});

test("a shift starts at minute 0 with the night's alerts; the late one isn't there yet", () => {
  const { state, events } = A.start(shift);
  assert.equal(state.clock, 0);
  assert.deepEqual(state.arrived, ["a1", "a2", "a3", "a4"]);
  assert.equal(events.filter(e => e.type === "arrive").length, 4);
});

test("the clock only moves when the learner acts, by what the shift file says", () => {
  let { s } = play([["search", "web01-auth", ""]]);
  assert.equal(s.clock, 0, "showing the whole log is free");
  ({ s } = play([["search", "web01-auth", "Failed"]], s));
  assert.equal(s.clock, shift.costs.search);
  ({ s } = play([["wait"]], s));
  assert.equal(s.clock, shift.costs.search + shift.costs.wait);
  assert.deepEqual(s.spent, { search: shift.costs.search, wait: shift.costs.wait });
});

test("a log can only be searched once an alert that uses it has arrived", () => {
  const custom = { ...shift, alerts: shift.alerts.map(a => (a.id === "a2" ? { ...a, sources: ["notes"] } : a)) };
  const { state } = A.start(custom);
  assert.deepEqual(A.search(custom, state, "signin", "j.patel").events, [], "no arrived alert uses the sign-in log");
  assert.deepEqual(A.search(shift, A.start(shift).state, "nope", "x").events, []);
});

test("focused searches record findings once; whole-log views record nothing", () => {
  let { s, events } = play([["search", "signin", "203.0.113.77"]]);
  assert.ok(s.found.includes("spray") && s.found.includes("spray-success"));
  assert.equal(events[0].found.length, s.found.length);
  ({ s, events } = play([["search", "signin", "203.0.113.77"]], s));
  assert.equal(events[0].found.length, 0, "already found");
  ({ s } = play([["search", "notes", ""]], s));
  assert.ok(!s.found.includes("chg2291"));
});

test("the late alert arrives after two closes, or at its time, and only once", () => {
  let { s, events } = play([closeRight("a1")]);
  assert.ok(!s.arrived.includes("a5"));
  ({ s, events } = play([closeRight("a3")], s));
  assert.ok(s.arrived.includes("a5"));
  assert.equal(events.filter(e => e.type === "arrive" && e.id === "a5").length, 1);
  ({ s, events } = play([["wait"], ["wait"], ["wait"], ["wait"], ["wait"], ["wait"]], s));
  assert.equal(events.filter(e => e.type === "arrive").length, 0);
  assert.equal(s.arrived.filter(id => id === "a5").length, 1);
  const waited = play(Array(6).fill(["wait"]));
  assert.ok(waited.s.clock >= 30 && waited.s.arrived.includes("a5"), "at minute 30 with nothing closed");
});

test("departments ask for a reason, then act on the next request with a finding attached", () => {
  let { s, events } = play([["ask", "identity:lock-svcbackup2"]]);
  assert.equal(events[0].type, "sent");
  ({ s, events } = play([["wait"]], s));
  const asked = events.find(e => e.type === "reply");
  assert.equal(asked.outcome, "asks");
  assert.equal(s.facts.accounts, undefined, "asking has no effects");
  assert.deepEqual(play([["ask", "identity:lock-svcbackup2", "files-useradd"]], s).events.filter(e => e.type === "sent")[0].attached, "", "a finding not yet found can't be attached");
  ({ s } = play([["search", "files01-auth", "svcbackup2"], ["ask", "identity:lock-svcbackup2", "files-useradd"], ["wait"], ["wait"]], s));
  assert.equal(s.facts.accounts.svcbackup2, "locked");
  assert.deepEqual(A.ask(shift, s, "identity:lock-svcbackup2", "files-useradd").events, [], "can't resend a done request");
});

test("a request is only possible from an alert that offers it, once it has arrived", () => {
  assert.deepEqual(A.ask(shift, A.start(shift).state, "netops:block-77").events, [], "a5 hasn't arrived");
  assert.deepEqual(A.ask(shift, A.start(shift).state, "netops:nope").events, []);
});

test("the one refusal says what would work, changes nothing, and can't be resent", () => {
  let { s, events } = play([closeRight("a1"), closeRight("a3"), ["ask", "netops:block-range"], ["wait"]]);
  const r = events.find(e => e.type === "reply");
  assert.equal(r.outcome, "refused");
  assert.match(r.text, /203\.0\.113\.77/);
  assert.equal(s.facts.blocked, undefined);
  assert.deepEqual(A.ask(shift, s, "netops:block-range").events, []);
  assert.equal(A.requestsFor(shift, s, "a5").find(x => x.ref === "netops:block-range").canSend, false);
});

test("a reply can bring a finding (a phone call), usable as evidence after", () => {
  const { s, events } = play([["ask", "servicedesk:call-jpatel"], ["wait"], ["wait"], ["wait"]]);
  const r = events.find(e => e.type === "reply");
  assert.ok(r.finding);
  assert.ok(s.found.includes("jpatel-confirms"));
  assert.ok(A.findings(shift)["jpatel-confirms"]);
});

test("closing validates its input; reopening allows a change of mind", () => {
  const s0 = A.start(shift).state;
  assert.deepEqual(A.close(shift, s0, "a1", { verdict: "maybe", severity: "low" }).events, []);
  assert.deepEqual(A.close(shift, s0, "a1", { verdict: "noharm", severity: "huge" }).events, []);
  assert.deepEqual(A.close(shift, s0, "a5", { verdict: "act", severity: "high" }).events, [], "not arrived");
  let { s } = play([["close", "a1", { verdict: "noharm", severity: "low", evidence: [1, 1, 99, -1, 0.5, 0], related: ["a1", "zz", "a2"] }]]);
  assert.deepEqual(s.closed.a1, { verdict: "noharm", severity: "low", evidence: [0, 1], related: ["a2"] });
  const clock = s.clock;
  ({ s } = play([["reopen", "a1"], ["close", "a1", { verdict: "act", severity: "high" }]], s));
  assert.equal(s.closed.a1.verdict, "act");
  assert.equal(s.clock, clock + shift.costs.close, "re-doing the work takes time again; reopening itself is free");
});

test("handover needs every alert closed, then ends the shift", () => {
  let { s } = play(perfect.slice(0, -1));
  assert.equal(A.canHandOver(shift, s), false);
  assert.deepEqual(A.handover(shift, s, goodHandover()).events, []);
  ({ s } = play(perfect.slice(-1), s));
  assert.equal(A.canHandOver(shift, s), true);
  const r = A.handover(shift, s, goodHandover());
  assert.equal(r.state.complete, true);
  assert.deepEqual(A.search(shift, r.state, "signin", "x").events, [], "nothing more after handover");
});

test("debrief: a careful shift passes every check", () => {
  const { s } = play(perfect);
  const rep = A.handover(shift, s, goodHandover()).events[0].report;
  for (const c of rep.checks) assert.ok(c.ok, `${c.label}: ${c.text}`);
  assert.deepEqual(rep.links, { found: ["a4+a5"], missed: [], wrong: [] });
  assert.ok(rep.pending.length > 0, "replies still on their way are listed, not lost");
  assert.equal(rep.note, "Spray got m.okafor; svcbackup2 locked.");
  assert.ok(rep.modelNote);
});

test("debrief: over-reaction, a wrong verdict, a missed link and missing containment are each reported", () => {
  const steps = [
    ["search", "signin", "j.patel"], ["ask", "identity:disable-jpatel", "jpatel-gb"],
    ["close", "a2", { verdict: "act", severity: "high", evidence: [4] }], closeRight("a1"), closeRight("a3"),
    ["wait"], ["wait"], closeRight("a4"),
    ["close", "a5", { verdict: "act", severity: "high", evidence: evidenceFor("a5") }],
  ];
  let { s } = play(steps);
  s.closed.a4.related = [];  // the learner didn't link them from either side
  const rep = A.handover(shift, s, {}).events[0].report;
  const check = l => rep.checks.find(c => c.label === l).ok;
  assert.equal(check("Verdicts"), false);
  assert.equal(check("Proportion"), false);
  assert.match(rep.costs[0].cost, /legitimate user/);
  assert.equal(check("Linked alerts"), false);
  assert.deepEqual(rep.links.missed, ["a4+a5"]);
  assert.equal(check("Containment"), false);
  const a2 = rep.alerts.find(a => a.id === "a2");
  assert.equal(a2.evidence.pass, false);
  assert.equal(check("Handover"), false, "an empty handover matches nothing");
});

test("guided: hints come one at a time, cost no time, and only on the guided level", () => {
  const g = A.start(shift, { level: "guided" }).state;
  assert.equal(g.level, "guided");
  assert.deepEqual(A.hint(shift, A.start(shift).state, "a1").events, [], "no hints on your own");
  let s = g;
  const texts = [];
  for (;;) { const r = A.hint(shift, s, "a1"); if (!r.events.length) break; s = r.state; texts.push(r.events[0].text); }
  assert.deepEqual(texts, shift.alerts[0].guide.hints);
  assert.equal(s.clock, 0, "hints are free");
  assert.equal(A.hintsUsed(s, "a1"), texts.length);
  assert.deepEqual(A.hint(shift, g, "a5").events, [], "not for an alert that hasn't arrived");
  assert.equal(A.start(shift, { level: "nonsense" }).state.level, "standard");
});

test("guided: feedback on a closed alert, and the filled-in answers pass", () => {
  let s = A.start(shift, { level: "guided" }).state;
  s = A.close(shift, s, "a2", { verdict: "act", severity: "high", evidence: [4] }).state;
  const fb = A.feedback(shift, s, "a2");
  assert.equal(fb.verdict.ok, false); assert.equal(fb.verdict.answer, "legit");
  assert.equal(fb.evidence.pass, false);
  assert.ok(fb.why);
  assert.equal(A.feedback(shift, s, "a1"), null, "not closed yet");
  for (const a of shift.alerts) {
    let t = A.start(shift, { level: "guided" }).state;
    t = { ...t, arrived: shift.alerts.map(x => x.id) };
    t = A.close(shift, t, a.id, A.modelClose(shift, a.id)).state;
    const f = A.feedback(shift, t, a.id);
    assert.ok(f.verdict.ok && f.severity.ok && f.evidence.pass && f.links.ok, `${a.id}: the model answer passes its own check`);
  }
  const { s: done } = play(perfect);
  const rep = A.handover(shift, { ...done, level: "guided", hints: { a1: 2, a4: 1 } }, A.modelHandover(shift)).events[0].report;
  assert.equal(rep.checks.find(c => c.label === "Handover").ok, true, "the handover fill-in is the model");
  assert.equal(rep.level, "guided"); assert.equal(rep.hints, 3);
});

test("matches() supports oneOf", () => {
  assert.ok(matches({ x: { oneOf: ["a", "b"] } }, { x: "b" }));
  assert.ok(!matches({ x: { oneOf: ["a"] } }, { x: "c" }));
});

// ---------- content: every shift file is consistent and accurate
const DOC_IP = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;
const FORMATS = {
  syslog: /^[A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d \S+ [\w-]+(\[\d+\])?: +\S/,  // sudo pads the user name
  nginx: /^\S+ - \S+ \[\d\d\/[A-Z][a-z]{2}\/\d{4}:\d\d:\d\d:\d\d [+-]\d{4}\] "[A-Z]+ \S+ HTTP\/1\.[01]" \d{3} \d+ "[^"]*" "[^"]*"$/,
  siem: /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d app=\w+ result=(success|failure) user=\S+@pellowfinch\.example src=\S+ country=[A-Z]{2} mfa=\S+/,
};
const formatOf = id => (id.endsWith("-auth") ? "syslog" : id.endsWith("-nginx") ? "nginx" : id === "signin" ? "siem" : null);

for (const sh of shifts) {
  test(`${sh.id}: content is consistent`, () => {
    const ids = new Set(sh.alerts.map(a => a.id));
    const all = A.findings(sh);
    const fids = [...Object.values(sh.sources).flatMap(s => (s.findings || []).map(f => f.id)),
      ...Object.values(sh.departments).flatMap(d => d.requests.flatMap(r => r.replies.filter(x => x.finding).map(x => x.finding.id)))];
    assert.equal(new Set(fids).size, fids.length, "finding ids are unique");
    for (const [id, src] of Object.entries(sh.sources)) for (const f of src.findings || [])
      assert.ok(src.lines.some(l => l.toLowerCase().includes(f.match.toLowerCase())), `${id}: no line matches "${f.match}"`);
    let refusals = 0;
    for (const [dept, d] of Object.entries(sh.departments)) for (const r of d.requests) {
      assert.ok(!r.replies.at(-1).when, `${dept}:${r.id}: the last reply must be a fallback`);
      for (const rep of r.replies) {
        assert.ok(["done", "asks", "refused"].includes(rep.outcome));
        if (rep.outcome === "refused") { refusals++; assert.match(rep.text, /ask us|instead|can /i, "a refusal says what would work"); }
        if (rep.outcome !== "done") assert.ok(!rep.cost && !rep.finding);
      }
      assert.ok(sh.alerts.some(a => a.requests.includes(`${dept}:${r.id}`)), `${dept}:${r.id} is offered by no alert`);
    }
    assert.ok(refusals <= 1, "at most one refusal per shift");
    for (const a of sh.alerts) {
      for (const s of a.sources) assert.ok(sh.sources[s], `${a.id}: unknown source ${s}`);
      for (const ref of a.requests) assert.ok(A.request(sh, ref), `${a.id}: unknown request ${ref}`);
      const ans = a.answer;
      assert.ok(ans.verdict in A.VERDICTS && ans.status in A.STATUSES);
      assert.ok(ans.severity.length && ans.severity.every(x => A.SEVERITIES.includes(x)));
      assert.ok(ans.summary >= 0 && ans.summary < ans.summaries.length && ans.summaries.length >= 3);
      for (const r of ans.related) { assert.ok(ids.has(r)); assert.ok(sh.alerts.find(x => x.id === r).answer.related.includes(a.id), `${a.id}↔${r} must be linked both ways`); }
      for (const ref of ans.contain) assert.ok(a.requests.includes(ref), `${a.id}: needs ${ref} but doesn't offer it`);
      assert.ok(a.evidence.some(e => e.required) && a.evidence.some(e => !e.supports), `${a.id}: needs key evidence and a tempting wrong item`);
      assert.ok(a.arrives.at !== undefined || a.arrives.closed !== undefined);
      if (ans.verdict === "act") assert.ok(ans.contain.length, `${a.id}: an incident needs containment`);
    }
    assert.ok(Object.keys(all).length >= sh.alerts.length);
    // Guided: every alert has hints, and every suggested search is in the alert's own logs and finds something.
    for (const a of sh.alerts) {
      assert.ok(a.guide?.hints?.length >= 2, `${a.id}: needs at least two hints`);
      for (const h of a.guide.hints) assert.ok(h.split(/\s+/).length <= 45, `${a.id}: keep hints short: ${h}`);
      for (const [src, q] of a.guide.searches || []) {
        assert.ok(a.sources.includes(src), `${a.id}: suggested search in ${src}, which the alert doesn't open`);
        const lines = sh.sources[src].lines || [];
        if (lines.length) assert.ok(lines.some(l => q.toLowerCase().split(/\s+/).every(w => l.toLowerCase().includes(w))), `${a.id}: "${q}" finds nothing in ${src}`);
      }
    }
    assert.ok(sh.handover?.links, "a debrief line for missed links");
  });

  test(`${sh.id}: log lines follow their stated formats; public addresses are documentation ranges`, () => {
    for (const [id, src] of Object.entries(sh.sources)) {
      const fmt = formatOf(id);
      for (const l of src.lines) {
        if (fmt) assert.match(l, FORMATS[fmt], `${id}: ${l}`);
        for (const ip of l.match(/(?<![\w/.])\d{1,3}(?:\.\d{1,3}){3}\b/g) || []) assert.ok(DOC_IP.test(ip) || ip.startsWith("10.8.0."), `${id}: ${ip} is not a documentation or VPN-pool address`);
      }
    }
    const text = JSON.stringify(sh);
    assert.ok(!text.includes("\u2014"), "no em dashes");
    for (const host of text.match(/[\w.-]+\.(com|net|org|co\.uk)\b/g) || []) assert.fail(`real-looking domain: ${host}`);
  });

  test(`${sh.id}: the story agrees with itself`, () => {
    // The VPN address that made the files01 change belongs to the spraying session.
    const signin = sh.sources.signin?.lines || [], files = sh.sources["files01-auth"]?.lines || [];
    if (!signin.length) return;
    const success = signin.find(l => l.includes("result=success") && l.includes("src=203.0.113.77"));
    const vpnIp = success.match(/vpn_ip=(\S+)/)[1];
    assert.ok(files.some(l => l.includes(`Accepted password for mokafor from ${vpnIp}`)));
    const failures = signin.filter(l => l.includes("src=203.0.113.77") && l.includes("result=failure"));
    assert.equal(new Set(failures.map(l => l.match(/user=(\S+)/)[1])).size, failures.length, "a spray tries each account once");
    assert.match(sh.alerts.find(a => a.id === "a5").detection, new RegExp(`${failures.length + 1} accounts tried.*${failures.length} failed`));
    // useradd/usermod run under sudo: every one is preceded by its sudo COMMAND line.
    for (const cmd of ["useradd", "usermod", "passwd"]) assert.ok(files.some(l => l.includes(`COMMAND=/usr/`) && l.includes(cmd)), cmd);
  });
}
