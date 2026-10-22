/* NEWS */
const NS = { q: "", topic: "all", source: "all", shown: 25, stack: false };
VIEWS.news = () => {
  const counts = {};
  DATA.news.forEach(n => n.topics.forEach(t => counts[t] = (counts[t] || 0) + 1));
  const topics = Object.entries(counts).filter(([t]) => LESSON[t]).sort((a, b) => b[1] - a[1]);
  const sources = [...new Set(DATA.news.map(n => n.source))].sort();
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("news")}<h1>Security news, explained</h1>
</div>
    <div class="controls">
      <div class="row"><label class="sr" for="nq">Search news</label><input id="nq" type="search" placeholder="Search headlines (e.g. Microsoft, ransomware, CVE-2026)" value="${esc(NS.q)}">
        <label class="sr" for="nsrc">Source</label><select id="nsrc"><option value="all">All sources</option>${sources.map(s => `<option ${NS.source === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      <div class="row" id="ntopics">
        <button class="chip" data-t="all" aria-pressed="${NS.topic === "all" && !NS.stack}">All</button>
        ${stackItems().length ? `<button class="chip" data-t="__stack" aria-pressed="${NS.stack}">Your stack</button>` : `<a class="chip" href="#stack" style="text-decoration:none">+ Am I affected?</a>`}
        ${topics.map(([t, n]) => `<button class="chip" data-t="${esc(t)}" aria-pressed="${NS.topic === t}">${esc(TOPIC_NAME(t))}<span class="n">${n}</span></button>`).join("")}
      </div>
    </div>
    <section class="panel"><h2 class="sr-only">Stories</h2><div class="eyebrow" id="ncount" aria-live="polite"></div><div class="stories" id="nlist"></div></section>
    <button class="btn ghost more" id="nmore" hidden>Show more</button>
  </div>`;
  const draw = () => {
    const q = NS.q.trim().toLowerCase();
    const rows = DATA.news.filter(n => (!NS.stack || stackHits(n.title + " " + n.snippet).length) && (NS.topic === "all" || n.topics.includes(NS.topic)) && (NS.source === "all" || n.source === NS.source) &&
      (!q || (n.title + " " + n.snippet + " " + n.cves.join(" ")).toLowerCase().includes(q)));
    $("ncount").textContent = `${rows.length} ${rows.length === 1 ? "story" : "stories"}${NS.topic !== "all" ? " about " + TOPIC_NAME(NS.topic) : ""}`;
    $("nlist").innerHTML = rows.slice(0, NS.shown).map(storyHtml).join("") || `<div class="empty">No stories match. Try another topic or search.</div>`;
    $("nmore").hidden = rows.length <= NS.shown;
  };
  $("nq").addEventListener("input", e => { NS.q = e.target.value; NS.shown = 25; draw(); });
  $("nsrc").addEventListener("change", e => { NS.source = e.target.value; NS.shown = 25; draw(); });
  $("ntopics").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; NS.stack = b.dataset.t === "__stack"; NS.topic = NS.stack ? "all" : b.dataset.t; NS.shown = 25;
    $("ntopics").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b)); draw(); });
  $("nmore").addEventListener("click", () => { NS.shown += 25; draw(); });
  draw();
};

/* CVE RADAR */
const PRIO = {
  1: { label: "Exploited", tile: "being exploited", why: "On CISA's KEV list. Attackers are using these now." },
  2: { label: "Likely", tile: "likely to be exploited", why: "EPSS 10%+ chance of attack in 30 days." },
  3: { label: "Critical", tile: "critical, not yet attacked", why: "CVSS 9.0+ but no attacks seen." },
  4: { label: "High", tile: "high severity", why: "CVSS 7.0–8.9." },
  5: { label: "Other", tile: "other", why: "Lower or no score yet." },
};
const WKEY = "patch-notes-watch";
const RS = { q: "", prio: "all", onlyNew: false, onlyWatch: false, sort: "priority", shown: 10, watch: null };
try { const w = JSON.parse(localStorage.getItem(WKEY)); if (Array.isArray(w)) RS.watch = w; } catch (e) {}
if (!RS.watch) RS.watch = DATA.meta.watchlist.slice();
const saveWatch = () => { try { localStorage.setItem(WKEY, JSON.stringify(RS.watch)); } catch (e) {} };

