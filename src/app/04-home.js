/* ---------- views ---------- */
const VIEWS = {};
const main = $("main");


/* ---------- theme ---------- */
const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function paintThemeBtn() {
  const light = document.documentElement.dataset.theme === "light", b = $("theme-btn");
  b.innerHTML = light ? MOON_ICON : SUN_ICON;
  b.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
  b.title = b.getAttribute("aria-label");
}
$("theme-btn").addEventListener("click", () => {
  const light = document.documentElement.dataset.theme !== "light";
  if (light) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("pn-theme", light ? "light" : "dark"); } catch (e) {}
  paintThemeBtn();
});
paintThemeBtn();

/* THE ROUTE: the chosen learning path drawn as a winding road with numbered stops, like a transit map.
   Done stops are ticked, the next one is highlighted, and the road is coloured as far as you've got. */
// Positions for n stops in rows of `cols`, snaking left-right then right-left, plus the start and finish markers.
// Pure (tested in tests/page.test.mjs). Units are pixels: the map is drawn at its real width W, so text stays
// true size; rows are rowH apart and turn with radius R.
function routeLayout(n, cols, { W = 1000, rowH = 150, top = 70, R = rowH / 2, pad = 50 } = {}) {
  const m = R + pad, dx = cols > 1 ? (W - 2 * m) / (cols - 1) : 0;
  const at = i => { const row = Math.floor(i / cols), col = i % cols; return { x: row % 2 ? W - m - col * dx : m + col * dx, y: top + row * rowH, row }; };
  const stops = Array.from({ length: n }, (_, i) => at(i));
  const last = stops[n - 1] || at(0), dir = last.row % 2 ? -1 : 1;
  const finish = n % cols ? { x: last.x + dir * Math.min(dx * 0.75, 90), y: last.y, row: last.row } : at(n);
  // Tall enough for the last stop's label (up to three lines) and the finish marker, and no taller.
  return { stops, start: { x: Math.max(26, m - 70), y: top, row: 0 }, finish, height: Math.max(last.y + 112, finish.y + 40), R };
}
// The road through a list of positions: straight along a row, a half-circle at each end where it turns.
function routePath(points, R) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b.row === a.row) { d += ` L${b.x} ${b.y}`; continue; }
    const right = a.row % 2 === 0;  // even rows run left to right, so they turn on the right
    d += ` A${R} ${R} 0 0 ${right ? 1 : 0} ${a.x} ${b.y} L${b.x} ${b.y}`;
  }
  return d;
}
const routeWrap = (text, max) => text.split(" ").reduce((lines, w) => { const l = lines[lines.length - 1]; if (l && (l + " " + w).length <= max) lines[lines.length - 1] = l + " " + w; else lines.push(w); return lines; }, []).slice(0, 3);
const KIND_WORD = { lesson: "Lesson", lab: "Lab", mission: "Mission", agency: "Agency", game: "Game", ctf: "Flags", prove: "Exam" };
let routeId = null;
function routePathChoice() {
  if (!routeId) { try { routeId = localStorage.getItem("pn-route"); } catch (e) {} }
  const started = DATA.paths.find(p => !P.paths[p.id] && pathSteps(p).some(st => st.done));
  return DATA.paths.find(p => p.id === routeId) || started || DATA.paths.find(p => p.id === "awareness") || DATA.paths[0];
}
function drawRoute() {
  const box = $("route"); if (!box) return;
  const p = routePathChoice(), steps = pathSteps(p), next = steps.findIndex(st => !st.done), done = steps.filter(st => st.done).length;
  box.dataset.trail = p.id;  // a stop or Start link here puts you on this route
  const W = Math.max(300, box.clientWidth), cols = W < 520 ? 2 : W < 820 ? 4 : 6, maxCh = cols <= 2 ? 16 : 17;
  const L = routeLayout(steps.length, cols, cols <= 2 ? { W, rowH: 145, R: 46, pad: 40 } : { W });
  routeWidth = box.clientWidth;
  const reached = next === -1 ? [L.start, ...L.stops, L.finish] : [L.start, ...L.stops.slice(0, next + 1)];
  const short = t => t.replace(/^Path to /, "");
  box.innerHTML = `<div class="route-top"><h2 id="route-h">Your route: ${esc(short(p.title))}</h2><span class="muted">${done} of ${steps.length} stops · finish for +${PATH_XP} XP</span></div>
    ${isNewcomer() ? "" : `<div class="row route-paths" role="group" aria-label="Choose a route">${DATA.paths.map(x => `<button type="button" class="chip" data-route="${esc(x.id)}" aria-pressed="${x.id === p.id}">${esc(short(x.title))}</button>`).join("")}</div>`}
    <svg class="route-map" viewBox="0 0 ${W} ${L.height}" role="group" aria-label="${esc(`${p.title}: ${steps.length} stops, ${done} done.`)}">
      <path class="route-road" d="${routePath([L.start, ...L.stops, L.finish], L.R)}"/>
      <path class="route-road done" pathLength="1" d="${routePath(reached, L.R)}"/>
      <g class="route-start" transform="translate(${L.start.x},${L.start.y})" aria-hidden="true"><rect x="-22" y="-22" width="44" height="44" rx="10"/><text y="5" text-anchor="middle">GO</text></g>
      ${steps.map((st, i) => { const s = L.stops[i], state = st.done ? "done" : i === next ? "next" : "todo";
        return `<a href="${st.href}" class="route-stop ${state}" aria-label="${esc(`Stop ${i + 1} of ${steps.length}: ${st.label} (${KIND_WORD[st.kind] || st.kind})${st.done ? ", done" : i === next ? ", next" : ""}`)}">
          <g transform="translate(${s.x},${s.y})">${state === "next" ? '<circle class="route-pulse" r="27"/>' : ""}<circle class="route-dot" r="19"/>
          <text class="route-n" y="5" text-anchor="middle">${i + 1}</text>${st.done ? '<g class="route-tick" transform="translate(14,-14)"><circle r="8"/><path d="M-3.5 0 l2.5 2.5 l4.5 -5"/></g>' : ""}
          <text class="route-kind" y="38" text-anchor="middle">${esc((KIND_WORD[st.kind] || st.kind).toUpperCase())}</text>
          ${routeWrap(st.label, maxCh).map((ln, k) => `<text class="route-lbl" y="${56 + k * 17}" text-anchor="middle">${esc(ln)}</text>`).join("")}</g></a>`; }).join("")}
      <g class="route-finish${next === -1 ? " done" : ""}" transform="translate(${L.finish.x},${L.finish.y})" aria-hidden="true"><rect x="-26" y="-22" width="52" height="44" rx="10"/><text y="5" text-anchor="middle">${next === -1 ? "★" : "FINISH"}</text></g>
    </svg>
    <div class="row route-next">${next === -1 ? `<span><b>Route complete.</b> Pick another route above.</span>` : `<span>Next stop: <b>${esc(steps[next].label)}</b> <span class="muted">(${esc(KIND_WORD[steps[next].kind] || steps[next].kind)})</span></span><a class="btn brand" href="${steps[next].href}">${done ? "Continue" : "Start"} →</a>`}
      <a class="link-btn" href="#path-${esc(p.id)}">Route details</a>${isNewcomer() ? "" : '<a class="link-btn" href="#news">Just here for the news?</a>'}</div>`;
  box.querySelectorAll("[data-route]").forEach(b => b.addEventListener("click", () => {
    routeId = b.dataset.route; try { localStorage.setItem("pn-route", routeId); } catch (e) {}
    drawRoute(); box.querySelector(`[data-route="${routeId}"]`)?.focus();
  }));
}
// The map is drawn at its real width, so redraw when that changes (once the resizing settles).
let routeWidth = 0, routeTimer = null;
addEventListener("resize", () => { clearTimeout(routeTimer); routeTimer = setTimeout(() => { const b = $("route"); if (b && Math.abs(b.clientWidth - routeWidth) > 8) drawRoute(); }, 120); });

