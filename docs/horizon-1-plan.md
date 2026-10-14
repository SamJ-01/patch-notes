# Horizon 1: audit and proposed plan

Based on *PATCH//NOTES Product Vision & Claude Implementation Brief* (14 Oct 2026). This document records what exists today, how it compares with the brief, and the proposed order of work. Nothing destructive happens until the open decisions at the end are made.

## 1. Audit: what exists today (commit `6bd7435`)

| Area | Current state | Fit with the brief |
|---|---|---|
| Identity | Terminal-inspired console theme, command palette, keyboard shortcuts | ✅ Keep as a motif. Terminal conventions are optional (everything also works by clicking/tapping) |
| Navigation | 8 flat tabs: today, news, cve-radar, learn, labs, play, careers, progress | ⚠️ Flat and news-led. The brief wants learning first and news as a supporting area |
| Today | News changelog first, then welcome, stack alerts, daily challenge, next path step | ⚠️ Becomes a *dashboard*: resume / recommended mission first, news second |
| News + CVE Radar | 12 feeds, topic tagging (93% coverage), KEV/EPSS prioritisation, trend charts, glossary hovers | ✅ Works well; demote to a supporting section |
| Learn | 22 text lessons with sourced cases, 4 learning paths, 254-term glossary, static lesson pages | ⚠️ Accurate but text-only: no visual models yet |
| Labs | 3 labs (auth.log, email headers, CVSS builder) | ⚠️ Question-and-answer style. They don't simulate state that responds to choices. They're the seed of the Mission Engine, not the engine itself |
| Play | Phish or Legit, quiz, 3-flag CTF | ✅ Keep |
| Careers | 5 roles with skills, certs, starting points, linked paths | ✅ Keep. Certifications deserve their own section later |
| Progress | XP, 6 access levels, 16 badges, streak, path bonuses (browser-only) | ⚠️ The brief warns against streak pressure and implying badges are qualifications. Needs a lighter touch |
| AI content | Drafted daily, published only after human review | ✅ Matches the brief's accuracy principle |
| Engineering | Static site on GitHub Pages, Python stdlib build, 24 Python + 5 Node tests gating deploys | ✅ Good base. The page is one ~1,700-line HTML/JS file, which a reusable engine will need split into modules |
| Accessibility | Contrast checked (body text 15.7:1, secondary text 6:1), keyboard nav, reduced-motion for animations, validated chart palette | ✅ Partial. Needs a full keyboard/screen-reader pass once missions exist |
| Data & privacy | No accounts, no tracking, progress in localStorage | ✅ Matches the brief |
| Repo & licence | Public repo, **no licence file**, GitHub Pages on the free plan | ⚠️ Open decision (section 4) |
| Third-party assets | Google Fonts (Chakra Petch, IBM Plex), data from NVD / CISA KEV / FIRST EPSS / MITRE CWE, headlines from 12 outlets | ⚠️ Attributions exist in the footer and README but there's no single third-party record |

## 2. Proposed order of work (Horizon 1)

Each step is a focused commit with tests and a short change summary.

1. **Housekeeping (small, no behaviour change).** Add a `THIRD_PARTY.md` record of fonts, data sources and feeds with their terms. Add a copyright notice reflecting the chosen licence decision.
2. **Information architecture.** Group navigation into *Learn* (Missions, Lessons, Glossary), *Practise* (Play), *You* (Progress, Careers) and a secondary *Updates* area (News, CVE Radar). Turn Today into a dashboard: continue / recommended mission first, news below. Use a simpler mobile menu. Keep every existing feature reachable.
3. **Split the page into modules.** Use plain ES modules with no bundler and no new dependencies, so simulations can share components. The tests move with the code.
4. **Mission Engine foundations.** Missions become data-driven scenarios (topology, device state, tools/actions, checks, hints per mode, debrief). Reusable components:
   - devices
   - links
   - animated packets
   - speech-bubble narration
   - state badges
   - an inspection panel
   - play / pause / step / replay / speed / reset controls
   - a text transcript for every animation

   Reduced-motion users get step-by-step mode by default.
5. **First mission** (see decision A), with guided, practice and challenge modes built from one scenario.
6. **Small reuse test:** a Linux permissions challenge built on the same engine.
7. **Gamification tone:** keep XP and paths, drop streak pressure from the status bar, and label badges as "practice on Patch Notes, not a qualification".
8. **Evidence:** state-transition tests for correct *and* incorrect learner actions, responsive and keyboard checks, then feedback from 3–5 real learners.

No step needs a backend, an external paid service or a security review. Hosted ranges stay out of scope.

## Progress

