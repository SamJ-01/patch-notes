// Tests for "One request, start to finish" (static/js/labs/journey.js): HTTP messages, TCP and UDP loss,
// TLS captures and certificate checks, the load balancer, reverse proxy routing, the firewall and polling.
// Run with:  node --test tests/journey.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as J from "../static/js/labs/journey.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "one-request");
const ch = id => lab.chapters.find(c => c.id === id);

test("HTTP: real HTTP/1.1 messages, with Content-Length counted in bytes", () => {
  for (const x of ch("http").exchanges) {
    const r = J.exchange(x);
    assert.match(r.request, new RegExp(`^${x.method} ${x.path} HTTP/1\\.1\\nHost: api\\.hopper\\.example\\n`));
    assert.match(r.response, new RegExp(`^HTTP/1\\.1 ${x.status} ${J.REASON[x.status]}\\n`));
    const [head, body] = r.response.split("\n\n");
    if (body) assert.equal(Number(head.match(/Content-Length: (\d+)/)[1]), Buffer.byteLength(body), x.label);
  }
  assert.equal(J.httpMessage("GET / HTTP/1.1", [["Host", "a"]]), "GET / HTTP/1.1\nHost: a\n\n", "no body, no Content-Length");
  assert.match(J.httpMessage("X", [], "£"), /Content-Length: 2/, "bytes, not characters");
  assert.deepEqual(ch("http").exchanges.map(x => x.status), [200, 201, 404, 401]);
  assert.ok(!ch("http").exchanges[3].headers.some(([k]) => k === "Authorization"), "the 401 really has no token");
});

test("TCP: three duplicate ACKs trigger a fast retransmit; too few wait for the timer; the app always gets 1..n in order", () => {
  const fast = J.transfer(5, [2]);
  assert.deepEqual(fast.events.filter(e => e.t === "ack").map(e => e.n), [2, 2, 2, 2, 6]);
  assert.equal(fast.events.find(e => e.retrans).retrans, "fast");
  const slow = J.transfer(5, [3]);
  assert.deepEqual(slow.events.filter(e => e.t === "ack").map(e => e.n), [2, 3, 3, 3, 6], "only two duplicates");
  assert.equal(slow.events.find(e => e.retrans).retrans, "timeout");
  const last = J.transfer(5, [5]);
  assert.ok(last.events.some(e => e.t === "timeout" && e.seg === 5), "losing the last segment needs the timer");
  for (const lost of [[], [1], [2, 4], [1, 2, 3, 4, 5], [5, 3]]) {
    const r = J.transfer(5, lost);
    assert.deepEqual(r.app, [1, 2, 3, 4, 5], `lost ${lost}`);
    assert.equal(r.resent, lost.length, `each lost segment is resent once (lost ${lost})`);
  }
});

test("UDP: no ACKs, no resends, gaps stay", () => {
  const r = J.transfer(5, [3, 1], "udp");
  assert.deepEqual(r.app, [2, 4, 5]);
  assert.deepEqual(r.missing, [1, 3]);
  assert.ok(!r.events.some(e => e.t === "ack"));
});

test("headers: UDP is 8 bytes and TCP 20, 32 bits a row", () => {
  assert.equal(J.headerBytes(J.HEADERS.udp), 8);
  assert.equal(J.headerBytes(J.HEADERS.tcp), 20);
  for (const rows of Object.values(J.HEADERS)) for (const row of rows) assert.equal(row.reduce((a, [, b]) => a + b, 0), 32);
});

test("TLS: plain text without it; a TLS 1.3 application_data record with it", () => {
  const p = ch("tls").payload;
  assert.equal(J.capture(p, false).text, p);
  const c = J.capture(p, true);
  assert.equal(c.header.slice(0, 8), "17 03 03");
  assert.equal(c.length, Buffer.byteLength(p) + 17, "text, a content-type byte and a 16-byte tag");
  assert.equal(parseInt(c.bytes[3] + c.bytes[4], 16), c.length, "the length field matches");
  assert.equal(c.bytes.length, c.length + 5);
  assert.deepEqual(J.capture(p, true).bytes, c.bytes, "the same every time");
  assert.ok(!c.bytes.join("").includes(Buffer.from("Euston").toString("hex")), "nothing readable");
});

test("certificates: name, authority and dates are each checked, with Chrome's error codes", () => {
  const t = ch("tls"), r = t.certs.map(k => J.checkCert(k, t.host, t.today, t.trusted));
  assert.deepEqual(r.map(x => x.code), ["", "NET::ERR_CERT_AUTHORITY_INVALID", "NET::ERR_CERT_COMMON_NAME_INVALID", "NET::ERR_CERT_DATE_INVALID"]);
  assert.ok(J.nameMatches("*.hopper.example", "api.hopper.example"));
  assert.ok(!J.nameMatches("*.hopper.example", "a.b.hopper.example"), "a wildcard covers one label");
  assert.ok(!J.nameMatches("*.hopper.example", "hopper.example"));
  assert.ok(!J.nameMatches("api.*.example", "api.hopper.example"), "only the leftmost label can be a wildcard");
});

