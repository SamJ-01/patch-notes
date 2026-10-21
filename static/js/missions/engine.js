// Mission Engine: the rules of a mission, with no DOM code.
//
// A mission is data (content/missions/*.json): devices, messages, and per-mode behaviour.
// Every function takes the scenario and the current state and returns { state, events }:
// a fresh state (the input is never mutated) and a list of things that happened, which the
// UI turns into animations, narration and text. Because the engine is pure, every learner
// path (right answers, wrong answers, workarounds, resets) can be tested without a browser.

const clone = value => JSON.parse(JSON.stringify(value));

export const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

function set(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

const applyEffects = (devices, effects = {}) => Object.entries(effects).forEach(([path, v]) => set(devices, path, v));

// A condition matches when every path equals its value, or satisfies { startsWith } or { oneOf: [...] }.
export function matches(when = {}, devices) {
  return Object.entries(when).every(([path, want]) => {
    const have = get(devices, path);
    if (want && typeof want === "object" && "startsWith" in want) return String(have ?? "").startsWith(want.startsWith);
    if (want && typeof want === "object" && Array.isArray(want.oneOf)) return want.oneOf.includes(have);
    return have === want;
  });
}

// Fill "{pc.ip}"-style placeholders from the current device state.
export const fill = (text, devices) => String(text || "").replace(/\{([\w.]+)\}/g, (_, p) => String(get(devices, p) ?? ""));

// How each device should look right now ("ok", "bad", "warn"…), from the scenario's appearance rules:
// for each device, the first rule whose condition matches wins. Devices with no match look normal.
export function appearance(scenario, devices) {
  const out = {};
  for (const [id, rules] of Object.entries(scenario.appearance || {})) {
    const rule = rules.find(r => matches(r.when, devices));
    if (rule) out[id] = rule.state;
  }
  return out;
}

export function start(scenario, mode) {
  const m = scenario.modes[mode];
  if (!m) throw new Error(`Unknown mode: ${mode}`);
  const devices = clone(scenario.devices);
  applyEffects(devices, m.start);
  return {
    mode, devices,
    pos: 0, pending: null, answered: {}, tries: {},
    evidence: [], toolsUsed: [], hintsUsed: 0, mistakes: 0,
    goalMet: false, workaroundSeen: false, rootCauseFound: false, evidenceTries: 0, complete: false,
  };
}

const sequence = (scenario, state) => scenario.modes[state.mode].sequence || [];

// Guided / practice: play the next message, or stop at a prediction checkpoint first.
export function next(scenario, state) {
  const seq = sequence(scenario, state);
  if (state.complete || state.pending || state.pos >= seq.length) return { state, events: [] };
  const s = clone(state);
  const id = seq[s.pos];
  const checkpoint = (scenario.modes[s.mode].checkpoints || {})[id];
  if (checkpoint && !s.answered[id]) {
    s.pending = id;
    return { state: s, events: [{ type: "question", id, ...checkpoint }] };
  }
  const msg = scenario.messages[id];
  applyEffects(s.devices, msg.effects);
  s.pos += 1;
  const events = [{ type: "message", id, msg }];
  if (s.pos >= seq.length) {
    s.complete = true;
    events.push({ type: "complete", debrief: scenario.modes[s.mode].debrief });
  }
  return { state: s, events };
}

export function answer(scenario, state, choice) {
  if (!state.pending) return { state, events: [] };
  const s = clone(state);
  const q = scenario.modes[s.mode].checkpoints[s.pending];
  s.tries[s.pending] = (s.tries[s.pending] || 0) + 1;
  if (choice === q.answer) {
    s.answered[s.pending] = true;
    const id = s.pending;
    s.pending = null;
    return { state: s, events: [{ type: "answer", id, correct: true, why: q.why }] };
  }
  s.mistakes += 1;
  // After two wrong tries, explain the answer rather than leaving the learner stuck.
  const reveal = s.tries[s.pending] >= 2;
  return { state: s, events: [{ type: "answer", id: s.pending, correct: false, reveal, why: reveal ? q.why : null, correctIndex: reveal ? q.answer : null }] };
}

// Challenge: run a tool. Its first matching outcome decides the output, effects and any messages.
export function useTool(scenario, state, toolId) {
  const mode = scenario.modes[state.mode];
  const tool = (mode.tools || []).find(t => t.id === toolId);
  if (!tool || state.complete) return { state, events: [] };
  const s = clone(state);
  const outcome = tool.outcomes.find(o => matches(o.when, s.devices));
  const events = [];
  const played = [];
  for (const id of outcome.play || []) {
    const msg = scenario.messages[id];
    applyEffects(s.devices, msg.effects);
    played.push({ id, msg });
  }
  if (outcome.noReply) {
    // The messages went out but nothing answered, so whatever they changed (e.g. a "searching…"
    // status) goes back to how it was before.
    for (const { msg } of played) for (const path of Object.keys(msg.effects || {})) set(s.devices, path, get(state.devices, path));
  }
  applyEffects(s.devices, outcome.set);
  s.toolsUsed.push(toolId);
  if (outcome.finding && !s.evidence.some(e => e.finding === outcome.finding)) s.evidence.push({ tool: toolId, finding: outcome.finding });
  events.push({ type: "tool", tool, output: fill(outcome.output, s.devices), finding: outcome.finding || "", played, noReply: !!outcome.noReply });

  if (mode.workaround && !s.workaroundSeen && matches(mode.workaround, s.devices)) {
    s.workaroundSeen = true;
    events.push({ type: "workaround" });
  }
  if (!s.goalMet && matches(mode.goal, s.devices)) {
    s.goalMet = true;
    events.push({ type: "goal", ...mode.rootCause });
  }
  return { state: s, events };
}

export function answerRootCause(scenario, state, choice) {
  const rc = scenario.modes[state.mode].rootCause;
  if (!state.goalMet || state.complete) return { state, events: [] };
  const s = clone(state);
  if (s.rootCauseFound) return { state, events: [] };
  if (choice === rc.answer) {
    s.rootCauseFound = true;
    const correct = { type: "answer", id: "rootCause", correct: true, why: rc.why };
    // With evidence items, the learner must also show which evidence supports the diagnosis.
    if (rc.evidence?.length) return { state: s, events: [correct, { type: "evidenceCheck", q: rc.evidenceQ || "Which evidence supports this diagnosis?", items: rc.evidence.map(({ text, tool }) => ({ text, tool })) }] };
    s.complete = true;
    return { state: s, events: [correct, { type: "complete", debrief: scenario.modes[s.mode].debrief }] };
  }
  s.mistakes += 1;
  return { state: s, events: [{ type: "answer", id: "rootCause", correct: false, why: null }] };
}

// Mark a set of ticked evidence (`chosen`: indexes into `evidence`). It passes when every required item is
// ticked and nothing that isn't evidence is; optional supporting items can be ticked or not.
export function judgeEvidence(evidence, chosen) {
  const picked = new Set(chosen);
  const items = evidence.map((e, i) => {
    const selected = picked.has(i);
    const ok = e.supports ? selected || !e.required : !selected;
    return { index: i, selected, supports: !!e.supports, required: !!e.required, ok, why: e.why };
  });
  return { pass: items.every(r => r.ok), items };
}

// The reasoning check: `chosen` is the list of evidence indexes the learner ticked.
// It passes when every required item is ticked and nothing that isn't evidence is. Optional
// supporting items can be ticked or not. Every item gets feedback either way, so a wrong attempt teaches.
export function answerEvidence(scenario, state, chosen) {
  const rc = scenario.modes[state.mode].rootCause;
  if (!state.rootCauseFound || state.complete || !rc.evidence?.length) return { state, events: [] };
  const s = clone(state);
  const { pass, items } = judgeEvidence(rc.evidence, chosen);
  s.evidenceTries = (s.evidenceTries || 0) + 1;
  if (!pass) {
    s.mistakes += 1;
    return { state: s, events: [{ type: "evidenceResult", pass, items }] };
  }
  s.complete = true;
  return { state: s, events: [{ type: "evidenceResult", pass, items }, { type: "complete", debrief: scenario.modes[s.mode].debrief }] };
}

export function hint(scenario, state) {
  const hints = scenario.modes[state.mode].hints || [];
  if (!hints.length) return { state, events: [] };
  const s = clone(state);
  const text = hints[Math.min(s.hintsUsed, hints.length - 1)];
  s.hintsUsed += 1;
  return { state: s, events: [{ type: "hint", text, last: s.hintsUsed >= hints.length }] };
}

// Search one log ({ lines, findings }) like grep. Every space-separated term must appear in a line
// (case-insensitive). A focused search (non-empty, and narrower than the whole log) that turns up a line
// containing a finding's `match` reports that finding (the finding objects themselves). Pure: the caller decides what to record.
// Shared by mission log viewers and Agency shifts, which have several logs.
export function searchLines(log, query) {
  const words = String(query || "").split(/\s+/).filter(Boolean), terms = words.map(w => w.toLowerCase());
  const lines = log.lines.filter(l => terms.every(t => l.toLowerCase().includes(t)));
  const focused = terms.length > 0 && lines.length > 0 && lines.length < log.lines.length;
  const findings = focused ? (log.findings || []).filter(f => lines.some(l => l.toLowerCase().includes(f.match.toLowerCase()))) : [];
  return { query: words.join(" "), lines, total: log.lines.length, focused, findings };
}

// Log viewer: search the scenario's log (scenario.log). Findings turned up by a focused search are
// recorded as evidence. The log is one fixed source, so whatever a learner searches, the results
// can't contradict each other.
export function searchLog(scenario, state, query) {
  const log = scenario.log;
  if (!log || state.complete) return { state, events: [] };
  const { findings, ...r } = searchLines(log, query);
  const s = clone(state);
  const found = [];
  for (const { finding } of findings) {
    if (!s.evidence.some(e => e.finding === finding)) { s.evidence.push({ tool: "log", finding }); found.push(finding); }
  }
  if (!s.toolsUsed.includes("log")) s.toolsUsed.push("log");
  return { state: s, events: [{ type: "log", ...r, found }] };
}

// ---------- Email inspector (scenario.emails: { org, intro, items: [{ id, headers, body, links, findings }] })
// Parse raw RFC 5322 headers into the parts an analyst reads: who it claims to be from, where replies go,
// the servers it passed through and the receiving server's SPF, DKIM and DMARC verdicts (RFC 8601).
// The scenario stores the raw headers only, so the picture can never disagree with them.
const addr = v => {
  const m = String(v || "").match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/) || [null, "", String(v || "").trim()];
  const address = m[2].trim();
  return { name: (m[1] || "").trim(), address, domain: address.includes("@") ? address.split("@").pop().toLowerCase() : "" };
};
export function parseHeaders(raw) {
  const fields = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && fields.length) fields.at(-1)[1] += " " + line.trim();
    else { const i = line.indexOf(":"); if (i > 0) fields.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]); }
  }
  const one = n => fields.find(([k]) => k === n)?.[1] || "";
  // Received headers are added on top, so the first one is the last hop: reverse them to read in order.
  const received = fields.filter(([k]) => k === "received").map(([, v]) => {
    const m = v.match(/^from\s+(\S+)\s+\(([^)]*?)\[([\d.:a-fA-F]+)\]\)\s+by\s+([^\s;]+)/);
    return m ? { helo: m[1], rdns: m[2].trim(), ip: m[3], by: m[4] } : { helo: "", rdns: "", ip: "", by: (v.match(/by\s+([^\s;]+)/) || [])[1] || "" };
  }).reverse();
  const results = fields.filter(([k]) => k === "authentication-results").map(([, v]) => v).join("; ");
  const verdict = k => { const m = results.match(new RegExp(`\\b${k}=(\\w+)([^;]*)`)); return m ? { result: m[1].toLowerCase(), detail: m[2].trim() } : { result: "none", detail: "" }; };
  return {
    from: addr(one("from")), replyTo: one("reply-to") ? addr(one("reply-to")) : null, returnPath: addr(one("return-path")),
    to: one("to"), subject: one("subject"), date: one("date"), messageId: one("message-id"),
    received, auth: { spf: verdict("spf"), dkim: verdict("dkim"), dmarc: verdict("dmarc") },
  };
}
// Where a link really goes: the host in its href, against the text the reader sees.
export function linkFacts({ text, href }) {
  const host = s => (String(s).match(/^[a-z][\w+.-]*:\/\/([^/:?#]+)/i) || [])[1]?.toLowerCase() || "";
  const real = host(href), shown = host(text);
  return { text, href, real, shown, mismatch: !!shown && shown !== real };
}
// Open a reported email: its findings are recorded as evidence (tool "email").
export function inspectEmail(scenario, state, id) {
  const email = scenario.emails?.items.find(e => e.id === id);
  if (!email || state.complete) return { state, events: [] };
  const s = clone(state), found = [];
  for (const finding of email.findings || []) {
    if (!s.evidence.some(e => e.finding === finding)) { s.evidence.push({ tool: "email", finding }); found.push(finding); }
  }
  if (!s.toolsUsed.includes("email")) s.toolsUsed.push("email");
  return { state: s, events: [{ type: "email", email, parsed: parseHeaders(email.headers), links: (email.links || []).map(linkFacts), found }] };
}