| Step | Status |
|---|---|
| 1. Housekeeping | ✅ Done (`COPYRIGHT`, `THIRD_PARTY.md`, decisions recorded) |
| 2. Information architecture | ✅ Done: grouped nav (learn / you / updates), Home is a dashboard |
| 3. Split the page into modules | ⏳ Partly done: new code is ES modules; the existing page is still one file |
| 4. Mission Engine foundations | ✅ Done: `static/js/missions/engine.js` (rules) + `ui.js` (visuals) |
| 5. First mission | ✅ DHCP in Guided / Practice / Challenge. Next: a broader "Something isn't right…" troubleshooting mission |
| 6. Linux permissions reuse test | ⏳ Next |
| 7. Gamification tone | ✅ Done: practice days instead of streaks, badges labelled as practice |
| 8. Evidence | ⏳ 17 engine + 10 layout tests in CI; learner feedback still to gather |

### Increment 1 (from the 14 Oct audit): make the engine reusable ✅

- **No protocol knowledge in code.** Device looks (`appearance` rules), packet labels (`short`), bystander reactions (`{ text, tone: "quiet" }`) and how a challenge opens (`opening`) now live in the scenario JSON. Modes are recognised by what they contain (`tools` or `checkpoints`), not by name. A "no reply" outcome undoes whatever its messages changed, for any scenario.
- **Geometry is testable.** `static/js/missions/layout.js` holds card sizes, cable routes, text wrapping and bubble placement as pure functions. `tests/layout.test.mjs` checks them, and checks that every mission's cards fit the stage with room between them.
- **Honest labelling.** A visible "Simulation" tag above every stage and "Simulated output" above every console.
- **Accessibility (Increment 1).** The diagram is a group of labelled devices (each read as one sentence, including its state), so packets can be reached by keyboard and screen reader. Mode buttons are a pressed/not-pressed button group. With reduced motion, Step is the main control and Play pauses 2.5 s on each message. Answer feedback is announced, and focus moves to the debrief when a challenge ends.

## 3. Constraint: Claude usage

On 14 Oct the daily drafting task hit the plan's weekly usage limit. Building the Mission Engine is several sessions of work. To leave room for it, the daily task could draft fewer explanations (e.g. 20 instead of 60) or run on weekdays only.

## 4. Decisions (made 14 Oct 2026)

- **A. First mission:** DHCP packet journey first, then a troubleshooting mission reusing the same engine.
- **B. Repository and licence:** stay public on GitHub Pages; add a clear "all rights reserved" notice and no licence. Revisit before accepting contributions or selling anything.
- **C. Gamification:** tone down (step 7).
- **D. First audience:** aspiring SOC / IT people (networking and SOC missions first).
- **Architecture note:** rather than a big-bang split of the existing page, new mission code is written as ES modules from day one (`static/js/missions/`); the existing page is split gradually afterwards. This keeps working features safe while the engine is proven.

## 5. Options that were considered

- **A. First mission:** DHCP packet journey (guided, visual showcase) or general network troubleshooting (a problem to diagnose)? Recommendation: build both on one engine, DHCP first. It forces the packet/animation components; a troubleshooting mission where DHCP failure is one possible root cause then reuses them.
- **B. Repository and licence.** Options:
  - keep the repo public and add an explicit "all rights reserved" notice (no licence granted)
  - choose an open-source licence
  - make the repo private and move hosting

  GitHub Pages from a private repo needs a paid GitHub plan. Hosts like Cloudflare Pages can deploy private repos on a free tier, but that's a new external service and needs your decision. *Not legal advice.*
- **C. Gamification:** tone down as in step 7, or keep as is?
- **D. First audience** to get the deepest experience: complete beginners, or aspiring SOC analysts?

### Increment 2: assess reasoning, connect to real tools ✅

- **Reasoning check.** Naming the right root cause no longer ends the challenge. The learner then ticks which evidence supports the diagnosis, from a list that mixes key evidence, optional evidence, a symptom that isn't evidence (the failed ping) and claims their own checks contradict. It passes when every key item is ticked and nothing that isn't evidence is. Every item explains itself after each attempt, and the debrief records how many tries the reasoning took. Data: `modes.challenge.rootCause.evidence` (`text`, `supports`, `required`, `tool`, `why`); rules: `engine.answerEvidence`.
- **"What you'd see in Wireshark".** With Protocol details ticked, each message shows Wireshark's display filter (`dhcp`), its packet-list row, and its packet details layer by layer (Ethernet → IPv4 → UDP → DHCP), each with a one-line explanation. It's labelled as an illustration, not a capture, and ends with how to see the real thing on a network you're allowed to monitor. Tests check every view agrees with the message's own fields (addresses, ports, transaction ID, message type).
