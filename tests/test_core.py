"""
Core tests: data parsing, prioritisation, page generation and content integrity.
Run with:  python3 -m unittest discover -s tests -v
"""

import datetime as dt
import json
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
    """get_json survives a truncated body and reads gzip, without real network or real waits."""
    class Resp:
        def __init__(self, body, encoding=""):
            self.body, self.headers = body, {"Content-Encoding": encoding}
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
            return self.Resp(http.client.IncompleteRead(b"{", 10) if r == "cut" else r[0], r[1])
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep, mock.patch("sys.stderr"):
            return cve_watch.get_json("https://example.test/"), seen, sleep

    def test_retries_a_cut_off_body_then_reads_gzip(self):
        import gzip
        data, seen, sleep = self.fetch(["cut", "cut", (gzip.compress(b'{"ok": 1}'), "gzip")])
        self.assertEqual(data, {"ok": 1})
        self.assertEqual(seen, ["gzip"] * 3, "asks for compression every time")
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [10, 20])

    def test_plain_json_still_works_and_gives_up_eventually(self):
        self.assertEqual(self.fetch([(b'{"a": [1]}', "")])[0], {"a": [1]})
        import http.client
        with self.assertRaises(http.client.IncompleteRead):
            self.fetch(["cut"] * 5)


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

    def test_csp_allows_exactly_the_pages_inline_scripts(self):
        import base64, hashlib, re
        page = '<meta charset="utf-8">\n<script>alert(1)</script><p>hi</p><script>\nlet x = 2;\n</script>'
        meta = build.csp_meta(page)
        for body in ("alert(1)", "\nlet x = 2;\n"):
            digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
            self.assertIn(f"'sha256-{digest}'", meta)
        self.assertNotIn("unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src", meta.split("script-src")[0])
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
        for use in ("mixOptions(DATA.quiz[", "map(q => mixOptions(q))", "quizBlock(mixOptions(q)"):
            self.assertIn(use, page)


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
                self.assertIn(c.get("see"), {"what", "example", "defend", "diagram", "concept"}, l["id"])
                if c["see"] == "diagram":
                    self.assertIn("diagram", l, f"{l['id']}: a question points to a diagram the lesson doesn't have")
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
        self.assertGreaterEqual(len(with_diagram), 8)
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
            self.assertIn(c["type"], {"triad", "cycle", "cards"}, l["id"])
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
                if c["type"] in ("triad", "cards"):
                    self.assertTrue(it.get("text"), f"{l['id']}: {it['label']} needs text")

    def test_labs_and_missions_point_to_real_lessons(self):
        for x in [*self.labs.values(), *(json.loads(f.read_text()) for f in (ROOT / "content" / "missions").glob("*.json"))]:
            if x.get("lesson"):
                self.assertIn(x["lesson"], self.lessons, x["id"])

    def test_certification_maps_are_complete_and_honest(self):
        labs = {l["id"] for l in self.labs.values()}
        missions = {json.loads(f.read_text())["id"] for f in (ROOT / "content" / "missions").glob("*.json")}
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
                        known = {"lesson": self.lessons, "lab": labs, "mission": missions, "tool": {"subnet-calc"}}[a["type"]]
                        self.assertIn(a["id"], known, f"{o['id']}: unknown {a['type']} {a['id']}")

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

    def test_glossary_ids_unique_and_links_valid(self):
        ids = [g["id"] for g in self.glossary]
        self.assertEqual(len(ids), len(set(ids)))
        for g in self.glossary:
            if g.get("lesson"):
                self.assertIn(g["lesson"], self.lessons, g["id"])
            for other in g.get("see", []):
                self.assertIn(other, ids, g["id"])

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
        for lab in self.labs.values():
            if lab.get("kind") in ("osi", "terminal", "topology", "ports", "subnet", "nettools", "handshake", "wiring", "wiretap", "vlan", "hashing"):
                continue  # these have their own tests in tests/labs.test.mjs
            if lab.get("kind") == "cvss":
                for sc in lab["scenarios"]:
                    self.assertEqual(len(sc["target"].split("/")), 8, sc["title"])
                continue
            for step in lab["steps"]:
                if step["type"] == "text":
                    self.assertTrue(any(a.lower() in lab["artifact"]["text"].lower() for a in step["answers"]), step["q"])
                else:
                    self.assertTrue(0 <= step["answer"] < len(step["options"]), step["q"])

    def test_stack_items_have_matchers(self):
        stack = content("stack.json")
        self.assertEqual(len({s["id"] for s in stack}), len(stack))
        for s in stack:
            self.assertTrue(s["terms"] and s["cpe"], s["id"])

    def test_phishing_examples(self):
        for m in content("phish.json"):
            self.assertIn(m["verdict"], ("phish", "legit"))
            self.assertTrue(m["clues"])


if __name__ == "__main__":
    unittest.main()
