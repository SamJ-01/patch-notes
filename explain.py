#!/usr/bin/env python3
"""
Quality control for AI-written content. The daily task drafts explanations, fact-checks every claim against
the source article and official records (NIST NVD, CISA KEV), then publishes, corrects or rejects each one.
Every decision is logged in content/verification_log.json. A person can still review by hand:

    python3 explain.py review                 # go through drafted story explanations: approve / edit / reject
    python3 explain.py review-terms           # same for drafted glossary entries

Used by the daily task:
    python3 explain.py todo [--limit 40]      # JSON list of stories with no explanation or draft yet
    python3 explain.py add drafts.json        # save {"<story link>": "<explanation>", ...} as drafts
    python3 explain.py terms                  # unexplained jargon from this week's news, with example headlines
    python3 explain.py add-terms drafts.json  # save glossary drafts (same shape as content/glossary.json entries)
    python3 explain.py sources DIR            # evidence for each draft: article text, publisher summary, related
                                              #   coverage and NVD/KEV records for any CVE it names (one file each)
    python3 explain.py publish verdicts.json  # apply fact-check verdicts: publish (possibly corrected) or reject
    python3 explain.py publish-terms verdicts.json

Only approved explanations (content/explainers.json) and glossary entries (content/glossary.json)
appear on the site. Drafts wait in content/explainer_drafts.json and content/glossary_drafts.json.
"""

import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NEWS = HERE / "data" / "news.json"
EXPLAINERS = HERE / "content" / "explainers.json"
EXPLAINER_DRAFTS = HERE / "content" / "explainer_drafts.json"
GLOSSARY = HERE / "content" / "glossary.json"
DRAFTS = HERE / "content" / "glossary_drafts.json"
LOG = HERE / "content" / "verification_log.json"
CVES = HERE / "site" / "data" / "cves.json"
KEEP_DAYS = 30
USER_AGENT = "Mozilla/5.0 (compatible; patch-notes/1.0; +personal security news reader)"
MAX_CHARS = 700


def load(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, data):
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")


def tidy(text):
    return " ".join(str(text).split())[:MAX_CHARS]


def prune(data):
    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    return {k: v for k, v in data.items() if v["date"] >= cutoff}


# --------------------------------------------------------------------------- story explanations

def todo(limit):
    stories = load(NEWS, [])
    handled = load(EXPLAINERS, {}).keys() | load(EXPLAINER_DRAFTS, {}).keys()
    pending = [{"link": s["link"], "source": s["source"], "title": s["title"], "snippet": s["snippet"]}
               for s in stories if s["link"] not in handled]
    print(json.dumps(pending[:limit], indent=1, ensure_ascii=False))
    print(f"# {len(pending)} stories without an explanation or draft; showing {min(limit, len(pending))}", file=sys.stderr)


def add(path):
    """Save AI-written explanations as drafts. Nothing here reaches the site until approved."""
    new = json.loads(Path(path).read_text())
    known = {s["link"] for s in load(NEWS, [])}
    drafts = load(EXPLAINER_DRAFTS, {})
    today = dt.date.today().isoformat()
    added = 0
    for link, text in new.items():
        if link not in known or not tidy(text):
            print(f"skipped (unknown story or empty): {link}", file=sys.stderr)
            continue
        drafts[link] = {"text": tidy(text), "date": today}
        added += 1
    save(EXPLAINER_DRAFTS, prune(drafts))
    print(f"Saved {added} draft explanations. Review them with: python3 explain.py review")


def approve(link, text):
    """Publish one explanation and remove its draft."""
    live, drafts = load(EXPLAINERS, {}), load(EXPLAINER_DRAFTS, {})
    live[link] = {"text": tidy(text), "date": dt.date.today().isoformat()}
    drafts.pop(link, None)
    save(EXPLAINERS, prune(live))
    save(EXPLAINER_DRAFTS, drafts)


