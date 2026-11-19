// Guided mode (static/js/labs/walk.js): following only what it suggests completes every objective of both VLAN labs,
// from a fresh start, with no command rejected along the way.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modeOf, nextCommand, steps, same, opensSub } from "../static/js/labs/walk.js";
import { createNet } from "../static/js/labs/vlan.js";

const L = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url))), labs = (L.labs || L);

test("modes are read from the prompt", () => {
  assert.equal(modeOf("S1>"), "user"); assert.equal(modeOf("S1#"), "priv"); assert.equal(modeOf("S1(config)#"), "config");
  assert.equal(modeOf("S1(config-if)#"), "sub"); assert.equal(modeOf("R1(config-ext-nacl)#"), "sub"); assert.equal(modeOf("C:\\>"), "pc");
});
test("what people type matches the walk's command", () => {
  assert.ok(same("sh vl br", "show vlan brief")); assert.ok(same("int fa0/11", "interface fa0/11")); assert.ok(same("conf t", "configure terminal"));
  assert.ok(same("sw mode acc", "switchport mode access")); assert.ok(same("interface range gi0/1-2", "interface range gi0/1 - 2"));
  assert.ok(!same("enable show vlan brief", "show vlan brief")); assert.ok(same("ip access-list extended STUDENTS", "ip access-list extended students"));
  assert.ok(opensSub("ip access-list extended STUDENTS") && opensSub("int fa0/11") && opensSub("vlan 10") && !opensSub("show vlan brief"));
});
for (const id of ["vlans", "intervlan"]) test(`guided mode completes every objective of ${id}, nothing rejected`, () => {
  const lab = labs.find(l => l.id === id), net = createNet(lab), inside = {}, done = new Set();
  for (const t of lab.tasks) assert.ok(steps(t).length, `${t.id} has a walk`);
  let guard = 0, last = null;
  for (const t of lab.tasks) {
    const st = steps(t); let k = 0;
    while (!net.isDone(t.check) && k < st.length) {
      assert.ok(guard++ < 400, "runaway");
      const n = nextCommand(st[k], net.prompt(st[k].dev), inside[st[k].dev] || null);
      const res = net.exec(n.dev, n.cmd);
      assert.ok(!res.error, `${id}/${t.id}: "${n.cmd}" on ${n.dev} was rejected: ${res.out}`);
      const m = modeOf(net.prompt(n.dev));
      inside[n.dev] = m === "sub" ? (opensSub(n.cmd) ? n.cmd : inside[n.dev]) : null;  // exactly as the page does
      assert.ok(n.own || !(last && last.dev === n.dev && last.cmd === n.cmd), `${id}/${t.id}: suggested "${n.cmd}" twice in a row`);
      last = n;
      if (n.own) k++;
    }
    assert.ok(net.isDone(t.check), `${id}/${t.id} not complete after its walk`);
    done.add(t.id);
  }
  assert.equal(done.size, lab.tasks.length);
});

test("common mistakes get a plain explanation; normal commands don't", async () => {
  const { explainError, caseSlip } = await import("../static/js/labs/walk.js");
  assert.match(explainError("enable show vlan brief", "S1>"), /enable is a command on its own/);
  assert.match(explainError("staff", "S1(config-vlan)#"), /name Staff/);
  assert.match(explainError("vlan 10 name staff", "S1(config-vlan)#"), /One thing per line/);
  assert.match(explainError("show vlan brief", "S1(config)#"), /do show vlan brief/);
  assert.match(explainError("switchport mode access", "S1(config)#"), /belong to a port/);
  assert.match(explainError("switchport mode access", "S1>"), /user mode/);
  assert.match(explainError("enable", "C:\\>"), /Windows command prompt/);
  assert.match(explainError("vlan 10", "S1#"), /conf t first/);
  assert.equal(explainError("ping 10.10.10.14", "C:\\>"), null);
  assert.equal(explainError("sh vl br", "S1#"), null);
  const t = labs.find(l => l.id === "vlans").tasks.find(x => x.id === "create");
  assert.match(caseSlip("name staff", t), /needs Staff/); assert.equal(caseSlip("name Staff", t), null); assert.equal(caseSlip("na guest", t).includes("Guest"), true);
});

// The Linux terminal lab: same guided pattern, flat shell (every step is typed at the $ prompt).
import * as TERM from "../static/js/labs/terminal.js";
const linux = () => labs.find(l => l.id === "linux-terminal");

