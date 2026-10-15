// Tests for the self-contained labs: OSI model, Linux terminal and network topologies.
// Run with:  node --test tests/labs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as osi from "../static/js/labs/osi.js";
import * as term from "../static/js/labs/terminal.js";
import * as topo from "../static/js/labs/topology.js";
import * as ports from "../static/js/labs/ports.js";
import * as subnet from "../static/js/labs/subnet.js";

const labs = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8"));
const lab = id => labs.find(l => l.id === id);

test("OSI: 15-step journey wraps and unwraps headers in the right order", () => {
  const L = lab("osi-model");
  const steps = osi.walkthrough(L);
  assert.equal(steps.length, 15);
  assert.deepEqual(steps.slice(0, 7).map(s => s.layer), [7, 6, 5, 4, 3, 2, 1]);
  assert.equal(steps[7].side, "wire");
  assert.deepEqual(steps.slice(8).map(s => s.layer), [1, 2, 3, 4, 5, 6, 7]);
  const atL2 = osi.wrapping(L, steps[5]);
  assert.deepEqual(atL2.parts.map(p => p.label), ["ETH", "IP", "TCP", "SES", "TLS", "HTTP"]);
  assert.equal(atL2.trailer.label, "FCS");
  assert.ok(osi.wrapping(L, steps[6]).bits);
  const recvL2 = osi.wrapping(L, steps[9]);  // receiver has just stripped Ethernet
  assert.equal(recvL2.parts[0].label, "IP");
  assert.equal(recvL2.trailer, null);
  assert.deepEqual(osi.wrapping(L, steps[14]).parts, []);
});

test("OSI: content is complete and sort answers are real layers", () => {
  const L = lab("osi-model");
  assert.deepEqual(L.layers.map(l => l.n), [7, 6, 5, 4, 3, 2, 1]);
  assert.equal(L.layers.find(l => l.n === 3).pdu, "Packet");
  assert.equal(L.layers.find(l => l.n === 2).pdu, "Frame");
  for (const it of L.sortItems) assert.ok(it.layer >= 1 && it.layer <= 7 && it.why, it.text);
  assert.ok(L.sortItems.length >= L.roundSize);
  const round = osi.makeRound(L.sortItems, 10, () => 0.5);
  assert.equal(round.length, 10);
  assert.equal(new Set(round.map(r => r.text)).size, 10);
  assert.ok(osi.checkSort({ layer: 3 }, 3) && !osi.checkSort({ layer: 3 }, 2));
});

test("terminal: navigation, reading and errors behave like bash", () => {
  const sh = term.createShell(lab("linux-terminal"));
  assert.equal(sh.run("pwd").out, "/home/analyst");
  assert.equal(sh.run("whoami").out, "analyst");
  assert.ok(!sh.run("ls").out.includes(".bash_history"));
  assert.ok(sh.run("ls -a").out.includes(".bash_history"));
  assert.match(sh.run("cat nope.txt").out, /No such file or directory/);
  assert.match(sh.run("cd notes.txt").out, /Not a directory/);
  sh.run("cd /var/log");
  assert.equal(sh.prompt(), "analyst@web-01:/var/log$");
  sh.run("cd ..");
  assert.equal(sh.run("pwd").out, "/var");
  sh.run("cd");
  assert.equal(sh.prompt(), "analyst@web-01:~$");
  assert.match(sh.run("frobnicate").out, /command not found/);
  assert.match(sh.run("rm /etc/passwd").out, /Permission denied/);
});

