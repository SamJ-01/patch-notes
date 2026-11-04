# PATCH//NOTES — Current AI Handover

> **This is the living status document.** Every AI session should read it first after `AI_START_HERE.md`, then update it before finishing. Keep the current status near the top; append dated notes below when useful.
>
> Last updated: 2026-11-03

## Current status

**Phase:** Visual recovery in progress  
**Current recovery branch:** `recovery/learn-catalogue`  
**Production status:** No production changes made by this handover setup.  
**Recovery implementation status:** Selective restoration committed across Home, Learn, Practise, Agency and Exams on `recovery/learn-catalogue`; awaiting build, automated tests and visual review. Not deployed.

### Owner's reported problem

The owner uses multiple AI assistants and wants them to share a reliable source of project context. Separately, the owner reports that the production/live website still has the preferred original design while the development version has been stripped back. The aim is to recover the richer development experience without damaging production.

### Verified during initial repository review

- Repository: `SamJ-01/patch-notes`.
- The current repository contains `main` and an `audit/glossary-agency-clarity` branch, among others.
- The audit branch diverges from `main`; it must not be treated as a complete original-design backup or merged wholesale without a deliberate comparison.
- A historical `site_template.html` version at commit `131c864b2a7c2385bd0f4c68b49f0c6cb9325d1e` contains ambience elements and accessibility additions that are absent from the `main` version inspected in the same review. This is evidence of a template difference, **not by itself proof that this commit is the correct original production design**.
- Recent commit descriptions suggest simplifications to Learn, lessons, Home, Practise, Agency, and Exams. Each suspected regression must be verified against rendered output and file history.
- The project documentation says the build/deploy workflow can publish on pushes to `main`; inspect the actual current workflow before any deployment decision.
- At the initial shared-documentation setup, no application code or live website was changed. Subsequent recovery commits are isolated on `recovery/learn-catalogue`; `main` and production remain unchanged.

### Not yet verified

- The exact current visual state of the live site and development preview side by side.
- Which historical commit or asset set matches the owner's preferred original version.
- Whether the development preview is a separate deployment, a branch preview, or a local build.
- Which individual changes are regressions versus intentional and useful improvements.
- Current CI status and whether the build/smoke tests pass on the branch being worked on.

## Next actions — in order

1. **Validate the recovery branch.** Run `python3 build.py --offline`, Python unit tests, Node tests and `node tests/smoke.mjs` in a local environment. Follow `CLAUDE.md` for the required data stubs and exact test commands.
2. **Review the rendered pages.** Compare Home, Learn, Practise, Agency and Exams at desktop and 390px mobile widths against the production reference and owner screenshots. Check both dark and light themes.
3. **Fix any regressions found by testing.** In particular, verify the restored Agency badge/briefing flow and the two updated smoke journeys.
4. **Continue lesson-page recovery.** Audit removed lesson diagrams and key visual summaries. Restore only content that can be traced to a known-good earlier revision, while retaining the current single-picture/sequence behaviour where it improves clarity.
5. **Review remaining visual changes.** Inspect animation, ambience, lesson diagrams and page framing against the owner's screenshots before deciding what to restore.
6. **Keep the recovery PR draft** until the owner has reviewed the preview and test results. Do not merge or deploy without explicit approval.
7. **Update this handover** after each further change with commit SHAs, test outcomes, unverified items and the next action.

## Decisions and working assumptions

- Production must remain untouched while recovery is in progress.
- Prefer selective restoration of known-good markup/styles/assets over a wholesale rollback.
- Preserve useful improvements to accessibility, responsiveness, testing, and functional behaviour unless evidence shows a problem.
- The preferred outcome is a rich, distinctive, immersive learning platform with clear usability—not decoration at the expense of learning.
- Ask the owner to decide when evidence cannot resolve a design preference.

### 2026-11-03 — Exam prep dashboard restoration