function hay(c) {
  if (!c._hay) c._hay = [c.id, c.description, c.products.join(" "), c.cwes.map(id => id + " " + (DATA.cwe[id]?.name || "")).join(" "), c.kev?.name || ""].join(" ").toLowerCase();
  return c._hay;
}
const watchHits = c => [...RS.watch.filter(t => hay(c).includes(t)), ...stackHitsCve(c).map(s => s.label)];
function headline(c) {
  if (c.kev?.name) return c.kev.name;
  const l = c.cwes.map(id => DATA.cwe[id]).find(Boolean);
  if (l && c.products[0]) return `${l.name} in ${c.products[0]}`;
  if (l) return l.name;
  const first = (c.description.match(/^.*?\.(?=\s|$)/) || [c.description])[0];
  return first.length > 110 ? first.slice(0, 107) + "…" : first;
}
function decodeVector(vec) {
  if (!vec) return null;
  const m = Object.fromEntries(vec.split("/").map(p => p.split(":")));
  const out = [];
  const av = { N: "over the network, potentially from anywhere on the internet", A: "from the same local network (e.g. same Wi-Fi)", L: "only with access to the machine itself", P: "only with physical access to the device" }[m.AV];
  if (av) out.push(`An attacker can reach it ${av}.`);
  const pr = { N: "No login is needed.", L: "They need an ordinary user account.", H: "They need an admin-level account." }[m.PR];
  if (pr) out.push(pr);
  if (m.Au) out.push(m.Au === "N" ? "No login is needed." : "They need to log in first.");
  const ui = { N: "No one has to click or open anything.", R: "A user must do something, like open a file or click a link.", P: "A user must do something, like open a file or click a link.", A: "A user must actively interact with the attack." }[m.UI];
  if (ui) out.push(ui);
  if (m.AC === "H") out.push("It only works under specific conditions, which makes it harder to pull off.");
  const c = m.VC || m.C, i = m.VI || m.I, a = m.VA || m.A, impact = [];
  if (c === "H" || c === "C") impact.push("read sensitive data"); else if (c === "L" || c === "P") impact.push("see some data");
  if (i === "H" || i === "C") impact.push("change or plant data"); else if (i === "L" || i === "P") impact.push("change some data");
  if (a === "H" || a === "C") impact.push("crash or shut down the service");
  if (impact.length) out.push(`If it works, they could ${impact.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
  return out;
}
function worry(c) {
  const lines = [];
  if (c.kev) {
    lines.push(`<strong>Attackers are already using this.</strong> CISA added it to the KEV list on ${esc(c.kev.added)} and requires US federal agencies to fix it by ${esc(c.kev.due)}.`);
    if (c.kev.ransomware) lines.push("It has been used in ransomware campaigns.");
  }
  lines.push(c.epss != null
    ? `EPSS gives it a <strong>${pct(c.epss)}</strong> chance of being exploited in the next 30 days. That's higher than ${Math.round(c.epss_pct * 100)}% of all scored CVEs.`
    : "No EPSS score yet. Brand-new CVEs often take a day or two to be scored.");
  lines.push(c.cvss != null
    ? `Its CVSS ${esc(c.cvss_version || "")} severity is <strong>${c.cvss}/10 (${esc(c.severity.toLowerCase())})</strong>.`
    : "It has no CVSS severity score yet. NVD often scores new CVEs later.");
  return lines;
}
function cveCard(c) {
  const seen = new Set();
  const hits = watchHits(c);
  const known = c.cwes.filter(id => DATA.cwe[id]).map(id => ({ id, ...DATA.cwe[id] }));
  const vector = decodeVector(c.vector);
  const desc = c.description.length > 320 ? c.description.slice(0, 317) + "…" : c.description;
  const lessonHtml = known.length
    ? known.map(l => `<p><strong>${esc(l.name)}</strong> <span class="mono muted">(${esc(l.id)})</span>. ${esc(l.plain)}</p><p class="defend"><strong>How it's prevented:</strong> ${esc(l.defend)}</p>`).join("")
    : c.cwes.length
      ? `<p>This is classified as ${c.cwes.map(id => `<a href="https://cwe.mitre.org/data/definitions/${esc(id.slice(4))}.html" target="_blank" rel="noopener">${esc(id)}</a>`).join(", ")}. Follow the link for MITRE's description.</p>`
      : `<p>No weakness type has been assigned yet. Look for clues in the description: words like "injection", "overflow" or "bypass" usually point to the category.</p>`;
  return `<article class="card p${c.priority}">
    <div class="card-top"><span class="pill">${PRIO[c.priority].label}</span>${c.new ? '<span class="tag new">New</span>' : ""}${c.kev?.ransomware ? '<span class="tag" style="color:var(--exploited);border-color:var(--exploited)">Ransomware</span>' : ""}${hits.map(h => `<span class="tag watch">Watching: ${esc(h)}</span>`).join("")}<span class="cid">${esc(c.id)}</span></div>
    <h3 class="headline">${gloss(headline(c), 2, seen)}</h3>
    <p class="desc">${gloss(desc, 4, seen)}</p>
    <dl class="facts">
      <div><dt>Severity · CVSS</dt><dd>${c.cvss != null ? `${c.cvss} <span class="muted" style="font-weight:400">${esc(c.severity.toLowerCase())}</span>` : "Not scored yet"}</dd></div>
      <div><dt>Likelihood · EPSS</dt><dd>${pct(c.epss)}${c.epss != null ? `<span class="meter" aria-hidden="true"><i style="width:${Math.max(2, Math.round(c.epss_pct * 100))}%"></i></span>` : ""}</dd></div>
      <div><dt>Affects</dt><dd>${esc(c.products.slice(0, 2).join(", ") || "See description")}${c.products.length > 2 ? ` +${c.products.length - 2}` : ""}</dd></div>
      <div><dt>${c.published ? "Published" : "Added to KEV"}</dt><dd>${esc(c.published || c.kev?.added || "")}</dd></div>
    </dl>
    <details class="explain"><summary>Explain this in plain English</summary>
      <div class="lesson-grid">
        ${c.kev ? `<div class="kevbox"><strong>What defenders are told to do:</strong> ${esc(c.kev.action)}</div>` : ""}
        <section><h4>What kind of bug is this?</h4>${lessonHtml}</section>
        <section><h4>How would an attacker use it?</h4>${vector ? `<ul>${vector.map(s => `<li>${esc(s)}</li>`).join("")}</ul><p class="vector"><a href="#cvss-decode/${encodeURIComponent(c.vector)}" title="Explain this vector">${esc(c.vector)}</a></p>` : "<p>No CVSS vector yet, so the attack path hasn't been formally described. Check the vendor advisory.</p>"}</section>
        <section><h4>How worried should you be?</h4>${worry(c).map(l => `<p>${l}</p>`).join("")}</section>
        <div class="links"><a href="https://nvd.nist.gov/vuln/detail/${esc(c.id)}" target="_blank" rel="noopener">Full NVD record</a><a href="https://www.cve.org/CVERecord?id=${esc(c.id)}" target="_blank" rel="noopener">CVE.org</a><a href="#lesson-vuln-management">Lesson: how teams prioritise</a></div>
      </div>
    </details>
  </article>`;
}
VIEWS.cves = () => {
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("cves")}<h1>Which vulnerabilities actually matter</h1>
      <p>This week's vulnerabilities, ranked by real-world risk.</p></div>
    <section class="glance" id="glance" aria-label="At a glance"></section>
    <details class="more-what fold-sec"><summary><h2>How the priority works</h2><span class="muted">exploited, likely, critical, high, other</span></summary>
      <div class="ladder">
        <div class="rung p1"><b>1 · Exploited</b><span>On CISA's KEV list. Patch now.</span></div>
        <div class="rung p2"><b>2 · Likely</b><span>EPSS of 10% or more.</span></div>
        <div class="rung p3"><b>3 · Critical</b><span>CVSS 9.0+, no attacks seen yet.</span></div>
        <div class="rung p4"><b>4 · High</b><span>CVSS 7.0–8.9.</span></div>
        <div class="rung p5"><b>5 · Other</b><span>Lower or not scored yet.</span></div>
      </div>
      <p class="muted" style="font-size:0.88rem">New to CVE, CVSS, EPSS and KEV? <a href="#lesson-vuln-management">Take the 5-minute lesson</a>.</p>
    </details>
    ${trendsHtml()}
    <div class="controls">
      <div class="row"><label class="sr" for="rq">Search vulnerabilities</label><input id="rq" type="search" placeholder="Search a product, vendor, CVE or bug type (e.g. apple, SQL injection)" value="${esc(RS.q)}">
        <label class="sr" for="rsort">Sort</label><select id="rsort">
          <option value="priority">Sort: priority</option><option value="epss">Sort: likelihood (EPSS)</option><option value="cvss">Sort: severity (CVSS)</option><option value="newest">Sort: newest</option></select></div>
      <div class="row" id="rchips"></div>
      <div class="watch" id="rwatch"></div>
    </div>
    <div class="eyebrow" id="rcount" aria-live="polite"></div>
    <div class="cards" id="rlist"></div>
    <button class="btn ghost more" id="rmore" hidden>Show more</button>
  </div>`;
  $("rsort").value = RS.sort;
  $("rq").addEventListener("input", e => { RS.q = e.target.value; RS.shown = 10; drawRadarList(); });
  $("rsort").addEventListener("change", e => { RS.sort = e.target.value; drawRadarList(); });
  $("rmore").addEventListener("click", () => { RS.shown += 10; drawRadarList(); });
  $("glance").addEventListener("click", e => {
    const t = e.target.closest(".tile"); if (!t) return;
    if (t.dataset.key === "watch") { RS.onlyWatch = !RS.onlyWatch; RS.prio = "all"; } else { RS.prio = t.dataset.key; RS.onlyWatch = false; }
    RS.shown = 10; drawRadar();
  });
  $("rchips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    if (b.dataset.prio) RS.prio = b.dataset.prio;
    if (b.dataset.toggle) RS[b.dataset.toggle] = !RS[b.dataset.toggle];
    RS.shown = 10; drawRadar();
  });
  $("rwatch").addEventListener("click", e => { const rm = e.target.closest("[data-rm]"); if (!rm) return; RS.watch.splice(Number(rm.dataset.rm), 1); saveWatch(); drawRadar(); });
  $("rwatch").addEventListener("submit", e => {
    e.preventDefault(); const v = $("rwi").value.trim().toLowerCase();
    if (v && !RS.watch.includes(v)) { RS.watch.push(v); saveWatch(); }
    drawRadar(); $("rwi").focus();
  });
  drawRadar();
};
function drawRadar() {
  const counts = DATA.meta.priorityCounts;
  const wc = CVES_READY ? DATA.cves.filter(c => watchHits(c).length).length : "…";
  const tiles = [
    { key: "all", n: DATA.meta.cveCount, what: "vulnerabilities", why: `Published in the last ${DATA.meta.days} days, plus recent KEV additions.`, c: "var(--brand)", t: "var(--brand-soft)" },
    { key: "1", n: counts[1] || 0, what: PRIO[1].tile, why: PRIO[1].why, c: "var(--exploited)", t: "var(--exploited-tint)" },
    { key: "2", n: counts[2] || 0, what: PRIO[2].tile, why: PRIO[2].why, c: "var(--likely)", t: "var(--likely-tint)" },
    { key: "watch", n: wc, what: "match your watchlist", why: RS.watch.length ? `Mentions ${RS.watch.slice(0, 3).join(", ")}${RS.watch.length > 3 ? "…" : ""}.` : "Add vendors you use below.", c: "var(--ink)", t: "var(--surface-2)" },
  ];
  $("glance").innerHTML = tiles.map(t => `<button class="tile" data-key="${t.key}" aria-pressed="${t.key === "watch" ? RS.onlyWatch : (!RS.onlyWatch && RS.prio === t.key)}" style="--tile:${t.c};--tile-tint:${t.t}"><span class="n">${t.n.toLocaleString()}</span><span class="what">${esc(t.what)}</span><span class="why">${esc(t.why)}</span></button>`).join("");
  $("rchips").innerHTML = [["all", "All"], ...Object.entries(PRIO).map(([k, v]) => [k, v.label])].map(([k, l]) => `<button class="chip" data-prio="${k}" aria-pressed="${RS.prio === k}">${l}</button>`).join("") +
    `<button class="chip" data-toggle="onlyNew" aria-pressed="${RS.onlyNew}">New since last update</button><button class="chip" data-toggle="onlyWatch" aria-pressed="${RS.onlyWatch}">Watchlist only</button>`;
  $("rwatch").innerHTML = `<span>Your watchlist:</span>` + RS.watch.map((t, i) => `<span class="wterm">${esc(t)}<button data-rm="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("") +
    (stackItems().length ? `<span>+ your stack (${stackItems().length}) <a href="#stack">edit</a></span>` : `<a href="#stack">+ add your stack</a>`) + `<form class="inline-form"><label class="sr" for="rwi">Add a vendor or product</label><input id="rwi" placeholder="add vendor/product" autocomplete="off"><button type="submit">Add</button></form>`;
  drawRadarList();
}
function drawRadarList() {
  if (!CVES_READY) {
    $("rcount").textContent = "";
    $("rlist").innerHTML = CVES_FAILED
      ? `<div class="empty">Couldn't load the full CVE list (data/cves.json). If you opened index.html straight from disk, preview it with <span class="mono">python3 build.py --offline --serve</span> instead.</div>`
      : `<div class="empty">Loading ${DATA.meta.cveCount.toLocaleString()} vulnerabilities…</div>`;
    $("rmore").hidden = true;
    return;
  }
  const q = RS.q.trim().toLowerCase();
  const rows = DATA.cves.filter(c => (RS.prio === "all" || c.priority === Number(RS.prio)) && (!RS.onlyNew || c.new) && (!RS.onlyWatch || watchHits(c).length) && (!q || q.split(/\s+/).every(w => hay(c).includes(w))));
  const by = {
    priority: (a, b) => a.priority - b.priority || (b.epss || 0) - (a.epss || 0) || (b.cvss || 0) - (a.cvss || 0),
    epss: (a, b) => (b.epss ?? -1) - (a.epss ?? -1),
    cvss: (a, b) => (b.cvss ?? -1) - (a.cvss ?? -1),
    newest: (a, b) => String(b.published || b.kev?.added).localeCompare(String(a.published || a.kev?.added)),
  }[RS.sort];
  rows.sort(by);
  $("rcount").textContent = `Showing ${Math.min(RS.shown, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} matching vulnerabilities`;
  $("rlist").innerHTML = rows.length ? rows.slice(0, RS.shown).map(cveCard).join("") : `<div class="empty">Nothing matches these filters. Try a broader search or choose "All".</div>`;
  $("rmore").hidden = rows.length <= RS.shown;
}

