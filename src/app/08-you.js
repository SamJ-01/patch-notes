/* PROGRESS */
let resetArmed = 0;

// The on-site feedback form. Submits straight to Formspree (DATA.site.feedbackPost, an endpoint like
// https://formspree.io/f/<id>, so no email address is in the page) from the browser as JSON, so the site stays
// static and the person needs no account and never leaves the page. Nothing is saved locally. Formspree's own
// script isn't used: the page's security policy only runs scripts it serves itself.
VIEWS.feedback = () => {
  const endpoint = DATA.site.feedbackPost || "";
  const checks = (name, opts, type) => opts.map(o => `<label class="fb-opt"><input type="${type}" name="${esc(name)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("");
  main.innerHTML = `<div class="view"><article class="article" style="max-width:720px">
    <a class="link-btn" href="#today">← Home</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">Feedback</div><h1>Tell me what you think</h1>
      <p class="hook">Two minutes, no name or account needed, and it stays between us. Anything that confused or annoyed you is the most useful thing you can say.</p></div>
    ${safeNote("feedback")}
    <form id="fb-form" class="panel stack" style="gap:20px" novalidate>
      <fieldset class="fb-set"><legend>What did you try?</legend>
        <div class="fb-opts">${checks("tried", ["Lessons", "Labs", "Missions", "Agency (SOC shift)", "Exam prep or a mock", "News or CVE Radar", "Games"], "checkbox")}</div></fieldset>
      <fieldset class="fb-set"><legend>What device were you on?</legend>
        <div class="fb-opts">${checks("Device", ["Phone", "Tablet", "Laptop or desktop"], "radio")}</div></fieldset>
      <div class="stack" style="gap:6px"><label for="fb-stuck"><b>What confused you, was wrong, or annoyed you?</b> <span class="muted">Name the page if you can.</span></label>
        <textarea id="fb-stuck" name="What confused, was wrong or annoying" rows="4" maxlength="4000"></textarea></div>
      <fieldset class="fb-set"><legend>How likely are you to use it again?</legend>
        <div class="fb-opts fb-scale">${checks("Likely to use again (1-5)", ["1", "2", "3", "4", "5"], "radio")}</div>
        <p class="muted" style="margin:4px 0 0">1 = not at all, 5 = definitely.</p></fieldset>
      <div class="stack" style="gap:6px"><label for="fb-else"><b>Anything else?</b> <span class="muted">Optional.</span></label>
        <textarea id="fb-else" name="Anything else" rows="3" maxlength="4000"></textarea></div>
      <div class="stack" style="gap:6px"><label for="fb-email"><b>Your email</b> <span class="muted">Optional, only if you want a reply.</span></label>
        <input id="fb-email" name="email" type="email" maxlength="254" autocomplete="email" inputmode="email" spellcheck="false"></div>
      <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="fb-honey">
      <div class="row"><button class="btn brand" type="submit" id="fb-send">Send feedback</button></div>
      <p class="muted" id="fb-note" role="status" aria-live="polite" style="margin:0"></p>
    </form>
  </article></div>`;
  const form = $("fb-form"), note = $("fb-note"), btn = $("fb-send");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (form.querySelector('[name="_gotcha"]').value) return;  // a bot filled the hidden field (Formspree's honeypot)
    const fd = new FormData(form), tried = fd.getAll("tried"), body = {};
    for (const [k, v] of fd.entries()) { if (k === "tried" || k === "_gotcha" || !String(v).trim()) continue; body[k] = v; }
    if (tried.length) body["What they tried"] = tried.join(", ");
    if (!Object.keys(body).length) { note.textContent = "Add a word or two first, then send."; return; }
    body._subject = "Patch Notes feedback";
    // Formspree uses the sender's address as reply-to only when the field is called "email", which it already is.
    btn.disabled = true; note.textContent = "Sending…";
    try {
      if (!endpoint) throw new Error("no endpoint set");
      // Give up after 15 s so a stalled relay can't leave the button stuck on "Sending…".
      const r = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        // Formspree explains a refused submission (for example an invalid email address) in errors[].message.
        const why = await r.json().then(j => (j.errors || []).map(x => x.message).filter(Boolean).join(" ")).catch(() => "");
        throw Object.assign(new Error(why || "bad status " + r.status), { refused: !!why });
      }
      form.innerHTML = `<div class="feedback"><b class="ok">Thank you.</b> Your feedback is on its way, and it really does shape what gets built next.</div>
        <a class="btn ghost" href="#today" style="justify-self:start">Back to the site</a>`;
    } catch (err) {
      btn.disabled = false;
      note.textContent = err.refused
        ? `Couldn't send that: ${err.message}`
        : "Couldn't send just now, sorry. Check your connection and try again in a moment.";
    }
  });
};

