/* LEARN */
const LS = { track: "All", gq: "" };
// Tracks in learning order; any new track in lessons.json is added at the end rather than dropped.
const LESSON_TRACKS = [...new Set(["Foundations", "Threats", "Defence", "Web attacks", ...DATA.lessons.map(l => l.track)])];
VIEWS.learn = () => {
  const tracks = ["All", ...LESSON_TRACKS.filter(t => DATA.lessons.some(l => l.track === t))];
  const doneCount = DATA.lessons.filter(l => P.done[l.id]).length;
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("learn")}<h1>The concepts behind the headlines</h1>
</div>
    <div class="row" style="justify-content:space-between">
      <div class="row" id="ltracks">${tracks.map(t => `<button class="chip" data-t="${esc(t)}" aria-pressed="${LS.track === t}">${esc(t)}</button>`).join("")}</div>
      <div class="progress"><span class="trk" aria-hidden="true"><i style="width:${Math.round(doneCount / DATA.lessons.length * 100)}%"></i></span><span>${doneCount} of ${DATA.lessons.length} done</span></div>
    </div>
    <section class="stack" style="gap:12px"><div class="panel-title"><h2 class="eyebrow" style="font-size:0.8rem">Learning paths</h2><span class="muted" style="font-size:0.85rem">Finish a path for +${PATH_XP} XP and a badge</span></div>
      <div class="paths-grid">${DATA.paths.map(pathCard).join("")}</div></section>
    <div class="stack" id="lgrid" style="gap:30px"></div>
    <section class="panel" style="grid-template-columns:minmax(0,1fr) auto;align-items:center">
      <div class="stack" style="gap:6px"><h2>Glossary</h2><p class="muted">${DATA.glossary.length + Object.keys(DATA.cwe).length} terms in plain English. Dotted words anywhere on the site open them.</p></div>
      <a class="btn brand" href="#glossary">Open glossary</a>
    </section>
  </div>`;
  const drawGrid = () => {
    const card = l => `
      <a class="lcard art-card" href="#lesson-${esc(l.id)}">${cardArt(l.id)}${P.done[l.id] ? '<span class="done">DONE</span>' : ""}
        <h3>${esc(l.title)}</h3><p>${esc(l.hook)}</p>
        <span class="lmeta"><span>${l.minutes} min</span><span>${esc(l.level)}</span></span></a>`;
    // Lessons are grouped by track, in learning order, so "All" reads as sections rather than a mix.
    const tracks = LESSON_TRACKS.filter(t => (LS.track === "All" || LS.track === t) && DATA.lessons.some(l => l.track === t));
    $("lgrid").innerHTML = tracks.map(t => `<section class="stack" style="gap:12px">${LS.track === "All" ? `<h2 class="cat-h">${esc(t)}</h2>` : ""}<div class="lessons">${DATA.lessons.filter(l => l.track === t).map(card).join("")}</div></section>`).join("");
  };
  $("ltracks").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; LS.track = b.dataset.t;
    $("ltracks").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b)); drawGrid(); });
  drawGrid();
};
function pathCard(p) {
  const steps = pathSteps(p), done = steps.filter(s => s.done).length;
  return `<a class="lcard" href="#path-${esc(p.id)}">${P.paths[p.id] ? '<span class="done">DONE</span>' : ""}<span class="eyebrow">${steps.length} steps</span><h3>${esc(p.title)}</h3><p>${esc(p.blurb)}</p>
    <div class="progress"><span class="trk" aria-hidden="true"><i style="width:${Math.round(done / steps.length * 100)}%"></i></span><span>${done}/${steps.length}</span></div></a>`;
}
function pathView(id) {
  const p = DATA.paths.find(x => x.id === id); if (!p) return VIEWS.learn();
  const steps = pathSteps(p), done = steps.filter(s => s.done).length;
  const career = p.career && DATA.careers.paths.find(c => c.id === p.career);
  main.innerHTML = `<div class="view"><article class="article">
    <a class="link-btn" href="#learn">← Learn</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">Learning path · ${done}/${steps.length} done</div><h1>${esc(p.title)}</h1><p class="hook">${esc(p.blurb)}</p></div>
    <div class="progress"><span class="trk" aria-hidden="true" style="flex-basis:100%"><i style="width:${Math.round(done / steps.length * 100)}%"></i></span></div>
    <ol class="steps" data-trail="${esc(p.id)}">${steps.map((st, i) => `<li class="${st.done ? "got" : ""}"><span class="st">${i + 1}${st.done ? '<span class="st-tick" aria-hidden="true">✓</span><span class="sr-only"> (done)</span>' : ""}</span><span class="stack" style="gap:2px"><span class="eyebrow">${esc(st.kind)}</span><a href="${st.href}"${st.flags ? ' data-play-mode="flags"' : st.kind === "game" ? ' data-play-mode="phish"' : ""}>${esc(st.label)}</a></span></li>`).join("")}</ol>
    <p class="muted">${P.paths[p.id] ? `Completed on ${esc(P.paths[p.id])}. Nice work.` : `Finish every step to earn <strong>+${PATH_XP} XP</strong> and the Pathfinder badge.`}${career ? ` See the <a href="#careers">${esc(career.role)}</a> career guide.` : ""}</p>
  </article></div>`;
}

/* CERTIFICATIONS: exam objectives mapped onto existing lessons, labs and missions */
const COVERAGE = { strong: ["Hands-on practice here", "good"], partial: ["Partly covered", "sun"], none: ["Not covered yet", "muted"] };
function certActivity(a) {
  if (a.type === "lesson") { const l = LESSON[a.id]; return l && { label: l.title, href: "#lesson-" + a.id, done: !!P.done[a.id] }; }
  if (a.type === "lab") { const l = DATA.labs.find(x => x.id === a.id); return l && { label: l.title, href: "#lab-" + a.id, done: !!P.labs[a.id] }; }
  if (a.type === "mission") { const m = MISSION(a.id); return m && { label: m.title, href: "#mission-" + a.id, done: count((P.missions || {})[a.id]) > 0 }; }
  if (a.type === "agency") { const sh = SHIFT(a.id); return sh && { label: `PATCH//AGENCY: ${sh.title}`, href: "#agency-" + a.id, done: !!(P.agency || {})[a.id] }; }
  if (a.type === "tool" && CERT_TOOLS[a.id]) return { label: CERT_TOOLS[a.id], href: "#" + a.id, done: null };  // a tool: nothing to complete
  return null;
}
// Practice progress for one objective: mapped activities you've completed (tools don't count).
function objectiveProgress(o) {
  const acts = o.activities.map(certActivity).filter(Boolean), countable = acts.filter(a => a.done !== null);
  return { acts, done: countable.filter(a => a.done).length, total: countable.length };
}
const CERT_TOOLS = { "subnet-calc": "Subnet calculator", "headers-check": "Email header checker", "log-search": "Log search", "cvss-decode": "CVSS decoder" };
const certObjectives = c => c.domains.flatMap(d => d.objectives.map(o => ({ ...o, domain: d })));
// Exam prep has its own tab, so certification material doesn't crowd the lessons.
VIEWS.exams = () => {
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("exams")}<h1>Exam prep</h1>
      <p>CompTIA objectives mapped to what you can practise here, with practice questions, mock exams and an honest "Am I ready?" check.</p></div>
    <div class="paths">${DATA.certs.map(certCard).join("")}</div>
    <p class="muted cert-note">The questions are original, not real exam questions. It's preparation, not a guarantee of passing.</p>
  </div>`;
};
function certCard(c) {
  const objs = certObjectives(c), practised = objs.filter(o => { const p = objectiveProgress(o); return p.total && p.done === p.total; }).length;
  const unit = objs.length === c.domains.length ? "domains" : "objectives";  // Security+ and PenTest+ are mapped by domain
  return `<a class="lcard" href="#cert-${esc(c.id)}"><span class="eyebrow">${esc(c.exam)} · ${objs.length} ${unit}</span><h3>${esc(c.name)}</h3>
    <p>${c.questions.length} practice questions, timed mock exams and where to study the rest</p>
    <div class="progress"><span class="trk" aria-hidden="true"><i style="width:${Math.round(practised / objs.length * 100)}%"></i></span><span>${practised} of ${objs.length} practised</span></div></a>`;
}
// Practice question results: { [questionId]: { r: times right, w: times wrong, last: 1|0 } }
function recordAnswer(q, right) {
  const s = P.exam[q.id] || (P.exam[q.id] = { r: 0, w: 0, last: 0 });
  if (right && !s.r) award(5, "Exam question", { quiet: true });
  right ? s.r++ : s.w++; s.last = right ? 1 : 0; saveP();
}
const MASTERY_LABEL = { new: ["Not tried", "muted"], started: ["Started", "sun"], weak: ["Revise", "bad"], strong: ["All correct", "good"] };
function startPractice(c, mode, questions, title, lesson = null) {
  import("./js/exam.js").then(ex => {
    if (parseRoute().path !== "exams/" + c.id) return;
    proveTopic = lesson;
    const names = Object.fromEntries(certObjectives(c).map(o => [o.id, o.title]));
    main.innerHTML = `<div class="view"><article class="article lesson"><a class="link-btn" href="#cert-${esc(c.id)}">← ${esc(c.name)} objectives</a><h1 class="sr-only">${esc(c.name)} practice: ${esc(title)}</h1><section class="panel wide ex" id="ex-root"></section></article></div>`;
    window.scrollTo(0, 0);
    // Practice is drawn under the cert's own hash, so following the link wouldn't change it (no hashchange).
    main.querySelector(".lesson > .link-btn").addEventListener("click", e => { e.preventDefault(); certView(c.id); drawTrail(); window.scrollTo(0, 0); });
    if (lesson) { topicTop(main.querySelector(".lesson"), lesson, "prove"); drawTrail(); }
    ex.mount($("ex-root"), { title, mode, questions: mode === "mock" ? ex.buildMock(c.questions, c.domains) : questions,
      objectiveName: id => names[id] || id, onAnswer: recordAnswer,
      onFinish: r => { if (r.mode === "mock") { (P.mocks[c.id] || (P.mocks[c.id] = [])).push({ d: todayStr(), score: r.score, total: r.total }); P.mocks[c.id] = P.mocks[c.id].slice(-20); saveP(); award(20, "Mock exam completed"); celebrate("Mock exam done", `${r.score} of ${r.total} correct`); } },
      onExit: () => { certView(c.id); drawTrail(); window.scrollTo(0, 0); } });
  }).catch(() => toast("Couldn't load the practice questions"));
}
// "Am I ready?": readiness per domain from practice and question results (logic in exam.js, tested there).
const READY_VERDICT = {
  start: ["Not started yet", "muted", "Answer a few practice questions or finish a lesson and this fills in."],
  building: ["Building the foundations", "bad", "Work through the plan below: it starts with your weakest areas."],
  close: ["Getting close", "sun", ""],
  ready: ["Looking ready on everything Patch Notes can check", "good", ""],
};
const pctOf = v => Math.round((v || 0) * 100);
const readyTone = v => (v >= 0.7 ? "good" : v >= 0.4 ? "sun" : "bad");
function readinessPanel(c, progress) {
  import("./js/exam.js").then(ex => {
    const el = $("cert-ready"); if (!el || parseRoute().path !== "exams/" + c.id) return;
    const progressOf = o => { const p = progress.get(o.id); return { done: p.done, total: p.total, next: p.acts.find(a => a.done === false) || null }; };
    const r = ex.readiness({ domains: c.domains, questions: c.questions, stats: P.exam, progressOf, mocks: P.mocks[c.id] || [] });
    const [head, tone, base] = READY_VERDICT[r.verdict];
    const weakest = r.rows.filter(x => x.score !== null && x.score < ex.READY.domain).sort((a, b) => a.score - b.score)[0];
    const missing = [weakest && `${weakest.d.id} ${weakest.d.name} is at ${pctOf(weakest.score)}% (aim for ${pctOf(ex.READY.domain)}%+ in every domain)`,
      r.qTotal && (r.mockPct === null ? "you haven't taken a mock exam yet" : r.mockPct < ex.READY.mock && `your last mock was ${pctOf(r.mockPct)}% (aim for ${pctOf(ex.READY.mock)}%+)`)].filter(Boolean);
    const detail = r.verdict === "close" ? `Still to do: ${missing.join("; ") || "push your overall score past " + pctOf(ex.READY.overall) + "%"}.`
      : r.verdict === "ready" ? `${r.elsewhere ? `Before you book, cover the ${r.elsewhere} objective${r.elsewhere === 1 ? "" : "s"} Patch Notes doesn't teach yet, and ` : "Before you book, "}try a full-length practice exam from another provider too.` : base;
    const qLine = x => { const qs = x.objs.reduce((s, o) => s + o.m.total, 0), right = x.objs.reduce((s, o) => s + o.m.right, 0), ad = x.objs.reduce((s, o) => s + o.p.done, 0), at = x.objs.reduce((s, o) => s + o.p.total, 0);
      return [qs && `${right}/${qs} questions right`, at && `${ad}/${at} activities done`].filter(Boolean).join(" · ") || "Nothing to check here yet"; };
    const planRow = it => {
      if (it.kind === "mock") return `<button class="try-row" type="button" data-practice="mock"><span class="eyebrow">Mock exam</span><b>Take a mock exam</b><span class="muted">${ex.MOCK_SIZE} questions in ${ex.MOCK_MINUTES} minutes. ${pctOf(ex.READY.mock)}% or more counts towards ready.</span></button>`;
      const tag = `${esc(it.o.id)} · ${esc(it.o.title)}`;
      if (it.kind === "activity") return `<a class="try-row" href="${it.next.href}"><span class="eyebrow">${tag}</span><b>${esc(it.next.label)}</b><span class="muted">${it.fresh ? "Start here" : "One of your weakest domains"}: ${esc(it.domain.name)}</span></a>`;
      const why = { wrong: ["Revise", "You got a question here wrong last time."], new: ["Try", "Not tried yet."], finish: ["Finish", "Some questions here are still unanswered."] }[it.why];
      return `<button class="try-row" type="button" data-practice-obj="${esc(it.o.id)}"><span class="eyebrow">${tag}</span><b>${why[0]} the ${esc(it.o.id)} questions</b><span class="muted">${why[1]}</span></button>`;
    };
    const mock = r.lastMock ? `Last mock exam: <b>${r.lastMock.score}/${r.lastMock.total}</b> (${pctOf(r.mockPct)}%) on ${esc(new Date(r.lastMock.d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}.` : r.qTotal ? "No mock exam yet." : "";
    el.innerHTML = `<div class="panel-title"><h2 id="ready-h">Am I ready?</h2><span class="eyebrow">${pctOf(r.overall)}% on what Patch Notes can check</span></div>
      <p class="ready-verdict ${tone}"><b>${esc(head)}.</b> ${esc(detail)}</p>
      <ul class="ready-domains">${r.rows.map(x => `<li><span class="rd-name"><b class="mono">${esc(x.d.id)}</b> ${esc(x.d.name)} <span class="muted">${x.d.weight}% of the exam</span></span>
        <span class="trk" aria-hidden="true"><i class="${x.score === null ? "" : readyTone(x.score)}" style="width:${pctOf(x.score)}%"></i></span>
        <span class="rd-pct mono">${x.score === null ? "–" : pctOf(x.score) + "%"}</span><span class="muted rd-ev">${qLine(x)}${x.elsewhere ? ` · ${x.elsewhere} not taught here yet` : ""}</span></li>`).join("")}</ul>
      ${mock ? `<p class="muted" style="margin:0">${mock}</p>` : ""}
      ${r.plan.length ? `<h3 class="cert-h">Your study plan</h3><div class="try-list ready-plan">${r.plan.map(planRow).join("")}</div>` : ""}
      ${r.elsewhere && c.study ? `<p class="muted" style="margin:0">${r.elsewhere} objective${r.elsewhere === 1 ? " has" : "s have"} practice questions here but no lessons yet. Learn ${r.elsewhere === 1 ? "it" : "them"} with <a href="${esc(c.study.url)}" target="_blank" rel="noopener">${esc(c.study.label)} ↗</a>, then come back to test yourself.</p>` : ""}
      <details class="ready-how"><summary>How this is worked out</summary><p class="muted">Each objective scores from the questions you got right last time (counted double, because they test you) and the lessons, labs and missions you've finished. Domains are weighted like the real exam. "Ready" means ${pctOf(ex.READY.overall)}%+ overall, ${pctOf(ex.READY.domain)}%+ in every domain${r.qTotal ? ` and ${pctOf(ex.READY.mock)}%+ on your latest mock` : ""}. That's Patch Notes' own bar, not CompTIA's scoring, so it's a guide to what to study, not a promise you'll pass.</p></details>`;
  }).catch(() => { const el = $("cert-ready"); if (el) el.innerHTML = `<div class="panel-title"><h2 id="ready-h">Am I ready?</h2></div><p class="muted" style="margin:0">Couldn't load the readiness check. Try reloading the page.</p>`; });
}
function certView(id) {
  const c = DATA.certs.find(x => x.id === id); if (!c) return VIEWS.exams();
  const objs = certObjectives(c), cov = k => objs.filter(o => o.coverage === k).length;
  const progress = new Map(objs.map(o => [o.id, objectiveProgress(o)]));
  const practised = objs.filter(o => { const p = progress.get(o.id); return p.total && p.done === p.total; }).length;
  const qCount = oid => c.questions.filter(q => q.objective === oid).length;
  const objMastery = oid => { const qs = c.questions.filter(q => q.objective === oid), seen = qs.filter(q => P.exam[q.id]), right = seen.filter(q => P.exam[q.id].last === 1).length;
    return { answered: seen.length, right, total: qs.length, level: !seen.length ? "new" : right < seen.length ? "weak" : seen.length < qs.length ? "started" : "strong" }; };
  const reviewed = new Date(c.reviewed + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  main.innerHTML = `<div class="view"><article class="article lesson">
    <a class="link-btn" href="#exams">← Exam prep</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">Exam prep · ${esc(c.exam)}</div><h1>${esc(c.name)}</h1>
      <p class="hook">Every exam objective, mapped to what you can practise here, with honest gaps.</p></div>
    <p class="muted cert-note">${esc(c.note)} Objectives last checked ${esc(reviewed)} against <a href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.label)} ↗</a>.</p>
    ${(r => r ? `<a class="btn brand" href="#path-${esc(r.id)}" style="justify-self:start">Follow the ${esc(r.title.replace(/^Path to /, ""))} route: ${r.steps.length} stops →</a>` : "")(DATA.paths.find(p => p.exam === c.id))}
    <section class="panel wide"><div class="panel-title"><h2>Your progress</h2><span class="eyebrow">${practised} of ${objs.length} objectives practised</span></div>
      <div class="progress"><span class="trk" aria-hidden="true" style="flex:1 1 auto"><i style="width:${Math.round(practised / objs.length * 100)}%"></i></span></div>
      <p class="muted" style="margin:0">Coverage on Patch Notes: ${cov("strong")} with hands-on practice · ${cov("partial")} partly covered · ${cov("none")} not covered yet.</p>
    </section>
    <section class="panel wide ready" id="cert-ready" aria-labelledby="ready-h"><div class="panel-title"><h2 id="ready-h">Am I ready?</h2></div><p class="muted" style="margin:0">Working it out…</p></section>
    ${c.questions.length ? `<section class="panel wide"><div class="panel-title"><h2>Practice questions</h2><span class="eyebrow">${c.questions.length} original questions · not real exam questions</span></div>
      <p class="muted" style="margin:0">Every answer explains why it's right or wrong. Your results mark each objective below as started, to revise, or all correct.</p>
      <div class="row"><button class="btn brand" type="button" data-practice="weak">Revise weak spots</button><button class="btn ghost" type="button" data-practice="mock">Mock exam: 20 questions, 20 minutes</button></div></section>` : ""}
    ${c.domains.map(d => `<section class="panel wide cert-domain"><div class="panel-title"><h2>${esc(d.id)} ${esc(d.name)}</h2><span class="eyebrow">${d.weight}% of the exam</span></div>
      <ul class="cert-list">${d.objectives.map(o => { const p = progress.get(o.id), [label, tone] = COVERAGE[o.coverage];
        return `<li class="cert-obj"><div class="cert-top"><b class="mono">${esc(o.id)}</b><span class="cert-title">${esc(o.title)}</span><span class="cert-badge ${tone}">${label}</span>${p.total ? `<span class="cert-done${p.done === p.total ? " ok" : ""}">${p.done}/${p.total} done</span>` : ""}${qCount(o.id) ? (() => { const m = objMastery(o.id), [ml, mt] = MASTERY_LABEL[m.level]; return `<span class="cert-badge ${mt}" title="${m.right} of ${m.total} questions right last time">Questions: ${ml}${m.answered ? ` ${m.right}/${m.total}` : ""}</span><button class="link-btn" type="button" data-practice-obj="${esc(o.id)}">Practise ${qCount(o.id)} ›</button>`; })() : ""}</div>
          ${p.acts.length ? `<div class="row cert-acts">${p.acts.map(a => `<a class="topic" href="${a.href}">${a.done ? "✓ " : ""}${esc(a.label)}</a>`).join("")}</div>` : ""}
          ${o.gap ? `<p class="muted cert-gap">${esc(o.gap)}</p>` : ""}</li>`; }).join("")}</ul></section>`).join("")}
    ${c.study ? `<p class="muted cert-note">For the parts not covered here, <a href="${esc(c.study.url)}" target="_blank" rel="noopener">${esc(c.study.label)} ↗</a> follows the same objective numbers.</p>` : ""}
  </article></div>`;
  readinessPanel(c, progress);
  main.querySelector("article").addEventListener("click", e => {
    const b = e.target.closest("[data-practice], [data-practice-obj]"); if (!b) return;
    const oid = b.dataset.practiceObj;
    if (oid) return startPractice(c, "drill", c.questions.filter(q => q.objective === oid), `Objective ${oid}`);
    if (b.dataset.practice === "mock") return startPractice(c, "mock", null, `${c.name} mock exam`);
    // Weak spots: questions from objectives answered wrong last time, then untried ones, heaviest domains first.
    const weight = q => (c.domains.find(d => d.id[0] === q.objective[0]) || {}).weight || 0;
    const rank = q => (P.exam[q.id] ? (P.exam[q.id].last ? 2 : 0) : 1);
    const qs = c.questions.slice().sort((a, b) => rank(a) - rank(b) || weight(b) - weight(a)).slice(0, 10);
    startPractice(c, "drill", qs, "Weak spots");
  });
  // Arrived from a lesson's "Prove it": jump straight into that topic's objective questions.
  if (pendingProve && pendingProve.certId === c.id) {
    const pp = pendingProve; pendingProve = null;
    const qs = c.questions.filter(q => pp.objIds.includes(q.objective));
    if (qs.length) startPractice(c, "drill", qs, pp.title, pp.lesson || null);
  }
}

/* THE LEARNING LOOP: one topic, four stages — Understand (lesson) → Experiment (lab) → Diagnose (mission) → Prove it
   (the mapped exam-objective questions). All four always show, in the same places, so every topic looks the same; a stage
   a topic doesn't have yet is shown greyed out ("None yet") rather than hidden, so the arc stays honest. */
let pendingProve = null;  // set by a "Prove it" click, consumed by certView to auto-start the objective drill
// The exam questions that prove a lesson's topic: the first cert whose mapped objectives for this lesson have questions.
function lessonProveTargets(id) {
  for (const c of DATA.certs) {
    if (!c.questions) continue;
    const objIds = certObjectives(c).filter(o => o.activities.some(a => a.type === "lesson" && a.id === id))
      .map(o => o.id).filter(oid => c.questions.some(q => q.objective === oid));
    const questions = c.questions.filter(q => objIds.includes(q.objective));
    if (questions.length) return { cert: c, objIds, questions };
  }
  return null;
}
function proveMastery(t) {
  const seen = t.questions.filter(q => P.exam[q.id]);
  const right = seen.filter(q => P.exam[q.id].last === 1).length;
  return { answered: seen.length > 0, right, total: t.questions.length, level: !seen.length ? "new" : right === t.questions.length ? "strong" : "weak" };
}
const LOOP_META = { understand: ["Understand", "the idea"], experiment: ["Experiment", "hands-on"], diagnose: ["Diagnose", "a real fault"], prove: ["Prove it", "exam questions"] };
function topicStages(lessonId) {
  const l = LESSON[lessonId]; if (!l) return [];
  const stages = [{ key: "understand", status: P.done[lessonId] ? "done" : "now", href: "#lesson-" + lessonId }];
  // A lab or mission belongs to its own lesson and to any it lists in `also`; a shift to the lessons it lists. Own ones first.
  const mine = list => list.filter(x => x.lesson === lessonId).concat(list.filter(x => x.lesson !== lessonId && (x.also || []).includes(lessonId)));
  const labs = mine(DATA.labs);
  if (labs.length) { const d = labs.filter(x => P.labs[x.id]).length, nx = labs.find(x => !P.labs[x.id]) || labs[0];
    stages.push({ key: "experiment", status: d === labs.length ? "done" : d ? "part" : "open", href: "#lab-" + nx.id, count: labs.length > 1 ? `${d}/${labs.length}` : "" }); }
  const faults = [...mine(DATA.missions).map(m => ({ href: "#mission-" + m.id, done: count((P.missions || {})[m.id]) > 0 })),
    ...(DATA.agency || []).filter(sh => (sh.lessons || []).includes(lessonId)).map(sh => ({ href: "#agency-" + sh.id, done: !!(P.agency || {})[sh.id] }))];
  if (faults.length) { const d = faults.filter(f => f.done).length, nx = faults.find(f => !f.done) || faults[0];
    stages.push({ key: "diagnose", status: d === faults.length ? "done" : d ? "part" : "open", href: nx.href, count: faults.length > 1 ? `${d}/${faults.length}` : "" }); }
  const prove = lessonProveTargets(lessonId);
  if (prove) { const m = proveMastery(prove);
    stages.push({ key: "prove", status: m.level === "strong" ? "done" : m.answered ? "part" : "open", href: "#cert-" + prove.cert.id,
      prove: { certId: prove.cert.id, objIds: prove.objIds, title: `${l.title}: prove it`, lesson: lessonId }, count: `${m.total} Q` }); }
  return Object.keys(LOOP_META).map(key => stages.find(s => s.key === key) || { key, status: "none" });
}
// The horizontal stage strip. `current` is the stage the learner is on now (not a link).
function loopStrip(lessonId, current) {
  const stages = topicStages(lessonId); if (!stages.length) return "";
  // No numbers: a route's stops are numbered, and these are steps within one topic, so they mustn't look like stops.
  const mark = s => (s.status === "done" ? '<span aria-hidden="true">✓</span><span class="sr-only">(done)</span>' : "");
  const node = s => { const [label, sub] = LOOP_META[s.key], here = s.key === current;
    const inner = `<span class="loop-dot">${mark(s)}</span><span class="loop-lbl"><b>${label}</b><span>${s.status === "none" ? "none yet" : s.count || sub}</span></span>`;
    if (s.status === "none") return `<span class="loop-node none">${inner}</span>`;
    return here ? `<span class="loop-node ${s.status} here" aria-current="step">${inner}<span class="sr-only">(you're here)</span></span>`
      : `<a class="loop-node ${s.status}" href="${s.href}"${s.prove ? ` data-prove='${esc(JSON.stringify(s.prove))}'` : ""}>${inner}</a>`; };
  const onRoute = trailStop(trailSteps(), "#lesson-" + lessonId);
  return `<div class="loopwrap"><p class="eyebrow loop-eyebrow">${onRoute ? "Go deeper on this topic (optional)" : "This topic, step by step"}</p>
    <nav class="looptrack" aria-label="This topic's steps">${stages.map(node).join('<span class="loop-arr" aria-hidden="true">→</span>')}</nav></div>`;
}
// The same strip at the top of a lab, mission or "Prove it" page, under its title, with that page's stage lit. A lab or
// mission that serves several topics shows the one you came from (the last lesson you opened), else its own.
const pageTopic = x => { const ids = [x.lesson, ...(x.also || [])];
  return [...crumbs].reverse().map(c => /^#lesson-(.+)$/.exec(c)?.[1]).find(id => id && ids.includes(id)) || x.lesson; };
function topicTop(root, lessonId, stage) {
  const h = root && LESSON[lessonId] && root.querySelector("h1"); if (!h) return;
  (h.closest(".view-head, .stack") || h).insertAdjacentHTML("afterend", loopStrip(lessonId, stage));
}
// The topic a page belongs to: a lesson, a lab or mission of that lesson, or its "Prove it" questions (proveTopic,
// set while they're open on the cert page). drawTrail uses it to keep you at your stop while you go deeper.
let proveTopic = null;
function topicsOf(hash, here = true) {
  const [, kind, id] = /^#(lesson|lab|mission|agency|cert)-(.+)$/.exec(hash) || [];
  const of = x => (x ? [x.lesson, ...(x.also || [])].filter(Boolean) : []);
  if (kind === "lesson") return [id];
  if (kind === "lab") return of(LAB[id]);
  if (kind === "mission") return of(MISSION(id));
  if (kind === "agency") return SHIFT(id)?.lessons || [];
  return here && kind === "cert" && $("ex-root") && proveTopic ? [proveTopic] : [];
}
// Back up to the steps: from the end of a page you can go deeper on the topic or take the route's next stop.
const toTopButton = () => `<button type="button" class="btn ghost to-top" data-to-top>↑ Back to the top: go deeper or move on</button>`;
document.addEventListener("click", e => { if (!e.target.closest("[data-to-top]")) return;
  const strip = main.querySelector(".loopwrap") || main;
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  strip.querySelector("a.loop-node, .loop-node")?.focus?.({ preventScroll: true }); });

// What to do after finishing something: the next unfinished step of a learning path that includes it
// (paths already in progress first), otherwise practice for a lesson or the lesson behind a lab.
const pathRank = p => (P.paths[p.id] ? -1 : pathSteps(p).some(st => st.done) ? 1 : 0);
// The first unfinished step after this one; only when everything after it is done, an earlier one that was skipped.
// (Taking the first unfinished step overall sent a learner back and forth between two lessons they hadn't finished.)
const afterInPath = (steps, type, id) => {
  const i = steps.findIndex(st => st.type === type && st.id === id);
  const ahead = steps.slice(i + 1).find(st => !st.done);
  return ahead ? { step: ahead, back: false } : (s => s && { step: s, back: true })(steps.slice(0, i).find(st => !st.done));
};
function nextStep(type, id) {
  const on = trailId(), paths = DATA.paths.filter(p => p.steps.some(st => st.type === type && st.id === id))
    .sort((a, b) => (b.id === on) - (a.id === on) || pathRank(b) - pathRank(a));  // the route you're on comes first
  for (const p of paths) {
    const n = afterInPath(pathSteps(p), type, id);
    if (n) return { ...n.step, why: n.back ? `Still to do in ${p.title}` : `Next in ${p.title}` };
  }
  // Follow the topic's learning loop: the next stage that isn't done, in order.
  const lessonId = type === "lesson" ? id : (x => x && pageTopic(x))(type === "lab" ? LAB[id] : MISSION(id));
  if (lessonId && LESSON[lessonId]) {
    const l = LESSON[lessonId];
    // Coming from a lab or mission with the theory still unread: send there first.
    if (type !== "lesson" && !P.done[lessonId]) return { label: l.title, href: "#lesson-" + lessonId, kind: "lesson", why: "Understand: check you've got the theory" };
    const curKey = type === "lesson" ? "understand" : type === "lab" ? "experiment" : "diagnose";
    const nx = topicStages(lessonId).find(s => s.status !== "done" && s.status !== "none" && s.key !== curKey);
    if (nx) { const step = loopNext(nx); if (step) return step; }
    if (type === "lesson") {  // whole loop done (or understand-only topic): next lesson in the track
      const track = DATA.lessons.filter(x => x.track === l.track);
      const after = track.slice(track.indexOf(l) + 1).find(x => !P.done[x.id]) || DATA.lessons.find(x => !P.done[x.id] && x.id !== lessonId);
      if (after) return { label: after.title, href: "#lesson-" + after.id, kind: "lesson", why: after.track === l.track ? `Next in ${l.track}` : "A lesson you haven't done yet" };
    }
  }
  return null;
}
// The pages visited this session, so a "←" link can go back to the page you came from rather than a fixed section
// (stored per tab; read back as untrusted, so only strings starting with # are kept).
let crumbs = [];
try { crumbs = (JSON.parse(sessionStorage.getItem("pn-crumbs")) || []).filter(h => typeof h === "string" && h.startsWith("#")).slice(-20); } catch (e) { crumbs = []; }
function noteCrumb(h) {
  if (crumbs.at(-2) === h) crumbs.pop(); else if (crumbs.at(-1) !== h) crumbs.push(h);  // going back pops, like the browser
  crumbs = crumbs.slice(-20);
  try { sessionStorage.setItem("pn-crumbs", JSON.stringify(crumbs)); } catch (e) {}
}
/* THE ROUTE YOU'RE ON. Start from a route map, a path page or "Learn the basics" and the route stays with you for this
   visit: a bar above each of its stops shows where you are, with the stops either side, wherever else you wander. */
const trailId = () => { try { return sessionStorage.getItem("pn-trail"); } catch (e) { return null; } };
const setTrail = id => { try { if (id) sessionStorage.setItem("pn-trail", id); else sessionStorage.removeItem("pn-trail"); } catch (e) {} };
const trailPath = () => DATA.paths.find(p => p.id === trailId()) || null;
const trailSteps = () => (p => (p ? pathSteps(p) : []))(trailPath());
// Where a page (by its link) sits on a route's steps: its place and the stops either side, or null when it isn't one.
function trailStop(steps, hash) {
  const i = steps.findIndex(st => st.href === hash);
  return i < 0 ? null : { i, prev: steps[i - 1] || null, next: steps[i + 1] || null };
}
function drawTrail() {
  const bar = $("trail"), p = trailPath(), steps = trailSteps(), h = location.hash || "#today";
  if (!bar) return;
  // Going deeper on a stop's topic (its lab, mission or questions) still counts as being at that stop, so the bar keeps
  // its place and its Next stop rather than calling it a side trip.
  // With several stops on one topic, the one you came from most recently.
  const direct = trailStop(steps, h), topics = direct ? [] : topicsOf(h);
  const ofTopic = steps.filter(st => topicsOf(st.href, false).some(t => topics.includes(t))).map(st => st.href);
  const from = [...crumbs].reverse().find(c => ofTopic.includes(c)) || ofTopic[0];
  const at = direct || (from ? trailStop(steps, from) : null), deeper = !direct && !!at;
  // Off the route on a lesson, lab or mission (another topic's extras, say): a way back to the last stop you were on.
  const detail = /^#(lesson|lab|mission|agency)-/.test(h);
  const last = !at && detail && [...crumbs].reverse().map(c => trailStop(steps, c)).find(Boolean);
  if (!at && !last) { bar.hidden = true; bar.innerHTML = ""; return; }
  const name = p.title.replace(/^Path to /, ""), stop = st => `${st.label} (${KIND_WORD[st.kind] || st.kind})`;
  bar.dataset.trail = p.id; bar.hidden = false;
  if (!at) {
    const st = steps[last.i];
    bar.innerHTML = `<div class="trail-in off">
      <a class="trail-name" href="#path-${esc(p.id)}"><span class="eyebrow">Route · a side trip</span><b>${esc(name)}</b></a>
      <span class="trail-nav"><a class="btn ghost" href="${st.href}" aria-label="${esc(`Back to stop ${last.i + 1}: ${stop(st)}`)}">‹ Back to stop ${last.i + 1}</a></span>
      <button type="button" class="trail-x" aria-label="Leave this route">✕</button></div>`;
    bar.querySelector(".trail-x").addEventListener("click", () => { setTrail(null); drawTrail(); });
    return;
  }
  bar.innerHTML = `<div class="trail-in">
    <a class="trail-name" href="#path-${esc(p.id)}"><span class="eyebrow">Route${deeper ? " · going deeper" : ""}</span><b>${esc(name)}</b></a>
    <span class="trail-pos mono">Stop ${at.i + 1} of ${steps.length}</span>
    <ol class="trail-dots" aria-hidden="true">${steps.map((st, k) => `<li class="${k === at.i ? "here" : st.done ? "done" : ""}"></li>`).join("")}</ol>
    <span class="trail-nav">${at.prev ? `<a class="btn ghost" href="${at.prev.href}" aria-label="${esc("Previous stop: " + stop(at.prev))}">‹ Prev</a>` : ""}${at.next
      ? `<a class="btn brand" href="${at.next.href}" aria-label="${esc("Next stop: " + stop(at.next))}">Next stop ›</a>`
      : `<a class="btn brand" href="#path-${esc(p.id)}">Finish ›</a>`}</span>
    <button type="button" class="trail-x" aria-label="Leave this route">✕</button></div>`;
  bar.querySelector(".trail-x").addEventListener("click", () => { setTrail(null); drawTrail(); });
}
// Following a link inside anything marked with a route (data-trail) puts you on that route.
document.addEventListener("click", e => { const a = e.target.closest("a[href]"), t = a && a.closest("[data-trail]"); if (t) setTrail(t.dataset.trail); });

// Turn a loop stage into a next-step card.
function loopNext(s) {
  if (s.key === "experiment") { const x = DATA.labs.find(a => "#lab-" + a.id === s.href); return x && { label: x.title, href: s.href, kind: "lab", why: "Experiment: try it hands-on" }; }
  if (s.key === "diagnose") { const m = DATA.missions.find(a => "#mission-" + a.id === s.href); if (m) return { label: m.title, href: s.href, kind: "mission", why: "Diagnose: fix a real fault" };
    const sh = (DATA.agency || []).find(a => "#agency-" + a.id === s.href); return sh && { label: `PATCH//AGENCY: ${sh.title}`, href: s.href, kind: "agency", why: "Diagnose: work a real incident" }; }
  if (s.key === "prove") return { label: "Exam questions for this topic", href: s.href, kind: "prove", why: "Prove it: show you've got it", prove: s.prove };
  return null;
}
const GO_LABEL = { agency: "Clock in", lesson: "Start the lesson", lab: "Open the lab", mission: "Open the mission", game: "Play", ctf: "Go hunting", prove: "Start the questions" };
function nextStepCard(type, id) {
  const n = nextStep(type, id);
  return n ? `<section class="panel next-step"><div class="eyebrow">${esc(n.why)}</div><h2>Next: ${esc(n.label)}</h2><a class="btn brand" href="${n.href}"${n.prove ? ` data-prove='${esc(JSON.stringify(n.prove))}'` : ""} style="justify-self:start">${GO_LABEL[n.kind] || "Go"} ›</a></section>` : "";
}
// After a lab or mission: what was practised, where the theory lives, and what to do next.
const feedbackLine = what => (feedbackHref(what) ? `<p class="muted feedback-line">How was it? <a href="${esc(feedbackHref(what))}" target="_blank" rel="noopener">Tell us what worked and what didn't ↗</a>${/^https:\/\/github\.com\//.test(DATA.site.feedback || "") ? " (a public GitHub form; needs a free account)" : ""}.</p>` : "");
function showDoneCard(type, item, title) {
  const root = type === "lab" ? ($("lab-root") || main.querySelector(".view")) : $("mission-root");
  if (!root) return;
  root.querySelector("#done-card")?.remove();
  const ls = LESSON[item.lesson], n = nextStep(type, item.id);
  const strip = ls ? loopStrip(pageTopic(item), type === "lab" ? "experiment" : "diagnose") : "";
  root.insertAdjacentHTML("beforeend", `<section class="panel next-step" id="done-card" tabindex="-1"><div class="eyebrow">${esc(title)}</div>
    <h2>${esc(item.title)}</h2><p class="muted" style="margin:0">${esc(item.skill || item.summary)}</p>${strip}
    <div class="row">${n ? `<a class="btn brand" href="${n.href}"${n.prove ? ` data-prove='${esc(JSON.stringify(n.prove))}'` : ""}>Next: ${esc(n.label)} ›</a>` : ""}${ls && (!n || n.href !== "#lesson-" + ls.id) ? `<a class="btn ghost" href="#lesson-${esc(ls.id)}">Revisit the lesson: ${esc(ls.title)}</a>` : ""}<a class="link-btn" href="#missions">All missions and labs</a></div>${ls ? toTopButton() : ""}${feedbackLine(item.title)}</section>`);
  setTimeout(() => { const c = root.querySelector("#done-card"); c?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); c?.focus({ preventScroll: true }); }, 400);
}

// A key idea's picture: a device drawing (hw.js) or one of the small line icons (GLYPH in 07-labs).
const keyIcon = k => `<svg class="key-ic" viewBox="-22 -18 44 36" aria-hidden="true">${HW[k] ? hw(k, 0, 0, 0.62) : `<g class="gl">${GLYPH[k] || GLYPH.shield}</g>`}</svg>`;
const SECTION_NAME = { what: "What it is", diagram: "See it", concept: "See it", example: "Real case", defend: "How defenders stop it" };
function lessonView(id) {
  const l = LESSON[id]; if (!l) return VIEWS.learn();
  const related = DATA.news.filter(n => n.topics.includes(id)).slice(0, 5);
  const internal = l.practice.url.startsWith("#");
  const ours = x => x.lesson === id || (x.also || []).includes(id);
  const practice = [...DATA.missions.filter(ours).map(m => ({ kind: "Mission", href: "#mission-" + m.id, title: m.title, sub: m.card || m.summary, min: m.minutes, done: count((P.missions || {})[m.id]) > 0 })),
    ...(DATA.agency || []).filter(sh => (sh.lessons || []).includes(id)).map(sh => ({ kind: "Agency shift", href: "#agency-" + sh.id, title: sh.title, sub: sh.card || sh.summary, min: sh.minutes, done: !!(P.agency || {})[sh.id] })),
    ...DATA.labs.filter(ours).map(x => ({ kind: "Lab", href: "#lab-" + x.id, title: x.title, sub: x.card || x.skill, min: x.minutes, done: !!P.labs[x.id] }))];
  const lseen = new Set([id]);
  main.innerHTML = `<div class="view"${bannerAttr(id)}><article class="article lesson">
    <a class="link-btn" href="#learn">← All lessons</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">${esc(l.track)} · ${esc(l.level)} · ${l.minutes} min</div><h1>${esc(l.title)}</h1><p class="hook">${esc(l.hook)}</p></div>
    ${loopStrip(id, "understand")}
    <section id="l-what" tabindex="-1"><h2>What it is</h2>
      ${l.keys ? `<ul class="keys">${l.keys.map(k => `<li>${keyIcon(k.icon)}<b>${esc(k.label)}</b><span>${gloss(k.text, 1, lseen)}</span></li>`).join("")}</ul>
      <details class="more-what" id="l-what-more"><summary>Read the full explanation</summary><p>${gloss(l.what, 6, lseen)}</p></details>` : `<p>${gloss(l.what, 6, lseen)}</p>`}</section>
    ${l.tip ? `<aside class="qtip"><span class="qtip-k">★ Quick tip</span><p>${gloss(l.tip, 3, lseen)}</p></aside>` : ""}
    ${l.diagram ? `<section class="panel wide" id="l-diagram" tabindex="-1"><div class="panel-title"><h2>See it</h2><span class="eyebrow">Step through it</span></div><div id="lflow"><div class="empty">Loading the diagram…</div></div></section>` : ""}
    ${l.concept ? `<section class="panel wide" id="l-concept" tabindex="-1"><div class="panel-title"><h2>See it</h2><span class="eyebrow">${l.concept.type === "cards" ? "At a glance" : "Select a part"}</span></div><div id="lconcept"><div class="empty">Loading the diagram…</div></div></section>` : ""}
    <section class="case" id="l-example" tabindex="-1"><div class="eyebrow">Real case · ${esc(l.example.year)}</div><h3>${esc(l.example.title)}</h3><p>${gloss(l.example.text, 4, lseen)}</p>${l.example.source ? `<p class="muted" style="font-size:0.85rem">Source: <a href="${esc(l.example.source.url)}" target="_blank" rel="noopener">${esc(l.example.source.label)} ↗</a></p>` : ""}</section>
    <section id="l-defend" tabindex="-1"><h2>How defenders stop it</h2><ul class="checklist">${l.defend.map(d => `<li>${esc(d)}</li>`).join("")}</ul></section>
    <section class="panel${practice.length > 1 ? " wide" : ""}"><h2>Try it</h2>
      ${practice.length ? `<div class="try-list">${practice.map(x => `<a class="try-row" href="${x.href}"><span class="eyebrow">${x.kind} · ${x.min} min${x.done ? ' · <span style="color:var(--good)">✓ done</span>' : ""}</span><b>${esc(x.title)}</b><span class="muted">${esc(x.sub)}</span></a>`).join("")}</div>` : ""}
      ${internal ? (practice.length ? "" : `<a class="btn brand" href="${esc(l.practice.url)}" style="justify-self:start">${esc(l.practice.label)}</a>`)
        : `<p class="muted try-else">${practice.length ? "More practice elsewhere" : "Practise elsewhere"}: <a href="${esc(l.practice.url)}" target="_blank" rel="noopener">${esc(l.practice.label)} ↗</a></p>`}
    </section>
    <section class="panel" id="lcheck"><div class="panel-title"><h2>Check yourself</h2><span class="eyebrow" id="lcheck-n">${P.done[id] ? '<span style="color:var(--good)">Completed</span>' : `${l.checks.length} questions · +25 XP`}</span></div><div class="stack" id="lcheck-body"></div></section>
    <div id="lnext">${nextStepCard("lesson", id)}</div>
    ${toTopButton()}
    ${related.length ? `<section class="panel wide"><h2>In the news this week</h2><ul class="news-lines">${related.slice(0, 3).map(n => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)} ↗</a><span class="muted">${esc(n.source)} · ${ago(n.date)}</span></li>`).join("")}</ul></section>` : ""}
  </article></div>`;
  if (l.diagram) import("./js/flow.js").then(f => { if (parseRoute().path === "learn/" + id && $("lflow")) f.mount($("lflow"), l.diagram); })
    .catch(() => { if ($("lflow")) $("lflow").innerHTML = `<div class="empty">Couldn't load the diagram.</div>`; });
  if (l.concept) { const el = $("lconcept"); if (el) el.id = "lconcept-" + id; import("./js/concept.js").then(c => { const t = $("lconcept-" + id); if (parseRoute().path === "learn/" + id && t) c.mount(t, l.concept); })
    .catch(() => { const t = $("lconcept-" + id); if (t) t.innerHTML = `<div class="empty">Couldn't load the diagram.</div>`; }); }
  lessonChecks(l, id);
}
// Questions one at a time. A wrong answer explains why, points back to the section to re-read and asks again
// (with the options reshuffled); the lesson completes when every question has been answered correctly.
function lessonChecks(l, id) {
  const box = $("lcheck-body"), qs = l.checks;
  let i = 0;
  const ask = () => {
    if (i >= qs.length) {
      const first = !P.done[id];
      if (first) { P.done[id] = true; award(25, "Lesson complete"); }
      $("lcheck-n").innerHTML = '<span style="color:var(--good)">Completed</span>';
      box.innerHTML = `<div class="feedback"><b class="ok">All ${qs.length} correct.</b> ${first ? "Lesson complete: +25 XP." : "Nicely done."}</div><button class="btn ghost" type="button" data-again style="justify-self:start">↺ Practise again</button>`;
      $("lnext").innerHTML = nextStepCard("lesson", id);
      return;
    }
    const q = qs[i];
    box.innerHTML = `<div class="eyebrow">Question ${i + 1} of ${qs.length}</div>`;
    box.appendChild(quizBlock(mixOptions(q), {
      onAnswer: (choice, correct, wrap) => {
        const row = document.createElement("div"); row.className = "row";
        row.innerHTML = correct ? `<button class="btn brand" type="button" data-nextq>${i + 1 < qs.length ? "Next question ›" : "Finish"}</button>`
          : `<button class="btn ghost" type="button" data-retry>↺ Try again</button>${q.see && $("l-" + q.see) ? `<button class="link-btn" type="button" data-see="${q.see}">Re-read: ${SECTION_NAME[q.see]} ↑</button>` : ""}`;
        wrap.appendChild(row);
        row.querySelector("button")?.focus();
      }
    }));
  };
  box.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-nextq")) { i++; ask(); }
    else if (b.hasAttribute("data-retry")) ask();
    else if (b.hasAttribute("data-again")) { i = 0; ask(); }
    else if (b.dataset.see) { const t = $("l-" + b.dataset.see); if (b.dataset.see === "what" && $("l-what-more")) $("l-what-more").open = true; t.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); t.focus({ preventScroll: true }); }
  });
  ask();
}

