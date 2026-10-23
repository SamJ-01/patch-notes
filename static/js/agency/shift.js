// PATCH//AGENCY shift rules: a simulated SOC shift. Pure: every action takes the shift (data from
// content/agency/*.json) and a state, and returns { state, events } for the UI to render.
// Nothing here knows about a particular alert, log or department: those all come from the shift file.
// Time is simulated: the clock moves only when the learner acts, by what the shift file says each action costs.
import { searchLines, matches, judgeEvidence } from "../missions/engine.js";

const clone = value => JSON.parse(JSON.stringify(value));
const set = (obj, path, value) => {
  const keys = path.split("."), last = keys.pop();
  let o = obj;
  for (const k of keys) o = o[k] = o[k] && typeof o[k] === "object" ? o[k] : {};
  o[last] = value;
};

export const VERDICTS = {
  act: "Malicious, and it needs action",
  noharm: "Malicious or suspicious, but no harm done",
  legit: "Legitimate activity (a false alarm)",
};
export const SEVERITIES = ["low", "medium", "high", "critical"];
export const STATUSES = { closed: "Closed", monitoring: "Closed, keep watching", escalated: "Escalated to the client" };

export const alertById = (shift, id) => shift.alerts.find(a => a.id === id);
export const sourcesOpen = (shift, state) => [...new Set(state.arrived.flatMap(id => alertById(shift, id).sources))];
// An evidence statement is checked once any finding that backs it has been found. Statements with nothing to
// find (the traps) are never "unchecked": citing one is wrong for its own reason.
const checked = (e, state) => !(e.findings || []).length || e.findings.some(f => state.found.includes(f));
// Judge the evidence ticked when closing: right and wrong as usual, and anything cited without having been
// checked first is not justified, with its own explanation.
function judgeClosed(a, c) {
  const unchecked = new Set(c.unchecked || []);
  const items = judgeEvidence(a.evidence, c.evidence).items.map(r => (unchecked.has(r.index) && r.supports
    ? { ...r, ok: false, unchecked: true, why: "You cited this without checking it first. Search the logs (or ask the team) until you've seen it yourself." } : r));
  return { pass: items.every(r => r.ok), items };
}

export function request(shift, ref) {
  const [dept, id] = String(ref).split(":");
  const d = shift.departments[dept], r = d?.requests.find(x => x.id === id);
  return r ? { ...r, ref, dept, deptName: d.name } : null;
}
// Every finding the shift can produce, from logs and from department replies, by id.
export function findings(shift) {
  const out = {};
  for (const src of Object.values(shift.sources)) {
    for (const f of src.findings || []) out[f.id] = f.finding;
    for (const e of src.emails || []) for (const f of e.findings || []) out[f.id] = f.finding;
  }
  for (const d of Object.values(shift.departments)) for (const r of d.requests) for (const rep of r.replies) if (rep.finding) out[rep.finding.id] = rep.finding.finding;
  return out;
}

// Levels: "guided" adds the lead's hints, suggested searches, feedback as each alert closes and a fill-in for
// the answers; "standard" is on your own, marked at the handover. The rules are the same for both.
export const LEVELS = { guided: "Guided", standard: "On your own" };
export function start(shift, { level = "standard" } = {}) {
  const state = { clock: 0, arrived: [], closed: {}, found: [], requests: [], facts: {}, spent: {}, handover: null, complete: false, opened: [],
    level: level in LEVELS ? level : "standard", hints: {} };
  const events = [];
  settle(shift, state, events);
  return { state, events };
}

function spend(shift, s, kind) {
  const minutes = shift.costs[kind] || 0;
  s.clock += minutes;
  s.spent[kind] = (s.spent[kind] || 0) + minutes;
}

