"""
News collector: pulls headlines from security news RSS/Atom feeds, tags each story with the
topics it covers (so the site can link it to a lesson), and spots CVE IDs it mentions.

Only headlines, a short snippet and a link are kept. Readers go to the original
publisher for the full story.
"""

import datetime as dt
import email.utils
import html
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

USER_AGENT = "Mozilla/5.0 (compatible; patch-notes/1.0; +personal security news reader)"

FEEDS = [
    {"name": "BleepingComputer", "url": "https://www.bleepingcomputer.com/feed/"},
    {"name": "The Hacker News", "url": "https://feeds.feedburner.com/TheHackersNews"},
    {"name": "The Record", "url": "https://therecord.media/feed"},
    {"name": "Krebs on Security", "url": "https://krebsonsecurity.com/feed/"},
    {"name": "SecurityWeek", "url": "https://www.securityweek.com/feed/"},
    {"name": "Dark Reading", "url": "https://www.darkreading.com/rss.xml"},
    {"name": "The Register", "url": "https://www.theregister.com/security/headlines.atom"},
    {"name": "Graham Cluley", "url": "https://grahamcluley.com/feed/"},
    {"name": "Schneier on Security", "url": "https://www.schneier.com/feed/atom/"},
    {"name": "SANS ISC", "url": "https://isc.sans.edu/rssfeed_full.xml"},
    {"name": "UK NCSC", "url": "https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml"},
    {"name": "CISA", "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml"},
]

# Topic -> keyword pattern. Topic IDs match lesson IDs in content/lessons.json,
# so every tagged story can link to the lesson that explains it.
TOPICS = {
    "ransomware": r"ransomware|extortion|lockbit|akira|cl0p|\bclop\b|alphv|blackcat|qilin|scattered spider",
    "phishing": r"phish|smishing|vishing|social engineering|business email compromise|\bbec\b|\bscam|clickfix|email security",
    "zero-day": r"zero-day|0-day|zero day|exploited in the wild|actively exploited|under (active )?attack",
    "vuln-management": r"\bcve-\d{4}-\d+|vulnerabilit|\bflaw|\bpatch|security update|\bbug\b",
    "supply-chain": r"supply[- ]chain|\bnpm\b|pypi|malicious package|open[- ]source package|dependenc|github action|typosquat|hardware implant|spy chip",
    "data-breach": r"breach|data leak|leaked|exposed data|stolen data|data theft|customer data|personal data|data dump|dumped|spills?\b|data sharing",
    "malware": r"malware|trojan|infostealer|stealer|botnet|\brat\b|backdoor|loader|spyware|\bworm\b|rootkit|malicious\b.{0,40}\b(extensions?|apps?|add-ons?)\b|\brmm\b",
    "nation-state": r"nation[- ]state|state[- ]sponsored|\bapt\s?\d*\b|chin(a|ese)|russia|north korea|\biran|lazarus|typhoon|fancy bear|espionage",
    "ddos": r"ddos|denial[- ]of[- ]service",
    "ai-security": r"\bai\b|artificial intelligence|\bllm|chatgpt|deepfake|prompt injection|openai|gemini|copilot|agentic|\bclaude\b",
    "cloud": r"\bcloud|\baws\b|azure|google cloud|kubernetes|misconfigur|s3 bucket|\bsaas\b",
    "identity": r"password|credential|\bmfa\b|multi-factor|\b2fa\b|passkey|authenticat|account takeover|\bokta\b|\bsso\b|sign-on|zero trust",
    "iot-ot": r"\bics\b|scada|industrial|\bot\b|\biot\b|router|camera|\bplc\b|operational technology|critical infrastructure",
    "web-sqli": r"sql injection|\bsqli\b",
    "web-xss": r"cross-site scripting|\bxss\b",
    "incident-response": r"cyberattack|cyber attack|systems offline|takes .* offline|disrupt|outage|incident (response|affecting)",
    "encryption": r"encrypt|certificate|\bcerts?\b|\btls\b|let.s encrypt|quantum|cryptograph",
    "soc": r"\bedr\b|antivirus|microsoft defender|\bsiem\b|security operations|threat hunt|detection",
    "networking": r"\bdns\b|top-level domain|domain hijack|\bbgp\b|firewall rule",
}
TOPIC_RE = {topic: re.compile(pattern, re.I) for topic, pattern in TOPICS.items()}
NOT_NEWS = re.compile(r"^ISC Stormcast|squid blogging|names new editor|writing the next chapter|passing the baton", re.I)
CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.I)
TAG_RE = re.compile(r"<[^>]+>")

