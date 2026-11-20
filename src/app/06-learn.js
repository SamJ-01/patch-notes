/* LEARN */
const LS = { track: "All", level: "All", gq: "" };
// Tracks in learning order; any new track in lessons.json is added at the end rather than dropped.
const LESSON_TRACKS = [...new Set(["Foundations", "Threats", "Defence", "Web attacks", ...DATA.lessons.map(l => l.track)])];

// How the Learn, Practise and Exams catalogues are shown: illustrated cards (default) or a compact one-line list.
// A per-viewer convenience kept in this browser only, not scored progress (so no FRESH()/cleanProgress change).
const viewMode = () => { try { return localStorage.getItem("pn-view") === "compact" ? "compact" : "cards"; } catch (e) { return "cards"; } };
const setViewMode = m => { try { m === "compact" ? localStorage.setItem("pn-view", "compact") : localStorage.removeItem("pn-view"); } catch (e) {} };
const viewToggle = () => `<div class="view-toggle" role="group" aria-label="How to show the catalogue">
  <button type="button" class="vt" data-view="cards" aria-pressed="${viewMode() === "cards"}">Cards</button>
  <button type="button" class="vt" data-view="compact" aria-pressed="${viewMode() === "compact"}">Compact</button></div>`;
// A compact catalogue row (shared look with the list redesign): title, a short meta, and a done tick.
const listRow = (href, label, sub, done) => `<a class="learn-row" href="${href}"><b>${esc(label)}</b><span>${esc(sub || "")}</span>${done ? '<span class="done-mark">Done</span>' : "<span></span>"}</a>`;
// Switching Cards/Compact re-renders the current index view; the choice sticks for the visit and across the site.
document.addEventListener("click", e => {
  const b = e.target.closest?.(".vt"); if (!b || b.getAttribute("aria-pressed") === "true") return;
  setViewMode(b.dataset.view); const r = parseRoute(); if (r && r.draw) r.draw();
});

VIEWS.learn = () => {
  const tracks = ["All", ...LESSON_TRACKS.filter(t => DATA.lessons.some(l => l.track === t))];
  const LEVEL_ORDER = ["Beginner", "Intermediate", "Advanced"];
  const levels = ["All", ...LEVEL_ORDER.filter(lv => DATA.lessons.some(l => l.level === lv))];
  const doneCount = DATA.lessons.filter(l => P.done[l.id]).length;
  const compact = viewMode() === "compact";
  const pathRow = p => { const steps = pathSteps(p), done = steps.filter(s => s.done).length;
    return listRow("#path-" + esc(p.id), p.title.replace(/^Path to /, ""), `${done} of ${steps.length}`, P.paths[p.id]); };
  main.innerHTML = `<div class="view">
    <div class="view-head"><h1>The concepts behind the headlines</h1>
      <p>Build your understanding through visual lessons, guided learning paths and practical examples.</p>
      <p class="muted learn-start">New? <a href="#path-awareness" data-trail="awareness">Start with the basics</a>. Not sure which job? <a href="#careers">Compare the five jobs</a>.</p>
    </div>
    <div class="row" style="justify-content:space-between;align-items:center">
      <div class="row" id="ltracks" role="group" aria-label="Filter lessons by track">${tracks.map(t => `<button class="chip" data-t="${esc(t)}" aria-pressed="${LS.track === t}">${esc(t)}</button>`).join("")}</div>
      <div class="row" style="gap:12px;align-items:center">${viewToggle()}<div class="progress"><span class="trk" aria-hidden="true"><i style="width:${Math.round(doneCount / Math.max(1, DATA.lessons.length) * 100)}%"></i></span><span>${doneCount} of ${DATA.lessons.length} done</span></div></div>
    </div>
    ${levels.length > 2 ? `<div class="row level-filter" id="llevels" role="group" aria-label="Filter lessons by level"><span class="eyebrow level-lead">Level</span>${levels.map(lv => `<button class="chip chip-sm" data-l="${esc(lv)}" aria-pressed="${LS.level === lv}">${esc(lv)}</button>`).join("")}</div>` : ""}
    <section class="stack" style="gap:12px"><div class="panel-title"><h2 class="eyebrow" style="font-size:0.8rem">Learning paths</h2><span class="muted" style="font-size:0.85rem">Finish a path for +${PATH_XP} XP and a badge</span></div>
      ${(ps => compact ? `<div class="learn-list">${ps.map(pathRow).join("")}</div>` : `<div class="paths-grid">${ps.map(pathCard).join("")}</div>`)(DATA.paths.filter(p => !p.exam))}</section>
    <div class="stack" id="lgrid" style="gap:30px"></div>
    <section class="panel" style="grid-template-columns:minmax(0,1fr) auto;align-items:center">
      <div class="stack" style="gap:6px"><h2>Glossary</h2><p class="muted">${DATA.glossary.length + Object.keys(DATA.cwe).length} terms in plain English. Dotted words anywhere on the site open them.</p></div>
      <a class="btn brand" href="#glossary">Open glossary</a>
    </section>
  </div>`;
  const card = l => `
    <a class="lcard art-card" href="#lesson-${esc(l.id)}">${cardArt(l.id)}${P.done[l.id] ? '<span class="done">DONE</span>' : ""}
      <h3>${esc(l.title)}</h3><p>${esc(l.hook)}</p>
      <span class="lmeta"><span>${l.minutes} min</span><span>${esc(l.level)}</span></span></a>`;
  const row = l => listRow("#lesson-" + esc(l.id), l.title, `${l.minutes} min · ${esc(l.level)}`, P.done[l.id]);
  const lvOK = l => LS.level === "All" || l.level === LS.level;
  const drawGrid = () => {
    // Cards keep the illustrated catalogue; compact is a dense one-line list per track. Filtered by track and level.
    const shown = LESSON_TRACKS.filter(t => (LS.track === "All" || LS.track === t) && DATA.lessons.some(l => l.track === t && lvOK(l)));
    $("lgrid").innerHTML = shown.length
      ? shown.map(t => { const items = DATA.lessons.filter(l => l.track === t && lvOK(l));
          return `<section class="stack" style="gap:${compact ? 0 : 12}px">${LS.track === "All" ? `<h2 class="cat-h">${esc(t)}</h2>` : ""}${compact ? `<div class="learn-list">${items.map(row).join("")}</div>` : `<div class="lessons">${items.map(card).join("")}</div>`}</section>`; }).join("")
      : `<p class="muted" style="padding:6px 0">No ${LS.level === "All" ? "" : esc(LS.level.toLowerCase()) + " "}lessons in this track yet. Try another level or track.</p>`;
  };
  const wire = (id, key) => { const el = $(id); if (!el) return; el.addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; LS[key] = b.dataset[key === "track" ? "t" : "l"];
    el.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b)); drawGrid(); }); };
  wire("ltracks", "track"); wire("llevels", "level");
  drawGrid();
};
function pathCard(p) {
  const steps = pathSteps(p), done = steps.filter(s => s.done).length;
  return `<a class="lcard" href="#path-${esc(p.id)}">${P.paths[p.id] ? '<span class="done">DONE</span>' : ""}<span class="eyebrow">${steps.length} steps</span><h3>${esc(p.title)}</h3><p>${esc(p.blurb)}</p>
    <div class="progress"><span class="trk" aria-hidden="true"><i style="width:${Math.round(done / steps.length * 100)}%"></i></span><span>${done}/${steps.length}</span></div></a>`;
}
// Every stop says which step of the site's rhythm it is, in the words the home page's "How Patch Notes works" strip uses
// (20 Nov): Learn (a lesson), Practise (a lab, the game, the flag hunt), Investigate (a mission or an Agency shift).
const STAGE_OF = { lesson: "learn", lab: "practise", game: "practise", ctf: "practise", mission: "investigate", agency: "investigate" };
const STAGE_NAME = { learn: "Learn", practise: "Practise", investigate: "Investigate" };
const KIND_NAME = { lesson: "lesson", lab: "lab", game: "game", ctf: "flag hunt", mission: "mission", agency: "Agency shift" };
// Where a path leads (20 Nov): the job it's for, in a line, and the next step: the exam route that fits it and, for
// the beginner and IT Support paths, the job path to take next. Every career path has `leadsTo` (tested).
function leadsToHtml(p, career) {
  const lt = p.leadsTo || {}, route = lt.exam && DATA.paths.find(x => x.exam === lt.exam), cert = lt.exam && DATA.certs.find(c => c.id === lt.exam);
  const next = (lt.paths || []).map(id => DATA.paths.find(x => x.id === id)).filter(Boolean);
  if (!career && !route && !next.length) return "";
  return `<section class="leads panel" aria-labelledby="leads-h"><h2 id="leads-h">Where this leads</h2>
    ${career ? `<p><b>${esc(career.name)}.</b> ${esc(career.tagline)} Job titles: ${career.titles.map(esc).join(", ")}. <a href="#careers">Read the career guide</a>.</p>` : ""}
    <div class="row leads-next">${route ? `<a class="btn brand" href="#path-${esc(route.id)}">Next: the ${esc(cert ? cert.name : route.title)} exam route →</a>` : ""}
      ${next.map(n => `<a class="btn ${route ? "ghost" : "brand"}" href="#path-${esc(n.id)}">Next: ${esc(n.title)} →</a>`).join("")}</div></section>`;
}
function pathView(id) {
  const p = DATA.paths.find(x => x.id === id); if (!p) return notFound(VIEWS.learn);
  const steps = pathSteps(p), done = steps.filter(s => s.done).length;
  const career = p.career && DATA.careers.paths.find(c => c.id === p.career);
  main.innerHTML = `<div class="view"><article class="article">
    <a class="link-btn" href="#learn">← Learn</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">Learning path · ${done}/${steps.length} done</div><h1>${esc(p.title)}</h1><p class="hook">${esc(p.blurb)}</p></div>
    <div class="progress"><span class="trk" aria-hidden="true" style="flex-basis:100%"><i style="width:${Math.round(done / steps.length * 100)}%"></i></span></div>
    <ol class="steps" data-trail="${esc(p.id)}">${steps.map((st, i) => `<li class="${st.done ? "got" : ""}"><span class="st">${i + 1}${st.done ? '<span class="st-tick" aria-hidden="true">✓</span><span class="sr-only"> (done)</span>' : ""}</span><span class="stack" style="gap:2px"><span class="eyebrow st-stage st-${STAGE_OF[st.kind] || "learn"}">${esc((STAGE_NAME[STAGE_OF[st.kind]] || "Learn") + " · " + (KIND_NAME[st.kind] || st.kind))}</span><a href="${st.href}"${st.flags ? ' data-play-mode="flags"' : st.kind === "game" ? ' data-play-mode="phish"' : ""}>${esc(st.label)}</a></span></li>`).join("")}</ol>
    ${leadsToHtml(p, career)}
    <p class="muted">${P.paths[p.id] ? `Completed on ${esc(P.paths[p.id])}. Nice work.` : `Finish every step to earn <strong>+${PATH_XP} XP</strong> and the Pathfinder badge.`}${career ? ` See the <a href="#careers">${esc(career.name || career.role)}</a> career guide.` : ""}</p>
    ${P.paths[p.id] ? pathRecordHtml(p, steps) : ""}
  </article></div>`;
  if (P.paths[p.id]) wirePathRecord();
}
// A printable record for a finished path. The name is typed for printing only and never saved. It says plainly
// that it records practice here and is not a qualification.
function pathRecordHtml(p, steps) {
  return `<section class="path-rec-wrap" aria-labelledby="path-rec-h"><h2 id="path-rec-h">Your path record</h2>
    <div class="row path-rec-tools"><label class="path-rec-name">Name to print (not saved) <input type="text" id="path-rec-input" maxlength="60" autocomplete="name"></label>
      <button type="button" class="btn brand" id="path-rec-print">Print or save as PDF</button></div>
    <div class="path-rec" id="path-rec">
      <div class="path-rec-top"><span class="ag-logo sm">PATCH<b>//</b>NOTES</span><span class="mono">Path record</span></div>
      <p class="path-rec-for">This records that</p><p class="path-rec-who" id="path-rec-who">A Patch Notes learner</p>
      <p class="path-rec-for">completed every stop of</p><h3>${esc(p.title.replace(/^Path to /, ""))}</h3>
      <ol class="path-rec-steps">${steps.map(st => `<li>${esc(st.label)}</li>`).join("")}</ol>
      <p class="path-rec-date">Completed on ${esc(P.paths[p.id])} · patchnoteslab.com</p>
      <p class="path-rec-note">A record of practice on a free learning site. It is not a qualification or a certification.</p>
    </div></section>`;
}
function wirePathRecord() {
  const inp = $("path-rec-input"), who = $("path-rec-who");
  inp?.addEventListener("input", () => { who.textContent = inp.value.trim() || "A Patch Notes learner"; });
  $("path-rec-print")?.addEventListener("click", () => {
    // Print a copy of the record on its own, outside the page layout, then tidy up.
    const box = document.createElement("div"); box.id = "print-root"; box.appendChild($("path-rec").cloneNode(true)); box.firstChild.removeAttribute("id");
    document.body.appendChild(box); document.body.classList.add("printing-record");
    const done = () => { document.body.classList.remove("printing-record"); box.remove(); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); print();
  });
}

