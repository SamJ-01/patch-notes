#!/usr/bin/env python3
"""
Build the Patch Notes site: live news + CVE radar + lessons + labs + games.

    python3 build.py                 # fetch everything fresh (NVD takes a few minutes without an API key)
    python3 build.py --reuse-cves    # reuse the last CVE snapshot, refresh news only (fast)
    python3 build.py --offline       # rebuild from saved snapshots only (for editing content/design)
    python3 build.py --offline --serve   # ...then preview it at http://localhost:8000

Output in site/:
    index.html          the app (news, radar, lessons, labs, games, progress)
    data/cves.json      CVE list, loaded after the page appears so first paint stays fast
    lessons/*.html      one static, search-engine-friendly page per lesson
    feed.xml            RSS feed of the day's stories with beginner explanations
    sitemap.xml, robots.txt
Also data/artifact.html: the app without a document skeleton, for the private claude.ai preview.
"""

import argparse
import base64
import hashlib
import os
import collections
import datetime as dt
import email.utils
import html
import json
import re
import shutil
import sqlite3
from pathlib import Path

import cve_watch
import news

HERE = Path(__file__).resolve().parent
CONTENT = HERE / "content"
DATA_DIR = HERE / "data"
SITE_DIR = HERE / "site"
TEMPLATE = HERE / "site_template.html"
STATIC = HERE / "static"  # copied into site/ as-is (e.g. the social preview image)

# Fields the page actually uses; everything else is dropped to keep the download small.
CVE_FIELDS = ["id", "published", "description", "cvss", "severity", "vector", "cvss_version",
              "cwes", "products", "kev", "epss", "epss_pct", "priority", "new"]
MAX_DESCRIPTION = 420

STOPWORDS = {"US", "UK", "EU", "UN", "CEO", "CTO", "CFO", "IT", "TV", "PC", "OK", "AM", "PM", "ID", "FAQ", "PDF", "URL", "URLs",
             "HTML", "USA", "NATO", "COVID", "LLC", "INC", "GMT", "UTC", "ROI", "ATM", "GPU", "CPU", "SDK", "NET", "FEATURE"}


def load(name, default=None):
    path = CONTENT / name
    if default is not None and not path.exists():
        return default
    return json.loads(path.read_text())


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


FONT_SOURCES = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com"


def csp_meta(page, scripts=True):
    """A Content-Security-Policy <meta> for a built page. GitHub Pages can't send headers, so the policy lives
    in the page. Inline scripts are allowed only by the SHA-256 of their exact text, computed here at build time,
    so anything injected later (or a changed script) won't run. Pages with no scripts allow none at all."""
    if scripts:
        hashes = " ".join("'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
                          for body in re.findall(r"<script>(.*?)</script>", page, re.S))
        policy = (f"default-src 'self'; script-src 'self' {hashes}; {FONT_SOURCES}; img-src 'self' data:; "
                  "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'")
    else:
        policy = f"default-src 'none'; {FONT_SOURCES}; img-src 'self' data:; base-uri 'none'; form-action 'none'"
    return f'<meta http-equiv="Content-Security-Policy" content="{policy}">\n'


def with_csp(page):
    """Add the script-free policy right after a static page's charset declaration."""
    assert "<script" not in page, "static lesson pages must stay script-free"
    return page.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + csp_meta(page, scripts=False), 1)


def embed_json(data):
    """Serialise data for an inline <script>. Escaping every '<' means no feed text ('</script>',
    '<!--<script>') can change how the HTML parser reads the script."""
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def unexplained(stories, glossary, cwe, top=25):
    """Acronyms and product-style names in the news that the glossary doesn't explain yet."""
    outlets = {w.lower() for f in news.FEEDS for w in f["name"].split()}
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


# --------------------------------------------------------------------------- Trends

def trends(rows, cwe_names, db_path=cve_watch.DB_PATH, days=30):
    """Chart data: CVEs per published day (from the growing local history), plus this window's
    most common bug types and most-affected vendors."""
    today = dt.date.today()
    start = today - dt.timedelta(days=days - 1)
    per_day = {start + dt.timedelta(days=i): collections.Counter() for i in range(days)}
    history = []
    if Path(db_path).exists():
        with sqlite3.connect(db_path) as db:
            history = [json.loads(d) for (d,) in db.execute("SELECT data FROM cves")]
    for c in history or rows:
        if not c.get("published"):
            continue
        day = dt.date.fromisoformat(c["published"])
        if day in per_day:
            bucket = "critical" if (c.get("cvss") or 0) >= 9 else "high" if (c.get("cvss") or 0) >= 7 else "other"
            per_day[day][bucket] += 1
    daily = [{"date": d.isoformat(), **{k: per_day[d][k] for k in ("critical", "high", "other")}} for d in sorted(per_day)]
    # Trim leading days with no data, so a new install doesn't show 23 empty bars.
    while daily and not any(daily[0][k] for k in ("critical", "high", "other")):
        daily.pop(0)

    cwe_counts = collections.Counter(cw for c in rows for cw in c["cwes"] if cw in cwe_names)
    vendor_counts = collections.Counter(c["products"][0].split()[0] for c in rows if c["products"])
    return {
        "daily": daily,
        "cwes": [{"id": k, "name": cwe_names[k]["name"], "n": n} for k, n in cwe_counts.most_common(8)],
        "vendors": [{"name": k, "n": n} for k, n in vendor_counts.most_common(8)],
    }