ATOM = "{http://www.w3.org/2005/Atom}"


def _text(el):
    return (el.text or "").strip() if el is not None else ""


def clean(raw, words=32):
    """Strip HTML, collapse whitespace and keep only a short snippet."""
    text = html.unescape(TAG_RE.sub(" ", html.unescape(raw or "")))
    text = re.sub(r"\s+", " ", text.replace("\ufffd", "'")).strip()
    parts = text.split(" ")
    return text if len(parts) <= words else " ".join(parts[:words]).rstrip(",;:") + "…"


def parse_date(value):
    if not value:
        return None
    try:
        d = email.utils.parsedate_to_datetime(value)  # RSS: RFC 822
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))  # Atom: ISO 8601
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc)


def parse_feed(xml_bytes, source):
    root = ET.fromstring(xml_bytes)
    items = []
    for item in root.iter("item"):  # RSS 2.0
        items.append({
            "title": _text(item.find("title")),
            "link": _text(item.find("link")),
            "date": parse_date(_text(item.find("pubDate")) or _text(item.find("{http://purl.org/dc/elements/1.1/}date"))),
            "summary": _text(item.find("description")),
        })
    for entry in root.iter(f"{ATOM}entry"):  # Atom
        link = entry.find(f"{ATOM}link[@rel='alternate']")
        if link is None:
            link = entry.find(f"{ATOM}link")
        items.append({
            "title": _text(entry.find(f"{ATOM}title")),
            "link": link.get("href", "") if link is not None else "",
            "date": parse_date(_text(entry.find(f"{ATOM}published")) or _text(entry.find(f"{ATOM}updated"))),
            "summary": _text(entry.find(f"{ATOM}summary")) or _text(entry.find(f"{ATOM}content")),
        })
    for it in items:
        it["source"] = source
    return items


def fetch_feed(feed):
    req = urllib.request.Request(feed["url"], headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return parse_feed(resp.read(), feed["name"])
    except Exception as exc:
        print(f"  ! {feed['name']}: {exc}", file=sys.stderr)
        return []


def collect_news(days=7):
    """Return recent stories from all feeds, newest first, de-duplicated and tagged."""
    with ThreadPoolExecutor(max_workers=6) as pool:
        batches = list(pool.map(fetch_feed, FEEDS))

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    seen, stories = set(), []
    for batch in batches:
        for it in batch:
            title = clean(it["title"], words=40)
            link = it["link"]
            if not title or not link.startswith("https://") or not it["date"] or it["date"] < cutoff or NOT_NEWS.search(title):
                continue
            key = re.sub(r"[^a-z0-9]", "", title.lower())[:60]
            if key in seen:
                continue
            seen.add(key)
            snippet = clean(it["summary"])
            if re.match(r"\(c\)|©|copyright", snippet, re.I):  # licence boilerplate, not a summary
                snippet = ""
            text = f"{title} {snippet}"
            # Weight the headline: a topic in the title counts, in the snippet it needs to be specific.
            topics = [t for t, rx in TOPIC_RE.items() if rx.search(title)]
            topics += [t for t, rx in TOPIC_RE.items() if t not in topics and t != "vuln-management" and rx.search(snippet)]
            if it["source"] == "CISA" and not topics:
                topics = ["vuln-management"]
            stories.append({
                "title": title,
                "link": link,
                "source": it["source"],
                "date": it["date"].isoformat(timespec="minutes"),
                "snippet": snippet,
                "topics": topics[:4],
                "cves": sorted({c.upper() for c in CVE_RE.findall(text)}),
            })

    stories.sort(key=lambda s: s["date"], reverse=True)
    by_source = {}
    for s in stories:
        by_source[s["source"]] = by_source.get(s["source"], 0) + 1
    print(f"  News: {len(stories)} stories from {len(by_source)} sources")
    return stories


if __name__ == "__main__":
    for s in collect_news()[:15]:
        print(s["date"][:16], s["source"], "|", s["title"], s["topics"], s["cves"])
