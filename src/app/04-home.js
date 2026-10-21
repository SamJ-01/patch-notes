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

/* Home hero network: two PCs, a switch, a router, the internet and a server, with packets moving between them. */
/* Home hero network: every device is clickable and explains itself. Packets travel the real paths. */
const HERO_DEV = [  // kind, x, y, label
  ["laptop", 46, 50, "laptop"], ["phone", 46, 130, "phone"], ["pc", 46, 212, "PC"],
  ["ap", 150, 44, "access point", "side"], ["switch", 150, 130, "switch"], ["server", 150, 218, "server"],
  ["router", 258, 130, "router"], ["firewall", 344, 130, "firewall"], ["cloud", 424, 130, "internet"],
];
const HERO_LINKS = [[0, 4], [2, 4], [3, 4], [5, 4], [4, 6], [6, 7], [7, 8]];
const HERO_PATHS = ["M46 50 L150 130 L258 130 L344 130 L424 130", "M424 130 L344 130 L258 130 L150 130 L46 212", "M46 130 L150 44 L150 130 L150 218"];
function heroNet() {
  const P = i => HERO_DEV[i];
  return `<div class="hero-art"><svg class="hero-net hw-live" viewBox="-10 -10 490 272" role="group" aria-label="A small network. Select a device to learn what it does.">
    ${HERO_LINKS.map(([a, b]) => `<line class="ln" x1="${P(a)[1]}" y1="${P(a)[2]}" x2="${P(b)[1]}" y2="${P(b)[2]}"/>`).join("")}
    <line class="ln air" x1="46" y1="130" x2="150" y2="44"/>
    ${HERO_PATHS.map((d, i) => `<circle class="pkt p${i + 1}" r="5"><animateMotion dur="${3.6 + i * 0.6}s" begin="${-i * 1.2}s" repeatCount="indefinite" path="${d}" calcMode="linear"/></circle>`).join("")}
    ${HERO_DEV.map(([k, x, y, label, side]) => `<g class="hero-dev" data-k="${k}" tabindex="0" role="button" aria-label="${esc(HW_INFO[k][0])}: ${esc(HW_INFO[k][1])}">
      <rect class="halo" x="${x - 34}" y="${y - 30}" width="68" height="${label ? 72 : 60}" rx="12"/>
      ${hw(k, x, y, 0.72)}<text class="lbl" ${side ? `x="${x + 26}" y="${y + 4}" style="text-anchor:start"` : `x="${x}" y="${y + 33}"`}>${esc(label)}</text></g>`).join("")}
  </svg><p class="hero-cap" id="hero-cap" aria-live="polite">Tap any device to see what it does.</p></div>`;
}
function wireHero() {
  const svg = main.querySelector(".hero-net"); if (!svg) return;
  const pick = g => {
    svg.querySelectorAll(".hero-dev.sel").forEach(x => x.classList.remove("sel"));
    g.classList.add("sel");
    const [name, what] = HW_INFO[g.dataset.k];
    $("hero-cap").innerHTML = `<b>${esc(name)}</b> · ${esc(what)}`;
  };
  svg.addEventListener("click", e => { const g = e.target.closest(".hero-dev"); if (g) pick(g); });
  svg.addEventListener("keydown", e => { const g = e.target.closest(".hero-dev"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(g); } });
  svg.addEventListener("mouseover", e => { const g = e.target.closest(".hero-dev"); if (g && !g.classList.contains("sel")) pick(g); });
}

