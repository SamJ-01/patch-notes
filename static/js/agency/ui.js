// PATCH//AGENCY shift UI: the alert queue, an alert's logs and actions, the department inbox, the
// handover and the debrief. Rules live in shift.js; this only renders the events it returns.
import * as A from "./shift.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const STATUS_WORDS = { pending: "waiting for a reply", asks: "they asked for a reason", done: "done", refused: "refused" };

export function mount(root, shift, { done = false, onComplete = () => {}, onAgain = null } = {}) {
  let state, selected = null, source = null;
  const all = A.findings(shift);
  const clockAt = m => { const [h, mi] = shift.startsAt.split(":").map(Number), t = h * 60 + mi + m; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

  root.innerHTML = `<div class="agency">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">PATCH//AGENCY · Pilot · ${esc(shift.agency)}</div>
      <h1>${esc(shift.title)}</h1><p>${esc(shift.summary)}</p></div>
    <section class="panel ag-brief"><div class="panel-title"><h2>Briefing</h2><span class="sim-tag">Simulation</span></div>
      <p><b>${esc(shift.lead)}:</b> “${esc(shift.briefing)}”</p>
      <p class="muted">${esc(shift.date)} · client: ${esc(shift.client)} · about ${shift.minutes} min${done ? " · ✓ you've completed this shift before" : ""}</p>
      <details class="tbl simplification"><summary>How this simulation differs from a real shift</summary><p>${esc(shift.simplification)}</p></details></section>
    <div class="ag-bar panel" role="group" aria-label="Shift clock">
      <span class="ag-clock"><span class="eyebrow">Shift time</span> <b class="mono" id="ag-clock"></b></span>
      <span class="muted" id="ag-count"></span>
      <button class="btn ghost" type="button" id="ag-wait">Wait ${shift.costs.wait} min</button>
    </div>
    <div class="ag-grid">
      <nav class="panel ag-queue" aria-labelledby="ag-q-h"><h2 id="ag-q-h">Alert queue</h2><ol id="ag-queue"></ol></nav>
      <section class="panel ag-alert" id="ag-alert"></section>
    </div>
    <section class="panel ag-inbox"><h2>Teams and replies</h2><ol class="transcript" id="ag-inbox" aria-live="polite"></ol></section>
    <section class="panel ag-hand" id="ag-hand" hidden></section>
    <section class="panel debrief" id="ag-debrief" hidden></section>
    <p class="sr-only" id="ag-say" aria-live="assertive"></p>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const say = text => { $("ag-say").textContent = ""; setTimeout(() => { $("ag-say").textContent = text; }, 30); };

  function run(r) {
    state = r.state;
    const notes = [];
    for (const ev of r.events) {
      if (ev.type === "arrive") { inbox(`<b>New alert:</b> ${esc(ev.title)}`); notes.push(`New alert: ${ev.title}`); }
      else if (ev.type === "search") showSearch(ev);
      else if (ev.type === "sent") inbox(`You asked <b>${esc(ev.dept)}</b>: ${esc(ev.label)}${ev.attached ? ` <span class="muted">(attached: ${esc(ev.attached)})</span>` : ""}. Expect a reply by ${clockAt(ev.due)}.`);
      else if (ev.type === "reply") {
        inbox(`<span class="mono">${clockAt(ev.at)}</span> <b>${esc(ev.dept)}</b> (${esc(STATUS_WORDS[ev.outcome])}): ${esc(ev.text)}`, ev.outcome);
        notes.push(`Reply from ${ev.dept}`);
      }
      else if (ev.type === "wait") inbox(`You waited ${ev.minutes} minutes.`);
      else if (ev.type === "closed") notes.push(`Closed: ${ev.title}.`);
      else if (ev.type === "complete") return finish(ev.report);
    }
    renderAll(r.events.some(e => ["arrive", "closed", "reopened"].includes(e.type)));
    if (notes.length) say(notes.join(" "));
  }
  function inbox(html, tone = "") {
    const li = document.createElement("li");
    li.innerHTML = html;
    if (tone === "refused" || tone === "asks") li.className = "warnline";
    $("ag-inbox").appendChild(li);
  }

  // ---------- queue and clock
  function renderAll(structural) {
    $("ag-clock").textContent = clockAt(state.clock);
    const open = state.arrived.filter(id => !(id in state.closed)).length;
    $("ag-count").textContent = `${plural(state.arrived.length, "alert")} in the queue, ${open} open`;
    $("ag-queue").innerHTML = state.arrived.map(id => {
      const a = A.alertById(shift, id), closed = id in state.closed;
      return `<li><button type="button" class="ag-qitem${closed ? " closed" : ""}" data-alert="${id}" ${id === selected ? 'aria-current="true"' : ""}>
        <span class="ag-qtitle">${closed ? "✓ " : ""}${esc(a.title)}</span>
        <span class="ag-qmeta"><span class="tag sev-${esc(a.severity)}">${esc(a.severity)}</span> ${a.time ? `raised ${esc(a.time)}` : "new this shift"} · ${closed ? "closed" : "open"}</span></button></li>`;
    }).join("");
    $("ag-queue").querySelectorAll("[data-alert]").forEach(b => b.addEventListener("click", () => select(b.dataset.alert, true)));
    if (selected) { renderFound(); renderAsk(); if (structural) renderClose(); }
    const hand = $("ag-hand");
    if (A.canHandOver(shift, state)) { if (hand.hidden) renderHandover(); }
    else hand.hidden = true;
  }

  // ---------- one alert: details, logs, findings, teams, close
  function select(id, focus) {
    selected = id;
    const a = A.alertById(shift, id);
    source = a.sources[0];
    $("ag-alert").innerHTML = `<div class="eyebrow">Alert · ${a.time ? `raised ${esc(a.time)}` : "raised this shift"} · detection severity: ${esc(a.severity)}</div>
      <h2 tabindex="-1" id="ag-a-h">${esc(a.title)}</h2><p class="ag-detect">${esc(a.detection)}</p>
      <div class="row" role="group" aria-label="Log sources for this alert">${a.sources.map(s => `<button type="button" class="chip" data-src="${s}" aria-pressed="${s === source}">${esc(shift.sources[s].name)}</button>`).join("")}</div>
      <div class="m-logview" id="ag-log"></div>
      <div id="ag-found"></div>
      <div class="ag-ask" id="ag-ask"></div>
      <div class="ag-close" id="ag-close"></div>`;
    $("ag-alert").querySelectorAll("[data-src]").forEach(b => b.addEventListener("click", () => {
      source = b.dataset.src;
      $("ag-alert").querySelectorAll("[data-src]").forEach(x => x.setAttribute("aria-pressed", x.dataset.src === source));
      renderLog(); $("ag-q").focus();
    }));
    renderLog(); renderFound(); renderAsk(); renderClose();
    renderAll(false);
    if (focus) $("ag-a-h").focus({ preventScroll: false });
  }
  const markTerms = (line, terms) => {
    let html = esc(line);
    for (const t of terms) html = html.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
    return html;
  };
  function renderLog() {
    const src = shift.sources[source];
    $("ag-log").innerHTML = `<div class="panel-title"><h3 class="mono">${esc(src.name)}</h3><span class="sim-tag">Simulated log</span></div>
      <p class="muted" style="margin:0">${esc(src.about)} Search it like grep: every word you type must appear in a line. Each search takes ${plural(shift.costs.search, "minute")}.</p>
      <form class="row log-search" id="ag-form" role="search"><label class="sr-only" for="ag-q">Search ${esc(src.name)}</label>
        <input type="search" id="ag-q" placeholder="A word, a user or an IP" autocomplete="off" spellcheck="false">
        <button class="btn brand" type="submit">Search</button><button class="btn ghost" type="button" id="ag-all">Show all</button></form>
      <p class="muted log-count" id="ag-lcount" aria-live="polite">Showing all ${src.lines.length} lines.</p>
      <pre class="evidence console log-out" id="ag-lout" tabindex="0" aria-labelledby="ag-lcount">${src.lines.map(l => esc(l)).join("\n")}</pre>`;
    $("ag-form").addEventListener("submit", e => { e.preventDefault(); run(A.search(shift, state, source, $("ag-q").value)); });
    $("ag-all").addEventListener("click", () => { $("ag-q").value = ""; run(A.search(shift, state, source, "")); });
  }
  function showSearch(ev) {
    if (ev.source !== source || !$("ag-lout")) return;
    const terms = ev.query ? ev.query.split(" ") : [];
    $("ag-lout").innerHTML = ev.lines.length ? ev.lines.map(l => markTerms(l, terms)).join("\n") : "No lines match. Check the spelling, or try fewer words.";
    $("ag-lcount").textContent = ev.query ? `${ev.lines.length} of ${ev.total} lines contain “${ev.query}”.${ev.found.length ? ` New finding${ev.found.length === 1 ? "" : "s"} recorded.` : ""}` : `Showing all ${ev.total} lines. Search to narrow it down.`;
  }
  function renderFound() {
    $("ag-found").innerHTML = state.found.length ? `<h3 class="eyebrow">Findings so far (all alerts)</h3><ul class="findings">${state.found.map(f => `<li>${esc(all[f])}</li>`).join("")}</ul>`
      : `<p class="muted">No findings yet. A focused search that turns up something important records it here.</p>`;
  }
  function renderAsk() {
    const reqs = A.requestsFor(shift, state, selected);
    const can = reqs.filter(r => r.canSend);
    $("ag-ask").innerHTML = `<h3 class="eyebrow">Ask another team</h3>
      ${reqs.some(r => r.status) ? `<ul class="findings">${reqs.filter(r => r.status).map(r => `<li>${esc(r.dept)}: ${esc(r.label)}: <b>${esc(STATUS_WORDS[r.status])}</b></li>`).join("")}</ul>` : ""}
      ${can.length ? `<form class="ag-askform" id="ag-askform">
        <label>Request <select id="ag-req">${can.map(r => `<option value="${esc(r.ref)}">${esc(r.dept)}: ${esc(r.label)}</option>`).join("")}</select></label>
        <label>Attach a finding as the reason (optional) <select id="ag-att"><option value="">Nothing attached</option>${state.found.map(f => `<option value="${esc(f)}">${esc(all[f])}</option>`).join("")}</select></label>
        <div class="row"><button class="btn" type="submit">Send request</button><span class="muted">Takes ${plural(shift.costs.request, "minute")}; replies come later.</span></div></form>` : `<p class="muted">Nothing else to ask from this alert.</p>`}`;
    $("ag-askform")?.addEventListener("submit", e => { e.preventDefault(); run(A.ask(shift, state, $("ag-req").value, $("ag-att").value)); });
  }
  function renderClose() {
    const a = A.alertById(shift, selected), c = state.closed[selected];
    const box = $("ag-close");
    if (c) {
      box.innerHTML = `<h3 class="eyebrow">Closed</h3><p>${esc(A.VERDICTS[c.verdict])} · severity ${esc(c.severity)} · ${plural(c.evidence.length, "evidence item")} ticked${c.related.length ? ` · linked to ${c.related.map(id => esc(A.alertById(shift, id).title)).join(", ")}` : ""}.</p>
        <div class="row"><button class="btn ghost" type="button" id="ag-reopen">Reopen</button></div>`;
      $("ag-reopen").addEventListener("click", () => run(A.reopen(shift, state, selected)));
      return;
    }
    const keep = [...box.querySelectorAll("input:checked")].map(i => i.name + "=" + i.value), sev = box.querySelector("select")?.value;
    const others = state.arrived.filter(id => id !== selected);
    box.innerHTML = `<h3 class="eyebrow">Close this alert</h3>
      <form id="ag-closeform" class="stack">
        <fieldset class="ev-set"><legend class="q">What is it?</legend>
          ${Object.entries(A.VERDICTS).map(([k, v]) => `<div class="ev-item"><label><input type="radio" name="verdict" value="${k}" required><span>${esc(v)}</span></label></div>`).join("")}</fieldset>
        <label>Your severity <select name="severity">${A.SEVERITIES.map(s => `<option value="${s}">${s}</option>`).join("")}</select></label>
        <fieldset class="ev-set"><legend class="q">Which evidence supports your verdict? Tick it, leave out what doesn't.</legend>
          ${a.evidence.map((e, i) => `<div class="ev-item"><label><input type="checkbox" name="evidence" value="${i}"><span>${esc(e.text)}</span></label></div>`).join("")}</fieldset>
        ${others.length ? `<fieldset class="ev-set"><legend class="q">Is it connected to another alert? (optional)</legend>
          ${others.map(id => `<div class="ev-item"><label><input type="checkbox" name="related" value="${id}"><span>${esc(A.alertById(shift, id).title)}</span></label></div>`).join("")}</fieldset>` : ""}
        <p class="muted">Nothing is marked until the handover, just as on a real shift. Closing takes ${plural(shift.costs.close, "minute")}.</p>
        <div class="row"><button class="btn brand" type="submit">Close alert</button></div><div id="ag-cfb" aria-live="polite"></div></form>`;
    for (const k of keep) { const [n, v] = k.split("="); const i = box.querySelector(`input[name="${n}"][value="${v}"]`); if (i) i.checked = true; }
    if (sev) box.querySelector("select").value = sev;
    $("ag-closeform").addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!f.get("verdict")) { $("ag-cfb").innerHTML = `<div class="feedback">Choose what the alert is first.</div>`; return; }
      const r = A.close(shift, state, selected, { verdict: f.get("verdict"), severity: f.get("severity"), evidence: f.getAll("evidence").map(Number), related: f.getAll("related") });
      run(r);
      const next = state.arrived.find(id => !(id in state.closed));
      if (next) select(next, true);
      else if (A.canHandOver(shift, state)) $("ag-hand-h").focus();
    });
  }

  // ---------- handover and debrief
  function renderHandover() {
    const hand = $("ag-hand");
    hand.hidden = false;
    hand.innerHTML = `<h2 tabindex="-1" id="ag-hand-h">Handover to the next shift</h2>
      <p class="muted">Every alert is closed. For each one, choose its status and the summary you'd hand over. Replies still on their way are passed on.</p>
      <form id="ag-handform" class="stack">
        ${shift.alerts.map(a => `<fieldset class="ev-set ag-hset"><legend class="q">${esc(a.title)}</legend>
          <label>Status <select name="status-${a.id}">${Object.entries(A.STATUSES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
          ${a.answer.summaries.map((s, i) => `<div class="ev-item"><label><input type="radio" name="summary-${a.id}" value="${i}" required><span>${esc(s)}</span></label></div>`).join("")}</fieldset>`).join("")}
        <label class="ag-note">Anything else for the next shift? (optional, shown next to a model handover in the debrief)<textarea name="note" rows="4" maxlength="2000"></textarea></label>
        <div class="row"><button class="btn brand" type="submit">Hand over and end the shift</button></div></form>`;
    $("ag-handform").addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(e.target);
      run(A.handover(shift, state, {
        status: Object.fromEntries(shift.alerts.map(a => [a.id, f.get("status-" + a.id)])),
        summary: Object.fromEntries(shift.alerts.map(a => [a.id, Number(f.get("summary-" + a.id))])),
        note: f.get("note") || "",
      }));
    });
  }
  function finish(rep) {
    renderAll(false);  // first, so the forms it redraws are disabled too
    root.querySelectorAll(".ag-bar button, .ag-alert input, .ag-alert button, .ag-alert select, .ag-hand input, .ag-hand select, .ag-hand textarea, .ag-hand button").forEach(el => { el.disabled = true; });
    $("ag-hand").hidden = true;
    const d = $("ag-debrief");
    const mins = Object.entries(rep.spent).map(([k, v]) => `${k} ${v} min`).join(", ");
    const ok = b => `<b class="${b ? "ok" : "no"}">${b ? "✓" : "✗"}</b>`;
    d.hidden = false;
    d.innerHTML = `<div class="eyebrow">Debrief</div><h2 tabindex="-1" id="ag-d-h">Shift over: ${rep.passed} of ${rep.checks.length} checks passed</h2>
      <ul class="ag-checks">${rep.checks.map(c => `<li>${ok(c.ok)} <b>${esc(c.label)}:</b> ${esc(c.text)}</li>`).join("")}</ul>
      <p class="muted">Shift time ${clockAt(0)} to ${clockAt(rep.clock)} (${rep.clock} min: ${esc(mins) || "no actions"}). Time is shown, never scored.</p>
      ${rep.costs.length ? `<h3 class="eyebrow">Went too far</h3><ul class="findings">${rep.costs.map(c => `<li><b>${esc(c.label)}.</b> ${esc(c.cost)}</li>`).join("")}</ul>` : ""}
      ${rep.links.missed.length || rep.links.wrong.length ? `<p class="feedback">${rep.links.missed.length ? "Two alerts were one incident: the VPN session from the spray is the one that made the change. Linking alerts is how a SOC sees the whole attack. " : ""}${rep.links.wrong.length ? "Some alerts you linked aren't connected." : ""}</p>` : ""}
      ${rep.alerts.map(a => `<details class="tbl ag-dalert"${a.verdict.ok && a.evidence.pass && a.containOk ? "" : " open"}><summary>${ok(a.verdict.ok && a.evidence.pass && a.containOk && a.status.ok && a.summary.ok)} ${esc(a.title)}</summary>
        <p>${ok(a.verdict.ok)} Verdict: ${esc(A.VERDICTS[a.verdict.chosen] || "none")}${a.verdict.ok ? "" : `. Answer: ${esc(A.VERDICTS[a.verdict.answer])}`}.</p>
        <p>${ok(a.severity.ok)} Severity: ${esc(a.severity.chosen)} (fits: ${esc(a.severity.accepted.join(" or "))}).</p>
        <div class="ev">${a.evidence.items.map(r => `<div class="ev-item ${r.ok ? "right" : "wrong"}"><p class="ev-why" style="margin-left:0"><b>${r.ok ? (r.supports ? (r.selected ? "Supports it." : "Supports it, but optional.") : "Right to leave out.") : (r.supports ? "Missed: this is key evidence." : "Not evidence for this.")}</b> ${esc(A.alertById(shift, a.id).evidence[r.index].text)}. ${esc(r.why)}</p></div>`).join("")}</div>
        ${a.contain.length ? `<p>${ok(a.containOk)} Containment: ${a.contain.map(c => `${esc(c.label)} (${c.status ? esc(STATUS_WORDS[c.status]) : "not asked"})`).join("; ")}.</p>` : ""}
        <p>${ok(a.status.ok)} Status: ${esc(A.STATUSES[a.status.chosen] || "none")}${a.status.ok ? "" : `. Better: ${esc(A.STATUSES[a.status.answer])}`}.</p>
        <p>${ok(a.summary.ok)} Model summary: ${esc(a.summary.model)}</p>
        <p class="muted">${esc(a.why)}</p></details>`).join("")}
      ${rep.pending.length ? `<p class="muted">Still on their way at handover: ${rep.pending.map(esc).join("; ")}.</p>` : ""}
      <h3 class="eyebrow">Handover notes</h3>
      <div class="ag-notes"><div><b>Yours</b><p>${rep.note ? esc(rep.note) : '<span class="muted">(none)</span>'}</p></div><div><b>A model handover</b><p>${esc(rep.modelNote)}</p></div></div>
      <div class="row"><button class="btn brand" type="button" id="ag-again">Work the shift again</button><a class="btn ghost" href="#mission-ssh-brute">Mission: The 3am logins</a></div>`;
    $("ag-again").addEventListener("click", () => (onAgain ? onAgain() : mount(root, shift, { done: true, onComplete })));
    $("ag-d-h").focus();
    onComplete(rep);
  }

  $("ag-wait").addEventListener("click", () => run(A.wait(shift, state)));
  const r0 = A.start(shift);
  state = r0.state;
  for (const ev of r0.events) inbox(`<b>In the queue:</b> ${esc(ev.title)}`);
  select(state.arrived[0], false);
  // The page uses inProgress to warn before leaving mid-shift (the shift is short; there is no mid-shift save).
  return { get state() { return state; }, get inProgress() { return !state.complete && state.clock > 0; } };
}