test("terminal: grep, find, chmod and running a script", () => {
  const sh = term.createShell(lab("linux-terminal"));
  const failed = sh.run('grep "Failed password" /var/log/auth.log').out.split("\n");
  assert.equal(failed.length, 4);
  assert.equal(sh.run("grep -i failed /var/log/auth.log").out.split("\n").length, 4);
  assert.equal(sh.run("find / -name backup.sh").out, "/opt/backup/backup.sh");
  assert.match(sh.run("find / -name \"*.log\"").out, /auth\.log/);
  assert.match(sh.run("/opt/backup/backup.sh").out, /Permission denied/);
  sh.run("chmod +x /opt/backup/backup.sh");
  assert.equal(sh.state.fs["/opt/backup/backup.sh"].mode, "rwxr-xr-x");
  assert.match(sh.run("/opt/backup/backup.sh").out, /Backup complete/);
  sh.run("chmod 644 /opt/backup/backup.sh");
  assert.equal(sh.state.fs["/opt/backup/backup.sh"].mode, "rw-r--r--");
  sh.run("cd /opt/backup");
  assert.match(sh.run("./backup.sh").out, /Permission denied/);
});

test("terminal: every objective can be completed, and a wrong delete fails the tidy task", () => {
  const L = lab("linux-terminal");
  const sh = term.createShell(L);
  for (const c of ["whoami", "pwd", "ls -a", "cat notes.txt", "cd /var/log", 'grep "Failed password" auth.log', "grep Failed auth.log | wc -l", "find / -name backup.sh",
    "/opt/backup/backup.sh", "chmod +x /opt/backup/backup.sh", "/opt/backup/backup.sh", "mkdir ~/reports", "touch ~/reports/incident.txt", "rm /tmp/old.tmp"]) sh.run(c);
  for (const t of L.tasks) assert.ok(sh.isDone(t.check), t.id);
  const careless = term.createShell(L);
  careless.run("rm /tmp/old.tmp /tmp/session.lock");
  assert.ok(!careless.isDone(L.tasks.find(t => t.id === "tidy").check));
});

test("terminal: tab completion and quoting", () => {
  const sh = term.createShell(lab("linux-terminal"));
  assert.equal(sh.complete("cat no").line, "cat notes.txt");
  assert.equal(sh.complete("cd /var/l").line, "cd /var/log/");
  assert.deepEqual(term.tokenize('grep "Failed password" auth.log'), ["grep", "Failed password", "auth.log"]);
});

test("terminal: pipes feed one command's output into the next", () => {
  const sh = term.createShell(lab("linux-terminal"));
  sh.run("cd /var/log");
  assert.equal(sh.run("grep Failed auth.log | wc -l").out, "4");
  assert.equal(sh.run("grep -i failed auth.log | head -n 1").out.split("\n").length, 1);
  assert.equal(sh.run("ls | wc -l").out, "2");
  assert.match(sh.run("grep Failed auth.log | cut -d ' ' -f 11 | sort | uniq -c | sort -rn").out, /^\s+3 203\.0\.113\.45/);
  assert.match(sh.run("grep x |").out, /syntax error/);
  assert.match(sh.run("head").out, /no input/);
  assert.deepEqual(term.splitPipes('grep "a|b" f | wc -l'), ['grep "a|b" f ', " wc -l"]);
});

test("topologies: failures cut off the right devices", () => {
  const T = id => lab("topologies").topologies.find(t => t.id === id);
  const star = T("star");
  const allStar = topo.endpoints(star);
  const switchDown = topo.reachable(star, new Set(), new Set(["sw"]));
  assert.ok(allStar.every(e => !switchDown.has(e)), "if the switch fails, nobody reaches the server");
  assert.ok(topo.reachable(star, new Set([topo.linkKey("sw", "pc1")])).has("pc2"));
  assert.ok(!topo.reachable(star, new Set([topo.linkKey("sw", "pc1")])).has("pc1"));
  assert.equal(allStar.length, 5);
  // Bus: any backbone break takes the whole segment down
  assert.equal(topo.reachable(T("bus"), new Set([topo.linkKey("j1", "j2")])).size, 0);
  // Ring (dual): one break survivable, two breaks split it
  const ring = T("ring");
  assert.ok(topo.endpoints(ring).every(e => topo.reachable(ring, new Set([topo.linkKey("n1", "n2")])).has(e)));
  const two = topo.reachable(ring, new Set([topo.linkKey("n1", "n2"), topo.linkKey("n5", "n6")]));
  assert.ok(!two.has("n1") && two.has("n5"));
});

