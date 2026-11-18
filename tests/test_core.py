"""
Core tests: data parsing, prioritisation, page generation and content integrity.
Run with:  python3 -m unittest discover -s tests -v
"""

import datetime as dt
import html
import json
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build  # noqa: E402
import cve_watch  # noqa: E402
import explain  # noqa: E402
import news  # noqa: E402

CONTENT = ROOT / "content"


def content(name):
    return json.loads((CONTENT / name).read_text())


class Prioritisation(unittest.TestCase):
    def cve(self, kev=None, epss=None, cvss=None):
        return {"kev": kev, "epss": epss, "cvss": cvss}

    def test_kev_beats_everything(self):
        self.assertEqual(cve_watch.priority(self.cve(kev={"added": "x"}, epss=0.0, cvss=2.0))[0], 1)

    def test_epss_beats_cvss(self):
        self.assertEqual(cve_watch.priority(self.cve(epss=0.10, cvss=9.8))[0], 2)

    def test_cvss_bands(self):
        self.assertEqual(cve_watch.priority(self.cve(cvss=9.0))[0], 3)
        self.assertEqual(cve_watch.priority(self.cve(cvss=7.0))[0], 4)
        self.assertEqual(cve_watch.priority(self.cve(cvss=6.9))[0], 5)
        self.assertEqual(cve_watch.priority(self.cve())[0], 5)


class NvdParsing(unittest.TestCase):
    def test_newest_cvss_and_primary_preferred(self):
        metrics = {
            "cvssMetricV31": [
                {"type": "Secondary", "cvssData": {"baseScore": 7.5, "baseSeverity": "HIGH", "vectorString": "S", "version": "3.1"}},
                {"type": "Primary", "cvssData": {"baseScore": 9.8, "baseSeverity": "CRITICAL", "vectorString": "P", "version": "3.1"}},
            ],
            "cvssMetricV2": [{"type": "Primary", "cvssData": {"baseScore": 5.0, "vectorString": "V2", "version": "2.0"}, "baseSeverity": "MEDIUM"}],
        }
        self.assertEqual(cve_watch.best_cvss(metrics), (9.8, "CRITICAL", "P", "3.1"))
        self.assertEqual(cve_watch.best_cvss({}), (None, None, None, None))

    def test_affected_products_cna_first_and_no_placeholders(self):
        record = {
            "affected": [{"affectedData": [{"vendor": "n/a", "product": "n/a"}, {"vendor": "ProFTPD", "product": "ProFTPD"}]}],
            "configurations": [{"nodes": [{"cpeMatch": [
                {"vulnerable": True, "criteria": "cpe:2.3:o:debian:debian_linux:8.0:*:*:*:*:*:*:*"},
                {"vulnerable": False, "criteria": "cpe:2.3:h:acme:widget:-:*:*:*:*:*:*:*"},
            ]}]}],
        }
        self.assertEqual(cve_watch.affected_products(record), ["ProFTPD ProFTPD", "debian debian linux"])

    def test_parse_nvd_cleans_mangled_text(self):
        record = {"id": "CVE-2026-1", "published": "2026-10-01T00:00:00.000",
                  "descriptions": [{"lang": "en", "value": "the victim�s browser"}], "metrics": {},
                  "weaknesses": [{"description": [{"value": "CWE-79"}, {"value": "NVD-CWE-noinfo"}]}]}
        parsed = cve_watch.parse_nvd(record)
        self.assertEqual(parsed["description"], "the victim's browser")
        self.assertEqual(parsed["cwes"], ["CWE-79"])
        self.assertEqual(parsed["published"], "2026-10-01")


class Fetching(unittest.TestCase):
    """get_json survives a truncated body, without real network or real waits."""
    class Resp:
        def __init__(self, body):
            self.body = body
        def read(self):
            if isinstance(self.body, Exception):
                raise self.body
            return self.body
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    def fetch(self, responses):
        import http.client
        from unittest import mock
        seen = []
        def urlopen(req, timeout):
            seen.append(req.get_header("Accept-encoding"))
            r = responses.pop(0)
            return self.Resp(http.client.IncompleteRead(b"{", 10) if r == "cut" else r)
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep, mock.patch("sys.stderr"):
            return cve_watch.get_json("https://example.test/"), seen, sleep

    def test_retries_a_cut_off_body(self):
        data, seen, sleep = self.fetch(["cut", "cut", b'{"ok": 1}'])
        self.assertEqual(data, {"ok": 1})
        self.assertEqual(seen, [None] * 3, "no gzip: NVD's compressed responses were the unreliable ones")
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [10, 20])

    def test_gives_up_after_five_tries(self):
        import http.client
        with self.assertRaises(http.client.IncompleteRead):
            self.fetch(["cut"] * 5)


class NvdOutage(unittest.TestCase):
    """If NVD stays down after retries, the build uses CVEs saved by earlier runs instead of failing."""

    def test_stale_cve_sources_are_reported(self):
        """A source that couldn't be reached on the last update is named on CVE Radar; older snapshots say nothing."""
        self.assertEqual(build.stale_sources({"fresh": {"NVD": False, "CISA KEV": True, "FIRST EPSS": False}}), ["NVD", "FIRST EPSS"])
        self.assertEqual(build.stale_sources({"fresh": {"NVD": True, "CISA KEV": True, "FIRST EPSS": True}}), [])
        self.assertEqual(build.stale_sources({"rows": []}), [], "a snapshot from before freshness was recorded")

    def test_collect_falls_back_to_saved_cves(self):
        import http.client
        import tempfile
        from pathlib import Path
        from unittest import mock
        today = __import__("datetime").date.today().isoformat()
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "cves.db"
            with mock.patch.object(cve_watch, "DB_PATH", db):
                conn = cve_watch.open_db()
                self.addCleanup(conn.close)
                saved = {"id": "CVE-2026-0001", "published": today + "T10:00:00.000", "status": "Analyzed", "description": "A flaw.",
                         "cvss": 9.8, "severity": "CRITICAL", "vector": "AV:N", "cvss_version": "3.1", "cwes": ["CWE-79"], "products": ["acme widget"],
                         "kev": None, "epss": 0.5, "priority": 2}
                old = dict(saved, id="CVE-2020-0001", published="2020-01-01T00:00:00.000")
                cve_watch.save(conn, [saved, old])
                cut = mock.Mock(side_effect=http.client.IncompleteRead(b"{", 10))
                with mock.patch.object(cve_watch, "fetch_nvd", cut), mock.patch.object(cve_watch, "fetch_kev", return_value={}), \
                        mock.patch.object(cve_watch, "fetch_epss", return_value={}), mock.patch.object(cve_watch, "fetch_nvd_cve") as one, \
                        mock.patch("sys.stderr"):
                    rows, meta = cve_watch.collect(7)
                self.assertEqual([r["id"] for r in rows], ["CVE-2026-0001"], "saved CVEs inside the window only")
                self.assertFalse(meta["nvd_fresh"])
                self.assertIsNone(rows[0]["epss"], "enrichment is redone, not copied from the old row")
                one.assert_not_called()

    def test_kev_stand_in_never_overwrites_saved_details(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cve_watch, "DB_PATH", Path(tmp) / "c.db"):
            db = cve_watch.open_db()
            self.addCleanup(db.close)
            full = {"id": "CVE-2019-1", "published": "2019-01-01", "status": "Analyzed", "description": "Full NVD text.", "products": []}
            cve_watch.save(db, [full])
            cve_watch.save(db, [dict(full, status="KEV addition", description="Short KEV text.")])
            self.assertEqual(cve_watch.cached_cves(ids={"CVE-2019-1"})["CVE-2019-1"]["description"], "Full NVD text.")
            cve_watch.save(db, [dict(full, description="Updated NVD text.")])
            self.assertEqual(cve_watch.cached_cves(ids={"CVE-2019-1"})["CVE-2019-1"]["description"], "Updated NVD text.", "real updates still apply")

    def test_collect_still_fails_with_nothing_saved(self):
        import http.client
        import tempfile
        from pathlib import Path
        from unittest import mock
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cve_watch, "DB_PATH", Path(tmp) / "none.db"), \
                mock.patch.object(cve_watch, "fetch_nvd", side_effect=http.client.IncompleteRead(b"", 1)):
            with self.assertRaises(http.client.IncompleteRead):
                cve_watch.collect(7)


