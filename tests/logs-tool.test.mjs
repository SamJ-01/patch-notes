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

test("found in review: OpenSSH 9.8 sshd-session, repeated messages, refused sudo, escaped quotes and junk requests", () => {
  const newer = analyse([
    "2026-10-21T03:04:09.123456+00:00 web01 sshd-session[2205]: Failed password for root from 203.0.113.45 port 51122 ssh2",
    "Oct 21 03:04:12 web01 sshd[2205]: message repeated 5 times: [ Failed password for root from 203.0.113.45 port 51122 ssh2]",
    "Oct 21 03:12:47 web01 sshd-session[2390]: Accepted password for deploy from 203.0.113.45 port 52018 ssh2",
    "Oct 21 03:20:01 web01 sudo:      bob : user NOT in sudoers ; TTY=pts/0 ; PWD=/home/bob ; USER=root ; COMMAND=/bin/bash",
    "Oct 21 03:21:09 web01 sudo:      bob : 3 incorrect password attempts ; TTY=pts/0 ; PWD=/home/bob ; USER=root ; COMMAND=/usr/bin/cat /etc/shadow",
    "Oct 21 03:22:00 web01 sudo:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/crontab -l",
  ].join("\n"));
  assert.equal(newer.kind, "auth");
  assert.equal(newer.counts.failed, 6, "one line plus five repeats");
  assert.equal(newer.counts.accepted, 1);
  assert.equal(newer.counts.sudo, 1, "only the command that actually ran");
  assert.equal(newer.counts.refused, 2);
  assert.ok(newer.flags.some(f => /bob was refused sudo 2 times/.test(f.text)));
  const web = analyse([
    '203.0.113.9 - - [21/Oct/2026:03:13:02 +0000] "GET /search?q=1\\" OR \\"1\\"=\\"1 HTTP/1.1" 200 812 "-" "sqlmap/1.8.4#stable (https://sqlmap.org)"',
    '203.0.113.9 - - [21/Oct/2026:03:13:03 +0000] "-" 400 0 "-" "-"',
    '203.0.113.9 - - [21/Oct/2026:03:13:04 +0000] "\\x16\\x03\\x01\\x00\\xfc\\x01" 400 157 "-" "-"',
  ].join("\n"));
  assert.equal(web.counts.requests, 3, "no line is dropped");
  assert.ok(web.flags.some(f => /SQL injection, and 1 got a success code/.test(f.text)));
  assert.ok(web.flags.some(f => /sqlmap/.test(f.text)));
});
