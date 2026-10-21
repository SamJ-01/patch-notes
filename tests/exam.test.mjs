// Tests for certification practice (static/js/exam.js) against the real question bank.
// Run with:  node --test tests/exam.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ex from "../static/js/exam.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const cert = read("../content/certs/network-plus.json");
const { questions } = read("../content/certs/network-plus-questions.json");
const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("isCorrect needs exactly the right options", () => {
  const multi = questions.find(q => ex.correctCount(q) === 2);
  const right = new Set(multi.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0));
  assert.ok(ex.isCorrect(multi, right));
  assert.ok(!ex.isCorrect(multi, new Set([...right].slice(0, 1))), "half of a choose-two is wrong");
  const wrong = multi.options.findIndex(o => !o.correct);
  assert.ok(!ex.isCorrect(multi, new Set([...right, wrong])), "an extra wrong pick is wrong");
});

test("mock exams follow the domain weights and never repeat a question", () => {
  for (let s = 1; s <= 20; s++) {
    const mock = ex.buildMock(questions, cert.domains, ex.MOCK_SIZE, seeded(s));
    assert.equal(mock.length, ex.MOCK_SIZE);
    assert.equal(new Set(mock.map(q => q.id)).size, mock.length);
    const per = d => mock.filter(q => q.objective[0] === d.id[0]).length;
    for (const d of cert.domains) assert.ok(Math.abs(per(d) - d.weight / 100 * ex.MOCK_SIZE) <= 1, `${d.name}: ${per(d)}`);
  }
});

test("mastery and weak objectives reflect the latest answers", () => {
  const qs = questions.filter(q => q.objective === "2.2");
  assert.equal(ex.mastery(qs, {}).level, "new");
  assert.equal(ex.mastery(qs, { [qs[0].id]: { r: 1, w: 0, last: 1 } }).level, "started");
  assert.equal(ex.mastery(qs, { [qs[0].id]: { r: 1, w: 1, last: 0 } }).level, "weak");
  const all = Object.fromEntries(qs.map(q => [q.id, { r: 1, w: 0, last: 1 }]));
  assert.equal(ex.mastery(qs, all).level, "strong");
  const objs = cert.domains.flatMap(d => d.objectives.map(o => ({ ...o, weight: d.weight })));
  const weak = ex.weakObjectives(objs, questions, { [qs[0].id]: { r: 0, w: 1, last: 0 } });
  assert.equal(weak[0].o.id, "2.2", "an objective answered wrong comes first");
});

test("readiness starts empty, stays honest, and only says ready with a strong mock", () => {
  const none = () => ({ done: 0, total: 0, next: null });
  const fresh = ex.readiness({ domains: cert.domains, questions, stats: {}, progressOf: none });
  assert.equal(fresh.verdict, "start");
  assert.equal(fresh.overall, 0);
  assert.equal(fresh.elsewhere, cert.domains.flatMap(d => d.objectives).filter(o => o.coverage === "none").length);

  const allRight = Object.fromEntries(questions.map(q => [q.id, { r: 1, w: 0, last: 1 }]));
  const allDone = () => ({ done: 1, total: 1, next: null });
  const noMock = ex.readiness({ domains: cert.domains, questions, stats: allRight, progressOf: allDone });
  assert.ok(noMock.overall > 0.99);
  assert.equal(noMock.verdict, "close", "a perfect score without a mock isn't ready");
  assert.ok(noMock.plan.some(p => p.kind === "mock"), "the plan asks for a mock");
  const lowMock = ex.readiness({ domains: cert.domains, questions, stats: allRight, progressOf: allDone, mocks: [{ d: "2026-10-21", score: 10, total: 20 }] });
  assert.equal(lowMock.verdict, "close");
  const ready = ex.readiness({ domains: cert.domains, questions, stats: allRight, progressOf: allDone, mocks: [{ d: "2026-10-21", score: 17, total: 20 }] });
  assert.equal(ready.verdict, "ready");

  // One weak domain blocks "ready" even when the overall score is high.
  const d5 = new Set(questions.filter(q => q.objective[0] === "5").map(q => q.id));
  const weak5 = Object.fromEntries(questions.map(q => [q.id, { r: 1, w: 0, last: d5.has(q.id) ? 0 : 1 }]));
  const blocked = ex.readiness({ domains: cert.domains, questions, stats: weak5, progressOf: allDone, mocks: [{ d: "2026-10-21", score: 18, total: 20 }] });
  assert.notEqual(blocked.verdict, "ready");
  assert.ok(blocked.rows.find(r => r.d.id === "5.0").score < ex.READY.domain);
  assert.equal(blocked.plan[0].kind, "drill");
  assert.equal(blocked.plan[0].why, "wrong");
  assert.equal(blocked.plan[0].o.id[0], "5", "the plan starts with what was answered wrong");
});

test("the study plan has at most five steps and never repeats an objective", () => {
  const next = { label: "A lesson", href: "#lesson-x" };
  const stats = Object.fromEntries(questions.filter((_, i) => i % 3 === 0).map((q, i) => [q.id, { r: 0, w: 1, last: i % 2 }]));
  const r = ex.readiness({ domains: cert.domains, questions, stats, progressOf: () => ({ done: 0, total: 2, next }) });
  assert.ok(r.plan.length <= 5 && r.plan.length > 0);
  const ids = r.plan.filter(p => p.o).map(p => p.o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the study plan mixes hands-on steps in, even with many wrong answers", () => {
  const next = { label: "A lab", href: "#lab-x" };
  const stats = Object.fromEntries(questions.map(q => [q.id, { r: 0, w: 1, last: 0 }]));
  const r = ex.readiness({ domains: cert.domains, questions, stats, progressOf: () => ({ done: 0, total: 1, next }) });
  assert.ok(r.plan.filter(p => p.why === "wrong").length <= 3);
  assert.ok(r.plan.some(p => p.kind === "activity"));
});

test("Security+: every domain has questions, and a mock follows the domain weights", () => {
  const sp = read("../content/certs/security-plus.json"), bank = read("../content/certs/security-plus-questions.json").questions;
  for (const d of sp.domains) assert.ok(bank.filter(q => q.objective === d.id).length >= Math.ceil((d.weight / 100) * ex.MOCK_SIZE), `domain ${d.id} can fill its share of a mock`);
  const mock = ex.buildMock(bank, sp.domains, ex.MOCK_SIZE, seeded(7));
  assert.equal(mock.length, ex.MOCK_SIZE);
  assert.equal(new Set(mock.map(q => q.id)).size, ex.MOCK_SIZE, "no repeats");
});