// After every action: department replies that are now due arrive (oldest first), then any alerts whose
// arrival rule is met join the queue. An alert arrives at a time, or once enough alerts are closed.
function settle(shift, s, events) {
  const due = s.requests.filter(r => r.status === "pending" && r.due <= s.clock).sort((a, b) => a.due - b.due);
  for (const r of due) {
    const def = request(shift, r.ref), rep = def.replies[r.reply];
    r.status = rep.outcome;
    if (rep.outcome === "done") for (const [path, v] of Object.entries(def.effects || {})) set(s.facts, path, v);
    if (rep.finding && !s.found.includes(rep.finding.id)) s.found.push(rep.finding.id);
    events.push({ type: "reply", ref: r.ref, dept: def.deptName, label: def.label, text: rep.text, outcome: rep.outcome, finding: rep.finding?.finding || "", at: r.due });
  }
  const closed = Object.keys(s.closed).length;
  for (const a of shift.alerts) {
    if (s.arrived.includes(a.id)) continue;
    const { at, closed: n } = a.arrives;
    if ((at !== undefined && s.clock >= at) || (n !== undefined && closed >= n)) {
      s.arrived.push(a.id);
      events.push({ type: "arrive", id: a.id, title: a.title });
    }
  }
}

const open = (state) => !state.complete;

// Search one log source. Showing the whole log is free; each search costs time.
export function search(shift, state, sourceId, query) {
  const src = shift.sources[sourceId];
  if (!open(state) || !src || src.kind === "email" || !sourcesOpen(shift, state).includes(sourceId)) return { state, events: [] };
  const s = clone(state);
  const r = searchLines(src, query);
  if (r.query) spend(shift, s, "search");
  const found = r.findings.filter(f => !s.found.includes(f.id));
  for (const f of found) s.found.push(f.id);
  const events = [{ type: "search", source: sourceId, query: r.query, lines: r.lines, total: r.total, focused: r.focused, found: found.map(f => f.finding) }];
  settle(shift, s, events);
  return { state: s, events };
}

// Open one email in a mailbox source ({ kind: "email", emails: [...] }). Reading an email takes as long as a
// search the first time; its findings (what a careful reader notices) are recorded then.
export function openEmail(shift, state, sourceId, emailId) {
  const src = shift.sources[sourceId], email = src?.emails?.find(e => e.id === emailId);
  if (!open(state) || src?.kind !== "email" || !email || !sourcesOpen(shift, state).includes(sourceId)) return { state, events: [] };
  const s = clone(state);
  s.opened = s.opened || [];
  const first = !s.opened.includes(emailId);
  if (first) { s.opened.push(emailId); spend(shift, s, "search"); }
  const found = (email.findings || []).filter(f => !s.found.includes(f.id));
  for (const f of found) s.found.push(f.id);
  const events = [{ type: "email", source: sourceId, id: emailId, found: found.map(f => f.finding) }];
  settle(shift, s, events);
  return { state: s, events };
}

// What can be asked of other departments from this alert, and where each request stands.
export function requestsFor(shift, state, alertId) {
  const a = alertById(shift, alertId);
  return (a?.requests || []).map(ref => {
    const r = request(shift, ref), last = [...state.requests].reverse().find(x => x.ref === ref);
    return { ref, label: r.label, dept: r.deptName, status: last?.status || "", canSend: !last || last.status === "asks" };
  });
}

// Ask a department to act, optionally attaching a finding as justification. The reply is decided now,
// from the rules in the shift file, and arrives after the department's delay.
export function ask(shift, state, ref, attached = "") {
  const def = request(shift, ref);
  if (!open(state) || !def) return { state, events: [] };
  const offered = state.arrived.some(id => alertById(shift, id).requests?.includes(ref));
  const last = [...state.requests].reverse().find(x => x.ref === ref);
  if (!offered || (last && last.status !== "asks")) return { state, events: [] };
  if (attached && !state.found.includes(attached)) attached = "";
  const s = clone(state);
  spend(shift, s, "request");
  const verdict = Object.fromEntries(Object.entries(s.closed).map(([id, c]) => [id, c.verdict]));
  const reply = def.replies.findIndex(r => matches(r.when, { attached, verdict, facts: s.facts }));
  if (reply < 0) return { state, events: [] };
  const due = s.clock + (def.replies[reply].minutes ?? def.minutes);
  s.requests.push({ ref, attached, sent: s.clock, due, reply, status: "pending" });
  const events = [{ type: "sent", ref, dept: def.deptName, label: def.label, attached: attached ? findings(shift)[attached] : "", due }];
  settle(shift, s, events);
  return { state: s, events };
}

// Let time pass (for replies still on their way).
export function wait(shift, state) {
  if (!open(state)) return { state, events: [] };
  const s = clone(state);
  spend(shift, s, "wait");
  const events = [{ type: "wait", minutes: shift.costs.wait }];
  settle(shift, s, events);
  return { state: s, events };
}

