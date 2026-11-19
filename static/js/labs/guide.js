// The hint box for the command-line labs (Linux terminal, network tools; vlan.js uses hintHtml and the same levels): which
// objective you're on, what the last one showed, and hints on demand in three steps (19 Nov, the owner's call):
//   1 a nudge in words (the objective's `nudge`), 2 the command's shape with the values blanked (walk.js `shape`),
//   3 the full command, why, and "Run it" (types it into the console and runs it).
// The nudge is shown once per objective; after a step runs the hint closes and reopens at the shape. Two errors in a row
// open it by themselves ("Stuck?"). A walk step is [device, "pc", command, why]; the shell decides what counts as the same
// command (`same`).
//
// Use: const g = guide(box, lab, { done, input, form, same, advanceOnError });
//   before each command: const pre = g.before();  after it: g.after(line, res, pre);  after renderTasks: g.draw();
import { shape, openLevel, more } from "./walk.js";

// One hint area, never two (the owner's call, 19 Nov): on a wide screen it sits in the objectives panel under the list;
// at 860 px and below, where that panel drops under the terminal, it sits above the terminal instead. Moves on resize.
export function dock(box, panelSlot, shell) {
  const mq = matchMedia("(max-width: 860px)");
  const place = () => {
    const narrow = mq.matches;
    if (narrow && box.parentElement !== shell) shell.prepend(box);
    if (!narrow && box.parentElement !== panelSlot) panelSlot.append(box);
    box.classList.toggle("in-panel", !narrow);
  };
  place(); mq.addEventListener?.("change", place);
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The open hint at a level. step = { cmd, why }; on = "on S2" style device note or "". Pure (tested in walk.test).
export function hintHtml({ level, nudge, step, rescue = false, on = "" }) {
  const sh = step && shape(step.cmd);
  const head = rescue ? `<p class="vl-rescue">Stuck? Here's a hint for this objective.</p>` : "";
  const hide = `<button type="button" class="link-btn" data-hidehint>Hide</button>`;
  if (level === 1) return `<div class="vl-next${rescue ? " rescue" : ""}">${head}<p class="vl-nudge"><span class="eyebrow">Hint 1 of ${sh ? 3 : 2}</span> ${esc(nudge)}</p>
    <div class="row">${hide}<button type="button" class="btn ghost hint-more" data-more>More help</button></div></div>`;
  if (level === 2 && sh) return `<div class="vl-next${rescue ? " rescue" : ""}">${head}<p class="vl-cmd"><span class="eyebrow">Hint 2 of 3${on}</span><code>${esc(sh)}</code></p><p class="vl-cmdwhy">Fill in the blanks. ${nudge ? esc(nudge) : ""}</p>
    <div class="row">${hide}<button type="button" class="btn ghost hint-more" data-more>Show the command</button></div></div>`;
  return `<div class="vl-next${rescue ? " rescue" : ""}">${head}<p class="vl-cmd"><span class="eyebrow">Try${on}</span><code>${esc(step.cmd)}</code></p><p class="vl-cmdwhy">${esc(step.why)}</p>
    <div class="row">${hide}<button type="button" class="btn brand" data-runit>Run it</button></div></div>`;
}

export function guide(box, lab, { done, input, form, same, advanceOnError = false }) {
  let walkTask = null, walkK = 0, errStreak = 0, lastDone = null, level = 0, seen = false, shown = null;
  const current = () => lab.tasks.find(t => !done.has(t.id));
  function step(next) {
    if (!next || !next.walk) return null;
    if (walkTask !== next.id) { walkTask = next.id; walkK = 0; level = 0; seen = false; }
    const st = next.walk[walkK]; return st ? { cmd: st[2], why: st[3] || "" } : null;
  }
  const found = () => (lastDone ? `<p class="vl-done">✓ ${lastDone.found ? `<b>What that showed:</b> ${esc(lastDone.found)}` : esc(lastDone.why || "Done.")}</p>` : "");
  const opening = (t, s) => openLevel({ nudge: t.nudge, shaped: !!shape(s.cmd), seen });
  function draw() {
    const next = current();
    // The objective that just finished, however it was done (a command, or the permissions lab's switches).
    if (shown && shown !== next && done.has(shown.id)) lastDone = shown;
    shown = next;
    if (!next) { box.innerHTML = `${found()}<b class="ok">All ${lab.tasks.length} objectives done.</b>`; return; }
    const s = step(next), rescue = !level && errStreak >= 2 && !!s;
    const lv = level || (rescue ? Math.max(2, opening(next, s)) : 0);
    if (lv === 1) seen = true;
    box.innerHTML = `${found()}
      <div class="vl-objrow"><p class="vl-obj"><span class="eyebrow">Objective ${lab.tasks.indexOf(next) + 1} of ${lab.tasks.length}</span> ${esc(next.text)}</p></div>
      ${lv && s ? hintHtml({ level: lv, nudge: next.nudge, step: s, rescue }) : s ? `<div class="row"><button type="button" class="link-btn" data-nowhint aria-expanded="false">Show a hint</button></div>` : ""}`;
    box.dataset.level = lv;
  }
  const focusIn = () => box.querySelector("[data-runit], [data-more]")?.focus({ preventScroll: true });
  function open() { const t = current(), s = step(t); if (!s) return; level = opening(t, s); draw(); focusIn(); }
  box.addEventListener("click", e => {
    const t = current(), s = step(t);
    if (e.target.closest("[data-runit]") && s) { input.value = s.cmd; input.focus({ preventScroll: true }); form.requestSubmit(); return; }
    if (e.target.closest("[data-nowhint]")) return open();
    if (e.target.closest("[data-more]") && s) { level = more(+box.dataset.level || 1, { shaped: !!shape(s.cmd) }); draw(); focusIn(); return; }
    if (e.target.closest("[data-hidehint]")) { level = 0; errStreak = 0; draw(); input.focus({ preventScroll: true }); }
  });
  return {
    // The walk's step before the command runs (followed whether or not a hint is open), and the task it belongs to.
    before: () => { const t = current(); return { task: t, step: step(t) }; },
    after(line, res, pre) {
      if (line.trim()) errStreak = res.error ? errStreak + 1 : 0;
      if (pre.step && (!res.error || advanceOnError) && same(line, pre.step.cmd)) { walkK++; level = 0; errStreak = 0; }
    },
    draw,
    hint: open,
  };
}