VIEWS.progress = () => {
  const r = rank(), prog = r.next ? (P.xp - r.floor) / (r.next - r.floor) : 1;
  const stats = [["XP", P.xp], ["Lessons", `${count(P.done)}/${DATA.lessons.length}`], ["Labs", `${count(P.labs)}/${DATA.labs.length}`], ["Flags", `${count(P.flags)}/3`], ["Paths", `${count(P.paths)}/${DATA.paths.length}`], ["Days practised", count(P.days)], ["Terms", count(P.terms)], ["Badges", `${count(P.badges)}/${BADGES.length}`]];
  main.innerHTML = `<div class="view">
    <div class="view-head"><h1>uid=${esc(r.name)}</h1>
      <p>${r.next ? `${(r.next - P.xp).toLocaleString()} XP to <strong>${esc(r.nextName)}</strong>.` : "Top access level reached. You are root."}</p>
      <p>Where this leads: <a href="#careers">entry-level career paths</a>, what each job involves, and a learning path for each.</p>
      <p class="hint">Levels and badges show practice here. They aren't a qualification.</p></div>
    <div class="progress"><span class="trk" aria-hidden="true" style="flex:1 1 auto"><i style="width:${Math.round(prog * 100)}%;background:var(--sun)"></i></span><span class="mono">${RANKS.map(x => x[1]).join(" → ")}</span></div>
    <div class="stat-row kpi">${stats.map(([k, v]) => `<div class="stat${k === "XP" ? " hl" : ""}"><span class="eyebrow">${k}</span><b>${v}</b></div>`).join("")}</div>
    ${reviewCardHtml()}
    <section class="stack"><h2 class="eyebrow" style="font-size:0.8rem">Badges</h2>
      <div class="badges">${BADGES.map(b => `<div class="badge ${P.badges[b.id] ? "got" : ""}"><span class="ico" aria-hidden="true">${P.badges[b.id] ? "★" : "☆"}</span><span class="stack" style="gap:2px"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>${P.badges[b.id] ? `<span class="mono" style="font-size:0.7rem;color:var(--good)">earned ${esc(P.badges[b.id])}</span>` : ""}</span></div>`).join("")}</div></section>
    <section class="stack"><h2 class="eyebrow" style="font-size:0.8rem">Learning paths</h2><div class="paths-grid">${DATA.paths.map(pathCard).join("")}</div></section>
    <section class="panel"><h2>Recent XP</h2>${P.log.length ? `<ul class="xp-log">${P.log.slice(0, 15).map(x => `<li><span class="mono">${esc(x.d)}</span><span>${esc(x.why)}</span><b>+${Number(x.n) || 0}</b></li>`).join("")}</ul>` : `<p class="muted">Nothing yet. Try today's challenge, a lesson or a lab.</p>`}</section>
    <details class="more-what fold-sec"><summary><h2>How to earn XP</h2><span class="muted">lessons, labs, flags, paths and more</span></summary><ul class="xp-log">
      <li><span></span><span>Daily challenge (correct)</span><b>+20</b></li><li><span></span><span>Finish a lesson</span><b>+25</b></li><li><span></span><span>Complete a lab</span><b>+${LAB_XP}</b></li>
      <li><span></span><span>Capture a hidden flag</span><b>+50</b></li><li><span></span><span>Complete a learning path</span><b>+${PATH_XP}</b></li><li><span></span><span>Unlock a badge</span><b>+${BADGE_XP}</b></li>
      <li><span></span><span>Correct quiz answer / spotted phish</span><b>+10 / +15</b></li><li><span></span><span>Set up your stack</span><b>+10</b></li><li><span></span><span>New glossary term or story explanation</span><b>+2</b></li></ul></details>
    <section class="panel"><h2>Keep your progress</h2>
      ${safeNote("progress")}
      <p class="muted" style="max-width:70ch">Some browsers (Safari especially) clear it after a while, so back it up: copy a code or download a file.</p>
      <p class="notice" role="note">Restoring a progress code or file replaces the progress currently saved in this browser. Download a backup first if you want to keep the current progress too.</p>
      <details class="tbl" id="pcode-box"><summary>Back up / restore with a code</summary>
        <div class="stack" style="gap:10px;margin-top:10px">
          <div class="stack" style="gap:6px"><label class="eyebrow" for="pcode">Your progress code (copy and keep it safe)</label>
            <textarea id="pcode" class="pcode" rows="3" readonly aria-label="Your progress code"></textarea>
            <div class="row"><button class="btn ghost" type="button" id="pcode-copy">Copy code</button></div></div>
          <div class="stack" style="gap:6px"><label class="eyebrow" for="pcode-in">Restore: paste a code and apply it</label>
            <textarea id="pcode-in" class="pcode" rows="3" placeholder="Paste a progress code here" aria-label="Paste a progress code"></textarea>
            <div class="row"><button class="btn" type="button" id="pcode-restore">Restore from code</button></div></div>
        </div></details>
      <div class="row"><button class="btn brand" type="button" id="export">Download a backup file</button><label class="btn ghost" for="import-file">Restore from a file</label><input type="file" id="import-file" accept="application/json,.json" class="sr-only"><button class="btn ghost" type="button" id="reset">Reset my progress</button></div>
      <p class="muted" id="reset-msg" role="status"></p>
      <label class="pn-set"><input type="checkbox" id="patch-toggle"> Show Patch, the guide, in the corner</label>
      ${safeNote("install")}</section>
  </div>`;
  const pt = $("patch-toggle");
  if (pt) { pt.checked = !patchHidden(); pt.addEventListener("change", () => { setPatchHidden(!pt.checked); pt.checked ? mountCompanion() : unmountCompanion(); }); }
  // Restoring replaces what's in this browser, so ask first when there's progress here to lose.
  const replaceOk = restored => {
    if (!P.xp && !Object.keys(P.done).length) return true;
    const ok = confirm(`Replace the progress in this browser (${P.xp} XP) with the backup (${restored.xp} XP)? This can't be undone.`);
    if (!ok) $("reset-msg").textContent = "Nothing was changed.";
    return ok;
  };
  // A compact, copy-pasteable backup that works on any device (handy on phones, where downloading a file is fiddly).
  const encodeProgress = () => btoa(unescape(encodeURIComponent(JSON.stringify({ app: "patch-notes", version: 1, progress: P }))));
  const pcodeEl = $("pcode"); if (pcodeEl) pcodeEl.value = encodeProgress();
  $("pcode-copy")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("pcode").value); $("reset-msg").textContent = "Progress code copied. Paste it somewhere safe."; }
    catch (e) { $("pcode").select(); $("reset-msg").textContent = "Select the code and copy it (Ctrl/Cmd+C)."; }
  });
  $("pcode-restore")?.addEventListener("click", () => {
    const code = $("pcode-in").value.trim();
    if (!code) { $("reset-msg").textContent = "Paste a progress code first."; return; }
    try {
      const restored = restoreProgress(JSON.parse(decodeURIComponent(escape(atob(code)))));
      if (!replaceOk(restored)) return;
      P = restored; saveP(); renderXP(); VIEWS.progress(); toast("Progress restored");
    } catch (err) { $("reset-msg").textContent = "That code isn't a valid Patch Notes progress code, so nothing was changed."; }
  });
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "patch-notes", version: 1, saved: new Date().toISOString(), progress: P }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `patch-notes-progress-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $("reset-msg").textContent = "Saved a copy to your downloads.";
  });
  $("import-file").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const restored = restoreProgress(JSON.parse(await f.text()));
      e.target.value = "";  // so choosing the same file again still fires
      if (!replaceOk(restored)) return;
      P = restored; saveP(); renderXP(); VIEWS.progress(); toast("Progress restored");
    } catch (err) { $("reset-msg").textContent = "That file isn't a Patch Notes progress file, so nothing was changed."; }
  });
  $("reset").addEventListener("click", () => {
    if (Date.now() - resetArmed < 5000) { P = FRESH(); saveP(); renderXP(); VIEWS.progress(); toast("Progress reset"); return; }
    resetArmed = Date.now(); $("reset").textContent = "Click again to confirm"; $("reset-msg").textContent = "This clears XP, badges and progress in this browser.";
  });
};

/* REVIEW: spaced repetition (static/js/review.js). The deck is the glossary terms a learner has met (tapped an
   underlined word) or whose topic they've finished; a short daily recall keeps them for the exam, and the ones
   found hard come back sooner. Everything stays in the browser. */
const revDay = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
// Every single-answer exam question, by id, so a missed one can become a review card. (Multi-answer questions
// need a different input and stay in the exam page for now.)
const Q_BY_ID = (() => { const m = {}; (DATA.certs || []).forEach(c => (c.questions || []).forEach(q => { if (q.single ?? (q.options || []).filter(o => o.correct).length === 1) m[q.id] = { q, cert: c.name }; })); return m; })();
const parseCard = id => id.startsWith("q:") ? { kind: "q", key: id.slice(2) } : { kind: "t", key: id.startsWith("t:") ? id.slice(2) : id };
function reviewDeckIds() {
  const ids = new Set(Object.keys(P.review || {}));                       // anything already scheduled stays in the deck
  const gids = new Set(DATA.glossary.map(g => g.id)), done = new Set(Object.keys(P.done || {}));
  Object.keys(P.terms || {}).filter(id => gids.has(id)).forEach(id => ids.add("t:" + id));          // terms you've tapped
  DATA.glossary.filter(g => g.lesson && done.has(g.lesson)).forEach(g => ids.add("t:" + g.id));      // terms from topics you've finished
  for (const qid in Q_BY_ID) if (P.exam[qid] && P.exam[qid].last === 0) ids.add("q:" + qid);         // questions you got wrong
  return [...ids].filter(id => { const p = parseCard(id); return p.kind === "q" ? Q_BY_ID[p.key] : GLOSS[p.key]; });
}
// A quick synchronous due count for the home-page nudge (no scheduling, just the comparison).
// Mirrors review.js dueCards: saved cards due today, plus at most 15 new ones (NEW_PER_SESSION).
function reviewDueCount() { const t = revDay(), r = P.review || {}, ids = reviewDeckIds();
  return ids.filter(id => r[id] && r[id].due <= t).length + Math.min(15, ids.filter(id => !r[id]).length); }
function reviewCardHtml() {
  const ids = reviewDeckIds();
  if (!ids.length) return `<section class="panel rev-cta"><div class="eyebrow">New · spaced repetition</div><h2>Review</h2>
    <p class="muted" style="max-width:66ch">Lock in what you learn. The terms you meet and the exam questions you get wrong are added to a review deck that brings them back on the right day, so they stick.</p>
    <a class="btn ghost" href="#review" style="justify-self:start">How it works</a></section>`;
  const due = reviewDueCount();
  return `<section class="panel rev-cta"><div class="eyebrow">Spaced repetition</div><h2>Review${due ? ` · ${due} due` : ""}</h2>
    <p class="muted" style="max-width:66ch">${due ? `${due} card${due === 1 ? "" : "s"} ready to review. A few minutes keeps them for the exam, and the ones you find hard come back sooner.` : `All caught up. ${ids.length} card${ids.length === 1 ? "" : "s"} in your deck.`}</p>
    <a class="btn ${due ? "brand" : "ghost"}" href="#review" style="justify-self:start">${due ? "Review now →" : "Open review"}</a></section>`;
}
VIEWS.review = () => {
  main.innerHTML = `<div class="view"><div class="view-head"><a class="link-btn" href="#progress">← You</a><div class="eyebrow">Spaced repetition</div><h1>Review</h1>
    <p>A short daily recall of the terms you've met and the exam questions you got wrong, so they actually stick. The ones you find hard come back sooner, the easy ones later.</p></div>
    <div id="rev-root"><div class="empty">Loading your deck…</div></div></div>`;
  Promise.all([import("./js/review.js"), ...DATA.certs.map(loadQuestions)]).then(([R]) => { if (parseRoute().path === "review" && $("rev-root")) mountReview(R); })
    .catch(() => { const e = $("rev-root"); if (e) e.innerHTML = `<div class="empty">Couldn't load the review deck.</div>`; });
};
function revStats(R) { const ids = reviewDeckIds(), s = R.deckStats(ids, P.review, R.dayNum());
  return `<div class="rev-stats"><span><b>${s.total}</b> in deck</span><span><b>${s.due}</b> due</span><span><b>${s.learning}</b> learning</span></div>`; }