/* CERTIFICATIONS: exam objectives mapped onto existing lessons, labs and missions */
const COVERAGE = { strong: ["Hands-on practice here", "good"], partial: ["Partly covered", "sun"], none: ["Not covered yet", "muted"] };
function certActivity(a) {
  if (a.type === "lesson") { const l = LESSON[a.id]; return l && { label: l.title, href: "#lesson-" + a.id, done: !!P.done[a.id] }; }
  if (a.type === "lab") { const l = DATA.labs.find(x => x.id === a.id); return l && { label: l.title, href: "#lab-" + a.id, done: !!P.labs[a.id] }; }
  if (a.type === "mission") { const m = MISSION(a.id); return m && { label: m.title, href: "#mission-" + a.id, done: count((P.missions || {})[a.id]) > 0 }; }
  if (a.type === "agency") { const sh = SHIFT(a.id); return sh && { label: `PATCH//AGENCY: ${sh.title}`, href: "#agency-" + a.id, done: !!(P.agency || {})[a.id] }; }
  if (a.type === "pbq") { const f = PBQ(a.id); return f && { label: `PBQ: ${f.q.title}`, href: "#pbq-" + a.id, done: (P.pbq[a.id] ?? -1) >= PBQ_PASS }; }
  if (a.type === "tool" && CERT_TOOLS[a.id]) return { label: CERT_TOOLS[a.id], href: "#" + a.id, done: null };  // a tool: nothing to complete
  return null;
}
// Practice progress for one objective: mapped activities you've completed (tools don't count).
function objectiveProgress(o) {
  const acts = o.activities.map(certActivity).filter(Boolean), countable = acts.filter(a => a.done !== null);
  return { acts, done: countable.filter(a => a.done).length, total: countable.length };
}
const CERT_TOOLS = { "subnet-calc": "Subnet calculator", "headers-check": "Email header checker", "log-search": "Log search", "cvss-decode": "CVSS decoder" };
const certObjectives = c => c.domains.flatMap(d => d.objectives.map(o => ({ ...o, domain: d,
  activities: [...o.activities, ...(c.pbqs || []).filter(q => q.objectives.includes(o.id)).map(q => ({ type: "pbq", id: q.id }))] })));
