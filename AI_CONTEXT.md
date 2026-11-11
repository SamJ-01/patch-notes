# PATCH//NOTES — canonical project and deployment context

**Read this before changing code, deployment settings, DNS, or GitHub workflows.** This file is the source of truth for ChatGPT, Claude, Gemini, Grok, Copilot, Codex and any other AI assistant working on this project. If another instruction file conflicts with this one, flag the conflict and ask before changing infrastructure.

## Non-negotiable safety rules
- Never merge a pull request, push to a production branch, deploy the public site, change DNS, add/remove a custom domain, alter Cloudflare routes, or change Cloudflare production settings without the owner's explicit approval for that specific action.
- Do not assume a Cloudflare preview deployment is the public live site.
- Do not assume a successful build means browser smoke tests passed. Report the exact checks and their results.
- Keep the public production site available while working on development previews.
- Before making infrastructure changes, inspect the current GitHub and Cloudflare configuration; do not rely on stale notes or assumptions.
- Do not expose secrets, tokens, API keys, private email addresses, or environment variables in commits, logs, screenshots, or AI summaries.

## Confirmed architecture (verified 4 November 2026)
There are two GitHub repositories and a separate Cloudflare Worker:

1. **Public production repository:** `SamJ-01/patch-notes`
   - Public repository; GitHub Pages is enabled.
   - Its `.github/workflows/daily.yml` builds/tests and deploys the public site through GitHub Pages on pushes to `main` and on its daily schedule.
   - The intended public website is **https://patchnoteslab.com/**.
   - This is the production website. Treat it as protected.

2. **Private development repository:** `SamJ-01/patch-notes-dev`
   - Private repository; GitHub Pages is disabled.
   - AI-assisted development and feature work belongs here.
   - Its `.github/workflows/daily.yml` runs tests/build/smoke checks but has its Pages deploy job disabled (`if: false`).
   - The `preview` branch has a separate `.github/workflows/draft-preview.yml` for test/build/a11y and artifact upload; it does not publish to GitHub Pages.

3. **Cloudflare Worker:** `patch-notes-dev`
   - Connected to the private `SamJ-01/patch-notes-dev` repository.
   - Cloudflare production branch shown in the dashboard is `main`.
   - Worker config is `wrangler.jsonc`, serving the generated `./site` directory.
   - Branch/PR preview deployments are enabled. A recovery PR preview previously deployed successfully.
   - The dashboard screenshot dated 4 November 2026 shows:
     - Production workers.dev URL: **disabled** (owner confirmed via screenshot on 5 November 2026).
     - Preview wildcard workers.dev URL: **enabled** (owner confirmed via screenshot on 5 November 2026).
     - **No custom domains and no route bindings** attached to this Worker.
   - Therefore this Worker is currently a separate Cloudflare-hosted endpoint, not the configured custom-domain destination for `patchnoteslab.com`. The screenshot does not prove the current DNS target for the custom domain; do not infer or change it.
   - The Cloudflare production branch `main` can deploy independently of GitHub Pages. Disabling the private repo's Pages deploy job does not disable Cloudflare Worker deployments.

## Intended operating model
- Public production: GitHub Pages from `SamJ-01/patch-notes` only.
- Development source: private `SamJ-01/patch-notes-dev`.
- Test/preview: Cloudflare Worker branch previews from the private dev repository.
- Release: deliberate, reviewed promotion from dev to the public production repository, with tests and an explicit owner approval before publishing.
- Do not attach `patchnoteslab.com` or a production route to the dev Worker.
- Keep preview URLs available for phone/tablet testing.
- The production workers.dev URL has now been disabled by the owner. The wildcard preview URL remains enabled. This does not disable Cloudflare builds/deployments for the configured production branch; it disables public access through that standard Worker URL. Do not re-enable it without explicit owner approval. Cloudflare dashboard settings cannot be changed through repository commits.

## AI collaboration protocol
- At the start of a task, identify whether the work belongs in the public repo or private dev repo. Default all new work to the private dev repo.
- Read this file plus `CLAUDE.md` (for detailed codebase map) before coding.
- Keep all AIs working from the same private dev repository and branch/PR workflow. Never let two AIs independently rewrite the same files or push competing changes; coordinate via branches and PRs.
- Each AI must state: repository, branch, files changed, tests run, deployment/preview URL (if any), and whether production was touched.
- Update this file when infrastructure or release workflow is deliberately changed. Update the assistant-specific pointer files if the canonical location changes.
- For handoff to another AI, provide this file's URL: https://github.com/SamJ-01/patch-notes-dev/blob/main/AI_CONTEXT.md

## Handoff — 11 November 2026 (current)
This section replaces the 5 November handoff below. Re-check `git log` before acting. Work on branch `live-preview` in the private repo `SamJ-01/patch-notes-dev`. Do not open a second branch that edits the same files.

