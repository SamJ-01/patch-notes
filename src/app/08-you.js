/* PROGRESS */
let resetArmed = 0;

// The on-site feedback form. Submits straight to a form-to-email relay (DATA.site.feedbackPost) from the browser,
// so the site stays static and the person needs no account and never leaves the page. Nothing is saved locally.
VIEWS.feedback = () => {
  const endpoint = DATA.site.feedbackPost || "";
  const checks = (name, opts, type) => opts.map(o => `<label class="fb-opt"><input type="${type}" name="${esc(name)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("");
  main.innerHTML = `<div class="view"><article class="article" style="max-width:720px">
    <a class="link-btn" href="#today">← Home</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">Feedback</div><h1>Tell me what you think</h1>
      <p class="hook">Two minutes, no name or account needed, and it stays between us. Anything that confused or annoyed you is the most useful thing you can say.</p></div>
    <form id="fb-form" class="panel stack" style="gap:20px" novalidate>
      <fieldset class="fb-set"><legend>What did you try?</legend>
        <div class="fb-opts">${checks("tried", ["Lessons", "Labs", "Missions", "Agency (SOC shift)", "Exam prep or a mock", "News or CVE Radar", "Games"], "checkbox")}</div></fieldset>
      <fieldset class="fb-set"><legend>What device were you on?</legend>
        <div class="fb-opts">${checks("Device", ["Phone", "Tablet", "Laptop or desktop"], "radio")}</div></fieldset>
      <div class="stack" style="gap:6px"><label for="fb-stuck"><b>What confused you, was wrong, or annoyed you?</b> <span class="muted">Name the page if you can.</span></label>
        <textarea id="fb-stuck" name="What confused, was wrong or annoying" rows="4"></textarea></div>
      <fieldset class="fb-set"><legend>How likely are you to use it again?</legend>
        <div class="fb-opts fb-scale">${checks("Likely to use again (1-5)", ["1", "2", "3", "4", "5"], "radio")}</div>
        <p class="muted" style="margin:4px 0 0">1 = not at all, 5 = definitely.</p></fieldset>
      <div class="stack" style="gap:6px"><label for="fb-else"><b>Anything else?</b> <span class="muted">Optional.</span></label>
        <textarea id="fb-else" name="Anything else" rows="3"></textarea></div>
      <div class="stack" style="gap:6px"><label for="fb-email"><b>Your email</b> <span class="muted">Optional, only if you want a reply.</span></label>
        <input id="fb-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false"></div>
      <input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" class="fb-honey">
      <div class="row"><button class="btn brand" type="submit" id="fb-send">Send feedback</button></div>
      <p class="muted" id="fb-note" role="status" aria-live="polite" style="margin:0"></p>
    </form>
  </article></div>`;
  const form = $("fb-form"), note = $("fb-note"), btn = $("fb-send");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (form.querySelector('[name="_honey"]').value) return;  // a bot filled the hidden field
    const fd = new FormData(form), tried = fd.getAll("tried"), body = {};
    for (const [k, v] of fd.entries()) { if (k === "tried" || k === "_honey" || !String(v).trim()) continue; body[k] = v; }
    if (tried.length) body["What they tried"] = tried.join(", ");
    if (!Object.keys(body).length) { note.textContent = "Add a word or two first, then send."; return; }
    Object.assign(body, { _subject: "Patch Notes feedback", _template: "table", _captcha: "false" });
    btn.disabled = true; note.textContent = "Sending…";
    try {
      if (!endpoint) throw new Error("no endpoint set");
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("bad status " + r.status);
      form.innerHTML = `<div class="feedback"><b class="ok">Thank you.</b> Your feedback is on its way, and it really does shape what gets built next.</div>
        <a class="btn ghost" href="#today" style="justify-self:start">Back to the site</a>`;
    } catch (err) {
      btn.disabled = false;
      note.textContent = "Couldn't send just now, sorry. Check your connection and try again in a moment.";
    }
  });
};

VIEWS.progress = () => {
  const r = rank(), prog = r.next ? (P.xp - r.floor) / (r.next - r.floor) : 1;
  const stats = [["XP", P.xp], ["Lessons", `${count(P.done)}/${DATA.lessons.length}`], ["Labs", `${count(P.labs)}/${DATA.labs.length}`], ["Flags", `${count(P.flags)}/3`], ["Paths", `${count(P.paths)}/${DATA.paths.length}`], ["Days practised", count(P.days)], ["Terms", count(P.terms)], ["Badges", `${count(P.badges)}/${BADGES.length}`]];
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("progress")}<h1>uid=${esc(r.name)}</h1>
      <p>${r.next ? `${(r.next - P.xp).toLocaleString()} XP to <strong>${esc(r.nextName)}</strong>.` : "Top access level reached. You are root."}</p>
      <p>Where this leads: <a href="#careers">entry-level career paths</a>, what each job involves, and a learning path for each.</p>
      <p class="hint">Levels and badges show practice here. They aren't a qualification.</p></div>
    <div class="progress"><span class="trk" aria-hidden="true" style="flex:1 1 auto"><i style="width:${Math.round(prog * 100)}%;background:var(--sun)"></i></span><span class="mono">${RANKS.map(x => x[1]).join(" → ")}</span></div>
    <div class="stat-row">${stats.map(([k, v]) => `<div class="stat"><span class="eyebrow">${k}</span><b>${v}</b></div>`).join("")}</div>
    <section class="stack"><h2 class="eyebrow" style="font-size:0.8rem">Badges</h2>
      <div class="badges">${BADGES.map(b => `<div class="badge ${P.badges[b.id] ? "got" : ""}"><span class="ico" aria-hidden="true">${P.badges[b.id] ? "★" : "☆"}</span><span class="stack" style="gap:2px"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>${P.badges[b.id] ? `<span class="mono" style="font-size:0.7rem;color:var(--good)">earned ${esc(P.badges[b.id])}</span>` : ""}</span></div>`).join("")}</div></section>
    <section class="stack"><h2 class="eyebrow" style="font-size:0.8rem">Learning paths</h2><div class="paths-grid">${DATA.paths.map(pathCard).join("")}</div></section>
    <section class="panel"><h2>Recent XP</h2>${P.log.length ? `<ul class="xp-log">${P.log.slice(0, 15).map(x => `<li><span class="mono">${esc(x.d)}</span><span>${esc(x.why)}</span><b>+${Number(x.n) || 0}</b></li>`).join("")}</ul>` : `<p class="muted">Nothing yet. Try today's challenge, a lesson or a lab.</p>`}</section>
    <details class="more-what fold-sec"><summary><h2>How to earn XP</h2><span class="muted">lessons, labs, flags, paths and more</span></summary><ul class="xp-log">
      <li><span></span><span>Daily challenge (correct)</span><b>+20</b></li><li><span></span><span>Finish a lesson</span><b>+25</b></li><li><span></span><span>Complete a lab</span><b>+${LAB_XP}</b></li>
      <li><span></span><span>Capture a hidden flag</span><b>+50</b></li><li><span></span><span>Complete a learning path</span><b>+${PATH_XP}</b></li><li><span></span><span>Unlock a badge</span><b>+${BADGE_XP}</b></li>
      <li><span></span><span>Correct quiz answer / spotted phish</span><b>+10 / +15</b></li><li><span></span><span>Set up your stack</span><b>+10</b></li><li><span></span><span>New glossary term or story explanation</span><b>+2</b></li></ul></details>
    <section class="panel"><h2>Keep your progress</h2>
      <p class="muted" style="max-width:70ch">Saved <b>in this browser only</b>, with no account. Some browsers (Safari especially) clear it after a while, so back it up: copy a code or download a file.</p>
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
      <p class="muted" id="reset-msg" role="status"></p></section>
  </div>`;
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
      P = restored; saveP(); renderXP(); VIEWS.progress(); toast("Progress restored");
    } catch (err) { $("reset-msg").textContent = "That file isn't a Patch Notes progress file, so nothing was changed."; }
  });
  $("reset").addEventListener("click", () => {
    if (Date.now() - resetArmed < 5000) { P = FRESH(); saveP(); renderXP(); VIEWS.progress(); toast("Progress reset"); return; }
    resetArmed = Date.now(); $("reset").textContent = "Click again to confirm"; $("reset-msg").textContent = "This clears XP, badges and progress in this browser.";
  });
};

/* PLAY */
const GS = { mode: "phish", phish: null, quiz: null };
VIEWS.play = () => {
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("play")}<h1>Train your instincts</h1>
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
    <p class="muted">Three flags are hidden in this site. Each looks like <span class="mono">flag{...}</span>.</p>
    <div class="flags">${FLAG_INFO.map((f, i) => `<div class="flag ${got[i] ? "got" : ""}"><span class="st">${i + 1}${got[i] ? '<span class="st-tick" aria-hidden="true">✓</span><span class="sr-only"> (captured)</span>' : ""}</span><div class="stack" style="gap:4px"><h3>${esc(f.name)}</h3><p>${esc(f.hint)}</p></div></div>`).join("")}</div>
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
    ${MAIL.card(mail, { id: "pg-mail", reveal: answered, pins: answered ? m.clues : [] })}
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
    <div class="view-head with-art">${headArt("careers")}<h1>Find your way into cyber</h1>
      <p>Most people start in IT support or a SOC.</p></div>
    <h2 class="sr-only">Entry paths</h2><div class="paths">${C.paths.map(p => `<article class="path">
      <h3>${esc(p.role)}</h3><p class="tl">${esc(p.tagline)}</p><p>${gloss(p.what, 3)}</p>
      <h4>Skills</h4><div class="pchips">${p.skills.map(s => `<span class="pchip">${esc(s)}</span>`).join("")}</div>
      <h4>Certifications</h4><div class="pchips">${p.certs.map(s => `<span class="pchip">${esc(s)}</span>`).join("")}</div>
      <h4>Start here</h4><ul>${p.start.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
      <h4>First job titles</h4><p class="muted" style="font-size:0.88rem">${p.titles.map(esc).join(" · ")}</p>
      <h4>Lessons for this path</h4><div class="row">${p.lessons.filter(id => LESSON[id]).map(id => `<a class="topic" href="#lesson-${esc(id)}">${esc(LESSON[id].title)}</a>`).join("")}</div>
      ${(lp => lp ? `<a class="btn brand" href="#path-${esc(lp.id)}" style="justify-self:start">Start the learning path →</a>` : "")(DATA.paths.find(x => x.career === p.id))}
    </article>`).join("")}</div>
    <section class="stack">
      <div class="view-head"><h2>The best of the rest</h2></div>
      <div class="dir">${C.directory.map(g => `<section class="panel"><h3>${esc(g.group)}</h3><ul>${g.items.map(i => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)} ↗</a><span>${esc(i.note)}</span></li>`).join("")}</ul></section>`).join("")}</div>
    </section>
  </div>`;
};