# --------------------------------------------------------------------------- Static pages

def social_meta(site, title, description, path=""):
    """Open Graph / Twitter tags so shared links show a title, summary and preview image."""
    e = html.escape
    base = site["url"].rstrip("/") + "/"
    return "\n".join([
        f'<link rel="canonical" href="{e(base + path)}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Patch Notes">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(description)}">',
        f'<meta property="og:url" content="{e(base + path)}">',
        f'<meta property="og:image" content="{e(base)}og.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="Patch Notes: cyber security news, explained">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="theme-color" content="#070A10">',
    ])

def page_css(template):
    """Reuse the app's own fonts and stylesheet for the static lesson pages."""
    fonts = re.search(r'<link rel="stylesheet" href="https://fonts[^>]+>', template).group(0)
    css = re.search(r"<style>(.*?)</style>", template, re.S).group(1)
    return fonts, css


def lesson_page(lesson, nxt, fonts, css, site):
    e = html.escape
    ex = lesson["example"]
    src = ex.get("source")
    checks = "".join(
        f'<div class="stack" style="gap:6px"><p class="q">{n}. {e(c["q"])}</p><ol type="a">{"".join(f"<li>{e(o)}</li>" for o in c["options"])}</ol>'
        f'<details><summary>Show answer</summary><p><strong>{e(c["options"][c["answer"]])}</strong>. {e(c["why"])}</p></details></div>'
        for n, c in enumerate(lesson["checks"], 1))
    diagram = lesson.get("diagram")
    if diagram:
        name = {n["id"]: n["label"] for n in diagram["nodes"]}
        steps = "".join(f'<li><strong>{e(name[st["from"]])} → {e(name[st["to"]])}</strong>: {e(st["msg"])}. {e(st["text"])}'
                        + (f' <em>Stopped by: {e(st["stop"])}</em>' if st.get("stop") else "") + "</li>" for st in diagram["steps"])
        diagram = f'<section><h2>See it: {e(diagram["title"])}</h2><ol>{steps}</ol><p class="muted" style="font-size:0.88rem"><a href="../index.html#lesson-{e(lesson["id"])}">Step through the animated diagram</a> in the app.</p></section>'
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(lesson['title'])} explained · Patch Notes</title>
<meta name="description" content="{e(lesson['hook'])} A {lesson['minutes']}-minute plain-English lesson with a real case and how defenders stop it.">
{social_meta(site, f"{lesson['title']} explained · Patch Notes", lesson['hook'] + " A plain-English lesson with a real case and how defenders stop it.", f"lessons/{lesson['id']}.html")}
<link rel="alternate" type="application/rss+xml" title="Patch Notes" href="../feed.xml">
{fonts}
<style>{css}
.static {{ max-width: 760px; margin: 0 auto; padding-block: 28px 56px; }}
</style>
<header class="masthead" style="position:static"><div class="mast-inner">
  <a class="brand" href="../index.html"><b>PATCH<i>//</i>NOTES</b></a>
  <a class="cmd-btn" href="../index.html#lesson-{e(lesson['id'])}" style="text-decoration:none"><span>Open the interactive version</span></a>
</div></header>
<main><article class="article static">
  <a class="link-btn" href="index.html">← All lessons</a>
  <div class="stack" style="gap:8px"><div class="eyebrow">{e(lesson['track'])} · {e(lesson['level'])} · {lesson['minutes']} min</div><h1>{e(lesson['title'])}</h1><p class="hook">{e(lesson['hook'])}</p></div>
  <section><h2>What it is</h2><p>{e(lesson['what'])}</p></section>
  {diagram or ''}
  <section class="case"><div class="eyebrow">Real case · {e(ex['year'])}</div><h3>{e(ex['title'])}</h3><p>{e(ex['text'])}</p>{f'<p class="muted" style="font-size:0.85rem">Source: <a href="{e(src["url"])}" rel="noopener">{e(src["label"])}</a></p>' if src else ''}</section>
  <section><h2>How defenders stop it</h2><ul class="checklist">{''.join(f'<li>{e(d)}</li>' for d in lesson['defend'])}</ul></section>
  <section><h2>Try it yourself</h2><p><a class="btn brand" href="{e(lesson['practice']['url'] if not lesson['practice']['url'].startswith('#') else '../index.html' + lesson['practice']['url'])}" rel="noopener">{e(lesson['practice']['label'])}</a></p></section>
  <section class="panel"><h2>Check yourself</h2>{checks}
    <p class="muted" style="font-size:0.88rem"><a href="../index.html#lesson-{e(lesson['id'])}">Answer them in the app</a> to earn XP.</p></section>
  <a class="btn ghost" href="{e(nxt['id'])}.html" style="justify-self:start">Next: {e(nxt['title'])} →</a>