/* TODAY */
VIEWS.today = () => {
  const news = DATA.news, m = DATA.meta;
  const kev = DATA.kev.slice().sort((a, b) => b.kev.added.localeCompare(a.kev.added));
  const sources = new Set(news.map(n => n.source)).size;
  const counts = {};
  news.forEach(n => n.topics.forEach(t => counts[t] = (counts[t] || 0) + 1));
  const trend = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = trend[0];
  const featured = news.filter(n => n.topics.length);

  main.innerHTML = `<div class="view">
    ${P.intro ? "" : welcomeHtml()}
    <div class="view-head hero"><div class="stack" style="gap:14px">
      <div class="stack" style="gap:10px"><h1>Learn it. Break it. <em class="accent">Understand it.</em></h1><p>Hands-on cyber security and IT: see how attacks work, learn how to defend against them, and understand the news behind every headline. Free, visual, and built for real exams.</p></div>
      <div class="hero-stats">
        <span class="hero-stat"><b>${DATA.lessons.length}</b> visual lessons</span>
        <span class="hero-stat"><b>${DATA.labs.length + DATA.missions.length}</b> interactive labs &amp; missions</span>
        <span class="hero-stat"><b>Network+ · Security+</b> exam prep</span>
        <span class="hero-stat"><b>Daily</b> news, explained</span>
      </div>
      <div class="row hero-cta"><a class="btn brand" href="#learn">Choose a learning path →</a><a class="btn ghost" href="#play">Spot a phishing email</a></div>
    </div>${heroNet()}</div>
    <div class="split">
      <div class="stack" style="gap:18px">
        ${continueCard()}
        ${missionSuggestionCard()}
        <section class="changelog" aria-labelledby="today-h">
          <div class="win-bar"><b>this-week.log</b><span>v${esc(m.version)} · ${esc(m.dateLong)}</span></div>
          <div class="win-body">
          <div class="ver"><span class="ps">guest@patchnotes</span>:<i style="font-style:normal;color:var(--sun)">~$</i> patchnotes --since ${m.days}d --explain</div>
          <h2 id="today-h">This week in security</h2>
          <ul>
            <li><span class="mk add">+</span><span><a href="#news">${news.length} stories</a> from ${sources} outlets, each linked to a lesson that explains it.</span></li>
            <li><span class="mk warn">!</span><span><a href="#cves" data-radar-prio="1">${kev.length} ${kev.length === 1 ? "vulnerability" : "vulnerabilities"}</a> newly confirmed as actively exploited. These get patched first.</span></li>
            <li><span class="mk add">+</span><span><a href="#cves">${m.cveCount.toLocaleString()} new CVEs</a> published in the last ${m.days} days.</span></li>
            ${top ? `<li><span class="mk trend">~</span><span>Most-covered topic: <a href="#lesson-${esc(top[0])}">${esc(TOPIC_NAME(top[0]))}</a>, in ${top[1]} stories.</span></li>` : ""}
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
  wireHero();
};

/* WELCOME: first visit only */
const WELCOME = [
  { id: "new", title: "I'm new to cyber security", text: "Start with the basics: scams, passwords and how attacks work. About 20 minutes.", href: "#path-awareness", cta: "Start the basics path" },
  { id: "career", title: "I want a job in cyber", text: "See the entry-level roles, what they involve, and a learning path for each.", href: "#careers", cta: "Explore careers" },
  { id: "news", title: "Just here for the news", text: "Today's security news, with every story linked to a plain-English explanation.", href: "#news", cta: "Read the news" },
];
function welcomeHtml() {
  return `<section class="panel welcome" aria-labelledby="welcome-h">
    <div class="panel-title"><h2 id="welcome-h">Welcome. What brings you here?</h2><button class="link-btn" data-intro="skip">Skip</button></div>
    <div class="welcome-grid">${WELCOME.map(w => `<a class="lcard" href="${w.href}" data-intro="${w.id}"><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p><span class="link-btn">${esc(w.cta)} →</span></a>`).join("")}</div>
    </section>`;
}
document.addEventListener("click", e => { const r = e.target.closest?.("[data-reset-lab]"); if (r) resetLab(r.dataset.resetLab); });
document.addEventListener("click", e => {
  const w = e.target.closest?.("[data-intro]"); if (!w) return;
  P.intro = w.dataset.intro; saveP();
  if (w.dataset.intro === "skip") rerender();
});

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
function continueCard() {
  const started = DATA.paths.find(p => !P.paths[p.id] && pathSteps(p).some(st => st.done));
  const p = started || DATA.paths.find(p => p.id === "soc" && !P.paths[p.id]) || DATA.paths.find(p => !P.paths[p.id]);
  if (!p) return "";
  const steps = pathSteps(p), next = steps.find(st => !st.done), done = steps.filter(st => st.done).length;
  return `<section class="panel continue"><div class="eyebrow">${started ? "Pick up where you left off" : "Suggested path"} · ${done}/${steps.length}</div>
    <h2>${esc(p.title)}</h2>
    <div class="progress"><span class="trk" aria-hidden="true" style="flex:1 1 auto"><i style="width:${Math.round(done / steps.length * 100)}%"></i></span></div>
    <p>Next: <strong>${esc(next.label)}</strong> <span class="muted">(${esc(next.kind)})</span></p>
    <div class="row"><a class="btn brand" href="${next.href}">${started ? "Continue" : "Start"}</a><a class="link-btn" href="#path-${esc(p.id)}">See the whole path</a></div></section>`;
}
function missionSuggestionCard() {
  const m = DATA.missions.find(x => !count((P.missions || {})[x.id])) || DATA.missions[0];
  if (!m) return "";
  const modesDone = Object.keys((P.missions || {})[m.id] || {});
  return `<section class="panel"><div class="eyebrow">Mission · ${m.minutes} min · ${esc(m.topic)}</div>
    <h2>${esc(m.title)}</h2><p class="muted">${esc(m.summary)}</p>
    <div class="row">${Object.keys(m.modes).map(k => `<span class="pchip">${modesDone.includes(k) ? "✓ " : ""}${esc(m.modes[k].label)}</span>`).join("")}</div>
    <a class="btn brand" href="#mission-${esc(m.id)}" style="justify-self:start">Open mission</a></section>`;
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
  const q = mixOptions(DATA.quiz[dayNumber() % DATA.quiz.length], seededRand(dayNumber() + 7));
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

