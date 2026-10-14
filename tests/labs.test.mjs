// Tests for the self-contained labs: OSI model, Linux terminal and network topologies.
// Run with:  node --test tests/labs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as osi from "../static/js/labs/osi.js";
import * as term from "../static/js/labs/terminal.js";
import * as topo from "../static/js/labs/topology.js";

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
  for (const c of ["whoami", "pwd", "ls -a", "cat notes.txt", "cd /var/log", 'grep "Failed password" auth.log', "find / -name backup.sh",
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
