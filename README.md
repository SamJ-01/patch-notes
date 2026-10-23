# Patch Notes

**Learn it. Break it. Understand it.** A free site for people getting into cyber security and IT, covering both sides: how attacks work (offensive security) and how to stop them (defensive security). Hands-on labs, missions and games, plus the day's security news with every headline explained.

**Live:** https://patchnoteslab.com/

![Home page: the animated network hero, suggested learning path and daily challenge](docs/screenshots/today.png)

Most security news is written for people already in the industry, and most courses aren't connected to what's happening this week. Patch Notes joins the two, and teaches by letting you poke at things: break a network cable and see who loses connection, drag a subnet mask and watch the bits move, run real Linux commands against a log file.

## What's on it

Everything runs in the browser. Nothing is installed and no real network traffic is sent. Tool output matches the real tool or OS it imitates (each lab says which), and anything simplified says so.

| | What you do |
|---|---|
| **26 labs** | Networking: the OSI model, topologies, ports, subnetting, cabling, Wi-Fi surveys, VLANs and inter-VLAN routing on a simulated Cisco CLI, a network builder, a slow network (ping, tracert, `show interfaces`) and reading IPv6. Security: Linux terminal and permissions, hashing, log and email-header investigations, CVSS scoring. Penetration testing: rules of engagement, reading nmap, validating scanner findings. Evidence labs have "Show me where" to point at the line that answers each question |
| **4 missions** | DHCP and DNS faults to diagnose and fix, an overnight SSH brute force to investigate in `auth.log`, and a phishing triage across raw email headers. Guided, Practice and Challenge modes |
| **PATCH//AGENCY** | Simulated SOC shifts for two fictional clients: work an alert queue, search the logs and mailboxes behind each alert, ask other teams to act, close with evidence and write the handover. Shadow your shift lead first, then work it Guided (hints, suggested searches) or on your own |
| **3 tools** | Bring your own evidence: an email header checker, a log search for `auth.log` and web server logs, and a CVSS vector decoder. All run in the browser only |

<table>
<tr>
<td><img src="docs/screenshots/subnet-calc.png" alt="Subnet calculator with a live network diagram, class and address type"></td>
<td><img src="docs/screenshots/lab-topologies.png" alt="Topology lab with a broken link"></td>
</tr>
<tr>
<td><img src="docs/screenshots/mission-dhcp.png" alt="DHCP mission simulation"></td>
<td><img src="docs/screenshots/lab-linux-terminal.png" alt="Simulated Linux terminal"></td>
</tr>
<tr>
<td><img src="docs/screenshots/lab-osi-model.png" alt="OSI model walkthrough"></td>
<td><img src="docs/screenshots/lab-ports-protocols.png" alt="Ports and protocols flip cards"></td>
</tr>
</table>

Wrong answers never end a lab: every quiz offers a retry of the questions you missed, and every lab has a reset button.

## Site sections

| Section | What it does |
|---|---|
| **Home** | Four ways in (the basics, exam prep, a SOC shift, the news), your route, a daily challenge and the vulnerabilities to patch first |
| **Learn** | 29 short lessons, each opening with three key ideas and a picture, a sourced real-world case and three checks; 4 learning paths and a glossary of 330+ terms |
| **Practise** | The labs, missions and tools above, grouped by track |
| **Agency** | The SOC shifts: a staff badge, the rota and your best reports |
| **Exams** | CompTIA Network+ (N10-009, all 25 objectives), Security+ (SY0-701) and PenTest+ (PT0-003) mapped to what practises them, with honest coverage notes, 148 practice questions, timed mock exams and an "Am I ready?" check. Preparation, not a guarantee; no real exam questions |
| **News** | Headlines from 12 outlets, auto-tagged by topic, linked to lessons and CVEs, with "What this means" explanations (AI-written, fact-checked against each article and official records) |
| **CVE Radar** | Every new CVE, enriched with CISA KEV and FIRST EPSS, prioritised by real-world risk, with trend charts; "Am I affected?" for the tech you use |
| **You** | XP, access levels (guest to root), 17 badges, games ("Phish or Legit?", a quiz, a 3-flag CTF hidden in the site) and career paths |

Everywhere: jargon has a dotted underline (hover or tap for an explanation), a command palette (`/` or `Ctrl+K`) lets you navigate like a terminal, and there's a light and a dark theme.

### Points system

| Action | XP |
|---|---|
| Complete a mission | +30 to +60 (by mode) |
| Complete a lab | +30 |
| Finish a lesson | +25 |
| Daily challenge (correct) | +20 |
| Capture a hidden flag | +50 |
| Complete a learning path | +100 |
| Unlock a badge | +20 |

Progress is stored only in the visitor's browser (no accounts, no tracking). Finishing anything sets off fireworks (or a quiet card, if you've asked your device for reduced motion).

## How it works

```
news.py        12 RSS/Atom feeds ─► de-dupe ─► topic tagging ─► CVE ID extraction
cve_watch.py   NVD API ─► CISA KEV ─► FIRST EPSS ─► risk priority ─► SQLite (what's new)
content/       lessons, labs, missions, quiz, phishing emails, careers, glossary (plain JSON, easy to edit)
static/js/     the Mission Engine and lab modules (OSI, topology, terminal, ports, subnetting), loaded on demand
static/js/hw.js  the device library: one drawing per device (PC, laptop, phone, server, database, switch, hub,
               router, firewall, access point, internet, attacker), used by every diagram on the site
build.py       builds site/: the app, lazily loaded CVE data, a page per lesson, RSS feed and sitemap
tests/         Python unit tests + Node tests of the page logic, Mission Engine and every lab
.github/       GitHub Actions rebuilds and redeploys the site every morning
```