class KevEpssOutage(unittest.TestCase):
    """If CISA KEV or FIRST EPSS stays down, the build keeps their saved details instead of failing."""

    def test_collect_keeps_saved_kev_and_epss(self):
        import http.client
        from unittest import mock
        today = dt.date.today().isoformat()
        nvd = {"id": "CVE-2026-0002", "published": today + "T10:00:00.000", "status": "Analyzed", "description": "A flaw.",
               "cvss": 9.8, "severity": "CRITICAL", "vector": "AV:N", "cvss_version": "3.1", "cwes": [], "products": ["acme widget"]}
        kev = {"added": today, "due": today, "ransomware": True, "name": "Acme flaw", "action": "Patch it."}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cve_watch, "DB_PATH", Path(tmp) / "c.db"):
            seeded = cve_watch.open_db()
            cve_watch.save(seeded, [dict(nvd, kev=kev, epss=0.42, epss_pct=0.97, priority=1)])
            seeded.close()
            down = mock.Mock(side_effect=http.client.IncompleteRead(b"{", 10))
            with mock.patch.object(cve_watch, "fetch_nvd", return_value=[{"id": "CVE-2026-0002"}]), mock.patch.object(cve_watch, "parse_nvd", return_value=dict(nvd)), \
                    mock.patch.object(cve_watch, "fetch_kev", down), mock.patch.object(cve_watch, "fetch_epss", down), mock.patch("sys.stderr"):
                rows, meta = cve_watch.collect(7)
        self.assertEqual(rows[0]["kev"], kev, "KEV details saved by an earlier run are kept")
        self.assertEqual((rows[0]["epss"], rows[0]["epss_pct"]), (0.42, 0.97))
        self.assertTrue(meta["nvd_fresh"])
        self.assertFalse(meta["kev_fresh"])
        self.assertFalse(meta["epss_fresh"])


class Feeds(unittest.TestCase):
    RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Big &amp; bad &lt;b&gt;bug&lt;/b&gt;</title><link>https://example.com/a</link>
      <pubDate>Mon, 12 Oct 2026 08:00:00 +0000</pubDate><description>&lt;p&gt;Attackers exploit a flaw&lt;/p&gt;</description></item>
    </channel></rss>"""
    ATOM = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Atom story</title><link rel="alternate" href="https://example.com/b"/>
      <updated>2026-10-12T09:30:00Z</updated><summary>Summary text</summary></entry></feed>"""

    def test_rss_and_atom(self):
        rss = news.parse_feed(self.RSS, "Example")
        atom = news.parse_feed(self.ATOM, "Example")
        self.assertEqual(rss[0]["link"], "https://example.com/a")
        self.assertEqual(rss[0]["date"], dt.datetime(2026, 10, 12, 8, 0, tzinfo=dt.timezone.utc))
        self.assertEqual(atom[0]["link"], "https://example.com/b")
        self.assertEqual(atom[0]["date"].hour, 9)

    def test_clean_strips_markup_and_limits_words(self):
        self.assertEqual(news.clean("<p>Hello <b>world</b></p>"), "Hello world")
        self.assertEqual(news.clean("one two three four", words=2), "one two…")
        self.assertEqual(news.clean("it�s"), "it's")

    def test_topic_patterns_compile_and_match(self):
        self.assertTrue(news.TOPIC_RE["ransomware"].search("LockBit ransomware hits retailer"))
        self.assertTrue(news.TOPIC_RE["web-sqli"].search("SQL injection in MOVEit"))
        self.assertTrue(news.TOPIC_RE["zero-day"].search("Maximum-Severity SSRF Flaw in SonicWall SMA Devices Under Attack"))
        self.assertTrue(news.TOPIC_RE["malware"].search("16 Malicious Firefox Extensions Pose as Wallets"))
        self.assertFalse(news.TOPIC_RE["malware"].search("Malicious actors target banks"))

    def test_topics_link_to_real_lessons(self):
        lessons = {l["id"] for l in content("lessons.json")}
        self.assertLessEqual(set(news.TOPICS), lessons)

    def test_non_news_items_are_skipped(self):
        self.assertTrue(news.NOT_NEWS.search("ISC Stormcast For Tuesday, October 13th"))
        self.assertTrue(news.NOT_NEWS.search("Friday Squid Blogging: I Caught a Squid"))
        self.assertFalse(news.NOT_NEWS.search("Squid proxy vulnerability patched"))


class PageGeneration(unittest.TestCase):
    def test_embed_json_cannot_break_out_of_script(self):
        out = build.embed_json({"x": "</script><!--<script>alert(1)"})
        self.assertNotIn("<", out)
        self.assertEqual(json.loads(out)["x"], "</script><!--<script>alert(1)")

    def test_trends_from_rows_without_history(self):
        today = dt.date.today().isoformat()
        rows = [{"published": today, "cvss": 9.8, "cwes": ["CWE-79"], "products": ["acme widget"]},
                {"published": today, "cvss": 7.0, "cwes": ["CWE-79"], "products": ["acme gadget"]},
                {"published": None, "cvss": None, "cwes": [], "products": []}]
        t = build.trends(rows, {"CWE-79": {"name": "XSS"}}, db_path=ROOT / "does-not-exist.db")
        self.assertEqual(t["daily"][-1], {"date": today, "critical": 1, "high": 1, "other": 0})
        self.assertEqual(t["cwes"][0], {"id": "CWE-79", "name": "XSS", "n": 2})
        self.assertEqual(t["vendors"][0], {"name": "acme", "n": 2})

    def test_rss_and_sitemap_are_valid_xml(self):
        site = {"url": "https://example.com/patch-notes/", "description": "d"}
        stories = [{"title": "A & B <x>", "link": "https://example.com/a", "date": "2026-10-12T08:00+00:00", "snippet": "s", "source": "Src"}]
        feed = ET.fromstring(build.rss(stories, {"https://example.com/a": "Explained."}, site))
        self.assertEqual(feed.find("channel/item/title").text, "A & B <x>")
        self.assertIn("Explained.", feed.find("channel/item/description").text)
        smap = ET.fromstring(build.sitemap(content("lessons.json"), site))
        self.assertEqual(len(smap), len(content("lessons.json")) + 2)

    def test_lesson_page_escapes_content(self):
        lessons = content("lessons.json")
        lesson = dict(lessons[0], title="<script>x</script>")
        fonts, css = build.page_css(build.assemble_template())
        page = build.lesson_page(lesson, lessons[1], fonts, css, {"url": "https://example.com/"})
        self.assertNotIn("<script>x</script>", page)
        self.assertIn("&lt;script&gt;", page)