def reject(link):
    drafts = load(EXPLAINER_DRAFTS, {})
    drafts.pop(link, None)
    save(EXPLAINER_DRAFTS, drafts)


# --------------------------------------------------------------------------- glossary

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
    print(f"Saved {added} glossary drafts. Review them with: python3 explain.py review-terms")


def approve_term(entry):
    """Move one glossary draft into the live glossary. Returns an error message, or None."""
    glossary, drafts = load(GLOSSARY, []), load(DRAFTS, [])
    taken = {a.lower() for g in glossary for a in g["aliases"]}
    if entry["id"] in {g["id"] for g in glossary}:
        return f"id '{entry['id']}' already exists"
    clash = [a for a in entry["aliases"] if a.lower() in taken]
    if clash:
        return f"aliases already used by another term: {', '.join(clash)}"
    clean = {k: v for k, v in entry.items() if k != "draft" and v not in ("", [], None)}
    glossary.append(clean)
    save(GLOSSARY, glossary)
    save(DRAFTS, [d for d in drafts if d["id"] != entry["id"]])
    return None


def reject_term(entry_id):
    save(DRAFTS, [d for d in load(DRAFTS, []) if d["id"] != entry_id])


# --------------------------------------------------------------------------- interactive review

def ask(prompt, choices):
    while True:
        answer = input(prompt).strip().lower()[:1]
        if answer in choices:
            return answer


def offer_push(files, message):
    if ask("\nCommit and push the approved changes now so the site updates? [y/n] ", "yn") != "y":
        print("Not pushed. Run `git add`, `git commit` and `git push` when you're ready.")
        return
    subprocess.run(["git", "add", *files], cwd=HERE, check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=HERE).returncode == 0:
        print("Nothing to commit.")
        return
    subprocess.run(["git", "commit", "-q", "-m", message], cwd=HERE, check=True)
    subprocess.run(["git", "push", "-q"], cwd=HERE, check=True)
    print("Pushed. The public site rebuilds in about a minute.")


def review():
    drafts = load(EXPLAINER_DRAFTS, {})
    stories = {s["link"]: s for s in load(NEWS, [])}
    queue = [(link, d) for link, d in drafts.items() if link in stories]
    if not queue:
        print("No draft explanations waiting for review.")
        return
    print(f"{len(queue)} draft explanations. For each: [a]pprove, [e]dit, [r]eject, [s]kip, [q]uit.\n"
          "Check it only says what the headline and summary support. Open the link if unsure.\n")
    changed = 0
    for i, (link, d) in enumerate(queue, 1):
        s = stories[link]
        print(f"── {i}/{len(queue)} · {s['source']}\n{s['title']}\n{s['snippet']}\n{link}\n\n  DRAFT: {d['text']}\n")
        choice = ask("  [a/e/r/s/q] > ", "aersq")
        if choice == "q":
            break
        if choice == "a":
            approve(link, d["text"]); changed += 1; print("  ✓ approved\n")
        elif choice == "e":
            text = input("  New explanation (one line, Enter to keep the draft): ").strip() or d["text"]
            approve(link, text); changed += 1; print("  ✓ approved with edits\n")
        elif choice == "r":
            reject(link); print("  ✗ rejected\n")
        else:
            print("  … skipped\n")
    if changed:
        offer_push(["content/explainers.json", "content/explainer_drafts.json"], f"Approve {changed} story explanations")


def review_terms():
    drafts = load(DRAFTS, [])
    if not drafts:
        print("No glossary drafts waiting for review.")
        return
    print(f"{len(drafts)} glossary drafts. For each: [a]pprove, [r]eject, [s]kip, [q]uit. Edit content/glossary_drafts.json first if a draft needs changes.\n")
    changed = 0
    for i, d in enumerate(drafts, 1):
        print(f"── {i}/{len(drafts)} · {d['term']} [{d['kind']}]\n  matches: {', '.join(d['aliases'])}\n  {d['short']}\n")
        choice = ask("  [a/r/s/q] > ", "arsq")
        if choice == "q":
            break
        if choice == "a":
            error = approve_term(d)
            print(f"  ✗ not added: {error}\n" if error else "  ✓ added to the glossary\n")
            changed += error is None
        elif choice == "r":
            reject_term(d["id"]); print("  ✗ rejected\n")
        else:
            print("  … skipped\n")
    if changed:
        offer_push(["content/glossary.json", "content/glossary_drafts.json"], f"Add {changed} glossary terms")


