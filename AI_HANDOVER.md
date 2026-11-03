# PATCH//NOTES — Current AI Handover

> **This is the living status document.** Every AI session should read it first after `AI_START_HERE.md`, then update it before finishing. Keep the current status near the top; append dated notes below when useful.
>
> Last updated: 2026-11-02

## Current status

**Phase:** Visual recovery in progress  
**Current recovery branch:** `recovery/learn-catalogue`  
**Production status:** No production changes made by this handover setup.  
**Recovery implementation status:** First targeted restoration committed on `recovery/learn-catalogue`; not deployed.

### Owner's reported problem

The owner uses multiple AI assistants and wants them to share a reliable source of project context. Separately, the owner reports that the production/live website still has the preferred original design while the development version has been stripped back. The aim is to recover the richer development experience without damaging production.

### Verified during initial repository review

- Repository: `SamJ-01/patch-notes`.
- The current repository contains `main` and an `audit/glossary-agency-clarity` branch, among others.
- The audit branch diverges from `main`; it must not be treated as a complete original-design backup or merged wholesale without a deliberate comparison.
- A historical `site_template.html` version at commit `131c864b2a7c2385bd0f4c68b49f0c6cb9325d1e` contains ambience elements and accessibility additions that are absent from the `main` version inspected in the same review. This is evidence of a template difference, **not by itself proof that this commit is the correct original production design**.
- Recent commit descriptions suggest simplifications to Learn, lessons, Home, Practise, Agency, and Exams. Each suspected regression must be verified against rendered output and file history.
- The project documentation says the build/deploy workflow can publish on pushes to `main`; inspect the actual current workflow before any deployment decision.
- No source code, production configuration, or live website has been modified as part of setting up this shared documentation.

### Not yet verified

- The exact current visual state of the live site and development preview side by side.
- Which historical commit or asset set matches the owner's preferred original version.
- Whether the development preview is a separate deployment, a branch preview, or a local build.
- Which individual changes are regressions versus intentional and useful improvements.
- Current CI status and whether the build/smoke tests pass on the branch being worked on.

## Next actions — in order

1. **Confirm deployment boundaries.** Read `.github/workflows/daily.yml`, `CLAUDE.md`, and any branch/deployment configuration. Determine how development is previewed and ensure recovery work cannot publish to production accidentally.
2. **Establish visual ground truth.** Open the production URL and the exact development preview. Capture the same routes at matching desktop/mobile viewports. If the dev URL is not known or accessible, ask the owner for it rather than guessing.
3. **Find the correct historical reference.** Use Git history, diffs, assets, and available screenshots to identify the commit/version matching the preferred original. Do not use `audit/glossary-agency-clarity` as a blanket rollback.
4. **Create a recovery branch from the appropriate base** and document the chosen base commit and rationale.
5. **Recover the Learn catalogue first**, one focused change at a time. Compare rendered results, test interactions and mobile layout, and preserve existing learning content.
6. **Run the relevant tests/build**, inspect the diff, and document any failures or limitations.
7. **Review the result before expanding recovery** to lessons, Home, Practise, Agency, and Exams.
8. Only after the owner approves the preview should a pull request/controlled deployment be considered.

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
