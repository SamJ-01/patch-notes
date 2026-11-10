// The Port Corridor: every open port is an unlocked door into a machine. Open only the ones a host's job needs
// and lock the rest — ports-as-doors makes the common list stick. Two views of the same corridor: a first-person
// 3D "Walk" and a flat "Overview". gradeHost()/hostOrder() are pure (tested in tests/labs.test.mjs).

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ICON = {
  terminal: '<rect x="-10" y="-8" width="20" height="16" rx="2"/><path d="M-6 -2 L-3 1 L-6 4"/><path d="M-1 4 H5"/>',
  globe: '<circle r="9"/><path d="M-9 0 H9"/><path d="M0 -9 V9"/><path d="M-6.5 -6.5 Q0 0 6.5 6.5"/><path d="M6.5 -6.5 Q0 0 -6.5 6.5"/>',
  www: '<rect x="-10" y="-8" width="20" height="16" rx="2"/><path d="M-10 -3 H10"/><circle cx="-6.5" cy="-5.5" r="1"/><circle cx="-3.5" cy="-5.5" r="1"/>',
  mail: '<rect x="-10" y="-7" width="20" height="14" rx="2"/><path d="M-10 -6 L0 2 L10 -6"/>',
  lock: '<rect x="-7" y="-1" width="14" height="11" rx="2"/><path d="M-4 -1 V-4 a4 4 0 0 1 8 0 V-1"/><circle cx="0" cy="4" r="1.4"/>',
  folder: '<path d="M-10 -6 H-2 L0 -3 H10 V7 H-10 Z"/>',
  screen: '<rect x="-10" y="-8" width="20" height="13" rx="2"/><path d="M-4 9 H4"/><path d="M0 5 V9"/>',
  block: '<circle r="9"/><path d="M-6.4 -6.4 L6.4 6.4"/>',
};
const icon = (k, cls = "pc-ic") => `<svg class="${cls}" viewBox="-14 -14 28 28" aria-hidden="true"><g class="pc-gl">${ICON[k] || ICON.block}</g></svg>`;

// Pure: judge the learner's open/closed choices for one host against the ports its job needs.
export function gradeHost(host, doors, state) {
  const open = new Set(state);
  const need = new Set(host.open);
  const results = doors.map(d => {
    const shouldOpen = need.has(d.port), isOpen = open.has(d.port);
    const verdict = shouldOpen === isOpen ? "ok" : shouldOpen ? "should-open" : "should-close";
    return { port: d.port, name: d.name, verdict, shouldOpen, note: d.note };
  });
  const right = results.filter(r => r.verdict === "ok").length;
  return { results, right, total: doors.length, pass: right === doors.length,
    wrongOpen: results.filter(r => r.verdict === "should-close"), wrongShut: results.filter(r => r.verdict === "should-open") };
}

