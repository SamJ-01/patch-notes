// PATCH//AGENCY shift UI: the alert queue, an alert's logs and actions, the department inbox, the
// handover and the debrief. Rules live in shift.js; this only renders the events it returns.
import * as A from "./shift.js";
import { markText } from "../missions/engine.js";
import { DESK } from "../desk.js";
import { MAIL } from "../mail.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Glossary underlining from the main page (gloss() in src/app/02-glossary.js), or plain escaped text without it.
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));
const plural = (n, w, many = w + "s") => `${n} ${n === 1 ? w : many}`;
const STATUS_WORDS = { pending: "waiting for a reply", asks: "they asked for a reason", done: "done", refused: "refused" };
// Ticket numbers: alerts carry their own (ref in the shift file); requests are numbered in the order you raise them.
const reqNo = (state, ref) => { const i = state.requests.map(r => r.ref).lastIndexOf(ref); return i < 0 ? "" : `REQ-${5301 + i}`; };

export function mount(root, shift, { done = false, onComplete = () => {}, onAgain = null, feedback = "", shadow = false } = {}) {
  let state, selected = null, source = null;
  const all = A.findings(shift);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clockAt = m => { const [h, mi] = shift.startsAt.split(":").map(Number), t = h * 60 + mi + m; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

  const leadName = shift.lead.split(",")[0], leadRole = (shift.lead.split(",")[1] || "").trim();
  // Who answers for a team: its named contact, or the team itself.
  const contact = ref => { const d = shift.departments[String(ref).split(":")[0]] || {}; return { from: d.contact?.name || d.name, role: d.contact?.role || d.name, photo: d.contact?.photo || "" }; };
  const tref = a => a.ref || `SOC-${a.id}`;
  const day = shift.date.replace(/^(\w{3})\w*\s+(\d+)\s+(\w{3}).*$/, "$1 $2 $3").toUpperCase();
  const waiting = shift.alerts.filter(a => (a.arrives?.at ?? 0) === 0).length;
  // The briefing arrives as chat messages, a sentence or two each.
  const briefing = shift.briefing.match(/[^.!?]+[.!?]+(\s|$)/g).map(x => x.trim()).reduce((out, sen) => { const last = out.at(-1); if (last && last.length + sen.length < 140) out[out.length - 1] = `${last} ${sen}`; else out.push(sen); return out; }, []);

  root.innerHTML = `<div class="agency">
    <section class="ag-in" id="ag-in" aria-labelledby="ag-in-h">
      <div class="ag-in-head"><a class="link-btn" href="#agency">← The Agency</a><div class="eyebrow">PATCH//AGENCY · ${esc(shift.agency)}</div>
        <h1 id="ag-in-h">${esc(shift.title)}</h1></div>
      <div class="ag-in-grid">
        <div class="ag-tc" id="ag-tc">
          <div class="ag-tc-screen" aria-hidden="true"><span>${esc(day)}</span><b>${esc(shift.startsAt)}</b><span id="ag-tc-msg">TAP YOUR BADGE</span></div>
          <button type="button" class="ag-tc-badge" id="ag-tap"><span class="ag-tc-card" aria-hidden="true"><span class="ag-tc-logo">LANTERNFIELD</span><span class="ag-tc-chip"></span></span><span class="ag-tc-text">Tap your badge to clock in</span></button>
          <p class="ag-stamp" id="ag-stamp" hidden></p>
        </div>
        <div class="ag-in-side">
          <ol class="dk-msgs ag-chat" id="ag-chat" aria-live="polite" aria-label="Messages from ${esc(leadName)}"></ol>
          <div class="ag-dossier" id="ag-dossier" hidden>${DESK.scene(shift.clientImage)}<div class="eyebrow">Client file</div><h2>${esc(shift.client)}</h2>
            <dl class="fields"><div><dt>Alerts waiting</dt><dd>${waiting}, with more likely</dd></div><div><dt>Logs you can search</dt><dd>${Object.keys(shift.sources).length}</dd></div><div><dt>Shift length</dt><dd>about ${shift.minutes} min</dd></div>${done ? `<div><dt>Your record</dt><dd>✓ worked before</dd></div>` : ""}</dl>
            <fieldset class="ag-level"><legend>How do you want to work?</legend>
              <label class="ag-lv"><input type="radio" name="ag-level" value="shadow"><span><b>Shadow</b> Watch ${esc(leadName)} work this shift, step by step and explained, then take your turn.</span></label>
              <label class="ag-lv"><input type="radio" name="ag-level" value="guided"${done ? "" : " checked"}><span><b>Guided</b> ${esc(leadName)} gives hints, suggests searches and checks each alert as you close it.</span></label>
              <label class="ag-lv"><input type="radio" name="ag-level" value="standard"${done ? " checked" : ""}><span><b>On your own</b> No hints. Everything is marked at the handover, as on a real shift.</span></label></fieldset>
            <button class="btn brand" type="button" id="ag-desk-go">Take the desk</button></div>
        </div>
      </div>
      <details class="tbl simplification"><summary>How this simulation differs from a real shift</summary><p>${esc(shift.simplification)}</p></details>
    </section>
    <div class="ag-desk" id="ag-desk" hidden>
      <div class="ag-bar" role="group" aria-label="Shift clock">
        <span class="ag-logo" aria-hidden="true">PATCH<b>//</b>AGENCY</span>
        <span class="ag-clock"><span class="eyebrow">Shift time</span> <b class="mono" id="ag-clock"></b></span>
        <span class="ag-count" id="ag-count"></span>
        <span class="ag-lead">${DESK.avatar(leadName, shift.leadPhoto, "dk-av ag-lead-av")}${esc(shift.lead)}</span>
        <button class="btn ghost" type="button" id="ag-wait">Wait ${shift.costs.wait} min</button>
        <div class="ag-tabs" role="group" aria-label="Show part of the desk">
          <button type="button" class="ag-tab" data-tab="queue" aria-pressed="true">Queue</button>
          <button type="button" class="ag-tab" data-tab="alert" aria-pressed="false">Alert</button>
          <button type="button" class="ag-tab" data-tab="chat" aria-pressed="false">Chat <span class="ag-unread" id="ag-unread" hidden></span></button>
        </div>
      </div>
      <div class="ag-grid" id="ag-grid" data-tab="queue">
        <nav class="panel ag-queue" aria-labelledby="ag-q-h"><h2 id="ag-q-h">Alert queue</h2><ol id="ag-queue"></ol></nav>
        <section class="panel ag-alert" id="ag-alert"></section>
        <section class="panel ag-comms" aria-labelledby="ag-c-h" tabindex="0"><h2 id="ag-c-h">Team chat</h2>${DESK.channel(`${shift.client.split(/\s+/)[0].toLowerCase()}-soc`, "you, your lead and the teams you ask", 'id="ag-inbox" aria-live="polite"')}</section>
      </div>
      <section class="panel ag-hand" id="ag-hand" hidden></section>
      <section class="panel debrief ag-report" id="ag-debrief" hidden></section>
    </div>
    <section class="panel ag-shadow" id="ag-shadow" aria-labelledby="ag-sh-h" hidden></section>
    <p class="sr-only" id="ag-say" aria-live="assertive"></p>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const say = text => { $("ag-say").textContent = ""; setTimeout(() => { $("ag-say").textContent = text; }, 30); };

  function run(r) {
    state = r.state;
    const notes = [];
    for (const ev of r.events) {
      if (ev.type === "arrive") { const a = A.alertById(shift, ev.id); inbox({ sys: true, ref: a ? tref(a) : "", html: `New alert: <b>${esc(ev.title)}</b>` }); notes.push(`New alert: ${ev.title}`); }
      else if (ev.type === "search") showSearch(ev);
      else if (ev.type === "email" && ev.found.length) notes.push(`New finding${ev.found.length === 1 ? "" : "s"} recorded.`);
      else if (ev.type === "sent") inbox({ me: true, ref: reqNo(state, ev.ref), status: "pending", html: `<p>@${esc(contact(ev.ref).from)}, raised for <b>${esc(ev.dept)}</b>: ${esc(ev.label)}.</p>${ev.attached ? `<p class="dk-attach"><span aria-hidden="true">📎</span> ${esc(ev.attached)}</p>` : ""}<p class="dk-note">Reply expected by ${clockAt(ev.due)}.</p>` });
      else if (ev.type === "reply") {
        inbox({ ...contact(ev.ref), ref: reqNo(state, ev.ref), status: ev.outcome, at: ev.at, html: `<p>${gl(ev.text, 2)}</p>` });
        notes.push(`Reply from ${ev.dept}`);
      }
      else if (ev.type === "wait") inbox({ sys: true, from: "Shift clock", html: `You waited ${ev.minutes} minutes.` });
      else if (ev.type === "closed") notes.push(`Closed: ${ev.title}.`);
      else if (ev.type === "hint") notes.push(`Hint ${ev.n} of ${ev.of}: ${ev.text}`);
      else if (ev.type === "complete") return finish(ev.report);
    }
    renderAll(r.events.some(e => ["arrive", "closed", "reopened"].includes(e.type)));
    if (notes.length) say(notes.join(" "));
  }
  // One message in the team chat: who, which team, when, the ticket it's about. Newest at the bottom, like a chat.
  function inbox(m) {
    const t = document.createElement("template");
    t.innerHTML = DESK.message({ ...m, at: clockAt(m.at ?? (state ? state.clock : 0)) });
    const li = t.content.firstElementChild;
    $("ag-inbox").appendChild(li);
    // Scroll the chat panel, never the page: on a phone the chat is far below what you're working on.
    const box = $("ag-inbox").closest(".ag-comms");
    if (box) box.scrollTop = box.scrollHeight;
    // On a phone the chat is its own tab: count what arrives while you're elsewhere.
    if (narrow() && tab !== "chat" && !m.me) { unread++; showUnread(); }
  }
  // ---------- phones and tablets: one part of the desk at a time (Queue, Alert, Chat), chosen in the sticky bar
  let tab = "queue", unread = 0;  // the desk opens on the queue: first, see what's waiting
  const narrow = () => typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches;
  const showUnread = () => { const u = $("ag-unread"); u.hidden = !unread; u.textContent = unread; u.setAttribute("aria-label", `${unread} new`); };
  function showTab(t, { scroll = true } = {}) {
    tab = t;
    $("ag-grid").dataset.tab = t;
    root.querySelectorAll(".ag-tab").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === t));
    if (t === "chat") { unread = 0; showUnread(); }
    if (scroll && narrow()) {
      const top = $("ag-desk").getBoundingClientRect().top + scrollY - 8;
      if (scrollY > top) scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    }
  }

  // ---------- queue and clock
  function renderAll(structural) {
    $("ag-clock").textContent = clockAt(state.clock);
    // The "what next" line: what's left, what's on its way, and when it's time to hand over.
    const pr = A.progress(shift, state);
    $("ag-count").innerHTML = pr.handover ? `<b>All closed:</b> <a href="#ag-hand" data-hand>hand over ↓</a>`
      : `<b>${pr.open} of ${plural(pr.arrived, "alert")} open</b>${pr.due ? ` · ${plural(pr.due, "reply", "replies")} on the way` : ""}${pr.arrived < pr.total ? " · more may come in" : ""}`;
    $("ag-count").querySelector("[data-hand]")?.addEventListener("click", e => { e.preventDefault(); $("ag-hand-h")?.focus({ preventScroll: true }); $("ag-hand").scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); });
    $("ag-queue").innerHTML = state.arrived.map(id => {
      const a = A.alertById(shift, id), closed = id in state.closed;
      return `<li><button type="button" class="ag-qitem p-${esc(a.severity)}${closed ? " closed" : ""}" data-alert="${id}" ${id === selected ? 'aria-current="true"' : ""}>
        <span class="ag-qref"><span class="dk-ref">${esc(tref(a))}</span>${DESK.pill(closed ? "closed" : "open")}</span>
        <span class="ag-qtitle">${esc(a.title)}</span>
        <span class="ag-qmeta"><span class="tag sev-${esc(a.severity)}">${esc(a.severity)}</span> ${a.time ? `raised ${esc(a.time)}` : "new this shift"}</span></button></li>`;
    }).join("");
    $("ag-queue").querySelectorAll("[data-alert]").forEach(b => b.addEventListener("click", () => { select(b.dataset.alert, true); showTab("alert"); }));
    if (selected) {
      renderGuide();
      const pill = $("ag-tk-st"), now = DESK.pill(selected in state.closed ? "closed" : "open", "ag-tk-st");
      if (pill && pill.outerHTML !== now) pill.outerHTML = now;
      renderFound(); renderAsk(); if (structural) renderClose();
    }
    const hand = $("ag-hand");
    if (A.canHandOver(shift, state)) { if (hand.hidden) renderHandover(); }
    else hand.hidden = true;
  }

  // ---------- one alert: details, logs, findings, teams, close
  function select(id, focus) {
    selected = id;
    const a = A.alertById(shift, id);
    source = a.sources[0];
    $("ag-alert").innerHTML = `${DESK.ticket({
        kind: "Alert", ref: tref(a), title: a.title, priority: a.severity, status: id in state.closed ? "closed" : "open",
        fields: [["Client", shift.client], ["Raised", a.time ? `${a.time}, by the night shift's SIEM` : "This shift"], ["Assigned to", "You"], ["Logs", plural(a.sources.length, "source")]],
        bodyLabel: "What the detection rule saw", body: `<p>${gl(a.detection, 2)}</p>`,
      }, { headingId: "ag-a-h", statusId: "ag-tk-st" })}
      <div id="ag-guide"></div>
      <h3 class="eyebrow ag-work">Investigate</h3>
      <div class="row" role="group" aria-label="Log sources for this alert">${a.sources.map(s => `<button type="button" class="chip" data-src="${s}" aria-pressed="${s === source}">${esc(shift.sources[s].name)}</button>`).join("")}</div>
      <div class="m-logview" id="ag-log"></div>
      <div id="ag-found"></div>
      <div class="ag-ask" id="ag-ask"></div>
      <div class="ag-close" id="ag-close"></div>`;
    $("ag-alert").querySelectorAll("[data-src]").forEach(b => b.addEventListener("click", () => {
      source = b.dataset.src;
      $("ag-alert").querySelectorAll("[data-src]").forEach(x => x.setAttribute("aria-pressed", x.dataset.src === source));
      renderLog(); ($("ag-q") || $("ag-log").querySelector("[data-mail]"))?.focus({ preventScroll: true });
    }));
    renderGuide(); renderLog(); renderFound(); renderAsk(); renderClose();
    renderAll(false);
    if (focus) $("ag-a-h").focus({ preventScroll: false });
  }
  const markTerms = markText;
  // ---------- guided: the lead's hints, one at a time, and searches worth trying
  const guided = () => state?.level === "guided";
  const lastHint = id => { const n = A.alertById(shift, id)?.guide?.hints?.length || 0; return n > 0 && A.hintsUsed(state, id) >= n; };
  function renderGuide() {
    const box = $("ag-guide"), a = A.alertById(shift, selected), g = a.guide || {};
    if (!box) return;
    if (!guided() || !g.hints?.length) { box.innerHTML = ""; return; }
    const used = A.hintsUsed(state, selected), hints = g.hints.slice(0, used);
    box.innerHTML = `<section class="ag-guide" aria-labelledby="ag-g-h"><h3 class="eyebrow" id="ag-g-h" tabindex="-1">Guided: ${esc(leadName)}'s tips</h3>
      ${hints.length ? `<ol class="dk-msgs">${hints.map((h, i) => DESK.message({ from: leadName, role: `hint ${i + 1} of ${g.hints.length}`, photo: shift.leadPhoto, html: `<p>${gl(h, 2)}</p>` })).join("")}</ol>` : ""}
      <div class="row">${used < g.hints.length ? `<button class="btn" type="button" id="ag-hint">${used ? "Another hint" : "Give me a hint"} (${used + 1} of ${g.hints.length})</button>` : `<span class="muted">That's every hint for this alert.</span>`}</div>
      ${g.searches?.length ? `<p class="ag-tries"><span class="muted">Searches worth trying:</span> ${g.searches.map(([src, q], i) => `<button type="button" class="chip mono" data-try="${i}">${esc(q)} <span class="muted">in ${esc(shift.sources[src].name)}</span></button>`).join(" ")}</p>` : ""}</section>`;
    $("ag-hint")?.addEventListener("click", () => { run(A.hint(shift, state, selected)); ($("ag-hint") || $("ag-g-h")).focus({ preventScroll: true }); });
    box.querySelectorAll("[data-try]").forEach(b => b.addEventListener("click", () => {
      const [src, q] = g.searches[Number(b.dataset.try)];
      source = src;
      $("ag-alert").querySelectorAll("[data-src]").forEach(x => x.setAttribute("aria-pressed", x.dataset.src === source));
      renderLog(); $("ag-q").value = q;
      run(A.search(shift, state, source, q));
      $("ag-lout").scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }));
  }
  function renderLog() {
    const src = shift.sources[source];
    if (src.kind === "email") return renderMailbox(src);
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
  // A mailbox source: a list of emails; opening one shows it in the site's email view (Message, Details, Original).
  function renderMailbox(src) {
    const opened = state.opened || [];
    $("ag-log").innerHTML = `<div class="panel-title"><h3>${esc(src.name)}</h3><span class="sim-tag">Simulated mailbox</span></div>
      <p class="muted" style="margin:0">${esc(src.about)} Opening an email takes ${plural(shift.costs.search, "minute")} the first time. Check <b>Details</b> for who really sent it.</p>
      <ul class="ag-mails">${src.emails.map(e => { const h = MAIL.parseHeaders(e.headers); return `<li><button type="button" class="ag-mail${opened.includes(e.id) ? " read" : ""}" data-mail="${esc(e.id)}" aria-pressed="false">
        <b>${esc(h.from.name || h.from.address)}</b><span>${esc(h.subject)}</span><span class="muted mono">${esc(e.time || "")}</span></button></li>`; }).join("")}</ul>
      <div id="ag-mailview"></div>`;
    MAIL.wire($("ag-mailview"));
    $("ag-log").querySelectorAll("[data-mail]").forEach(b => b.addEventListener("click", () => {
      run(A.openEmail(shift, state, source, b.dataset.mail));
      showMail(src, b.dataset.mail);
    }));
  }
  function showMail(src, id) {
    const e = src.emails.find(x => x.id === id);
    $("ag-log").querySelectorAll("[data-mail]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.mail === id); if (b.dataset.mail === id) b.classList.add("read"); });
    $("ag-mailview").innerHTML = MAIL.card({ headers: e.headers, body: e.body, links: e.links, attachments: e.attachments, folder: e.folder }, { id: `ag-em-${id}`, org: src.org });
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
  const suggested = ref => (A.alertById(shift, selected).answer.contain || []).includes(ref);
  function renderAsk() {
    const reqs = A.requestsFor(shift, state, selected);
    const can = reqs.filter(r => r.canSend);
    // Each request you've raised is a small ticket of its own, with where it has got to.
    const steps = st => [{ label: "Raised", state: "done" }, { label: "With the team", state: st === "pending" ? "now" : "done" },
      { label: st === "pending" ? "Reply" : STATUS_WORDS[st].replace(/^\w/, c => c.toUpperCase()), state: st === "pending" ? "todo" : "now" }];
    $("ag-ask").innerHTML = `<h3 class="eyebrow">Ask another team</h3>
      ${reqs.some(r => r.status) ? `<ul class="dk-list">${reqs.filter(r => r.status).map(r => `<li>${DESK.ticket({ kind: "Request", ref: reqNo(state, r.ref), title: r.label, status: r.status, fields: [["Team", contact(r.ref).role], ["Contact", contact(r.ref).from]], steps: steps(r.status) }, { level: 4, compact: true })}</li>`).join("")}</ul>` : ""}
      ${can.length ? `<form class="ag-askform" id="ag-askform">
        <label>Request <select id="ag-req">${can.map(r => `<option value="${esc(r.ref)}">${esc(r.dept)}: ${esc(r.label)}${guided() && lastHint(selected) && suggested(r.ref) ? ` (${esc(leadName)} suggests)` : ""}</option>`).join("")}</select></label>
        <label>Attach a finding as the reason (optional) <select id="ag-att"><option value="">Nothing attached</option>${state.found.map(f => `<option value="${esc(f)}">${esc(all[f])}</option>`).join("")}</select></label>
        <div class="row"><button class="btn" type="submit">Send request</button><span class="muted">Takes ${plural(shift.costs.request, "minute")}; replies come later.</span></div></form>` : `<p class="muted">Nothing else to ask from this alert.</p>`}`;
    $("ag-askform")?.addEventListener("submit", e => { e.preventDefault(); run(A.ask(shift, state, $("ag-req").value, $("ag-att").value)); });
  }
  function renderClose() {
    const a = A.alertById(shift, selected), c = state.closed[selected];
    const box = $("ag-close");
    if (c) {
      box.innerHTML = `${guided() ? feedbackHtml(A.feedback(shift, state, selected)) : ""}<div class="dk-resolve"><span class="dk-resolve-stamp">Resolved</span><dl class="dk-fields"><div><dt>Verdict</dt><dd>${esc(A.VERDICTS[c.verdict])}</dd></div><div><dt>Your severity</dt><dd>${esc(c.severity)}</dd></div><div><dt>Evidence</dt><dd>${plural(c.evidence.length, "item")} ticked</dd></div>${c.related.length ? `<div><dt>Linked to</dt><dd>${c.related.map(id => esc(tref(A.alertById(shift, id)))).join(", ")}</dd></div>` : ""}</dl></div>
        <div class="row"><button class="btn ghost" type="button" id="ag-reopen">Reopen${guided() ? " and change it" : ""}</button>${guided() && nextOpen() ? `<button class="btn brand" type="button" id="ag-next">Next alert</button>` : ""}</div>`;
      $("ag-reopen").addEventListener("click", () => run(A.reopen(shift, state, selected)));
      $("ag-next")?.addEventListener("click", () => select(nextOpen(), true));
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
        <p class="muted">${guided() ? `Guided: ${esc(leadName)} checks it as soon as you close it.` : "Nothing is marked until the handover, just as on a real shift."} Closing takes ${plural(shift.costs.close, "minute")}.</p>
        <div class="row"><button class="btn brand" type="submit">Close alert</button>${guided() ? `<button class="btn ghost" type="button" id="ag-fill">Show me the answer</button>` : ""}</div><div id="ag-cfb" aria-live="polite"></div></form>`;
    for (const k of keep) { const [n, v] = k.split("="); const i = box.querySelector(`input[name="${n}"][value="${v}"]`); if (i) i.checked = true; }
    if (sev) box.querySelector("select").value = sev;
    // Guided: fill the form with the model answer, so the learner can read why before closing.
    $("ag-fill")?.addEventListener("click", () => {
      const m = A.modelClose(shift, selected);
      box.querySelectorAll("input").forEach(i => { i.checked = (i.name === "verdict" && i.value === m.verdict) || (i.name === "evidence" && m.evidence.includes(Number(i.value))) || (i.name === "related" && m.related.includes(i.value)); });
      box.querySelector("select").value = m.severity;
      $("ag-cfb").innerHTML = `<div class="feedback">Filled in with ${esc(leadName)}'s answer. ${gl(a.answer.why, 2)}</div>`;
    });
    $("ag-closeform").addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!f.get("verdict")) { $("ag-cfb").innerHTML = `<div class="feedback">Choose what the alert is first.</div>`; return; }
      const r = A.close(shift, state, selected, { verdict: f.get("verdict"), severity: f.get("severity"), evidence: f.getAll("evidence").map(Number), related: f.getAll("related") });
      run(r);
      // Guided stays on the alert so the feedback can be read; on your own, move to the next one.
      if (guided()) $("ag-fb-h")?.focus({ preventScroll: false });
      else if (nextOpen()) select(nextOpen(), true);
      else if (A.canHandOver(shift, state)) $("ag-hand-h").focus();
    });
  }

  const nextOpen = () => state.arrived.find(id => !(id in state.closed));
  const okMark = b => `<b class="${b ? "ok" : "no"}">${b ? "✓" : "✗"}</b>`;
  // Guided feedback on one closed alert: right or wrong, each evidence item and why, what to ask for.
  function feedbackHtml(fb) {
    if (!fb) return "";
    return `<section class="ag-fb${fb.verdict.ok && fb.evidence.pass ? " right" : " wrong"}" aria-labelledby="ag-fb-h"><h3 tabindex="-1" id="ag-fb-h">${fb.verdict.ok && fb.evidence.pass ? `${esc(leadName)}: spot on.` : `${esc(leadName)}: not quite.`}</h3>
      <p>${okMark(fb.verdict.ok)} ${esc(A.VERDICTS[fb.verdict.chosen])}${fb.verdict.ok ? "" : `. It's: <b>${esc(A.VERDICTS[fb.verdict.answer])}</b>`}.</p>
      <p>${okMark(fb.severity.ok)} Severity ${esc(fb.severity.chosen)}${fb.severity.ok ? "" : ` (fits: ${esc(fb.severity.accepted.join(" or "))})`}.</p>
      ${fb.evidence.items.filter(r => !r.ok || r.selected).map(r => `<p class="ev-why">${okMark(r.ok)} ${esc(A.alertById(shift, selected).evidence[r.index].text)}. ${esc(r.why)}</p>`).join("")}
      ${fb.links.ok ? "" : `<p>${okMark(false)} ${fb.links.want.length ? `It's connected to ${fb.links.want.map(id => esc(tref(A.alertById(shift, id)))).join(", ")}.` : "It isn't connected to the alerts you linked."}</p>`}
      ${fb.contain.length ? `<p class="muted">To contain it, ask for: ${fb.contain.map(c => esc(c.label)).join("; ")}.</p>` : ""}
      <p class="muted">${gl(fb.why, 2)}</p></section>`;
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
        <div class="row"><button class="btn brand" type="submit">Hand over and clock out</button>${guided() ? `<button class="btn ghost" type="button" id="ag-hfill">Fill in from ${esc(leadName)}'s notes</button>` : ""}</div></form>`;
    $("ag-hfill")?.addEventListener("click", () => {
      const m = A.modelHandover(shift);
      for (const a of shift.alerts) {
        hand.querySelector(`[name="status-${a.id}"]`).value = m.status[a.id];
        const r = hand.querySelector(`[name="summary-${a.id}"][value="${m.summary[a.id]}"]`); if (r) r.checked = true;
      }
    });
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
    d.innerHTML = `<div class="ag-out"><span class="ag-stamp out">OUT ${esc(clockAt(rep.clock))} · ${esc(day)}</span><span class="eyebrow">Shift report · ${esc(shift.client)}</span></div>
      <h2 tabindex="-1" id="ag-d-h">Clocked out: ${rep.passed} of ${rep.checks.length} checks passed</h2>
      ${rep.level === "guided" ? `<p class="muted">A guided shift${rep.hints ? `, with ${plural(rep.hints, "hint")}` : ""}. When you're ready, try it on your own: nothing is checked until the handover.</p>` : ""}
      <ul class="ag-checks">${rep.checks.map(c => `<li>${ok(c.ok)} <b>${esc(c.label)}:</b> ${esc(c.text)}</li>`).join("")}</ul>
      <p class="muted">Shift time ${clockAt(0)} to ${clockAt(rep.clock)} (${rep.clock} min: ${esc(mins) || "no actions"}). Time is shown, never scored.</p>
      ${rep.costs.length ? `<h3 class="eyebrow">Went too far</h3><ul class="findings">${rep.costs.map(c => `<li><b>${esc(c.label)}.</b> ${esc(c.cost)}</li>`).join("")}</ul>` : ""}
      ${rep.links.missed.length || rep.links.wrong.length ? `<p class="feedback">${rep.links.missed.length ? `${esc(rep.linkNote || "Some alerts were one incident. Linking alerts is how a SOC sees the whole attack.")} ` : ""}${rep.links.wrong.length ? "Some alerts you linked aren't connected." : ""}</p>` : ""}
      ${rep.alerts.map(a => `<details class="tbl ag-dalert"${a.verdict.ok && a.evidence.pass && a.containOk ? "" : " open"}><summary>${ok(a.verdict.ok && a.evidence.pass && a.containOk && a.status.ok && a.summary.ok)} ${esc(a.title)}</summary>
        <p>${ok(a.verdict.ok)} Verdict: ${esc(A.VERDICTS[a.verdict.chosen] || "none")}${a.verdict.ok ? "" : `. Answer: ${esc(A.VERDICTS[a.verdict.answer])}`}.</p>
        <p>${ok(a.severity.ok)} Severity: ${esc(a.severity.chosen)} (fits: ${esc(a.severity.accepted.join(" or "))}).</p>
        <div class="ev">${a.evidence.items.map(r => `<div class="ev-item ${r.ok ? "right" : "wrong"}"><p class="ev-why" style="margin-left:0"><b>${r.ok ? (r.supports ? (r.selected ? "Supports it." : "Supports it, but optional.") : "Right to leave out.") : (r.supports ? "Missed: this is key evidence." : "Not evidence for this.")}</b> ${esc(A.alertById(shift, a.id).evidence[r.index].text)}. ${esc(r.why)}</p></div>`).join("")}</div>
        ${a.contain.length ? `<p>${ok(a.containOk)} Containment: ${a.contain.map(c => `${esc(c.label)} (${c.status ? esc(STATUS_WORDS[c.status]) : "not asked"})`).join("; ")}.</p>` : ""}
        <p>${ok(a.status.ok)} Status: ${esc(A.STATUSES[a.status.chosen] || "none")}${a.status.ok ? "" : `. Better: ${esc(A.STATUSES[a.status.answer])}`}.</p>
        <p>${ok(a.summary.ok)} Model summary: ${esc(a.summary.model)}</p>
        <p class="muted">${gl(a.why)}</p></details>`).join("")}
      ${rep.pending.length ? `<p class="muted">Still on their way at handover: ${rep.pending.map(esc).join("; ")}.</p>` : ""}
      <h3 class="eyebrow">Handover notes</h3>
      <div class="ag-notes"><div><b>Yours</b><p>${rep.note ? esc(rep.note) : '<span class="muted">(none)</span>'}</p></div><div><b>A model handover</b><p>${esc(rep.modelNote)}</p></div></div>
      <div class="row"><button class="btn brand" type="button" id="ag-again">Work the shift again</button><button class="btn ghost" type="button" id="ag-watch">Watch ${esc(leadName)} work it</button>${shift.next ? `<a class="btn ghost" href="${esc(shift.next.href)}">${esc(shift.next.label)}</a>` : ""}</div>
      ${feedback ? `<p class="muted">This is a pilot. <a href="${esc(feedback)}" target="_blank" rel="noopener">Tell us how the shift went ↗</a> (a public GitHub form; needs a free account).</p>` : ""}`;
    $("ag-again").addEventListener("click", () => (onAgain ? onAgain() : mount(root, shift, { done: true, onComplete })));
    $("ag-watch").addEventListener("click", () => (onAgain ? onAgain({ shadow: true }) : mount(root, shift, { done: true, onComplete, shadow: true })));
    $("ag-d-h").focus();
    onComplete(rep);
  }

  $("ag-wait").addEventListener("click", () => run(A.wait(shift, state)));
  // The shift starts when you take the desk, at the level chosen on the client file.
  function begin(level) {
    const r0 = A.start(shift, { level });
    state = r0.state;
    $("ag-inbox").innerHTML = "";
    inbox({ sys: true, html: `<b>${plural(r0.events.length, "alert")} in the queue</b> from ${esc(shift.handedOverBy || "the night shift")}.` });
    if (level === "guided") inbox({ from: leadName, role: leadRole || "Shift lead", photo: shift.leadPhoto, html: `<p>Guided shift: open an alert and press <b>Give me a hint</b> whenever you're stuck. I'll check each one as you close it.</p>` });
    select(state.arrived[0], false);
  }

  // ---------- clocking in: tap the badge, the clock stamps the time, the lead briefs you, then the desk.
  const pause = ms => new Promise(res => setTimeout(res, reduced ? 0 : ms));
  $("ag-tap").addEventListener("click", async () => {
    const tap = $("ag-tap");
    if (tap.disabled) return;
    tap.disabled = true; $("ag-tc").classList.add("tapped");
    $("ag-tc-msg").textContent = "READING…";
    await pause(650);
    $("ag-tc-msg").textContent = "CLOCKED IN";
    $("ag-stamp").textContent = `IN ${shift.startsAt} · ${day}`; $("ag-stamp").hidden = false;
    tap.querySelector(".ag-tc-text").textContent = "Clocked in";
    for (const line of briefing) {
      const t = document.createElement("template");
      t.innerHTML = DESK.message({ from: leadName, role: leadRole || "Shift lead", at: shift.startsAt, photo: shift.leadPhoto, typing: true });
      const li = t.content.firstElementChild;
      $("ag-chat").appendChild(li);
      await pause(500 + line.length * 6);
      li.classList.remove("typing"); li.querySelector(".dk-text").innerHTML = `<p>${gl(line, 2)}</p>`;
    }
    await pause(250);
    $("ag-dossier").hidden = false;
    $("ag-desk-go").focus();
  });
  root.querySelectorAll(".ag-tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("ag-desk-go").addEventListener("click", () => {
    const level = root.querySelector('[name="ag-level"]:checked')?.value || "standard";
    if (level === "shadow") { $("ag-in").hidden = true; startShadow(); root.scrollIntoView?.({ block: "start" }); return; }
    begin(level);
    $("ag-in").hidden = true; $("ag-desk").hidden = false;
    root.scrollIntoView?.({ block: "start" });
    root.querySelector(`[data-alert="${state.arrived[0]}"]`)?.focus();
  });

  // ---------- shadowing: watch the lead work the shift (A.shadow, from this shift's own content), one step at a
  // time with Back and Next, then take your turn. Nothing is saved: watching doesn't count as working the shift.
  function startShadow() {
    const { steps } = A.shadow(shift), box = $("ag-shadow");
    let i = 0;
    const alertOf = st => A.alertById(shift, st.id);
    const srcName = id => shift.sources[id]?.name || id;
    const emailOf = st => shift.sources[st.source].emails.find(e => e.id === st.email);
    const words = st => {
      const a = st.id && alertOf(st);
      switch (st.kind) {
        case "open": return `Next in the queue: ${a.title}. Read what the detection saw first, then decide which log answers the question.`;
        case "search": return `${st.say || `Searching ${srcName(st.source)} for "${st.query}".`} (${plural(st.lines.length, "line")} of ${st.total} match.)`;
        case "email": { const h = MAIL.parseHeaders(emailOf(st).headers); return `Open "${h.subject}" and check Details: who really sent it, and from where?`; }
        case "think": return st.say;
        case "ask": return `This needs ${st.dept}: ${st.label.charAt(0).toLowerCase() + st.label.slice(1)}.${st.attached ? " I attach the finding as the reason, so they can act straight away." : ""}`;
        case "reply": return `${st.dept} ${st.outcome === "done" ? "have done it" : "replied"}. Read the reply: it may hold a new finding.`;
        case "arrive": return `A new alert has come in: ${st.title}. I'll finish what I'm on, then take it.`;
        case "wait": return `Everything's closed. I wait ${st.minutes} minutes for the replies still on their way before handing over.`;
        case "close": return `Closing it: ${st.verdict.toLowerCase()}, ${st.severity} severity. ${st.say}`;
        case "handover": return "Last job: the handover, so the next shift knows what happened, what was done and what to watch.";
      }
      return "";
    };
    const alertTicket = (a, status, extra = {}) => DESK.ticket({ kind: "Alert", ref: tref(a), title: a.title, priority: a.severity, status,
      fields: [["Raised", a.time || "This shift"], ["Logs", a.sources.map(srcName).join(", ")]], bodyLabel: "What the detection rule saw", body: `<p>${gl(a.detection, 2)}</p>`, ...extra }, { level: 3 });
    const show = st => {
      const a = st.id && alertOf(st);
      switch (st.kind) {
        case "open": case "think": return alertTicket(a, "open");
        case "search": return `<div class="panel-title"><h3 class="mono">${esc(srcName(st.source))}</h3><span class="sim-tag">Simulated log</span></div>
          <p class="muted log-count">Search: <b class="mono">${esc(st.query)}</b></p>
          <pre class="evidence console log-out" tabindex="0" aria-label="Matching lines">${st.lines.map(l => markTerms(l, st.query.split(" "))).join("\n")}</pre>
          ${st.found.length ? `<h4 class="eyebrow">New finding${st.found.length === 1 ? "" : "s"}</h4><ul class="findings">${st.found.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}`;
        case "email": { const e = emailOf(st); return MAIL.card({ headers: e.headers, body: e.body, links: e.links, attachments: e.attachments, folder: e.folder }, { id: `ag-sh-em-${e.id}`, org: shift.sources[st.source].org }); }
        case "ask": return DESK.ticket({ kind: "Request", title: st.label, status: "pending", fields: [["Team", contact(st.ref).role], ["Contact", contact(st.ref).from]],
          bodyLabel: st.attached ? "Reason attached" : "", body: st.attached ? `<p>${esc(st.attached)}</p>` : "" }, { level: 3 });
        case "reply": return `<ol class="dk-msgs">${DESK.message({ ...contact(st.ref), at: clockAt(st.clock), status: st.outcome, html: `<p>${gl(st.text, 2)}</p>` })}</ol>`;
        case "arrive": return alertTicket(alertOf(st), "new");
        case "wait": return `<p class="ag-sh-wait mono">${esc(clockAt(st.clock - st.minutes))} → ${esc(clockAt(st.clock))}</p>`;
        case "close": return alertTicket(a, "closed", { fields: [["Verdict", st.verdict], ["Severity", st.severity]], bodyLabel: "Evidence", body: `<ul>${st.evidence.map(t => `<li>${gl(t, 1)}</li>`).join("")}</ul><p><b>Summary:</b> ${esc(st.summary)}</p>` });
        case "handover": return `<h3>Handover</h3><p>${gl(st.text, 4)}</p>${st.links ? `<p class="muted">${gl(st.links, 2)}</p>` : ""}`;
      }
      return "";
    };
    const draw = () => {
      const st = steps[i], last = i === steps.length - 1;
      box.innerHTML = `<div class="ag-sh-head"><div><div class="eyebrow">Shadowing · ${esc(shift.client)}</div><h1 id="ag-sh-h">Watch ${esc(leadName)} work the shift</h1></div>
          <span class="mono muted">${esc(clockAt(st.clock))} · step ${i + 1} of ${steps.length}</span></div>
        <div class="progress"><span class="trk" aria-hidden="true" style="flex:1 1 auto"><i style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></i></span></div>
        <div class="ag-sh-grid"><ol class="dk-msgs ag-sh-say" aria-live="polite">${DESK.message({ from: leadName, role: leadRole || "Shift lead", photo: shift.leadPhoto, at: clockAt(st.clock), html: `<p>${gl(words(st), 3)}</p>` })}</ol>
          <div class="ag-sh-show" id="ag-sh-show">${show(st)}</div></div>
        <div class="row ag-sh-nav"><button class="btn ghost" type="button" id="ag-sh-back"${i === 0 ? " disabled" : ""}>‹ Back</button>
          ${last ? "" : `<button class="btn brand" type="button" id="ag-sh-next">Next ›</button>`}</div>
        ${last ? `<div class="ag-sh-turn"><h2>Your turn</h2><p>Same client, same alerts. Work them yourself: you'll be marked at the handover.</p>
          <div class="row"><button class="btn brand" type="button" data-turn="guided">Work it, with hints (Guided)</button><button class="btn ghost" type="button" data-turn="standard">On your own</button></div></div>` : ""}`;
      if (steps[i].kind === "email") MAIL.wire($("ag-sh-show"));
      // Each step starts at the lead's explanation (on a phone the step can be taller than the screen); focus stays
      // on the button you pressed, so the keyboard can keep going.
      const top = () => { if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); };
      $("ag-sh-back").addEventListener("click", () => { i--; draw(); ($("ag-sh-back").disabled ? $("ag-sh-next") : $("ag-sh-back")).focus({ preventScroll: true }); top(); });
      $("ag-sh-next")?.addEventListener("click", () => { i++; draw(); ($("ag-sh-next") || box.querySelector("[data-turn]")).focus({ preventScroll: true }); top(); });
      box.querySelectorAll("[data-turn]").forEach(b => b.addEventListener("click", () => {
        box.hidden = true; $("ag-desk").hidden = false; begin(b.dataset.turn);
        root.scrollIntoView?.({ block: "start" }); root.querySelector(`[data-alert="${state.arrived[0]}"]`)?.focus();
      }));
    };
    box.hidden = false; draw(); $("ag-sh-h").setAttribute("tabindex", "-1"); $("ag-sh-h").focus();
  }
  // From the shift report: straight to shadowing, without clocking in again.
  if (shadow) { $("ag-in").hidden = true; startShadow(); }
  // The page uses inProgress to warn before leaving mid-shift (the shift is short; there is no mid-shift save).
  return { get state() { return state; }, get inProgress() { return !!state && !state.complete && state.clock > 0; } };
}
