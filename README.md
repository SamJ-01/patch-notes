# Patch Notes

**Cyber security news, explained.** A free site where people come for the day's security news and learn the concepts behind every headline.

Security news sites are written for people already in the industry, and courses aren't connected to what's happening this week. Patch Notes joins the two: every story is tagged with what it's about and links to a plain-English lesson on that topic.

## What's on the site

| Section | What it does |
|---|---|
| **Today** | A daily changelog for the internet: top stories, trending topics, newly exploited vulnerabilities, a concept of the day and a daily challenge with a streak |
| **News** | Headlines from 12 outlets (BleepingComputer, The Record, Krebs, CISA, UK NCSC…), auto-tagged by topic, with links to lessons and CVEs |
| **CVE Radar** | Every new CVE, enriched with CISA KEV and FIRST EPSS, prioritised by real-world risk, each with a plain-English explanation |
| **Learn** | 22 lessons (phishing to cloud security), each with a real case, defences, a free place to practise and a knowledge check, plus a 46-entry bug-type glossary |
| **Play** | "Phish or Legit?" email game and a quick-fire quiz. XP and ranks from Newbie to CISO |
| **Careers** | Five entry paths with skills, certs and first job titles, plus a curated directory of the best free resources |
| **Glossary** | 250+ terms. Jargon anywhere on the site gets a dotted underline: hover or tap for a plain-English explanation |
| **What this means** | Short beginner explanations of each story, written daily by Claude and labelled as AI-generated |

## How it works

```
news.py        12 RSS/Atom feeds ─► de-dupe ─► topic tagging ─► CVE ID extraction
cve_watch.py   NVD API ─► CISA KEV ─► FIRST EPSS ─► risk priority ─► SQLite (what's new)
content/       lessons, quiz, phishing emails, careers, CWE glossary (plain JSON, easy to edit)
build.py       combines everything into one static page: site/index.html
.github/       GitHub Actions rebuilds and redeploys the site every morning
```

Standard-library Python only, with no frameworks or packages to install. The page is static HTML with no backend, tracking or cookies. XP and progress are stored only in the visitor's own browser.

## Run it locally

```bash
python3 build.py --open                # full refresh (a few minutes: NVD rate limit)
python3 build.py --reuse-cves --open   # refresh news only (seconds)
python3 build.py --offline --open      # rebuild from saved data (for editing content/design)
```

A free [NVD API key](https://nvd.nist.gov/developers/request-an-api-key) makes CVE fetching about 10× faster: `export NVD_API_KEY=...`

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

## Responsible publishing

- Headlines link to the original publishers. Only a title and a short snippet are shown.
- Phishing examples use fictional organisations.
- This product uses data from the NVD API but is not endorsed or certified by the NVD. KEV data from CISA; EPSS from FIRST.org; CWE © MITRE.