/* GLOSSARY */
const GLS = { q: "", kind: "All", focus: null };
const GL_ALL = [
  ...DATA.glossary.map(g => ({ ...g, key: g.id })),
  ...Object.entries(DATA.cwe).map(([id, c]) => ({ key: id, id: null, term: c.name, kind: "Bug type", aliases: [id], short: c.plain, more: "How it's prevented: " + c.defend })),
].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
VIEWS.glossary = () => {
  const kinds = ["All", ...new Set(GL_ALL.map(g => g.kind))];
  main.innerHTML = `<div class="view">
    <div class="view-head"><a class="link-btn" href="#learn">← Learn</a><div class="eyebrow">Glossary</div><h1>Cyber security, decoded</h1>
      <p>${GL_ALL.length} terms in plain English. Across the site, dotted words like <button type="button" class="term" data-g="rce" aria-expanded="false">RCE</button> or <button type="button" class="term" data-g="sonicwall-sma" aria-expanded="false">SMA</button> open these explanations when you hover over or tap them.</p></div>
    <div class="controls">
      <div class="row"><label class="sr" for="glq">Search the glossary</label><input id="glq" type="search" placeholder="Search terms (e.g. VPN, infostealer, Fortinet)" value="${esc(GLS.q)}"></div>
      <div class="row" id="glk">${kinds.map(k => `<button class="chip" data-k="${esc(k)}" aria-pressed="${GLS.kind === k}">${esc(k)}</button>`).join("")}</div>
    </div>
    <div class="eyebrow" id="glc" aria-live="polite"></div>
    <h2 class="sr-only">Terms</h2><div class="gl-list" id="gll"></div>
  </div>`;
  const draw = () => {
    const q = GLS.q.trim().toLowerCase();
    const rows = GL_ALL.filter(g => (GLS.kind === "All" || g.kind === GLS.kind) && (!q || (g.term + " " + g.aliases.join(" ") + " " + g.short).toLowerCase().includes(q)));
    $("glc").textContent = `${rows.length} terms`;
    let letter = "", html = "";
    rows.forEach(g => {
      const L = /[a-z]/i.test(g.term[0]) ? g.term[0].toUpperCase() : "#";
      if (L !== letter && !q) { letter = L; html += `<div class="gl-letter" aria-hidden="true">${L}</div>`; }
      const see = (g.see || []).filter(x => GLOSS[x]);
      const aka = g.aliases.filter(a => a.toLowerCase() !== g.term.toLowerCase()).slice(0, 6);
      html += `<article class="gl-item" id="g-${esc(g.key)}"><div class="pk">${esc(g.kind)}</div><h3>${esc(g.term)}</h3>
        ${aka.length ? `<div class="aka">Also: ${aka.map(esc).join(" · ")}</div>` : ""}
        <p>${esc(g.short)}</p>${g.more ? `<p class="muted">${esc(g.more)}</p>` : ""}
        <div class="row">${g.lesson && LESSON[g.lesson] ? `<a class="topic" href="#lesson-${esc(g.lesson)}">Lesson: ${esc(LESSON[g.lesson].title)}</a>` : ""}${see.map(x => `<button type="button" class="term" data-g="${x}" aria-expanded="false" style="font-size:0.82rem">${esc(GLOSS[x].term)}</button>`).join(" ")}</div>
      </article>`;
    });
    $("gll").innerHTML = html || `<div class="empty">No terms match. Try a shorter search.</div>`;
  };
  $("glq").addEventListener("input", e => { GLS.q = e.target.value; draw(); });
  $("glk").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; GLS.kind = b.dataset.k;
    $("glk").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b)); draw(); });
  draw();
  if (GLS.focus) {
    const el = document.getElementById("g-" + GLS.focus); GLS.focus = null;
    if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); });
  }
};

