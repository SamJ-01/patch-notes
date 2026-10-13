#!/usr/bin/env python3
"""
Helper for the daily AI step: finds news stories that don't have a beginner explanation yet,
saves explanations written for them, and collects glossary drafts for review.

    python3 explain.py todo [--limit 40]     # JSON list of stories still needing an explanation
    python3 explain.py add explanations.json  # merge {"<story link>": "<explanation>", ...}
    python3 explain.py terms                  # unexplained jargon from this week's news, with example headlines
    python3 explain.py add-terms drafts.json  # merge glossary drafts (same shape as content/glossary.json entries)

Explanations live in content/explainers.json (committed, so the public site shows them).
Glossary drafts go to content/glossary_drafts.json and are NOT shown on the site until a
person reviews them and moves them into content/glossary.json.
"""

import datetime as dt
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NEWS = HERE / "data" / "news.json"
EXPLAINERS = HERE / "content" / "explainers.json"
GLOSSARY = HERE / "content" / "glossary.json"
DRAFTS = HERE / "content" / "glossary_drafts.json"
KEEP_DAYS = 30
MAX_CHARS = 700


def load(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, data):
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")


def todo(limit):
    stories = load(NEWS, [])
    done = load(EXPLAINERS, {})
    pending = [{"link": s["link"], "source": s["source"], "title": s["title"], "snippet": s["snippet"]}
               for s in stories if s["link"] not in done]
    print(json.dumps(pending[:limit], indent=1, ensure_ascii=False))
    print(f"# {len(pending)} stories without an explanation; showing {min(limit, len(pending))}", file=sys.stderr)


def add(path):
    new = json.loads(Path(path).read_text())
    known = {s["link"] for s in load(NEWS, [])}
    data = load(EXPLAINERS, {})
    today = dt.date.today().isoformat()
    added = 0
    for link, text in new.items():
        text = " ".join(str(text).split())
        if link not in known or not text:
            print(f"skipped (unknown story or empty): {link}", file=sys.stderr)
            continue
        data[link] = {"text": text[:MAX_CHARS], "date": today}
        added += 1
    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    data = {k: v for k, v in data.items() if v["date"] >= cutoff}
    save(EXPLAINERS, data)
    print(f"Added {added} explanations ({len(data)} kept in total)")


def terms():
    import build
    stories = load(NEWS, [])
    glossary = load(GLOSSARY, []) + load(DRAFTS, [])
    gaps = build.unexplained(stories, glossary, load(HERE / "content" / "cwe.json", {}), top=30)
    out = []
    for word, n in gaps:
        examples = [s["title"] for s in stories if word in f"{s['title']} {s['snippet']}"][:3]
        out.append({"term": word, "stories": n, "examples": examples})
    print(json.dumps(out, indent=1, ensure_ascii=False))


def add_terms(path):
    new = json.loads(Path(path).read_text())
    existing_ids = {g["id"] for g in load(GLOSSARY, [])}
    drafts = load(DRAFTS, [])
    draft_ids = {g["id"] for g in drafts}
    required = {"id", "term", "kind", "aliases", "short"}
    added = 0
    for entry in new:
        if not required <= entry.keys() or entry["id"] in existing_ids | draft_ids:
            print(f"skipped (missing fields or duplicate id): {entry.get('id')}", file=sys.stderr)
            continue
        entry["draft"] = dt.date.today().isoformat()
        drafts.append(entry)
        draft_ids.add(entry["id"])
        added += 1
    save(DRAFTS, drafts)
    print(f"Added {added} glossary drafts for review ({len(drafts)} waiting in content/glossary_drafts.json)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "todo":
        todo(int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[2] == "--limit" else 40)
    elif cmd == "add" and len(sys.argv) > 2:
        add(sys.argv[2])
    elif cmd == "terms":
        terms()
    elif cmd == "add-terms" and len(sys.argv) > 2:
        add_terms(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
