// Tests for the page's pure logic (CVSS scoring, glossary matching, vector decoding).
// The functions are pulled straight out of the page script (src/app/*.js), so these test the real code.
// Run with:  node --test tests/page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
// The page script is src/app/*.js, joined in name order by build.py (one shared scope).
const appDir = new URL("src/app/", root);
const template = readdirSync(appDir).filter(f => f.endsWith(".js")).sort().map(f => readFileSync(new URL(f, appDir), "utf8")).join("");
const glossary = JSON.parse(readFileSync(new URL("content/glossary.json", root), "utf8"));

// Return the source of a declaration starting at `start`, up to its matching closing brace.
function extract(start) {
  const i = template.indexOf(start);
  assert.ok(i >= 0, `not found in template: ${start}`);
  const open = template.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < template.length; j++) {
    if (template[j] === "{") depth++;
    else if (template[j] === "}" && --depth === 0) {
      const end = template.slice(j + 1).match(/^\)\(\);|^;|/)[0].length;
      return template.slice(i, j + 1 + end);
    }
  }
  throw new Error("unbalanced: " + start);
}

const ctx = { DATA: { glossary } };
vm.createContext(ctx);
vm.runInContext([
  template.match(/const esc = .*\n/)[0],
  template.match(/const reEsc = .*\n/)[0],
  extract("const MATCH = (() =>"),
  extract("function findTerms(text)"),
  extract("function cvss31(v, v30 = false)"),
  template.match(/const cvssSeverity = .*\n/)[0],
  template.match(/const parseVector = .*\n/)[0],
  extract("function decodeVector(vec)"),
  template.match(/const CVSS_METRICS = \[[\s\S]*?\n\];\n/)[0],
  template.match(/const CVSS4_METRICS = \[[\s\S]*?\n\];\n/)[0],
  extract("function readVector(str)"),
  "this.api = { findTerms, cvss31, cvssSeverity, parseVector, decodeVector, readVector };",
].join("\n"), ctx);
const { findTerms, cvss31, cvssSeverity, parseVector, decodeVector, readVector } = ctx.api;
// Copy results out of the vm sandbox: its arrays have a different prototype, which strict deep-equal rejects.
const terms = text => JSON.parse(JSON.stringify(findTerms(text).map(h => [text.substr(h.i, h.len), h.id])));

test("CVSS 3.1 scores match the official calculator", () => {
  const cases = {
    "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H": 9.8,
    "AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N": 5.4,
    "AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H": 7.8,
    "AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H": 10.0,
    "AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N": 5.9,
    "AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N": 0,
  };
  for (const [vec, score] of Object.entries(cases)) assert.equal(cvss31(parseVector(vec)), score, vec);
  assert.equal(cvssSeverity(9.8), "Critical");
  assert.equal(cvssSeverity(5.4), "Medium");
  assert.equal(cvssSeverity(0), "None");
});

test("glossary matches whole words, prefers the longest alias", () => {
  assert.deepEqual(terms("Critical vulnerability in SMA 1000 appliances"), [["SMA 1000", "sonicwall-sma"], ["appliances", "appliance"]]);
  assert.deepEqual(terms("SonicWall SMA hit by SSRF"), [["SonicWall", "sonicwall"], ["SMA", "sonicwall-sma"], ["SSRF", "ssrf"]]);
  assert.deepEqual(terms("Volt Typhoon targets routers"), [["Volt Typhoon", "volt-typhoon"], ["routers", "router"]]);
});

test("glossary respects case and word boundaries", () => {
  assert.deepEqual(terms("the bot was a robot"), []);                 // 'bot' isn't an alias; no partial matches
  assert.deepEqual(terms("SMASHED records, smashing results"), []);   // 'SMA' must be a whole word
  assert.deepEqual(terms("Attackers used an RCE."), [["RCE", "rce"]]);
  assert.deepEqual(terms("rce lowercase is not the acronym"), []);    // uppercase aliases are case-sensitive
  assert.deepEqual(terms("New infostealers spotted"), [["infostealers", "infostealer"]]);
});

test("researcher placeholder names match via regex", () => {
  assert.deepEqual(terms("Group UNC3944 and Storm-0501 return"), [["UNC3944", "scattered-spider"], ["Storm-0501", "unc"]]);
});

test("CVSS vector decodes into plain English", () => {
  const lines = decodeVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
  assert.ok(lines[0].includes("over the network"));
  assert.ok(lines.includes("No login is needed."));
  assert.ok(lines.at(-1).includes("read sensitive data, change or plant data and crash or shut down the service"));
  assert.equal(decodeVector(null), null);
});

