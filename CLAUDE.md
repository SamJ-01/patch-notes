**First read [AI_CONTEXT.md](AI_CONTEXT.md)** for what is in progress, and [docs/image-style.md](docs/image-style.md) before changing a picture.

# Patch Notes: notes for Claude

A static, free cyber security and IT learning site (GitHub Pages). Live: https://patchnoteslab.com/
Built by one person with AI help: keep changes small, tested and reusable. Read this instead of re-auditing the repo.

## Layout
- The page: `site_template.html` (HTML skeleton, ~5 KB) + `src/site.css` + `src/app/*.js`, joined by `build.assemble_template()`.
  The app files share one scope and run in name order: 01-core (DATA, helpers), 02-glossary, 03-progress, 04-home,
  05-news-cves, 06-learn (lessons, certs, loop), 07-labs (missions, labs, Agency), 08-you (progress, play, careers),
  09-shell (status bar, palette, router). Nav tabs (keys 1-8, plus feedback on key 9): home, learn, practise, agency, exams, you, feedback, news, cve-radar. Views are `VIEWS.x` / `xxxView()` functions; routes in `parseRoute()`.
- `static/js/`: ES modules loaded on demand. `missions/engine.js` (pure rules, no DOM), `missions/ui.js`, `missions/layout.js`,
  `exam.js` (cert practice + `readiness()`), `labs/*.js`, `hw.js` (device drawings), `flow.js`, `concept.js`.
- `content/`: all content as JSON. Missions in `content/missions/*.json` and Agency shifts in `content/agency/*.json` (picked up automatically), certs in `content/certs/`,
  learning paths in `paths.json`. Missions build order and rules: `docs/missions.md`. Roadmap/audit: `docs/horizon-1-plan.md`.
- `build.py` → `site/` (gitignored). `news.py`, `cve_watch.py`, `explain.py`: daily data pipeline (Python stdlib only).
  If NVD is down, `cve_watch.collect()` falls back to CVEs saved in `cves.db` (kept between CI runs by actions/cache).
  The snapshot records which sources were fresh (`fresh`, `fetched`); `build.stale_sources()` → `DATA.meta.cveStale`, shown as a
  notice on CVE Radar.
  Locally, unset a placeholder `NVD_API_KEY`: NVD answers invalid keys with 404.

## Commands
- Tests (must pass; CI blocks deploy on failure): `python3 -m unittest discover -s tests -q` and
  `node --test tests/*.test.mjs` (Node 22 needs the glob, not `tests/`). CI lists the Node files in `.github/workflows/daily.yml`: add new test files there.
- Build without network: `python3 build.py --offline`. In a fresh cloud session `data/` is empty, so first create stubs:
  `mkdir -p data && echo '{"rows":[],"watchlist":[],"days":30}' > data/cves.json && echo '[]' > data/news.json`
- Smoke test (runs in CI after the build, before deploy; ~50 s): `node tests/smoke.mjs` (key routes at desktop and phone,
  an evidence lab, a shadowed shift, a shift worked by hand to the debrief (close form + handover form), the route bar). Add a journey there when a new kind of activity ships.
- Browser check (errors, overflow, axe, screenshots): `node tests/browser_check.mjs "#route" "#route|selector-to-click"`.
  For axe: `npm pack axe-core@4.10.2` in a scratch dir, untar, `AXE=.../package/axe.min.js`.
- Interaction check (by hand, ~15 min): `node tests/interaction_check.mjs` presses every button on every route at desktop and
  phone and reports page/console errors, failed requests and sideways scroll (skips reset/print/download/copy and the feedback send).
  Run it before a release with new UI: it caught the 18 Nov glossary clash (popup "Related" buttons now use `data-gsee`, not `data-see`).
- Deploy = push to `main` (GitHub Actions builds daily and on push; the full build takes ~8 min). Watch: `gh run watch <id> -R SamJ-01/patch-notes`.

## Conventions
- Accuracy is a release requirement: tool output and log lines must match the real tool/OS (say which), and anything
  simplified says so in the scenario's `simplification`. Use documentation IP ranges (192.0.2/24, 198.51.100/24, 203.0.113/24) and fictional companies.