test("linux: following the walk completes every objective, nothing rejected, no step suggested twice", () => {
  const L = linux(), sh = TERM.createShell(L), done = new Set();
  for (const t of L.tasks) {
    assert.ok(t.walk?.length && t.why, `${t.id} needs a walk and a why`);
    let k = 0, last = null, guard = 0;
    while (!sh.isDone(t.check) && guard++ < 10) {
      const st = t.walk[k]; assert.ok(st, `${t.id}: walk ran out before the objective was met`);
      assert.equal(st[1], "pc"); assert.ok(st[3]?.trim(), `${t.id}: every step says why`);
      assert.notEqual(st[2], last, `${t.id}: suggested twice`); last = st[2];
      const res = sh.run(st[2]); assert.ok(!res.error || t.id === "tryrun", `${t.id}: ${st[2]} -> ${res.out}`);
      if (!res.error && sh.same(st[2], st[2])) k++;  // as the page: a rejected command never moves the walk
    }
    assert.ok(sh.isDone(t.check), t.id); done.add(t.id);
  }
  assert.equal(done.size, L.tasks.length);
});

test("linux: typing an equivalent command moves the walk on", () => {
  const sh = TERM.createShell(linux());
  assert.ok(sh.same("cat notes.txt", "cat ~/notes.txt"));
  assert.ok(sh.same("ls -a", "ls -a ~"));
  assert.ok(sh.same("ll", "ls -alF ."));
  sh.run("cd /var/log");
  assert.ok(sh.same('grep "Failed password" auth.log', 'grep "Failed password" /var/log/auth.log'));
  assert.ok(sh.same("grep Failed auth.log|wc -l", "grep Failed /var/log/auth.log | wc -l"));
  sh.run("cd /opt/backup");
  assert.ok(sh.same("./backup.sh", "/opt/backup/backup.sh"));
  assert.ok(sh.same("chmod +x backup.sh", "chmod +x /opt/backup/backup.sh"));
  assert.ok(!sh.same("rm /tmp/session.lock", "rm /tmp/old.tmp"));
});