// Progress is untrusted (browser storage, restored files): cleanProgress must drop junk and neutralise HTML.
test("progress: restored or stored data is cleaned before use", () => {
  const pctx = {};
  vm.createContext(pctx);
  vm.runInContext([
    template.match(/const FRESH = .*\n/)[0],
    extract("function cleanProgress(src)"),
    template.match(/const restoreProgress = .*\n/)[0],
    "this.api = { cleanProgress, restoreProgress };",
  ].join("\n"), pctx);
  const { cleanProgress, restoreProgress } = pctx.api;
  const evil = '<img src=x onerror=alert(1)>';
  const p = cleanProgress({ xp: 42.6, log: [{ d: "2026-10-15", why: "Lab", n: evil }, "junk", null], done: "nope", intro: 1, hacked: evil });
  assert.equal(p.xp, 43);
  assert.equal(p.log.length, 1);
  assert.equal(p.log[0].n, 0, "a non-number XP value becomes 0, never markup");
  assert.equal(typeof p.done, "object");
  assert.equal(p.hacked, undefined, "unknown fields are dropped");
  const m = cleanProgress({ xp: 1, mocks: { "network-plus": [{ d: evil, score: evil, total: 20 }, "junk"], [evil]: [{ score: 1, total: 1 }], "security-plus": "nope" } });
  assert.deepEqual(Object.keys(m.mocks), ["network-plus"], "only well-formed cert ids with lists survive");
  assert.equal(m.mocks["network-plus"].length, 1);
  assert.equal(m.mocks["network-plus"][0].score, 0, "a non-number score becomes 0, never markup");
  assert.equal(m.mocks["network-plus"][0].d.length, 10, "dates are cut short");
  assert.equal(Object.keys(cleanProgress({ xp: 1 }).mocks).length, 0, "older saves without mocks still load");
  const ag = cleanProgress({ xp: 1, agency: { "shift-01": { d: evil, best: 999, total: "6" }, [evil]: { best: 1 }, "shift-02": "nope", "shift-03": [1] } });
  assert.deepEqual(JSON.parse(JSON.stringify(ag.agency)), { "shift-01": { d: evil.slice(0, 10), best: 20, total: 6 } }, "agency results are clamped numbers and a short date");
  assert.equal(Object.keys(cleanProgress({ xp: 1 }).agency).length, 0, "older saves without agency still load");
  assert.throws(() => cleanProgress({ xp: "lots" }));
  assert.throws(() => cleanProgress([1, 2]));
  assert.throws(() => restoreProgress({ progress: { xp: 1 } }), "files must say they come from patch-notes");
  assert.equal(restoreProgress({ app: "patch-notes", progress: { xp: 5 } }).xp, 5);
});

// The home page route map: stops snake left-right then right-left, turn on the outside, and fit the drawing.
const rctx = {};
vm.createContext(rctx);
// Whole top-level functions, up to the closing brace at the start of a line (routeLayout has braces in its parameters).
const fn = start => { const i = template.indexOf(start); assert.ok(i >= 0, start); return template.slice(i, template.indexOf("\n}\n", i) + 2); };
vm.runInContext([fn("function routeLayout(n, cols"), fn("function routePath(points, R)"), "this.api = { routeLayout, routePath };"].join("\n"), rctx);
const { routeLayout, routePath } = rctx.api;

test("route map: stops snake across rows and the road turns at the ends", () => {
  const L = routeLayout(11, 6);
  assert.equal(L.stops.length, 11);
  assert.deepEqual(JSON.parse(JSON.stringify(L.stops.slice(0, 6).map(s => s.row))), [0, 0, 0, 0, 0, 0]);
  assert.ok(L.stops[0].x < L.stops[5].x, "row 1 runs left to right");
  assert.equal(L.stops[6].x, L.stops[5].x, "row 2 starts under the end of row 1");
  assert.ok(L.stops[10].x < L.stops[6].x, "row 2 runs right to left");
  for (const s of [L.start, ...L.stops, L.finish]) assert.ok(s.x >= 0 && s.x <= 1000 && s.y > 0 && s.y < L.height, "everything inside the drawing");
  const d = routePath([L.start, ...L.stops, L.finish], L.R);
  assert.equal((d.match(/ A/g) || []).length, 1, "one row change, one turn");
  assert.match(d, new RegExp(` A${L.R} ${L.R} 0 0 1 `), "the first turn bulges right (clockwise)");
});

test("route map: a full last row sends the finish round the turn; phones use two stops a row", () => {
  const L = routeLayout(6, 6);
  assert.equal(L.finish.row, 1);
  assert.equal(L.finish.x, L.stops[5].x);
  const phone = routeLayout(6, 2, { W: 350, rowH: 145, R: 46, pad: 40 });
  assert.deepEqual(JSON.parse(JSON.stringify(phone.stops.map(s => s.row))), [0, 0, 1, 1, 2, 2]);
  for (const s of phone.stops) assert.ok(s.x - 60 >= 0 && s.x + 60 <= 350, "labels have room at phone width");
});

test("CVSS decoder: checks the vector, scores 3.0 and 3.1, decodes 4.0 without inventing a score", () => {
  const r = readVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H");
  assert.deepEqual([r.ok, r.version, r.score, r.severity], [true, "3.1", 10, "Critical"]);
  assert.equal(readVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N").score, 6.5, "matches FIRST's calculator");
  assert.equal(readVector("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").score, 9.8);
  // By hand: exploitability 8.22 x 0.55 x 0.44 x 0.27 x 0.62 = 0.333, impact 6.42 x 0.22 = 1.412, total 1.745, rounded up 1.8.
  assert.equal(readVector("  (CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:L)  ").score, 1.8, "brackets and spaces are fine");
  const v4 = readVector("CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N");
  assert.deepEqual([v4.ok, v4.version, v4.score], [true, "4.0", null]);
  assert.match(v4.note, /FIRST/);
  assert.equal(readVector("AV:N/AC:L/Au:N/C:P/I:P/A:P").version, "2.0");
  assert.match(readVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H").error, /A is missing/);
  assert.match(readVector("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").error, /AV:X isn't a valid value/);
  assert.match(readVector("CVSS:3.1/AV:N/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").error, /appears twice/);
  assert.equal(readVector("hello").ok, false);
});