function mountReview(R) {
  const root = $("rev-root"); if (!root) return;
  const ids = reviewDeckIds(), today = R.dayNum();
  if (!ids.length) { root.innerHTML = `<section class="panel"><h2>Your deck fills as you learn</h2>
    <p class="muted">Tap an underlined term, finish a topic, or get an exam question wrong, and it's added here. Then come back daily to lock it in.</p>
    <a class="btn brand" href="#learn" style="justify-self:start">Start a lesson →</a></section>`; return; }
  const queue = R.dueCards(ids, P.review, today);
  if (!queue.length) { const nd = R.nextDue(ids, P.review, today), d = nd == null ? null : nd - today;
    root.innerHTML = `<section class="panel rev-done"><div class="eyebrow">Spaced repetition</div><h2>All caught up ✓</h2>
      <p class="muted">Nothing to review right now. Next review ${d === 0 || d == null ? "later today" : d === 1 ? "tomorrow" : "in " + d + " days"}.</p></section>${revStats(R)}`; return; }
  let i = 0, reviewed = 0, awarded = false;
  const grade = g => {
    const id = queue[i];
    P.review[id] = R.schedule(P.review[id] || R.freshCard(today), g, today);
    if (!awarded) { award(3, "Daily review", { quiet: true }); awarded = true; } else saveP();  // one log entry, marks the day
    reviewed++; i++; draw();
  };
  const head = kind => `<div class="rev-top"><span class="eyebrow">Card ${i + 1} of ${queue.length}</span><span class="muted mono">${kind}</span></div>`;
  const draw = () => {
    if (i >= queue.length) { root.innerHTML = `<section class="panel rev-done"><div class="eyebrow">Nice work</div><h2>Session done ✓</h2>
      <p class="muted">You reviewed <b>${reviewed}</b> card${reviewed === 1 ? "" : "s"}. The ones you found hard come back soon; the easy ones later.</p>
      <div class="row"><a class="btn ghost" href="#learn">Keep learning</a><a class="link-btn" href="#progress">Your progress</a></div></section>${revStats(R)}`; return; }
    const p = parseCard(queue[i]);
    if (p.kind === "q") return drawQuestion(p.key);
    const g = GLOSS[p.key];
    root.innerHTML = `<section class="panel rev-card">${head(esc(g.kind || "Term"))}
      <h2 class="rev-term">${esc(g.term)}</h2>
      <div class="rev-ans" id="rev-ans" aria-live="polite"><button type="button" class="btn brand" id="rev-show">Show the meaning</button></div></section>`;
    $("rev-show").addEventListener("click", () => {
      $("rev-ans").innerHTML = `<p class="rev-short">${gloss(g.short, 2)}</p><p class="rev-q muted">How well did you remember it?</p>
        <div class="row rev-grades"><button type="button" class="btn ghost" data-g="again">Again</button>
          <button type="button" class="btn" data-g="good">Good</button><button type="button" class="btn brand" data-g="easy">Easy</button></div>`;
      $("rev-ans").querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => grade(b.dataset.g)));
    });
    $("rev-show").focus();
  };
  // A missed exam question: answer it again. Right first time counts as "good" (comes back later), wrong as
  // "again" (comes back soon). The answer also updates the objective's exam stats, so readiness reflects it.
  const drawQuestion = qid => {
    const q = Q_BY_ID[qid].q, correctIdx = q.options.findIndex(o => o.correct);
    root.innerHTML = `<section class="panel rev-card rev-qcard">${head("Exam question")}
      <p class="q rev-stem">${gloss(q.stem, 3)}</p>
      <div class="opts" id="rev-opts">${q.options.map((o, j) => `<button class="opt" data-j="${j}">${esc(o.text)}</button>`).join("")}</div>
      <div class="fb" id="rev-fb" aria-live="polite"></div></section>`;
    root.querySelectorAll("#rev-opts .opt").forEach(b => b.addEventListener("click", () => {
      const j = Number(b.dataset.j), correct = !!q.options[j].correct;
      root.querySelectorAll("#rev-opts .opt").forEach((btn, k) => { btn.disabled = true; if (q.options[k].correct) btn.classList.add("right"); else if (k === j) btn.classList.add("wrong"); });
      const s = P.exam[qid] || (P.exam[qid] = { r: 0, w: 0, last: 0 }); if (correct) { s.r++; s.last = 1; } else { s.w++; s.last = 0; }
      $("rev-fb").innerHTML = `<div class="feedback">${correct ? '<b class="ok">Correct.</b>' : '<b class="no">Not quite.</b>'} ${gloss(q.options[j].why || q.options[correctIdx].why, 3)}</div>
        <div class="row"><button type="button" class="btn brand" id="rev-next">Next →</button></div>`;
      $("rev-next").addEventListener("click", () => grade(correct ? "good" : "again"));
      $("rev-next").focus();
    }));
  };
  draw();
}

