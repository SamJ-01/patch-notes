#!/usr/bin/env python3
"""
Build the Patch Notes site: live news + CVE radar + lessons + games, as one static page.

    python3 build.py                 # fetch everything fresh (NVD takes a few minutes without an API key)
    python3 build.py --reuse-cves    # reuse the last CVE snapshot, refresh news only (fast)
    python3 build.py --offline       # rebuild from saved snapshots only (for editing content/design)

Output: site/index.html (open it directly, or host the site/ folder anywhere, e.g. GitHub Pages).
"""

import argparse
import datetime as dt
import json
import webbrowser
from pathlib import Path

import cve_watch
import news

HERE = Path(__file__).resolve().parent
CONTENT = HERE / "content"
DATA_DIR = HERE / "data"
SITE_DIR = HERE / "site"
TEMPLATE = HERE / "site_template.html"

# Fields the page actually uses; everything else is dropped to keep the page small.
CVE_FIELDS = ["id", "published", "description", "cvss", "severity", "vector", "cvss_version",
              "cwes", "products", "kev", "epss", "epss_pct", "priority", "new"]


def load(name):
    return json.loads((CONTENT / name).read_text())


def snapshot(name, data=None):
    """Save data to data/<name>.json, or load it back when data is None."""
    path = DATA_DIR / f"{name}.json"
    if data is None:
        if not path.exists():
            raise SystemExit(f"No saved {name} snapshot yet. Run without --offline/--reuse-cves first.")
        return json.loads(path.read_text())
    DATA_DIR.mkdir(exist_ok=True)
    path.write_text(json.dumps(data))
    return data


STOPWORDS = {"US", "UK", "EU", "UN", "CEO", "CTO", "CFO", "IT", "TV", "PC", "OK", "AM", "PM", "ID", "FAQ", "PDF", "URL", "URLs",
             "HTML", "USA", "NATO", "COVID", "LLC", "INC", "GMT", "UTC", "ROI", "ATM", "GPU", "CPU", "SDK", "NET", "FEATURE"}


def unexplained(stories, glossary, cwe, top=25):
    """Acronyms and product-style names in the news that the glossary doesn't explain yet."""
    import collections
    import re
    import news as _news
    outlets = {w.lower() for f in _news.FEEDS for w in f["name"].split()}
    known = outlets | {a.lower() for g in glossary for a in g["aliases"]} | {g["term"].lower() for g in glossary} | {k.lower() for k in cwe}
    words = re.compile(r"\b(?:[A-Z]{2,8}[0-9]*|[A-Z][a-z]+[A-Z][A-Za-z0-9]*|[A-Za-z]+[0-9]{2,})\b")
    counts = collections.Counter()
    for s in stories:
        for w in set(words.findall(f"{s['title']} {s['snippet']}")):
            base = w[:-1] if w.endswith("s") and w[:-1].isupper() else w
            if base in STOPWORDS or base.lower() in known or re.fullmatch(r"CVE|[A-Z]{2}\d+", base):
                continue
            counts[base] += 1
    return counts.most_common(top)


def main():
    parser = argparse.ArgumentParser(description="Build the Patch Notes site.")
    parser.add_argument("--days", type=int, default=7, help="look-back window for news and CVEs")
    parser.add_argument("--reuse-cves", action="store_true", help="reuse the last CVE snapshot")
    parser.add_argument("--offline", action="store_true", help="use saved news and CVE snapshots only")
    parser.add_argument("--open", action="store_true", help="open the built site in your browser")
    args = parser.parse_args()

    if args.offline or args.reuse_cves:
        cves = snapshot("cves")
    else:
        rows, cve_meta = cve_watch.collect(args.days)
        cves = snapshot("cves", {"rows": [{k: r.get(k) for k in CVE_FIELDS} for r in rows],
                                 "watchlist": cve_meta["watchlist"]})

    if args.offline:
        stories = snapshot("news")
    else:
        print("Fetching news feeds...")
        stories = snapshot("news", news.collect_news(args.days))

    now = dt.datetime.now()
    data = {
        "meta": {
            "generated": now.strftime("%Y-%m-%d %H:%M"),
            "version": now.strftime("%Y.%m.%d"),
            "dateLong": now.strftime("%A %-d %B %Y"),
            "days": args.days,
            "watchlist": cves["watchlist"],
        },
        "site": load("site.json"),
        "news": stories,
        "cves": cves["rows"],
        "lessons": load("lessons.json"),
        "quiz": load("quiz.json"),
        "phish": load("phish.json"),
        "careers": load("careers.json"),
        "cwe": load("cwe.json"),
        "glossary": load("glossary.json"),
    }
    # AI-written beginner explanations (added by the daily task via explain.py); only keep current stories.
    explainers_path = CONTENT / "explainers.json"
    explainers = json.loads(explainers_path.read_text()) if explainers_path.exists() else {}
    links = {s["link"] for s in stories}
    data["explainers"] = {k: v["text"] for k, v in explainers.items() if k in links}

    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")  # never let data close the <script>
    payload = payload.replace("\ufffd", "'")  # some upstream records arrive with mangled apostrophes
    page = TEMPLATE.read_text().replace("/*__DATA__*/null", payload)
    SITE_DIR.mkdir(exist_ok=True)
    out = SITE_DIR / "index.html"
    out.write_text('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n' + page)

    kev = sum(1 for c in data["cves"] if c["kev"])
    print(f"\nBuilt {out}  ({out.stat().st_size / 1e6:.1f} MB)")
    print(f"  {len(stories)} stories · {len(data['cves'])} CVEs ({kev} exploited) · "
          f"{len(data['lessons'])} lessons · {len(data['quiz'])} quiz questions · "
          f"{len(data['explainers'])} story explanations")
    gaps = unexplained(stories, data["glossary"], data["cwe"])
    if gaps:
        (DATA_DIR / "unexplained.txt").write_text("\n".join(f"{n}\t{w}" for w, n in gaps) + "\n")
        print("\nJargon in this week's news that the glossary doesn't explain yet (stories, term):")
        print("  " + ", ".join(f"{w} ({n})" for w, n in gaps))
        print("  Add the useful ones to content/glossary.json.")
    if args.open:
        webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
