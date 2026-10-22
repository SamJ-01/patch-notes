# Patch Notes: notes for Claude

A static, free cyber security and IT learning site (GitHub Pages). Live: https://samj-01.github.io/patch-notes/
Built by one person with AI help: keep changes small, tested and reusable. Read this instead of re-auditing the repo.

## Layout
- The page: `site_template.html` (HTML skeleton, ~5 KB) + `src/site.css` + `src/app/*.js`, joined by `build.assemble_template()`.
  The app files share one scope and run in name order: 01-core (DATA, helpers), 02-glossary, 03-progress, 04-home,
  05-news-cves, 06-learn (lessons, certs, loop), 07-labs (missions, labs, Agency), 08-you (progress, play, careers),
  09-shell (status bar, palette, router). Nav tabs (keys 1-7): home, learn, practise, agency, you, news, cve-radar. Views are `VIEWS.x` / `xxxView()` functions; routes in `parseRoute()`.
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
- Avoid reading fatigue: pictures before paragraphs. Lessons open with three `keys` ({ icon, label, text ≤12 words }, tested)
  and fold the full `what` away; cards use a short `card` line; keep intros and notes to about 30 words. Jargon is
  underlined by `gloss()` on the page and `globalThis.PN_gloss` in modules (questions and explanations too, never inside
  buttons): add missing terms to `content/glossary.json`. Question-and-evidence labs can add a `primer` (picture cards, plus
  what result words mean) and a `where` per step for "Show me where" (`MAIL.highlight` for emails, the grep box for logs; tested).

## Status (Oct 2026)
- Missions: DHCP, DNS, SSH brute force ("The 3am logins": the first with a log viewer, `scenario.log` + `engine.searchLog`),
  phishing triage ("Which email was it?", `phish-triage.json`: the email inspector, `scenario.emails` with raw headers parsed by
  `engine.parseHeaders`; findings come from `engine.inspectEmail`). Keep its headers, log lines and findings in step: tests check they agree.
- Exam prep: Network+ N10-009 (25 objectives, 60 questions, "Am I ready?" panel), Security+ map (5 domains, 53 questions incl. PKI and control types, mock exams).
- PATCH//AGENCY: its own nav tab and hub (`#agency`, `VIEWS.agency` in 07-labs: badge, time clock, rota). Two shifts:
  shift-01 (Pellow & Finch: VPN spray, new sudo account) and shift-02 (Fernhollow Vets: MFA fatigue, hidden inbox rule,
  lookalike-supplier bank change; mailbox sources `{ kind: "email", emails }` opened with `A.openEmail` and shown with MAIL).
  A shift (`content/agency/*.json`, `static/js/agency/`, route `#agency-<id>`, tests `tests/agency.test.mjs`: every shift
  must be finishable with every check passed from its own content, logs visible at the start mustn't postdate it) opens with
  clocking in (badge tap, the lead's briefing as chat, the client file), then the desk (queue, alert, messages), then clock out.
  Design and decisions: `docs/agency-pilot.md`. Logs are searched with `engine.searchLines`.
  Two levels, chosen on the client file (Guided is the default for a first go): Guided adds the lead's hints per alert
  (`guide.hints`, free, counted), suggested searches (`guide.searches` [[source, query]], tested to find lines in the
  alert's own logs), "Show me the answer" (`A.modelClose`), feedback as each alert closes (`A.feedback`) and a handover
  fill-in. Progress saves `own` (done on your own at least once). Per shift: `handover.links` (missed-link line), `next` link.
  At 900 px and below the desk shows one part at a time (Queue, Alert, Chat tabs in the sticky bar; opens on the Queue;
  Chat counts unread replies). The bar's "what next" line comes from `A.progress()` (open, replies due, handover ready).
- Emails anywhere on the site use `static/js/mail.js` (`MAIL.card`/`MAIL.wire`; inlined into the page like hw.js): a mail
  app look, links that reveal where they go, Details/Original views from raw headers, clues pinned with `{ at, text }`.
- Tickets and staff messages anywhere on the site use `static/js/desk.js` (`DESK.ticket`/`DESK.message`/`DESK.channel`; inlined
  into the page like mail.js; tests `tests/desk.test.mjs`): a numbered ticket with a priority stripe, status pill, fields and the
  description set apart, and a team chat (avatar, team badge, ticket chip; system notices as one slim line). Agency alerts carry a
  `ref` (SOC-…), teams a `contact` { name, role }; requests are numbered REQ-… in the order raised. Keep logs and CLIs in their own look.
- Images (pilot): AI-made editorial illustrations in one style (made together in one image so they match, then cropped),
  WebP in `static/img/` (served as `img/…`): portraits 256 px square, scenes 1536 px wide plus an 800 px copy. Agency staff
  portraits (`contact.photo`, `leadPhoto`, shown by `DESK.avatar`, decorative alt) and a client scene (`clientImage`
  { src, small, width, height, alt }, `DESK.scene`) on the client file and hub. Fictional people only; no text in images
  except a correctly spelt company sign. Never fake screenshots of real tools; keep teaching diagrams as live SVG. Tested: files exist.
  Card pictures: every practise and lesson card has one (`static/img/cards/<id>.webp`, 2:1, listed in `CARD_PHOTOS` in
  07-labs, `PHOTO_ALIAS` for tools that reuse a lab's); made six at a time as a 2 x 3 grid with an earlier grid attached as
  the style reference, then cropped with a script. New cards fall back to their drawn scene until they get a photo.
- Email header checker ("bring your own evidence"): `#headers-check`, `static/js/tools/headers.js` (pure `analyse()` + page;
  tests `tests/headers-tool.test.mjs`), examples in `content/tools.json` (`DATA.tools`). Runs in the browser only; never
  says "safe". `MAIL.parseHeaders` trusts only the topmost Authentication-Results (and others from the same server) and
  reads Gmail and Microsoft 365 formats. Log search: `#log-search`, `static/js/tools/logs.js` (auth.log and nginx/Apache
  combined summaries and flags; tests `tests/logs-tool.test.mjs`; examples `DATA.tools.logSamples`). CVSS decoder: `#cvss-decode/<vector>`,
  `readVector()` in 07-labs (3.0/3.1 scored, 4.0 decoded and linked to FIRST, 2.0 decoded; tested in page.test). The three tools sit in
  the practise page's "Your own evidence" track; CVE cards link their vector to the decoder.
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
  questions (a PKI and control types lesson to back the new questions), more Agency shifts (one client and incident each; the people for a shift made in one image). No accounts/backend until real users need cross-device saves.