// Performance-based questions (content/pbq/<cert>.json, static/js/pbq.js): find one, with its exam.
const PBQ = id => { for (const c of DATA.certs) { const q = (c.pbqs || []).find(x => x.id === id); if (q) return { q, c }; } return null; };
const PBQ_PASS = 70;  // a best score at or above this counts the PBQ as practised
// Exam prep has its own tab, so certification material doesn't crowd the lessons.
VIEWS.exams = () => {
  const compact = viewMode() === "compact";
  const certRow = c => { const objs = certObjectives(c), practised = objs.filter(o => { const p = objectiveProgress(o); return p.total && p.done === p.total; }).length;
    return listRow("#cert-" + esc(c.id), c.name, `${practised} of ${objs.length} practised`, false); };
  main.innerHTML = `<div class="view">
    <div class="view-head"><h1>Exam prep</h1>
      <p>CompTIA objectives mapped to what you can practise here, with practice questions, mock exams and an honest "Am I ready?" check.</p></div>
    <div class="row" style="justify-content:flex-end">${viewToggle()}</div>
    <h2 class="sr-only">Certifications</h2>
    ${compact ? `<div class="learn-list">${DATA.certs.map(certRow).join("")}</div>` : `<div class="paths exam-cards">${DATA.certs.map(certCard).join("")}</div>`}
    <p class="muted cert-note">The questions are original, not real exam questions. It's preparation, not a guarantee of passing.</p>
  </div>`;
};
// The exam's performance-based questions: the hands-on tasks that open the real exam.
function pbqPanel(c) {
  if (!(c.pbqs || []).length) return "";
  return `<section class="panel wide pbq-panel" aria-labelledby="pbq-h"><div class="panel-title"><h2 id="pbq-h">Performance-based questions</h2><span class="eyebrow">${c.pbqs.length} PBQs · original, not real exam tasks</span></div>
    <p class="muted" style="margin:0">The real exam opens with a few hands-on tasks like these, marked part by part. Practise them here with no time pressure, then against the clock.</p>
    <div class="try-list">${c.pbqs.map(q => { const best = P.pbq[q.id];
      return `<a class="try-row" href="#pbq-${esc(q.id)}"><span class="eyebrow">${esc(PBQ_KINDS[q.kind] || q.kind)} · about ${q.minutes} min · ${q.objectives.map(esc).join(", ")}${best != null ? ` · <span style="color:var(${best >= PBQ_PASS ? "--good" : "--sun"})">best ${best}%</span>` : ""}</span><b>${esc(q.title)}</b></a>`; }).join("")}</div></section>`;
}
const PBQ_KINDS = { match: "Match", order: "Put in order", subnet: "Fill in the table", firewall: "Configure the firewall", cli: "Command line" };
// One PBQ on its own page (#pbq-<id>), under the Exams tab.
// After a PBQ: the next one for this exam (wrapping), the lab it's built on, and back to the exam page (20 Nov).
function pbqNext(q, c) {
  const all = c.pbqs || [], i = all.findIndex(x => x.id === q.id), nx = all.length > 1 ? all[(i + 1) % all.length] : null;
  const lab = q.lab && LAB[q.lab];
  return `<nav class="pbq-next row" aria-label="What next">${nx ? `<a class="btn brand" href="#pbq-${esc(nx.id)}">Next PBQ: ${esc(nx.title)} →</a>` : ""}
    ${lab ? `<a class="btn ghost" href="#lab-${esc(lab.id)}">Practise in the lab: ${esc(lab.title)}</a>` : ""}<a class="btn ghost" href="#cert-${esc(c.id)}">All ${esc(c.name)} practice</a></nav>`;
}
function pbqView(id) {
  const f = PBQ(id); if (!f) return notFound(VIEWS.exams);
  const { q, c } = f, names = Object.fromEntries(certObjectives(c).map(o => [o.id, o.title]));
  main.innerHTML = `<div class="view"><article class="article lesson" style="max-width:940px"><a class="link-btn" href="#cert-${esc(c.id)}">← ${esc(c.name)}</a>
    <header class="lesson-open"><p class="eyebrow">PBQ · ${esc(c.exam)} · ${q.objectives.map(o => `${esc(o)} ${esc(names[o] || "")}`).join(" · ")}</p><h1>${esc(q.title)}</h1></header>
    <div id="pbq-root"><div class="empty">Loading…</div></div>
    ${pbqNext(q, c)}
    ${toTopButton()}</article></div>`;
  Promise.all([import("./js/pbq.js"), q.lab ? loadFull("labs", LAB[q.lab]) : null]).then(([m]) => {
    if (parseRoute().path !== "exams/pbq/" + id) return;
    m.mount($("pbq-root"), q, { lab: q.lab ? DATA.labs.find(l => l.id === q.lab) : null, best: P.pbq[id] ?? null, onScore: pct => {
      const before = P.pbq[id];
      if (before == null || pct > before) P.pbq[id] = pct;
      if ((before ?? -1) < PBQ_PASS && pct >= PBQ_PASS) { award(30, `PBQ: ${q.title}`); celebrate("PBQ passed!", `${q.title} · ${pct}%`); }
      saveP();
    } });
  }).catch(() => { $("pbq-root").innerHTML = `<div class="empty">Couldn't load this PBQ. If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`; });
}
function certCard(c, i) {
  const objs = certObjectives(c), practised = objs.filter(o => { const p = objectiveProgress(o); return p.total && p.done === p.total; }).length;
  const unit = objs.length === c.domains.length ? "domains" : "objectives";  // Security+ and PenTest+ are mapped by domain
  const route = (DATA.paths || []).find(p => p.exam === c.id), stops = route ? (route.steps || route.stops || []).length : 0;
  return `<a class="lcard exam-card" href="#cert-${esc(c.id)}"><span class="eyebrow">${typeof i === "number" ? `Step ${i + 1} · ` : ""}${esc(c.exam)}</span><h3>${esc(c.name)}</h3>
    <p>${esc(c.card || "Practice questions, timed mock exams, a step-by-step route and where to study the rest.")}</p>
    <dl class="exam-facts"><div><dt>Questions</dt><dd>${c.questions.length}</dd></div>${(c.pbqs || []).length ? `<div><dt>PBQs</dt><dd>${c.pbqs.length}</dd></div>` : ""}<div><dt>${unit[0].toUpperCase() + unit.slice(1)}</dt><dd>${objs.length}</dd></div>${stops ? `<div><dt>Stops</dt><dd>${stops}</dd></div>` : ""}</dl>
    <div class="progress"><span class="trk" aria-hidden="true"><i style="width:${Math.round(practised / objs.length * 100)}%"></i></span><span>${practised} of ${objs.length} practised</span></div></a>`;
}
// Practice question results: { [questionId]: { r: times right, w: times wrong, last: 1|0 } }
function recordAnswer(q, right) {
  const s = P.exam[q.id] || (P.exam[q.id] = { r: 0, w: 0, last: 0 });
  if (right && !s.r) award(5, "Exam question", { quiet: true });
  right ? s.r++ : s.w++; s.last = right ? 1 : 0; saveP();
}
const MASTERY_LABEL = { new: ["Not tried", "muted"], started: ["Started", "sun"], weak: ["Revise", "bad"], strong: ["All correct", "good"] };
// Mock exam options on the cert page: length (what the bank can fill), timer, feedback. Saved as P.mockPrefs.
// The lengths and defaults come from exam.js (mockLengths, mockSettings) once it loads; until then the
// form shows the usual 20 questions, timed, feedback at the end.
function mockOptions(c) {
  const opt = (name, value, label, on) => `<label class="ex-choice"><input type="radio" name="${name}" value="${value}"${on ? " checked" : ""}><span>${label}</span></label>`;
  return `<form class="ex-setup" id="mock-setup" aria-labelledby="mock-h"><h3 id="mock-h">Mock exam</h3>
    <fieldset><legend>Questions</legend><div class="ex-choices" id="mock-n">${opt("mock-n", 20, "20", true)}</div></fieldset>
    <fieldset><legend>Timer</legend><div class="ex-choices">${opt("mock-timed", "1", "Timed (exam pace)", true)}${opt("mock-timed", "0", "Untimed", false)}</div></fieldset>
    <fieldset><legend>Feedback</legend><div class="ex-choices">${opt("mock-fb", "end", "At the end, like the exam", true)}${opt("mock-fb", "each", "After each question", false)}</div></fieldset>
    <p class="muted ex-setup-note" id="mock-note" aria-live="polite"></p>
    <div class="row"><button class="btn ghost" type="button" data-practice="mock" id="mock-go">Start mock exam</button></div></form>`;
}
function wireMockOptions(c) {
  const form = $("mock-setup"); if (!form) return;
  import("./js/exam.js").then(ex => {
    if (!form.isConnected) return;
    const lengths = ex.mockLengths(c.questions, c.domains);
    if (!lengths.length) { form.hidden = true; return; }
    const show = () => {
      const pace = ex.examPace(c.format), s = ex.mockSettings(P.mockPrefs, lengths, pace);
      form.querySelector("#mock-n").innerHTML = lengths.map(n => `<label class="ex-choice"><input type="radio" name="mock-n" value="${n}"${n === s.n ? " checked" : ""}><span>${n}${n === 90 ? " (full length)" : ""}</span></label>`).join("");
      form.querySelector(`[name="mock-timed"][value="${s.timed ? 1 : 0}"]`).checked = true;
      form.querySelector(`[name="mock-fb"][value="${s.feedback}"]`).checked = true;
      const k = Math.min(ex.mockPbqCount(s.n), (c.pbqs || []).length);
      const mins = ex.mockMinutes(s.minutes, Array(k).fill(null), pace);
      form.querySelector("#mock-go").textContent = `Start: ${k ? `${k} PBQ${k > 1 ? "s" : ""} + ` : ""}${s.n} questions${mins ? `, about ${mins} minutes` : ", untimed"}`;
      form.querySelector("#mock-note").textContent = s.real ? "Exam conditions: this one counts towards \"Am I ready?\"."
        : "Practice mode: good for learning, but only timed mocks of 20+ questions with feedback at the end count towards \"Am I ready?\".";
    };
    form.addEventListener("submit", e => e.preventDefault());
    form.addEventListener("change", () => {
      const v = name => (form.querySelector(`[name="${name}"]:checked`) || {}).value;
      P.mockPrefs = { n: Number(v("mock-n")), ...(v("mock-timed") === "0" ? { timed: false } : {}), ...(v("mock-fb") === "each" ? { feedback: "each" } : {}) };
      saveP(); show();
    });
    show();
  }).catch(() => {});
}
function startPractice(c, mode, questions, title, lesson = null, prefs = P.mockPrefs) {
  // A mock opens with PBQs (as the real exam does), so their module loads with the exam's.
  const wantPbq = mode === "mock" && (c.pbqs || []).length;
  Promise.all([import("./js/exam.js"), wantPbq ? import("./js/pbq.js") : null, loadQuestions(c)]).then(async ([ex, pb]) => {
    if (parseRoute().path !== "exams/" + c.id) return;
    proveTopic = lesson;
    const names = Object.fromEntries(certObjectives(c).map(o => [o.id, o.title]));
    main.innerHTML = `<div class="view"><article class="article lesson"><a class="link-btn" href="#cert-${esc(c.id)}">← ${esc(c.name)} objectives</a><h1 class="sr-only">${esc(c.name)} practice: ${esc(title)}</h1><section class="panel wide ex" id="ex-root"></section></article></div>`;
    window.scrollTo(0, 0);
    // Practice is drawn under the cert's own hash, so following the link wouldn't change it (no hashchange).
    main.querySelector(".lesson > .link-btn").addEventListener("click", e => { e.preventDefault(); certView(c.id); drawTrail(); window.scrollTo(0, 0); });
    if (lesson) { topicTop(main.querySelector(".lesson"), lesson, "prove"); drawTrail(); }
    const pace = ex.examPace(c.format), set = ex.mockSettings(prefs, ex.mockLengths(c.questions, c.domains), pace);  // {} = exam conditions
    const pbqs = pb ? ex.pickMockPbqs(c.pbqs, ex.mockPbqCount(set.n)) : [];
    await Promise.all(pbqs.filter(q => q.lab).map(q => loadFull("labs", LAB[q.lab])));  // a command-line PBQ needs its lab's network
    if (parseRoute().path !== "exams/" + c.id) return;
    ex.mount($("ex-root"), { title, mode, questions: mode === "mock" ? ex.buildMock(c.questions, c.domains, set.n) : questions,
      minutes: ex.mockMinutes(set.minutes, pbqs, pace), instant: set.feedback === "each", pbqs,
      mountPbq: pb && ((host, q, o) => pb.mount(host, q, { ...o, lab: q.lab ? DATA.labs.find(l => l.id === q.lab) : null })),
      onPbq: (q, pct) => { if (pct > (P.pbq[q.id] ?? 0)) P.pbq[q.id] = pct; },
      objectiveName: id => names[id] || id, onAnswer: recordAnswer,
      onFinish: r => { if (r.mode === "mock") { (P.mocks[c.id] || (P.mocks[c.id] = [])).push({ d: todayStr(), score: r.score, total: r.total, ...(set.real ? {} : { practice: 1 }) }); P.mocks[c.id] = P.mocks[c.id].slice(-20); saveP(); award(20, "Mock exam completed"); celebrate("Mock exam done", `${r.score} of ${r.total} correct`); } },
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
    // The default mock (exam conditions) at this exam's own pace, with its PBQ counted as one question of time.
    const pace = ex.examPace(c.format), hasPbq = (c.pbqs || []).length > 0, mockMins = ex.mockMinutes(ex.mockSettings({}, undefined, pace).minutes, hasPbq ? [null] : [], pace);
    const [head, tone, base] = READY_VERDICT[r.verdict];
    const weakest = r.rows.filter(x => x.score !== null && x.score < ex.READY.domain).sort((a, b) => a.score - b.score)[0];
    const missing = [weakest && `${weakest.d.id} ${weakest.d.name} is at ${pctOf(weakest.score)}% (aim for ${pctOf(ex.READY.domain)}%+ in every domain)`,
      r.qTotal && (r.mockPct === null ? "you haven't taken a mock exam yet" : r.mockPct < ex.READY.mock && `your last mock was ${pctOf(r.mockPct)}% (aim for ${pctOf(ex.READY.mock)}%+)`)].filter(Boolean);
    const detail = r.verdict === "close" ? `Still to do: ${missing.join("; ") || "push your overall score past " + pctOf(ex.READY.overall) + "%"}.`
      : r.verdict === "ready" ? `${r.elsewhere ? `Before you book, cover the ${r.elsewhere} objective${r.elsewhere === 1 ? "" : "s"} Patch Notes doesn't teach yet, and ` : "Before you book, "}try a full-length practice exam from another provider too.` : base;
    const qLine = x => { const qs = x.objs.reduce((s, o) => s + o.m.total, 0), right = x.objs.reduce((s, o) => s + o.m.right, 0), ad = x.objs.reduce((s, o) => s + o.p.done, 0), at = x.objs.reduce((s, o) => s + o.p.total, 0);
      return [qs && `${right}/${qs} questions right`, at && `${ad}/${at} activities done`].filter(Boolean).join(" · ") || "Nothing to check here yet"; };
    const planRow = it => {
      if (it.kind === "mock") return `<button class="try-row" type="button" data-practice="mock" data-real="1"><span class="eyebrow">Mock exam</span><b>Take a mock exam</b><span class="muted">${hasPbq ? "1 PBQ + " : ""}${ex.MOCK_SIZE} questions in about ${mockMins} minutes (exam pace), feedback at the end. ${pctOf(ex.READY.mock)}% or more counts towards ready.</span></button>`;
      const tag = `${esc(it.o.id)} · ${esc(it.o.title)}`;
      if (it.kind === "activity") return `<a class="try-row" href="${it.next.href}"><span class="eyebrow">${tag}</span><b>${esc(it.next.label)}</b><span class="muted">${it.fresh ? "Start here" : "One of your weakest domains"}: ${esc(it.domain.name)}</span></a>`;
      const why = { wrong: ["Revise", "You got a question here wrong last time."], new: ["Try", "Not tried yet."], finish: ["Finish", "Some questions here are still unanswered."] }[it.why];
      return `<button class="try-row" type="button" data-practice-obj="${esc(it.o.id)}"><span class="eyebrow">${tag}</span><b>${why[0]} the ${esc(it.o.id)} questions</b><span class="muted">${why[1]}</span></button>`;
    };
    const mock = r.lastMock ? `Last mock exam: <b>${r.lastMock.score}/${r.lastMock.total}</b> (${pctOf(r.mockPct)}%) on ${esc(new Date(r.lastMock.d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}.` : r.qTotal ? "No mock exam yet." : "";
    el.innerHTML = `<div class="panel-title"><h2 id="ready-h">Am I ready?</h2><span class="eyebrow">${pctOf(r.overall)}% on what Patch Notes can check</span></div>
      <p class="ready-verdict ${tone}"><b>${esc(head)}.</b> ${esc(detail)}</p>
      <details class="ready-each"${r.verdict === "start" ? "" : " open"}><summary>Each domain</summary><ul class="ready-domains">${r.rows.map(x => `<li><span class="rd-name"><b class="mono">${esc(x.d.id)}</b> ${esc(x.d.name)} <span class="muted">${x.d.weight}% of the exam</span></span>
        <span class="trk" aria-hidden="true"><i class="${x.score === null ? "" : readyTone(x.score)}" style="width:${pctOf(x.score)}%"></i></span>
        <span class="rd-pct mono">${x.score === null ? "–" : pctOf(x.score) + "%"}</span><span class="muted rd-ev">${qLine(x)}${x.elsewhere ? ` · ${x.elsewhere} not taught here yet` : ""}</span></li>`).join("")}</ul></details>
      ${mock ? `<p class="muted" style="margin:0">${mock}</p>` : ""}
      ${examDateHtml(c, ex, r)}
      ${r.plan.length ? `<h3 class="cert-h">Your study plan</h3><div class="try-list ready-plan">${r.plan.map(planRow).join("")}</div>` : ""}
      ${r.elsewhere && c.study ? `<p class="muted" style="margin:0">${r.elsewhere} objective${r.elsewhere === 1 ? " has" : "s have"} practice questions here but no lessons yet. Learn ${r.elsewhere === 1 ? "it" : "them"} with <a href="${esc(c.study.url)}" target="_blank" rel="noopener">${esc(c.study.label)} ↗</a>, then come back to test yourself.</p>` : ""}
      <details class="ready-how"><summary>How this is worked out</summary><p class="muted">Each objective scores from the questions you got right last time (counted double, because they test you) and the lessons, labs and missions you've finished. Domains are weighted like the real exam. "Ready" means ${pctOf(ex.READY.overall)}%+ overall, ${pctOf(ex.READY.domain)}%+ in every domain${r.qTotal ? ` and ${pctOf(ex.READY.mock)}%+ on your latest mock` : ""}. That's Patch Notes' own bar, not CompTIA's scoring, so it's a guide to what to study, not a promise you'll pass.</p></details>`;
      wireExamDate(c, progress);
  }).catch(() => { const el = $("cert-ready"); if (el) el.innerHTML = `<div class="panel-title"><h2 id="ready-h">Am I ready?</h2></div><p class="muted" style="margin:0">Couldn't load the readiness check. Try reloading the page.</p>`; });
}
// "My exam is on…": the date is saved per cert (P.examDates), and exam.js weekPlan spreads the objectives that
// still need work across the weeks left, keeping the last week for timed mocks.
const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function examDateHtml(c, ex, r) {
  const date = P.examDates[c.id] || "", plan = date ? ex.weekPlan({ examDate: date, today: todayStr(), rows: r.rows }) : null;
  const body = !plan ? `<p class="muted" style="margin:0">Set the date you sit ${esc(c.exam)} and get a week-by-week plan from what still needs work.</p>`
    : plan.past ? `<p class="muted" style="margin:0">That date has passed. Set your next one, or clear it.</p>`
    : `<p class="ed-left"><b>${plan.days === 0 ? "It's today. Good luck." : `${plan.days} day${plan.days === 1 ? "" : "s"} to go`}</b>${plan.days ? ` <span class="muted">until ${esc(shortDay(date))}</span>` : ""}</p>
      <ol class="week-plan">${plan.weeks.map(w => `<li class="${w.mocks ? "wk-mock" : ""}"><span class="wk-when"><b>Week ${w.n}</b><span class="muted">${esc(shortDay(w.from))}${w.to !== w.from ? ` to ${esc(shortDay(w.to))}` : ""}</span></span>
        <span class="wk-what">${w.focus.length ? w.focus.map(o => `<button type="button" class="chip" data-practice-obj="${esc(o.id)}" title="Practise ${esc(o.id)}">${esc(o.id)} ${esc(o.title)}</button>`).join("")
          : w.mocks ? `<span>Take timed mock exams and revise your weakest domain.</span>` : `<span class="muted">Everything here is strong: keep drilling questions.</span>`}
          ${w.mocks && w.focus.length ? `<span>Then a timed mock exam.</span>` : ""}</span></li>`).join("")}</ol>`;
  return `<section class="exam-date" aria-labelledby="ed-h"><h3 class="cert-h" id="ed-h">Your exam date</h3>
    <div class="row ed-set"><label class="ed-label">I sit ${esc(c.exam)} on <input type="date" id="ed-input" value="${esc(date)}" min="${esc(todayStr())}"></label>
      ${date ? `<button type="button" class="btn ghost" id="ed-clear">Clear the date</button>` : ""}</div>${body}
    ${DATA.safety?.examdate ? `<p class="muted ed-saved">${esc(DATA.safety.examdate.text)}</p>` : ""}</section>`;
}
function wireExamDate(c, progress) {
  const inp = $("ed-input"); if (!inp) return;
  inp.addEventListener("change", () => { if (/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) { P.examDates[c.id] = inp.value; saveP(); readinessPanel(c, progress); } });
  $("ed-clear")?.addEventListener("click", () => { delete P.examDates[c.id]; saveP(); readinessPanel(c, progress); });
}
function certView(id) {
  const c = DATA.certs.find(x => x.id === id); if (!c) return notFound(VIEWS.exams);
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
    ${c.versionNote ? `<aside class="cert-version" role="note"><b>Which version?</b> ${esc(c.versionNote.text)} <a href="${esc(c.versionNote.url)}" target="_blank" rel="noopener">${esc(c.versionNote.label)} ↗</a></aside>` : ""}
    <p class="muted cert-note">${esc(c.note)} Objectives last checked ${esc(reviewed)} against <a href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.label)} ↗</a>.</p>
    ${(jobs => jobs.length ? `<p class="cert-jobs"><span class="eyebrow">Jobs this exam supports</span> ${jobs.map(p => `<a class="chip" href="#path-${esc(p.id)}">${esc(p.title.replace(/^Path to /, ""))} →</a>`).join(" ")}</p>` : "")(DATA.paths.filter(p => p.career && p.leadsTo?.exam === c.id))}
    ${(r => r ? `<a class="btn brand" href="#path-${esc(r.id)}" style="justify-self:start">Follow the ${esc(r.title.replace(/^Path to /, ""))} route: ${r.steps.length} stops →</a>` : "")(DATA.paths.find(p => p.exam === c.id))}
    <section class="panel wide"><div class="panel-title"><h2>Your progress</h2><span class="eyebrow">${practised} of ${objs.length} objectives practised</span></div>
      <div class="progress"><span class="trk" aria-hidden="true" style="flex:1 1 auto"><i style="width:${Math.round(practised / objs.length * 100)}%"></i></span></div>
      <p class="muted" style="margin:0">Coverage on Patch Notes: ${cov("strong")} with hands-on practice · ${cov("partial")} partly covered · ${cov("none")} not covered yet.</p>
    </section>
    ${c.questions.length ? `<section class="panel wide"><div class="panel-title"><h2>Practice questions</h2><span class="eyebrow">${c.questions.length} original questions · not real exam questions</span></div>
      <p class="muted" style="margin:0">Every answer explains why it's right or wrong. Your results mark each objective below as started, to revise, or all correct.</p>
      <div class="row"><button class="btn brand" type="button" data-practice="weak">Revise weak spots</button></div>
      ${mockOptions(c)}</section>` : ""}
    ${pbqPanel(c)}
    <section class="panel wide ready" id="cert-ready" aria-labelledby="ready-h"><div class="panel-title"><h2 id="ready-h">Am I ready?</h2></div><p class="muted" style="margin:0">Working it out…</p></section>
    ${c.domains.map(d => `<section class="panel wide cert-domain"><div class="panel-title"><h2>${esc(d.id)} ${esc(d.name)}</h2><span class="eyebrow">${d.weight}% of the exam</span></div>
      <ul class="cert-list">${d.objectives.map(o => { const p = progress.get(o.id), [label, tone] = COVERAGE[o.coverage];
        return `<li class="cert-obj"><div class="cert-top"><b class="mono">${esc(o.id)}</b><span class="cert-title">${esc(o.title)}</span><span class="cert-badge ${tone}">${label}</span>${p.total ? `<span class="cert-done${p.done === p.total ? " ok" : ""}">${p.done}/${p.total} done</span>` : ""}${qCount(o.id) ? (() => { const m = objMastery(o.id), [ml, mt] = MASTERY_LABEL[m.level]; return `<span class="cert-badge ${mt}" title="${m.right} of ${m.total} questions right last time">Questions: ${ml}${m.answered ? ` ${m.right}/${m.total}` : ""}</span><button class="link-btn" type="button" data-practice-obj="${esc(o.id)}">Practise ${qCount(o.id)} ›</button>`; })() : ""}</div>
          ${p.acts.length ? `<div class="row cert-acts">${p.acts.map(a => `<a class="topic" href="${a.href}">${a.done ? "✓ " : ""}${esc(a.label)}</a>`).join("")}</div>` : ""}
          ${o.gap ? `<p class="muted cert-gap">${esc(o.gap)}</p>` : ""}</li>`; }).join("")}</ul></section>`).join("")}
    ${c.study ? `<p class="muted cert-note">For the parts not covered here, <a href="${esc(c.study.url)}" target="_blank" rel="noopener">${esc(c.study.label)} ↗</a> follows the same objective numbers.</p>` : ""}
  </article></div>`;
  readinessPanel(c, progress);
  wireMockOptions(c);
  main.querySelector("article").addEventListener("click", e => {
    const b = e.target.closest("[data-practice], [data-practice-obj]"); if (!b || b.disabled) return;
    const oid = b.dataset.practiceObj;
    if (oid) return startPractice(c, "drill", c.questions.filter(q => q.objective === oid), `Objective ${oid}`);
    if (b.dataset.practice === "mock") return startPractice(c, "mock", null, `${c.name} mock exam`, null, b.dataset.real ? {} : P.mockPrefs);
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
// Most labs are the Experiment stage; a lab marked `stage: "diagnose"` is a work-it-out case that fills the Diagnose
// stage instead (for topics with no mission or shift), so the loop stays complete without a packet simulator.
const labStage = x => (x && x.stage === "diagnose") ? "diagnose" : "experiment";
function topicStages(lessonId) {
  const l = LESSON[lessonId]; if (!l) return [];
  const stages = [{ key: "understand", status: P.done[lessonId] ? "done" : "now", href: "#lesson-" + lessonId }];
  // A lab or mission belongs to its own lesson and to any it lists in `also`; a shift to the lessons it lists. Own ones first.
  const mine = list => list.filter(x => x.lesson === lessonId).concat(list.filter(x => x.lesson !== lessonId && (x.also || []).includes(lessonId)));
  const labs = mine(DATA.labs).filter(x => labStage(x) === "experiment");
  // Each stage keeps its items ({ href, title, done }), so a stage with several can list them all (loopItems).
  if (labs.length) { const items = labs.map(x => ({ href: "#lab-" + x.id, title: x.title, done: !!P.labs[x.id] })), d = items.filter(i => i.done).length, nx = items.find(i => !i.done) || items[0];
    stages.push({ key: "experiment", status: d === items.length ? "done" : d ? "part" : "open", href: nx.href, count: items.length > 1 ? `${d}/${items.length}` : "", items }); }
  const faults = [...mine(DATA.missions).map(m => ({ href: "#mission-" + m.id, title: m.title, done: count((P.missions || {})[m.id]) > 0 })),
    ...(DATA.agency || []).filter(sh => (sh.lessons || []).includes(lessonId)).map(sh => ({ href: "#agency-" + sh.id, title: `PATCH//AGENCY: ${sh.title}`, done: !!(P.agency || {})[sh.id] })),
    ...mine(DATA.labs).filter(x => labStage(x) === "diagnose").map(x => ({ href: "#lab-" + x.id, title: x.title, done: !!P.labs[x.id] }))];
  if (faults.length) { const d = faults.filter(f => f.done).length, nx = faults.find(f => !f.done) || faults[0];
    stages.push({ key: "diagnose", status: d === faults.length ? "done" : d ? "part" : "open", href: nx.href, count: faults.length > 1 ? `${d}/${faults.length}` : "", items: faults }); }
  const prove = lessonProveTargets(lessonId);
  if (prove) { const m = proveMastery(prove);
    stages.push({ key: "prove", status: m.level === "strong" ? "done" : m.answered ? "part" : "open", href: "#cert-" + prove.cert.id,
      prove: { certId: prove.cert.id, objIds: prove.objIds, title: `${l.title}: prove it`, lesson: lessonId }, count: `${m.total} Q` }); }
  return Object.keys(LOOP_META).map(key => stages.find(s => s.key === key) || { key, status: "none" });
}
// The horizontal stage strip. `current` is the stage the learner is on now (not a link).
function loopStrip(lessonId, current, label = "This topic's steps") {
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
    <nav class="looptrack" aria-label="${esc(label)}">${stages.map(node).join('<span class="loop-arr" aria-hidden="true">→</span>')}</nav>
    ${loopItems(stages.find(s => s.key === current), location.hash, label)}</div>`;
}
// On a stage with several items (Experiment 1/2, say), list them all under the strip, the one you're on marked, with a
// link to the next: otherwise the only way to the others was to leave the stage and come back.
function loopItems(stage, here, label = "This topic's steps") {
  const items = stage?.items || []; if (items.length < 2) return "";
  const at = items.findIndex(i => i.href === here);
  const what = { experiment: "experiments", diagnose: "cases" }[stage.key] || "items";
  const name = label === "This topic's steps" ? `All ${what} in this topic` : `${esc(label)}: all ${what}`;  // the done card repeats the strip
  const chip = i => i.href === here ? `<span class="chip on" aria-current="page">${i.done ? "✓ " : ""}${esc(i.title)}</span>`
    : `<a class="chip" href="${esc(i.href)}">${i.done ? '<span aria-hidden="true">✓ </span><span class="sr-only">(done) </span>' : ""}${esc(i.title)}</a>`;
  // In list order, wrapping round, so Next always leads somewhere.
  const prev = at >= 0 ? items[(at - 1 + items.length) % items.length] : null, next = at >= 0 ? items[(at + 1) % items.length] : items.find(i => !i.done) || items[0];
  if (items.length <= 4) return `<nav class="loop-items" aria-label="${name}"><span class="loop-items-h">All ${items.length} ${what}:</span>
    ${items.map(chip).join("")}${next && next.href !== here ? `<a class="btn ghost loop-next" href="${esc(next.href)}">Next: ${esc(next.title)} ›</a>` : ""}</nav>`;
  const done = items.filter(i => i.done).length;
  return `<nav class="loop-items long" aria-label="${name}">
    ${prev ? `<a class="btn ghost" href="${esc(prev.href)}" aria-label="Previous: ${esc(prev.title)}">‹ Previous</a>` : ""}
    <span class="loop-pos">${at >= 0 ? `${at + 1} of ${items.length}` : `${items.length} ${what}`}<span class="muted"> · ${done} done</span></span>
    <a class="btn ghost loop-next" href="${esc(next.href)}">Next: ${esc(next.title)} ›</a>
    <details class="loop-all"><summary>All ${items.length} ${what}</summary><div class="loop-all-list">${items.map(chip).join("")}</div></details></nav>`;
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
    const curKey = type === "lesson" ? "understand" : type === "lab" ? labStage(LAB[id]) : "diagnose";
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
    const sh = (DATA.agency || []).find(a => "#agency-" + a.id === s.href); if (sh) return { label: `PATCH//AGENCY: ${sh.title}`, href: s.href, kind: "agency", why: "Diagnose: work a real incident" };
    const lb = DATA.labs.find(a => "#lab-" + a.id === s.href); return lb && { label: lb.title, href: s.href, kind: "lab", why: "Diagnose: work out what's wrong" }; }
  if (s.key === "prove") return { label: "Exam questions for this topic", href: s.href, kind: "prove", why: "Prove it: show you've got it", prove: s.prove };
  return null;
}
const GO_LABEL = { agency: "Clock in", lesson: "Start the lesson", lab: "Open the lab", mission: "Open the mission", game: "Play", ctf: "Go hunting", prove: "Start the questions" };
function nextStepCard(type, id) {
  const n = nextStep(type, id);
  return n ? `<section class="panel next-step"><div class="eyebrow">${esc(n.why)}</div><h2>Next: ${esc(n.label)}</h2><a class="btn brand" href="${n.href}"${n.prove ? ` data-prove='${esc(JSON.stringify(n.prove))}'` : ""} style="justify-self:start">${GO_LABEL[n.kind] || "Go"} ›</a></section>` : "";
}
// After a lab or mission: what was practised, where the theory lives, and what to do next.
const feedbackLine = what => { const href = feedbackHref(what); if (!href) return ""; const hash = href.startsWith("#"), gh = /^https:\/\/github\.com\//.test(DATA.site.feedback || ""); return `<p class="muted feedback-line">How was it? <a href="${esc(href)}"${hash ? "" : ' target="_blank" rel="noopener"'}>Tell us what worked and what didn't${hash ? "" : " ↗"}</a>${gh ? " (a public GitHub form; needs a free account)" : ""}.</p>`; };
function showDoneCard(type, item, title) {
  const root = type === "lab" ? ($("lab-root") || main.querySelector(".view")) : $("mission-root");
  if (!root) return;
  root.querySelector("#done-card")?.remove();
  const ls = LESSON[item.lesson], n = nextStep(type, item.id);
  const strip = ls ? loopStrip(pageTopic(item), type === "lab" ? labStage(item) : "diagnose", "Where this leaves the topic") : "";  // a second copy of the bar, so its own landmark name
  root.insertAdjacentHTML("beforeend", `<section class="panel next-step" id="done-card" tabindex="-1"><div class="eyebrow">${esc(title)}</div>
    <h2>${esc(item.title)}</h2><p class="muted" style="margin:0">${esc(item.skill || item.summary)}</p>${strip}
    <div class="row">${n ? `<a class="btn brand" href="${n.href}"${n.prove ? ` data-prove='${esc(JSON.stringify(n.prove))}'` : ""}>Next: ${esc(n.label)} ›</a>` : ""}${ls && (!n || n.href !== "#lesson-" + ls.id) ? `<a class="btn ghost" href="#lesson-${esc(ls.id)}">Revisit the lesson: ${esc(ls.title)}</a>` : ""}<a class="link-btn" href="#missions">All missions and labs</a></div>${ls ? toTopButton() : ""}${feedbackLine(item.title)}</section>`);
  setTimeout(() => { const c = root.querySelector("#done-card"); c?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); c?.focus({ preventScroll: true }); }, 400);
}

