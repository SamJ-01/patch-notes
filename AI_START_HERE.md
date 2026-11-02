# PATCH//NOTES — Shared AI Project Context

> **Read this file before making any changes.** This is the entry point for ChatGPT, Claude, Grok, and any other AI working on this repository.
>
> Last updated: 2026-11-02  
> Status: Initial handover system; recovery work in progress.

## Non-negotiable project rules

1. **Protect production.** Never push experiments, recovery changes, broad refactors, or unverified changes directly to `main`. Work on a dedicated branch and use a pull request for review.
2. **Preserve before changing.** Inspect the current implementation, relevant history, assets, tests, and deployment workflow before editing.
3. **No speculative redesign.** The goal is to recover and improve the owner's intended PATCH//NOTES experience, not simplify it according to an AI's personal preference.
4. **Small, reviewable changes.** Make one coherent change at a time. Explain why it is needed and what it affects.
5. **Verify claims.** Run the relevant tests/build when possible. Clearly distinguish verified facts from assumptions and untested changes.
6. **Do not delete functionality to make a test pass.** Fix the cause, preserve useful content, and report any trade-offs.
7. **Keep this shared context current.** At the end of a work session, update `AI_HANDOVER.md` with changes, tests, open problems, and the next concrete step. Update this file only when enduring project rules or goals change.
8. **Never claim a change is deployed unless deployment was checked.** A branch commit is not the same as a production deployment.
9. **Do not expose secrets.** Never commit API keys, credentials, tokens, private data, or local environment files.
10. **If instructions conflict, protect production and ask for clarification rather than taking irreversible action.**

## Product vision

PATCH//NOTES is intended to be a polished, distinctive, hands-on cybersecurity and IT learning platform—not just a static collection of articles or lists.

The owner's broader direction includes:
- A strong, atmospheric visual identity with clear hierarchy and carefully considered motion and visual details.
- Visual, interactive lessons that help learners understand technical concepts.
- Practical labs and evidence-based exercises.
- Certification learning pathways and exam preparation.
- A realistic SOC/agency simulation with shifts and investigative tasks.
- Useful progress and feedback features, with more persistent user accounts considered as the product matures.
- A responsive experience that works well on desktop and mobile.

Do not assume every long-term idea is already implemented. Check the actual code and current product state before describing a feature as complete.

## Current recovery objective

The owner reports that the **live/production website retained the preferred original experience**, while the development version was stripped back during AI-assisted changes. Recovery means restoring the richer intended experience in development while preserving useful functional improvements.

Initial suspected regression areas from prior review:
- Learn catalogue: illustrated cards and richer visual presentation were simplified.
- Lesson pages: decorative and explanatory visual elements may have been removed.
- Home: slogan and atmospheric presentation may have been reduced.
- Practise/labs: catalogue presentation was changed to rows; check whether usability or visual hierarchy suffered.
- Agency: shift interface was simplified; preserve working shift logic while reviewing presentation.
- Exams: readiness dashboard was changed to objective lists; assess what information and visual hierarchy were lost.

These are **leads to verify, not a definitive list of defects**. Compare actual rendered pages and source history before reverting anything.

## Repository and deployment notes

- Repository: https://github.com/SamJ-01/patch-notes
- Production URL previously shared by the owner: https://samj-01.github.io/patch-notes/#labs
- The repository's project notes state that pushing to `main` triggers the GitHub Actions build/deploy workflow. Verify the current workflow before relying on this.
- Build notes in `CLAUDE.md` mention `python3 build.py --offline` for an offline build and `node tests/smoke.mjs` for browser smoke journeys. Read the current `CLAUDE.md` and workflow before running commands.
- An existing branch named `audit/glossary-agency-clarity` is not a known-good full visual backup. Do not merge it wholesale or treat it as the original design source without comparing commits and files.

## Required startup procedure for every AI

1. Read this file completely.
2. Read `AI_HANDOVER.md` for the latest status, verified facts, current branch, blockers, and next action.
3. Read `CLAUDE.md` and any relevant project-specific docs.
4. Check the current branch and working tree; do not assume the last AI finished cleanly.
5. Inspect relevant source files, recent commits, tests, and deployment workflow.
6. Before editing, state the intended scope and confirm production is protected.
7. Work in a feature/recovery branch. Do not push to `main` directly.
8. Run suitable checks and update `AI_HANDOVER.md` before ending the session.

## Required session wrap-up

Every AI should append/update the handover with:
- Date and AI/tool used (if known).
- Branch and commit SHA, if applicable.
- What was inspected or changed.
- Files changed.
- Tests/checks run and exact outcome.
- What remains unverified.
- Risks, blockers, or decisions needed from the owner.
- One specific recommended next action.

## Communication standard

Be direct and transparent. Never say the live website was inspected unless it was actually opened and checked. Never imply code was changed if only a plan was written. If access to the development preview, browser, or local environment is unavailable, say so and explain what evidence is needed.