// Close an alert with a verdict, a severity, the evidence ticked (indexes into alert.evidence) and any
// alerts it is linked to. Nothing is marked until the handover: a real shift doesn't tell you either.
export function close(shift, state, alertId, { verdict, severity, evidence = [], related = [] } = {}) {
  const a = alertById(shift, alertId);
  if (!open(state) || !a || !state.arrived.includes(alertId) || alertId in state.closed || !(verdict in VERDICTS) || !SEVERITIES.includes(severity)) return { state, events: [] };
  const s = clone(state);
  const ev = [...new Set(evidence)].filter(i => Number.isInteger(i) && i >= 0 && i < a.evidence.length).sort((x, y) => x - y);
  const rel = [...new Set(related)].filter(id => id !== alertId && alertById(shift, id));
  // Evidence cited before anything backing it was found (a search, an email, a team's reply) is noted now, at the
  // moment of closing, so recognising a statement in the list never counts as having checked it.
  const unchecked = ev.filter(i => !checked(a.evidence[i], s));
  s.closed[alertId] = { verdict, severity, evidence: ev, related: rel, unchecked };
  spend(shift, s, "close");
  const events = [{ type: "closed", id: alertId, title: a.title }];
  settle(shift, s, events);
  return { state: s, events };
}

export function reopen(shift, state, alertId) {
  if (!open(state) || !(alertId in state.closed)) return { state, events: [] };
  const s = clone(state);
  delete s.closed[alertId];
  return { state: s, events: [{ type: "reopened", id: alertId }] };
}

// Guided only: the lead's next hint for an alert. Hints are free (the clock doesn't move) but counted.
export function hint(shift, state, alertId) {
  const a = alertById(shift, alertId), hints = a?.guide?.hints || [];
  const used = state.hints?.[alertId] || 0;
  if (!open(state) || state.level !== "guided" || !state.arrived.includes(alertId) || used >= hints.length) return { state, events: [] };
  const s = clone(state);
  s.hints = { ...s.hints, [alertId]: used + 1 };
  return { state: s, events: [{ type: "hint", id: alertId, n: used + 1, of: hints.length, text: hints[used] }] };
}
export const hintsUsed = (state, alertId) => state.hints?.[alertId] || 0;

// The model answer for one alert, as the close form takes it (for "Show me the answer" in guided).
// The model answer. Given the learner's state, optional evidence is only cited once it has been checked; the
// required evidence is always cited (closing without having checked it is then judged as such).
export function modelClose(shift, alertId, state = null) {
  const a = alertById(shift, alertId);
  if (!a) return null;
  const cite = e => e.supports && (e.required || !state || checked(e, state));
  return { verdict: a.answer.verdict, severity: a.answer.severity[0], evidence: a.evidence.flatMap((e, i) => (cite(e) ? [i] : [])), related: [...(a.answer.related || [])] };
}

// Feedback on one closed alert, straight away (guided): verdict, severity and each evidence item, with why.
export function feedback(shift, state, alertId) {
  const a = alertById(shift, alertId), c = state.closed[alertId];
  if (!a || !c) return null;
  const ans = a.answer;
  const rel = new Set(c.related), want = new Set(ans.related || []);
  return {
    verdict: { chosen: c.verdict, answer: ans.verdict, ok: c.verdict === ans.verdict },
    severity: { chosen: c.severity, accepted: ans.severity, ok: ans.severity.includes(c.severity) },
    evidence: judgeClosed(a, c),
    links: { ok: [...want].every(x => rel.has(x)) && [...rel].every(x => want.has(x)), want: [...want] },
    contain: (ans.contain || []).map(ref => ({ ref, label: request(shift, ref).label })),
    why: ans.why,
  };
}

// The model handover (for the guided fill-in).
export const modelHandover = shift => ({
  status: Object.fromEntries(shift.alerts.map(a => [a.id, a.answer.status])),
  summary: Object.fromEntries(shift.alerts.map(a => [a.id, a.answer.summary])),
});

// Where the shift stands, for the bar's "what next" line: alerts still open, replies on their way, handover ready.
export function progress(shift, state) {
  const open = state.arrived.filter(id => !(id in state.closed)).length;
  const due = state.requests.filter(r => r.status === "pending").length;
  return { open, arrived: state.arrived.length, total: shift.alerts.length, due, handover: canHandOver(shift, state) };
}

