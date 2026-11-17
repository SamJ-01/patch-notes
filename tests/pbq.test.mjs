// Tests for performance-based questions (static/js/pbq.js, content/pbq/<cert>.json): every PBQ is well formed,
// solvable from its own content (its model answer scores 100%), not solved at the start, and marked part by part.
// Run with:  node --test tests/pbq.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { grade, modelAnswer, startOrder, cliNet, KINDS, SUBNET_FIELDS } from "../static/js/pbq.js";

const root = new URL("..", import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const labs = read("content/labs.json");
const files = readdirSync(new URL("content/pbq/", root)).filter(f => f.endsWith(".json"));
const sets = files.map(f => ({ file: f, ...read("content/pbq/" + f) }));
const all = sets.flatMap(s => s.pbqs.map(q => ({ ...q, cert: s.cert })));
const objectives = cert => new Set(read(`content/certs/${cert}.json`).domains.flatMap(d => d.objectives.map(o => o.id)));
// Answer a cli PBQ: run the model's commands (or none) on a fresh copy of its starting network.
const cliAnswer = (q, cmds = q.model) => { const net = cliNet(q, labs.find(l => l.id === q.lab)); for (const [d, list] of Object.entries(cmds)) list.forEach(c => net.exec(d, c)); return { net }; };
const modelOf = q => (q.kind === "cli" ? cliAnswer(q) : modelAnswer(q));

test("every exam's PBQs are well formed and mapped to real objectives", () => {
  assert.deepEqual(files.sort(), ["network-plus.json", "pentest-plus.json", "security-plus.json"]);
  const ids = all.map(q => q.id);
  assert.equal(ids.length, new Set(ids).size, "PBQ ids are unique");
  for (const s of sets) assert.match(s.note, /not real exam questions/, s.file);
  for (const q of all) {
    assert.match(q.id, /^[a-z]{2}-pbq-[a-z0-9-]+$/, q.id);
    assert.ok(KINDS[q.kind], `${q.id}: kind ${q.kind}`);
    assert.ok(q.title && q.scenario && q.minutes >= 2 && q.minutes <= 15, q.id);
    const objs = objectives(q.cert);
    assert.ok(q.objectives.length && q.objectives.every(o => objs.has(o)), `${q.id}: objectives ${q.objectives}`);
    assert.ok(!JSON.stringify(q).includes("—"), `${q.id}: no em dashes`);
    if (q.kind === "match") {
      assert.equal(new Set(q.choices).size, q.choices.length, `${q.id}: choices unique`);
      assert.equal(new Set(q.items.map(i => i.id)).size, q.items.length, `${q.id}: item ids unique`);
      for (const it of q.items) { assert.ok(q.choices.includes(it.answer), `${q.id}/${it.id}: answer is a choice`); assert.ok(it.why, `${q.id}/${it.id}: why`); }
    }
    if (q.kind === "order") { assert.ok(q.steps.length >= 4); for (const st of q.steps) assert.ok(st.text && st.why, q.id); }
    if (q.kind === "subnet") { assert.ok(q.fields.every(f => SUBNET_FIELDS[f])); for (const r of q.rows) assert.ok(r.prefix >= 8 && r.prefix <= 30, q.id); }
    if (q.kind === "firewall") {
      for (const r of q.model) for (const f of ["proto", "src", "dst", "port"]) assert.ok(q.options[f].includes(r[f]), `${q.id}: the model's ${f} ${r[f]} is an option`);
      assert.ok(q.model.length <= q.slots, q.id);
      for (const t of q.tests) assert.ok(["allow", "deny"].includes(t.expected) && t.why, `${q.id}: ${t.label}`);
      // Test traffic uses documentation or private addresses only.
      for (const t of q.tests) assert.match(t.src, /^(203\.0\.113|198\.51\.100|192\.0\.2|10)\./, `${q.id}: ${t.src}`);
    }
    if (q.kind === "cli") {
      assert.ok(labs.find(l => l.id === q.lab), `${q.id}: lab ${q.lab}`);
      for (const t of q.tasks) assert.ok(t.text && t.check && t.why, q.id);
      assert.ok(Object.keys(q.model).every(d => q.devices.includes(d)), `${q.id}: the model only uses offered devices`);
    }
  }
});

test("every PBQ's model answer scores 100%, and its starting state doesn't", () => {
  for (const q of all) {
    const g = grade(q, modelOf(q));
    assert.equal(g.pct, 100, `${q.id}: ${g.parts.filter(p => !p.ok).map(p => p.label).join("; ")}`);
    const blank = q.kind === "cli" ? cliAnswer(q, {}) : q.kind === "order" ? startOrder(q) : q.kind === "firewall" ? [] : {};
    assert.ok(grade(q, blank).pct < 100, `${q.id}: already solved before you start`);
  }
});

test("order: the starting order is fixed per PBQ and never already right", () => {
  for (const q of all.filter(x => x.kind === "order")) {
    const a = startOrder(q);
    assert.deepEqual(a, startOrder(q), "same every visit");
    assert.deepEqual([...a].sort((x, y) => x - y), q.steps.map((_, i) => i), "a permutation");
    assert.notDeepEqual(a, q.steps.map((_, i) => i));
  }
});

test("partial credit: each part is marked on its own", () => {
  const ports = all.find(q => q.id === "np-pbq-ports"), m = modelAnswer(ports);
  const g = grade(ports, { ...m, ssh: "23", rdp: "445" });
  assert.equal(g.right, ports.items.length - 2);
  assert.equal(g.pct, Math.round((ports.items.length - 2) / ports.items.length * 100));
  assert.equal(g.parts.find(p => p.id === "ssh").want, "22");
  // Answers are compared ignoring case and spaces.
  assert.equal(grade(ports, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, ` ${v} `]))).pct, 100);
});

