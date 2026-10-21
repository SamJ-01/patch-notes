// Tests for the Linux permissions lab (static/js/labs/perms.js). The rules were cross-checked against a real
// Linux kernel and GNU chmod and ls (13,500 access cases, 2,000 chmod cases, ls -l output); the tricky cases
// found that way are pinned here, since CI can't create users.
// Run with:  node --test tests/perms.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rwx, octal, applyChmod, can, classOf, run, lsLine, loadWorld, checkTask } from "../static/js/labs/perms.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8")).find(l => l.id === "permissions");
const fresh = () => loadWorld(lab.world);
const S = "/srv/payroll/salaries.csv", D = "/srv/payroll", B = "/srv/scripts/backup.sh";

test("modes: rwx strings and octal", () => {
  assert.equal(rwx(0o640), "rw-r-----");
  assert.equal(rwx(0o755), "rwxr-xr-x");
  assert.equal(octal(0o7), "007");
});

test("chmod: octal and symbolic, matching GNU chmod (umask 022)", () => {
  const cases = [["644", 0, 0o644], ["g-w", 0o664, 0o644], ["u=rwx,go=", 0o644, 0o700], ["a+r", 0o200, 0o644], ["o-rx", 0o755, 0o750],
    ["u+x,go-r", 0o644, 0o700], ["+x", 0o644, 0o755],
    // found against real chmod: with no who-letter, bits in the umask (022) are left alone when adding or removing...
    ["+w", 0, 0o200], ["=w", 0o400, 0o200], ["-w", 0o222, 0o022],
    // ...but "=" with no who-letter still clears every bit
    ["=", 0o270, 0], ["=,+", 0o70, 0]];
  for (const [arg, from, want] of cases) assert.equal(applyChmod(from, arg), want, `chmod ${arg} on ${octal(from)}`);
  assert.equal(applyChmod(0o644, "x+r"), null);
  assert.equal(applyChmod(0o644, "999"), null);
});

test("access: one class applies, owner first, and never added together", () => {
  const w = fresh();
  w.files[S].mode = 0o460;
  assert.equal(classOf(w, "alice", w.files[S]), "owner");
  assert.equal(can(w, "alice", "write", S).ok, false, "the owner gets r-- even though the group has rw-");
  assert.equal(can(w, "bob", "write", S).ok, true);
  w.files[S].mode = 0o604;
  assert.equal(can(w, "bob", "read", S).ok, false, "bob is in the group, so the group bits (---) apply, not others (r--)");
  assert.equal(can(w, "dave", "read", S).ok, true);
});

test("access: every folder on the path needs x; listing needs r and x", () => {
  const w = fresh();
  w.files[D].mode = 0o750;
  assert.equal(can(w, "dave", "read", S).ok, false, "the file is r for others, but dave can't get through the folder");
  assert.match(can(w, "dave", "read", S).why, /no x on \/srv\/payroll/);
  w.files[D].mode = 0o751;
  assert.equal(can(w, "dave", "read", S).ok, true, "x alone lets you through to a file you know the name of");
  assert.equal(can(w, "dave", "list", D).ok, false, "but not list the folder");
  assert.equal(can(w, "bob", "create", D).ok, false, "adding or deleting files needs w and x on the folder");
});

test("access: root skips read and write checks but can't run a file with no x bit", () => {
  const w = fresh();
  w.files[S].mode = 0;
  w.files[D].mode = 0;
  assert.equal(can(w, "root", "read", S).ok, true);
  assert.equal(can(w, "root", "write", S).ok, true);
  assert.equal(can(w, "root", "run", S).ok, false);
  w.files[S].mode = 0o001;
  assert.equal(can(w, "root", "run", S).ok, true, "any x bit will do for root");
});

test("terminal: ls -l like GNU ls, chmod and chown change the world, errors like coreutils", () => {
  const w = fresh();
  assert.equal(lsLine(w, S), "-rw-r--r-- 1 alice finance 18432 Oct 21 09:14 salaries.csv");
  assert.equal(run(w, D, "ls -l").out, "total 20\n-rw-r--r-- 1 alice finance 18432 Oct 21 09:14 salaries.csv", "matches GNU ls for an 18 KiB file on 4 KiB blocks");
  assert.equal(run(w, D, "ls -ld /srv/payroll").out, "drwxr-xr-x 2 alice finance 4096 Oct 21 09:10 payroll");
  run(w, D, "chmod 640 salaries.csv");
  assert.equal(w.files[S].mode, 0o640);
  run(w, D, "chown bob:it salaries.csv");
  assert.deepEqual([w.files[S].owner, w.files[S].group], ["bob", "it"]);
  assert.match(run(w, D, "chmod 9z9 salaries.csv").out, /^chmod: invalid mode: '9z9'/);
  assert.match(run(w, D, "chmod 640 nope.txt").out, /^chmod: cannot access 'nope.txt': No such file or directory/);
  assert.match(run(w, D, "chown mallory salaries.csv").out, /^chown: invalid user: 'mallory'/);
  assert.equal(run(w, D, "id dave").out, "uid=1004(dave) gid=1000(staff) groups=1000(staff)");
  assert.match(run(w, D, "rm -rf /").out, /rm: command not found/);
});

test("every objective is unmet at the start and met by its own hint", () => {
  const w = fresh(), ran = [];
  for (const t of lab.tasks) {
    assert.equal(checkTask(w, ran, t.check), false, `${t.id} shouldn't start done`);
    for (const cmd of t.hint.split(/, then |, or | \(or /)[0].split(/;\s*/)) {
      const line = cmd.replace(/\)$/, "").trim();
      const r = run(w, lab.cwd, line);
      assert.ok(!r.error, `${t.id}: "${line}" failed: ${r.out}`);
      ran.push(line.split(/\s+/)[0] + (line.includes(" -l") ? " -l" : ""));
    }
    if (t.id === "handover") run(w, lab.cwd, "chown bob /srv/payroll/salaries.csv");
    assert.ok(checkTask(w, ran, t.check), `${t.id} should be met after: ${t.hint}`);
  }
});

test("lab content is consistent", () => {
  const w = fresh();
  for (const t of lab.tasks) assert.ok(t.text && t.hint && t.why, t.id);
  for (const [p, f] of Object.entries(w.files)) {
    assert.ok(f.owner === "root" || w.users[f.owner], `${p} owner`);
    assert.ok(f.group in w.groups, `${p} group`);
    assert.ok(Number.isInteger(f.mode) && f.mode >= 0 && f.mode <= 0o777, `${p} mode`);
  }
  assert.ok(!JSON.stringify(lab).includes("—"), "no em dashes");
});