export const canHandOver = (shift, state) => open(state) && shift.alerts.every(a => state.arrived.includes(a.id) && a.id in state.closed);

// End the shift: for each alert a status and the summary chosen from the written options, plus an
// optional free-text note that the debrief shows next to the model answer.
export function handover(shift, state, { status = {}, summary = {}, note = "" } = {}) {
  if (!canHandOver(shift, state)) return { state, events: [] };
  const s = clone(state);
  s.handover = {
    status: Object.fromEntries(shift.alerts.map(a => [a.id, status[a.id] in STATUSES ? status[a.id] : ""])),
    summary: Object.fromEntries(shift.alerts.map(a => [a.id, Number.isInteger(summary[a.id]) ? summary[a.id] : -1])),
    note: String(note).slice(0, 2000),
  };
  s.complete = true;
  return { state: s, events: [{ type: "complete", report: debrief(shift, s) }] };
}

// The debrief: verdicts, evidence, links between alerts, containment (missing and over the top), the
// handover against the model, and where the time went. Speed is reported, never scored.
export function debrief(shift, state) {
  const label = ref => request(shift, ref).label;
  const pairs = list => new Set(list.flatMap(([id, rel]) => rel.map(r => [id, r].sort().join("+"))));
  const chosenPairs = pairs(Object.entries(state.closed).map(([id, c]) => [id, c.related]));
  const modelPairs = pairs(shift.alerts.map(a => [a.id, a.answer.related || []]));
  const alerts = shift.alerts.map(a => {
    const c = state.closed[a.id] || { verdict: "", severity: "", evidence: [], related: [] }, ans = a.answer;
    const contain = (ans.contain || []).map(ref => {
      const st = [...state.requests].reverse().find(r => r.ref === ref)?.status || "";
      return { ref, label: label(ref), status: st, ok: st === "done" || st === "pending" };
    });
    const h = state.handover || { status: {}, summary: {} };
    return {
      id: a.id, title: a.title, why: ans.why,
      verdict: { chosen: c.verdict, answer: ans.verdict, ok: c.verdict === ans.verdict },
      severity: { chosen: c.severity, accepted: ans.severity, ok: ans.severity.includes(c.severity) },
      evidence: judgeClosed(a, c),
      contain, containOk: contain.every(x => x.ok),
      status: { chosen: h.status[a.id] || "", answer: ans.status, ok: h.status[a.id] === ans.status },
      summary: { chosen: h.summary[a.id] ?? -1, answer: ans.summary, ok: h.summary[a.id] === ans.summary, model: ans.summaries[ans.summary] },
    };
  });
  const costs = state.requests.filter(r => r.status === "done").map(r => ({ ref: r.ref, label: label(r.ref), cost: request(shift, r.ref).replies[r.reply].cost })).filter(x => x.cost);
  const links = {
    found: [...modelPairs].filter(p => chosenPairs.has(p)),
    missed: [...modelPairs].filter(p => !chosenPairs.has(p)),
    wrong: [...chosenPairs].filter(p => !modelPairs.has(p)),
  };
  const right = alerts.filter(a => a.verdict.ok).length;
  const checks = [
    { label: "Verdicts", ok: right === alerts.length, text: `${right} of ${alerts.length} right` },
    { label: "Evidence", ok: alerts.every(a => a.evidence.pass), text: `${alerts.filter(a => a.evidence.pass).length} of ${alerts.length} alerts justified` },
    { label: "Linked alerts", ok: !links.missed.length && !links.wrong.length, text: links.missed.length ? "A connection was missed" : links.wrong.length ? "Linked alerts that aren't connected" : "Connections found" },
    { label: "Containment", ok: alerts.every(a => a.containOk), text: alerts.every(a => a.containOk) ? "Everything needed was asked for" : "Something needed wasn't asked for" },
    { label: "Proportion", ok: !costs.length, text: costs.length ? `${costs.length} action${costs.length === 1 ? "" : "s"} went too far` : "Nothing went too far" },
    { label: "Handover", ok: alerts.every(a => a.status.ok && a.summary.ok), text: `${alerts.filter(a => a.status.ok && a.summary.ok).length} of ${alerts.length} alerts handed over correctly` },
  ];
  const pending = state.requests.filter(r => r.status === "pending").map(r => label(r.ref));
  const hintCount = Object.values(state.hints || {}).reduce((n, x) => n + x, 0);
  return { alerts, links, costs, pending, checks, passed: checks.filter(c => c.ok).length, clock: state.clock, spent: state.spent, note: state.handover?.note || "", modelNote: shift.handover?.model || "",
    level: state.level || "standard", hints: hintCount, linkNote: shift.handover?.links || "" };
}

