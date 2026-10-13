#!/usr/bin/env python3
"""
The human-in-the-loop for AI-written content. The daily task drafts; a person approves.

    python3 explain.py review                 # go through drafted story explanations: approve / edit / reject
    python3 explain.py review-terms           # same for drafted glossary entries

Used by the daily task:
    python3 explain.py todo [--limit 40]      # JSON list of stories with no explanation or draft yet
    python3 explain.py add drafts.json        # save {"<story link>": "<explanation>", ...} as drafts
    python3 explain.py terms                  # unexplained jargon from this week's news, with example headlines
    python3 explain.py add-terms drafts.json  # save glossary drafts (same shape as content/glossary.json entries)

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
KEEP_DAYS = 30
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
    else:
        print(__doc__)
        sys.exit(1)
