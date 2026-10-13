# Patch Notes

**Cyber security news, explained.** A free site where people come for the day's security news and learn the concepts behind every headline.

Security news sites are written for people already in the industry, and courses aren't connected to what's happening this week. Patch Notes joins the two: every story is tagged with what it's about and links to a plain-English lesson on that topic.

## What's on the site

| Section | What it does |
|---|---|
| **Today** | A daily changelog for the internet: top stories, trending topics, newly exploited vulnerabilities, your next learning step and a daily challenge with a streak |
| **News** | Headlines from 12 outlets, auto-tagged by topic, with links to lessons, CVEs and AI-written "What this means" explanations |
| **CVE Radar** | Every new CVE, enriched with CISA KEV and FIRST EPSS, prioritised by real-world risk, with trend charts and plain-English explanations |
| **Am I affected?** | Pick the tech you use (phone, browser, router, work apps) for personal alerts on news and vulnerabilities |
| **Learn** | 22 lessons with sourced real-world cases, 4 learning paths (e.g. Path to SOC Analyst) and a 250+ term glossary |
| **Labs** | Hands-on practice in the browser: investigate an SSH brute-force in auth.log, read spoofed email headers, build CVSS 3.1 scores |
| **Play** | "Phish or Legit?", a quick-fire quiz and a 3-flag CTF hunt |
| **Careers** | Five entry paths with skills, certs and first job titles, plus a curated directory of free resources |
| **Progress** | XP, access levels (guest → root), 16 badges, path progress and an XP history |

Everywhere: jargon has a dotted underline (hover or tap for an explanation), and a command palette (`/` or `Ctrl+K`) lets you navigate like a terminal.

### Points system

| Action | XP |
|---|---|
| Daily challenge (correct) | +20 |
| Finish a lesson | +25 |
| Complete a lab | +30 |
| Capture a hidden flag | +50 |
| Complete a learning path | +100 |
| Unlock a badge | +20 |
| Correct quiz answer / spotted phish | +10 / +15 |
| Set up "Am I affected?" | +10 |
| New glossary term / story explanation read | +2 |

Progress is stored only in the visitor's browser (no accounts, no tracking).

## How it works

```
news.py        12 RSS/Atom feeds ─► de-dupe ─► topic tagging ─► CVE ID extraction
cve_watch.py   NVD API ─► CISA KEV ─► FIRST EPSS ─► risk priority ─► SQLite (what's new)
content/       lessons, quiz, phishing emails, careers, CWE glossary (plain JSON, easy to edit)
build.py       builds site/: the app, lazily loaded CVE data, a page per lesson, RSS feed and sitemap
tests/         Python unit tests + Node tests of the page's own scoring and matching logic
.github/       GitHub Actions rebuilds and redeploys the site every morning
```

Standard-library Python only, with no frameworks or packages to install. The page is static HTML with no backend, tracking or cookies. XP and progress are stored only in the visitor's own browser.

## Run it locally

```bash
python3 build.py                        # full refresh (a few minutes: NVD rate limit)
python3 build.py --reuse-cves --serve   # refresh news only, then preview at http://localhost:8000
python3 build.py --offline --serve      # rebuild from saved data (for editing content/design)
python3 -m unittest discover -s tests   # Python tests
node --test tests/page.test.mjs         # page logic tests (CVSS maths, glossary matching)
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

Two things keep the site fresh:

1. **GitHub Actions** (`.github/workflows/daily.yml`) rebuilds and deploys the site every day at 06:00 UTC and on every push.
2. **A scheduled Claude task** on the maintainer's Mac runs each morning. It fetches the news, writes beginner explanations for new stories (`explain.py`), drafts glossary entries for new jargon into `content/glossary_drafts.json`, then commits and pushes. Drafts are reviewed by a person before moving into `content/glossary.json`.

If the Mac is off, step 1 still runs: news and CVEs stay current, only the new explanations are skipped.

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
- Hands-on training design: log analysis, email header forensics, CVSS 3.1 scoring (implemented from the FIRST spec and tested)
- Automated testing in CI: a failing test blocks the deploy
- Accessible, tested data visualisation (colour palette validated for colour-blind readers)

## Responsible publishing

- Headlines link to the original publishers. Only a title and a short snippet are shown.
- Phishing examples use fictional organisations.
- This product uses data from the NVD API but is not endorsed or certified by the NVD. KEV data from CISA; EPSS from FIRST.org; CWE © MITRE.

## Read more

- [How I built Patch Notes](docs/how-i-built-it.md)