class ExplainHelper(unittest.TestCase):
    """AI-written content must go through drafts and only reach the site once approved."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp = Path(self.tmp.name)
        self.saved = {k: getattr(explain, k) for k in ("NEWS", "EXPLAINERS", "EXPLAINER_DRAFTS", "GLOSSARY", "DRAFTS", "LOG")}
        for k in self.saved:
            setattr(explain, k, tmp / f"{k.lower()}.json")
        explain.NEWS.write_text(json.dumps([{"link": "https://k/1", "title": "t", "snippet": "", "source": "s"}]))
        self.incoming = tmp / "in.json"

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(explain, k, v)
        self.tmp.cleanup()

    def test_add_creates_drafts_not_live_content(self):
        self.incoming.write_text(json.dumps({"https://k/1": "x " * 600, "https://unknown/2": "nope"}))
        explain.add(self.incoming)
        drafts = json.loads(explain.EXPLAINER_DRAFTS.read_text())
        self.assertEqual(list(drafts), ["https://k/1"])
        self.assertLessEqual(len(drafts["https://k/1"]["text"]), explain.MAX_CHARS)
        self.assertFalse(explain.EXPLAINERS.exists())

    def test_fact_check_verdicts_publish_correct_or_reject_and_are_logged(self):
        explain.NEWS.write_text(json.dumps([{"link": f"https://k/{i}", "title": "t", "snippet": "", "source": "s"} for i in (1, 2, 3)]))
        self.incoming.write_text(json.dumps({"https://k/1": "accurate", "https://k/2": "two critical", "https://k/3": "made up", "https://k/4": "x"}))
        explain.add(self.incoming)
        drafts = json.loads(explain.EXPLAINER_DRAFTS.read_text())
        drafts["https://gone/9"] = {"text": "old story", "date": "2026-01-01"}  # its story has left the site
        explain.EXPLAINER_DRAFTS.write_text(json.dumps(drafts))
        verdicts = self.incoming.with_name("v.json")
        verdicts.write_text(json.dumps([
            {"link": "https://k/1", "verdict": "publish", "evidence": "article"},
            {"link": "https://k/2", "verdict": "publish", "text": "five critical", "evidence": "article", "notes": "count was wrong"},
            {"link": "https://k/3", "verdict": "reject", "evidence": "article", "notes": "unsupported"},
        ]))
        explain.publish(verdicts)
        live = json.loads(explain.EXPLAINERS.read_text())
        self.assertEqual({k: v["text"] for k, v in live.items()}, {"https://k/1": "accurate", "https://k/2": "five critical"})
        self.assertEqual(json.loads(explain.EXPLAINER_DRAFTS.read_text()), {})
        logged = {e.get("link"): (e["verdict"], e.get("corrected")) for e in json.loads(explain.LOG.read_text())}
        self.assertEqual(logged, {"https://k/1": ("publish", False), "https://k/2": ("publish", True), "https://k/3": ("reject", False), "https://gone/9": ("dropped", None)})

    def test_glossary_verdicts_apply_corrections(self):
        explain.GLOSSARY.write_text("[]")
        explain.DRAFTS.write_text(json.dumps([{"id": "isac", "term": "ISAC (Centre)", "kind": "Organisation", "aliases": ["ISAC"], "short": "x", "lesson": "", "draft": "2026-10-13"},
                                              {"id": "junk", "term": "Junk", "kind": "Concept", "aliases": ["junk"], "short": "y", "draft": "2026-10-13"}]))
        verdicts = self.incoming.with_name("t.json")
        verdicts.write_text(json.dumps([{"id": "isac", "verdict": "publish", "entry": {"term": "ISAC (Center)", "lesson": "soc"}},
                                        {"id": "junk", "verdict": "reject", "notes": "not verifiable"}]))
        explain.publish_terms(verdicts)
        self.assertEqual(json.loads(explain.GLOSSARY.read_text()), [{"id": "isac", "term": "ISAC (Center)", "kind": "Organisation", "aliases": ["ISAC"], "short": "x", "lesson": "soc"}])
        self.assertEqual(json.loads(explain.DRAFTS.read_text()), [])

    def test_approve_publishes_and_clears_draft(self):
        self.incoming.write_text(json.dumps({"https://k/1": "Draft text."}))
        explain.add(self.incoming)
        explain.approve("https://k/1", "Edited  text.")
        self.assertEqual(json.loads(explain.EXPLAINERS.read_text())["https://k/1"]["text"], "Edited text.")
        self.assertEqual(json.loads(explain.EXPLAINER_DRAFTS.read_text()), {})

    def test_glossary_approval_blocks_clashes(self):
        explain.GLOSSARY.write_text(json.dumps([{"id": "rce", "term": "RCE", "kind": "Attack", "aliases": ["RCE"], "short": "x"}]))
        explain.DRAFTS.write_text(json.dumps([
            {"id": "dup", "term": "Dup", "kind": "Attack", "aliases": ["rce"], "short": "x", "draft": "2026-10-13"},
            {"id": "new", "term": "New", "kind": "Concept", "aliases": ["NEWTERM"], "short": "y", "see": [], "lesson": "", "draft": "2026-10-13"},
        ]))
        drafts = json.loads(explain.DRAFTS.read_text())
        self.assertIn("aliases already used", explain.approve_term(drafts[0]))
        self.assertIsNone(explain.approve_term(drafts[1]))
        live = json.loads(explain.GLOSSARY.read_text())
        self.assertEqual(live[-1], {"id": "new", "term": "New", "kind": "Concept", "aliases": ["NEWTERM"], "short": "y"})
        self.assertEqual([d["id"] for d in json.loads(explain.DRAFTS.read_text())], ["dup"])


class PublishingSafety(unittest.TestCase):
    def test_push_confirmation_names_repository_and_branch_without_credentials(self):
        from unittest.mock import patch
        import subprocess
        results = [
            subprocess.CompletedProcess([], 0, stdout="https://user:secret@github.com/SamJ-01/patch-notes-dev.git\n"),
            subprocess.CompletedProcess([], 0, stdout="audit/code-cleanup\n"),
        ]
        with patch.object(explain.subprocess, "run", side_effect=results) as run, \
             patch("builtins.input", return_value="n") as prompt, \
             patch("builtins.print") as output:
            explain.offer_push(["content/explainers.json"], "Approve explanations")
        self.assertEqual(run.call_count, 2, "declining must not stage, commit or push")
        question = prompt.call_args.args[0]
        self.assertIn("github.com/SamJ-01/patch-notes-dev", question)
        self.assertIn("audit/code-cleanup", question)
        self.assertNotIn("secret", question)
        self.assertTrue(any("remain local" in str(call) for call in output.call_args_list))

    def test_push_confirmation_refuses_detached_head(self):
        from unittest.mock import patch
        import subprocess
        results = [
            subprocess.CompletedProcess([], 0, stdout="git@github.com:SamJ-01/patch-notes-dev.git\n"),
            subprocess.CompletedProcess([], 0, stdout="\n"),
        ]
        with patch.object(explain.subprocess, "run", side_effect=results) as run, \
             patch("builtins.input") as prompt, \
             patch("builtins.print") as output:
            explain.offer_push(["content/explainers.json"], "Approve explanations")
        self.assertEqual(run.call_count, 2)
        prompt.assert_not_called()
        self.assertTrue(any("Cannot safely offer a push" in str(call) for call in output.call_args_list))

    def test_accepted_push_targets_confirmed_origin_head(self):
        from unittest.mock import patch
        import subprocess
        results = [
            subprocess.CompletedProcess([], 0, stdout="git@github.com:SamJ-01/patch-notes-dev.git\n"),
            subprocess.CompletedProcess([], 0, stdout="audit/code-cleanup\n"),
            subprocess.CompletedProcess([], 0),
            subprocess.CompletedProcess([], 1),  # staged changes exist
            subprocess.CompletedProcess([], 0),
            subprocess.CompletedProcess([], 0),
        ]
        with patch.object(explain.subprocess, "run", side_effect=results) as run, \
             patch("builtins.input", return_value="y"):
            explain.offer_push(["content/explainers.json"], "Approve explanations")
        self.assertEqual(run.call_args_list[-1].args[0], ["git", "push", "-q", "origin", "HEAD"])


class Styles(unittest.TestCase):
    def test_glossary_term_style_is_inline_only(self):
        """Regression: a lab once reused the class name "term", turning every glossary word into a 460px box."""
        import re
        css = re.search(r"<style>(.*?)</style>", build.assemble_template(), re.S).group(1)
        for body in re.findall(r"(?:^|\n)\.term\s*\{([^}]*)\}", css):
            self.assertNotRegex(body, r"\b(height|display|grid)\s*:", "the glossary .term class must stay an inline text style")

    def test_light_theme_covers_every_token(self):
        """Every colour token the dark theme defines must be redefined for light, or light mode shows dark patches."""
        import re
        css = re.search(r"<style>(.*?)</style>", build.assemble_template(), re.S).group(1)
        dark = re.search(r":root \{(.*?)\}", css, re.S).group(1)
        light = re.search(r':root\[data-theme="light"\] \{(.*?)\}', css, re.S).group(1)
        skip = {"--font-display", "--font-body", "--font-mono", "--radius", "--radius-sm"}
        missing = set(re.findall(r"(--[\w-]+):", dark)) - set(re.findall(r"(--[\w-]+):", light)) - skip
        self.assertEqual(missing, set())
        self.assertNotIn('fill="${SEV_COLORS', build.assemble_template(), "SVG fill attributes can't read CSS variables")


class Housekeeping(unittest.TestCase):
    def test_pipeline_closes_its_database_connections(self):
        """A leaked SQLite handle keeps cves.db locked (and the CI cache step copies that file)."""
        import gc, warnings
        from unittest import mock
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cve_watch, "DB_PATH", Path(tmp) / "c.db"):
            db = cve_watch.open_db()
            cve_watch.save(db, [{"id": "CVE-2026-0003", "published": dt.date.today().isoformat(), "status": "Analyzed", "description": "A flaw."}])
            db.close()
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always", ResourceWarning)
                cve_watch.cached_cves(7)
                cve_watch.cached_extras()
                build.trends([], {}, db_path=cve_watch.DB_PATH)
                gc.collect()
            self.assertEqual([str(w.message) for w in caught if issubclass(w.category, ResourceWarning)], [])


class FictionalDomains(unittest.TestCase):
    """Made-up organisations must live on reserved names (RFC 2606/6761: .example, example.com/net/org).
    Five 'fictional' company domains once turned out to be registered to real owners, and the attacker
    look-alikes beside them were free for anyone to register and catch a learner who typed one in."""
    RESERVED = re.compile(r"(?:^|\.)(?:example|test|invalid|example\.(?:com|net|org))$")
    # Real services a scenario names on purpose, and a public-sector name nobody can register.
    REAL = {"gmail.com", "riverton.gov.uk", "www.riverton.gov.uk"}

    def ok(self, host):
        host = host.lower().rstrip(".")
        return bool(self.RESERVED.search(host)) or host in self.REAL or host.endswith((".outlook.com", ".google.com"))

    def test_phishing_game_senders_and_links_use_reserved_domains(self):
        from urllib.parse import urlsplit
        for mail in content("phish.json"):
            self.assertTrue(self.ok(mail["fromAddr"].split("@")[1]), mail["fromAddr"])
            for href in re.findall(r'"href": "([^"]+)"', json.dumps(mail)):
                self.assertTrue(self.ok(urlsplit(href).hostname or ""), href)

    def test_email_addresses_in_scenarios_use_reserved_domains(self):
        skip = {"site.json", "explainers.json", "verification_log.json", "careers.json"}
        for f in sorted(CONTENT.rglob("*.json")):
            if f.name in skip:
                continue
            for addr in set(re.findall(r"[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})", f.read_text())):
                self.assertTrue(self.ok(addr), f"{f.relative_to(ROOT)} uses the address domain {addr}")


class SafetyNotes(unittest.TestCase):
    """The "Is this safe?" notes (content/safety.json, safeNote in 02-glossary). Every key a lab or lesson names must
    exist, every terminal lab says it's a simulator with "Show me how" steps for its kind, the copy stays short, and
    the claims the notes make about the content stay true."""
    NOTES = json.loads((CONTENT / "safety.json").read_text())
    TERMINALS = {"terminal", "nettools", "vlan", "perms"}

    def test_notes_are_complete_and_short(self):
        for key, n in self.NOTES.items():
            if key.startswith("_"):
                continue
            self.assertIn(n.get("tone"), {"good", "warn"}, key)
            self.assertLessEqual(len(n["text"].split()), 32, f"{key}: keep the line to about 30 words")
            for part in [n["title"], n["text"], *(n.get("more") or {}).get("items", []), *sum((n.get("how") or {}).values(), [])]:
                self.assertNotIn("\u2014", part, f"{key}: no em dashes")
            if n.get("more"):
                self.assertTrue(n["more"]["summary"] and n["more"]["items"], key)

    def test_every_named_note_exists(self):
        lessons = content("lessons.json")
        lessons = lessons["lessons"] if isinstance(lessons, dict) else lessons
        for item in [*content("labs.json"), *lessons]:
            for key in ([item["safety"]] if isinstance(item.get("safety"), str) else item.get("safety", [])):
                self.assertIn(key, self.NOTES, f"{item['id']} names the note {key}")

    def test_terminal_labs_say_they_are_simulators_with_steps(self):
        for lab in content("labs.json"):
            if lab.get("kind") in self.TERMINALS:
                keys = [lab["safety"]] if isinstance(lab.get("safety"), str) else lab.get("safety", [])
                self.assertIn("sim", keys, f"{lab['id']} has a command line: say it's a simulator")
                self.assertTrue(self.NOTES["sim"]["how"].get(lab["kind"]), f"no Show me how steps for {lab['kind']}")

    def test_agency_public_addresses_are_documentation_ranges(self):
        """Backs the note "the public IP addresses come from ranges kept for examples"."""
        import ipaddress
        doc = [ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
        for f in sorted((CONTENT / "agency").glob("*.json")):
            # Version numbers (Chrome/129.0.0.0) look like addresses; skip anything straight after a slash or letter.
            for ip in re.findall(r"(?<![\w./])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])", f.read_text()):
                try:
                    a = ipaddress.ip_address(ip)
                except ValueError:
                    continue
                self.assertTrue(a.is_private or a.is_loopback or a.is_unspecified or any(a in n for n in doc), f"{f.name}: {ip}")


class LazyBodies(unittest.TestCase):
    """The page carries only what lists, cards and counts need; each heavy body is a separate file fetched on open
    (build.split_bodies, loadFull / loadQuestions in 01-core). Nothing may be lost in the split."""
    def test_split_keeps_every_body_and_only_light_fields_in_the_page(self):
        labs, missions = content("labs.json"), [json.loads(f.read_text()) for f in sorted((CONTENT / "missions").glob("*.json"))]
        agency = [json.loads(f.read_text()) for f in sorted((CONTENT / "agency").glob("*.json"))]
        certs = build.load_certs()
        light, files = build.split_bodies({"labs": labs, "missions": missions, "agency": agency, "certs": certs, "other": 1})
        self.assertEqual(light["other"], 1)
        for kind, items in (("labs", labs), ("missions", missions), ("agency", agency)):
            for item, slim in zip(items, light[kind]):
                self.assertEqual(files[f"{kind}/{item['id']}.json"], item, "the whole body is written")
                self.assertEqual(slim["_lazy"], 1)
                self.assertLessEqual(set(slim) - {"_lazy", "modes"}, build.LIGHT[kind], item["id"])
        self.assertNotIn("steps", light["labs"][0]); self.assertNotIn("alerts", light["agency"][0])
        for c, slim in zip(certs, light["certs"]):
            self.assertEqual(files[f"questions/{c['id']}.json"], c["questions"])
            self.assertEqual([q["id"] for q in slim["questions"]], [q["id"] for q in c["questions"]])
            for q, s in zip(c["questions"], slim["questions"]):
                self.assertEqual(s, {"id": q["id"], "objective": q["objective"], "single": sum(o["correct"] for o in q["options"]) == 1})
        # Fields the page reads before a body loads must be in the light copies.
        for m in light["missions"]:
            self.assertTrue(all("label" in v and "xp" in v for v in m["modes"].values()), m["id"])



class PracticePages(unittest.TestCase):
    """Static pages for every lab, mission, shift and PBQ (build.practice_items/practice_page), so search engines and
    shared links find the hands-on work, not just lessons. They list the questions, never the answers."""
    def setUp(self):
        self.full = {"labs": content("labs.json"), "missions": [json.loads(f.read_text()) for f in sorted((CONTENT / "missions").glob("*.json"))],
                     "agency": [json.loads(f.read_text()) for f in sorted((CONTENT / "agency").glob("*.json"))], "certs": build.load_certs()}
        self.items = build.practice_items(self.full, self.full["certs"])

    def test_one_page_per_activity_with_unique_ids_and_real_routes(self):
        n = len(self.full["labs"]) + len(self.full["missions"]) + len(self.full["agency"]) + sum(len(c.get("pbqs", [])) for c in self.full["certs"])
        self.assertEqual(len(self.items), n)
        self.assertEqual(len({i["id"] for i in self.items}), n, "page file names are unique")
        for i in self.items:
            self.assertTrue(i["title"] and i["lead"], i["id"])
            self.assertTrue(i["objectives"], f"{i['id']} names the exam objectives it practises")

    def test_pages_escape_content_and_leave_answers_out(self):
        fonts, css = build.page_css(build.assemble_template())
        lab = next(i for i in self.items if i["id"] == "sqli-log")
        page = build.practice_page(dict(lab, title="<script>x</script>"), fonts, css, {"url": "https://example.com/"})
        self.assertNotIn("<script>x</script>", page)
        src = next(l for l in self.full["labs"] if l["id"] == "sqli-log")
        for st in src["steps"]:
            self.assertNotIn(html.escape(st["explain"]), page, "explanations (the answers) stay in the app")

    def test_sitemap_lists_the_practice_pages(self):
        smap = ET.fromstring(build.sitemap(content("lessons.json"), {"url": "https://example.com/"}, self.items))
        self.assertEqual(len(smap), len(content("lessons.json")) + 3 + len(self.items))

class Markup(unittest.TestCase):
    def test_glossary_related_buttons_have_their_own_attribute(self):
        """Lessons' "Re-read" buttons use data-see. The glossary popup's "Related" buttons once shared that name, so its
        page-wide click handler caught every Re-read press and threw looking up a term called "what" (18 Nov audit)."""
        js = (ROOT / "src" / "app" / "02-glossary.js").read_text()
        self.assertNotIn("[data-see]", js)
        self.assertIn("data-gsee", js)

    def test_glossary_terms_are_never_put_inside_buttons(self):
        """A glossary term is itself a button. Inside another button it can't be reached by keyboard, a tap
        on it also presses the outer button, and screen readers announce it wrongly (axe: nested-interactive)."""
        nested = re.compile(r"<button\b[^>]*>\s*\$\{\s*(?:gl|gloss)\(")
        for f in sorted([*(ROOT / "src" / "app").glob("*.js"), *(ROOT / "static" / "js").rglob("*.js")]):
            for n, line in enumerate(f.read_text().splitlines(), 1):
                self.assertIsNone(nested.search(line), f"{f.relative_to(ROOT)}:{n} puts glossary markup inside a button")


class Contrast(unittest.TestCase):
    def test_osi_layer_labels_are_readable_in_light_theme(self):
        """Each layer's header label is its own colour darkened, on a tint of that colour. Three of the seven
        (green, teal, amber) once fell under WCAG AA 4.5:1 in light theme, only after stepping into the lab."""
        css = (ROOT / "src" / "site.css").read_text()
        pct = int(re.search(r'\[data-theme="light"\] \.pdu-h b[^{]*\{ color: color-mix\(in srgb, var\(--c\) (\d+)%, #000\)', css).group(1)) / 100
        tint = int(re.search(r"\.pdu-h, \.pdu-data \{[^}]*color-mix\(in srgb, var\(--c\) (\d+)%, var\(--bg\)\)", css).group(1)) / 100
        bg = re.search(r':root\[data-theme="light"\][^{]*\{[^}]*--bg:\s*(#[0-9a-fA-F]{6})', css).group(1)
        osi = next(l for l in content("labs.json") if l["id"] == "osi-model")
        colours = sorted(set(re.findall(r"#[0-9a-fA-F]{6}", json.dumps(osi))))
        self.assertGreaterEqual(len(colours), 7)
        rgb = lambda c: [int(c[i:i + 2], 16) for i in (1, 3, 5)]
        mix = lambda a, b, p: [a[i] * p + b[i] * (1 - p) for i in range(3)]
        chan = lambda v: v / 255 / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4
        lum = lambda c: 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
        for c in colours:
            text, back = lum(mix(rgb(c), [0, 0, 0], pct)), lum(mix(rgb(c), rgb(bg), tint))
            ratio = (max(text, back) + 0.05) / (min(text, back) + 0.05)
            self.assertGreaterEqual(ratio, 4.5, f"{c} label is {ratio:.2f}:1 on its tint")


class CardPictures(unittest.TestCase):
    """Every card has its own picture (done 12 November 2026; the owner asked for no duplicates). A new card must get
    its own file too, not a copy of another card's: docs/card-shot-list.md and docs/image-style.md say how."""

    def test_no_two_cards_share_a_picture(self):
        import collections, hashlib
        by_hash = collections.defaultdict(list)
        for f in sorted((ROOT / "static" / "img" / "cards").glob("*.webp")):
            by_hash[hashlib.md5(f.read_bytes()).hexdigest()].append(f.stem)
        shared = [g for g in by_hash.values() if len(g) > 1]
        self.assertEqual(shared, [], "these cards share one picture")