test("subnet: answers are worked out, not stored, and checked per cell", () => {
  const q = all.find(x => x.kind === "subnet"), m = modelAnswer(q);
  assert.equal(m["0.network"], "192.168.10.64"); assert.equal(m["0.broadcast"], "192.168.10.127");
  assert.equal(m["0.hosts"], "62"); assert.equal(m["2.network"], "172.16.44.0"); assert.equal(m["2.last"], "172.16.47.254");
  const g = grade(q, { ...m, "1.hosts": "128" });
  assert.equal(g.total - g.right, 1, "counting the network and broadcast as hosts is one wrong cell");
  assert.equal(grade(q, { ...m, "2.hosts": "1,022" }).pct, 100, "a thousands comma is fine");
});

test("firewall: graded by sending the test traffic through the rules, top down", () => {
  const q = all.find(x => x.kind === "firewall"), m = modelAnswer(q);
  // Deny everything first and nothing gets through, whatever follows.
  const denyFirst = [m.at(-1), ...m.slice(0, -1)];
  const g = grade(q, denyFirst);
  assert.ok(g.parts.filter(p => p.want === "allow").every(p => !p.ok), "a deny-all at the top blocks the allowed traffic");
  // Without the explicit deny, the traffic still behaves (the default deny) but the policy part fails.
  const noDeny = grade(q, m.slice(0, -1));
  assert.equal(noDeny.total - noDeny.right, 1);
  assert.match(noDeny.parts.find(p => !p.ok).label, /explicit deny/);
  // SSH from anywhere lets the internet in: the test that catches it fails.
  const wide = grade(q, [m[0], { ...m[1], src: "any" }, m[2]]);
  assert.ok(wide.parts.some(p => !p.ok && /SSH from the internet/.test(p.label)));
  assert.equal(grade(q, []).right, 0, "no rules, no credit (not even for traffic the default deny blocks)");
  // Half-filled rows are ignored rather than treated as "any".
  assert.equal(grade(q, [...m.slice(0, 2), { action: "allow", proto: "", src: "", dst: "", port: "" }, m[2]]).pct, 100);
});

test("cli: the broken network fails until it's fixed and saved", () => {
  const q = all.find(x => x.kind === "cli");
  const fixedNotSaved = { ...q.model, S3: q.model.S3.filter(c => !/^(copy|wr)/.test(c)) };
  const g = grade(q, cliAnswer(q, fixedNotSaved));
  assert.equal(g.total - g.right, 1, "only the save is missing");
  // Saving, then changing something, counts as unsaved again.
  const later = cliAnswer(q); later.net.exec("S3", "conf t"); later.net.exec("S3", "int f0/2"); later.net.exec("S3", "desc spare"); later.net.exec("S3", "end");
  assert.ok(!grade(q, later).parts.at(-1).ok);
  // Fixing only the access port isn't enough: the trunk is still down, so PC4 can't reach PC1.
  const half = grade(q, cliAnswer(q, { S3: ["en", "conf t", "int f0/11", "sw acc vl 10", "end"], PC4: ["ping 10.10.10.11"] }));
  assert.ok(!half.parts.find(p => /ping/.test(p.label)).ok);
});