- Saved progress is untrusted: any new field in `FRESH()` needs cleaning in `cleanProgress()` and a test in `tests/page.test.mjs`. Nested
  records (done, labs, read, missions, exam stats…) are cleaned to plain id → date/flag/number maps, capped at 5,000.
- Keep logic pure and tested (engine/exam pattern); the UI only renders events. Escape everything with `esc()`.
- Accessibility: keyboard, screen-reader labels, reduced motion, axe clean in dark and light, no sideways scroll at 390px.
- UK English, plain language, no em dashes in new copy. Commit messages explain why, and list what was verified.
- Avoid reading fatigue: pictures before paragraphs. Lessons open with three `keys` ({ icon, label, text ≤12 words }, tested)
  and fold the full `what` away; cards use a short `card` line; keep intros and notes to about 30 words. Jargon is
  underlined by `gloss()` on the page and `globalThis.PN_gloss` in modules (questions and explanations too, never inside
  buttons): add missing terms to `content/glossary.json`. `"auto": false` (never underlined) is only for everyday words
  (vulnerability, malware, patch, cloud...); acronym plurals ("IPs", "VLANs") match their alias. Avoid aliases that are ordinary
  phrases in news ("A record", "RIP", "common name"). Question-and-evidence labs can add a `primer` (picture cards, plus
  what result words mean) and a `where` per step for "Show me where" (`MAIL.highlight` for emails, the grep box for logs; tested).

## Status (Oct 2026)
- Missions: DHCP, DNS, SSH brute force ("The 3am logins": the first with a log viewer, `scenario.log` + `engine.searchLog`),
  phishing triage ("Which email was it?", `phish-triage.json`: the email inspector, `scenario.emails` with raw headers parsed by
  `engine.parseHeaders`; findings come from `engine.inspectEmail`). Keep its headers, log lines and findings in step: tests check they agree.
- Exam prep has its own tab (`#exams`, `VIEWS.exams` in 06-learn; cert pages `#cert-<id>` sit under it), so lessons stay free of
  exam clutter (a lesson only shows its "Prove it" stage). Network+ N10-009 (25 objectives, 83 questions, "Am I ready?" panel), Security+ SY0-701 (28 objectives, 149 questions, mock exams; every objective now has a lesson, lab or shift). Mock options on each cert page (`mockOptions` in 06-learn, saved as `P.mockPrefs`; pure `mockLengths`/`mockSettings` in exam.js, tested): 10/20/45/90 questions (only lengths the bank fills at the domain weights; 90 = full length, Security+ only), timed at exam pace or untimed, feedback at the end or after each question. Only timed, end-feedback mocks of 20+ count towards "Am I ready?" (others are saved with `practice: 1`). PenTest+ PT0-003 (26 objectives, 62 questions;
  mostly defender-side coverage, said in its note), with three evidence labs for it:
  `scope-roe` (rules of engagement, kind "doc"), `nmap-read` (Nmap 7.94 -sV output) and `validate-findings` (false positives, backports). `build.load_certs()` orders them Network+, Security+, PenTest+ (tested). All three map
  and tag questions per objective (not per domain), every objective has a question, and each domain holds at least twice
  its share of a 20-question mock (tested). When CompTIA publishes a new exam version, add a new map file; keep the old one. Lessons `certificates` and
  `security-controls` back 1.0.