# --------------------------------------------------------------------------- automated fact-check

def article_text(url):
    """Readable paragraph text of a page, or None if the site refuses or sends nothing useful."""
    import html, re, urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            page = resp.read().decode("utf-8", "replace")
    except Exception:
        return None
    page = re.sub(r"(?is)<(script|style|noscript|nav|footer|header|aside)[^>]*>.*?</\1>", " ", page)
    paras = re.findall(r"(?is)<(?:p|h1|h2|h3|li)[^>]*>(.*?)</(?:p|h1|h2|h3|li)>", page)
    text = "\n".join(t for t in (" ".join(html.unescape(re.sub(r"(?s)<[^>]+>", " ", p)).split()) for p in paras) if len(t) > 40)
    return text if len(text) > 400 else None


def sources(outdir):
    """Write one evidence file per draft so each claim can be checked against something authoritative."""
    import re
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    stories = {s["link"]: s for s in load(NEWS, [])}
    cves = {c["id"]: c for c in load(CVES, [])}
    drafts = {k: v for k, v in load(EXPLAINER_DRAFTS, {}).items() if k in stories}
    words = lambda t: {w for w in re.findall(r"[A-Za-z][A-Za-z0-9-]{4,}", t.lower())} - {"security", "attack", "attacks", "hackers", "vulnerability", "vulnerabilities", "flaws", "critical", "update", "updates", "patches", "exploited"}
    index = []
    for i, (link, d) in enumerate(drafts.items(), 1):
        s = stories[link]
        ids = set(re.findall(r"CVE-\d{4}-\d+", f"{d['text']} {s['title']} {s['snippet']}"))
        related = [o for o in stories.values() if o["link"] != link and o["source"] != s["source"] and (
            ids & set(o.get("cves", [])) or len(words(s["title"]) & words(o["title"])) >= 2)][:3]
        body = article_text(link)
        parts = [f"DRAFT\n{d['text']}\n", f"STORY\n{s['source']} | {s['title']}\n{link}\n",
                 f"PUBLISHER SUMMARY (from its feed)\n{s['snippet']}\n",
                 "ARTICLE\n" + (body[:12000] if body else "UNAVAILABLE: the site refused or sent no article text. Check against the publisher summary and related coverage only.") + "\n"]
        for o in related:
            t = article_text(o["link"])
            parts.append(f"RELATED COVERAGE · {o['source']} | {o['title']}\n{o['link']}\n{(t or o['snippet'])[:6000]}\n")
        for cid in sorted(ids):
            c = cves.get(cid)
            parts.append(f"OFFICIAL RECORD {cid}\n" + (f"NVD: CVSS {c.get('cvss')} {c.get('severity')}; published {c.get('published')}; CISA KEV: "
                         + (f"yes, added {c['kev'].get('added')}" if c.get("kev") else "not listed") + f"\n{c.get('description', '')[:600]}"
                         if c else "Not in this week's NVD data. Look it up: https://nvd.nist.gov/vuln/detail/" + cid) + "\n")
        name = f"{i:03d}.txt"
        (out / name).write_text("\n".join(parts))
        index.append({"file": name, "link": link, "article": bool(body), "related": len(related), "cves": sorted(ids)})
    (out / "index.json").write_text(json.dumps(index, indent=1))
    print(f"Wrote evidence for {len(index)} drafts to {out} ({sum(x['article'] for x in index)} with the full article).")