test("topologies: single points of failure match the teaching", () => {
  const T = id => lab("topologies").topologies.find(t => t.id === id);
  const count = id => { const s = topo.singlePoints(T(id)); return s.nodes.length + s.links.length; };
  assert.deepEqual(topo.singlePoints(T("star")).nodes, ["sw"]);
  assert.equal(count("mesh"), 0);
  assert.equal(count("ring"), 0);
  assert.ok(topo.singlePoints(T("hub-spoke")).nodes.includes("hq"));
  assert.deepEqual(topo.singlePoints(T("three-tier")).nodes.sort(), ["d1", "d2"]);
  assert.equal(T("mesh").links.length, 5 * 4 / 2);
  assert.ok(topo.singlePoints(T("spine-leaf")).nodes.every(n => n !== "s1" && n !== "s2"), "losing a spine shouldn't cut anyone off");
  for (const q of lab("topologies").quiz) assert.ok(T(q.answer), q.answer);
});

// Deterministic random numbers so generated questions are repeatable.
const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("ports: every drill question has one right answer among unique options", () => {
  const P = lab("ports-protocols").protocols;
  for (let s = 1; s <= 40; s++) {
    const round = ports.makeRound(P, 12, seeded(s));
    assert.equal(round.length, 12);
    assert.equal(new Set(round.map(q => q.id)).size, 12, "no protocol twice in a drill");
    for (const q of round) {
      assert.equal(new Set(q.options).size, q.options.length, q.q);
      assert.equal(q.options.filter(o => o === q.answer).length, 1, q.q);
      if (q.type === "proto") {  // no other option may also use the asked port
        const port = Number(q.q.match(/Port (\d+)/)[1]);
        assert.deepEqual(P.filter(p => q.options.includes(p.name) && p.ports.includes(port)).map(p => p.name), [q.answer]);
      }
    }
  }
});

test("ports: data is complete and secure swaps point at real protocols", () => {
  const P = lab("ports-protocols").protocols, ids = new Set(P.map(p => p.id));
  for (const p of P) {
    assert.ok(p.name && p.full && p.what && p.group && p.ports.length, p.id);
    assert.ok(["TCP", "UDP", "TCP/UDP"].includes(p.transport), p.id);
    if (p.secure) assert.ok(ids.has(p.secure), p.id);
  }
  const by = id => P.find(p => p.id === id);
  assert.deepEqual([by("ssh").ports, by("https").ports, by("rdp").ports, by("dns").ports], [[22], [443], [3389], [53]]);
});

test("subnetting: the maths matches worked examples", () => {
  const i = subnet.subnetInfo("192.168.10.77", 26);
  assert.deepEqual([i.mask, i.network, i.broadcast, i.first, i.last, i.hosts, i.block], ["255.255.255.192", "192.168.10.64", "192.168.10.127", "192.168.10.65", "192.168.10.126", 62, 64]);
  const j = subnet.subnetInfo("172.16.45.9", 20);
  assert.deepEqual([j.mask, j.network, j.broadcast, j.hosts, j.block, j.octet], ["255.255.240.0", "172.16.32.0", "172.16.47.255", 4094, 16, 2]);
  const k = subnet.subnetInfo("10.1.2.3", 24);
  assert.deepEqual([k.network, k.broadcast, k.hosts], ["10.1.2.0", "10.1.2.255", 254]);
  assert.equal(subnet.subnetInfo("10.0.0.5", 30).last, "10.0.0.6");
  assert.equal(subnet.ipToInt("256.1.1.1"), null);
  assert.equal(subnet.ipToInt("10.0.0"), null);
  assert.deepEqual([50, 60, 100, 500].map(subnet.prefixFor), [26, 26, 25, 23]);
});

test("subnetting: generated questions check their own answers", () => {
  const rng = seeded(7);
  for (let n = 0; n < 300; n++) {
    const q = subnet.makeQuestion(rng);
    assert.ok(subnet.check(q, q.answer), JSON.stringify(q));
    assert.ok(!subnet.check(q, "nope"));
    assert.ok(subnet.explain(q).length > 20);
  }
  const needs = subnet.makeQuestion(seeded(1), "needs");
  assert.ok(subnet.check(needs, needs.answer.slice(1)), "accepts 26 as well as /26");
  const hosts = { type: "hosts", answer: "4094" };
  assert.ok(subnet.check(hosts, "4,094"));
});