- Code tip: `332f984` — the phishing lesson opens on the inbox.
- Preview: https://live-preview-patch-notes-dev.samdjackson.workers.dev
- Public production `SamJ-01/patch-notes` `main` is `d3b0d2a`, published 11 November 2026 with the owner's go-ahead to bring the site up. It includes the inbox-first phishing lesson, the call on the phone, the packet drop, the VLAN rooms and the MFA button fix. Do not publish again without a new explicit approval.
- Production deploy that succeeded: GitHub Actions run 42928846470 (tests, smoke, GitHub Pages).
- Home page was left as it is on purpose. Do not redesign it.
- Quality bar is the Port Corridor: the object fills the page. Do not turn News, the CVE radar, the glossary or the exam list into scenes.

### Pages
| What | Hash | Where the latest is |
| --- | --- | --- |
| The Call | `#lab-vishing-call` | Preview and https://patchnoteslab.com/ |
| You Are the Packet | `#lab-firewall-packet` | Preview and https://patchnoteslab.com/ |
| VLANs | `#lab-vlans` | Preview and live. Two rooms on top. The Cisco console under them is still the lab. Do not delete it. |
| Port Corridor | `#lab-port-corridor` | Preview and live. This is the standard. |
| Phishing lesson, the inbox | `#lesson-phishing` | Preview and live. |
| Passwords, MFA and passkeys | `#lesson-identity` | Preview and live. |
| Phish or Legit | `#play` | Preview and live. Uses the same inbox. |

Full preview links:

- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#lab-vishing-call
- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#lab-firewall-packet
- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#lab-vlans
- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#lab-port-corridor
- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#lesson-phishing
- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#lesson-identity
- https://live-preview-patch-notes-dev.samdjackson.workers.dev/#play

Live links, same pages:

- https://patchnoteslab.com/#lab-firewall-packet
- https://patchnoteslab.com/#lab-vlans
- https://patchnoteslab.com/#lab-port-corridor
- https://patchnoteslab.com/#lesson-phishing
- https://patchnoteslab.com/#lesson-identity
- https://patchnoteslab.com/#play

### Already done — do not rebuild
- `static/js/labs/vishing.js`, `src/site.css`: the call is the phone. One spoken line, the replies on the screen, voice plays, "Hear it again" replays it. The red-flag list appears only after hang-up. The progress chips and the side column are gone.
- `static/js/flow.js`: `mountPhone` had two click listeners, so Next skipped the MFA prompt and Approve/Deny only showed after Back. One listener remains. Published in `a5f82ec`.
- `static/js/labs/firewall.js`: the packet falls. The first matching rule is the gate. Rules under it dim.
- `static/js/labs/vlan.js`: the diagram and the address table were replaced by two rooms (same room, other room, trunk stamp). `drawDiagram()` is now empty. The terminal lab below is unchanged.
- `content/lessons.json`, `static/js/flow.js`, `src/site.css`: the phishing lesson is four objects. The link in the email opens a fake Company Mail sign-in. Sign in shows the password posted to `203.0.113.50`. Open the mailbox shows the real inbox. Home pictures are one kind of still: a dark room, one teal light, a real object. The hero is `static/img/hero-soc.webp`. The four paths use `cia-triad`, `soc`, `sqli-log` and `cloud` in `static/img/cards/`. Do not put neon shields, tunnels or holograms back.

### Next, for Claude and GPT
Read [docs/image-style.md](docs/image-style.md) before touching any picture. The owner rejected cyberpunk, anime, comic panels and neon illustration. The look is a dark room, one teal light, a real object.

The card library in `static/img/cards/` was restyled to that look on 11 November 2026. The hero and `cia-triad`, `soc`, `sqli-log`, `cloud` were approved first. The other cards reuse a small set of stills (a door, a terminal, a keycard, a switch, a corridor, two doors, a phone). If two cards feel too alike, give the second its own object in the same room. Do not bring the old art back.

The networking lesson (`#lesson-networking`) is a route scene in `static/js/flow.js`: the packet carries the address, and the address changes at the router. `flow` tests passed. It was not checked in a browser. Patch should say "Your address just changed." only on the NAT step.

Published to production from preview commit `9c24e3f`. Dev branch is `live-preview` on `SamJ-01/patch-notes-dev`. Do not copy that repo's workflow onto production.

### Checks actually run for the Call change
- `node --check static/js/labs/vishing.js`
- `node --test tests/vishing.test.mjs` — 5 passed, 0 failed
- `python3 build.py --offline` — succeeded
- Browser check of `#lab-vishing-call`: ringing screen, then one line and two replies, no `.vp-side`, no transcript
- Earlier the same day, before the Call change: `node --test` on firewall, vishing, vlan, intervlan, flow, labs, patch and page — 89 passed, 0 failed. Python unittest discover exited 0. Do not treat that as a fresh run of the Call commit.