test("load balancer: round robin takes turns; least connections avoids a busy server", () => {
  let s = J.lbStart(["a", "b", "c"]);
  for (let i = 0; i < 6; i++) s = J.lbRequest(s, "rr", 1);
  assert.deepEqual(s.log.map(l => l.server), ["a", "b", "c", "a", "b", "c"]);
  s = J.lbStart(["a", "b", "c"]);
  for (const d of [10, 1, 1, 1]) s = J.lbRequest(s, "least", d);
  assert.deepEqual(s.log.map(l => l.server), ["a", "b", "b", "b"], "a is busy with a long request; b frees up each time");
});

test("load balancer: a crash is retried elsewhere until 3 failed checks take it out; it rejoins after 2 good ones", () => {
  let s = J.lbSetAlive(J.lbStart(["a", "b", "c"]), "a", false);
  s = J.lbRequest(s, "rr");
  assert.deepEqual([s.log.at(-1).server, s.log.at(-1).retriedFrom], ["b", ["a"]], "connection refused, so retried on the next server");
  s = J.lbRequest(s, "rr"); s = J.lbRequest(s, "rr");
  assert.ok(s.log.some(l => l.health === "a" && l.up === false));
  assert.equal(s.servers[0].healthy, false);
  assert.equal(s.failed, 0, "no request was lost");
  s = J.lbSetAlive(s, "a", true);
  s = J.lbRequest(s, "rr"); assert.equal(s.servers[0].healthy, false);
  s = J.lbRequest(s, "rr"); assert.equal(s.servers[0].healthy, true);
  let all = J.lbStart(["a"]); all = J.lbSetAlive(all, "a", false);
  for (let i = 0; i < 4; i++) all = J.lbRequest(all, "rr");
  assert.equal(all.log.at(-1).status, 503, "nothing healthy left");
});

test("reverse proxy: the longest prefix wins, like nginx prefix locations", () => {
  const L = ch("proxy").locations, to = p => J.routePath(L, p)?.to ?? null;
  assert.equal(to("/rides/42"), "rides");
  assert.equal(to("/pay/receipts/43"), "payments");
  assert.equal(to("/pay/admin/refunds"), null, "/pay/admin/ is longer than /pay/, so it wins and returns 404");
  assert.equal(to("/wp-login.php"), null);
  assert.equal(to("/rides?x=1"), null, "/rides without the slash doesn't match /rides/");
  assert.equal(J.routePath(L, "rides"), null);
  for (const p of ch("proxy").examples) assert.ok(J.routePath(L, p), `${p} matches something`);
});

test("firewall: first match wins, default deny, and the starting rules can be fixed by flipping and moving", () => {
  const f = ch("fw");
  assert.ok(!J.fwSolved(f.rules, f.tests), "starts broken");
  assert.deepEqual(J.evaluate([], { src: "x", dst: "y", port: 1 }), { action: "deny", rule: -1 });
  const r = structuredClone(f.rules);
  r[1].action = "deny"; r[3].action = "deny";
  assert.ok(!J.fwSolved(r, f.tests), "denying any → db first also blocks the API: order matters");
  [r[1], r[2]] = [r[2], r[1]];
  assert.ok(J.fwSolved(r, f.tests));
  for (const t of f.tests) assert.ok(f.hosts[t.src] && f.hosts[t.dst]);
});

test("polling vs WebSocket: requests and wasted asks", () => {
  const w = ch("ws"), r = J.compareLive(w.seconds, w.interval, w.updates);
  assert.equal(r.pollRequests, 15);
  assert.equal(r.wasted, 12);
  assert.equal(r.pushes, 3);
  assert.ok(r.polls.filter(p => p.news).every(p => p.lag < w.interval));
  // The handshake is RFC 6455's own example: Accept = base64(SHA-1(key + GUID)).
  const key = w.upgrade.request.match(/Sec-WebSocket-Key: (\S+)/)[1];
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  assert.ok(w.upgrade.response.includes(`Sec-WebSocket-Accept: ${accept}`));
  assert.match(w.upgrade.response, /^HTTP\/1\.1 101 Switching Protocols/);
});

test("lab content is consistent", () => {
  assert.equal(new Set(lab.chapters.map(c => c.id)).size, lab.chapters.length);
  for (const c of lab.chapters) assert.ok(c.label && c.title && c.idea && c.goal && c.security, c.id);
  assert.ok(!JSON.stringify(lab).includes("—"), "no em dashes");
});
