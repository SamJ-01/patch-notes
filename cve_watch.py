#!/usr/bin/env python3
"""
CVE Watch - track newly published vulnerabilities and decide what matters.

Pipeline:
  1. NVD (NIST)      -> every CVE published in the last N days (+ CVSS score, CWE weakness, affected products)
  2. CISA KEV        -> which CVEs are confirmed exploited in the wild (including OLD CVEs newly added)
  3. FIRST EPSS      -> probability each CVE gets exploited in the next 30 days
  4. Watchlist       -> flag CVEs touching vendors/products you care about
  5. SQLite          -> remember what we've already seen, so each run can report what's NEW
  6. HTML guide      -> a beginner-friendly page that explains each CVE in plain English

Standard library only. Run:  python3 cve_watch.py --days 7 --open
"""

import argparse
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "cves.db"
WATCHLIST_PATH = HERE / "watchlist.txt"
TEMPLATE_PATH = HERE / "dashboard_template.html"
OUTPUT_PATH = HERE / "dashboard.html"

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
EPSS_URL = "https://api.first.org/data/v1/epss"

USER_AGENT = "cve-watch/1.0 (personal vulnerability tracker)"

# --------------------------------------------------------------------------- HTTP

def get_json(url, headers=None, retries=3):
    """GET a URL and parse JSON, retrying on rate limits / transient errors."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception as exc:  # network errors, 403/429 rate limits, 5xx
            if attempt == retries:
                raise
            wait = 6 * attempt
            print(f"  ! {exc} - retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)


# --------------------------------------------------------------------------- NVD

def fetch_nvd(days):
    """Return raw NVD records for every CVE published in the last `days` days."""
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=days)
    fmt = "%Y-%m-%dT%H:%M:%S.000Z"

    api_key = os.environ.get("NVD_API_KEY")
    headers = {"apiKey": api_key} if api_key else {}
    # NVD allows 5 requests / 30s without a key, 50 / 30s with one.
    pause = 0.6 if api_key else 6

    records, index = [], 0
    while True:
        params = {
            "pubStartDate": start.strftime(fmt),
            "pubEndDate": end.strftime(fmt),
            "resultsPerPage": 2000,
            "startIndex": index,
        }
        page = get_json(f"{NVD_URL}?{urllib.parse.urlencode(params)}", headers)
        records.extend(v["cve"] for v in page["vulnerabilities"])
        total = page["totalResults"]
        print(f"  NVD: {len(records)}/{total}")
        index += page["resultsPerPage"]
        if index >= total:
            return records
        time.sleep(pause)


def fetch_nvd_cve(cve_id):
    """Fetch a single CVE record by ID (used for old CVEs that CISA just added to KEV)."""
    api_key = os.environ.get("NVD_API_KEY")
    time.sleep(0.6 if api_key else 6)  # stay inside NVD's rate limit
    page = get_json(f"{NVD_URL}?cveId={cve_id}", {"apiKey": api_key} if api_key else {})
    return page["vulnerabilities"][0]["cve"]


def best_cvss(metrics):
    """Pick the newest CVSS version available (v4.0 > v3.1 > v3.0 > v2), preferring NVD's own score."""
    for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key) or []
        if not entries:
            continue
        entries = sorted(entries, key=lambda e: e.get("type") != "Primary")
        data = entries[0]["cvssData"]
        severity = data.get("baseSeverity") or entries[0].get("baseSeverity")
        return data["baseScore"], severity, data.get("vectorString"), data.get("version")
    return None, None, None, None


def affected_products(cve):
    """
    Collect 'vendor product' names. The CNA's own affected list comes first because it names
    the software the bug is actually in; NVD's CPE list often adds every OS that bundled it.
    """
    from_cna, from_cpe = [], set()
    for block in cve.get("affected", []):
        for item in block.get("affectedData", []):
            name = f"{item.get('vendor', '')} {item.get('product', '')}".strip()
            if name and "n/a" not in name.lower() and name not in from_cna:
                from_cna.append(name)
    for config in cve.get("configurations", []):
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", []):
                if match.get("vulnerable"):
                    # cpe:2.3:<part>:<vendor>:<product>:<version>:...
                    parts = match["criteria"].split(":")
                    from_cpe.add(f"{parts[3]} {parts[4]}".replace("_", " "))
    return from_cna + sorted(from_cpe - set(from_cna))


