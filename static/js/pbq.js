// Performance-based questions (PBQs): exam-style tasks, marked part by part with partial credit, as CompTIA's are.
// Five kinds, all graded by what the answer does rather than by matching text:
//   match     items -> one of the choices (a select per item; logs can be shown in monospace)
//   order     put steps in order (move up / down)
//   subnet    fill a table of network, broadcast, first and last host, usable hosts and mask
//   firewall  build an ordered rule list; graded by sending test packets through it (labs/firewall.js)
//   cli       fix a network on the simulated Cisco IOS (labs/vlan.js); graded by the network's state
// grade() is pure and tested (tests/pbq.test.mjs); mount() is the page. Content: content/pbq/<cert>.json.
import { evaluate } from "./labs/firewall.js";
import { subnetInfo } from "./labs/subnet.js";
import { createNet } from "./labs/vlan.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gl = (t, n = 2) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n) : esc(t));

export const KINDS = { match: "Match", order: "Put in order", subnet: "Fill in the table", firewall: "Configure the firewall", cli: "Command line" };
export const SUBNET_FIELDS = { network: "Network address", broadcast: "Broadcast address", first: "First usable host", last: "Last usable host", hosts: "Usable hosts", mask: "Subnet mask" };
const RULE_FIELDS = ["action", "proto", "src", "dst", "port"];

// A fixed shuffle per PBQ, so the starting order is the same on every visit but never already right.
function seeded(id) { let h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); return () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
export function startOrder(pbq) {
  const n = pbq.steps.length, rand = seeded(pbq.id), a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.every((x, i) => x === i)) a.reverse();
  return a;
}

// What a perfect answer looks like, in the same shape grade() takes (cli: the commands to type, per device).
export function modelAnswer(pbq) {
  if (pbq.kind === "match") return Object.fromEntries(pbq.items.map(it => [it.id, it.answer]));
  if (pbq.kind === "order") return pbq.steps.map((_, i) => i);
  if (pbq.kind === "subnet") return Object.fromEntries(pbq.rows.flatMap((r, i) => { const s = subnetInfo(r.ip, r.prefix); return pbq.fields.map(f => [`${i}.${f}`, String(s[f])]); }));
  if (pbq.kind === "firewall") return pbq.model.map(r => ({ ...r }));
  if (pbq.kind === "cli") return pbq.model;
  throw new Error("unknown PBQ kind " + pbq.kind);
}

const norm = v => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const part = (label, ok, extra = {}) => ({ label, ok: !!ok, ...extra });

// Mark an answer. cli takes { net } (the live simulated network); the rest take plain data.
export function grade(pbq, answer) {
  let parts = [];
  if (pbq.kind === "match") {
    parts = pbq.items.map(it => part(it.text, norm(answer?.[it.id]) === norm(it.answer), { got: answer?.[it.id] || "", want: it.answer, why: it.why, id: it.id }));
  } else if (pbq.kind === "order") {
    const order = Array.isArray(answer) ? answer : [];
    parts = pbq.steps.map((st, k) => part(`Step ${k + 1}`, order[k] === k, { got: pbq.steps[order[k]]?.text || "", want: st.text, why: st.why }));
  } else if (pbq.kind === "subnet") {
    parts = pbq.rows.flatMap((r, i) => {
      const s = subnetInfo(r.ip, r.prefix);
      return pbq.fields.map(f => part(`${r.ip}/${r.prefix}: ${SUBNET_FIELDS[f].toLowerCase()}`, norm(answer?.[`${i}.${f}`]).replace(/,/g, "") === String(s[f]),
        { got: answer?.[`${i}.${f}`] || "", want: String(s[f]), id: `${i}.${f}`, why: subnetWhy(r, s, f) }));
    });
  } else if (pbq.kind === "firewall") {
    const rules = (Array.isArray(answer) ? answer : []).filter(r => r && r.action && RULE_FIELDS.every(k => r[k] !== "" && r[k] != null));
    // With no rules written, nothing is earned: blocked traffic would otherwise "pass" on the default deny alone.
    parts = pbq.tests.map(t => {
      const r = evaluate(t, rules);
      return part(t.label, rules.length > 0 && r.action === t.expected, { got: r.action, want: t.expected, rule: r.defaulted ? null : r.index + 1, why: t.why });
    });
    if (pbq.explicitDeny) {
      const last = rules.at(-1);
      parts.push(part("Policy: the last rule is an explicit deny for everything", last && last.action === "deny" && ["proto", "src", "dst", "port"].every(k => last[k] === "any"),
        { why: "Firewalls deny anything unmatched anyway, but an explicit final deny makes the policy visible and lets it be logged. Many policies require one." }));
    }
  } else if (pbq.kind === "cli") {
    const net = answer?.net;
    parts = pbq.tasks.map(t => part(t.text, !!net && net.isDone(t.check), { why: t.why }));
  } else throw new Error("unknown PBQ kind " + pbq.kind);
  const right = parts.filter(p => p.ok).length;
  return { parts, right, total: parts.length, pct: parts.length ? Math.round((right / parts.length) * 100) : 0 };
}
function subnetWhy(r, s, f) {
  const size = 2 ** (32 - r.prefix);
  return {
    network: `/${r.prefix} makes blocks of ${size} addresses; ${r.ip} falls in the block starting ${s.network}.`,
    broadcast: `The last address of the block (${s.network} plus ${size - 1}).`,
    first: "One after the network address.",
    last: "One before the broadcast address.",
    hosts: `2 to the power of ${32 - r.prefix} (${size}), minus the network and broadcast addresses.`,
    mask: `${r.prefix} ones, then zeros: ${s.mask}.`,
  }[f];
}

