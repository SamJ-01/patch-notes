// The pure core of the "See it at work" explainers (static/js/explainers.js). The SVG drawing in mount()
// needs a DOM and is exercised by the browser checks; here we pin the facts the VPN explainer teaches so
// they can't drift from shift-01's scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vpnView, VPN, idorView, IDOR, cloudView, CLOUD, inboxView, INBOX, sprayView, SPRAY, mfaView, MFA, ddosView, DDOS, certView, CERT, chainStep, CHAIN, ztView, ZT, KINDS } from "../static/js/explainers.js";

test("vpn: off is the real location, on is the VPN exit", () => {
  assert.equal(vpnView(false), VPN.off);
  assert.equal(vpnView(true), VPN.on);
  // Off: the employee's own country. On: the VPN exit's country. They must differ, or there's nothing to teach.
  assert.notEqual(VPN.off.country, VPN.on.country);
  assert.notEqual(VPN.off.ip, VPN.on.ip);
});

test("vpn: the figures match shift-01 (UK employee, Amsterdam exit in NL)", () => {
  assert.equal(VPN.off.cc, "GB");
  assert.equal(VPN.on.cc, "NL");
  assert.match(VPN.on.exit, /Amsterdam/);
  // CHG-2291 in the shift moved the exit to 198.51.100.10; keep the explainer in step with it.
  assert.equal(VPN.on.ip, "198.51.100.10");
});

test("vpn: addresses stay in the documentation ranges", () => {
  for (const ip of [VPN.off.ip, VPN.on.ip]) {
    assert.match(ip, /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/, `${ip} should be a documentation address`);
  }
});

test("idor: the ownership check flips a leak into a refusal", () => {
  assert.equal(idorView(false), IDOR.off);
  assert.equal(idorView(true), IDOR.on);
  assert.match(IDOR.off.status, /200/);           // no check: the other customer's order is returned
  assert.match(IDOR.on.status, /403/);            // check on: denied
  assert.notEqual(IDOR.yours, IDOR.target);        // you request someone else's id
});

test("cloud: least privilege turns an allowed download into AccessDenied", () => {
  assert.equal(cloudView(false), CLOUD.off);
  assert.equal(cloudView(true), CLOUD.on);
  assert.match(CLOUD.off.status, /Allowed/i);
  assert.match(CLOUD.on.status, /AccessDenied/);
  assert.notEqual(CLOUD.off.scope, CLOUD.on.scope);
});

test("inbox rule: on hides the supplier mail, off leaves it unread in the Inbox", () => {
  assert.equal(inboxView(true), INBOX.on);
  assert.equal(inboxView(false), INBOX.off);
  assert.equal(INBOX.on.folder, "RSS Feeds");
  assert.equal(INBOX.on.unread, false);
  assert.equal(INBOX.off.folder, "Inbox");
  assert.equal(INBOX.off.unread, true);
  assert.ok(INBOX.target.subject.length);
});

test("spray: the three attacks are distinct, and spray is the one that dodges lockout", () => {
  for (const k of ["spray", "brute", "stuffing"]) assert.ok(sprayView(k), `no spray view ${k}`);
  assert.match(SPRAY.spray.how, /one|1/i);
  assert.match(SPRAY.spray.lockout, /lockout/i);
  assert.notEqual(SPRAY.spray.grid, SPRAY.brute.grid);
});

test("mfa: number matching flips account takeover into blocked", () => {
  assert.equal(mfaView(false), MFA.off);
  assert.equal(mfaView(true), MFA.on);
  assert.match(MFA.off.action, /in|taken/i);   // off: the attacker gets in
  assert.match(MFA.on.action, /nothing to type|number/i);
});

test("ddos: the flood exceeds capacity and real visitors stop being served", () => {
  assert.equal(ddosView(false).served, true);
  assert.equal(ddosView(true).served, false);
  assert.ok(DDOS.legit < DDOS.cap, "normal traffic fits under capacity");
  assert.ok(DDOS.legit + DDOS.on.attack > DDOS.cap, "the flood must exceed capacity");
});

test("cert: only the valid certificate is trusted, and each fault has its Chrome code", () => {
  assert.equal(certView("valid").ok, true);
  for (const k of ["expired", "host", "selfsigned"]) {
    assert.equal(certView(k).ok, false, `${k} should not be trusted`);
    assert.match(CERT[k].code, /^NET::ERR_CERT_/, `${k} should carry a Chrome cert error code`);
  }
});

test("chain: an ordered attack timeline that starts at the PC and ends caught before encryption", () => {
  assert.ok(CHAIN.steps.length >= 4);
  assert.equal(chainStep(0), CHAIN.steps[0]);
  assert.match(CHAIN.steps[0].at, /HAL-PC-07/);               // starts on the workstation
  assert.match(CHAIN.steps.at(-1).at, /FS01/);                // ends on the file server
  assert.equal(CHAIN.steps.at(-1).win, true);                // the defensive win: caught in time
  assert.ok(CHAIN.steps.every(s => s.text && s.title), "every stage has a title and text");
});

test("zero-trust: perimeter trusts by location, zero trust checks every request", () => {
  assert.equal(ztView(false), ZT.off);
  assert.equal(ztView(true), ZT.on);
  assert.match(ZT.off.status, /location/i);
  assert.match(ZT.on.status, /every request/i);
});

test("KINDS lists every explainer mount can draw", () => {
  for (const k of ["vpn", "idor", "cloud", "inbox-rule", "spray", "mfa-fatigue", "ddos", "cert", "chain", "zero-trust"]) assert.ok(KINDS.includes(k), `KINDS missing ${k}`);
});