class MailAppColours(unittest.TestCase):
    """The mail app is white in both themes, so nothing inside it may depend on the page theme."""

    def test_mail_app_carries_light_theme_colours(self):
        css = (ROOT / "src" / "site.css").read_text()
        light = dict(re.findall(r"(--[a-z0-9-]+):\s*([^;]+);", re.search(r':root\[data-theme="light"\] \{(.*?)\n\}', css, re.S).group(1)))
        scoped = dict(re.findall(r"(--[a-z0-9-]+):\s*([^;]+);", re.search(r"\n\.em-app \{\n(.*?)\n\}", css, re.S).group(1)))
        for token in ("--ink", "--muted", "--line", "--brand", "--sun", "--good", "--bad", "--surface", "--surface-2"):
            self.assertEqual(scoped.get(token), light[token], f"{token} inside the mail app must match the light theme")

    def test_sender_avatar_initial_is_readable_for_every_colour(self):
        import colorsys
        css = (ROOT / "src" / "site.css").read_text()
        sat, light = (int(x) / 100 for x in re.search(r"\.em-av \{[^}]*hsl\(var\(--em-h\) (\d+)% (\d+)%\)", css).groups())
        chan = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        for hue in range(360):
            r, g, b = colorsys.hls_to_rgb(hue / 360, light, sat)
            ratio = 1.05 / (0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b) + 0.05)
            self.assertGreaterEqual(ratio, 4.5, f"white initial on hue {hue} is {ratio:.2f}:1")


