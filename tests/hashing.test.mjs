// Tests for the hashing lab (static/js/labs/hashing.js) and its content.
// Run with:  node --test tests/hashing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { md5, digest, diffBits, pbkdf2, tryGuesses, sharedHashes } from "../static/js/labs/hashing.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "hashing");
const node = (alg, s) => createHash(alg).update(s).digest("hex");

test("MD5 matches the RFC 1321 test suite and Node's implementation", () => {
  const rfc = {
    "": "d41d8cd98f00b204e9800998ecf8427e",
    a: "0cc175b9c0f1b6a831c399e269772661",
    abc: "900150983cd24fb0d6963f7d28e17f72",
    "message digest": "f96b697d7cb7938d525a2f31aaf161d0",
    abcdefghijklmnopqrstuvwxyz: "c3fcd3d76192e4007dfb496cca67e13b",
    ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789: "d174ab98d277d9f5a5611c2c9f419d9f",
    "12345678901234567890123456789012345678901234567890123456789012345678901234567890": "57edf4a22be3c955ac49da2e2107b67a",
  };
  for (const [input, want] of Object.entries(rfc)) assert.equal(md5(input), want, JSON.stringify(input));
  for (const s of ["Patch Notes", "é ✓ 🔐", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000)]) assert.equal(md5(s), node("md5", s), `length ${s.length}`);
});

test("SHA-1 and SHA-256 come from Web Crypto and agree with Node", async () => {
  for (const s of ["", "Patch Notes", "é ✓ 🔐"]) {
    assert.equal(await digest("SHA-1", s), node("sha1", s));
    assert.equal(await digest("SHA-256", s), node("sha256", s));
  }
});

test("diffBits counts differing bits; one character flips about half", async () => {
  assert.equal(diffBits("00", "ff"), 8);
  assert.equal(diffBits("a5", "a5"), 0);
  const a = await digest("SHA-256", "Patch Notes"), b = await digest("SHA-256", "Patch notes");
  const n = diffBits(a, b);
  assert.ok(n > 90 && n < 166, `${n} of 256 bits`);
});

test("PBKDF2 matches Node's for the same password, salt and rounds", async () => {
  const want = (await import("node:crypto")).pbkdf2Sync("guess", "salt", 1000, 32, "sha256").toString("hex");
  assert.equal(await pbkdf2("guess", "salt", 1000), want);
});

test("leaked tables: stored hashes really are the stated passwords", () => {
  for (const r of lab.unsalted) assert.equal(r.hash, node("sha1", r.password), r.user);
  for (const r of lab.salted) assert.equal(r.hash, node("sha256", r.salt + r.password), r.user);
  assert.deepEqual(lab.salted.map(r => r.user), lab.unsalted.map(r => r.user));
  assert.equal(new Set(lab.salted.map(r => r.salt)).size, lab.salted.length, "every salt is unique");
});

test("the attack demo: unsalted reveals shared passwords; salt costs work but doesn't save weak passwords", async () => {
  assert.deepEqual(sharedHashes(lab.unsalted).sort(), ["j.burke", "m.reyes"]);
  assert.deepEqual(sharedHashes(lab.salted), [], "salted: no two hashes alike");
  const plain = await tryGuesses(lab.unsalted, lab.guesses, { salted: false });
  const salted = await tryGuesses(lab.salted, lab.guesses, { salted: true });
  assert.deepEqual(Object.keys(plain.cracked).sort(), Object.keys(salted.cracked).sort(), "the same weak passwords fall either way");
  assert.equal(plain.hashes, lab.guesses.length, "one hash per guess covers every account");
  assert.ok(salted.hashes > plain.hashes, "salted: each account needs its own hashing");
  const strong = lab.unsalted.filter(r => !lab.guesses.includes(r.password)).map(r => r.user);
  for (const u of strong) assert.ok(!(u in plain.cracked) && !(u in salted.cracked), `${u} survives`);
  assert.ok(strong.length >= 2 && Object.keys(plain.cracked).length >= 3);
});

test("lab content is consistent", async () => {
  const d = lab.download;
  const matching = [];
  for (const [i, m] of d.mirrors.entries()) if (node("sha256", m.content) === d.sha256) matching.push(i);
  assert.equal(matching.length, 1, "exactly one mirror matches the published hash");
  assert.match(d.mirrors[matching[0]].why, /matches/);
  for (const k of ["retired", "defend"]) {
    const q = lab.questions[k];
    assert.ok(q.answer >= 0 && q.answer < q.options.length && q.why && q.wrong);
    assert.ok(lab.parts.some(p => p.id === q.part));
  }
  assert.equal(lab.pbkdf2Iterations, 600000, "OWASP's figure for PBKDF2-HMAC-SHA256");
  assert.equal(new Set(lab.guesses).size, lab.guesses.length);
  assert.ok(!JSON.stringify(lab).includes("—"), "no em dashes");
  assert.ok(lab.text.retired.join(" ").includes("38762cf7f55934b34d179ae6a4c80cadccbb7f0a"), "the SHAttered hash, checked against the published PDFs");
});