test("subnet calculator: classes, address types, masks and CIDR parsing", () => {
  const ip = subnet.ipToInt;
  assert.deepEqual(["10.1.1.1", "172.16.0.1", "192.168.1.1", "224.0.0.5", "250.0.0.1"].map(a => subnet.ipClass(ip(a)).cls), ["A", "B", "C", "D", "E"]);
  assert.deepEqual([8, 16, 24].map(p => p), ["10.0.0.1", "130.1.1.1", "200.1.1.1"].map(a => subnet.ipClass(ip(a)).defaultPrefix));
  const kind = a => subnet.classify(ip(a)).label;
  assert.equal(kind("10.0.0.1"), "Private (RFC 1918)");
  assert.equal(kind("172.31.255.1"), "Private (RFC 1918)");
  assert.equal(kind("172.32.0.1"), "Public", "172.32 is outside the private /12");
  assert.equal(kind("169.254.10.10"), "APIPA / link-local");
  assert.equal(kind("127.0.0.1"), "Loopback");
  assert.equal(kind("100.64.0.1"), "Carrier-grade NAT");
  assert.equal(kind("8.8.8.8"), "Public");
  assert.deepEqual(["255.255.255.192", "255.255.240.0", "255.0.0.0", "255.255.255.255"].map(subnet.maskToPrefix), [26, 20, 8, 32]);
  assert.deepEqual(["255.0.255.0", "255.255.255.193", "nope"].map(subnet.maskToPrefix), [null, null, null]);
  assert.deepEqual(subnet.parseCidr("10.0.0.0/22"), { addr: ip("10.0.0.0"), prefix: 22 });
  assert.equal(subnet.parseCidr("10.0.0.5").prefix, null);
  assert.equal(subnet.parseCidr("10.0.0.0/33"), null);
  const p31 = subnet.subnetInfo("10.0.0.4", 31), p32 = subnet.subnetInfo("10.0.0.4", 32);
  assert.deepEqual([p31.hosts, p31.first, p31.last, p32.hosts, p32.first], [2, "10.0.0.4", "10.0.0.5", 1, "10.0.0.4"]);
});

test("subnet calculator: splitting a network borrows the right bits", () => {
  const r = subnet.splitNetwork(subnet.ipToInt("192.168.1.77"), 24, 6);
  assert.equal(r.prefix, 27, "6 subnets needs 3 bits (8 subnets)");
  assert.equal(r.total, 8);
  assert.deepEqual(r.subnets.map(x => x.network), ["0", "32", "64", "96", "128", "160", "192", "224"].map(n => "192.168.1." + n));
  assert.equal(r.subnets[7].broadcast, "192.168.1.255");
  assert.equal(subnet.splitNetwork(subnet.ipToInt("10.0.0.0"), 30, 8), null);
  assert.equal(subnet.splitNetwork(subnet.ipToInt("10.0.0.0"), 8, 64, 64).subnets.length, 64);
});

test("device library: every device drawn anywhere exists and explains itself", async () => {
  const lib = await import("../static/js/hw.js");
  for (const k of Object.keys(lib.HW)) assert.ok(lib.HW_INFO[k] && lib.HW_INFO[k][1].length > 20, k);
  const used = new Set();
  for (const t of lab("topologies").topologies) for (const n of t.nodes) if (n.kind !== "tap") used.add(n.kind);
  const missions = (await import("node:fs")).readdirSync(new URL("../content/missions/", import.meta.url));
  for (const f of missions) for (const d of Object.values(JSON.parse(readFileSync(new URL(`../content/missions/${f}`, import.meta.url), "utf8")).devices)) used.add(d.kind);
  for (const k of used) assert.ok(lib.HW[k], `no drawing for "${k}"`);
  assert.match(lib.hw("router", 10, 20, 0.5, "me"), /class="hw hw-k-router me" transform="translate\(10,20\) scale\(0.5\)"/);
});

