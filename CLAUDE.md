# Patch Notes: notes for Claude

A static, free cyber security and IT learning site (GitHub Pages). Live: https://samj-01.github.io/patch-notes/
Built by one person with AI help: keep changes small, tested and reusable. Read this instead of re-auditing the repo.

## Layout
- `site_template.html` (~265 KB): the whole app (CSS + JS + views). Too big to read whole: `grep -n` for the
  function or CSS class you need, then read that range. Views are `VIEWS.x` / `xxxView()` functions; routes in `parseRoute()`.
- `static/js/`: ES modules loaded on demand. `missions/engine.js` (pure rules, no DOM), `missions/ui.js`, `missions/layout.js`,
  `exam.js` (cert practice + `readiness()`), `labs/*.js`, `hw.js` (device drawings), `flow.js`, `concept.js`.
- `content/`: all content as JSON. Missions in `content/missions/*.json` (picked up automatically), certs in `content/certs/`,
  learning paths in `paths.json`. Missions build order and rules: `docs/missions.md`. Roadmap/audit: `docs/horizon-1-plan.md`.
- `build.py` → `site/` (gitignored). `news.py`, `cve_watch.py`, `explain.py`: daily data pipeline (Python stdlib only).

## Commands
- Tests (must pass; CI blocks deploy on failure): `python3 -m unittest discover -s tests -q` and
  `node --test tests/*.test.mjs` (Node 22 needs the glob, not `tests/`). CI lists the Node files in `.github/workflows/daily.yml`: add new test files there.
- Build without network: `python3 build.py --offline`. In a fresh cloud session `data/` is empty, so first create stubs:
  `mkdir -p data && echo '{"rows":[],"watchlist":[],"days":30}' > data/cves.json && echo '[]' > data/news.json`
- Browser check (errors, overflow, axe, screenshots): `node tests/browser_check.mjs "#route" "#route|selector-to-click"`.
  For axe: `npm pack axe-core@4.10.2` in a scratch dir, untar, `AXE=.../package/axe.min.js`.
- Deploy = push to `main` (GitHub Actions builds daily and on push; the full build takes ~8 min). Watch: `gh run watch <id> -R SamJ-01/patch-notes`.

## Conventions
- Accuracy is a release requirement: tool output and log lines must match the real tool/OS (say which), and anything
  simplified says so in the scenario's `simplification`. Use documentation IP ranges (192.0.2/24, 198.51.100/24, 203.0.113/24) and fictional companies.
- Saved progress is untrusted: any new field in `FRESH()` needs cleaning in `cleanProgress()` and a test in `tests/page.test.mjs`.
- Keep logic pure and tested (engine/exam pattern); the UI only renders events. Escape everything with `esc()`.
- Accessibility: keyboard, screen-reader labels, reduced motion, axe clean in dark and light, no sideways scroll at 390px.
- UK English, plain language, no em dashes in new copy. Commit messages explain why, and list what was verified.

## Status (Oct 2026)
- Missions: DHCP, DNS, SSH brute force ("The 3am logins": the first with a log viewer, `scenario.log` + `engine.searchLog`).
- Exam prep: Network+ N10-009 (25 objectives, 60 questions, "Am I ready?" panel), Security+ map (no questions yet).
- Next: PATCH//AGENCY pilot (design for review: `docs/agency-pilot.md`; open decisions in its section 9),
  then switching/VLANs lab, Security+ question bank. No accounts/backend until real users need cross-device saves.