/* PLAY */
const GS = { mode: "phish", phish: null, quiz: null };
VIEWS.play = () => {
  main.innerHTML = `<div class="view">
    <div class="view-head"><h1>Train your instincts</h1>
</div>
    <div class="game-tabs" id="gtabs">
      <button class="chip" data-m="phish" aria-pressed="${GS.mode === "phish"}">Phish or Legit?</button>
      <button class="chip" data-m="quiz" aria-pressed="${GS.mode === "quiz"}">Quick-fire quiz</button>
      <button class="chip" data-m="flags" aria-pressed="${GS.mode === "flags"}">Flag hunt</button>
      <a class="chip" href="#today" style="text-decoration:none">Daily challenge</a>
    </div>
    <div id="game" class="stack" style="max-width:760px"></div>
  </div>`;
  $("gtabs").addEventListener("click", e => { const b = e.target.closest("button.chip"); if (!b) return; GS.mode = b.dataset.m;
    $("gtabs").querySelectorAll("button.chip").forEach(c => c.setAttribute("aria-pressed", c === b)); drawGame(); });
  drawGame();
};
function drawGame() { GS.mode === "phish" ? drawPhish() : GS.mode === "flags" ? drawFlags() : drawQuiz(); }
function drawFlags() {
  const got = P.flags || {};
  $("game").innerHTML = `<div class="game-bar"><span>Capture the flag</span><span>${Object.keys(got).length}/3 captured · 50 XP each</span></div>
    <p class="muted">Three flags are hidden in this site. Each looks like <span class="mono">flag{...}</span>. Stuck? Open "Show me how" under any flag.</p>
    <div class="flag-safe" role="note"><b>Is this safe? Yes.</b> Viewing a page's source and opening the browser console only shows your own copy of the page. Nothing you do there changes the site for anyone else, and developers do it all day.
      <details><summary>The one rule: never paste code someone gives you</summary><p>The console runs code as you, in your logged-in tab. Scammers send people a line to paste ("to unlock a prize" or "to verify your account") and it quietly takes over the account. This is called <b>self-XSS</b>. Typing your own commands to learn is fine. On Patch Notes there are no accounts, so the worst a pasted script could do is wipe your saved progress, but the habit matters everywhere else.</p></details></div>
    <div class="flags">${FLAG_INFO.map((f, i) => `<div class="flag ${got[i] ? "got" : ""}"><span class="st">${i + 1}${got[i] ? '<span class="st-tick" aria-hidden="true">✓</span><span class="sr-only"> (captured)</span>' : ""}</span><div class="stack" style="gap:4px"><h2 class="flag-name">${esc(f.name)}</h2><p>${esc(f.hint)}</p>
      <details class="flag-how"><summary>Show me how</summary><ol>${f.how.map(x => `<li>${esc(x)}</li>`).join("")}</ol><p class="muted flag-phone"><b>On a phone:</b> ${esc(f.phone)}</p></details></div></div>`).join("")}</div>
    <form class="flag-form" id="flag-form"><label class="sr" for="flag-in">Flag</label><input id="flag-in" placeholder="flag{...}" autocomplete="off" spellcheck="false"><button class="btn brand" type="submit">Submit</button></form>
    <div id="flag-msg" aria-live="polite"></div>
    <p class="muted" style="font-size:0.88rem">Useful free tool: <a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener">CyberChef ↗</a>, made by GCHQ for decoding and transforming data.</p>`;
  $("flag-form").addEventListener("submit", async e => {
    e.preventDefault();
    const r = await checkFlag($("flag-in").value);
    $("flag-msg").innerHTML = `<div class="feedback">${r.ok ? '<b class="ok">✓</b>' : '<b class="no">✗</b>'} ${esc(r.msg)}</div>`;
    if (r.ok) setTimeout(drawFlags, 1800);
  });
}

