# PATCH//AGENCY: pilot design

Status: draft for review (21 Oct 2026). Nothing here is built yet. Open decisions are at the end.

## 1. The idea in one paragraph

PATCH//AGENCY is a simulated shift at a fictional managed security provider. The learner works the SOC desk: alerts arrive in a queue, they investigate each one with the log viewer they already know from "The 3am logins", decide what it is, ask other departments to act, and hand over at the end of the shift. Other departments (Service Desk, Network Operations, Identity, the client contact) are not playable in the pilot. They are automated: they answer requests from scripted rules, sometimes push back, and their actions change what the learner sees next. Missions teach one problem at a time; the Agency teaches the job: several problems at once, most of them noise, with other people involved.

## 2. Why this, and why now

- **It reuses what exists.** The log viewer (`scenario.log`, `engine.searchLog`), the root-cause question and the evidence check are exactly the SOC loop: search, decide, justify. The pilot adds orchestration around them, not a new kind of tool.
- **It fits the first audience** (decision D, Horizon 1): aspiring SOC and IT people. Triage under a queue, telling noise from signal and writing a handover are the skills entry-level SOC roles ask for, and the ones learners say courses skip.
- **It is a test of the engine's reuse.** If a shift can be pure data plus a small pure module, the same pattern can later run a Service Desk or Network Ops shift.

## 3. Pilot scope

One shift, about 20 to 25 minutes, five alerts. Desktop and phone. No accounts, no backend, no real-time pressure.

| # | Alert (as the queue shows it) | What it really is | Teaches |
|---|---|---|---|
| 1 | "Multiple failed SSH logins on web01" | Brute force that failed; nothing got in | A true positive that needs no containment, only a note. Contrast with the mission |
| 2 | "Impossible travel: j.patel signed in from two countries" | The client's VPN exit moved; benign | False positive: check before you escalate. Wrong turn: locking the account (Identity complies, the client contact complains) |
| 3 | "Web server 404 spike" | A vulnerability scanner from a documentation-range IP; no successful requests | Benign true positive: real activity, no harm. Reading status codes in an access log |
| 4 | "New admin account created on fileserver01" | The real incident: created with a password sprayed from alert 5's source | Correlation across alerts and sources; proportionate containment via Identity and Network Ops |
| 5 | "Password spray against the VPN" (arrives mid-shift) | The start of alert 4's chain | Ordering: the later alert explains the earlier one |

Out of scope for the pilot: playable non-SOC departments, randomised or generated shifts, more than one shift, timers, leaderboards, Windows Event Log sources (see 8.3).

## 4. How a shift plays