/* STREAK & DAILY GOAL: the habit loop. A flame with the run of consecutive days, a dot strip of the last week,
   and one clear thing to do today (clear your review, or pick your route back up) so the streak stays alive. */
const FLAME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fl-outer" d="M12 2c1 3-2 4-2 7 0 1.5 1 2.5 1 2.5S9 11 7.5 12.5C6 14 5 16 5 18a7 7 0 0 0 14 0c0-3-2-5-3.5-7C14 9 13 7 13 5c0-1.3-.5-2.3-1-3z"/><path class="fl-inner" d="M12 12c.8 1.4-.5 2 .5 3.6.6 1 .5 2.4-.5 3.2-1.4 1.1-3.5.3-3.5-1.8 0-1.6 1.5-2.3 2-3.5.4-1 .3-1.8 1-1.5z"/></svg>';
function streakStrip() {
  const s = streakInfo(P.days), week = lastDays(P.days, 7);
  const revDue = typeof reviewDueCount === "function" ? reviewDueCount() : 0;
  const practisedWeek = week.filter(d => d.done).length;
  const dots = week.map(d => `<span class="sl-dot${d.done ? " on" : ""}${d.isToday ? " today" : ""}"></span>`).join("");
  const next = pathSteps(routePathChoice()).find(st => !st.done);
  const cta = revDue
    ? `<a class="btn brand sl-cta" href="#review">Review ${revDue} card${revDue === 1 ? "" : "s"} →</a>`
    : !s.todayDone ? `<a class="btn brand sl-cta" href="${next ? next.href : "#learn"}">${next ? "Continue learning" : "Keep exploring"} →</a>` : "";
  const goal = s.todayDone
    ? `<span class="sl-goal on">You've practised today${s.streak > 1 ? ", streak safe" : ""}.</span>`
    : `<span class="sl-goal">Do one thing today ${s.streak ? `to keep your ${s.streak}-day streak going` : "to start a streak"}.</span>`;
  return `<section class="streak-strip${s.streak ? " lit" : ""}" aria-label="Your streak and today's goal">
    <div class="sl-flame" aria-hidden="true">${FLAME_SVG}<b class="sl-n">${s.streak}</b></div>
    <div class="sl-main">
      <div class="sl-head"><b>${s.streak} day${s.streak === 1 ? "" : "s"} in a row</b>
        <span class="sl-week" role="img" aria-label="Practised ${practisedWeek} of the last 7 days">${dots}</span></div>
      ${goal}
    </div>
    ${cta}
  </section>`;
}

