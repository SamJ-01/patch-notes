// The service desk component (static/js/desk.js): tickets and staff messages, escaped, used by the Agency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { DESK } from "../static/js/desk.js";

test("a ticket shows its number, priority, status and fields, with text escaped", () => {
  const h = DESK.ticket({ kind: "Alert", ref: "SOC-1<2>", title: "<script>x</script>", priority: "critical", status: "open",
    fields: [["Client", "A & B"], ["Empty", ""]], bodyLabel: "Seen", body: "<p>trusted</p>" }, { headingId: "t-h", statusId: "t-st" });
  assert.match(h, /class="dk-ticket p-critical"/);
  assert.match(h, /SOC-1&lt;2&gt;/);
  assert.match(h, /P1 · Critical/);
  assert.match(h, /<span class="dk-pill info" id="t-st">Open<\/span>/);
  assert.match(h, /<h2 class="dk-title" id="t-h" tabindex="-1">&lt;script&gt;/);
  assert.match(h, /<dd>A &amp; B<\/dd>/);
  assert.doesNotMatch(h, /Empty/, "empty fields are left out");
  assert.match(h, /<p>trusted<\/p>/);
  assert.doesNotMatch(DESK.ticket({ title: "x", priority: "bogus" }), /p-bogus|undefined/);
});

test("request steps tell screen readers which are done and which is now", () => {
  const h = DESK.ticket({ title: "Lock it", steps: [{ label: "Raised", state: "done" }, { label: "With the team", state: "now" }, { label: "Reply" }] }, { level: 4, compact: true });
  assert.match(h, /<h4 class="dk-title">/);
  assert.match(h, /class="done"><span class="sr-only">Done: <\/span>Raised/);
  assert.match(h, /class="now"><span class="sr-only">Now: <\/span>With the team/);
  assert.match(h, /class="todo">Reply/);
});

test("messages: people get a team badge and a ticket chip; system notices are one line", () => {
  const m = DESK.message({ from: "Priya Raman", role: "Identity & Access", at: "07:12", ref: "REQ-5301", status: "asks", html: "<p>ok</p>" });
  assert.match(m, /dk-msg warn/);
  assert.match(m, /aria-hidden="true">PR</);
  assert.match(m, /Identity &amp; Access/);
  assert.match(m, /REQ-5301/);
  assert.match(m, /Needs info/);
  const me = DESK.message({ me: true, from: "<b>", html: "x" });
  assert.match(me, /dk-msg me/); assert.match(me, /<b>You<\/b>/);
  const pic = DESK.message({ from: "Grace", photo: "img/agency/grace.svg\" onerror=x", html: "hi" });
  assert.match(pic, /<img class="dk-av dk-photo" src="img\/agency\/grace.svg&quot; onerror=x" alt=""/, "a portrait is decorative and escaped");
  assert.doesNotMatch(DESK.message({ me: true, photo: "a.svg", html: "x" }), /<img/, "you are always your initials");
  const sc = DESK.scene({ src: "a.webp", small: "a-800.webp", width: 1536, height: 538, alt: "A <depot>" }, { lazy: true });
  assert.match(sc, /srcset="a-800.webp 800w, a.webp 1536w"/);
  assert.match(sc, /alt="A &lt;depot&gt;" width="1536" height="538" loading="lazy"/, "described, sized so the page doesn't jump, escaped");
  assert.equal(DESK.scene(null), "");
  const sys = DESK.message({ sys: true, html: "New alert" });
  assert.match(sys, /dk-msg sys/); assert.doesNotMatch(sys, /dk-bubble/);
  assert.equal(DESK.hue("Network Operations"), DESK.hue("Network Operations"), "same team, same colour");
});

test("desk.js stays self-contained, so build.py can inline it into the page", () => {
  const src = readFileSync(new URL("../static/js/desk.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import /m);
  assert.equal((src.match(/^export /gm) || []).length, 1);
});

test("every shift alert has a ticket number and every team a named contact", () => {
  for (const f of ["shift-01.json"]) {
    const sh = JSON.parse(readFileSync(new URL(`../content/agency/${f}`, import.meta.url), "utf8"));
    const refs = sh.alerts.map(a => a.ref);
    assert.ok(refs.every(r => /^SOC-\d+$/.test(r)), f);
    assert.equal(new Set(refs).size, refs.length, "ticket numbers are unique");
    for (const d of Object.values(sh.departments)) assert.ok(d.contact?.name && d.contact?.role, d.name);
    // Portraits and the client picture are files in static/img, so a typo would show a broken image.
    const imgs = [sh.leadPhoto, sh.clientImage?.src, sh.clientImage?.small, ...Object.values(sh.departments).map(d => d.contact.photo)].filter(Boolean);
    assert.ok(imgs.length >= 7, "the pilot has a lead, four contacts and a client picture in two sizes");
    for (const src of imgs) assert.ok(existsSync(new URL(`../static/${src}`, import.meta.url)), src);
    assert.ok(sh.clientImage.alt.length > 20, "the client picture is described for screen readers");
  }
});
