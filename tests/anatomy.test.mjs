// "Read a line" (labs/anatomy.js): one real line of an evidence lab's log, taken apart into labelled parts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORMATS, readLine } from "../static/js/labs/anatomy.js";

const labs = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).filter(l => l.artifact?.text && l.artifact.kind !== "headers");

test("every line any format recognises splits into parts that join back to exactly that line", () => {
  let checked = 0;
  for (const l of labs) for (const line of l.artifact.text.split("\n")) for (const f of FORMATS) {
    const m = line.match(f.re); if (!m) continue;
    const parts = f.split(m); checked++;
    assert.equal(parts.map(p => p[0]).join(""), line, `${l.id} (${f.id}): ${line}`);
    assert.ok(parts.filter(p => p[1]).length >= 3, `${l.id} (${f.id}) has at least three labelled parts`);
    assert.ok(parts.every(p => p[1] !== "" ), `${l.id} (${f.id}): every part is labelled or is spacing`);
  }
  assert.ok(checked > 50, `checked ${checked} lines`);
});

test("the evidence labs get the format their log really is", () => {
  const want = { "log-detective": "sshd", "sqli-log": "nginx", "xss-review": "nginx", "idor-log": "audit", "ransomware-timeline": "edr",
    "signin-spray": "entra", "nmap-read": "nmap", "factory-scan": "nmap", "who-touched-the-file": "ls", "slow-network": "ping" };
  for (const [id, f] of Object.entries(want)) assert.equal(readLine(labs.find(l => l.id === id).artifact.text)?.format, f, id);
  // Nmap prefers an open port; a document with no log lines gets nothing.
  assert.match(readLine(labs.find(l => l.id === "factory-scan").artifact.text).line, /\bopen\b/);
  assert.equal(readLine("Just a paragraph of notes.\nAnother line."), null);
});

test("an sshd line names the account and the address it came from", () => {
  const r = readLine("Nov 19 06:12:01 web-01 sshd[2114]: Failed password for invalid user admin from 203.0.113.7 port 52144 ssh2");
  const by = Object.fromEntries(r.parts.filter(p => p[1]).map(p => [p[1], p[0]]));
  assert.equal(by["what happened"], "Failed password"); assert.equal(by["which account"], "for invalid user admin"); assert.equal(by["from where (IP)"], "from 203.0.113.7");
});