// Pure: the order hosts are worked in (as authored); exported so the test can walk every host to a pass.
export const hostOrder = lab => lab.hosts.map(h => h.id);

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const doors = lab.doors, hosts = lab.hosts;
  const done = new Set(solved);
  let hi = Math.max(0, hosts.findIndex(h => !done.has(h.id))); if (hi < 0) hi = 0;
  let open = new Set();   // ports currently open (default-deny: start locked)
  let cur = 0;            // the door you stand at (Walk view)
  let checked = null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const readMode = () => { try { const v = localStorage.getItem("pn-corridor-view"); if (v === "walk" || v === "grid") return v; } catch (e) {} return reduced ? "grid" : "walk"; };
  let mode = readMode();

  root.innerHTML = `<div class="corridor-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="co-parts"></div>
    <section class="panel co-brief" id="co-brief" aria-live="polite"></section>
    <div class="row co-viewrow"><span class="eyebrow co-viewlabel">View</span>
      <div class="cv-seg" id="co-view" role="group" aria-label="How to view the corridor">
        <button class="cv-btn" type="button" data-m="walk" aria-pressed="${mode === "walk"}">Walk</button>
        <button class="cv-btn" type="button" data-m="grid" aria-pressed="${mode === "grid"}">Overview</button></div></div>
    <div id="co-play"></div>
    <div class="co-actions">
      <button class="btn brand" type="button" id="co-check">Check the host</button>
      <button class="btn ghost" type="button" id="co-reset-host">Lock all doors</button>
      <button class="btn ghost" type="button" id="co-reset">↺ Reset lab</button>
    </div>
    <section class="panel co-result" id="co-result" hidden></section>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const host = () => hosts[hi];

  // ---------- shared ----------
  function renderParts() { $("co-parts").innerHTML = hosts.map(h => `<span class="pchip">${done.has(h.id) ? "✓" : "○"} ${esc(h.name)}</span>`).join(""); }
  function renderBrief() {
    const how = mode === "walk" ? "Walk the corridor with ← and →." : "Tap a door to open or lock it.";
    $("co-brief").innerHTML = `<div class="eyebrow">Host ${hi + 1} of ${hosts.length}</div><h2>${esc(host().name)}</h2>
      <p>${esc(host().brief)}</p><p class="muted co-hint">${how} Open only the doors this host needs for its job and lock the rest — every open port is a way in.</p>`;
  }
  function refresh() { if (mode === "walk") { updateHall(); renderFocus(); } else updateGrid(); }
  function toggleDoor(port) {
    const wasToggle = document.activeElement && document.activeElement.id === "cf-toggle";
    open.has(port) ? open.delete(port) : open.add(port);
    if (checked) { checked = null; $("co-result").hidden = true; }
    refresh();
    if (wasToggle) { const t = $("cf-toggle"); if (t) t.focus(); }
  }

  // ---------- Walk (first-person 3D) ----------
  function walkHtml() {
    return `<section class="co-stage" id="co-stage" tabindex="0" role="application" aria-label="Walk the corridor: left and right arrows move, space opens or locks the door in front of you">
      <div class="hall3d"><div class="hall-track" id="co-track" aria-hidden="true"></div><div class="hall-fog" aria-hidden="true"></div><div class="hall-hud" aria-hidden="true"><span id="co-where"></span></div></div>
    </section>
    <section class="panel co-focus" id="co-focus"></section>`;
  }
  function buildHall() {
    const track = $("co-track");
    doors.forEach((d, i) => {
      const el = document.createElement("div");
      el.className = "d3-door"; el.dataset.i = i; el.style.cssText = `--i:${i};--side:${i % 2 ? 1 : -1}`;
      el.innerHTML = `<div class="d3-face"><span class="d3-tex" aria-hidden="true"></span><span class="d3-plate">${d.port}</span>${icon(d.icon, "d3-ic")}<span class="d3-name">${esc(d.name)}</span><span class="d3-tag">${esc(d.transport)}</span><span class="d3-state"></span></div>`;
      el.addEventListener("click", () => { i === cur ? toggleDoor(doors[cur].port) : go(i); });
      track.appendChild(el);
    });
  }
  function updateHall() {
    const track = $("co-track"); if (!track) return;
    track.style.setProperty("--cur", String(cur));
    track.querySelectorAll(".d3-door").forEach(el => {
      const i = +el.dataset.i, d = doors[i], isOpen = open.has(d.port);
      el.classList.toggle("is-current", i === cur); el.classList.toggle("open", isOpen); el.classList.toggle("behind", i < cur);
      el.querySelector(".d3-state").textContent = isOpen ? "OPEN" : "LOCKED";
      el.classList.remove("v-bad");
      if (checked) { const r = checked.results.find(x => x.port === d.port); if (r && r.verdict !== "ok") el.classList.add("v-bad"); }
    });
    const w = $("co-where"); if (w) w.textContent = `Door ${cur + 1} / ${doors.length}`;
  }
  function renderFocus() {
    const d = doors[cur], isOpen = open.has(d.port), box = $("co-focus"); if (!box) return;
    box.innerHTML = `
      <div class="cf-head"><div class="cf-door ${isOpen ? "open" : "shut"}"><span class="cf-tex" aria-hidden="true"></span><span class="cf-plate">${d.port}</span>${icon(d.icon, "cf-ic")}</div>
        <div class="cf-meta"><div class="eyebrow">${isOpen ? "Open door" : "Locked door"} · ${esc(d.transport)}</div><h2>${esc(d.name)}</h2><p>${esc(d.note)}</p></div></div>
      <div class="cf-controls">
        <button class="btn ghost" type="button" id="cf-prev" ${cur === 0 ? "disabled" : ""}>‹ Back</button>
        <button class="btn ${isOpen ? "sun" : "brand"}" type="button" id="cf-toggle" aria-pressed="${isOpen}">${isOpen ? "Lock this door" : "Open this door"}</button>
        <button class="btn ghost" type="button" id="cf-next" ${cur === doors.length - 1 ? "disabled" : ""}>Next ›</button>
      </div>
      <div class="co-minimap" role="group" aria-label="Jump to a door">${doors.map((x, i) =>
        `<button type="button" class="mm-dot ${i === cur ? "here" : ""} ${open.has(x.port) ? "on" : ""}" data-i="${i}" aria-label="Port ${x.port} ${esc(x.name)}, ${open.has(x.port) ? "open" : "locked"}" aria-current="${i === cur}">${x.port}</button>`).join("")}</div>`;
    $("cf-prev").onclick = () => go(cur - 1);
    $("cf-next").onclick = () => go(cur + 1);
    $("cf-toggle").onclick = () => toggleDoor(doors[cur].port);
    box.querySelectorAll(".mm-dot").forEach(b => b.onclick = () => go(+b.dataset.i));
  }
  function go(i) { cur = Math.max(0, Math.min(doors.length - 1, i)); updateHall(); renderFocus(); }

  // ---------- Overview (flat grid) ----------
  function gridHtml() {
    return `<section class="co-scene"><div class="co-hall" id="co-hall" role="group" aria-label="Port doors: open the ones this host needs"></div><div class="co-floor" aria-hidden="true"></div></section>`;
  }
  function gridDoor(d) {
    const isOpen = open.has(d.port);
    const label = `Port ${d.port}, ${d.name}. ${d.note} Currently ${isOpen ? "open" : "locked"}. Activate to ${isOpen ? "lock" : "open"}.`;
    return `<button type="button" class="pc-door ${isOpen ? "open" : "shut"}" data-port="${d.port}" role="switch" aria-checked="${isOpen}" aria-label="${esc(label)}">
      <span class="pc-tex" aria-hidden="true"></span><span class="pc-plate">${d.port}</span>${icon(d.icon)}<span class="pc-name">${esc(d.name)}</span><span class="pc-tr">${esc(d.transport)}</span><span class="pc-state" aria-hidden="true">${isOpen ? "OPEN" : "LOCKED"}</span></button>`;
  }
  function buildGrid() {
    const hall = $("co-hall"); hall.innerHTML = doors.map(gridDoor).join("");
    hall.querySelectorAll(".pc-door").forEach(b => b.addEventListener("click", () => toggleDoor(+b.dataset.port)));
  }
  function updateGrid() {
    const hall = $("co-hall"); if (!hall) return;
    hall.querySelectorAll(".pc-door").forEach(b => {
      const port = +b.dataset.port, isOpen = open.has(port);
      b.classList.toggle("open", isOpen); b.classList.toggle("shut", !isOpen); b.setAttribute("aria-checked", isOpen);
      b.querySelector(".pc-state").textContent = isOpen ? "OPEN" : "LOCKED";
      b.classList.remove("v-bad");
      if (checked) { const r = checked.results.find(x => x.port === port); if (r && r.verdict !== "ok") b.classList.add("v-bad"); }
    });
  }

  // ---------- view switch ----------
  function renderPlay() {
    $("co-play").innerHTML = mode === "walk" ? walkHtml() : gridHtml();
    if (mode === "walk") {
      buildHall(); updateHall(); renderFocus();
      $("co-stage").addEventListener("keydown", e => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(cur + 1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(cur - 1); }
        else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleDoor(doors[cur].port); }
      });
    } else { buildGrid(); updateGrid(); }
  }
  function setMode(m) {
    if (m === mode) return; mode = m; cur = 0;
    try { localStorage.setItem("pn-corridor-view", m); } catch (e) {}
    $("co-view").querySelectorAll(".cv-btn").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === m));
    renderBrief(); renderPlay();
  }
  $("co-view").querySelectorAll(".cv-btn").forEach(b => b.onclick = () => setMode(b.dataset.m));

  // ---------- check / reset / next host ----------
  function check() {
    checked = gradeHost(host(), doors, open);
    const r = checked, box = $("co-result");
    const line = r.pass ? `<p class="co-pass"><b>Locked down.</b> ${esc(host().note)}</p>`
      : `<p class="co-fail"><b>${r.right} of ${r.total} doors right.</b> ${r.wrongOpen.length ? `${r.wrongOpen.length} should be locked; ` : ""}${r.wrongShut.length ? `${r.wrongShut.length} should be open.` : ""}</p>`;
    box.innerHTML = `<div class="panel-title"><h2>How you did</h2></div>${line}
      <ul class="co-grades">${r.results.filter(x => x.verdict !== "ok").map(x =>
        `<li class="${x.verdict}"><b>Port ${x.port} ${esc(x.name)}</b> — ${x.verdict === "should-close" ? "lock this: " : "open this: "}${esc(x.note)}</li>`).join("")
        || '<li class="ok">Every door is right.</li>'}</ul>`;
    box.hidden = false; refresh();
    if (r.pass && !done.has(host().id)) {
      done.add(host().id); onPart(host().id); renderParts();
      if (done.size >= hosts.length) { onComplete(); box.innerHTML += `<p class="co-done">Every host hardened. Nice work.</p>`; }
      else box.innerHTML += `<button class="btn brand" type="button" id="co-next" style="margin-top:10px">Next host →</button>`;
      const nx = $("co-next"); if (nx) nx.onclick = nextHost;
    }
    // Patch reacts in character: a nod when every host is hardened, or a warning when a risky door is left open.
    const patch = globalThis.PN_patch;
    if (patch) {
      if (r.pass && done.size >= hosts.length) patch("Every host hardened. You read those doors like a pro.", 6500);
      else if (!r.pass && r.wrongOpen.length) { const w = r.wrongOpen[0]; patch(`Door ${w.port} (${w.name}) still open? That's a way in. Lock it.`, 6500); }
    }
    box.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }
  function nextHost() {
    hi = hosts.findIndex(h => !done.has(h.id)); if (hi < 0) hi = 0;
    open = new Set(); cur = 0; checked = null; $("co-result").hidden = true;
    renderBrief(); renderPlay();
  }
  $("co-check").onclick = check;
  $("co-reset-host").onclick = () => { open = new Set(); checked = null; $("co-result").hidden = true; refresh(); };
  $("co-reset").onclick = () => { done.clear(); hi = 0; open = new Set(); cur = 0; checked = null; $("co-result").hidden = true; onReset(); renderParts(); renderBrief(); renderPlay(); };

  renderParts(); renderBrief(); renderPlay();
}