Standard-library Python only, with no frameworks or packages to install. The page is static HTML with no backend, tracking or cookies. XP and progress are stored only in the visitor's own browser.

## Run it locally

```bash
python3 build.py                        # full refresh (a few minutes: NVD rate limit)
python3 build.py --reuse-cves --serve   # refresh news only, then preview at http://localhost:8000
python3 build.py --offline --serve      # rebuild from saved data (for editing content/design)
python3 -m unittest discover -s tests   # Python tests
node --test tests/*.test.mjs             # page logic, Mission Engine, labs, Agency and tools
```

A free [NVD API key](https://nvd.nist.gov/developers/request-an-api-key) makes CVE fetching about 10× faster: `export NVD_API_KEY=...`

To use it in the daily GitHub build, add it as a repository secret (it's read as `NVD_API_KEY`):

```bash
gh secret set NVD_API_KEY
```

## Put it online for free

1. Create a GitHub repository and push this folder.
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Optional: **Settings → Secrets → Actions** → add `NVD_API_KEY`.
4. The workflow in `.github/workflows/daily.yml` builds and publishes the site every day at 06:00 UTC.

## Daily automation

1. **GitHub Actions** (`.github/workflows/daily.yml`) runs the tests, then rebuilds and deploys the site every day at 06:00 UTC and on every push. A failing test blocks the deploy.
2. **A scheduled Claude task** on the maintainer's Mac runs each morning. It fetches the news and drafts beginner explanations for new stories and glossary entries for new jargon.
3. **Every draft is fact-checked before it goes live.** The same task gathers evidence for each draft with `python3 explain.py sources`: the original article (or, when a site blocks downloads, the publisher's own summary and other outlets' coverage of the same event) plus NIST NVD and CISA KEV records for every CVE named. Each claim is checked; drafts are published, corrected or rejected with `python3 explain.py publish`, and every decision is recorded in `content/verification_log.json`. Glossary terms are confirmed against vendor or standards-body documentation. To review by hand instead:

```bash
python3 explain.py review         # story explanations: approve / edit / reject, then push
python3 explain.py review-terms   # glossary drafts
```

If the Mac is off, step 1 still runs: news and CVEs stay current, only new explanations are skipped.

## Adding content

- **A lesson:** add an entry to `content/lessons.json`. If its `id` matches a topic in `news.py`, news stories link to it automatically.
- **Quiz questions:** add to `content/quiz.json` (`topic` links a question to a lesson).
- **Phishing emails:** add to `content/phish.json`. Use fictional companies only.
- **Your name in the footer:** set `author` in `content/site.json`.

## Skills demonstrated

- API integration and resilience: pagination, rate limits, retries, parallel fetching
- Parsing untrusted external data (RSS/Atom XML, JSON) and escaping it safely into HTML
- Vulnerability management: CVE, CWE, CVSS v2/v3/v4, EPSS, KEV, risk-based prioritisation
- Automation and CI/CD with GitHub Actions and Pages
- Security awareness content design: phishing simulation, plain-language explanations
- Networking: DHCP, the OSI model, topologies and failure analysis, ports and protocols, IPv4 subnetting maths
- Linux: a simulated shell with pipes, permissions and log analysis
- Simulation design: a SOC shift engine (pure rules, tested so every shift can be finished from its own content, with a shadow mode generated from those rules) and a simulated Cisco IOS command line with VLANs, trunks, router-on-a-stick and extended ACLs
- Hands-on training design: log analysis, email header forensics, CVSS 3.1 scoring (implemented from the FIRST spec and tested)
- Automated testing in CI: a failing test blocks the deploy
- Accessibility: keyboard support, screen-reader labels, reduced motion, contrast-checked light and dark themes (no axe-core violations across every view, in both themes)
- Accessible, tested data visualisation (colour palette validated for colour-blind readers)

## Security

- **Untrusted data is escaped:** headlines, summaries, CVE text and saved progress are treated as untrusted. Text is escaped before it reaches the page, feed links must be `https://`, and the embedded data can't break out of its `<script>`.
- **Content Security Policy:** GitHub Pages can't send headers, so `build.py` writes the policy into each page and allows only that build's inline scripts, by SHA-256 hash. Static lesson pages allow no scripts at all.
- **Pipeline:** workflow permissions are per job (the build job can only read; only deploy can publish), checkout keeps no credentials, every action is pinned to a commit, and Dependabot keeps the pins current. The NVD key is only visible to the build step.
- **Progress:** XP lives in the browser, so anyone can edit it. It's for motivation, not proof. Restored progress files are validated field by field.
- **Rollback:** every deploy comes from a commit. To undo a bad one, `git revert` it and push, or re-run an older successful workflow from the Actions tab.

## Copyright

© 2026 SamJ-01. All rights reserved: no licence is granted to reuse the code or original content (see [COPYRIGHT](COPYRIGHT)). Third-party data, fonts and feeds are listed in [THIRD_PARTY.md](THIRD_PARTY.md).

## Responsible publishing

- Headlines link to the original publishers. Only a title and a short snippet are shown.
- Phishing examples use fictional organisations.
- This product uses data from the NVD API but is not endorsed or certified by the NVD. KEV data from CISA; EPSS from FIRST.org; CWE © MITRE.

## Read more

- [How I built Patch Notes](docs/how-i-built-it.md)
