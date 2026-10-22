# Patch Notes: notes for Claude

A static, free cyber security and IT learning site (GitHub Pages). Live: https://samj-01.github.io/patch-notes/
Built by one person with AI help: keep changes small, tested and reusable. Read this instead of re-auditing the repo.

## Layout
- The page: `site_template.html` (HTML skeleton, ~5 KB) + `src/site.css` + `src/app/*.js`, joined by `build.assemble_template()`.
  The app files share one scope and run in name order: 01-core (DATA, helpers), 02-glossary, 03-progress, 04-home,
  05-news-cves, 06-learn (lessons, certs, loop), 07-labs (missions, labs, Agency), 08-you (progress, play, careers),
  09-shell (status bar, palette, router). Views are `VIEWS.x` / `xxxView()` functions; routes in `parseRoute()`.
- `static/js/`: ES modules loaded on demand. `missions/engine.js` (pure rules, no DOM), `missions/ui.js`, `missions/layout.js`,
  `exam.js` (cert practice + `readiness()`), `labs/*.js`, `hw.js` (device drawings), `flow.js`, `concept.js`.
- `content/`: all content as JSON. Missions in `content/missions/*.json` and Agency shifts in `content/agency/*.json` (picked up automatically), certs in `content/certs/`,
  learning paths in `paths.json`. Missions build order and rules: `docs/missions.md`. Roadmap/audit: `docs/horizon-1-plan.md`.
- `build.py` → `site/` (gitignored). `news.py`, `cve_watch.py`, `explain.py`: daily data pipeline (Python stdlib only).
  If NVD is down, `cve_watch.collect()` falls back to CVEs saved in `cves.db` (kept between CI runs by actions/cache).
  Locally, unset a placeholder `NVD_API_KEY`: NVD answers invalid keys with 404.

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
- Missions: DHCP, DNS, SSH brute force ("The 3am logins": the first with a log viewer, `scenario.log` + `engine.searchLog`),
  phishing triage ("Which email was it?", `phish-triage.json`: the email inspector, `scenario.emails` with raw headers parsed by
  `engine.parseHeaders`; findings come from `engine.inspectEmail`). Keep its headers, log lines and findings in step: tests check they agree.
- Exam prep: Network+ N10-009 (25 objectives, 60 questions, "Am I ready?" panel), Security+ map (5 domains, 42 questions, mock exams).
- PATCH//AGENCY pilot: one SOC shift (`content/agency/shift-01.json`, `static/js/agency/`, route `#agency-shift-01`,
  tests `tests/agency.test.mjs`). Design and decisions: `docs/agency-pilot.md`. Logs are searched with `engine.searchLines`.
- "How an app talks to the internet", two labs on `static/js/labs/journey.js` (tests `tests/journey.test.mjs`), content in `labs.json` `chapters`:
  part 1 `#lab-finding-the-server` (DNS, ports, ARP, routing, NAT, tiers), part 2 `#lab-one-request` (HTTP, TCP/UDP, HTTPS, load balancer,
  reverse proxy, firewall, WebSockets). Each stop is a pure model plus a scene keyed by chapter id; animated handlers use `guard()`.
- Hashing lab (`#lab-hashing`, `static/js/labs/hashing.js`, tests `tests/hashing.test.mjs`): MD5/SHA-1/SHA-256, salts, slow hashes.
- Network model and picture: `static/js/net/model.js` (segments, carried VLANs, ping results with reasons, issues) and
  `net/view.js` (one colour per broadcast domain). Use them for any network diagram. Network builder: `#lab-network-builder`.
- VLAN lab (`#lab-vlans`, `static/js/labs/vlan.js`, tests `tests/vlan.test.mjs`): simulated Cisco 2960 IOS + Windows PCs.
- Feedback: public GitHub issue form (`.github/ISSUE_TEMPLATE/feedback.yml`), linked from every done card, the Agency debrief
  and the footer (`DATA.site.feedback`). Read new `feedback` issues before planning.
- Next: learner feedback on the shift and the new labs, inter-VLAN routing lab on the network model, more Security+
  questions (PKI, control types), ransomware first-response mission. No accounts/backend until real users need cross-device saves.