// A network to work on for a cli PBQ: the lab's topology with the PBQ's starting (broken) state.
export const cliNet = (pbq, lab) => createNet({ ...lab, start: pbq.start, tasks: [] });

// ---------- the page
export function mount(el, pbq, { lab = null, best = null, onScore = () => {} } = {}) {
  let order = pbq.kind === "order" ? startOrder(pbq) : null;
  let rules = pbq.kind === "firewall" ? Array.from({ length: pbq.slots }, () => ({ action: "", proto: "", src: "", dst: "", port: "" })) : null;
  let net = pbq.kind === "cli" ? cliNet(pbq, lab) : null, dev = pbq.kind === "cli" ? pbq.devices[0] : null, outs = {};
  let revealed = false, started = Date.now(), timer = null;
  const $ = id => el.querySelector("#" + id);
  const opts = (list, val, blank = "Choose…") => `<option value="">${esc(blank)}</option>` + list.map(o => `<option${norm(o) === norm(val) ? " selected" : ""}>${esc(o)}</option>`).join("");

  el.innerHTML = `<div class="pbq" data-kind="${esc(pbq.kind)}">
    <div class="pbq-bar"><span class="pbq-kind">${esc(KINDS[pbq.kind])}</span><span class="pbq-time" aria-hidden="true"></span>
      <span class="sr-only">Suggested time: about ${pbq.minutes} minutes.</span>${best != null ? `<span class="pbq-best">Your best: ${best}%</span>` : ""}</div>
    <section class="pbq-brief" aria-labelledby="pbq-brief-h"><h2 id="pbq-brief-h" class="sr-only">The task</h2><p>${gl(pbq.scenario, 4)}</p>
      ${pbq.requirements ? `<ul class="pbq-reqs">${pbq.requirements.map(r => `<li>${gl(r, 1)}</li>`).join("")}</ul>` : ""}
      ${pbq.kind === "cli" ? `<ul class="pbq-reqs">${pbq.tasks.map(t => `<li>${gl(t.text, 1)}</li>`).join("")}</ul>` : ""}</section>
    ${pbq.kind === "cli" && globalThis.PN_safeNote ? globalThis.PN_safeNote("sim", { how: "vlan" }) : ""}
    <section class="pbq-task" id="pbq-task" aria-label="Your answer"></section>
    <div class="row pbq-ctl"><button class="btn brand" type="button" data-act="check">Check my answer</button>
      <button class="btn ghost" type="button" data-act="answer">Show the answer</button><button class="btn ghost" type="button" data-act="reset">Start again</button></div>
    <div id="pbq-result" class="pbq-result" aria-live="polite"></div>
    ${pbq.simplification ? `<details class="tbl simplification"><summary>How this differs from the real thing</summary><p>${esc(pbq.simplification)}</p></details>` : ""}
  </div>`;

  // ---- each kind's answer area
  function draw() {
    const box = $("pbq-task");
    if (pbq.kind === "match") {
      box.innerHTML = `<p class="muted pbq-how">${esc(pbq.prompt || "Choose the right answer for each item.")}</p><ol class="pbq-match">${pbq.items.map((it, i) => `<li data-id="${esc(it.id)}">
        <div class="pbq-item${pbq.mono ? " mono" : ""}" id="pbq-i${i}">${pbq.mono ? esc(it.text) : gl(it.text, 1)}</div>
        <select data-id="${esc(it.id)}" aria-labelledby="pbq-i${i}">${opts(pbq.choices, "")}</select><p class="pbq-why" hidden></p></li>`).join("")}</ol>`;
    } else if (pbq.kind === "order") drawOrder();
    else if (pbq.kind === "subnet") {
      box.innerHTML = `<p class="muted pbq-how">Type each answer. Usable hosts is a number.</p>` + pbq.rows.map((r, i) => `<fieldset class="pbq-sub"><legend class="mono">${esc(r.ip)}/${r.prefix}</legend>
        ${pbq.fields.map(f => `<label class="pbq-cell"><span>${esc(SUBNET_FIELDS[f])}</span><input class="mono" data-cell="${i}.${f}" autocomplete="off" spellcheck="false" inputmode="${f === "hosts" ? "numeric" : "decimal"}"><em class="pbq-cellwhy" hidden></em></label>`).join("")}</fieldset>`).join("");
    } else if (pbq.kind === "firewall") drawRules();
    else if (pbq.kind === "cli") {
      box.innerHTML = `<div class="row pbq-devs" role="group" aria-label="Choose a device">${pbq.devices.map(d => `<button type="button" class="chip" data-dev="${esc(d)}" aria-pressed="${d === dev}">${esc(d)}</button>`).join("")}</div>
        <section class="term-shell" aria-label="Simulated console"><div class="term-bar"><span id="pbq-dev">${esc(dev)}</span><span class="tag">Simulated</span></div>
          <div class="term-out" id="pbq-out" aria-live="polite" tabindex="0" aria-label="Console output"></div>
          <form class="term-in" id="pbq-form"><label class="sr" for="pbq-in">Command</label><span class="term-ps" id="pbq-ps"></span><input id="pbq-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form></section>`;
      showDev();
    }
  }
  function drawOrder(focusAt = null) {
    $("pbq-task").innerHTML = `<p class="muted pbq-how">${esc(pbq.prompt || "Put these in order, first at the top.")}</p><ol class="pbq-order">${order.map((s, k) => `<li data-k="${k}"><span class="pbq-step">${gl(pbq.steps[s].text, 1)}</span>
      <span class="pbq-mv"><button type="button" class="btn ghost" data-up="${k}" ${k ? "" : "disabled"} aria-label="Move up: ${esc(pbq.steps[s].text)}">↑</button><button type="button" class="btn ghost" data-down="${k}" ${k < order.length - 1 ? "" : "disabled"} aria-label="Move down: ${esc(pbq.steps[s].text)}">↓</button></span><p class="pbq-why" hidden></p></li>`).join("")}</ol>`;
    if (focusAt) $("pbq-task").querySelector(focusAt)?.focus();
  }
  function drawRules() {
    const o = pbq.options;
    $("pbq-task").innerHTML = `<p class="muted pbq-how">Rules are checked from the top; the first match decides, and anything unmatched is denied. Leave a row's action empty to skip it.</p>
      <ol class="pbq-rules">${rules.map((r, k) => `<li><fieldset><legend>Rule ${k + 1}</legend><div class="pbq-rule">
        ${RULE_FIELDS.map(f => `<label><span>${{ action: "Action", proto: "Protocol", src: "Source", dst: "Destination", port: "Port" }[f]}</span><select data-r="${k}" data-f="${f}">${opts(f === "action" ? ["allow", "deny"] : o[f], r[f], f === "action" ? "(unused)" : "Choose…")}</select></label>`).join("")}
        <span class="pbq-mv"><button type="button" class="btn ghost" data-rup="${k}" ${k ? "" : "disabled"} aria-label="Move rule ${k + 1} up">↑</button><button type="button" class="btn ghost" data-rdown="${k}" ${k < rules.length - 1 ? "" : "disabled"} aria-label="Move rule ${k + 1} down">↓</button></span>
      </div></fieldset></li>`).join("")}</ol>`;
  }
  function showDev() {
    el.querySelectorAll("[data-dev]").forEach(b => b.setAttribute("aria-pressed", b.dataset.dev === dev));
    $("pbq-dev").textContent = dev; $("pbq-ps").textContent = net.prompt(dev);
    $("pbq-out").innerHTML = outs[dev] || `<div class="muted">${esc(dev)}: ${/^PC/.test(dev) ? "Windows command prompt. Try ipconfig or ping." : "Cisco IOS console. Type ? for help; abbreviations work."}</div>`;
    $("pbq-out").scrollTop = $("pbq-out").scrollHeight;
  }
  function runLine(line) {
    const echo = `<div><span class="term-ps">${esc(net.prompt(dev))}</span>${esc(line)}</div>`, res = net.exec(dev, line);
    outs[dev] = (outs[dev] || "") + echo + (res.out ? `<div class="${res.error ? "t-err" : ""}">${esc(res.out)}</div>` : "");
  }

  // ---- reading and filling answers
  function answer() {
    if (pbq.kind === "match") return Object.fromEntries([...el.querySelectorAll("select[data-id]")].map(s => [s.dataset.id, s.value]));
    if (pbq.kind === "order") return order.slice();
    if (pbq.kind === "subnet") return Object.fromEntries([...el.querySelectorAll("[data-cell]")].map(i => [i.dataset.cell, i.value]));
    if (pbq.kind === "firewall") return rules.map(r => ({ ...r }));
    return { net };
  }
  function fill() {
    const m = modelAnswer(pbq);
    if (pbq.kind === "match") el.querySelectorAll("select[data-id]").forEach(s => { s.value = m[s.dataset.id]; });
    else if (pbq.kind === "order") { order = m; drawOrder(); }
    else if (pbq.kind === "subnet") el.querySelectorAll("[data-cell]").forEach(i => { i.value = m[i.dataset.cell]; });
    else if (pbq.kind === "firewall") { rules = [...m, ...Array.from({ length: Math.max(0, pbq.slots - m.length) }, () => ({ action: "", proto: "", src: "", dst: "", port: "" }))]; drawRules(); }
    else if (pbq.kind === "cli") { for (const [d, cmds] of Object.entries(m)) { const keep = dev; dev = d; cmds.forEach(runLine); dev = keep; } showDev(); }
  }
  function mark(g) {
    if (pbq.kind === "match") g.parts.forEach(p => {
      const li = el.querySelector(`li[data-id="${CSS.escape(p.id)}"]`); if (!li) return;
      li.classList.toggle("ok", p.ok); li.classList.toggle("no", !p.ok);
      const w = li.querySelector(".pbq-why"); w.hidden = false; w.innerHTML = `<b>${p.ok ? "Right" : `Answer: ${esc(p.want)}`}.</b> ${gl(p.why, 1)}`;
    });
    if (pbq.kind === "order") el.querySelectorAll(".pbq-order li").forEach((li, k) => {
      const p = g.parts[k]; li.classList.toggle("ok", p.ok); li.classList.toggle("no", !p.ok);
      const w = li.querySelector(".pbq-why"); w.hidden = false; w.innerHTML = p.ok ? `<b>Right.</b> ${gl(p.why, 1)}` : `<b>Step ${k + 1} is:</b> ${gl(p.want, 1)}`;
    });
    if (pbq.kind === "subnet") g.parts.forEach(p => {
      const i = el.querySelector(`[data-cell="${p.id}"]`); if (!i) return;
      const cell = i.closest(".pbq-cell"); cell.classList.toggle("ok", p.ok); cell.classList.toggle("no", !p.ok);
      const w = cell.querySelector(".pbq-cellwhy"); w.hidden = p.ok; w.textContent = p.ok ? "" : `Answer: ${p.want}. ${p.why}`;
    });
  }
  function result(g) {
    const head = `<p class="pbq-score"><b>${g.right} of ${g.total} parts right (${g.pct}%).</b> ${g.pct === 100 ? "All correct." : g.pct >= 70 ? "Close: check the ones marked." : "Look at the ones marked, then try again."}${revealed ? " <span class=\"muted\">Answers were shown, so this isn't counted.</span>" : ""}</p>`;
    // Kinds whose answer area can't carry the marks (firewall tests, cli tasks) list each part here.
    const list = ["firewall", "cli"].includes(pbq.kind) ? `<ul class="pbq-parts">${g.parts.map(p => `<li class="${p.ok ? "ok" : "no"}"><b>${p.ok ? "✓" : "✗"} ${gl(p.label, 1)}</b>
      ${p.want ? ` <span class="muted">${esc(p.want === p.got ? p.want : `wanted ${p.want}, got ${p.got}`)}${p.rule ? ` (rule ${p.rule})` : p.got && pbq.kind === "firewall" ? " (no rule matched: default deny)" : ""}</span>` : ""}
      ${p.why ? `<span class="pbq-pwhy">${gl(p.why, 1)}</span>` : ""}</li>`).join("")}</ul>` : "";
    $("pbq-result").innerHTML = head + list;
  }
  function check() {
    const g = grade(pbq, answer()); mark(g); result(g);
    if (!revealed && g.pct > 0) onScore(g.pct);  // a blank or all-wrong check isn't saved as a best
    return g;
  }
  function reset() {
    revealed = false; started = Date.now(); outs = {};
    if (pbq.kind === "order") order = startOrder(pbq);
    if (pbq.kind === "firewall") rules = rules.map(() => ({ action: "", proto: "", src: "", dst: "", port: "" }));
    if (pbq.kind === "cli") { net = cliNet(pbq, lab); dev = pbq.devices[0]; }
    draw(); $("pbq-result").innerHTML = "";
  }

  // ---- events
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.act === "check") return void check();
    if (b.dataset.act === "answer") { revealed = true; fill(); return void check(); }
    if (b.dataset.act === "reset") return reset();
    if (b.dataset.up || b.dataset.down) {
      const k = Number(b.dataset.up ?? b.dataset.down), j = b.dataset.up ? k - 1 : k + 1;
      [order[k], order[j]] = [order[j], order[k]];
      // Keep focus on the step that moved: the same arrow in its new place, or the other arrow at either end.
      drawOrder();
      return (el.querySelector(`[data-${b.dataset.up ? "up" : "down"}="${j}"]:not([disabled])`) || el.querySelector(`[data-${b.dataset.up ? "down" : "up"}="${j}"]`))?.focus();
    }
    if (b.dataset.rup || b.dataset.rdown) {
      const k = Number(b.dataset.rup ?? b.dataset.rdown), j = b.dataset.rup ? k - 1 : k + 1;
      [rules[k], rules[j]] = [rules[j], rules[k]]; drawRules();
      return el.querySelector(`[data-${b.dataset.rup ? "rup" : "rdown"}="${j}"]:not([disabled])`)?.focus();
    }
    if (b.dataset.dev) { dev = b.dataset.dev; showDev(); $("pbq-in").focus(); }
  });
  el.addEventListener("change", e => { const s = e.target.closest("select[data-r]"); if (s) rules[Number(s.dataset.r)][s.dataset.f] = s.value; });
  el.addEventListener("submit", e => {
    if (e.target.id !== "pbq-form") return;
    e.preventDefault(); const i = $("pbq-in"); runLine(i.value); i.value = ""; showDev();
  });
  el.addEventListener("keydown", e => {
    if (e.target.id !== "pbq-in") return;
    if (e.key === "Tab" && e.target.value) { e.preventDefault(); e.target.value = net.complete(dev, e.target.value); }
  });
  // The clock counts up against the suggested time (the real exam's clock covers the whole test).
  const tick = () => {
    if (!el.isConnected) return clearInterval(timer);
    const s = Math.floor((Date.now() - started) / 1000), t = el.querySelector(".pbq-time");
    if (t) t.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} · about ${pbq.minutes} min`;
  };
  timer = setInterval(tick, 1000); tick();
  draw();
  return { check, fill, reset, answer, net: () => net };
}
