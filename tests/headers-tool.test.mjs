// Tests for the email header checker (static/js/tools/headers.js): real Gmail and Microsoft 365 formats, which
// check results are trusted, the "worth a look" flags and the lookalike-domain check.
// Run with:  node --test tests/headers-tool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyse, lookalike, baseDomain } from "../static/js/tools/headers.js";

const samples = JSON.parse(readFileSync(new URL("../content/tools.json", import.meta.url), "utf8")).headerSamples;
const sample = label => samples.find(s => s.label.includes(label));
const titles = r => r.findings.map(f => `${f.level}: ${f.title}`);

test("a Gmail newsletter: every check passes, no warnings, bounces to the mailing service", () => {
  const r = analyse(sample("newsletter").headers);
  assert.ok(r.ok);
  assert.equal(r.warnings, 0);
  assert.equal(r.parsed.authBy, "mx.google.com", "the topmost Authentication-Results is Gmail's own");
  assert.deepEqual(["spf", "dkim", "dmarc"].map(k => r.parsed.auth[k].result), ["pass", "pass", "pass"]);
  assert.ok(titles(r).includes("info: Bounces go to another domain"));
  assert.match(r.findings.find(f => f.title === "Where it was sent from").text, /198\.51\.100\.25/);
});

test("a Microsoft 365 spoof: failed checks and a different Reply-To are flagged; a fake 'pass' header is ignored", () => {
  const r = analyse(sample("spoofed").headers);
  assert.equal(r.parsed.authBy, "", "Microsoft 365 writes no server name in its Authentication-Results");
  assert.deepEqual(["spf", "dkim", "dmarc"].map(k => r.parsed.auth[k].result), ["fail", "none", "fail"]);
  for (const t of ["warn: SPF failed", "warn: DMARC failed", "warn: Replies go somewhere else", "info: Some check results were ignored", "info: DKIM wasn't there"]) assert.ok(titles(r).includes(t), t);
  assert.match(r.findings.find(f => f.title === "Some check results were ignored").text, /northvale-alerts\.example/);
  assert.match(r.findings.find(f => f.title === "Where it was sent from").text, /203\.0\.113\.50/, "Microsoft's '(IP)' form is read");
  assert.equal(r.findings[0].level, "warn", "warnings come first");
  const own = analyse(sample("spoofed").headers, { org: "northvalebank.example" });
  assert.ok(titles(own).includes("warn: It claims to be from your own domain"));
});

test("a lookalike passes every check, so only knowing your own domain catches it", () => {
  const plain = analyse(sample("lookalike").headers);
  assert.equal(plain.warnings, 0, "nothing in the checks gives it away");
  const r = analyse(sample("lookalike").headers, { org: "ashbylane.example" });
  assert.ok(titles(r).includes("warn: The domain imitates yours"));
  assert.match(r.findings.find(f => f.level === "warn").text, /look-alike letters/);
});

test("lookalike(): swapped letters, extra words, one letter off and other alphabets; not your own subdomains", () => {
  assert.match(lookalike("ashby1ane.example", "ashbylane.example"), /look-alike/);
  assert.match(lookalike("rnicrosoft.example", "microsoft.example"), /look-alike/);
  assert.match(lookalike("paypa1-secure.example", "paypal.example"), /look-alike|contains/);
  assert.match(lookalike("northvalebank-verify.example", "northvalebank.example"), /contains your name/);
  assert.match(lookalike("northvalbank.example", "northvalebank.example"), /one letter/);
  assert.match(lookalike("xn--pypal-4ve.example", "paypal.example"), /punycode/);
  assert.equal(lookalike("mail.ashbylane.example", "ashbylane.example"), "", "your own subdomain");
  assert.equal(lookalike("harlowprint.example", "ashbylane.example"), "", "unrelated");
  assert.equal(baseDomain("mail.example.co.uk"), "example.co.uk");
  assert.equal(baseDomain("a.b.example.com"), "example.com");
});

test("a display name hiding a different address is flagged", () => {
  const r = analyse(`Authentication-Results: mx.example; spf=pass smtp.mailfrom=evil.example; dkim=pass header.d=evil.example; dmarc=pass header.from=evil.example
From: "support@bank.example" <x@evil.example>`);
  assert.ok(titles(r).includes("warn: The name shows a different address"));
});

test("pasting something that isn't headers explains how to get them; Windows line endings are fine", () => {
  const r = analyse("Dear customer, click here");
  assert.equal(r.ok, false);
  assert.match(r.error, /Show original/);
  assert.equal(analyse(sample("newsletter").headers.replace(/\n/g, "\r\n")).warnings, 0);
  assert.ok(titles(analyse("From: a@b.example\nSubject: hi")).includes("info: No check results at all"));
});

test("every finding's 'Show me where' text is really in the headers, and the samples use documentation addresses", () => {
  for (const s of samples) {
    const r = analyse(s.headers, { org: s.org });
    for (const f of r.findings) if (f.where) assert.ok(s.headers.toLowerCase().includes(f.where.toLowerCase()), `${s.label}: ${f.title} → ${f.where}`);
    for (const ip of s.headers.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || []) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|10)\./, `${s.label}: ${ip}`);
    assert.ok(!s.headers.includes("—"));
  }
});

test("'Show me where' points at the trusted result, not a fake one with the same name", () => {
  const r = analyse(sample("spoofed").headers);
  assert.equal(r.findings.find(f => f.title === "SPF failed").where, "spf=fail", "the fake header says spf=pass");
  assert.equal(r.findings.find(f => f.title === "Some check results were ignored").where, "Authentication-Results: northvale-alerts.example");
});

test("found in review: link spoofs, typed domains, encoded names, Exim hops", async () => {
  const { MAIL } = await import("../static/js/mail.js");
  const { cleanDomain } = await import("../static/js/tools/headers.js");
  // Everything before @ in a URL is a username: the browser goes to evil.example.
  assert.deepEqual(({ ...MAIL.linkFacts({ text: "https://www.paypal.com/signin", href: "https://www.paypal.com:443@evil.example/signin" }) }).real, "evil.example");
  assert.equal(MAIL.linkFacts({ text: "paypal.com/signin", href: "https://evil.example/" }).mismatch, true, "text without https:// still shows an address");
  assert.equal(MAIL.linkFacts({ text: "Sign in", href: "https://bank.example/" }).mismatch, false);
  for (const d of ["@example.com", "https://www.example.com/", " Example.COM ", "alice@example.com"]) assert.equal(cleanDomain(d), "example.com", d);
  const own = analyse("Authentication-Results: mx.example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com\nFrom: Alice <alice@example.com>", { org: "@example.com" });
  assert.equal(own.warnings, 0, "your own genuine mail isn't flagged when the domain is typed with @");
  const enc = analyse('Authentication-Results: mx.example; spf=pass; dkim=pass; dmarc=pass\nFrom: =?UTF-8?B?c3VwcG9ydEBiYW5rLmV4YW1wbGU=?= <x@evil.example>');
  assert.equal(enc.parsed.from.name, "support@bank.example", "MIME-encoded names are decoded");
  assert.ok(enc.findings.some(f => f.title === "The name shows a different address"));
  assert.equal(MAIL.parseHeaders("Received: from mail.example.net ([203.0.113.5] helo=mail.example.net)\n\tby mx.example.org with esmtp\nFrom: a@b.example").received[0].rdns, "", "Exim's helo= isn't a host name");
});