/* TRENDS: hand-built SVG charts. Severity is ordinal, so it uses one amber ramp (validated
   for the dark surface); single-series charts use the brand cyan. Every mark has a hover tooltip
   and each chart has a table view. */
const SEV_COLORS = { critical: "var(--sev-critical)", high: "var(--sev-high)", other: "var(--sev-other)" };
const SEV_LABEL = { critical: "Critical (9.0+)", high: "High (7.0–8.9)", other: "Other / unscored" };
const niceMax = v => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const fmtDay = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function colPath(x, y0, w, h, r) {  // column grown from baseline y0, rounded data-end on top
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y0}V${y0 - h + r}Q${x},${y0 - h} ${x + r},${y0 - h}H${x + w - r}Q${x + w},${y0 - h} ${x + w},${y0 - h + r}V${y0}Z`;
}
function barPath(x0, y, w, h, r) {  // bar grown from the left baseline, rounded data-end on the right
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x0},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${y + h - r}Q${x0 + w},${y + h} ${x0 + w - r},${y + h}H${x0}Z`;
}
function dailyChart(daily) {
  if (!daily.length) return `<p class="muted">Not enough history yet. This chart fills in as the site runs each day.</p>`;
  const W = 640, H = 220, L = 40, R = 8, T = 10, B = 26, keys = ["other", "high", "critical"];
  const total = d => keys.reduce((a, k) => a + d[k], 0);
  const max = niceMax(Math.max(...daily.map(total)));
  const slot = (W - L - R) / daily.length, bw = Math.min(24, slot * 0.7), y0 = H - B;
  const sy = v => (v / max) * (H - T - B);
  const ticks = [0, max / 2, max];
  let svg = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y0 - sy(t)}" y2="${y0 - sy(t)}" class="grid"/><text x="${L - 6}" y="${y0 - sy(t) + 4}" class="axis" text-anchor="end">${t.toLocaleString()}</text>`).join("");
  const every = Math.ceil(daily.length / 7);
  daily.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    let base = y0;
    const segs = keys.filter(k => d[k] > 0);
    segs.forEach((k, j) => {
      const h = sy(d[k]), top = j === segs.length - 1;
      const gap = j > 0 ? 2 : 0;  // 2px surface gap between stacked segments
      svg += top ? `<path d="${colPath(x, base - gap, bw, h - gap, 4)}" style="fill:${SEV_COLORS[k]}"/>` : `<rect x="${x}" y="${base - h}" width="${bw}" height="${Math.max(0, h - gap)}" style="fill:${SEV_COLORS[k]}"/>`;
      base -= h;
    });
    const tip = `${fmtDay(d.date)}: ${total(d)} CVEs · ${d.critical} critical · ${d.high} high · ${d.other} other`;
    svg += `<rect x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
    if (i % every === 0 || i === daily.length - 1) svg += `<text x="${x + bw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${esc(fmtDay(d.date))}</text>`;
  });
  return `<div class="legend">${keys.slice().reverse().map(k => `<span><i style="background:${SEV_COLORS[k]}"></i>${SEV_LABEL[k]}</span>`).join("")}</div>
    <div class="chart" tabindex="0" role="region" aria-label="New CVEs per day chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="New CVEs per day by severity">${svg}</svg></div>
    <details class="tbl"><summary>View as table</summary><div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Critical</th><th>High</th><th>Other</th><th>Total</th></tr></thead><tbody>${daily.map(d => `<tr><td>${esc(fmtDay(d.date))}</td><td>${d.critical}</td><td>${d.high}</td><td>${d.other}</td><td>${total(d)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
function rankChart(items, label, linkFn) {
  if (!items.length) return `<p class="muted">No data yet.</p>`;
  const W = 640, rowH = 26, L = 200, R = 44, H = items.length * rowH + 4;
  const max = Math.max(...items.map(i => i.n));
  let svg = "";
  items.forEach((it, i) => {
    const y = i * rowH + 4, w = (it.n / max) * (W - L - R);
    svg += `<text x="${L - 10}" y="${y + 13}" class="axis lbl" text-anchor="end">${esc(it.label.length > 28 ? it.label.slice(0, 27) + "…" : it.label)}</text>
      <path d="${barPath(L, y + 2, w, 14, 4)}" style="fill:var(--brand)"/>
      <text x="${L + w + 6}" y="${y + 13}" class="axis val">${it.n.toLocaleString()}</text>
      <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent" data-tip="${esc(`${it.label}: ${it.n.toLocaleString()} CVEs`)}"${linkFn ? ` data-chart-q="${esc(linkFn(it))}"` : ""} style="cursor:${linkFn ? "pointer" : "default"}"/>`;
  });
  return `<div class="chart" tabindex="0" role="region" aria-label="${esc(label)} chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg></div>
    <details class="tbl"><summary>View as table</summary><div class="tbl-wrap"><table><tbody>${items.map(it => `<tr><td>${esc(it.label)}</td><td>${it.n}</td></tr>`).join("")}</tbody></table></div></details>`;
}
function trendsHtml() {
  const t = DATA.trends;
  // Folded away so the list of vulnerabilities is near the top; opening it is one tap.
  return `<details class="more-what fold-sec" id="trends"><summary><h2 id="trends-h">Trends this week</h2><span class="muted">new CVEs per day, bug types, vendors · click a bar to filter</span></summary>
    <div class="trend-grid">
      <section class="panel"><h3>New CVEs per day</h3>${dailyChart(t.daily)}</section>
      <section class="panel"><h3>Most common bug types</h3>${rankChart(t.cwes.map(c => ({ label: c.name, n: c.n, id: c.id })), "Most common bug types", it => it.id.toLowerCase())}</section>
      <section class="panel"><h3>Most-affected vendors</h3>${rankChart(t.vendors.map(v => ({ label: v.name, n: v.n })), "Most-affected vendors", it => it.label.toLowerCase())}</section>
    </div></details>`;
}
const tipEl = document.createElement("div"); tipEl.className = "chart-tip"; tipEl.hidden = true; document.body.appendChild(tipEl);
document.addEventListener("pointermove", e => {
  const t = e.target.closest?.("[data-tip]");
  if (!t) { tipEl.hidden = true; return; }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const w = tipEl.offsetWidth;
  tipEl.style.left = Math.min(innerWidth - w - 12, e.clientX + 14) + "px";
  tipEl.style.top = (e.clientY + 16) + "px";
});
document.addEventListener("click", e => {
  const q = e.target.closest?.("[data-chart-q]"); if (!q) return;
  RS.q = q.dataset.chartQ; RS.prio = "all"; RS.onlyWatch = false; RS.shown = 10;
  $("rq").value = RS.q; drawRadarList(); $("rq").scrollIntoView({ block: "center" });
});

