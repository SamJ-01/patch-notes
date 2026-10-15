// Certification practice: objective drills, weak-spot revision and a timed mock exam.
// Questions are data (content/certs/*-questions.json); every option carries its own explanation.
// The pure helpers (isCorrect, buildMock, mastery, weakObjectives) are tested in tests/exam.test.mjs.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (arr, rand = Math.random) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const MOCK_SIZE = 20, MOCK_MINUTES = 20;  // the real exam is up to 90 questions in 90 minutes: same pace

// Right only if exactly the correct options were chosen (so "choose two" needs both, and nothing else).
export function isCorrect(q, chosen) {
  const want = q.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0);
  return chosen.size === want.length && want.every(i => chosen.has(i));
}
export const correctCount = q => q.options.filter(o => o.correct).length;

// A mock exam that mirrors the domain weights: allocate questions by weight (largest remainder),
// then pick at random within each domain, never repeating a question.
export function buildMock(questions, domains, n = MOCK_SIZE, rand = Math.random) {
  const byDomain = d => questions.filter(q => q.objective.split(".")[0] === d.id.split(".")[0]);
  const raw = domains.map(d => ({ d, exact: (d.weight / 100) * n }));
  const alloc = raw.map(r => ({ ...r, k: Math.floor(r.exact) }));
  let left = n - alloc.reduce((s, r) => s + r.k, 0);
  for (const r of alloc.slice().sort((a, b) => (b.exact % 1) - (a.exact % 1))) { if (left <= 0) break; r.k++; left--; }
  return shuffle(alloc.flatMap(r => shuffle(byDomain(r.d), rand).slice(0, r.k)), rand);
}

// Mastery of one objective from the latest answer to each of its questions.
// stats: { [questionId]: { r: timesRight, w: timesWrong, last: 1|0 } }
export function mastery(qs, stats) {
  const seen = qs.filter(q => stats[q.id]);
  const right = seen.filter(q => stats[q.id].last === 1).length;
  const level = !seen.length ? "new" : right < seen.length ? "weak" : seen.length < qs.length ? "started" : "strong";
  return { answered: seen.length, right, total: qs.length, level };
}
// Objectives to revise: anything got wrong last time first, then the least practised, heaviest domains first.
export function weakObjectives(objectives, questions, stats) {
  return objectives.map(o => ({ o, m: mastery(questions.filter(q => q.objective === o.id), stats) }))
    .filter(x => x.m.total && x.m.level !== "strong")
    .sort((a, b) => (a.m.level === "weak" ? 0 : 1) - (b.m.level === "weak" ? 0 : 1) || a.m.answered - b.m.answered || b.o.weight - a.o.weight);
}

