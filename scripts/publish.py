#!/usr/bin/env python3
"""Prepare a production release from this development repository, in one step.

    python3 scripts/publish.py /path/to/patch-notes            # changes since the last published dev commit
    python3 scripts/publish.py /path/to/patch-notes --from abc1234 --to HEAD

What it does, in order (it stops at the first failure and leaves production untouched where it can):
  1. Finds the last dev commit already published: the newest production commit message that says "dev <sha>",
     unless --from is given.
  2. Diffs dev from that commit to --to (default HEAD), leaving out the files that differ on purpose between the
     two repositories (AI notes, the dev-only preview workflow, the Worker config).
  3. Checks the production clone is clean and on main, then applies the diff there.
  4. Runs the full gate in production: unit tests, node tests, an offline build and the smoke test.
  5. Commits in production with a message naming the dev commit.

It never pushes. Pushing production's main deploys the public site and needs the owner's approval each time
(AI_CONTEXT.md). CLAUDE.md is left out of the diff: production's copy is edited by hand.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

DEV = Path(__file__).resolve().parent.parent
# Files that are meant to differ between dev and production: never copied across.
KEEP_APART = ["CLAUDE.md", "docs/claude-handover.md", "AI_CONTEXT.md", "AGENTS.md", "GEMINI.md", "GROK.md",
              "wrangler.jsonc", ".github/workflows/draft-preview.yml"]
GATE = [["python3", "-m", "unittest", "discover", "-s", "tests", "-q"],
        ["bash", "-c", "node --test tests/*.test.mjs"],
        ["python3", "build.py", "--offline"],
        ["node", "tests/smoke.mjs"]]


def run(cmd, cwd, capture=True, check=True):
    r = subprocess.run(cmd, cwd=cwd, text=True, capture_output=capture)
    if check and r.returncode:
        sys.exit(f"\nFailed in {cwd}: {' '.join(cmd)}\n{(r.stdout or '')[-2000:]}{(r.stderr or '')[-2000:]}")
    return r.stdout.strip() if capture else ""


def last_published(prod):
    """The dev commit named in the newest production commit that records one."""
    log = run(["git", "log", "-50", "--format=%B%x00"], prod)
    for body in log.split("\x00"):
        m = re.search(r"\bdev ([0-9a-f]{7,40})\b", body)
        if m:
            return m.group(1)
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("prod", type=Path, help="path to a clone of the production repository (SamJ-01/patch-notes)")
    ap.add_argument("--from", dest="since", help="last dev commit already published (default: read from production's log)")
    ap.add_argument("--to", default="HEAD", help="dev commit to publish (default HEAD)")
    ap.add_argument("--dry-run", action="store_true", help="show what would change, apply nothing")
    ap.add_argument("--trailer", action="append", default=[], help="a line to end the commit message with (repeatable)")
    a = ap.parse_args()
    prod = a.prod.resolve()

    if run(["git", "status", "--porcelain"], DEV):
        sys.exit("Dev has uncommitted changes: commit them first, so the release matches a real commit.")
    since = a.since or last_published(prod)
    if not since:
        sys.exit("Couldn't find the last published dev commit in production's log. Pass --from <sha>.")
    to = run(["git", "rev-parse", "--short", a.to], DEV)
    run(["git", "cat-file", "-e", since + "^{commit}"], DEV)
    files = run(["git", "diff", "--name-only", since, to, "--", ".", *[f":!{x}" for x in KEEP_APART]], DEV)
    if not files:
        sys.exit(f"Nothing to publish: dev {since}..{to} changes no shared files.")
    print(f"Publishing dev {since}..{to}: {len(files.splitlines())} files\n  " + "\n  ".join(files.splitlines()))
    if a.dry_run:
        return

    if run(["git", "status", "--porcelain"], prod):
        sys.exit(f"Production clone {prod} has uncommitted changes: refusing to mix them into a release.")
    if run(["git", "rev-parse", "--abbrev-ref", "HEAD"], prod) != "main":
        sys.exit("Production clone is not on main.")
    patch = run(["git", "diff", "--binary", since, to, "--", ".", *[f":!{x}" for x in KEEP_APART]], DEV) + "\n"
    r = subprocess.run(["git", "apply", "--check", "-"], cwd=prod, input=patch, text=True, capture_output=True)
    if r.returncode:
        sys.exit(f"The changes don't apply cleanly to production:\n{r.stderr}")
    subprocess.run(["git", "apply", "-"], cwd=prod, input=patch, text=True, check=True)

    data = prod / "data"
    if not (data / "cves.json").exists():  # a fresh clone has no data snapshot; the offline build needs stubs
        data.mkdir(exist_ok=True)
        (data / "cves.json").write_text('{"rows":[],"watchlist":[],"days":30}')
        (data / "news.json").write_text("[]")
    for cmd in GATE:
        print("gate:", " ".join(cmd))
        r = subprocess.run(cmd, cwd=prod, text=True, capture_output=True)
        if r.returncode:
            print(f"\nThe gate failed in production; the changes are applied but not committed.\n"
                  f"Undo with: git -C {prod} checkout -- . && git -C {prod} clean -fd\n")
            sys.exit((r.stdout or "")[-3000:] + (r.stderr or "")[-3000:])

    run(["git", "add", "-A", "--", *files.splitlines()], prod)
    subjects = run(["git", "log", "--format=- %s", f"{since}..{to}"], DEV)
    msg = (f"Publish from the development repository (dev {to})\n\nDev {since}..{to}:\n{subjects}\n\n"
           "Verified in production: unit tests, node tests, offline build and smoke test.\n")
    if a.trailer:
        msg += "\n" + "\n".join(a.trailer) + "\n"
    subprocess.run(["git", "commit", "-q", "-F", "-"], cwd=prod, input=msg, text=True, check=True)
    print(f"\nCommitted in {prod}: {run(['git', 'log', '-1', '--format=%h %s'], prod)}")
    print("Not pushed. Update production's CLAUDE.md by hand if needed, then push main only with the owner's approval.")


if __name__ == "__main__":
    main()