const picturePre = l => !!(l.diagram || l.explainer);
const SECTION_NAME = { what: "What it is", diagram: "See it", concept: "See it", xpl: "See it", example: "Real case", defend: "How defenders stop it" };
// The first two sentences are the lesson. The rest stays one click away. A picture never shares the page with a second "See it".
const ledeOf = text => {
  const parts = String(text).match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  return { lede: parts.slice(0, 2).join(" ").trim(), more: parts.length > 2 };
};
// "On the job" (20 Nov): which of the site's five jobs use this topic and how, linking to each job's path, so a lesson
// always answers "who does this at work?". Every lesson has a `job` { roles: [career ids], text } (tested).
const jobLinks = roles => roles.map(r => { const c = DATA.careers.paths.find(x => x.id === r), p = DATA.paths.find(x => x.career === r); return c && p ? `<a class="chip" href="#path-${esc(p.id)}">${esc(c.name)} →</a>` : ""; }).join("");
globalThis.PN_jobLinks = jobLinks;  // the Agency debrief (static/js/agency/ui.js) links its jobs the same way
function jobBlock(l, seen) {
  if (!l.job) return "";
  const roles = jobLinks(l.job.roles);
  return `<section class="job-block" id="l-job" tabindex="-1" aria-labelledby="l-job-h"><h2 id="l-job-h">On the job</h2><p>${gloss(l.job.text, 3, seen)}</p>
    <div class="row job-roles"><span class="eyebrow">Jobs that use it</span>${roles}</div></section>`;
}
function lessonView(id) {
  const l = LESSON[id]; if (!l) return notFound(VIEWS.learn);
  const internal = l.practice.url.startsWith("#");
  const ours = x => x.lesson === id || (x.also || []).includes(id);
  const practice = [...DATA.missions.filter(ours).map(m => ({ kind: "Mission", href: "#mission-" + m.id, title: m.title, sub: m.card || m.summary, min: m.minutes, done: count((P.missions || {})[m.id]) > 0 })),
    ...(DATA.agency || []).filter(sh => (sh.lessons || []).includes(id)).map(sh => ({ kind: "Agency shift", href: "#agency-" + sh.id, title: sh.title, sub: sh.card || sh.summary, min: sh.minutes, done: !!(P.agency || {})[sh.id] })),
    ...DATA.labs.filter(ours).map(x => ({ kind: "Lab", href: "#lab-" + x.id, title: x.title, sub: x.card || x.skill, min: x.minutes, done: !!P.labs[x.id] }))];
  const lseen = new Set([id]);
  const lede = ledeOf(l.what);
  const scene = l.diagram?.scene === "stage" || l.diagram?.scene === "screens";
  const both = l.id === "identity" || l.id === "encryption";
  const showDiagram = !!l.diagram && (scene || !l.explainer);
  const showExplainer = !!l.explainer && (!showDiagram || both);
  // A concept usually gives way to an explainer; `explainer.withConcept` keeps both (attack models: the kill chain
  // walked through, then all four models side by side).
  const showConcept = !!l.concept && !showDiagram && (!showExplainer || !!l.explainer?.withConcept);
  // A lesson can also have a photo scene (l.scene) beside its concept diagram: the panel then opens on the photo,
  // with a Photo / Diagram switch, so neither teaching picture is lost.
  const showScene = !!l.scene && (showConcept || !picturePre(l));
  const picture = showDiagram || showExplainer || showConcept || showScene;
  const leadMail = l.diagram?.steps?.[0]?.stage?.kind === "mail";
  const leadPicture = leadMail || l.diagram?.scene === "route";
  const seeBlock = picture ? (leadPicture
    ? `<section class="lesson-mail${l.diagram?.scene === "route" ? " is-wide" : ""}" id="l-see"><div id="l-diagram" tabindex="-1"><div id="lflow"><div class="empty">Loading the diagram…</div></div></div></section>`
    : `<section class="panel wide screen" id="l-see"><div class="panel-title"><h2>See it</h2></div>
      ${showExplainer ? `<div id="l-xpl" tabindex="-1">${l.explainer.why ? `<p class="muted xpl-why">${gloss(l.explainer.why, 2)}</p>` : ""}<div id="lxpl"><div class="empty">Loading…</div></div></div>` : ""}
      ${showDiagram ? `<div id="l-diagram" tabindex="-1">${l.diagram.why ? `<p class="muted xpl-why">${gloss(l.diagram.why, 2)}</p>` : ""}<div id="lflow"><div class="empty">Loading the diagram…</div></div></div>` : ""}
      ${showScene && showConcept ? `<div class="see-switch" role="group" aria-label="What to show"><button type="button" class="chip" data-view="photo" aria-pressed="true">Photo</button><button type="button" class="chip" data-view="diagram" aria-pressed="false">Diagram</button></div>` : ""}
      ${showScene ? `<div id="l-scene" tabindex="-1">${l.scene.why ? `<p class="muted xpl-why">${gloss(l.scene.why, 2)}</p>` : ""}<div id="lscene"><div class="empty">Loading the photo…</div></div></div>` : ""}
      ${showConcept ? `<div id="l-concept" tabindex="-1"${showScene ? " hidden" : ""}>${l.concept.why ? `<p class="muted xpl-why">${gloss(l.concept.why, 2)}</p>` : ""}<div id="lconcept"><div class="empty">Loading the diagram…</div></div></div>` : ""}
    </section>`) : "";
  if (typeof PN_help === "function") PN_help({ kind: "lesson", lesson: l });
  main.innerHTML = `<div class="view"><article class="article lesson">
    <a class="link-btn" href="#learn">← All lessons</a>
    <header class="lesson-open"><p class="eyebrow">${esc(l.track)} · ${esc(l.level)} · ${l.minutes} min</p><h1>${esc(l.title)}</h1></header>
    ${loopStrip(id, "understand")}
    ${seeBlock}
    <section id="l-what" tabindex="-1"><p class="hook">${esc(l.hook)}</p><p>${gloss(lede.lede, 2, lseen)}</p>
      ${lede.more ? `<details class="more-what" id="l-what-more"><summary>Read the full explanation</summary><p>${gloss(l.what, 6, lseen)}</p></details>` : ""}</section>
    ${l.tip ? `<div class="qtip" role="note"><span class="qtip-k">★ Quick tip</span><p>${gloss(l.tip, 3, lseen)}</p></div>` : ""}
    <section class="case" id="l-example" tabindex="-1"><div class="eyebrow">Real case · ${esc(l.example.year)}</div><h2 class="case-h">${esc(l.example.title)}</h2><p>${gloss(l.example.text, 4, lseen)}</p>${l.example.source ? `<p class="muted" style="font-size:0.85rem">Source: <a href="${esc(l.example.source.url)}" target="_blank" rel="noopener">${esc(l.example.source.label)} ↗</a></p>` : ""}</section>
    <section id="l-defend" tabindex="-1"><h2>How defenders stop it</h2><ul class="checklist">${l.defend.map(d => `<li>${esc(d)}</li>`).join("")}</ul></section>
    ${jobBlock(l, lseen)}
    <section class="doc panel${practice.length > 1 ? " wide" : ""}"><h2>Try it</h2>
      ${[].concat(l.safety || []).map(k => safeNote(k)).join("")}
      ${practice.length ? `<div class="try-list">${practice.map(x => `<a class="try-row" href="${x.href}"><span class="eyebrow">${x.kind} · ${x.min} min${x.done ? ' · <span style="color:var(--good)">✓ done</span>' : ""}</span><b>${esc(x.title)}</b><span class="muted">${esc(x.sub)}</span></a>`).join("")}</div>` : ""}
      ${internal ? (practice.length ? "" : `<a class="btn brand" href="${esc(l.practice.url)}" style="justify-self:start">${esc(l.practice.label)}</a>`)
        : `<p class="muted try-else">${practice.length ? "More practice elsewhere" : "Practise elsewhere"}: <a href="${esc(l.practice.url)}" target="_blank" rel="noopener">${esc(l.practice.label)} ↗</a></p>`}
    </section>
    <section class="doc panel" id="lcheck"><div class="panel-title"><h2>Check yourself</h2><span class="eyebrow" id="lcheck-n">${P.done[id] ? '<span style="color:var(--good)">Completed</span>' : `${l.checks.length} questions`}</span></div><div class="stack" id="lcheck-body"></div></section>
    <div id="lnext">${nextStepCard("lesson", id)}</div>
    ${toTopButton()}
  </article></div>`;
  if (showDiagram) import("./js/flow.js").then(f => { if (parseRoute().path === "learn/" + id && $("lflow")) f.mount($("lflow"), l.diagram); })
    .catch(() => { if ($("lflow")) $("lflow").innerHTML = `<div class="empty">Couldn't load the diagram.</div>`; });
  if (showScene) { const el = $("lscene"); if (el) el.id = "lscene-" + id; import("./js/concept.js").then(c => { const t = $("lscene-" + id); if (parseRoute().path === "learn/" + id && t) c.mount(t, l.scene); })
    .catch(() => { const t = $("lscene-" + id); if (t) t.innerHTML = `<div class="empty">Couldn't load the photo.</div>`; }); }
  main.querySelector(".see-switch")?.addEventListener("click", e => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    const photo = b.dataset.view === "photo";
    main.querySelectorAll(".see-switch [data-view]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("l-scene").hidden = !photo; $("l-concept").hidden = photo;
  });
  if (showConcept) { const el = $("lconcept"); if (el) el.id = "lconcept-" + id; import("./js/concept.js").then(c => { const t = $("lconcept-" + id); if (parseRoute().path === "learn/" + id && t) c.mount(t, l.concept); })
    .catch(() => { const t = $("lconcept-" + id); if (t) t.innerHTML = `<div class="empty">Couldn't load the diagram.</div>`; }); }
  if (showExplainer) import("./js/explainers.js").then(x => { if (parseRoute().path === "learn/" + id && $("lxpl")) x.mount($("lxpl"), l.explainer.kind, { ...(l.explainer.opts || {}), head: false }); })
    .catch(() => { if ($("lxpl")) $("lxpl").innerHTML = `<div class="empty">Couldn't load the explainer.</div>`; });
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

