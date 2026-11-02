# PATCH//NOTES — Current AI Handover

> **This is the living status document.** Every AI session should read it first after `AI_START_HERE.md`, then update it before finishing. Keep the current status near the top; append dated notes below when useful.
>
> Last updated: 2026-11-02

## Current status

**Phase:** Recovery investigation / safe setup  
**Current documentation branch:** `docs/ai-handover-system`  
**Production status:** No production changes made by this handover setup.  
**Recovery implementation status:** No visual recovery changes made yet.

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

## Session log

### 2026-11-02 — Initial shared-memory setup

- Created branch `docs/ai-handover-system` from `main`.
- Added `AI_START_HERE.md` as the cross-AI entry point and enduring project rules.
- Added this file as the living project status and handover log.
- No production or application code changed.
- Tests not run: documentation-only change.
- Next: verify deployment workflow and establish the exact live-vs-development visual comparison before modifying application code.