- Traced the dashboard removal to commit `24a330a5bb8de143b557e789eec25ca3148fb451` ("Make an exam a list of objectives.").
- Restored the previous exam landing-page overview and certification detail layout from its parent revision, including the progress summary, coverage breakdown, objective-level mastery indicators, practice controls, and the `Am I ready?` readiness panel.
- Reused the existing readiness calculation and exam module; no question banks, progress storage, or exam data were changed.
- Commit: `d172f521194a1a5b0fa54c9aa2f3431978b050f6`.
- Verification: reviewed the restored code and confirmed the readiness panel implementation remains present. Automated tests, build, and visual comparison have not yet been run.
- Not deployed; branch remains `recovery/learn-catalogue`.
- Next: validate the restored Learn and Exams pages in a local build, then proceed to Agency and Practise after comparing their earlier interfaces and preserving the latest functional improvements.

### 2026-11-03 — Home page introduction restoration

- Traced the stripped-back home introduction to commit `e04fd500ef5733e196ce09f37cd066c0aabd3cc8`.
- Restored the full `Learn it. Break it. Understand it.` headline and descriptive product introduction on the Home page.
- Preserved the newer route-map behaviour that foregrounds the next learning stop; only the removed product introduction and its placement were restored.
- Updated `src/app/04-home.js`; latest commit: `fc07505249de87f9ea72bd1b46c89f1b2dc52b35`.
- Automated tests and visual comparison have not yet been run. Not deployed.

### 2026-11-03 — Practise catalogue restoration

- Traced the simplified catalogue to commit `b8336dd226fc0e03fc9f6c42bf8218496628e529`.
- Restored the illustrated card catalogue, category groupings, start-here recommendations, and richer card descriptions for labs, missions, tools, games, and Agency shifts.
- Preserved the newer evidence-first lab screen changes; this recovery only restores the catalogue presentation and cards.
- Updated `src/app/07-labs.js`; commit: `a98fe3074eb510fd65f5a9b97cd08a8e9323c103`.

### 2026-11-03 — Agency experience restoration

- Traced the simplified Agency hub and clock-in flow to commit `9c7e96da4eeb3cf00095be6c07a32a1a06303707`.
- Restored the richer Agency hub with staff identity card, shift stats, client scene, lead briefing, rota, and shift guidance.
- Restored the badge-based clock-in sequence and animated lead briefing before revealing the client dossier. Preserved the newer desk/alert-handling work after clock-in.
- Updated `src/app/07-labs.js`, `static/js/agency/ui.js`, and `tests/smoke.mjs` so both Agency smoke journeys exercise the badge and briefing flow.
- Commits: `8270263bd94c7efef32d4307aa942aecf8e46eaa`, `bf479c7f30b74e94305fddb792c3fae56f30bc52`, `bf58c606bf315c3632707faaa9376ff845bc42e3`.
- Automated tests and visual comparison have not yet been run. Not deployed.

## Session log

### 2026-11-03 — Learn catalogue restoration

- Inspected the current Learn catalogue implementation and the exact commit that changed it: `6e112fcd0318c253bfc562e54e4935133b11ca90` ("Make Learn a list, not a second home.").
- Confirmed that commit replaced the illustrated lesson-card grid with plain rows and removed the richer catalogue header and learning-path card grid.
- Created branch `recovery/learn-catalogue` from `main` and restored the catalogue presentation in `src/app/06-learn.js`: illustrated lesson cards, track sections, progress indicator, learning-path cards, and glossary callout.
- Reused the existing `headArt`, `cardArt`, `pathCard`, and CSS already present in the current app. No assets or CSS were removed.
- Commit: `b77e70a11d08f6c996a3551cf0eab4fea63c02c2`.
- Verification: reviewed the exact Git diff and confirmed referenced art helpers and styles exist in the current source. Automated build, unit tests, browser smoke tests, and visual comparison have **not** been run from this environment.
- Not deployed; no changes to `main` or the live website.
- Next: run the documented build and tests in a local/CI environment, then visually compare `#learn` against the production reference before moving to lesson-page recovery.

## Session log

### 2026-11-02 — Initial shared-memory setup

