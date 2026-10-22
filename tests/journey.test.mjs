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

// ---------- Part 1: how a request finds its server
const lab1 = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "finding-the-server");
const ch1 = id => lab1.chapters.find(c => c.id === id);

test("DNS: the first lookup asks the servers, later ones use the cache until the TTL runs out, even after a move", () => {
  const d = ch1("dns");
  let r = J.dnsLookup(J.dnsStart(d.zone), d.host, 0);
  assert.deepEqual([r.from, r.ip, r.ttl, r.chain.length], ["servers", "203.0.113.10", 300, 3]);
  r = J.dnsLookup(r.state, d.host, 60);
  assert.deepEqual([r.from, r.ttl], ["cache", 240], "the TTL counts down");
  r.state.zone[d.host].ip = d.movedIp;
  assert.equal(J.dnsLookup(r.state, d.host, 299).ip, "203.0.113.10", "a cached answer is stale until it expires");
  const after = J.dnsLookup(r.state, d.host, 300);
  assert.deepEqual([after.from, after.ip], ["servers", d.movedIp]);
  assert.match(J.digAnswer(d.host, after, d.resolver), /^;; ANSWER SECTION:\napi\.hopper\.example\.\t300\tIN\tA\t203\.0\.113\.20\n/);
  assert.match(J.digAnswer("nope.example", J.dnsLookup(J.dnsStart({}), "nope.example", 0), d.resolver), /status: NXDOMAIN/);
});

test("ports: 0.0.0.0 answers everyone, 127.0.0.1 only the machine itself; nc and ss read like the real tools", () => {
  const sv = structuredClone(ch1("ports").services), H = "203.0.113.10";
  assert.equal(J.nc(sv, "remote", H, 443).out, "Connection to 203.0.113.10 443 port [tcp/https] succeeded!");
  assert.equal(J.nc(sv, "remote", H, 5432).out, "nc: connect to 203.0.113.10 port 5432 (tcp) failed: Connection refused");
  assert.ok(J.nc(sv, "remote", H, 6379).ok, "Redis starts exposed: that's the mistake to fix");
  assert.ok(J.nc(sv, "local", "127.0.0.1", 5432).ok);
  assert.ok(!J.nc(sv, "local", "127.0.0.1", 22).ok, "nothing listening, refused even locally");
  const ss = J.ssLines(sv).split("\n");
  assert.match(ss[0], /^State\s+Recv-Q\s+Send-Q\s+Local Address:Port\s+Peer Address:Port\s+Process$/);
  assert.match(ss[2], /^LISTEN\s+0\s+244\s+127\.0\.0\.1:5432\s+0\.0\.0\.0:\*\s+users:\(\("postgres",pid=901,fd=7\)\)$/);
  assert.equal(new Set(ss.map(l => l.indexOf(":5432") >= 0 ? l.indexOf(":5432") : null).filter(x => x !== null)).size, 1);
});

test("ARP: same network means ask for the device itself; anywhere else means ask for the gateway", () => {
  const a = ch1("arp");
  assert.equal(J.nextHop(a.me, "192.168.1.31"), "192.168.1.31");
  assert.equal(J.nextHop(a.me, "203.0.113.10"), "192.168.1.1");
  assert.ok(!J.sameNetwork("192.168.1.24", "192.168.2.24", "255.255.255.0"));
  assert.ok(J.sameNetwork("10.0.0.1", "10.0.3.9", "255.255.252.0"));
  let r = J.arpResolve({}, a.lan, a.me, "203.0.113.10");
  assert.deepEqual([r.hop, r.cached, r.mac, r.replier], ["192.168.1.1", false, "00:00:5e:00:53:01", "Home router"]);
  r = J.arpResolve(r.state, a.lan, a.me, "198.51.100.9");
  assert.equal(r.cached, true, "every internet address uses the router's MAC, already known");
  r = J.arpResolve(r.state, a.lan, a.me, "192.168.1.99");
  assert.equal(r.mac, null);
  assert.equal(J.ipNeigh(r.state), "192.168.1.1 dev wlan0 lladdr 00:00:5e:00:53:01 REACHABLE\n192.168.1.99 dev wlan0 FAILED");
  for (const h of [a.me, ...a.lan]) assert.match(h.mac, /^00:00:5e:00:53:[0-9a-f]{2}$/, "documentation MAC range (RFC 7042)");
});

test("traceroute: each TTL reveals one more hop; silent routers are stars; the server says port unreachable", () => {
  const H = ch1("route").hops;
  assert.equal(J.probe(H, 1).icmp, "time exceeded");
  assert.ok(J.probe(H, 3).silent);
  assert.deepEqual([J.probe(H, H.length).reached, J.probe(H, H.length).icmp], [true, "port unreachable"]);
  assert.match(J.tracerouteLine(H, 1), /^ 1 {2}_gateway \(192\.168\.1\.1\) {2}\d+\.\d{3} ms {2}\d+\.\d{3} ms {2}\d+\.\d{3} ms$/);
  assert.equal(J.tracerouteLine(H, 3), " 3  * * *");
  assert.match(J.tracerouteLine(H, 6), /^ 6 {2}api\.hopper\.example \(203\.0\.113\.10\)/);
  const first = Number(J.tracerouteLine(H, 1).match(/\) {2}([\d.]+)/)[1]), last = Number(J.tracerouteLine(H, 6).match(/\) {2}([\d.]+)/)[1]);
  assert.ok(first < last, "further hops take longer");
});

test("NAT: outbound gets a public address and port; only replies to something in the table come back in", () => {
  let st = J.natStart("198.51.100.7");
  let r = J.natOut(st, "192.168.1.24:51514", "203.0.113.10:443"); st = r.state;
  assert.equal(r.row.outside, "198.51.100.7:40001");
  r = J.natOut(st, "192.168.1.31:49822", "198.51.100.200:443"); st = r.state;
  assert.equal(r.row.outside, "198.51.100.7:40002", "two devices, two ports");
  assert.equal(J.natOut(st, "192.168.1.24:51514", "203.0.113.10:443").state.table.length, 2, "the same flow reuses its entry");
  assert.equal(J.natIn(st, "203.0.113.10:443", "198.51.100.7:40001").row.inside, "192.168.1.24:51514");
  assert.equal(J.natIn(st, "203.0.113.66:55012", "198.51.100.7:22").allowed, false);
  assert.equal(J.natIn(st, "203.0.113.66:443", "198.51.100.7:40001").allowed, false, "the right port from the wrong sender is still dropped");
});

test("tiers: private subnets stop the internet; security groups decide inside; the database fix is to allow only the app tier", () => {
  const t = ch1("tiers"), tiers = structuredClone(t.tiers);
  const wrong = () => t.tests.filter(x => J.tierCheck(tiers, x).ok !== x.expect);
  assert.deepEqual(wrong().map(x => `${x.from}>${x.to}`), ["lb>db"], "only the loose rule is wrong at the start");
  assert.equal(J.tierCheck(tiers, { from: "internet", to: "db", port: 5432 }).layer, "network", "the private subnet saves it from the internet");
  tiers.db.rules[0].from = "lb";
  assert.ok(wrong().length > 0);
  tiers.db.rules[0].from = "app";
  assert.equal(wrong().length, 0);
});

test("part 1 content is consistent and links to part 2", () => {
  assert.equal(lab1.next, "one-request");
  assert.equal(lab.prev, "finding-the-server");
  for (const c of lab1.chapters) assert.ok(c.label && c.title && c.idea && c.goal && c.security && c.deeper?.href, c.id);
  assert.ok(!JSON.stringify(lab1).includes("—"), "no em dashes");
});