def log(entries):
    data = load(LOG, [])
    data.extend(entries)
    cutoff = (dt.date.today() - dt.timedelta(days=90)).isoformat()
    save(LOG, [e for e in data if e.get("date", "") >= cutoff])


def publish(path):
    """Apply verdicts: [{"link", "verdict": "publish"|"reject", "text"?: corrected text, "evidence", "notes"}].
    Drafts for stories that have left the site are dropped too."""
    verdicts = json.loads(Path(path).read_text())
    drafts, today, entries, done = load(EXPLAINER_DRAFTS, {}), dt.date.today().isoformat(), [], set()
    for v in verdicts:
        link = v["link"]
        if link not in drafts:
            print(f"skipped (no such draft): {link}", file=sys.stderr); continue
        if v["verdict"] == "publish":
            approve(link, v.get("text") or drafts[link]["text"])
        else:
            reject(link)
        done.add(link)
        entries.append({"date": today, "kind": "story", "link": link, "verdict": v["verdict"],
                        "corrected": bool(v.get("text")) and tidy(v["text"]) != drafts[link]["text"],
                        "evidence": v.get("evidence", ""), "notes": v.get("notes", "")})
    live = {s["link"] for s in load(NEWS, [])}
    for link in [k for k in load(EXPLAINER_DRAFTS, {}) if k not in live]:
        reject(link)
        entries.append({"date": today, "kind": "story", "link": link, "verdict": "dropped", "notes": "story no longer on the site"})
    log(entries)
    print(f"Published {sum(e['verdict'] == 'publish' for e in entries)}, rejected {sum(e['verdict'] == 'reject' for e in entries)}, "
          f"dropped {sum(e['verdict'] == 'dropped' for e in entries)}; {len(load(EXPLAINER_DRAFTS, {}))} drafts left.")


def publish_terms(path):
    """Apply glossary verdicts: [{"id", "verdict": "publish"|"reject"|"keep", "entry"?: corrected entry, "evidence", "notes"}]."""
    verdicts = json.loads(Path(path).read_text())
    drafts, today, entries = {d["id"]: d for d in load(DRAFTS, [])}, dt.date.today().isoformat(), []
    for v in verdicts:
        d = drafts.get(v["id"])
        if not d:
            print(f"skipped (no such draft): {v['id']}", file=sys.stderr); continue
        verdict, note = v["verdict"], v.get("notes", "")
        if verdict == "keep":  # couldn't confirm today: leave the draft for the next run
            entries.append({"date": today, "kind": "term", "id": d["id"], "verdict": "kept", "notes": note}); continue
        if verdict == "publish":
            entry = {**d, **(v.get("entry") or {}), "id": d["id"]}
            error = approve_term(entry)
            if error:
                reject_term(d["id"]); verdict, note = "reject", f"{note} (not added: {error})".strip()
        else:
            reject_term(d["id"])
        entries.append({"date": today, "kind": "term", "id": d["id"], "verdict": verdict, "evidence": v.get("evidence", ""), "notes": note})
    log(entries)
    print(f"Glossary: published {sum(e['verdict'] == 'publish' for e in entries)}, rejected {sum(e['verdict'] == 'reject' for e in entries)}.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "todo":
        todo(int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[2] == "--limit" else 40)
    elif cmd == "add" and len(sys.argv) > 2:
        add(sys.argv[2])
    elif cmd == "review":
        review()
    elif cmd == "terms":
        terms()
    elif cmd == "add-terms" and len(sys.argv) > 2:
        add_terms(sys.argv[2])
    elif cmd == "review-terms":
        review_terms()
    elif cmd == "sources" and len(sys.argv) > 2:
        sources(sys.argv[2])
    elif cmd == "publish" and len(sys.argv) > 2:
        publish(sys.argv[2])
    elif cmd == "publish-terms" and len(sys.argv) > 2:
        publish_terms(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