function newPhish(deck = shuffle(DATA.phish)) { GS.phish = { deck, i: 0, score: 0, answered: null, wrong: [] }; }
function drawPhish() {
  if (!GS.phish) newPhish();
  const g = GS.phish, box = $("game");
  if (g.i >= g.deck.length) {
    const full = g.deck.length === DATA.phish.length;
    const best = full ? Math.max(P.best.phish || 0, g.score) : P.best.phish || 0;
    if (full) { P.best.phish = best; progressChanged(); }
    if (!g.celebrated) { g.celebrated = true; celebrate("Round complete!", `${g.score}/${g.deck.length} spotted`); }
    box.innerHTML = `<section class="panel" style="text-align:center;justify-items:center"><div class="eyebrow">Round complete</div><div class="score-big">${g.score}/${g.deck.length}</div>
      <p>${g.score === g.deck.length ? "Perfect. Nothing gets past you." : g.score >= 7 ? "Sharp eyes. A couple slipped through." : "Phishers are good at this. Review the clues and try again."}</p>
      <p class="muted">Your best: ${Number(best) || 0}/${g.deck.length}</p><div class="row" style="justify-content:center">${g.wrong.length ? `<button class="btn brand" id="retryp">↺ Retry the ${g.wrong.length} you got wrong</button>` : ""}<button class="btn ${g.wrong.length ? "ghost" : "brand"}" id="again">Play again</button><a class="btn ghost" href="#lesson-phishing">Phishing lesson</a></div></section>`;
    $("again").onclick = () => { newPhish(); drawPhish(); };
    if ($("retryp")) $("retryp").onclick = () => { newPhish(shuffle(g.wrong)); drawPhish(); };
    return;
  }
  const m = g.deck[g.i], answered = g.answered != null, ok = g.answered === m.verdict;
  const mail = { fromName: m.fromName, fromAddr: m.fromAddr, subject: m.subject, body: m.body, links: m.link ? [m.link] : [] };
  box.innerHTML = `<div class="game-bar"><span>Email ${g.i + 1} of ${g.deck.length}</span><span>Score ${g.score}</span></div>
    ${answered ? `<p class="result ${ok ? "ok" : "no"}" role="status" tabindex="-1"><strong>${ok ? "Correct" : "Not this time"}: this one is ${m.verdict === "phish" ? "phishing" : "legitimate"}.</strong> The numbers show where to look.</p>` : ""}
    ${MAIL.card(mail, { id: "pg-mail", reveal: answered, pins: answered ? m.clues : [], client: true })}
    <div id="pv"></div>`;
  if (!box.dataset.emWired) { MAIL.wire(box); box.dataset.emWired = "1"; }
  const pv = $("pv");
  if (!answered) {
    pv.innerHTML = `<div class="verdict"><button class="btn" data-v="phish">It's phishing</button><button class="btn ghost" data-v="legit">It's legit</button></div>`;
    pv.onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; g.answered = b.dataset.v;
      if (g.answered === m.verdict) { g.score++; award(15, "Spotted it"); } else g.wrong.push(m); drawPhish(); box.querySelector(".result")?.focus(); };
  } else {
    pv.innerHTML = `<button class="btn brand" id="nextp" style="justify-self:start">${g.i + 1 < g.deck.length ? "Next email" : "See score"}</button>`;
    $("nextp").onclick = () => { g.i++; g.answered = null; drawPhish(); };
  }
}