class SecurityControls(unittest.TestCase):
    """Guards for the site's and pipeline's security controls, so they can't quietly regress."""

    def test_workflow_actions_pinned_and_permissions_scoped(self):
        import re
        wf = (ROOT / ".github" / "workflows" / "daily.yml").read_text()
        uses = re.findall(r"uses:\s*(\S+)", wf)
        self.assertTrue(uses)
        for u in uses:
            self.assertRegex(u, r"@[0-9a-f]{40}$", f"pin {u} to a full commit SHA")
        self.assertIn("permissions: {}", wf, "no workflow-wide permissions")
        build = wf.split("  deploy:")[0]
        self.assertNotIn("pages: write", build, "only the deploy job may publish")
        self.assertNotIn("id-token: write", build)
        self.assertIn("persist-credentials: false", build)

    def test_article_fetch_is_https_only_and_capped(self):
        """urllib also opens file:// and ftp://; the fact-check fetch must never read a local file."""
        from unittest.mock import patch
        with tempfile.NamedTemporaryFile("w", suffix=".html") as f:
            f.write("<p>" + "secret local text " * 100 + "</p>"); f.flush()
            with patch("urllib.request.urlopen") as opened:
                for url in (Path(f.name).as_uri(), "ftp://example.com/a", "http://example.com/a", "", None):
                    self.assertIsNone(explain.article_text(url))
            opened.assert_not_called()

        class Reply:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self, n=-1):
                self.asked = n
                return ("<p>" + "A long enough paragraph of article text. " * 30 + "</p>").encode()
        reply = Reply()
        with patch("urllib.request.urlopen", return_value=reply):
            self.assertIn("article text", explain.article_text("https://example.com/story"))
        self.assertEqual(reply.asked, explain.MAX_ARTICLE_BYTES)

    def test_feed_reply_size_is_capped(self):
        import io
        self.assertEqual(news.read_capped(io.BytesIO(b"abc"), 3), b"abc")
        with self.assertRaises(ValueError):
            news.read_capped(io.BytesIO(b"abcd"), 3)
        from unittest.mock import patch

        class Big(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with patch("urllib.request.urlopen", return_value=Big(b"x" * 64)), patch.object(news, "MAX_FEED_BYTES", 8), \
             patch("sys.stderr"):
            self.assertEqual(news.fetch_feed({"name": "Big", "url": "https://example.com/feed"}), [])

    def test_all_workflows_discover_node_tests_and_preview_audit_branches(self):
        """New Node tests must be picked up automatically, including on dedicated audit branches."""
        workflows = ROOT / ".github" / "workflows"
        # The public production repository has daily.yml only; the preview workflow exists in the dev repository.
        preview_file = workflows / "draft-preview.yml"
        for name in ("daily.yml", "draft-preview.yml"):
            if not (workflows / name).exists():
                continue
            text = (workflows / name).read_text()
            self.assertIn("node --test tests/*.test.mjs", text, f"{name} must discover every Node test")
            self.assertNotRegex(text, r"node --test tests/[^\n]*\.test\.mjs tests/", f"{name} must not maintain a hand-written test list")
        if preview_file.exists():
            self.assertIn('"audit/**"', preview_file.read_text(), "dedicated audit branches must run the preview checks")

    def test_csp_allows_exactly_the_pages_inline_scripts(self):
        import base64, hashlib, re
        page = '<meta charset="utf-8">\n<script>alert(1)</script><p>hi</p><script>\nlet x = 2;\n</script>'
        meta = build.csp_meta(page)
        for body in ("alert(1)", "\nlet x = 2;\n"):
            digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
            self.assertIn(f"'sha256-{digest}'", meta)
        self.assertNotIn("googleapis", meta, "fonts are served from this site, not a third party")
        self.assertIn("font-src 'self'", meta)
        self.assertNotIn("'unsafe-inline'", re.search(r"script-src([^;]*)", meta).group(1), "scripts never allowed inline wholesale")
        self.assertIn("object-src 'none'", meta)
        static = build.with_csp('<meta charset="utf-8">\n<p>lesson</p>')
        self.assertIn("default-src 'none'", static)
        with self.assertRaises(AssertionError):
            build.with_csp('<meta charset="utf-8">\n<script>x</script>')

    def test_feed_links_other_than_https_are_dropped(self):
        import datetime as dt
        import news
        now = dt.datetime.now(dt.timezone.utc)
        fake = [{"title": f"Ransomware story {i}", "link": link, "date": now, "summary": "", "source": "Test"}
                for i, link in enumerate(["javascript:alert(document.cookie)", "http://plain.example/a", "data:text/html,x", "https://ok.example/story"])]
        real_fetch, real_feeds = news.fetch_feed, news.FEEDS
        news.fetch_feed, news.FEEDS = (lambda feed: fake), [{"name": "Test", "url": "https://test"}]
        try:
            stories = news.collect_news(days=7)
        finally:
            news.fetch_feed, news.FEEDS = real_fetch, real_feeds
        self.assertEqual([s["link"] for s in stories], ["https://ok.example/story"])


class QuizFairness(unittest.TestCase):
    def test_answer_position_is_shuffled_everywhere(self):
        """Most authored answers are option 2, so every quiz must mix its options before showing them."""
        page = build.assemble_template()
        for use in ("mixOptions(pool[", "map(q => mixOptions(q))", "quizBlock(mixOptions(q)", "mixLabSteps(LAB[id])"):  # the daily question picks from a pool, then mixes; evidence labs mix too (answers were B 86% of the time)
            self.assertIn(use, page)


class SecurityTxt(unittest.TestCase):
    """A cyber security site publishes how to report a security problem (RFC 9116), and it never expires on a live site."""

    def test_security_txt(self):
        import datetime as dt
        site = {"url": "https://example.org/", "feedback": "#feedback"}
        txt = build.security_txt(site, today=dt.date(2026, 11, 16))
        self.assertIn("Contact: https://example.org/#feedback\n", txt)
        self.assertIn("Expires: 2027-11-16T00:00:00.000Z\n", txt)
        self.assertIn("Canonical: https://example.org/.well-known/security.txt\n", txt)
        self.assertNotIn("@", txt, "no email address published")
        real = json.loads((ROOT / "content" / "site.json").read_text())
        self.assertRegex(build.security_txt(real), r"Contact: https://")


class FeedbackForm(unittest.TestCase):
    def test_feedback_link_is_wired(self):
        """Feedback is either a public GitHub issue form, or the on-site form (#feedback) that posts to a
        form-to-email relay. Whichever is set must actually work: a real issue template, or a form with a
        submit endpoint, the form markup and a honeypot against bots."""
        import re
        site = content("site.json")
        url = site["feedback"]
        if url.startswith("#"):
            self.assertEqual(url, "#feedback")
            post = site.get("feedbackPost", "")
            self.assertTrue(post.startswith("https://"), "the on-site form needs an https submit endpoint")
            page = build.assemble_template()
            self.assertIn("VIEWS.feedback", page)
            self.assertIn('id="fb-form"', page)
            self.assertIn('name="_gotcha"', page, "the form needs Formspree's honeypot against spam bots")
            self.assertNotIn("@", post, "the endpoint must not contain an email address: it ships in the public page")
            self.assertRegex(post, r"^https://formspree\.io/f/[A-Za-z0-9]+$", "feedback posts to a Formspree form ID")
            self.assertIn(f"connect-src 'self' {build.feedback_origin()};", build.csp_meta("<p></p>"),
                          "the security policy must allow exactly the feedback relay's origin")
            self.assertEqual(build.feedback_origin(), "https://formspree.io")
            self.assertIn("DATA.site.feedbackPost", page, "the form must post to the configured endpoint")
            self.assertIn("AbortSignal.timeout(", page, "a stalled relay must not leave the form stuck on Sending")
            for field in re.findall(r'<textarea id="fb-[^>]*>|<input id="fb-email"[^>]*>', page):
                self.assertIn("maxlength=", field, "free-text feedback fields need a length limit")
            self.assertEqual(len(re.findall(r'<textarea id="fb-', page)), 2)
        else:
            self.assertTrue(url.startswith("https://github.com/SamJ-01/patch-notes/issues/new?template="))
            form = ROOT / ".github" / "ISSUE_TEMPLATE" / re.search(r"template=([\w.-]+)", url).group(1)
            self.assertTrue(form.exists(), form.name)
            self.assertIn("public", form.read_text(), "the form must warn that issues are public")


class PageAssembly(unittest.TestCase):
    def test_template_assembles_whole(self):
        """site_template.html holds the HTML; build.py pastes in src/site.css and src/app/*.js. Nothing may be lost."""
        page = build.assemble_template()
        for mark in ("/*__CSS__*/", "/*__APP__*/"):
            self.assertNotIn(mark, page)
        self.assertIn("const DATA = /*__DATA__*/null;", page, "01-core.js must come first: everything else uses DATA")
        self.assertIn("function route()", page)
        self.assertTrue(page.rstrip().endswith("</script>"), "the app script closes the page, as before the split")


class DeviceLibrary(unittest.TestCase):
    def test_inlined_device_library_is_self_contained(self):
        """build.py pastes static/js/hw.js into the page with "export" removed, so it must not import anything."""
        src = (ROOT / "static" / "js" / "hw.js").read_text()
        self.assertNotRegex(src, r"^\s*import ", "hw.js is inlined into the page and can't import")
        self.assertIn("/*__HW__*/", build.assemble_template())

    def test_inlined_email_component_is_self_contained(self):
        """static/js/mail.js is inlined the same way, and keeps everything inside MAIL so it can't clash with page names."""
        src = (ROOT / "static" / "js" / "mail.js").read_text()
        self.assertNotRegex(src, r"^\s*import ", "mail.js is inlined into the page and can't import")
        self.assertEqual(re.findall(r"^export (?:const|function|let) (\w+)", src, re.M), ["MAIL"], "one global: MAIL")
        self.assertIn("/*__MAIL__*/", build.assemble_template())


class ContentIntegrity(unittest.TestCase):
    """Catch broken cross-references before they reach the live site."""

    @classmethod
    def setUpClass(cls):
        cls.lessons = {l["id"]: l for l in content("lessons.json")}
        cls.labs = {l["id"]: l for l in content("labs.json")}
        cls.glossary = content("glossary.json")

    def test_lessons_complete(self):
        for l in self.lessons.values():
            self.assertGreaterEqual(len(l["checks"]), 3, f"{l['id']}: each lesson needs at least 3 check questions")
            for c in l["checks"]:
                self.assertTrue(c["q"] and c["why"], l["id"])
                self.assertEqual(len(set(c["options"])), len(c["options"]), f"{l['id']}: duplicate options")
                self.assertTrue(0 <= c["answer"] < len(c["options"]), l["id"])
                self.assertIn(c.get("see"), {"what", "example", "defend", "diagram", "concept", "xpl"}, l["id"])
                if c["see"] == "diagram":
                    self.assertIn("diagram", l, f"{l['id']}: a question points to a diagram the lesson doesn't have")
                if c["see"] == "xpl":
                    self.assertIn("explainer", l, f"{l['id']}: a question points to a picture the lesson doesn't have")
                if c["see"] == "concept":
                    self.assertIn("concept", l, f"{l['id']}: a question points to a concept visual the lesson doesn't have")
            if "tip" in l:
                self.assertTrue(isinstance(l["tip"], str) and 20 <= len(l["tip"]) <= 320, f"{l['id']}: tip should be a short string")
            self.assertTrue(l["practice"]["url"].startswith(("https://", "http://", "#")), l["id"])
            src = l["example"].get("source")
            if src:
                self.assertTrue(src["url"].startswith("https://"), l["id"])

    def test_lesson_diagrams_use_real_devices(self):
        import re
        kinds = set(re.findall(r"^  (\w+): `", (ROOT / "static" / "js" / "hw.js").read_text(), re.M))
        with_diagram = [l for l in self.lessons.values() if "diagram" in l]
        self.assertGreaterEqual(len(with_diagram), 5)  # ransomware moved to its own explainer (17 Nov)
        for l in with_diagram:
            d = l["diagram"]; ids = {n["id"] for n in d["nodes"]}
            self.assertTrue(2 <= len(d["nodes"]) <= 5, l["id"])
            for n in d["nodes"]:
                self.assertIn(n["kind"], kinds, f"{l['id']}: no device drawing for {n['kind']}")
            for st in d["steps"]:
                self.assertTrue({st["from"], st["to"]} <= ids and st["from"] != st["to"], l["id"])
                self.assertTrue(st["msg"] and st["text"], l["id"])

    def test_lesson_concepts_are_valid(self):
        import re
        icons = set(re.findall(r"^  (\w+):", (ROOT / "static" / "js" / "concept.js").read_text(), re.M))
        with_concept = [l for l in self.lessons.values() if "concept" in l]
        self.assertGreaterEqual(len(with_concept), 12)
        for l in with_concept:
            self.assertNotIn("diagram", l, f"{l['id']}: a lesson should have a flow diagram or a concept visual, not both")
            c = l["concept"]
            self.assertIn(c["type"], {"triad", "cycle", "cards", "matrix", "scene"}, l["id"])
            self.assertTrue(c.get("title"), f"{l['id']}: concept needs a title")
            items = c["items"]
            if c["type"] == "triad":
                self.assertEqual(len(items), 3, f"{l['id']}: a triad needs exactly 3 items")
            elif c["type"] == "cycle":
                self.assertTrue(3 <= len(items) <= 7, f"{l['id']}: a cycle needs 3-7 items")
            else:
                self.assertTrue(2 <= len(items) <= 8, f"{l['id']}: cards need 2-8 items")
            for it in items:
                self.assertTrue(it.get("label"), f"{l['id']}: every item needs a label")
                if it.get("icon"):
                    self.assertIn(it["icon"], icons, f"{l['id']}: no icon '{it['icon']}' in concept.js")
                if c["type"] in ("triad", "cards", "matrix", "scene"):
                    self.assertTrue(it.get("text"), f"{l['id']}: {it['label']} needs text")

    def test_labs_and_missions_point_to_real_lessons(self):
        for x in [*self.labs.values(), *(json.loads(f.read_text()) for f in (ROOT / "content" / "missions").glob("*.json"))]:
            if x.get("lesson"):
                self.assertIn(x["lesson"], self.lessons, x["id"])

    def test_every_lesson_has_a_diagnose_step(self):
        """Each topic runs Understand, Experiment, Diagnose, Prove it. Diagnose is a case to work out: a mission, a shift
        that lists the lesson, or a lab marked stage "diagnose" (its own lesson or `also`). The governance lessons were
        the last without one (18 Nov)."""
        missions = [json.loads(f.read_text()) for f in (ROOT / "content" / "missions").glob("*.json")]
        shifts = [json.loads(f.read_text()) for f in (ROOT / "content" / "agency").glob("*.json")]
        covered = {x for m in missions for x in [m["lesson"], *m.get("also", [])]} | {x for sh in shifts for x in sh.get("lessons", [])}
        covered |= {x for l in self.labs.values() if l.get("stage") == "diagnose" for x in [l["lesson"], *l.get("also", [])]}
        self.assertEqual(sorted(set(self.lessons) - covered), [])

    def test_certification_maps_are_complete_and_honest(self):
        labs = {l["id"] for l in self.labs.values()}
        missions = {json.loads(f.read_text())["id"] for f in (ROOT / "content" / "missions").glob("*.json")}
        shifts = {json.loads(f.read_text())["id"] for f in (ROOT / "content" / "agency").glob("*.json")}
        for f in (ROOT / "content" / "certs").glob("*.json"):
            if f.stem.endswith("-questions"):
                continue
            c = json.loads(f.read_text())
            self.assertRegex(c["exam"], r"^[A-Z0-9]+-\d{3}$", f.name)
            self.assertRegex(c["reviewed"], r"^\d{4}-\d{2}-\d{2}$", "record when the objectives were last checked")
            self.assertTrue(c["source"]["url"].startswith("https://"))
            self.assertIn("not a guarantee", c["note"], "say plainly that practice isn't a pass guarantee")
            self.assertEqual(sum(d["weight"] for d in c["domains"]), 100, f.name)
            ids = [o["id"] for d in c["domains"] for o in d["objectives"]]
            self.assertEqual(len(ids), len(set(ids)), "objective ids unique")
            for d in c["domains"]:
                for o in d["objectives"]:
                    self.assertTrue(o["id"].startswith(d["id"][0] + "."), o["id"])
                    self.assertIn(o["coverage"], {"strong", "partial", "none"}, o["id"])
                    if o["coverage"] == "none":
                        self.assertEqual(o["activities"], [], f"{o['id']}: 'not covered' can't list activities")
                    else:
                        self.assertTrue(o["activities"], f"{o['id']}: covered objectives need activities")
                    if o["coverage"] != "strong":
                        self.assertTrue(o.get("gap"), f"{o['id']}: say what's missing")
                    for a in o["activities"]:
                        known = {"lesson": self.lessons, "lab": labs, "mission": missions, "agency": shifts,
                                 "tool": {"subnet-calc", "headers-check", "log-search", "cvss-decode"}}[a["type"]]
                        self.assertIn(a["id"], known, f"{o['id']}: unknown {a['type']} {a['id']}")

    def test_everything_counts_towards_an_exam(self):
        """Every lesson, lab, mission and Agency shift is mapped to at least one exam objective, so nothing that
        teaches an objective is missing from the exams tab and its "Am I ready?" study plan."""
        mapped = {(a["type"], a["id"]) for f in (ROOT / "content" / "certs").glob("*.json") if not f.stem.endswith("-questions")
                  for d in json.loads(f.read_text())["domains"] for o in d["objectives"] for a in o["activities"]}
        everything = [("lesson", i) for i in self.lessons] + [("lab", i) for i in self.labs] \
            + [("mission", json.loads(f.read_text())["id"]) for f in (ROOT / "content" / "missions").glob("*.json")] \
            + [("agency", json.loads(f.read_text())["id"]) for f in (ROOT / "content" / "agency").glob("*.json")]
        self.assertEqual([x for x in everything if x not in mapped], [], "map these to the objectives they teach")

    def test_certs_load_in_study_order(self):
        """Network+, then Security+, then PenTest+: the exams tab and lessons' "Prove it" reach the gentler exam first."""
        self.assertEqual([c["id"] for c in build.load_certs()][:3], ["network-plus", "security-plus", "pentest-plus"])

    def test_practice_questions_are_complete(self):
        banks = sorted((ROOT / "content" / "certs").glob("*-questions.json"))
        self.assertGreaterEqual(len(banks), 2)
        for f in banks:
            with self.subTest(bank=f.name):
                self.check_bank(json.loads(f.read_text()), json.loads(f.with_name(f.name.replace("-questions", "")).read_text()))

    def check_bank(self, bank, cert):
        objectives = {o["id"] for d in cert["domains"] for o in d["objectives"]}
        self.assertIn("not real exam questions", bank["note"])
        ids = [q["id"] for q in bank["questions"]]
        self.assertEqual(len(ids), len(set(ids)))
        for q in bank["questions"]:
            self.assertIn(q["objective"], objectives, q["id"])
            texts = [o["text"] for o in q["options"]]
            self.assertEqual(len(texts), len(set(texts)), f"{q['id']}: duplicate options")
            right = sum(o["correct"] for o in q["options"])
            self.assertGreaterEqual(right, 1, q["id"])
            if right > 1:
                self.assertIn(f"Choose {['', 'one', 'two', 'three'][right]}", q["stem"].replace("(", "").replace(")", "").replace("TWO", "two"), f"{q['id']}: say how many to choose")
            for o in q["options"]:
                self.assertGreater(len(o["why"]), 10, f"{q['id']}: every option needs an explanation")
        covered = {q["objective"] for q in bank["questions"]}
        self.assertEqual(covered, objectives, "every objective has practice questions")

    def test_lesson_key_ideas(self):
        """Each lesson opens with three short key ideas, each with a picture, that don't just repeat its diagram."""
        js = (ROOT / "src" / "app" / "07-labs.js").read_text() + (ROOT / "static" / "js" / "hw.js").read_text()
        for l in self.lessons.values():
            self.assertEqual(len(l["keys"]), 3, l["id"])
            labels = {k["label"] for k in l["keys"]}
            for k in l["keys"]:
                self.assertLessEqual(len(k["text"].split()), 12, (l["id"], k["text"]))
                self.assertRegex(js, rf"\b{k['icon']}:", (l["id"], k["icon"]))
                self.assertNotIn("—", k["text"])
            parts = {i.get("label") for i in (l.get("concept") or {}).get("items", [])}
            self.assertLess(len(labels & parts), 2, f"{l['id']}: key ideas repeat the diagram")

    def test_glossary_ids_unique_and_links_valid(self):
        ids = [g["id"] for g in self.glossary]
        self.assertEqual(len(ids), len(set(ids)))
        for g in self.glossary:
            if g.get("lesson"):
                self.assertIn(g["lesson"], self.lessons, g["id"])
            for other in g.get("see", []):
                self.assertIn(other, ids, g["id"])

    def test_exam_routes_only_use_what_that_exam_maps(self):
        """A route named after an exam (path "exam") only stops at things mapped to that exam's objectives, and each
        exam has one, so a learner following it is always practising for the exam they chose."""
        certs = {f.stem: json.loads(f.read_text()) for f in (ROOT / "content" / "certs").glob("*.json") if not f.stem.endswith("-questions")}
        routes = {p["exam"]: p for p in content("paths.json") if p.get("exam")}
        self.assertEqual(sorted(routes), sorted(certs), "one route per exam")
        for exam, p in routes.items():
            mapped = {(a["type"], a["id"]) for d in certs[exam]["domains"] for o in d["objectives"] for a in o["activities"]}
            for st in p["steps"]:
                self.assertIn((st["type"], st["id"]), mapped, f"{p['id']}: {st['type']} {st['id']} isn't mapped to {exam}")
            self.assertEqual(len(p["steps"]), len({(st["type"], st["id"]) for st in p["steps"]}), f"{p['id']}: a stop twice")

    def test_quiz_and_paths_reference_real_things(self):
        for q in content("quiz.json"):
            self.assertIn(q["topic"], self.lessons, q["q"])
            self.assertTrue(0 <= q["answer"] < len(q["options"]))
        for p in content("paths.json"):
            for step in p["steps"]:
                if step["type"] == "lesson":
                    self.assertIn(step["id"], self.lessons, p["id"])
                if step["type"] == "lab":
                    self.assertIn(step["id"], self.labs, p["id"])
                if step["type"] == "mission":
                    mission = json.loads((CONTENT / "missions" / f"{step['id']}.json").read_text())
                    self.assertIn(step["mode"], mission["modes"], p["id"])
                if step["type"] == "agency":
                    self.assertTrue((CONTENT / "agency" / f"{step['id']}.json").exists(), p["id"])
                self.assertIn(step["type"], ("lesson", "lab", "mission", "agency", "game", "flags"), p["id"])

    def test_lab_answers_are_in_the_evidence(self):
        # Labs with their own module (MODULE_LABS in the app) have their own tests in tests/*.test.mjs.
        src = (ROOT / "src" / "app" / "07-labs.js").read_text()
        modules = set(re.findall(r'"(\w+)"', re.search(r"const MODULE_LABS = \[([^\]]*)\]", src).group(1)))
        self.assertIn("journey", modules)
        for lab in self.labs.values():
            if lab.get("kind") in modules:
                continue
            if lab.get("kind") == "cvss":
                for sc in lab["scenarios"]:
                    self.assertEqual(len(sc["target"].split("/")), 8, sc["title"])
                continue
            for step in lab["steps"]:
                # "Show me where" must point at something that's really in the evidence.
                if step.get("where"):
                    self.assertIn(step["where"].lower(), lab["artifact"]["text"].lower(), step["q"])
                if step["type"] == "text":
                    self.assertTrue(any(a.lower() in lab["artifact"]["text"].lower() for a in step["answers"]), step["q"])
                else:
                    self.assertTrue(0 <= step["answer"] < len(step["options"]), step["q"])

    def test_windows_ping_summaries_match_their_replies(self):
        # Windows ping prints whole milliseconds: time<1ms counts as 0, the average is rounded down.
        found = 0
        for lab in self.labs.values():
            text = lab.get("artifact", {}).get("text", "")
            for block in re.findall(r"Pinging (\S+) with 32 bytes of data:\n(.*?)\n\nPing statistics for \1:\n(.*?Average = \d+ms)", text, re.S):
                dest, replies, stats = block
                lines = replies.split("\n")
                times = [0 if "time<1ms" in l else int(re.search(r"time=(\d+)ms", l).group(1)) for l in lines if l.startswith("Reply from")]
                lost = sum(l == "Request timed out." for l in lines)
                self.assertEqual(len(times) + lost, len(lines), dest)
                sent = len(lines)
                self.assertIn(f"Sent = {sent}, Received = {len(times)}, Lost = {lost} ({lost * 100 // sent}% loss)", stats, lab["id"])
                self.assertIn(f"Minimum = {min(times)}ms, Maximum = {max(times)}ms, Average = {sum(times) // len(times)}ms", stats, lab["id"])
                found += 1
        self.assertGreaterEqual(found, 4)

    def test_stack_items_have_matchers(self):
        stack = content("stack.json")
        self.assertEqual(len({s["id"] for s in stack}), len(stack))
        for s in stack:
            self.assertTrue(s["terms"] and s["cpe"], s["id"])

    def test_phishing_examples(self):
        for m in content("phish.json"):
            self.assertIn(m["verdict"], ("phish", "legit"))
            self.assertTrue(m["clues"])
            # Each clue is pinned to the part of the email it's about (static/js/mail.js), or to nothing.
            for c in m["clues"]:
                self.assertIn(c["at"], ("", "from", "replyTo", "subject", "body", "link", "attachment"), c["text"])
                self.assertTrue(c["text"])
                if c["at"] == "link":
                    self.assertTrue(m.get("link"), c["text"])


if __name__ == "__main__":
    unittest.main()


class CardPhotos(unittest.TestCase):
    """Every card photo the page asks for is in static/img/cards, in the card shape (2:1)."""

    def test_card_photos_exist(self):
        js = (Path(__file__).resolve().parent.parent / "src" / "app" / "07-labs.js").read_text()
        ids = re.findall(r'"([\w-]+)"', re.search(r"const CARD_PHOTOS = new Set\(\[(.*?)\]\)", js, re.S).group(1))
        self.assertGreaterEqual(len(ids), 6)
        for i in ids:
            f = Path(__file__).resolve().parent.parent / "static" / "img" / "cards" / f"{i}.webp"
            self.assertTrue(f.exists(), i)
            data = f.read_bytes()
            self.assertEqual(data[:4], b"RIFF"); self.assertEqual(data[8:12], b"WEBP")

    def test_head_photos_exist(self):
        js = (Path(__file__).resolve().parent.parent / "src" / "app" / "07-labs.js").read_text()
        ids = re.findall(r'"([\w-]+)"', re.search(r"const HEAD_PHOTOS = new Set\(\[(.*?)\]\)", js, re.S).group(1))
        for i in ids:
            self.assertTrue((Path(__file__).resolve().parent.parent / "static" / "img" / "heads" / f"{i}.webp").exists(), i)


class OfflineApp(unittest.TestCase):
    """Installable and offline: the manifest's icons exist, and the service worker only ever handles this site's own
    GET requests (never the feedback relay), network first so a new build is seen straight away."""
    def test_manifest_and_icons(self):
        m = json.loads((ROOT / "static" / "manifest.webmanifest").read_text())
        self.assertEqual(m["display"], "standalone")
        self.assertTrue(any(i.get("purpose") == "maskable" for i in m["icons"]))
        for i in m["icons"]:
            self.assertTrue((ROOT / "static" / i["src"]).exists(), i["src"])
        page = (ROOT / "site_template.html").read_text()
        self.assertIn('rel="manifest" href="manifest.webmanifest"', page)

    def test_service_worker_is_network_first_and_same_site_only(self):
        sw = (ROOT / "static" / "sw.js").read_text()
        self.assertIn('req.method !== "GET" || url.origin !== self.location.origin', sw)
        self.assertLess(sw.index("fetch(req)"), sw.index("caches.match(req"), "network first, cache only as the fallback")


class PublishScript(unittest.TestCase):
    """scripts/publish.py: the files kept apart between dev and production, and it never pushes."""
    def test_keeps_dev_only_files_out_and_never_pushes(self):
        src = (ROOT / "scripts" / "publish.py").read_text()
        for f in ("CLAUDE.md", "AI_CONTEXT.md", "wrangler.jsonc", ".github/workflows/draft-preview.yml"):
            self.assertIn(f'"{f}"', src)
        self.assertNotIn('"push"', src, "publishing to production stays a separate, approved step")

    def test_reads_the_last_published_dev_commit(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("publish", ROOT / "scripts" / "publish.py")
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        mod.run = lambda cmd, cwd, **k: "Notes only\x00Looks and feel\n\nPublished from the development repository (dev 8c7a9c7) with\x00older (dev 1111111)\x00"
        self.assertEqual(mod.last_published(Path(".")), "8c7a9c7")


class PhotoScenes(unittest.TestCase):
    """A lesson photo scene's picture must exist at the size it declares, so hotspots (placed in percent) land where they
    were pinned, and the page reserves the right space before the image loads."""
    def test_scene_images_exist_at_their_declared_size(self):
        import struct
        lessons = json.loads((ROOT / "content" / "lessons.json").read_text())
        scenes = [(l["id"], c) for l in lessons for c in (l.get("concept") or {}, l.get("scene") or {}) if c.get("type") == "scene"]
        self.assertGreaterEqual(len(scenes), 5)
        for lid, c in scenes:
            f = ROOT / "static" / c["image"]["src"]
            self.assertTrue(f.exists(), f"{lid}: {c['image']['src']} is missing")
            data = f.read_bytes()
            self.assertEqual(data[:4] + data[8:12], b"RIFFWEBP", f"{lid}: scene image must be WebP")
            if data[12:16] == b"VP8X":
                w = 1 + int.from_bytes(data[24:27], "little"); h = 1 + int.from_bytes(data[27:30], "little")
            elif data[12:16] == b"VP8 ":
                w, h = (v & 0x3FFF for v in struct.unpack("<HH", data[26:30]))
            else:  # VP8L
                b = int.from_bytes(data[21:25], "little"); w = (b & 0x3FFF) + 1; h = ((b >> 14) & 0x3FFF) + 1
            self.assertEqual((w, h), (c["image"]["width"], c["image"]["height"]), lid)