/* TODAY */
// Someone who hasn't done anything yet gets a calmer home page: four ways in, their route, a beginner question,
// and the news as one line. Once they've earned any XP or finished anything, the full page returns.
const isNewcomer = () => !P.xp && !count(P.done) && !count(P.labs) && !count(P.missions) && !count(P.agency);
function startCards(news, kev) {
  const basics = pathSteps(DATA.paths.find(p => p.id === "awareness") || DATA.paths[0])[0];
  const shift = (DATA.agency || [])[0];
  const card = (href, pic, eyebrow, title, text, cta, trail = "") => `<a class="lcard art-card start-card" href="${href}"${trail ? ` data-trail="${esc(trail)}"` : ""}>${pic}
    <span class="eyebrow">${eyebrow}</span><h3>${title}</h3><p>${text}</p><span class="start-cta">${cta} →</span></a>`;
  return `<section class="start" aria-labelledby="start-h"><h2 id="start-h">Where do you want to start?</h2><p class="muted start-note">No account needed. Your progress stays in this browser; open <a href="#progress">You</a> to back it up or move it to another device.</p><div class="start-grid">
    ${card(esc(basics?.href || "#learn"), cardArt("cia-triad"), "New to security", "Learn the basics", "Short lessons with pictures, then a game. No experience needed.", "Start the basics", basics ? "awareness" : "")}
    ${card("#exams", cardPhoto("img/heads/exams.webp", 494, 247), "Studying for an exam", "Network+, Security+ or PenTest+", "See what to practise for each objective, then take a mock exam.", "Open exam prep")}
    ${shift?.clientImage ? card("#agency", cardPhoto(shift.clientImage.small || shift.clientImage.src, 800, Math.round(800 * shift.clientImage.height / shift.clientImage.width)), "PATCH//AGENCY", "Work a SOC shift", "Clock in at a security operations centre. Watch your shift lead work it first, then take the desk.", "Clock in") : ""}
    ${card("#news", cardArt("nation-state"), "Just the news", "This week, explained", `${news.length} stories in plain English, and ${kev.length} ${kev.length === 1 ? "bug" : "bugs"} being exploited right now.`, "Read the news")}
  </div></section>`;
}
VIEWS.today = () => {
  const news = DATA.news, m = DATA.meta;
  const kev = DATA.kev.slice().sort((a, b) => b.kev.added.localeCompare(a.kev.added));
  const sources = new Set(news.map(n => n.source)).size;
  const counts = {};
  news.forEach(n => n.topics.forEach(t => counts[t] = (counts[t] || 0) + 1));
  const trend = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = trend[0];
  const featured = news.filter(n => n.topics.length);

  const head = `<div class="view-head home-head"><h1>Learn it. Break it. <em class="accent">Understand it.</em></h1>
      <p>Hands-on cyber security and IT: see how attacks work, learn how to defend against them, and understand the news behind every headline. Free, visual, and built for real exams.</p></div>`;
  if (isNewcomer()) {
    main.innerHTML = `<div class="view">${head}${startCards(news, kev)}
      <section class="panel route-panel" aria-labelledby="route-h"><div id="route"></div></section>
      <div class="split"><section class="panel" id="daily"></section>
        <aside class="panel news-line"><div class="eyebrow">This week</div><p><b>${news.length} stories</b> from ${sources} outlets, each linked to a lesson that explains it.</p><a class="btn ghost" href="#news">Read the news →</a></aside></div>
    </div>`;
    renderDaily(); drawRoute(); animateBriefing();
    return;
  }
  main.innerHTML = `<div class="view">${head}
    ${streakStrip()}
    <section class="panel route-panel" aria-labelledby="route-h"><div id="route"></div></section>
    <div class="split">
      <div class="stack" style="gap:18px">
        <section class="changelog" aria-labelledby="today-h">
          <div class="win-bar"><b>this-week.log</b><span>v${esc(m.version)} · ${esc(m.dateLong)}</span></div>
          <div class="win-body">
          <div class="ver"><span class="ps">guest@patchnotes</span>:<i style="font-style:normal;color:var(--sun)">~$</i> <span class="cmd">patchnotes --since ${m.days}d --explain</span></div>
          <h2 id="today-h">This week in security</h2>
          <ul>
            <li><span class="mk add">+</span><span><a href="#news"><span class="count" data-to="${news.length}">${news.length}</span> stories</a> from ${sources} outlets, each linked to a lesson that explains it.</span></li>
            <li><span class="mk warn">!</span><span><a href="#cves" data-radar-prio="1"><span class="count" data-to="${kev.length}">${kev.length}</span> ${kev.length === 1 ? "vulnerability" : "vulnerabilities"}</a> newly confirmed as actively exploited. These get patched first.</span></li>
            <li><span class="mk add">+</span><span><a href="#cves"><span class="count" data-to="${m.cveCount}">${m.cveCount.toLocaleString()}</span> new CVEs</a> published in the last ${m.days} days.</span></li>
            ${top ? `<li><span class="mk trend">~</span><span>Most-covered topic: <a href="#lesson-${esc(top[0])}">${esc(TOPIC_NAME(top[0]))}</a>, in <span class="count" data-to="${top[1]}">${top[1]}</span> stories.</span></li>` : ""}
          </ul>
          </div>
        </section>
        <section class="panel">
          <div class="panel-title"><h2>Top stories</h2><a class="link-btn" href="#news">All ${news.length} stories →</a></div>
          <div class="stories">${featured.slice(0, 3).map(storyHtml).join("")}</div>
        </section>
      </div>
      <aside class="stack" style="gap:18px">
        <section class="panel" id="daily"></section>
        ${stackItems().length ? stackCard() : ""}
        <section class="panel">
          <div class="panel-title"><h2>Patch these first</h2><a class="link-btn" href="#cves" data-radar-prio="1">Radar →</a></div>
          <div class="kev-list">${kev.slice(0, 5).map(c => `<div class="kev-item"><b>${esc(c.kev.name)}</b><span>${esc(c.id)} · added ${esc(c.kev.added)}${c.kev.ransomware ? " · used by ransomware" : ""}</span></div>`).join("") || '<p class="muted">None this week.</p>'}</div>
        </section>
      </aside>
    </div>
  </div>`;
  renderDaily();
  drawRoute();
  animateBriefing();
};

