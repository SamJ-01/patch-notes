# How I built Patch Notes

> **Draft: edit this into your own words before publishing.** It's written in the first person as a starting point. Interviewers will ask about anything here, so keep only what you can explain, and change anything that doesn't sound like you.

## The problem

When I started learning cyber security, I read the news every day, but most of it assumed I already knew the jargon: SSRF, KEV, "edge appliances", "living off the land". The learning platforms I used taught the concepts, but never connected them to what was happening that week.

I wanted one place that does both: today's news, with every story linked to a plain-English explanation of the concept behind it.

## What it does

- Pulls headlines from 12 security outlets every morning and tags each story by topic (ransomware, phishing, supply chain…) so it links to a lesson.
- Tracks every new CVE from the NVD and prioritises them by **real-world risk**: CISA's Known Exploited Vulnerabilities list first, then FIRST's EPSS exploit-probability score, then CVSS severity. CVSS alone would bury the urgent work under thousands of "criticals".
- Explains jargon wherever it appears: hover or tap any underlined term.
- Lets visitors practise: investigating a brute-force attack in a Linux auth log, spotting a spoofed email from its headers, and scoring vulnerabilities with CVSS 3.1.
- Rewards progress with XP, access levels, badges and learning paths.

## How it works

- **Python, standard library only.** Fetching (NVD, CISA, EPSS, RSS feeds), parsing, prioritising and building the site use no third-party packages, so there's nothing to install and nothing extra to trust.
- **Static site.** Everything is pre-built into HTML and JSON, so there's no server to attack or pay for.
- **GitHub Actions** runs the tests, rebuilds the site every day and deploys it to GitHub Pages. A failing test stops the deploy.
- **A scheduled AI step** drafts the beginner "What this means" explanations from each headline and summary. Nothing goes live until I review it (`python3 explain.py review`: approve, edit or reject), and published explanations are labelled as AI-generated.

## Things I had to get right

- **Untrusted input.** News feeds and CVE descriptions are text from the internet. Everything is escaped before it reaches the page, including a subtle case where `<!--<script>` inside inlined JSON can break the page's script. There's a test for it.
- **Rate limits.** The NVD allows 5 requests per 30 seconds without an API key, so the fetcher paces itself and retries with backoff.
- **False positives.** My first "Am I affected?" version told Windows users to update because of a Go library bug that only *mentioned* Windows. I changed vulnerability matching to use affected product names (CPE vendor/product) instead of description text.
- **Accuracy.** Every real-world case in the lessons links to a source, and I corrected claims that didn't match them (e.g. LinkedIn 2012: 6.5 million passwords leaked at the time, 117 million confirmed in 2016).
- **Accessibility.** Chart colours were checked with a colour-blindness validator. The first palette failed, so severity now uses a single amber scale from dim to bright.

## What I learned

- How vulnerability management teams actually prioritise (KEV → EPSS → CVSS) and why.
- The CVSS 3.1 formula, implemented from FIRST's specification and tested against the official calculator.
- Reading auth logs and email authentication results (SPF, DKIM, DMARC).
- Writing tests that catch broken content, not just broken code.

## How I used AI

I built this with Claude (Anthropic's AI assistant) as a pair programmer: it wrote much of the code from my direction, and I reviewed, tested and changed it. I can explain how each part works. AI is also part of the product: it drafts the daily explanations, which I review before they're published and which are labelled as AI-generated.

## What's next

- [ ] Your ideas here

---

## LinkedIn post (draft)

> I built a free site that explains cyber security news for beginners: **Patch Notes** 🔐
>
> Every morning it pulls headlines from 12 security outlets and links each story to a plain-English lesson. It also tracks newly published vulnerabilities and ranks them by real-world risk (CISA KEV → EPSS → CVSS), not just severity score.
>
> There are hands-on labs too: catch an SSH brute-force attack in a Linux log, spot a spoofed email from its headers, and score bugs with CVSS 3.1. Plus a hidden-flag hunt for anyone who likes poking around in DevTools 👀
>
> Built with Python (standard library only), GitHub Actions and GitHub Pages, with automated tests that block bad deploys. I used AI as a pair programmer and to draft the daily explanations.
>
> Try it: https://samj-01.github.io/patch-notes/
> Code: https://github.com/SamJ-01/patch-notes
>
> Feedback welcome, especially from people working in a SOC!
>
> #cybersecurity #infosec #learning #python
