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

test("every cert: each domain has twice its share of a mock (so a second mock isn't mostly repeats), and a mock follows the weights", () => {
  for (const id of ["network-plus", "security-plus", "pentest-plus"]) {
    const c = read(`../content/certs/${id}.json`), bank = read(`../content/certs/${id}-questions.json`).questions;
    for (const d of c.domains) {
      const have = bank.filter(q => q.objective.split(".")[0] === d.id.split(".")[0]).length, share = Math.ceil((d.weight / 100) * ex.MOCK_SIZE);
      assert.ok(have >= 2 * share, `${id} domain ${d.id}: ${have} questions, a mock draws up to ${share}`);
    }
    const mock = ex.buildMock(bank, c.domains, ex.MOCK_SIZE, seeded(7));
    assert.equal(mock.length, ex.MOCK_SIZE);
    assert.equal(new Set(mock.map(q => q.id)).size, ex.MOCK_SIZE, "no repeats");
  }
});

test("mock options: lengths the bank can fill, safe settings, and only exam conditions count as real", () => {
  for (const id of ["network-plus", "security-plus", "pentest-plus"]) {
    const c = read(`../content/certs/${id}.json`), bank = read(`../content/certs/${id}-questions.json`).questions;
    const lengths = ex.mockLengths(bank, c.domains);
    assert.ok(lengths.includes(ex.MOCK_SIZE), `${id}: the usual 20-question mock is always on offer`);
    for (const n of lengths) {
      const m = ex.buildMock(bank, c.domains, n, seeded(n));
      assert.equal(m.length, n, `${id}: a ${n}-question mock is full`);
      assert.equal(new Set(m.map(q => q.id)).size, n, `${id}: no repeats in ${n}`);
    }
    for (const n of ex.MOCK_LENGTHS.filter(n => !lengths.includes(n))) assert.ok(ex.buildMock(bank, c.domains, n, seeded(1)).length < n, `${id}: ${n} is left out only when it can't be filled`);
  }
  const sp = read("../content/certs/security-plus.json"), spBank = read("../content/certs/security-plus-questions.json").questions;
  assert.ok(ex.mockLengths(spBank, sp.domains).includes(90), "Security+ offers a full-length 90-question mock");
  assert.deepEqual(ex.mockSettings({}), { n: 20, timed: true, feedback: "end", minutes: 20, real: true }, "the default is exam conditions");
  assert.deepEqual(ex.mockSettings({ n: 90 }), { n: 90, timed: true, feedback: "end", minutes: 90, real: true }, "exam pace: one minute a question");
  assert.equal(ex.mockSettings({ n: 45, timed: false }).minutes, null, "untimed has no clock");
  assert.equal(ex.mockSettings({ n: 45, timed: false }).real, false);
  assert.equal(ex.mockSettings({ feedback: "each" }).real, false, "instant feedback is practice, not exam conditions");
  assert.equal(ex.mockSettings({ n: 10 }).real, false, "a 10-question mock is too short to count");
  assert.equal(ex.mockSettings({ n: 90 }, [10, 20, 45]).n, 20, "a saved length the bank can't fill falls back to 20");
  assert.equal(ex.mockSettings({ n: "<b>" }).n, 20);
  assert.equal(ex.mockSettings({ feedback: "<script>" }).feedback, "end");
});

test("readiness ignores practice-mode mocks", () => {
  const stats = Object.fromEntries(questions.map(q => [q.id, { r: 1, w: 0, last: 1 }]));
  const base = { domains: cert.domains, questions, stats, progressOf: () => ({ done: 1, total: 1, next: null }) };
  const real = ex.readiness({ ...base, mocks: [{ d: "2026-11-01", score: 18, total: 20 }] });
  assert.equal(real.verdict, "ready");
  const after = ex.readiness({ ...base, mocks: [{ d: "2026-11-01", score: 18, total: 20 }, { d: "2026-11-02", score: 2, total: 10, practice: 1 }] });
  assert.equal(after.lastMock.score, 18, "a practice mock doesn't replace the last real one");
  assert.equal(after.verdict, "ready");
  const onlyPractice = ex.readiness({ ...base, mocks: [{ d: "2026-11-02", score: 10, total: 10, practice: 1 }] });
  assert.equal(onlyPractice.mockPct, null, "practice mocks alone don't count as a mock");
  assert.notEqual(onlyPractice.verdict, "ready");
});

test("weekPlan: weakest and heaviest objectives first, the last week kept for mocks", () => {
  const obj = (id, score, weight) => ({ o: { id, title: "T" + id }, score, weight });
  const rows = [{ objs: [obj("1.1", 0.9, 6), obj("1.2", null, 6), obj("1.3", 0.2, 6)] }, { objs: [obj("2.1", 0.5, 11), obj("2.2", null, 11), obj("2.3", 0.75, 11)] }];
  const p = ex.weekPlan({ examDate: "2026-12-07", today: "2026-11-16", rows });
  assert.equal(p.days, 21);
  assert.equal(p.weeks.length, 3);
  const studied = p.weeks.flatMap(w => w.focus.map(o => o.id));
  assert.deepEqual(studied, ["2.2", "1.2", "1.3", "2.1"], "nothing scored first (heaviest first), then lowest score; strong ones (70%+) left out");
  assert.deepEqual(p.weeks.map(w => w.mocks), [false, false, true]);
  assert.equal(p.weeks[2].focus.length, 0, "the last week is for mocks and revision");
  assert.equal(p.weeks[0].from, "2026-11-16"); assert.equal(p.weeks[2].to, "2026-12-07", "the plan ends on the exam day");
  const one = ex.weekPlan({ examDate: "2026-11-19", today: "2026-11-16", rows });
  assert.equal(one.weeks.length, 1); assert.ok(one.weeks[0].mocks && one.weeks[0].focus.length === 4, "one week left: study and a mock");
  assert.ok(ex.weekPlan({ examDate: "2026-11-10", today: "2026-11-16", rows }).past);
  assert.equal(ex.weekPlan({ examDate: "<script>", today: "2026-11-16", rows }), null);
  assert.equal(ex.weekPlan({ examDate: "2030-01-01", today: "2026-11-16", rows }).weeks.length, 52, "capped at a year of weeks");
});