### Do not resume as current work
PR #2 and PR #3, and the 5 November "keep production untouched" instruction, are history. Production has since been updated with explicit approval. Do not merge those PRs into `live-preview`.

## Current recovery work (4 November 2026) — historical
- PR #3: https://github.com/SamJ-01/patch-notes-dev/pull/3 — `recovery/complete-visual-restoration` into `main`; open, draft, not merged.
- PR #2: https://github.com/SamJ-01/patch-notes-dev/pull/2 — `recovery/restore-original-visuals`; open, not merged.
- Keep both unmerged until the owner has reviewed the live preview and explicitly approves the next step.
- Latest known PR #3 preview commit: `857c66ef2dab2734542b181598d64a9299371391`.
- Latest known branch preview URL: https://recovery-complete-visual-restoration-patch-notes-dev.samdjackson.workers.dev
- The preview URL is for review only; it is not the public production site.
- A Cloudflare build/deployment success was reported for that commit. Do not claim the browser smoke test passed unless the relevant GitHub Actions run/log confirms it.

## Codebase reference
- `CLAUDE.md` contains the detailed codebase map, architecture of the app, conventions and test commands.
- `README.md` describes the product and how to run it.
- Main build: `python3 build.py --offline`.
- Python tests: `python3 -m unittest discover -s tests -q`.
- Node tests: `node --test tests/*.test.mjs`.
- Browser smoke: `node tests/smoke.mjs`.

## Handoff status — 5 November 2026 — historical
Superseded by the 11 November 2026 handoff above. Do not treat the tasks in this section as the current job.

### Current infrastructure state
- Owner has disabled the Cloudflare Worker's **Production workers.dev URL**.
- Owner has left the **Preview wildcard workers.dev URL enabled**.
- Cloudflare Worker's Domains page showed **no custom domains and no routes**.
- Do not ask the owner to resend the Cloudflare screenshots or repeat the infrastructure audit already documented here.
- The public production site remains separate: `SamJ-01/patch-notes` → GitHub Pages → intended domain `https://patchnoteslab.com/`.

### Recovery work to resume
- PR #3: https://github.com/SamJ-01/patch-notes-dev/pull/3
- Branch: `recovery/complete-visual-restoration`
- Base: `main`
- Latest known commit: `857c66ef2dab2734542b181598d64a9299371391`
- Latest known preview: https://recovery-complete-visual-restoration-patch-notes-dev.samdjackson.workers.dev
- PR #3 contains visual restoration changes for Home, Learn, Practise and PATCH//AGENCY, plus the guided Agency clock-in smoke-test flow and Wrangler preview configuration.
- PR #3 was a draft and unmerged as of the last check. Re-check before relying on this status.
- PR #2 is an older restoration attempt. Do not combine or merge it automatically; compare it with PR #3 only if useful to identify missing work.

### Immediate tasks for Claude
1. Read this file, `CLAUDE.md`, `AGENTS.md` and the README before making changes.
2. Re-fetch current PR #3 metadata, comments, changed files, commits and branch state. Confirm no newer work has landed.
3. Inspect the complete PR diff against `main` and compare it with the original visual implementation/history. Identify missing, regressed or inconsistent features.
4. Run and report actual checks, where the environment permits:
   - `python3 -m unittest discover -s tests -q`
   - `node --test tests/*.test.mjs`
   - `python3 build.py --offline`
   - `node tests/smoke.mjs`
   Do not claim tests passed unless their exit status/output confirms it. If dependencies or browser setup are missing, state exactly what prevented execution.
5. Inspect the preview directly in a real browser at the URL above, including mobile-sized layouts. The owner has already supplied screenshots and does not want to be repeatedly asked for them. Use existing evidence and browser tooling first; request new screenshots only if a specific visual issue cannot be inspected otherwise.
6. Fix issues in a dedicated feature branch/PR in the **private development repository only**. Avoid conflicting edits with other AIs; coordinate through commits/PRs and state which branch you are using.
7. Report a concise, evidence-based handoff: repository, branch, files changed, tests run and outcomes, preview URL, known issues, and whether production was touched.

### Owner's explicit boundaries
- The owner is handing the next phase to Claude. Claude should proceed with the technical audit and development rather than asking the owner to repeat prior setup details.
- Do not merge PR #3 or PR #2, push to the public production repository, deploy `patchnoteslab.com`, change DNS, re-enable the production workers.dev URL, or alter Cloudflare settings without explicit approval for that specific action.
- Keep the live public site untouched.