// Bring the daily briefing to life on open: the command types out and the headline numbers count up.
// Both respect reduced motion by jumping straight to the final state.
const prefersReduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
function countUp(el, ms = 900) {
  const to = Number(el.dataset.to); if (!Number.isFinite(to)) return;
  if (prefersReduced() || to <= 0) { el.textContent = to.toLocaleString("en-GB"); return; }
  const t0 = performance.now();
  const step = now => { const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * e).toLocaleString("en-GB"); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function typeLine(el, ms = 30) {
  const full = el.textContent; if (!full || prefersReduced()) return;
  el.textContent = ""; el.classList.add("typing"); let i = 0;
  const tick = () => { el.textContent = full.slice(0, ++i); if (i < full.length) setTimeout(tick, ms); else el.classList.remove("typing"); };
  setTimeout(tick, 220);
}
function animateBriefing() {
  main.querySelectorAll(".changelog .count").forEach(el => countUp(el));
  const cmd = main.querySelector(".changelog .ver .cmd"); if (cmd) typeLine(cmd);
}

document.addEventListener("click", e => { const r = e.target.closest?.("[data-reset-lab]"); if (r) resetLab(r.dataset.resetLab); });

/* STACK ("Am I affected?") */
const STACK = Object.fromEntries(DATA.stack.map(s => [s.id, s]));
const stackItems = () => (P.stack || []).map(id => STACK[id]).filter(Boolean);
const stackHits = text => { const t = text.toLowerCase(); return stackItems().filter(s => s.terms.some(w => t.includes(w))); };
// Vulnerabilities match on the affected product names (vendor + product), not on description text,
// so a library bug that merely mentions Windows doesn't tell a Windows user to update.
const stackHitsCve = c => {
  const prod = " " + c.products.join(" | ").toLowerCase() + " ", d = c.description.toLowerCase();
  return stackItems().filter(s => s.cpe.some(w => prod.includes(" " + w)) || (s.desc || []).some(w => d.includes(w)));
};
function stackCard() {
  if (!stackItems().length) return `<section class="panel stack-cta"><div class="eyebrow">Am I affected?</div><h2>Personal alerts</h2>
    <p class="muted">Pick your phone, browser and router. We'll flag what affects you.</p>
    <a class="btn brand" href="#stack" style="justify-self:start">Set up · +10 XP</a></section>`;
  const stories = DATA.news.filter(n => stackHits(n.title + " " + n.snippet).length);
  const vulns = DATA.cves.filter(c => (c.kev || c.priority <= 3) && stackHitsCve(c).length).sort((a, b) => a.priority - b.priority);
  const advice = vulns.slice(0, 3).map(c => {
    const what = stackHitsCve(c).map(s => s.label).join(", ");
    return `<div class="kev-item ${c.kev ? "" : "soft"}"><b>${c.kev ? "Update now" : "Update soon"}: ${esc(what)}</b><span>${esc(c.id)} · ${c.kev ? "being exploited" : PRIO[c.priority].label.toLowerCase()} · <a href="#cves" data-cve="${esc(c.id)}">details</a></span></div>`;
  }).join("");
  return `<section class="panel"><div class="panel-title"><h2>Your stack</h2><a class="link-btn" href="#stack">Edit</a></div>
    <p class="muted" style="font-size:0.9rem">${stackItems().map(s => esc(s.label)).join(" · ")}</p>
    <p><strong>${stories.length}</strong> ${stories.length === 1 ? "story mentions" : "stories mention"} your tech this week${stories.length ? ` · <a href="#news" data-news-stack="1">show them</a>` : ""}.</p>
    ${advice || `<p class="muted" style="font-size:0.9rem">No exploited or critical vulnerabilities for your stack ${CVES_READY ? "this week" : "in the exploited list"}. Nice.</p>`}
  </section>`;
}
VIEWS.stack = () => {
  const chosen = new Set(P.stack || []);
  const groups = [...new Set(DATA.stack.map(s => s.group))];
  main.innerHTML = `<div class="view"><div class="view-head"><a class="link-btn" href="#today">← Today</a><div class="eyebrow">Am I affected?</div><h1>What do you use?</h1>
</div>
    <div class="stack" id="stack-pick">${groups.map(g => `<section class="stack" style="gap:8px"><h2 class="eyebrow">${esc(g)}</h2><div class="row">${DATA.stack.filter(s => s.group === g).map(s => `<button class="chip" data-stack="${esc(s.id)}" aria-pressed="${chosen.has(s.id)}">${esc(s.label)}</button>`).join("")}</div></section>`).join("")}</div>
    <div class="row"><button class="btn brand" id="stack-save">Save my stack</button><span class="muted" id="stack-n">${chosen.size} selected</span></div></div>`;
  $("stack-pick").addEventListener("click", e => {
    const b = e.target.closest("[data-stack]"); if (!b) return;
    chosen.has(b.dataset.stack) ? chosen.delete(b.dataset.stack) : chosen.add(b.dataset.stack);
    b.setAttribute("aria-pressed", chosen.has(b.dataset.stack)); $("stack-n").textContent = `${chosen.size} selected`;
  });
  $("stack-save").addEventListener("click", () => {
    const first = !(P.stack && P.stack.length);
    P.stack = [...chosen];
    if (first && P.stack.length) award(10, "Stack set up"); else progressChanged();
    location.hash = "today";
  });
};

function renderDaily() {
  const box = $("daily"); if (!box) return;
  // Until a few lessons are done, the daily question comes from the everyday-security route's topics
  // (phishing, passwords, breaches...), not technical ones like CVSS.
  const basics = new Set((DATA.paths.find(p => p.id === "awareness")?.steps || []).filter(st => st.type === "lesson").map(st => st.id));
  const easy = DATA.quiz.filter(x => basics.has(x.topic));
  const pool = count(P.done) < 3 && easy.length ? easy : DATA.quiz;
  const q = mixOptions(pool[dayNumber() % pool.length], seededRand(dayNumber() + 7));
  const today = todayStr();
  const answered = P.daily && P.daily.date === today ? P.daily.choice : null;
  box.innerHTML = `<div class="panel-title"><div class="eyebrow">Daily challenge</div><span class="eyebrow">Days practised: ${count(P.days)}</span></div>`;
  box.appendChild(quizBlock(q, {
    answered,
    onAnswer: (choice, correct) => {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yStr = dateStr(y);
      P.streak = P.lastDaily === yStr ? (P.streak || 0) + 1 : 1;
      P.lastDaily = today; P.daily = { date: today, choice };
      saveP();
      if (correct) award(20, "Daily challenge"); else renderXP();
      box.querySelector(".eyebrow:last-child").textContent = `Days practised: ${count(P.days)}`;
      const more = document.createElement("p");
      more.className = "muted"; more.style.fontSize = "0.88rem";
      more.innerHTML = `New question tomorrow. ${LESSON[q.topic] ? `Brush up: <a href="#lesson-${esc(q.topic)}">${esc(LESSON[q.topic].title)}</a>` : ""}`;
      box.appendChild(more);
    }
  }));
}

function storyHtml(s) {
  const seen = new Set();
  return `<article class="story">
    <div class="meta"><span>${esc(s.source)}</span><span>${ago(s.date)}</span><a class="read" href="${esc(s.link)}" target="_blank" rel="noopener">Read the story ↗</a></div>
    <h3>${gloss(s.title, 1, seen)}</h3>
    ${s.snippet ? `<p class="snip">${gloss(s.snippet, 2, seen)}</p>` : ""}
    ${DATA.explainers && DATA.explainers[s.link] ? `<details class="eli" data-read="${esc(s.link)}"><summary>What this means</summary><p>${gloss(DATA.explainers[s.link], 4)}</p><p class="ai-note">AI-written explanation, fact-checked against the original article and official vulnerability records. Read the full story for details.</p></details>` : ""}
    ${s.topics.length || s.cves.length ? `<div class="row">${s.topics.filter(t => LESSON[t]).map(t => `<a class="topic" href="#lesson-${esc(t)}">Learn: ${esc(TOPIC_NAME(t))}</a>`).join("")}${s.cves.map(c => CVE_IDS.has(c) ? `<button class="cvetag" data-cve="${esc(c)}" title="Open on the CVE Radar">${esc(c)}</button>` : `<a class="cvetag" href="https://nvd.nist.gov/vuln/detail/${esc(c)}" target="_blank" rel="noopener" title="Open on NVD">${esc(c)} ↗</a>`).join("")}</div>` : ""}
  </article>`;
}