def parse_nvd(cve):
    """Flatten one NVD record into the fields we care about."""
    description = next((d["value"] for d in cve.get("descriptions", []) if d["lang"] == "en"), "")
    score, severity, vector, version = best_cvss(cve.get("metrics", {}))
    cwes = sorted({
        d["value"]
        for w in cve.get("weaknesses", [])
        for d in w.get("description", [])
        if d["value"].startswith("CWE-")
    })
    return {
        "id": cve["id"],
        "published": cve["published"][:10],
        "status": cve.get("vulnStatus", ""),
        "description": description,
        "cvss": score,
        "severity": (severity or "NONE").upper(),
        "vector": vector,
        "cvss_version": version,
        "cwes": cwes,
        "products": affected_products(cve),
    }


# --------------------------------------------------------------------------- KEV + EPSS

def fetch_kev():
    """CISA's Known Exploited Vulnerabilities catalog, keyed by CVE ID."""
    data = get_json(KEV_URL)
    print(f"  KEV: {data['count']} known-exploited CVEs (catalog {data['catalogVersion']})")
    return {v["cveID"]: v for v in data["vulnerabilities"]}


def fetch_epss(cve_ids):
    """EPSS exploit-probability scores, fetched in batches of 100."""
    scores, ids = {}, sorted(cve_ids)
    for i in range(0, len(ids), 100):
        batch = ",".join(ids[i:i + 100])
        data = get_json(f"{EPSS_URL}?cve={batch}")
        for row in data.get("data", []):
            scores[row["cve"]] = (float(row["epss"]), float(row["percentile"]))
    print(f"  EPSS: scores for {len(scores)}/{len(ids)} CVEs")
    return scores


# --------------------------------------------------------------------------- Prioritisation

def priority(cve):
    """
    Risk-based triage, roughly how a vulnerability management team thinks:
      1 EXPLOITED  - in CISA KEV: attackers are using it right now
      2 LIKELY     - EPSS >= 10%: high predicted chance of exploitation
      3 CRITICAL   - CVSS >= 9.0: severe if exploited, but no evidence yet
      4 HIGH       - CVSS >= 7.0
      5 OTHER
    """
    if cve["kev"]:
        return 1, "Exploited"
    if (cve["epss"] or 0) >= 0.10:
        return 2, "Likely"
    if (cve["cvss"] or 0) >= 9.0:
        return 3, "Critical"
    if (cve["cvss"] or 0) >= 7.0:
        return 4, "High"
    return 5, "Other"


def load_watchlist():
    if not WATCHLIST_PATH.exists():
        return []
    lines = WATCHLIST_PATH.read_text().splitlines()
    return [l.strip().lower() for l in lines if l.strip() and not l.lstrip().startswith("#")]


def watch_hits(cve, watchlist):
    haystack = " ".join([cve["description"], *cve["products"]]).lower()
    return [term for term in watchlist if term in haystack]


# --------------------------------------------------------------------------- Storage

def open_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("""
        CREATE TABLE IF NOT EXISTS cves (
            id          TEXT PRIMARY KEY,
            first_seen  TEXT NOT NULL,
            data        TEXT NOT NULL
        )
    """)
    return db


def save(db, cves):
    """Upsert CVEs; return the set of IDs we had never seen before this run."""
    now = dt.datetime.now().isoformat(timespec="seconds")
    known = {row[0] for row in db.execute("SELECT id FROM cves")}
    for cve in cves:
        cve["first_seen"] = now if cve["id"] not in known else None
        db.execute(
            """INSERT INTO cves (id, first_seen, data) VALUES (?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET data = excluded.data""",
            (cve["id"], now, json.dumps(cve)),
        )
    db.commit()
    # Fill first_seen for already-known rows from the DB so the dashboard can show it.
    for cve in cves:
        if cve["first_seen"] is None:
            cve["first_seen"] = db.execute("SELECT first_seen FROM cves WHERE id = ?", (cve["id"],)).fetchone()[0]
    return {c["id"] for c in cves} - known


# --------------------------------------------------------------------------- Output

def render(cves, meta):
    payload = json.dumps({"meta": meta, "cves": cves})
    payload = payload.replace("</", "<\\/")  # never let data close the <script> tag
    html = TEMPLATE_PATH.read_text().replace("/*__DATA__*/null", payload)
    OUTPUT_PATH.write_text("<!doctype html>\n<meta charset=\"utf-8\">\n" + html)