import * as nettools from "../static/js/labs/nettools.js";

test("nettools: tools reflect the simulated network and complete the objectives", () => {
  const L = lab("net-detective"), sh = nettools.createNetShell(L);
  assert.match(sh.run("ipconfig").out, /192\.168\.1\.50/);
  assert.ok(!sh.run("ping 192.168.1.1").error, "the gateway is up");
  assert.ok(!sh.run("ping 8.8.8.8").error, "the internet is reachable");
  assert.match(sh.run("nslookup www.example.com").out, /timed out/i, "the configured DNS server is down");
  assert.match(sh.run("nslookup www.example.com 8.8.8.8").out, /93\.184\.216\.34/, "a working DNS server resolves it");
  assert.match(sh.run("cat notes.txt").out, /dns01/);
  for (const t of L.tasks) assert.ok(sh.isDone(t.check), t.id);
});

test("nettools: a traceroute to an unreachable WAN stops partway", () => {
  const L = JSON.parse(JSON.stringify(lab("net-detective")));
  L.net.wanDown = true;
  const sh = nettools.createNetShell(L);
  const out = sh.run("tracert 8.8.8.8").out;
  assert.match(out, /\* \* \*/, "later hops time out");
  assert.ok(!/Trace complete/.test(out));
});

test("nettools: recon only reports inside the authorised scope", () => {
  const L = lab("recon-basics"), sh = nettools.createNetShell(L);
  assert.equal(L.net.scope, "10.10.10.0/24");
  const sweep = sh.run("discover 10.10.10.0/24");
  assert.ok(!sweep.error && /10\.10\.10\.20/.test(sweep.out), "in-scope hosts are found");
  assert.ok(!/10\.10\.20\.5/.test(sweep.out), "a /24 sweep never reaches another subnet");
  sh.run("cat scope.txt");
  const oos = sh.run("discover 10.10.20.5");
  assert.ok(oos.error && /outside the authorised scope/.test(oos.out), "out-of-scope targets are refused");
  assert.ok(!sh.run("discover 10.10.10.20").error);
  for (const t of L.tasks) assert.ok(sh.isDone(t.check), t.id);
});

test("nettools: inCidr matches only addresses inside the range", () => {
  assert.ok(nettools.inCidr("10.10.10.20", "10.10.10.0/24"));
  assert.ok(!nettools.inCidr("10.10.20.5", "10.10.10.0/24"));
  assert.ok(nettools.inCidr("192.168.1.255", "192.168.1.0/24"));
});

import * as handshake from "../static/js/labs/handshake.js";

test("SYN flood fills the half-open queue until clients are refused", () => {
  const srv = handshake.createServer({ slots: 4, holdTicks: 100 });
  assert.equal(srv.syn("client"), "connect", "a normal client completes the handshake");
  assert.equal(srv.state.established, 1);
  for (let n = 0; n < 4; n++) srv.syn("flood");          // flood fills every slot
  assert.ok(srv.state.full, "the queue is full of half-open connections");
  assert.equal(srv.syn("client"), "dropped", "a real client is now refused");
  assert.ok(srv.state.dropped >= 1);
});

test("half-open connections time out and free their slot", () => {
  const srv = handshake.createServer({ slots: 2, holdTicks: 2 });
  srv.syn("flood"); srv.syn("flood");
  assert.ok(srv.state.full);
  srv.tick(); srv.tick();                                // ttl runs out
  assert.ok(!srv.state.full, "slots free up once the server gives up waiting");
});

test("SYN cookies let real clients through even during a flood", () => {
  const srv = handshake.createServer({ slots: 4, holdTicks: 100 });
  srv.setCookies(true);
  for (let n = 0; n < 50; n++) srv.syn("flood");         // flood does nothing: no slot is held
  assert.equal(srv.state.halfOpen, 0, "no slots are consumed with cookies on");
  assert.equal(srv.syn("client"), "cookie-connect");
  assert.ok(!srv.state.full && srv.state.established === 1);
});