// ---------- the practice screen
// opts: { title, questions, mode: "drill"|"mock", objectiveName(id), onAnswer(q, right), onFinish(summary), onExit() }
export function mount(el, { title, questions, mode = "drill", objectiveName = id => id, onAnswer = () => {}, onFinish = () => {}, onExit = () => {} }) {
  const qs = questions.map(q => ({ ...q, options: shuffle(q.options) }));  // option order is never a clue
  const answers = new Map();  // index -> Set of chosen options (mock: kept until the end)
  let i = 0, chosen = new Set(), checked = false, timer = null, deadline = 0;

  function header(extra = "") {
    return `<div class="panel-title"><h2>${esc(title)}</h2><span class="eyebrow">Question ${Math.min(i + 1, qs.length)} of ${qs.length}${extra}</span></div>`;
  }
  function optionHtml(q, k) {
    const o = q.options[k], on = chosen.has(k), multi = correctCount(q) > 1;
    const state = checked ? (o.correct ? " right" : on ? " wrong" : "") : on ? " picked" : "";
    return `<button type="button" class="opt ex-opt${state}" data-k="${k}" role="${multi ? "checkbox" : "radio"}" aria-checked="${on}" ${checked ? "disabled" : ""}>
      <span class="ex-mark" aria-hidden="true">${multi ? (on ? "☑" : "☐") : on ? "◉" : "○"}</span><span>${esc(o.text)}</span></button>
      ${checked && (o.correct || on) ? `<p class="ex-why ${o.correct ? "ok" : "no"}"><b>${o.correct ? "Correct" : "Not this one"}:</b> ${esc(o.why)}</p>` : ""}`;
  }
  function draw() {
    if (i >= qs.length) return finish();
    const q = qs[i], multi = correctCount(q) > 1;
    const left = mode === "mock" ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : 0;
    el.innerHTML = `${header(mode === "mock" ? ` · <span id="ex-clock">${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</span>` : "")}
      <div class="eyebrow">Objective ${esc(q.objective)} · ${esc(objectiveName(q.objective))}</div>
      ${q.scenario ? `<p class="ex-scenario">${esc(q.scenario)}</p>` : ""}
      <p class="q">${esc(q.stem)}</p>${multi && !/choose/i.test(q.stem) ? `<p class="muted ex-hint">Choose ${correctCount(q)}.</p>` : ""}
      <div class="ex-opts" role="${multi ? "group" : "radiogroup"}" aria-label="Answers">${q.options.map((_, k) => optionHtml(q, k)).join("")}</div>
      <div class="row ex-ctl">
        ${mode === "mock" ? `<button class="btn brand" type="button" data-act="next" ${chosen.size ? "" : "disabled"}>${i + 1 < qs.length ? "Next question ›" : "Finish exam"}</button>`
          : checked ? `<button class="btn brand" type="button" data-act="next">${i + 1 < qs.length ? "Next question ›" : "See results"}</button>`
          : `<button class="btn brand" type="button" data-act="check" ${chosen.size === correctCount(q) ? "" : "disabled"}>Check answer</button>`}
        <button class="btn ghost" type="button" data-act="exit">${mode === "mock" ? "Abandon exam" : "Stop"}</button>
      </div>`;
  }
  function finish() {
    clearInterval(timer);
    const results = qs.map((q, k) => ({ q, chosen: answers.get(k) || new Set(), right: isCorrect(q, answers.get(k) || new Set()) }));
    if (mode === "mock") results.forEach(r => onAnswer(r.q, r.right));
    const score = results.filter(r => r.right).length;
    onFinish({ mode, score, total: qs.length });
    el.innerHTML = `<div class="panel-title"><h2>${esc(title)}: results</h2><span class="eyebrow">${score} of ${qs.length} correct</span></div>
      <p>${mode === "mock" ? "Patch Notes mock exams are practice only. The real exam is scored differently, so treat this as a guide to what to revise." : "Your answers update each objective's mastery on this page."}</p>
      ${mode === "mock" ? `<details class="ex-review" open><summary>Review every question</summary><ol>${results.map(r => `<li class="${r.right ? "ok" : "no"}"><b>${r.right ? "✓" : "✗"} ${esc(r.q.objective)}</b> ${esc(r.q.stem)}
        <ul>${r.q.options.filter((o, k) => o.correct || r.chosen.has(k)).map(o => `<li>${o.correct ? "Correct answer" : "Your answer"}: ${esc(o.text)}. <span class="muted">${esc(o.why)}</span></li>`).join("")}</ul></li>`).join("")}</ol></details>` : ""}
      <div class="row"><button class="btn brand" type="button" data-act="exit">Back to the objectives</button></div>`;
  }
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.k !== undefined) {
      const k = Number(b.dataset.k), q = qs[i];
      if (correctCount(q) > 1) { chosen.has(k) ? chosen.delete(k) : chosen.add(k); } else chosen = new Set([k]);
      draw(); el.querySelector(`[data-k="${k}"]`)?.focus(); return;
    }
    if (b.dataset.act === "check") { checked = true; answers.set(i, chosen); onAnswer(qs[i], isCorrect(qs[i], chosen)); draw(); el.querySelector('[data-act="next"]')?.focus(); }
    else if (b.dataset.act === "next") { if (mode === "mock") answers.set(i, chosen); i++; chosen = new Set(); checked = false; draw(); el.querySelector(".ex-opt")?.focus(); }
    else if (b.dataset.act === "exit") { clearInterval(timer); onExit(); }
  });
  if (mode === "mock") {
    deadline = Date.now() + MOCK_MINUTES * 60 * 1000;
    timer = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000)), c = el.querySelector("#ex-clock");
      if (c) c.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      if (left <= 0) { answers.set(i, chosen); i = qs.length; draw(); }  // time's up: mark what's answered
      if (!el.isConnected) clearInterval(timer);
    }, 1000);
  }
  draw();
  el.querySelector(".ex-opt")?.focus();
}