function newQuiz(deck = shuffle(DATA.quiz).slice(0, 10).map(q => mixOptions(q))) { GS.quiz = { deck, i: 0, score: 0, answered: null, wrong: [] }; }
function drawQuiz() {
  if (!GS.quiz) newQuiz();
  const g = GS.quiz, box = $("game");
  if (g.i >= g.deck.length) {
    const total = g.deck.length;
    if (total === 10) { const best = Math.max(P.best.quiz || 0, g.score); P.best.quiz = best; progressChanged(); }
    const missed = [...new Set(g.wrong.map(q => q.topic))].filter(t => LESSON[t]);
    box.innerHTML = `<section class="panel" style="text-align:center;justify-items:center"><div class="eyebrow">Quiz complete</div><div class="score-big">${g.score}/${total}</div>
      ${missed.length ? `<p>Worth a review: ${missed.map(t => `<a href="#lesson-${esc(t)}">${esc(LESSON[t].title)}</a>`).join(", ")}</p>` : "<p>Flawless.</p>"}
      <div class="row" style="justify-content:center">${g.wrong.length ? `<button class="btn brand" id="retryq">↺ Retry the ${g.wrong.length} you missed</button>` : ""}<button class="btn ${g.wrong.length ? "ghost" : "brand"}" id="againq">New quiz</button></div></section>`;
    if (!g.celebrated) { g.celebrated = true; celebrate("Quiz complete!", `${g.score}/${total} correct`); }
    $("againq").onclick = () => { newQuiz(); drawQuiz(); };
    if ($("retryq")) $("retryq").onclick = () => { newQuiz(shuffle(g.wrong).map(q => mixOptions(q))); drawQuiz(); };
    return;
  }
  const q = g.deck[g.i];
  box.innerHTML = `<div class="game-bar"><span>Question ${g.i + 1} of ${g.deck.length}</span><span>Score ${g.score}</span></div><section class="panel" id="qp"></section>`;
  // The way on: added after an answer, and again when coming back to a question already answered.
  const next = wrap => {
    const nb = document.createElement("button"); nb.className = "btn brand"; nb.style.justifySelf = "start";
    nb.textContent = g.i + 1 < g.deck.length ? "Next question" : "See score";
    nb.onclick = () => { g.i++; g.answered = null; drawQuiz(); };
    wrap.appendChild(nb);
  };
  const block = quizBlock(q, {
    answered: g.answered,
    onAnswer: (choice, correct, wrap) => {
      g.answered = choice;
      if (correct) { g.score++; award(10, "Correct answer"); } else { g.wrong.push(q); }
      next(wrap);
    }
  });
  $("qp").appendChild(block);
  if (g.answered != null) next(block);
}