</article></main>
</html>
"""


def lessons_index(lessons, fonts, css, site):
    e = html.escape
    cards = "".join(
        f'<a class="lcard" href="{e(l["id"])}.html"><span class="eyebrow">{e(l["track"])}</span><h3>{e(l["title"])}</h3><p>{e(l["hook"])}</p>'
        f'<span class="lmeta"><span>{l["minutes"]} min</span><span>{e(l["level"])}</span></span></a>' for l in lessons)
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Cyber security lessons · Patch Notes</title>
<meta name="description" content="{len(lessons)} short, plain-English cyber security lessons: phishing, ransomware, SQL injection, cloud security and more.">
{social_meta(site, "Cyber security lessons · Patch Notes", f"{len(lessons)} short, plain-English cyber security lessons.", "lessons/")}
{fonts}
<style>{css}</style>
<header class="masthead" style="position:static"><div class="mast-inner"><a class="brand" href="../index.html"><b>PATCH<i>//</i>NOTES</b></a></div></header>
<main><div class="view"><div class="view-head"><div class="eyebrow">Lessons</div><h1>Cyber security, explained</h1></div>
<div class="lessons">{cards}</div></div></main>
</html>
"""


def rss(stories, explainers, site, limit=40):
    e = html.escape
    items = []
    for s in stories[:limit]:
        text = explainers.get(s["link"]) or s["snippet"]
        pub = email.utils.format_datetime(dt.datetime.fromisoformat(s["date"]))
        items.append(f"""  <item>
    <title>{e(s['title'])}</title>
    <link>{e(s['link'])}</link>
    <guid isPermaLink="true">{e(s['link'])}</guid>
    <pubDate>{pub}</pubDate>
    <source url="{e(site['url'])}feed.xml">{e(s['source'])}</source>
    <description>{e(text)}{' (Explanation by Patch Notes, AI-assisted.)' if s['link'] in explainers else ''} Via {e(s['source'])}.</description>
  </item>""")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Patch Notes: cyber security news, explained</title>
  <link>{e(site['url'])}</link>
  <description>{e(site.get('description', ''))}</description>
  <language>en</language>
  <lastBuildDate>{email.utils.format_datetime(dt.datetime.now(dt.timezone.utc))}</lastBuildDate>
{chr(10).join(items)}
</channel>
</rss>
"""


def sitemap(lessons, site):
    base = site["url"].rstrip("/")
    urls = [f"{base}/", f"{base}/lessons/"] + [f"{base}/lessons/{l['id']}.html" for l in lessons]
    today = dt.date.today().isoformat()
    body = "".join(f"  <url><loc>{html.escape(u)}</loc><lastmod>{today}</lastmod></url>\n" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n'


# --------------------------------------------------------------------------- Main

def serve(directory, port=8000):
    import functools
    import http.server
    import webbrowser
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        url = f"http://localhost:{port}/"
        print(f"\nServing {directory} at {url}  (Ctrl+C to stop)")
        webbrowser.open(url)
        httpd.serve_forever()


def main():
    parser = argparse.ArgumentParser(description="Build the Patch Notes site.")
    parser.add_argument("--days", type=int, default=7, help="look-back window for news and CVEs")
    parser.add_argument("--reuse-cves", action="store_true", help="reuse the last CVE snapshot")
    parser.add_argument("--offline", action="store_true", help="use saved news and CVE snapshots only")
    parser.add_argument("--serve", action="store_true", help="preview the built site at http://localhost:8000")
    args = parser.parse_args()
    days = max(1, min(args.days, 120))  # NVD allows at most a 120-day window

    if args.offline or args.reuse_cves:
        cves = snapshot("cves")
        days = cves.get("days", days)  # describe the data we actually have, not the CLI default
    else:
        rows, cve_meta = cve_watch.collect(days)
        cves = snapshot("cves", {"rows": [{k: r.get(k) for k in CVE_FIELDS} for r in rows],
                                 "watchlist": cve_meta["watchlist"], "days": days})

    if args.offline:
        stories = snapshot("news")
    else:
        print("Fetching news feeds...")
        stories = snapshot("news", news.collect_news(days))

    site = load("site.json")
    lessons = load("lessons.json")
    cwe = load("cwe.json")
    explainers_all = load("explainers.json", {})
    links = {s["link"] for s in stories}
    explainers = {k: v["text"] for k, v in explainers_all.items() if k in links}
    rows = cves["rows"]
    for r in rows:
        if len(r["description"]) > MAX_DESCRIPTION:
            r["description"] = r["description"][:MAX_DESCRIPTION - 1].rstrip() + "…"

    now = dt.datetime.now()
    data = {
        "meta": {
            "generated": now.strftime("%Y-%m-%d %H:%M"),
            "version": now.strftime("%Y.%m.%d"),
            "dateLong": now.strftime("%A %-d %B %Y"),
            "days": days,
            "watchlist": cves["watchlist"],
            "cveCount": len(rows),
            "priorityCounts": collections.Counter(r["priority"] for r in rows),
        },
        "site": site,
        "news": stories,
        "kev": [r for r in rows if r["kev"]],
        "newsCves": sorted({c for s in stories for c in s.get("cves", [])} & {r["id"] for r in rows}),  # small and needed for the first screen; the full list loads after
        "trends": trends(rows, cwe),
        "lessons": lessons,
        "labs": load("labs.json"),
        "missions": [json.loads(p.read_text()) for p in sorted((CONTENT / "missions").glob("*.json"))],
        "paths": load("paths.json"),
        "certs": [json.loads(f.read_text()) for f in sorted((CONTENT / "certs").glob("*.json"))],
        "stack": load("stack.json"),
        "quiz": load("quiz.json"),
        "phish": load("phish.json"),
        "careers": load("careers.json"),
        "cwe": cwe,
        "glossary": load("glossary.json"),
        "explainers": explainers,
    }

    template = TEMPLATE.read_text()
    SITE_DIR.mkdir(exist_ok=True)
    (SITE_DIR / "data").mkdir(exist_ok=True)
    (SITE_DIR / "lessons").mkdir(exist_ok=True)
    (SITE_DIR / "data" / "cves.json").write_text(json.dumps(rows, ensure_ascii=False))
    out = SITE_DIR / "index.html"
    meta = social_meta(site, "Patch Notes: cyber security news, explained", site.get("description", ""))
    # The device drawings live in one module (static/js/hw.js) shared by the labs; the page gets the same code inline.
    hw_js = re.sub(r"^export ", "", (STATIC / "js" / "hw.js").read_text(), flags=re.M)
    page = template.replace("<!--__META__-->", meta).replace("/*__DATA__*/null", embed_json(data)).replace("/*__HW__*/", hw_js)
    # PN_NO_CSP=1 is only for local testing tools that inject scripts (e.g. an accessibility checker).
    csp = "" if os.environ.get("PN_NO_CSP") else csp_meta(page)
    out.write_text('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n' + csp + page)
    # Same page without the document skeleton, for publishing as a claude.ai artifact (which adds its own).
    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "artifact.html").write_text(page)

    fonts, css = page_css(template)
    for i, l in enumerate(lessons):
        (SITE_DIR / "lessons" / f"{l['id']}.html").write_text(with_csp(lesson_page(l, lessons[(i + 1) % len(lessons)], fonts, css, site)))
    (SITE_DIR / "lessons" / "index.html").write_text(with_csp(lessons_index(lessons, fonts, css, site)))
    (SITE_DIR / "feed.xml").write_text(rss(stories, explainers, site))
    (SITE_DIR / "sitemap.xml").write_text(sitemap(lessons, site))
    if STATIC.exists():
        shutil.copytree(STATIC, SITE_DIR, dirs_exist_ok=True)
    (SITE_DIR / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {site['url'].rstrip('/')}/sitemap.xml\n")

    kev = len(data["kev"])
    print(f"\nBuilt {out}  ({out.stat().st_size / 1e6:.1f} MB page + {(SITE_DIR / 'data' / 'cves.json').stat().st_size / 1e6:.1f} MB CVE data)")
    print(f"  {len(stories)} stories · {len(rows)} CVEs ({kev} exploited) · {len(lessons)} lessons + pages · "
          f"{len(data['missions'])} missions · {len(data['labs'])} labs · {len(data['paths'])} paths · {len(explainers)} story explanations")
    gaps = unexplained(stories, data["glossary"], cwe)
    if gaps:
        DATA_DIR.mkdir(exist_ok=True)
        (DATA_DIR / "unexplained.txt").write_text("\n".join(f"{n}\t{w}" for w, n in gaps) + "\n")
        print("\nJargon in this week's news that the glossary doesn't explain yet (stories, term):")
        print("  " + ", ".join(f"{w} ({n})" for w, n in gaps))
        print("  Add the useful ones to content/glossary.json.")
    if args.serve:
        serve(SITE_DIR)


if __name__ == "__main__":
    main()