def notify(title, message):
    """macOS notification banner (silently skipped on other systems)."""
    if sys.platform != "darwin":
        return
    script = f"display notification {json.dumps(message)} with title {json.dumps(title)}"
    subprocess.run(["osascript", "-e", script], check=False)


# --------------------------------------------------------------------------- Main

def collect(days):
    """Fetch, enrich, prioritise and store CVEs. Returns (rows sorted by priority, meta)."""
    days = max(1, min(days, 120))
    print(f"Fetching CVEs published in the last {days} days...")
    cves = {c["id"]: parse_nvd(c) for c in fetch_nvd(days)}

    print("Fetching CISA Known Exploited Vulnerabilities...")
    kev = fetch_kev()

    # KEV often adds OLD CVEs that just started being exploited. Include recent additions
    # even if NVD published them years ago - these are usually the most urgent items.
    cutoff = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    for cve_id, entry in kev.items():
        if entry["dateAdded"] < cutoff or cve_id in cves:
            continue
        try:
            cves[cve_id] = parse_nvd(fetch_nvd_cve(cve_id))
            print(f"  NVD: fetched older KEV addition {cve_id}")
        except Exception as exc:
            # Fall back to what CISA tells us if NVD is unavailable.
            print(f"  ! couldn't fetch {cve_id} from NVD ({exc}); using KEV data only", file=sys.stderr)
            cves[cve_id] = {
                "id": cve_id,
                "published": None,
                "status": "KEV addition",
                "description": entry["shortDescription"],
                "cvss": None, "severity": "NONE", "vector": None, "cvss_version": None,
                "cwes": entry.get("cwes", []),
                "products": [f"{entry['vendorProject']} {entry['product']}"],
            }

    print("Fetching EPSS exploit-probability scores...")
    epss = fetch_epss(cves.keys())

    watchlist = load_watchlist()
    for cve in cves.values():
        k = kev.get(cve["id"])
        cve["kev"] = {
            "added": k["dateAdded"],
            "due": k["dueDate"],
            "ransomware": k["knownRansomwareCampaignUse"] == "Known",
            "name": k["vulnerabilityName"],
            "action": k["requiredAction"],
        } if k else None
        if k:
            # CISA names the product that's actually being attacked; show it first.
            kev_product = f"{k['vendorProject']} {k['product']}".lower()
            cve["products"] = [kev_product] + [p for p in cve["products"] if p != kev_product]
        cve["epss"], cve["epss_pct"] = epss.get(cve["id"], (None, None))
        cve["watch"] = watch_hits(cve, watchlist)
        cve["priority"], cve["priority_label"] = priority(cve)

    rows = sorted(cves.values(), key=lambda c: (c["priority"], -(c["epss"] or 0), -(c["cvss"] or 0)))

    db = open_db()
    new_ids = save(db, rows)
    for cve in rows:
        cve["new"] = cve["id"] in new_ids

    meta = {
        "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "days": days,
        "watchlist": watchlist,
        "total": len(rows),
        "new": len(new_ids),
    }
    return rows, meta


def main():
    parser = argparse.ArgumentParser(description="Track new CVEs, prioritised by real-world risk.")
    parser.add_argument("--days", type=int, default=7, help="look back this many days (max 120)")
    parser.add_argument("--open", action="store_true", help="open the dashboard in your browser")
    parser.add_argument("--notify", action="store_true", help="macOS notification for new KEV/watchlist hits")
    args = parser.parse_args()

    rows, meta = collect(args.days)
    render(rows, meta)

    exploited = [c for c in rows if c["kev"]]
    watched = [c for c in rows if c["watch"]]
    print(f"\n{len(rows)} CVEs | {meta['new']} new since last run | "
          f"{len(exploited)} known exploited | {len(watched)} watchlist hits")
    print(f"Dashboard: {OUTPUT_PATH}")

    urgent_new = [c for c in rows if c["new"] and (c["kev"] or c["watch"])]
    if args.notify and urgent_new:
        top = urgent_new[0]
        notify(f"CVE Watch: {len(urgent_new)} new to review",
               f"{top['id']} ({top['priority_label']}) {top['description'][:90]}")

    if args.open:
        webbrowser.open(OUTPUT_PATH.as_uri())


if __name__ == "__main__":
    main()