// Shadowing: the shift worked by an experienced analyst, as a list of steps to watch, built by playing this
// shift's own content through the rules above (so it can never disagree with them). For each alert, in the order
// they arrive: the lead's guided searches (narrated with the guided hints), any emails with something to notice,
// the requests the model answer needs (with a finding attached when the team wants a reason), then the close.
// It ends with the model handover. Steps: { kind, clock, say, ... } where kind is open | search | email | think |
// ask | reply | arrive | wait | close | handover.
export function shadow(shift) {
  let s = start(shift, { level: "guided" }).state;
  const steps = [], all = findings(shift);
  const push = (kind, extra = {}) => steps.push({ kind, clock: s.clock, ...extra });
  // Department replies and new alerts that come in after any action become steps of their own.
  const take = r => {
    s = r.state;
    for (const ev of r.events) {
      if (ev.type === "reply") push("reply", { ref: ev.ref, dept: ev.dept, label: ev.label, text: ev.text, outcome: ev.outcome });
      if (ev.type === "arrive") push("arrive", { id: ev.id, title: ev.title });
    }
    return r;
  };
  // The finding to attach to a request so the team acts on it: none if they don't need one, else the first
  // (newest first) that gets a "done".
  const attachFor = ref => {
    for (const att of ["", ...[...s.found].reverse()]) {
      const r = ask(shift, s, ref, att), sent = r.state.requests.at(-1);
      if (r.events.length && sent?.ref === ref && request(shift, ref).replies[sent.reply].outcome !== "asks") return att;
    }
    return s.found.at(-1) || "";
  };
  const work = a => {
    const hints = a.guide?.hints || [], searches = a.guide?.searches || [];
    push("open", { id: a.id, say: a.detection });
    searches.forEach(([src, q], i) => {
      const r = take(search(shift, s, src, q)), ev = r.events.find(e => e.type === "search");
      if (ev) steps.splice(steps.length - r.events.filter(e => e.type === "reply" || e.type === "arrive").length, 0,
        { kind: "search", clock: s.clock, id: a.id, source: src, query: ev.query, lines: ev.lines, total: ev.total, found: ev.found, say: hints[i] || "" });
    });
    for (const src of a.sources.filter(id => shift.sources[id]?.kind === "email")) {
      for (const e of shift.sources[src].emails.filter(e => (e.findings || []).length)) {
        const r = take(openEmail(shift, s, src, e.id)), ev = r.events.find(x => x.type === "email");
        steps.push({ kind: "email", clock: s.clock, id: a.id, source: src, email: e.id, found: ev?.found || [], say: "" });
      }
    }
    for (const h of hints.slice(searches.length)) push("think", { id: a.id, say: h });
    for (const ref of a.answer.contain || []) {
      const att = attachFor(ref), def = request(shift, ref);
      take(ask(shift, s, ref, att));
      push("ask", { id: a.id, ref, dept: def.deptName, label: def.label, attached: att ? all[att] : "" });
    }
    const m = modelClose(shift, a.id, s);
    take(close(shift, s, a.id, m));
    push("close", { id: a.id, verdict: VERDICTS[m.verdict], severity: m.severity, evidence: m.evidence.map(i => a.evidence[i].text), related: m.related,
      summary: a.answer.summaries[a.answer.summary], say: a.answer.why });
  };
  for (let guard = 0; guard < 12; guard++) {
    const todo = s.arrived.map(id => alertById(shift, id)).filter(a => !(a.id in s.closed));
    if (todo.length) { work(todo[0]); continue; }
    if (canHandOver(shift, s) && !s.requests.some(r => r.status === "pending")) break;
    take(wait(shift, s));
    push("wait", { minutes: shift.costs.wait });
  }
  const r = handover(shift, s, { ...modelHandover(shift), note: shift.handover?.model || "" });
  s = r.state;
  push("handover", { text: shift.handover?.model || "", links: shift.handover?.links || "" });
  return { steps, report: r.events[0]?.report || null };
}
