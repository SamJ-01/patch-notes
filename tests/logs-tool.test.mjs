// Tests for the log search tool (static/js/tools/logs.js): recognising formats, the sign-in and web summaries,
// and the "worth a look" flags. Run with:  node --test tests/logs-tool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyse, detect } from "../static/js/tools/logs.js";

const samples = JSON.parse(readFileSync(new URL("../content/tools.json", import.meta.url), "utf8")).logSamples;
const auth = samples.find(s => s.label.includes("auth.log")).lines, web = samples.find(s => s.label.includes("access log")).lines;
const table = (r, title) => r.tables.find(t => t.title === title).rows;

test("formats are recognised: Linux sign-in logs, nginx/Apache combined, anything else", () => {
  assert.equal(detect(auth), "auth");
  assert.equal(detect(web), "web");
  assert.equal(detect(["hello", "world"]), "other");
  // Ubuntu 24.04 writes RFC 3339 timestamps; the messages are the same.
  assert.equal(detect(["2026-10-21T03:04:09.123456+00:00 web01 sshd[2205]: Failed password for root from 203.0.113.45 port 51122 ssh2"]), "auth");
});

test("sign-in log: guessing, the login that worked, unknown usernames and sudo", () => {
  const r = analyse(auth.join("\n"));
  assert.equal(r.counts.failed, 11, "matches the SSH mission's own count");
  assert.deepEqual(table(r, "Failed logins by address")[0], ["203.0.113.45", 11]);
  assert.deepEqual(table(r, "Successful logins").map(x => x[0]).sort(), ["deploy", "sam"]);
  assert.ok(table(r, "Commands run with sudo").some(([u, c]) => u === "deploy" && /crontab -l/.test(c)));
  const text = r.flags.map(f => f.text).join("\n");
  assert.match(text, /11 failed logins from 203\.0\.113\.45/);
  assert.match(text, /deploy logged in with a password from 203\.0\.113\.45/);
  assert.match(text, /usernames that don't exist/);
  assert.equal(r.flags.find(f => /deploy logged in/.test(f.text)).level, "bad");
  assert.ok(!/sam logged in/.test(text), "a key login from another address isn't flagged");
});

test("access log: a scanner's 404s, attack-shaped requests and tools by user agent", () => {
  const r = analyse(web.join("\n"));
  assert.equal(r.counts.requests, web.length);
  const text = r.flags.map(f => f.text).join("\n");
  assert.match(text, /11 "not found" \(404\) answers to 203\.0\.113\.9/);
  assert.match(text, /look like SQL injection, and 1 got a success code back/);
  assert.match(text, /path traversal \(\.\.\/\), all refused or not found/);
  assert.match(text, /scanning tool sqlmap/);
  assert.match(text, /hunting for secret files/);
  assert.ok(table(r, "Requests that look like attacks").length >= 5);
  assert.deepEqual(table(r, "Answers by status").map(x => x[0]).sort(), ["2xx", "3xx", "4xx", "5xx"]);
});

test("every flag's search really finds lines, and quiet logs aren't flagged", () => {
  for (const s of samples) {
    const r = analyse(s.lines.join("\n"));
    for (const f of r.flags) assert.ok(s.lines.some(l => f.search.split(" ").every(w => l.toLowerCase().includes(w.toLowerCase()))), `${s.label}: ${f.search}`);
    for (const ip of s.lines.join(" ").match(/(?<![/\d.])\b\d{1,3}(\.\d{1,3}){3}\b/g)) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|10)\./);
  }
  const quiet = analyse(web.filter(l => l.startsWith("198.51.100.23")).join("\n"));
  assert.equal(quiet.flags.length, 0);
  assert.equal(analyse("").lines.length, 0);
  assert.equal(analyse("a\r\nb\r\n").lines.length, 2);
});
