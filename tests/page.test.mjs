// Tests for the page's pure logic (CVSS scoring, glossary matching, vector decoding).
// The functions are pulled straight out of site_template.html, so these test the real code.
// Run with:  node --test tests/page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const template = readFileSync(new URL("site_template.html", root), "utf8");
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
  extract("function cvss31(v)"),
  template.match(/const cvssSeverity = .*\n/)[0],
  template.match(/const parseVector = .*\n/)[0],
  extract("function decodeVector(vec)"),
  "this.api = { findTerms, cvss31, cvssSeverity, parseVector, decodeVector };",
].join("\n"), ctx);
const { findTerms, cvss31, cvssSeverity, parseVector, decodeVector } = ctx.api;
const terms = text => findTerms(text).map(h => [text.substr(h.i, h.len), h.id]);

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
  assert.deepEqual(terms("Volt Typhoon targets routers"), [["Volt Typhoon", "volt-typhoon"]]);
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