1. **Briefing.** The shift lead (automated) introduces the client (a fictional company) and the queue. One screen, skippable.
2. **The queue.** A list of alerts with source, time and the detection's own severity. Alerts can arrive part-way through (alert 5 appears after the learner has closed two alerts or spent 30 simulated minutes, whichever comes first).
3. **Investigate.** Opening an alert shows its detail and the log sources it gives access to. The learner searches them with the existing log viewer. Findings are recorded per alert, but a finding in one alert's logs can also count as evidence for another (this is how alert 4 and 5 connect).
4. **Decide.** For each alert: a verdict (true positive, benign true positive, false positive) and a severity. Where the verdict is a true positive, the evidence check from missions follows.
5. **Act through departments.** Actions are requests, not buttons that fix things: "Ask Identity to disable j.patel", "Ask Network Ops to block 203.0.113.0/24 at the edge", "Ask the Service Desk to call the user". Each department replies after a set number of simulated minutes. Replies come from rules in the shift file: they can comply, ask for justification (pick the evidence you'd attach), or refuse with a reason ("We don't block a whole /24 without a client change ticket").
6. **Handover.** At the end the learner completes a structured handover: per alert, status (closed, monitoring, escalated), one-line summary (chosen from options in the pilot, see 9.4) and what the next shift should watch. The debrief compares it with a model handover.

### Simulated time, not real time

The clock moves only when the learner acts: each search costs a minute, each request a few, each closed alert a few more. Nothing expires while the learner reads. This keeps the shift accessible (screen readers, reduced motion, slow readers, phones) and keeps state deterministic and testable. The cost of actions still matters: the debrief shows how long the shift took and where the time went, without punishing anyone for reading carefully.

## 5. Scoring and debrief

Not speed. The debrief reports, per alert and overall:

- **Verdict:** right or wrong, and the cost of the wrong one (a missed true positive outweighs a false positive escalated).
- **Evidence:** from the existing evidence check.
- **Proportion:** did the containment fit the problem? Locking a user for a false positive, or blocking a range the client needs, is noted as a cost even when the department complied.
- **Correlation:** did the learner link alert 4 and 5?
- **Handover:** matched against the model handover, item by item.

XP follows the existing mission pattern. No badges that imply a qualification (Horizon 1, step 7).

## 6. Architecture

Follows the engine/exam pattern: pure rules, tested; the UI only renders events.

```
content/agency/shift-01.json   the shift: client, alerts, log sources, departments, rules, model handover
static/js/agency/shift.js      pure rules: start, open, search, verdict, request, tick, handover, debrief
static/js/agency/ui.js         queue, alert panel, department inbox, handover form (reuses log viewer UI)
tests/agency.test.mjs          state transitions and content checks
```

### 6.1 Reuse, and the one refactor it needs

`engine.searchLog` reads `scenario.log` and `state.evidence`. The shift has several logs. The refactor: extract the matching into a pure `searchLines(log, query)` that returns `{ lines, focused, found }`, and have `searchLog` call it. The SSH mission's behaviour and tests stay unchanged; the shift calls `searchLines` with whichever source is open. The log viewer's rendering code in `missions/ui.js` is moved to a small shared module if the Agency UI needs it unchanged, otherwise imported as is.

### 6.2 Shift file (sketch)

```json
{
  "id": "shift-01",
  "client": { "name": "(fictional)", "about": "..." },
  "simplification": "...",
  "sources": {
    "web01-auth": { "name": "/var/log/auth.log (web01, Ubuntu 22.04)", "lines": [], "findings": [] },
    "web01-nginx": { "name": "/var/log/nginx/access.log (web01)", "lines": [], "findings": [] }
  },
  "alerts": [
    { "id": "a1", "title": "...", "severity": "medium", "arrives": { "at": 0 },
      "sources": ["web01-auth"], "verdict": "tp", "evidence": [], "why": "..." },
    { "id": "a5", "arrives": { "closed": 2, "orAt": 30 } }
  ],
  "departments": {
    "identity": { "name": "Identity team", "requests": [
      { "id": "disable-jpatel", "label": "Disable j.patel's account", "minutes": 10,
        "replies": [ { "when": { "a2.verdict": "fp" }, "text": "...", "cost": "disrupted a legitimate user" },
                     { "text": "Done. Account disabled at {time}." } ],
        "effects": { "accounts.jpatel": "disabled" } } ] }
  },
  "costs": { "search": 1, "close": 3 },
  "handover": { "model": [] }
}
```

Department replies use the same "first matching rule wins" idea as mission tool outcomes (`matches(when, state)`), so there is one rule language across missions and shifts.

### 6.3 Saved progress

A new `agency: {}` field in `FRESH()`, keyed by shift id, holding only what's needed to resume or show results: `{ done, best, at }` in the pilot (no mid-shift resume; see 9.2). Per the conventions, it gets cleaning in `cleanProgress()` and a test in `tests/page.test.mjs`.

## 7. Tests

- `searchLines` refactor: every existing SSH mission test passes unchanged.
- Arrival: alert 5 arrives on either condition, never twice, never before its rule.
- Clock: each action costs what the file says; nothing advances without an action.
- Departments: each request's reply matches its rules for both right and wrong prior verdicts; refusals have no effects; effects apply only on compliance.
- Correlation: a finding from alert 5's source counts for alert 4's evidence check.
- Debrief: a perfect run, a run with each wrong verdict, and an over-containment run each produce the expected report.
- Content: every source line follows its stated format (regex per source), every IP is in a documentation range, every alert's evidence refers to a finding that exists, every department request is reachable.
- Browser: `tests/browser_check.mjs` on the queue, an open alert and the handover, dark and light, 390 px and desktop, axe clean.

## 8. Accuracy

### 8.1 Sources in the pilot

Only formats the site already gets right or that are simple to verify: OpenSSH `auth.log` (Ubuntu 22.04, as in the mission), nginx combined access log, and a VPN/identity sign-in log presented as a generic SIEM table and labelled as such in `simplification`, because real formats differ by product.

### 8.2 Alerts

Alert titles and fields are written as a generic SIEM would show them, labelled "simulated detection". No vendor names or rule names.

### 8.3 Deferred

Windows Event Log (4624/4625/4720 and friends) is the obvious next source for alert 4 but needs careful field-by-field checking. The pilot uses a Linux file server (`useradd` in `auth.log`) to keep everything in formats already verified, and adds Windows in a later shift.

## 9. Open decisions

1. **The agency's name and look.** "PATCH//AGENCY" as the section name; the in-story employer needs a fictional name. Proposal: name it in the build commit after a quick check that it isn't a real firm.
2. **Mid-shift resume.** Pilot proposal: no. A shift is 20 to 25 minutes and state is small; leaving restarts it. Revisit if learners ask.
3. **Where it lives.** Proposal: its own entry under Learn, after Missions, marked "Pilot". Recommended after completing "The 3am logins" but not locked behind it.
4. **Free-text handover.** Typed summaries are better practice but can't be marked without a backend or AI. Pilot proposal: choose from written options, with an optional free-text box that is shown back in the debrief next to the model answer for self-comparison.
5. **Department push-back tone.** Realistic friction teaches, but too much is frustrating. Proposal: at most one refusal per shift, and it always says what would change the answer.

## 10. Build order

Each step is one commit with tests, in the style of Horizon 1.

1. Refactor `searchLog` onto `searchLines`; no behaviour change.
2. `shift.js` rules and `tests/agency.test.mjs` against a tiny test shift (two alerts, one department).
3. Write and fact-check `shift-01.json`; content tests.
4. UI: queue, alert panel with log viewer, department inbox, handover, debrief.
5. Progress field, route, Learn entry, browser checks.
6. Feedback from 3 to 5 learners before a second shift or a playable second department.