- Created branch `docs/ai-handover-system` from `main`.
- Added `AI_START_HERE.md` as the cross-AI entry point and enduring project rules.
- Added this file as the living project status and handover log.
- No production or application code changed.
- Tests not run: documentation-only change.
- Next: verify deployment workflow and establish the exact live-vs-development visual comparison before modifying application code.


### 2026-11-03 — Development preview identified

- Owner confirmed the development preview URL: https://patch-notes-dev.samdjackson.workers.dev.
- Production/live must remain unchanged unless the owner explicitly approves a production release.
- Repository inspection shows the existing `.github/workflows/daily.yml` deploys GitHub Pages only on pushes to `main` (and its scheduled/manual runs). The repository root and code search did not reveal a `wrangler.toml`, Wrangler configuration, or a Cloudflare Workers deployment workflow.
- Therefore, the recovery branch `recovery/learn-catalogue` is not yet known to deploy automatically to this Workers.dev URL. Do not assume that pushing this branch will update the preview, and do not merge it to `main` as a workaround.
- Direct visual/network inspection of the Workers.dev page was unavailable from this session, so its current rendered state and deployment source remain unverified.
- Next: establish the Cloudflare Worker deployment source (Cloudflare dashboard Git integration/build settings, or the existing external deployment workflow). Then deploy the recovery branch to the dev Worker only, or create a clearly isolated preview deployment, and verify Home, Learn, Practise, Agency, and Exams on desktop/mobile. Keep production untouched.


### 2026-11-04 — Cloudflare preview build configured

- Owner confirmed the Cloudflare Worker `patch-notes-dev` is connected to `SamJ-01/patch-notes`, with `main` as its production branch.
- Cloudflare dashboard screenshots confirm **Builds for Preview branches** is enabled.
- Owner configured **Previews Base → Build command** as `python build.py --days 7`; the Preview command remains `npx wrangler preview`; root directory is `/`.
- The production branch remains `main`. The recovery branch must only create/update its branch Preview; never change the production branch or use `wrangler deploy` for this recovery.
- Cloudflare's current Workers Builds documentation confirms pushes to non-production branches trigger a build command followed by the Preview command, creating/updating that branch's isolated Preview. See https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/ and https://developers.cloudflare.com/workers/ci-cd/builds/configuration/.
- A new commit to `recovery/learn-catalogue` is required to trigger a fresh preview build after enabling/configuring previews. This handover update is intended to provide that trigger.
- Expected result: Cloudflare builds the static site with `python build.py --days 7`, then runs `npx wrangler preview` for `recovery/learn-catalogue`. Confirm the build result and preview URL in Cloudflare before claiming deployment success.
- Important: no build/test result or preview URL has yet been confirmed. If the preview build fails, inspect the Cloudflare build log before changing commands or production settings.
- Next: inspect the triggered Preview build and URL; then run automated tests and visual checks against the preview. Production/live remains untouched.

## 2026-11-04 — Audit of older development commit 5a6d9c8

- Reviewed https://github.com/SamJ-01/patch-notes-dev/commit/5a6d9c899b7b5a54db05b429d2372a294054353d from the separate private `patch-notes-dev` repository.
- The commit changes only `src/app/07-labs.js` (80 additions, 72 deletions) and belongs to the older nine-module app layout.
- Compared its key sections with `src/app/07-labs.js` on `recovery/learn-catalogue`:
  - The illustrated Practise cards (games, tools, labs, missions and Agency shifts) are already present in the current recovery branch; the compared card section is identical.
  - The Agency hub with staff badge, clock-in panel, lead briefing and rota is already present in the current branch, with a longer/current implementation.
  - The current branch retains `mountVisual` and the lab visual panel/rendering path; the older commit deletes that renderer and its mount call. Do not port that deletion.
  - The current branch uses modular lab renderers and the current mission/Agency modules; do not replace these with the older file.
- Decision: no code transplant from this commit is needed. It is a useful historical reference, but its strongest presentation changes have already been incorporated in the current recovery branch, which also preserves newer visual-lab functionality.
- No production branch, live site, Cloudflare production configuration, or old repository files were changed as part of this audit.
