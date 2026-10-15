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
