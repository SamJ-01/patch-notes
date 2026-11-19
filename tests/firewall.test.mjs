// Tests for the firewall lab's pure engine (static/js/labs/firewall.js).
// Run with:  node --test tests/firewall.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fw from "../static/js/labs/firewall.js";

const rules = [
  { action: "allow", proto: "tcp", src: "any", dst: "10.0.0.5", port: 443 },
  { action: "allow", proto: "tcp", src: "any", dst: "10.0.0.5", port: 80 },
  { action: "allow", proto: "tcp", src: "10.0.0.0/24", dst: "10.0.0.5", port: 22 },
  { action: "deny", proto: "any", src: "any", dst: "any", port: "any" },
];

test("CIDR membership: any, exact and /24", () => {
  assert.equal(fw.inCidr("1.2.3.4", "any"), true);
  assert.equal(fw.inCidr("10.0.0.5", "10.0.0.5"), true);
  assert.equal(fw.inCidr("10.0.0.40", "10.0.0.0/24"), true);
  assert.equal(fw.inCidr("10.0.1.40", "10.0.0.0/24"), false);
  assert.equal(fw.inCidr("198.51.100.7", "10.0.0.0/24"), false);
});

test("first match wins; the catching rule is reported", () => {
  const web = fw.evaluate({ src: "203.0.113.9", dst: "10.0.0.5", port: 443, proto: "tcp" }, rules);
  assert.equal(web.action, "allow");
  assert.equal(web.index, 0);
  const sshInside = fw.evaluate({ src: "10.0.0.40", dst: "10.0.0.5", port: 22, proto: "tcp" }, rules);
  assert.equal(sshInside.action, "allow");
  assert.equal(sshInside.index, 2);
});

test("SSH from the internet and Telnet both fall to the default deny", () => {
  const sshOut = fw.evaluate({ src: "198.51.100.7", dst: "10.0.0.5", port: 22, proto: "tcp" }, rules);
  assert.equal(sshOut.action, "deny");
  assert.equal(sshOut.index, 3);
  const telnet = fw.evaluate({ src: "198.51.100.7", dst: "10.0.0.5", port: 23, proto: "tcp" }, rules);
  assert.equal(telnet.action, "deny");
});

test("no rules at all → implicit default deny", () => {
  const r = fw.evaluate({ src: "1.1.1.1", dst: "2.2.2.2", port: 80, proto: "tcp" }, []);
  assert.equal(r.action, "deny");
  assert.equal(r.defaulted, true);
});

test("a DENY-all above the ALLOWs blocks everything (rule order matters)", () => {
  const bad = [{ action: "deny", proto: "any", src: "any", dst: "any", port: "any" }, ...rules];
  const web = fw.evaluate({ src: "203.0.113.9", dst: "10.0.0.5", port: 443, proto: "tcp" }, bad);
  assert.equal(web.action, "deny");
  assert.equal(web.index, 0);
});

test("gradeFirewall scores packets against expected outcomes", () => {
  const tests = [
    { label: "web", src: "203.0.113.9", dst: "10.0.0.5", port: 443, proto: "tcp", expected: "allow" },
    { label: "ssh-out", src: "198.51.100.7", dst: "10.0.0.5", port: 22, proto: "tcp", expected: "deny" },
  ];
  const g = fw.gradeFirewall(rules, tests);
  assert.equal(g.pass, true);
  assert.equal(g.right, 2);
  // break it: allow SSH from anywhere, and the attacker now gets in → one test fails.
  const leaky = [{ action: "allow", proto: "tcp", src: "any", dst: "10.0.0.5", port: 22 }, ...rules];
  const g2 = fw.gradeFirewall(leaky, tests);
  assert.equal(g2.pass, false);
  assert.ok(g2.results.find(r => r.label === "ssh-out" && !r.ok));
});

test("missReason names the first field that doesn't fit, and null on a match", () => {
  const r = { proto: "tcp", src: "10.0.0.0/24", dst: "10.0.0.5", port: 22, action: "allow" };
  assert.equal(fw.missReason(r, { proto: "tcp", src: "10.0.0.40", dst: "10.0.0.5", port: 22 }), null);
  assert.match(fw.missReason(r, { proto: "udp", src: "10.0.0.40", dst: "10.0.0.5", port: 22 }), /UDP/);
  assert.match(fw.missReason(r, { proto: "tcp", src: "203.0.113.9", dst: "10.0.0.5", port: 22 }), /from 10\.0\.0\.0\/24/);
  assert.match(fw.missReason(r, { proto: "tcp", src: "10.0.0.40", dst: "10.0.0.5", port: 443 }), /port 22.*443/);
});

test("hintFor walks every lab packet down to the deciding rule without naming it", async () => {
  const { readFile } = await import("node:fs/promises");
  const lab = JSON.parse(await readFile(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "firewall-packet");
  for (const p of lab.packets) {
    const res = fw.evaluate(p, lab.rules), h = fw.hintFor(p, lab.rules);
    assert.equal(h.misses.length, res.index < 0 ? lab.rules.length : res.index);
    assert.ok(h.misses.every(m => m.why), "every rule above the match has a reason");
    assert.doesNotMatch(h.next, /allow|deny|blocked/i, "the hint never says the outcome");
  }
});