test("linux: common mistakes get a plain explanation", () => {
  const sh = TERM.createShell(linux());
  const tip = line => sh.explain(line, sh.run(line));
  assert.match(tip("dir"), /Windows command.*ls/);
  assert.match(tip("LS"), /lower case/);
  assert.match(tip("cat Notes.txt"), /case-sensitive.*notes\.txt/);
  assert.match(tip("cat auth.log"), /\/var\/log\/auth\.log/);
  assert.match(tip("cd notes.txt"), /cat notes\.txt/);
  assert.match(tip("grpe x notes.txt"), /Did you mean grep/);
  assert.match(tip("sudo ls"), /don't need sudo/);
  assert.match(tip("touch ~/reports/incident.txt"), /mkdir/);
  sh.run("cd /var/log");
  assert.match(tip("grep Failed password auth.log"), /quotes: grep "Failed password" auth\.log/);
  assert.match(tip("grep x |"), /both sides/);
  sh.run("cd /opt/backup");
  assert.match(tip("backup.sh"), /\.\/backup\.sh/);
  assert.match(tip("./backup.sh"), /chmod \+x/);
  assert.match(tip("chmod x backup.sh"), /chmod \+x/);
  assert.match(tip("rm /tmp"), /rm -r/);
  assert.equal(tip("pwd"), null);  // no error, no tip
});

// The network tools labs: same guided pattern; some steps are meant to fail (a dead DNS server, an out-of-scope target),
// so the page moves the walk on whenever the typed line matches the step.
import { createNetShell } from "../static/js/labs/nettools.js";
for (const id of ["net-detective", "recon-basics"]) test(`${id}: following the walk completes every objective`, () => {
  const L = labs.find(l => l.id === id), sh = createNetShell(L);
  assert.ok(L.simplification);
  for (const t of L.tasks) {
    assert.ok(t.walk?.length && t.why && t.hint, `${t.id} needs a walk, a why and a hint`);
    let k = 0;
    while (!sh.isDone(t.check)) { const st = t.walk[k]; assert.ok(st, `${id}/${t.id}: walk ran out`); assert.ok(st[3]?.trim()); const res = sh.run(st[2]); assert.ok(!/command not found|Usage/.test(res.out), st[2]); if (sh.same(st[2], st[2])) k++; }
  }
});

test("network tools: equivalent commands match the walk", () => {
  const sh = createNetShell(labs.find(l => l.id === "net-detective"));
  assert.ok(sh.same("ip a", "ipconfig")); assert.ok(sh.same("ifconfig", "ipconfig"));
  assert.ok(sh.same("ping -c 4 192.168.1.1", "ping 192.168.1.1")); assert.ok(sh.same("ping -n4 8.8.8.8", "ping 8.8.8.8"));
  assert.ok(sh.same("dig @8.8.8.8 www.example.com +short", "nslookup www.example.com 8.8.8.8"));
  assert.ok(sh.same("nslookup WWW.example.com", "host www.example.com"));
  assert.ok(!sh.same("nslookup www.example.com", "nslookup www.example.com 8.8.8.8"));
  assert.ok(sh.same("tracert 8.8.8.8", "traceroute 8.8.8.8"));
});

test("network tools: failures get a plain explanation", () => {
  const nd = createNetShell(labs.find(l => l.id === "net-detective")), tip = (sh, line) => sh.explain(line, sh.run(line));
  assert.match(tip(nd, "nslookup www.example.com"), /didn't answer.*8\.8\.8\.8/);
  assert.match(tip(nd, "ping www.example.com"), /suspect DNS/);
  assert.match(tip(nd, "nslookup nosuch.example.com 8.8.8.8"), /doesn't exist/);
  assert.match(tip(nd, "ping 192.168.1.10"), /own network/);
  assert.match(tip(nd, "cat note.txt"), /notes\.txt/);
  assert.match(tip(nd, "pign 8.8.8.8"), /Did you mean ping/);
  assert.equal(tip(nd, "ping 8.8.8.8"), null);
  const rc = createNetShell(labs.find(l => l.id === "recon-basics"));
  assert.match(tip(rc, "discover 10.10.20.5"), /10\.10\.10\.0 to 10\.10\.10\.255/);
  assert.match(tip(rc, "discover web.lab"), /nslookup/);
});

test("network tools: every name, address and file a walk uses can be found without a hint", () => {
  // The owner found www.example.com and notes.txt only in the hints. Each word a command needs must be in the intro, an
  // objective so far, or output already on screen.
  for (const id of ["net-detective", "recon-basics"]) {
    const L = labs.find(l => l.id === id), sh = createNetShell(L);
    let seen = L.intro + " " + (L.net.scope || "");
    for (const t of L.tasks) {
      seen += " " + t.text;
      for (const st of t.walk) {
        for (const w of st[2].split(/\s+/).slice(1).filter(w => /[.\/]/.test(w))) assert.ok(seen.includes(w), `${id}/${t.id}: "${w}" appears only in the hint`);
        seen += " " + sh.run(st[2]).out;
      }
    }
  }
});

test("net-detective: the fault chain lights link by link and gives the verdict only once DNS is compared", () => {
  const L = labs.find(l => l.id === "net-detective"), sh = createNetShell(L), st = () => L.ladder.links.map(k => sh.probe(k.probe));
  const verdict = () => L.ladder.when.every(([i, w]) => st()[i] === w);
  assert.deepEqual(st(), [null, null, null, null, null, null]);
  sh.run("ping www.example.com"); sh.run("ipconfig"); sh.run("ping 192.168.1.1"); sh.run("ping 8.8.8.8");
  assert.deepEqual(st(), ["bad", "ok", "ok", "ok", null, null]);
  sh.run("nslookup www.example.com 8.8.8.8");
  assert.ok(!verdict(), "one good answer alone proves nothing");
  assert.ok(!sh.isDone(L.tasks.find(t => t.id === "dns").check), "the objective needs the comparison");
  sh.run("dig www.example.com");
  assert.deepEqual(st(), ["bad", "ok", "ok", "ok", "bad", "ok"]);
  assert.ok(verdict() && sh.isDone(L.tasks.find(t => t.id === "dns").check));
  for (const t of L.tasks) assert.ok(t.found, `${t.id} says what it showed`);
});

test("linux: every file and folder the walk uses can be found without a hint", () => {
  const L = linux(), sh = TERM.createShell(L);
  let seen = L.intro;
  for (const t of L.tasks) {
    seen += " " + t.text;
    for (const st of t.walk) {
      for (const w of TERM.tokenize(st[2]).slice(1).filter(w => /[.\/]/.test(w) && !/^[-+]/.test(w)))
        for (const part of w.split("/").filter(p => p && p !== "~")) assert.ok(seen.includes(part), `${t.id}: "${part}" (in ${w}) appears only in the hint`);
      seen += " " + sh.run(st[2]).out;
    }
  }
});

// Three-step hints: nudge, shape, full command.
import { shape, openLevel, more } from "../static/js/labs/walk.js";
import { hintHtml } from "../static/js/labs/guide.js";
test("hints: the shape blanks the values and keeps the command words", () => {
  assert.equal(shape("grep Failed /var/log/auth.log | wc -l"), "grep ____ ____ | wc -l");
  assert.equal(shape("chmod +x /opt/backup/backup.sh"), "chmod +x ____");
  assert.equal(shape("switchport access vlan 10"), "switchport access vlan ____");
  assert.equal(shape("encapsulation dot1Q 10"), "encapsulation dot1Q ____");
  assert.equal(shape("ip access-group STUDENTS in"), "ip access-group ____ in");
  assert.equal(shape("interface range gi0/1 - 2"), "interface range ____ - ____");
  for (const c of ["whoami", "enable", "show vlan brief", "permit ip any any", "/opt/backup/backup.sh"]) assert.equal(shape(c), null, c);
});
test("hints: open on the nudge once per objective, then the shape, skipping empty levels", () => {
  assert.equal(openLevel({ nudge: "x", shaped: true, seen: false }), 1);
  assert.equal(openLevel({ nudge: "x", shaped: true, seen: true }), 2);
  assert.equal(openLevel({ nudge: "x", shaped: false, seen: true }), 3);
  assert.equal(openLevel({ nudge: "", shaped: false, seen: false }), 3);
  assert.equal(more(1, { shaped: true }), 2); assert.equal(more(1, { shaped: false }), 3); assert.equal(more(2, { shaped: true }), 3);
  const step = { cmd: "grep Failed /var/log/auth.log | wc -l", why: "counts" };
  assert.match(hintHtml({ level: 1, nudge: "Search, then count.", step }), /Hint 1 of 3[\s\S]*data-more/);
  assert.ok(!hintHtml({ level: 1, nudge: "Search, then count.", step }).includes("wc -l"), "the nudge level never shows the command");
  assert.match(hintHtml({ level: 2, nudge: "n", step }), /grep ____ ____ \| wc -l/);
  assert.match(hintHtml({ level: 3, nudge: "n", step }), /data-runit/);
  assert.match(hintHtml({ level: 2, nudge: "n", step: { cmd: "whoami", why: "w" } }), /data-runit/, "no shape: straight to the command");
});
test("hints: every objective in the command-line labs has a nudge that doesn't give its command away", () => {
  for (const L of labs.filter(l => (l.tasks || []).some(t => t.walk))) for (const t of L.tasks) {
    assert.ok(t.nudge && t.nudge.length <= 200, `${L.id}/${t.id} nudge`);
    for (const st of t.walk) if (st[2].includes(" ")) assert.ok(!t.nudge.includes(st[2]), `${L.id}/${t.id}: the nudge gives away "${st[2]}"`);
  }
});

// The permissions lab: objectives are judged by the files' final state; a command matches a step by its effect.
import * as PERM from "../static/js/labs/perms.js";
const permLab = () => labs.find(l => l.id === "permissions");
test("permissions: following the walk completes every objective", () => {
  const L = permLab(), world = PERM.loadWorld(L.world), ran = [];
  for (const t of L.tasks) {
    assert.ok(t.walk?.length && t.why && t.nudge && t.found, `${t.id} needs walk, why, nudge, found`);
    for (const st of t.walk) { const r = PERM.run(world, L.cwd, st[2]); assert.ok(!r.error, `${t.id}: ${st[2]} -> ${r.out}`); ran.push(st[2].split(/\s+/)[0] + (st[2].includes(" -l") ? " -l" : "")); }
    assert.ok(PERM.checkTask(world, ran, t.check), t.id);
  }
});
test("permissions: equivalent commands match by what they do", () => {
  const L = permLab(), w = PERM.loadWorld(L.world), same = (a, b) => PERM.sameEffect(w, L.cwd, a, b);
  assert.ok(same("chmod 640 salaries.csv", "chmod 640 /srv/payroll/salaries.csv"));
  assert.ok(same("chmod o-r salaries.csv", "chmod 640 salaries.csv"), "644 minus others' r is 640");
  assert.ok(same("chmod u=rw,g=r,o= salaries.csv", "chmod 640 salaries.csv"));
  assert.ok(!same("chmod 600 salaries.csv", "chmod 640 salaries.csv"));
  assert.ok(same("ls -l", "ls -l /srv/payroll")); assert.ok(!same("ls", "ls -l"));
  assert.ok(same("chown bob /srv/payroll/salaries.csv", "chown bob salaries.csv"));
});
test("permissions: mistakes and risky changes get a plain explanation", () => {
  const L = permLab(), w = PERM.loadWorld(L.world), tip = line => PERM.explainPerm(w, L.cwd, line, PERM.run(w, L.cwd, line));
  assert.match(tip("chmod 840 salaries.csv"), /0 to 7/);
  assert.match(tip("chmod 640"), /mode .* then the file/);
  assert.match(tip("chmod 700 backup.sh"), /full path/);
  assert.match(tip("chown dan salaries.csv"), /alice, bob, carol, dave/);
  assert.match(tip("chmod rw salaries.csv"), /o-r/);
  assert.match(tip("chmod 666 salaries.csv"), /anyone on the server can change/);
  assert.equal(tip("chmod 640 salaries.csv"), null);
});