- PATCH//AGENCY: its own nav tab and hub (`#agency`, `VIEWS.agency` in 07-labs: badge, time clock, rota). Four shifts:
  shift-01 (Pellow & Finch: VPN spray, new sudo account), shift-02 (Fernhollow Vets: MFA fatigue, hidden inbox rule,
  lookalike-supplier bank change; mailbox sources `{ kind: "email", emails }` opened with `A.openEmail` and shown with MAIL)
  and shift-03 (Halstead & Rowe: a .pdf.js infostealer on a workstation, stolen logins used to RDP into FS01 as the
  svc-backup account, rclone exfiltration of client data, then shadow-copy/catalogue deletion caught before encryption;
  two noise alerts, a cleaned AV quarantine and an oversized but scheduled Veeam backup. The Diagnose step for `malware`,
  `ransomware` and `data-breach`, mapped to Security+ 4.8). shift-03 has a client scene (Halstead & Rowe office at night) and a
  client-contact portrait (Marcus Bell). All agency portraits (the SOC team morgan/priya/tomasz/grace/elliot and the
  clients dana/owen/marcus/nadia) are in one dark cinematic style. shift-04 (Wrenfield & Co, an online shop: SQL injection
  reading the users table overnight, stored XSS stealing an admin session, that session walking order IDs (IDOR) and
  leaking a cloud storage key, then a customer-exports bucket downloaded with it; two noise alerts, an approved scanner
  and the scheduled analytics export. The Diagnose step for `web-sqli`, `web-xss`, `web-access` and `cloud`, mapped to
  Security+ 4.8; client scene Wrenfield & Co shopfront, client contact Nadia Shah).
  A shift (`content/agency/*.json`, `static/js/agency/`, route `#agency-<id>`, tests `tests/agency.test.mjs`: every shift
  must be finishable with every check passed from its own content, logs visible at the start mustn't postdate it) opens with
  clocking in (badge tap, the lead's briefing as chat, the client file), then the desk (queue, alert, messages), then clock out.
  The client file's "What you're watching" is one card per source (`static/js/agency/watch.js`, pure `watchList`, tested): icon from
  kind/id/name (or a source's own `icon`), title with "(SIEM export)" or ": detail" split into a tag, first sentence of `about`.
  Design and decisions: `docs/agency-pilot.md`. Logs are searched with `engine.searchLines`. A search records findings only when focused (3+ characters,
  at most 80% of the log's lines). Each supporting evidence item lists the `findings` that back it; citing one before any is
  found is noted at close (`closed[id].unchecked`) and judged "cited without checking" (`judgeClosed`); the close form marks
  evidence the learner has found ("✓ You've checked this"). `modelClose(shift, id, state)` cites optional evidence only once
  checked. Tested: every alert's required evidence is reachable from its own guided searches, emails and requests.
  Two levels, chosen on the client file (Guided is the default for a first go): Guided adds the lead's hints per alert
  (`guide.hints`, free, counted), suggested searches (`guide.searches` [[source, query]], tested to find lines in the
  alert's own logs), "Show me the answer" (`A.modelClose`), feedback as each alert closes (`A.feedback`) and a handover
  fill-in. Progress saves `own` (done on your own at least once). Per shift: `handover.links` (missed-link line), `next` link.
  At 900 px and below the desk shows one part at a time (Queue, Alert, Chat tabs in the sticky bar; opens on the Queue;
  Chat counts unread replies). The bar's "what next" line comes from `A.progress()` (open, replies due, handover ready).
  Saving part-way (18 Nov): every desk action goes through pure `A.act(shift, state, [kind, ...args])` and the UI keeps the
  list (`pn-shift:<id>` in localStorage, `shiftSave` in 07-labs; a device convenience, not exported progress). Reopening
  offers "Carry on" / "Start again"; `A.replay(shift, { level, acts })` runs the list through the rules again (rebuilding
  the clock, queue and chat) and drops anything that doesn't fit, so an edited save can't do more than a learner could;
  engine lookups use `Object.hasOwn`. A finished shift clears its save. `A.shadow` returns its own `acts` (tested: resumable
  after every action, every shift). The leave-the-page prompt now only appears if storage is blocked. Smoke: leave and carry on.
  Shadow (third option on the client file): `A.shadow(shift)` plays the shift's own content through the rules (guided searches
  narrated with `guide.hints`, emails with findings, `answer.contain` requests with a finding attached when needed, model
  closes, model handover) into steps the page shows with Back/Next, then "Your turn". Tested to be a perfect shift; not saved.
  Also offered from the shift report ("Watch <lead> work it", `mount(..., { shadow: true })` skips clocking in) and named on the hub.
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
- Wireless: lesson `wireless` (bands, channels, 802.11 generations, WEP to WPA3 and 802.1X; KRACK) and lab `wifi-survey`
  (Windows 10 `netsh wlan show networks mode=bssid` output: open guest network, WEP camera, an evil twin of the staff SSID,
  an overlapping channel). Network+ 2.3 is now partly covered.
- Lesson `network-ops` ("Running a network": racks and power, change management, SNMP and baselines, RPO/RTO, MTBF/MTTR,
  hot/warm/cold sites; real case BA 2017) backs Network+ 2.4, 3.1-3.3. The slow network lab is its practice.
- Lesson `network-modern` (IPv6, SDN, SD-WAN, VXLAN, zero trust, SASE, IaC; real case BeyondCorp) backs Network+ 1.8, with
  lab `ipv6-read` (Windows 10 `ipconfig`: global, temporary and link-local addresses, zone IDs, shortening, dual stack).
- Slow network lab (`#lab-slow-network`, evidence lab): Windows 10 ping/tracert and Cisco IOS 15 `show interfaces` for a
  congested upload (txload, output drops), a jittery Wi-Fi laptop and a change log; walks the troubleshooting method
  (Network+ 5.1, 5.4, 5.5, 3.1, 3.2). Windows ping summaries in any lab must agree with their reply lines (tested).
- Web and ransomware evidence labs (kind "log", Simplified notes in the evidence): `sqli-log` (nginx log, sqlmap probes,
  UNION, then an admin login), `xss-review` (stored XSS in a review steals an admin session; cookie lacks HttpOnly),
  `idor-log` (portal audit log, owner vs user) and `ransomware-timeline` (EDR timeline: service account RDP, rclone
  exfiltration, vssadmin/bcdedit/wbadmin, renames), plus `malware-tree` (EDR process tree: .pdf.js, encoded PowerShell,
  infostealer, scheduled task, beacon), `ddos-or-busy` (flash crowd vs NTP reflection), `open-bucket` (S3 policy Principal *,
  CloudTrail), `cert-check` (OpenSSL 3.0 x509 output: SAN mismatch, expired, self-signed; Chrome error codes),
  `signin-spray` (Entra sign-ins, AADSTS codes, a Conditional Access exclusion) and `typosquat-pr` (made-up package names,
  postinstall, stolen CI secrets); `cia-incidents`, `name-the-control` (Sec+ 1.1 categories and types),
  `map-the-attack` (ATT&CK technique IDs, NIST CSF 2.0), `zero-day-advisory` (made-up advisory ID, not a CVE), `breach-clock`
  (UK GDPR 72 hours from awareness, Art. 33/34), `advisory-hunt` (living off the land: ntdsutil IFM, netsh portproxy),
  `prompt-injection` (hidden text, image-URL exfiltration) and `factory-scan` (Nmap 7.94 -sT, Modbus/mbap 502). Every
  lesson now has an Experiment step. Defender's view only. All have card photos (made as three 3 x 2 grids). Diagnose
  (missions and shifts) now covers phishing, networking, SOC, incident response, identity, malware, ransomware and
  data-breach, and (shift-04) the web attacks and cloud. Every other lesson has a `stage: "diagnose"` doc or log lab; the last
  three (18 Nov) were `risk-gone-wrong` (a known risk accepted over appetite by the wrong person, no owner, no review),
  `which-law-applies` (CMA, the UK GDPR 72 hours over a weekend, PCI DSS and CVV2, NIS for an essential service) and
  `which-model-fits` (Kill Chain, ATT&CK, Diamond or STRIDE for each review question). Tested: every lesson has one.
- Governance track (16 Nov): lessons `frameworks` (rewritten: NIST CSF 2.0, ISO/IEC 27001:2022, CIS Controls v8.1, Cyber Essentials,
  NIST SP 800-53), `risk`, `law` (Computer Misuse Act, UK GDPR, NIS/NIS2, PCI DSS, DORA) and `attack-models` (Kill Chain, ATT&CK,
  Diamond, STRIDE). Doc labs (Practise group "Governance"): `cyber-essentials-check`, `risk-register`, `allowed-or-not`, `threat-model`.
  Paths `grc` and `it-support`. Practise is grouped by topic (CATEGORY_ORDER in 07-labs). Evidence lab options are mixed when shown
  (`mixLabSteps`); tests pick lab answers by text. Fonts are self-hosted (`static/fonts`); the build writes `/.well-known/security.txt`.
- Lessons lead with their picture (16 Nov): the "See it" block (flow diagram, explainer or concept) sits under the topic
  steps, before the text, on every lesson. Concepts (`static/js/concept.js`, tests `tests/concept.test.mjs`): `cards`, `triad`
  and `cycle` (open on the first part, Back/Next, the arc into the current stage lit) and `matrix` (a 5 x 5 likelihood x impact
  heat map: items `{ label, l, i, text, treat }`, optional `appetite`; pure `riskScore`/`riskBand`; opens on the biggest risk).
  The risk lesson uses the matrix; tested that risks over its appetite aren't simply accepted.
  `cards` render as a spotlight (picture tiles, the chosen one large beneath, Back/Next); `ordered: true` numbers them
  with arrows (zero-day, wireless, certificates).
- Photo scenes (16-17 Nov): a lesson concept of type `scene` is a real photo with numbered hotspots: `image { src: "img/....webp", width, height, alt }` and items
  `{ label, text, at: [x%, y%], tone: c|i|a|good|bad, tag?, breaks? }`; pin hotspots by reading the finished image; tested that
  the file exists at its declared size. The CIA lesson uses it (`img/scenes/cia-pharmacy.webp`, six hotspots, two per pillar). Security controls uses `img/scenes/security-controls-entrance.webp` (one hotspot per control type; tones only mean CIA, so none there).
  A lesson can also have `scene` beside its `concept` (malware, data-breach, wireless, iot-ot, network-ops, osint,
  supply-chain): the See it panel opens on the photo with
  a Photo / Diagram switch (`data-view`, not `data-see`, which the glossary and checks already use). Scene items may carry `fix`
  ("How to fix it") instead of `breaks`. Tested: valid, and never beside a flow diagram or explainer. Its faceless cast (matte off-white heads,
  navy staff, grey public) is the standard for every scene: `docs/image-style.md`; next scenes in `docs/scene-shot-list.md`.
- Lesson flow diagrams (18 Nov audit, `static/js/flow.js`): every caption (route, stage, phone, devices) is one card under
  the picture: "Step n of N · who → whom", a title (`flow-msg`, red on the attacker's steps), the text and how it's stopped.
  Route steps must put the packet where the caption says (`validate`); a frame goes to the next device on its path while
  the packet keeps the far address (tested for lessons and missions: `FramesAndPackets`). Patch sits on the status bar
  between 521 and 1319 px wide, where the content reaches the screen edge, instead of covering side panels.
- Ransomware lesson "See it" (17 Nov): explainer kind `ransomware` (`static/js/ransomware.js`, loaded by explainers.js; tests
  `tests/ransomware.test.mjs`). The attack walks attacker > VPN > admin laptop > file server > backups over six days (device
  drawings, a day clock, "How it's stopped here"), then "Stop it": pick `BUDGET` (2) defences and run it again. Pure `runAttack`
  (each stage done / blocked / survived / never; what was lost; outcome stopped / recovered / lost) and `deviceStates`. Stacks
  vertically under 560 px. Replaced the lesson's old text-card diagram (same five stages).
- Flag hunt (#play, Flag hunt): a "Is this safe? Yes" note with the self-XSS rule, and a "Show me how" fold per flag
  (`FLAG_INFO[i].how` steps per browser and a `phone` line, in 09-shell). The console prints a red "Stop." self-XSS warning
  before the flag 2 message.
- Safety notes (17 Nov): `safeNote(key, { how })` in 02-glossary (also `globalThis.PN_safeNote` for modules), copy in
  `content/safety.json` (`DATA.safety`): a green "Is this safe?" or amber real-life caution, one line, then a fold
  ("Show me how" steps per lab kind, or further points). Labs and lessons opt in with `"safety": key | [keys]`: `sim` on
  every command-line lab (kinds terminal, nettools, vlan, perms; placed above the terminal), `scan` on recon/Nmap labs
  (Computer Misuse Act, practise safely), `osint`. Also on the paste tools (`paste`, `cvss`), You page (`progress`,
  `install`), Agency hub and client file (`fictional`), CVE Radar (`cve`), feedback (`feedback`), and the exam date
  (`examdate`). Tested (`SafetyNotes` in test_core, page.test): keys exist, terminal labs carry `sim` with steps, short copy,
  Agency public IPs are documentation ranges (the `fictional` note says so). Keep each note's claims true when content changes.
- Command-line shorthand (17 Nov): every terminal takes what people really type, and says "[Simulator: X is a real ... command,
  but this lab doesn't model it]" for real commands it lacks (never a caret or "command not found", which suggest a typo).
  IOS (vlan.js): unique prefixes as before, plus wr / wr mem / copy run start and sh start (`st(dev).saved`), sh ip int br on
  switches, sh run int X, sh hist, description; real-but-unmodelled shows (version, mac, cdp, spanning-tree, vtp, clock...) are
  in the grammar so abbreviations stay ambiguous exactly as on a real device (sh v is ambiguous). Windows PCs: ping -n/-t,
  hostname. Linux (terminal.js): Ubuntu's ll/la/l, ls -A/-F, grep -r/-v/-c/-l, awk '{print $N}' (fields only), less, id,
  --help. Network tools: ping -c/-n with values, dig (+short, @server, BIND 9.18 layout), host, ip a/r/n (iproute2), quoted
  words, nmap points to discover. Permissions: ll, whoami, groups, chmod/chown -R. Tested in vlan, labs and perms tests.
  Exam bridge: Network+ 5.5 has 12 questions (show commands, IOS abbreviations and ambiguity, saving, ping -c vs -n, ip a,
  dig +short) and maps the VLAN and inter-VLAN labs; Security+ 4.9 (the auth.log awk pipeline) and 4.6 (reading ls -l), PenTest+
  2.4 (nmap -p-). A question `scenario` that is command output (a prompt, an ls -l line, or several lines) renders monospaced
  (`isCli` in exam.js, `.ex-cli`; tested).
- PBQs (17 Nov): performance-based questions, `static/js/pbq.js` (pure `grade`/`modelAnswer`/`startOrder`/`cliNet` + `mount`;
  tests `tests/pbq.test.mjs`), content `content/pbq/<cert>.json` (attached as `cert.pbqs` by `build.load_certs`), route
  `#pbq-<id>` (`pbqView` in 06-learn), a "Performance-based questions" panel on each cert page, a PBQs fact on the hub card.
  Kinds: `match` (selects; `mono` for log lines), `order` (up/down; fixed seeded start, never already right), `subnet`
  (answers computed by `subnetInfo`, not stored), `firewall` (ordered rule rows from option lists, graded by sending `tests`
  packets through `labs/firewall.js` `evaluate`; no rules = no credit; `explicitDeny` adds a policy part), `cli` (a broken
  `start` state on a lab's topology via vlan.js `createNet`, `tasks` with net checks incl. `saved` = `isSaved`, `model` commands
  per device). Partial credit per part; Check / Show the answer (not counted) / Start again; a count-up clock against
  `minutes`. Best score per PBQ in `P.pbq` (cleaned, tested); 70%+ counts the objective activity as done (`PBQ_PASS`, +30 XP
  once). PBQs are added to their objectives' activities at runtime (`certObjectives`), so maps don't list them. Tested: well
  formed, real objectives, every model answer scores 100%, no PBQ solved at the start. Smoke: one answered by hand, one firewall
  built rule by rule. Thirteen so far: Network+ ports, subnet table, fix the S3 trunk (cli), troubleshooting order, symptom to
  fault; Security+ DMZ firewall, attacks in log lines, IR phases, control types; PenTest+ nmap options, scope, remediation,
  engagement phases (ending in clean-up). Every Network+ objective has 3+ questions and every PenTest+ one 2+ (18 Nov).
  In mocks (18 Nov): a mock opens with PBQs as the real exam does (`mockPbqCount`: 1 at 10/20, 2 at 45, 3 at 90; `pickMockPbqs`
  spreads domains; `mockMinutes` adds their minutes; `mockScore` counts each as `PBQ_WEIGHT` (2) questions with partial credit;
  all tested). `mountMock` keeps each PBQ mounted (hidden when elsewhere) so answers survive navigation; P1, P2 in the jump grid;
  pbq.js `mount(..., { exam: true, instant })` hides the clock, best, Show the answer and Start again, returns `grade()`. Results
  list every PBQ part with a link to practise it; a mock's PBQ score can raise `P.pbq` best.
- Vishing lab "The Call" (`#lab-vishing-call`, `static/js/labs/vishing.js`, tests `tests/vishing.test.mjs`): a portrait handset
  (340 px, status bar with time/signal/battery, camera notch, side buttons, home bar); the incoming call lays out as on a real phone
  (large caller photo, round Decline/Answer with labels), then a running call timer and n/5, each beat's `ask` above the replies.
- Practise page: length filters and "Not done yet" (`PS.time`/`PS.todo`, pure `practiseMatch`, tested) and "Pick up where you
  left off" (`pn-last` in localStorage, a convenience not progress; `lastActivity` only offers a known unfinished lab, mission
  or shift; tested). Evidence labs keep each solved question (`P.labSteps`) and shifts save part-way (below); simulator
  labs and missions still reopen from the start.
- Finished paths show a printable record (`pathRecordHtml`, name typed for printing only, never saved; printed alone via
  `#print-root`); it says it is not a qualification.
- Asset and automation labs (16 Nov, doc labs): `asset-register` ("Who owns this laptop?", Halstead & Rowe's register: an
  ownerless laptop, a leaver's laptop, a reformatted server going to a reseller, a printer disk, two unknown devices; NIST SP
  800-88 sanitisation) for Security+ 4.2, and `soar-playbook` ("Automate it, safely": a phishing playbook, guard rails, a feed
  as a single point of failure) for 4.7. PenTest+ 5.1 and 5.3 now map to defender-side labs and shifts (gap notes say so);
  every PenTest+ objective now has an activity (18 Nov, doc labs on the PenTest+ route): `recon-script` (a Bash sweep to
  fit to this year's scope: seq range, ping-gated nmap, >>; 2.3 and 4.10), `automation-script` (Python default-login check:
  an out-of-scope target, 302 to /dashboard, sleep for no lockouts, PowerShell on Windows; 4.10), `physical-test` (field
  notes: tailgating, 125 kHz badge copy, bins, a live wall port, the authorisation letter checked by calling back; 3.3 and
  Security+ 1.2) and `cleanup-log` (artefact log: accounts, a logon task, a firewall rule via change control, evidence
  retention; 5.4). No card photos yet (drawn scenes). The done card's topic bar is labelled "Where this leaves the topic" so it
  isn't a duplicate landmark.
- Exam date planner (cert page, inside "Am I ready?"): `P.examDates` (cert id -> YYYY-MM-DD, cleaned and tested); pure
  `weekPlan` in exam.js spreads objectives under 70% (unscored first, heaviest first) across the weeks left and keeps the last
  week for timed mocks; week chips open that objective's drill.
- Installable and offline: `static/manifest.webmanifest`, icons in `static/icons/` (the amber // mark), `static/sw.js`
  (network first, same-site GETs only, copies used only offline; bump `CACHE` to drop old copies). Registered in 09-shell on
  https and localhost. Smoke test: "works offline after a visit".
- Lighter first load (18 Nov): the page carries only what lists, cards and counts need (`build.LIGHT`, `split_bodies`);
  each lab, mission and shift body is `data/full/<kind>/<id>.json` and each cert's questions `data/full/questions/<cert>.json`,
  fetched on open by `loadFull(kind, obj)` / `loadQuestions(cert)` in 01-core (merged into the existing objects, so `LAB[id]`
  etc. stay the same objects; light copies carry `_lazy: 1`, certs `_qlazy: 1` with questions as `{ id, objective, single }`).
  A failed fetch shows `lazyFailHtml` (the service worker's copies make a visited lab work offline). A new field a list or
  card reads before opening must go in `LIGHT` (tested: `LazyBodies`). Page 1.1 MB raw / 301 KB gzipped (was ~2.4 MB).
- Static practice pages (18 Nov): `site/practise/<id>.html` for every lab, mission, shift and PBQ, plus `practise/index.html`,
  built from the full content (`practice_items`, `practice_page`) and listed in sitemap.xml: title, scenario, the questions
  (never the explanations or answers), the exam objectives, and a link into the app. Tested: `PracticePages`.
  All static pages (lessons/ and practise/) link one shared stylesheet, `site.<hash>.css` (`shared_css`), instead of each
  carrying it inline: ~355 KB a page became 3 to 15 KB. Its `url("img/...")` paths now resolve from the site root.
- Publishing: `python3 scripts/publish.py <production clone>` diffs dev since the last published "dev <sha>", leaves out the
  files kept apart (CLAUDE.md, AI notes, wrangler, the preview workflow), applies, runs the gate there and commits. It never
  pushes: production's push needs the owner's approval. `--dry-run` lists the files.
- Review deck (`#review`, `static/js/review.js`, tests `tests/review.test.mjs`): due cards first, then new cards 15 per session
  (`NEW_PER_SESSION`; `reviewDueCount` in 08-you mirrors it). Exam hub cards show each cert's `card` line (who it suits) and study order.
- Hashing lab (`#lab-hashing`, `static/js/labs/hashing.js`, tests `tests/hashing.test.mjs`): MD5/SHA-1/SHA-256, salts, slow hashes.
- Device drawings (`static/js/hw.js`, `HW`): a 3/4 view (`hwBox` adds a lit top and shaded side, which also carry
  `hw-body` so state colours reach them; `--hw-face-top/side` per theme). Keep detail readable at ~50 px.
- Network model and picture: `static/js/net/model.js` (segments, carried VLANs, ping results with reasons, issues) and
  `net/view.js` (one colour per broadcast domain). Use them for any network diagram. Network builder: `#lab-network-builder`.
- VLAN lab (`#lab-vlans`, `static/js/labs/vlan.js`, tests `tests/vlan.test.mjs`): simulated Cisco 2960 IOS + Windows PCs.
- Inter-VLAN routing lab (`#lab-intervlan`, same `vlan.js` with `lab.routers` and a `lab.start` state; tests
  `tests/intervlan.test.mjs`): a Cisco 2911 (IOS 15) router on a stick, `show ip route`/`show access-lists`, named extended
  ACLs (ip/icmp, inbound) in the model (`topo.acls`, `aclCheck`; replies are filtered too). Blocked pings time out (as with
  `no ip unreachables`, said in its simplification).
- Navigation: a learning path you start (home route map, path page, "Learn the basics": anything inside `[data-trail]`) is
  remembered for the visit (sessionStorage `pn-trail`); `drawTrail()` shows a route bar above each stop (`#trail`, Stop n of N,
  Prev/Next stop) or "Back to stop n" on a side trip, and `nextStep` follows that route first. Topic steps (`loopStrip`) are
  unnumbered, always show all four stages (missing ones greyed "none yet") and sit under the title of the lesson, lab,
  mission and "Prove it" drill with the current one lit (`topicTop`); going deeper on a stop's topic keeps the bar at that
  stop (`topicOf`, "going deeper"), and pages end with "Back to the top" (`toTopButton`). On a stage with several items (Experiment 1/2,
  Diagnose 0/2), `loopItems` lists them under the strip, the current one marked, with Next (and Previous) in list order, wrapping;
  over 4 items it collapses to "‹ Previous · n of N · Next ›" plus an "All N" fold (tested in page.test). A lab or mission can serve other topics too (`also: [lessonIds]`) and a
  shift lists the topics it diagnoses (`lessons`); only add pairings a learner would agree are the same topic. `crumbs` (sessionStorage `pn-crumbs`) turn "← Section" links into
  "← the page you came from" (`relabelBack`, watches `main`). Tested: `trailStop`, `noteCrumb`.
- Exam routes: `paths.json` entries with `exam` (network-plus 16 stops, security-plus 12, pentest-plus 12), linked from each cert
  page ("Follow the … route"); tested: one per exam, and every stop is mapped to that exam's objectives.
- Every lesson, lab, mission and shift must be mapped to at least one exam objective (tested); maps can link shifts
  (`agency`) and tools (`subnet-calc`, `headers-check`, `log-search`, `cvss-decode`). Keep gap notes honest when coverage changes.
- Feedback: an on-site form at `#feedback` (`VIEWS.feedback` in 08-you) that posts with `fetch` to a form-to-email relay
  (`DATA.site.feedbackPost`, a Formspree form endpoint `https://formspree.io/f/<id>`, posted as JSON; no email address in the page) and emails the owner; no account, stays on the page, nothing saved. A honeypot
  (`_gotcha`) guards it, and the CSP `connect-src` allows the endpoint's origin, read from site.json (build.py `feedback_origin`). `DATA.site.feedback`
  is `#feedback`, linked from a nav tab (key 9, in the "You" group), every done card, the Agency debrief and the footer; `feedbackHref`/consumers drop `target=_blank`
  and the GitHub note for a hash link. To switch back to the GitHub issue form (`.github/ISSUE_TEMPLATE/feedback.yml`), set
  `feedback` to its URL. Tested: `tests/test_core.py` FeedbackForm (accepts either config).
- Next: learner feedback on the shift and the new labs, more Security+
  questions, more Agency shifts (one client and incident each; the people for a shift made in one image). No accounts/backend until real users need cross-device saves.
