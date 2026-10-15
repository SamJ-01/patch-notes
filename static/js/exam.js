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
const letter = k => String.fromCharCode(65 + k);
// opts: { title, questions, mode: "drill"|"mock", objectiveName(id), onAnswer(q, right), onFinish(summary), onExit() }
export function mount(el, opts) {
  const qs = (opts.questions || []).map(q => ({ ...q, options: shuffle(q.options) }));  // option order is never a clue
  return opts.mode === "mock" ? mountMock(el, qs, opts) : mountDrill(el, qs, opts);
}

// Objective drill: one question at a time with immediate feedback and the explanation for each option.
function mountDrill(el, qs, { title, objectiveName = id => id, onAnswer = () => {}, onFinish = () => {}, onExit = () => {} }) {
  const answers = new Map();
  let i = 0, chosen = new Set(), checked = false;
  function optionHtml(q, k) {
    const o = q.options[k], on = chosen.has(k);
    const state = checked ? (o.correct ? " right" : on ? " wrong" : "") : on ? " picked" : "";
    return `<button type="button" class="opt ex-opt${state}" data-k="${k}" role="${correctCount(q) > 1 ? "checkbox" : "radio"}" aria-checked="${on}" ${checked ? "disabled" : ""}>
      <span class="ex-letter" aria-hidden="true">${letter(k)}</span><span>${esc(o.text)}</span></button>
      ${checked && (o.correct || on) ? `<p class="ex-why ${o.correct ? "ok" : "no"}"><b>${o.correct ? "Correct" : "Not this one"}:</b> ${esc(o.why)}</p>` : ""}`;
  }
  function draw() {
    if (i >= qs.length) return finish();
    const q = qs[i], multi = correctCount(q) > 1;
    el.innerHTML = `<div class="panel-title"><h2>${esc(title)}</h2><span class="eyebrow">Question ${i + 1} of ${qs.length}</span></div>
      <div class="eyebrow">Objective ${esc(q.objective)} · ${esc(objectiveName(q.objective))}</div>
      ${q.scenario ? `<p class="ex-scenario">${esc(q.scenario)}</p>` : ""}
      <p class="q">${esc(q.stem)}</p>${multi && !/choose/i.test(q.stem) ? `<p class="muted ex-hint">Choose ${correctCount(q)}.</p>` : ""}
      <div class="ex-opts" role="${multi ? "group" : "radiogroup"}" aria-label="Answers">${q.options.map((_, k) => optionHtml(q, k)).join("")}</div>
      <div class="row ex-ctl">
        ${checked ? `<button class="btn brand" type="button" data-act="next">${i + 1 < qs.length ? "Next question ›" : "See results"}</button>`
          : `<button class="btn brand" type="button" data-act="check" ${chosen.size === correctCount(q) ? "" : "disabled"}>Check answer</button>`}
        <button class="btn ghost" type="button" data-act="exit">Stop</button>
      </div>`;
  }
  function finish() {
    const score = qs.filter((q, k) => isCorrect(q, answers.get(k) || new Set())).length;
    onFinish({ mode: "drill", score, total: qs.length });
    el.innerHTML = `<div class="panel-title"><h2>${esc(title)}: results</h2><span class="eyebrow">${score} of ${qs.length} correct</span></div>
      <p>Your answers update each objective's mastery on this page.</p>
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
    else if (b.dataset.act === "next") { i++; chosen = new Set(); checked = false; draw(); el.querySelector(".ex-opt")?.focus(); }
    else if (b.dataset.act === "exit") onExit();
  });
  draw(); el.querySelector(".ex-opt")?.focus();
}

// Mock exam: like the real thing. Answer in any order, flag questions, no feedback until you end,
// then review every question. A countdown runs; when it hits zero the exam ends automatically.
function mountMock(el, qs, { title, objectiveName = id => id, onAnswer = () => {}, onFinish = () => {}, onExit = () => {} }) {
  const answers = new Map();  // index -> Set of chosen option indexes
  const flagged = new Set();
  let i = 0, confirming = false, done = false, timer = null;
  const deadline = Date.now() + MOCK_MINUTES * 60 * 1000;
  const left = () => Math.max(0, Math.round((deadline - Date.now()) / 1000));
  const clock = () => `${Math.floor(left() / 60)}:${String(left() % 60).padStart(2, "0")}`;
  const answered = () => answers.size;

  function draw() {
    if (done) return;
    if (confirming) return drawConfirm();
    const q = qs[i], chosen = answers.get(i) || new Set(), multi = correctCount(q) > 1;
    el.innerHTML = `<div class="panel-title"><h2>${esc(title)}</h2><span class="eyebrow mono"><span id="ex-clock">${clock()}</span> left · ${answered()}/${qs.length} answered</span></div>
      <div class="ex-qhead"><span class="eyebrow">Question ${i + 1} of ${qs.length} · Objective ${esc(q.objective)} · ${esc(objectiveName(q.objective))}</span>
        <button class="ex-flag${flagged.has(i) ? " on" : ""}" type="button" data-act="flag" aria-pressed="${flagged.has(i)}">⚑ ${flagged.has(i) ? "Flagged" : "Flag for review"}</button></div>
      ${q.scenario ? `<p class="ex-scenario">${esc(q.scenario)}</p>` : ""}
      <p class="q">${esc(q.stem)}</p>${multi && !/choose/i.test(q.stem) ? `<p class="muted ex-hint">Choose ${correctCount(q)}.</p>` : ""}
      <div class="ex-opts" role="${multi ? "group" : "radiogroup"}" aria-label="Answers">${q.options.map((o, k) => `<button type="button" class="opt ex-opt${chosen.has(k) ? " picked" : ""}" data-k="${k}" role="${multi ? "checkbox" : "radio"}" aria-checked="${chosen.has(k)}">
        <span class="ex-letter" aria-hidden="true">${letter(k)}</span><span>${esc(o.text)}</span></button>`).join("")}</div>
      <div class="row ex-nav">
        <button class="btn ghost" type="button" data-act="prev" ${i === 0 ? "disabled" : ""}>‹ Previous</button>
        <button class="btn ghost" type="button" data-act="next" ${i === qs.length - 1 ? "disabled" : ""}>Next ›</button>
        <button class="btn brand" type="button" data-act="end">End exam</button>
      </div>
      <details class="ex-items" open><summary>All questions${flagged.size ? ` · ${flagged.size} flagged` : ""}</summary>
        <div class="ex-grid" role="group" aria-label="Jump to a question">${qs.map((_, k) => `<button type="button" class="ex-item${k === i ? " cur" : ""}${answers.has(k) ? " done" : ""}${flagged.has(k) ? " flag" : ""}" data-go="${k}"
          aria-label="Question ${k + 1}${answers.has(k) ? ", answered" : ", not answered"}${flagged.has(k) ? ", flagged" : ""}${k === i ? ", current" : ""}">${k + 1}</button>`).join("")}</div>
        <p class="ex-legend muted">Filled = answered · ring = flagged · outline = current</p></details>`;
  }
  function drawConfirm() {
    const un = qs.length - answered();
    el.innerHTML = `<div class="panel-title"><h2>End the exam?</h2><span class="eyebrow mono">${clock()} left</span></div>
      <p>${un ? `You have <b>${un}</b> unanswered question${un === 1 ? "" : "s"}${flagged.size ? ` and <b>${flagged.size}</b> flagged` : ""}. ` : flagged.size ? `You still have <b>${flagged.size}</b> flagged for review. ` : "Every question is answered. "}You can't change answers after ending.</p>
      <div class="row"><button class="btn brand" type="button" data-act="end-yes">End and see results</button><button class="btn ghost" type="button" data-act="end-no">Keep going</button></div>`;
  }
  function finish() {
    done = true; clearInterval(timer);
    const results = qs.map((q, k) => ({ q, chosen: answers.get(k) || new Set(), right: isCorrect(q, answers.get(k) || new Set()) }));
    results.forEach(r => onAnswer(r.q, r.right));
    const score = results.filter(r => r.right).length;
    onFinish({ mode: "mock", score, total: qs.length });
    el.innerHTML = `<div class="panel-title"><h2>${esc(title)}: results</h2><span class="eyebrow">${score} of ${qs.length} correct</span></div>
      <p>Patch Notes mock exams are practice only. The real exam is scored differently, so treat this as a guide to what to revise. Your answers update each objective's mastery.</p>
      <details class="ex-review" open><summary>Review every question</summary><ol>${results.map(r => `<li class="${r.right ? "ok" : r.chosen.size ? "no" : "skip"}"><b>${r.right ? "✓" : r.chosen.size ? "✗" : "—"} ${esc(r.q.objective)}</b> ${esc(r.q.stem)}
        <ul>${r.q.options.filter((o, k) => o.correct || r.chosen.has(k)).map(o => `<li>${o.correct ? "Correct answer" : "Your answer"}: ${esc(o.text)}. <span class="muted">${esc(o.why)}</span></li>`).join("")}${r.chosen.size ? "" : "<li class='muted'>You left this one blank.</li>"}</ul></li>`).join("")}</ol></details>
      <div class="row"><button class="btn brand" type="button" data-act="exit">Back to the objectives</button></div>`;
  }
  function go(k) { i = Math.max(0, Math.min(qs.length - 1, k)); draw(); el.querySelector(".ex-opt")?.focus(); }
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.k !== undefined) {
      const k = Number(b.dataset.k), q = qs[i], set = answers.get(i) || new Set();
      if (correctCount(q) > 1) { set.has(k) ? set.delete(k) : set.add(k); } else { set.clear(); set.add(k); }
      set.size ? answers.set(i, set) : answers.delete(i);
      draw(); el.querySelector(`[data-k="${k}"]`)?.focus(); return;
    }
    const act = b.dataset.act;
    if (b.dataset.go !== undefined) go(Number(b.dataset.go));
    else if (act === "flag") { flagged.has(i) ? flagged.delete(i) : flagged.add(i); draw(); el.querySelector('[data-act="flag"]').focus(); }
    else if (act === "prev") go(i - 1);
    else if (act === "next") go(i + 1);
    else if (act === "end") { confirming = true; draw(); el.querySelector('[data-act="end-yes"]').focus(); }
    else if (act === "end-no") { confirming = false; draw(); }
    else if (act === "end-yes") finish();
    else if (act === "exit") { clearInterval(timer); onExit(); }
  });
  timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    const c = el.querySelector("#ex-clock"); if (c) c.textContent = clock();
    if (left() <= 0 && !done) finish();  // time's up: score what's answered
  }, 1000);
  draw(); el.querySelector(".ex-opt")?.focus();
}