/* CAREERS */
VIEWS.careers = () => {
  const C = DATA.careers;
  main.innerHTML = `<div class="view">
    <div class="view-head"><h1>Find your way into cyber</h1>
      <p>Most people start in IT support or a SOC.</p></div>
    <h2 class="sr-only">Entry paths</h2><div class="paths">${C.paths.map(p => `<article class="path career-card">
      <h3>${esc(p.name || p.role)}</h3><p class="tl">${esc(p.tagline)}</p><p>${gloss(p.what, 3)}</p>
      <h4>Skills</h4><div class="pchips">${p.skills.map(s => `<span class="pchip">${esc(s)}</span>`).join("")}</div>
      <h4>Certifications</h4><div class="pchips">${p.certs.map(s => `<span class="pchip">${esc(s)}</span>`).join("")}</div>
      <h4>Start here</h4><ul>${p.start.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
      <h4>First job titles</h4><p class="muted" style="font-size:0.88rem">${p.titles.map(esc).join(" · ")}</p>
      <h4>Lessons for this path</h4><div class="row">${p.lessons.filter(id => LESSON[id]).map(id => `<a class="topic" href="#lesson-${esc(id)}">${esc(LESSON[id].title)}</a>`).join("")}</div>
      ${(lp => lp ? `<a class="btn brand career-go" href="#path-${esc(lp.id)}">Start this path<span class="sr-only"> to ${esc(p.name || p.role)}</span> →</a>` : "")(DATA.paths.find(x => x.career === p.id))}
    </article>`).join("")}</div>
    <section class="stack">
      <div class="view-head"><h2>The best of the rest</h2></div>
      <div class="dir">${C.directory.map(g => `<section class="panel"><h3>${esc(g.group)}</h3><ul>${g.items.map(i => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)} ↗</a><span>${esc(i.note)}</span></li>`).join("")}</ul></section>`).join("")}</div>
    </section>
  </div>`;
};

