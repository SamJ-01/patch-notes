// "The Call" — a vishing (voice phishing) role-play. An "IT Service Desk" rings you and, turn by turn, pressures you
// into handing over secrets or access. You read each line (captions first; a voice clip can be added later) and choose
// how to respond. The grading is pure and tested (tests/vishing.test.mjs); mount() is the on-page call.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));

// --- pure engine ---
// The index of the one safe option in a beat (every beat has exactly one).
export const safeIndex = beat => (beat.options || []).findIndex(o => o.safe);
// What happens when a learner picks option `idx` on a beat.
export function beatResult(beat, idx) {
  const opt = (beat.options || [])[idx] || {};
  return { safe: !!opt.safe, feedback: opt.feedback || "", risk: opt.risk || "", flag: opt.safe ? (beat.flag || "") : "", ends: !!opt.ends };
}
// Summarise a run. `picks[i]` is the option index chosen on beat i (or null/undefined if not answered).
export function summary(beats, picks = []) {
  const spotted = [];
  beats.forEach((b, i) => { const p = picks[i]; if (p != null && b.options[p] && b.options[p].safe) spotted.push(b.flag); });
  return { spotted, caught: spotted.length, total: beats.length, safe: spotted.length === beats.length, flags: beats.map(b => b.flag) };
}

// --- on-page call ---
// Handset icons (Feather, MIT licence): a phone, and the same phone turned down to hang up.
const PHONE_PATH = "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z";
const phoneIcon = (down = false) => `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"${down ? ' style="transform:rotate(135deg)"' : ""}><path d="${PHONE_PATH}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// The phone's status bar: decorative (time, signal, Wi-Fi, battery), hidden from screen readers.
const STATUS = `<div class="vp-status" aria-hidden="true"><span class="vp-clock">10:24</span><span class="vp-island"></span>
  <span class="vp-icons"><svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
  <svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.4 1.4a4.4 4.4 0 0 0-6.2 0zM1.4 4.8a9.4 9.4 0 0 1 13.2 0l-1.4 1.4a7.4 7.4 0 0 0-10.4 0z"/></svg>
  <span class="vp-batt"><i></i></span></span></div>`;
const clock = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const beats = lab.beats, call = lab.call || {}, debrief = lab.debrief || {};
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phase = "ringing", bi = 0, picks = [], answeredThis = false;
  const initials = (call.from || "IT").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  root.innerHTML = `<div class="vp-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1></div>
    <section class="vp-stage">
      <div class="vp-phone" id="vp-phone" data-phase="ringing">
        <div class="vp-glass">${STATUS}<div class="vp-screen" id="vp-screen"></div><span class="vp-home" aria-hidden="true"></span></div>
      </div>
    </section>
    <section class="panel vp-debrief" id="vp-debrief" hidden aria-live="polite"></section>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  // The call timer counts up from when you answer, as a real call screen does.
  let callStart = 0, ticker = null;
  const tick = () => { const t = root.querySelector(".vp-timer"); if (!root.isConnected) return clearInterval(ticker); if (t) t.textContent = clock(Math.floor((Date.now() - callStart) / 1000)); };
  const startClock = () => { callStart = Date.now(); clearInterval(ticker); ticker = setInterval(tick, 1000); };
  let audio = null;
  function stopAudio() { if (audio) { audio.pause(); audio = null; } }
  function playLine(src, btn) {
    stopAudio();
    if (!src) return;
    audio = new Audio(src);
    const phone = $("vp-phone");
    audio.onplay = () => phone?.setAttribute("data-speaking", "1");
    audio.onended = () => phone?.removeAttribute("data-speaking");
    audio.play().catch(() => { if (btn) btn.hidden = false; });
  }

  function renderRinging() {
    $("vp-phone").dataset.phase = "ringing";
    $("vp-screen").innerHTML = `<div class="vp-incoming">
        <span class="vp-ring">Incoming call</span>
        <span class="vp-av lg" aria-hidden="true">${esc(initials)}</span>
        <b class="vp-name">${esc(call.from || "Unknown")}</b><span class="vp-num">${esc(call.number || "number withheld")}</span></div>
      <p class="vp-note">${gl(call.note || "You did not expect this call.")}</p>
      <div class="vp-calls">
        <span class="vp-act"><button class="vp-btn decline" type="button" id="vp-decline" aria-label="Decline the call">${phoneIcon(true)}</button><span aria-hidden="true">Decline</span></span>
        <span class="vp-act"><button class="vp-btn answer" type="button" id="vp-answer" aria-label="Answer the call">${phoneIcon()}</button><span aria-hidden="true">Answer</span></span>
      </div>`;
    const answer = () => { phase = "call"; bi = 0; startClock(); renderCall(); };
    $("vp-answer").onclick = answer;
    $("vp-decline").onclick = () => {
      $("vp-phone").dataset.phase = "ended";
      $("vp-screen").innerHTML = `<div class="vp-safe-end"><span class="vp-endicon" aria-hidden="true">${phoneIcon(true)}</span><h2>Call declined ✓</h2>
        <p>Declining or hanging up on an unexpected caller is always a safe choice: a real service desk won't mind you calling them back.</p>
        <p class="vp-muted">To practise spotting the manipulation, answer and play it through.</p></div>
        <div class="vp-calls"><span class="vp-act"><button class="vp-btn answer" type="button" id="vp-answer2" aria-label="Answer and practise">${phoneIcon()}</button><span aria-hidden="true">Answer and practise</span></span></div>`;
      $("vp-answer2").onclick = answer;
    };
  }

  function renderCall() {
    $("vp-phone").dataset.phase = "call";
    const b = beats[bi];
    answeredThis = picks[bi] != null;
    const heard = b.voice ? `<button class="vp-play" type="button" id="vp-play"><span aria-hidden="true">▶</span> Hear it again</button>` : "";
    let body;
    if (!answeredThis) {
      body = `<p class="vp-line">${gl(b.say)}</p>${heard}${b.ask ? `<p class="vp-prompt">${gl(b.ask, 1)}</p>` : ""}
        <div class="vp-options" role="group" aria-label="Your reply">${b.options.map((o, i) =>
          `<button class="vp-opt" type="button" data-i="${i}">${esc(o.text)}</button>`).join("")}</div>`;
    } else {
      const chosen = b.options[picks[bi]], r = beatResult(b, picks[bi]);
      body = `<p class="vp-youline">You: ${gl(chosen.text)}</p>
        <p class="vp-verdict ${r.safe ? "ok" : "bad"}">${gl(r.feedback)}</p>
        <button class="btn brand" type="button" id="vp-next">${bi < beats.length - 1 ? "They continue" : "Hang up"}</button>`;
    }
    $("vp-screen").innerHTML = `<div class="vp-call-head">
        <span class="vp-av sm" aria-hidden="true">${esc(initials)}</span>
        <div class="vp-id"><b>${esc(call.from || "Caller")}</b><span class="vp-live"><span aria-hidden="true">●</span> <span class="vp-timer">${clock(Math.floor((Date.now() - callStart) / 1000))}</span><span class="sr-only"> on the call</span></span></div>
        <span class="vp-beat" aria-hidden="true">${bi + 1}/${beats.length}</span></div>
      <div class="vp-talk">${body}</div>`;
    const play = $("vp-play");
    if (play) play.onclick = () => playLine(b.voice, play);
    if (!answeredThis && b.voice && !reduced) playLine(b.voice, play);
    $("vp-screen").querySelectorAll(".vp-opt").forEach(btn => btn.onclick = () => { stopAudio(); picks[bi] = +btn.dataset.i; onPart(bi); renderCall(); });
    const nx = $("vp-next"); if (nx) nx.onclick = () => { if (bi < beats.length - 1) { bi++; renderCall(); } else { phase = "ended"; renderEnded(); } };
  }

  function renderEnded() {
    stopAudio(); clearInterval(ticker);
    $("vp-phone").dataset.phase = "ended";
    const s = summary(beats, picks);
    $("vp-screen").innerHTML = `<div class="vp-safe-end"><span class="vp-endicon" aria-hidden="true">${phoneIcon(true)}</span><h2>${s.safe ? "Call handled safely ✓" : "Call ended"}</h2>
      <span class="vp-num">${esc(call.from || "Caller")} · ${clock(Math.floor((Date.now() - callStart) / 1000))}</span>
      <p>You caught <b>${s.caught} of ${s.total}</b> red flags.</p></div>
      <div class="vp-calls"><span class="vp-act"><button class="vp-btn answer" type="button" id="vp-replay" aria-label="Take the call again">↺</button><span aria-hidden="true">Take the call again</span></span></div>`;
    $("vp-replay").onclick = reset;
    $("vp-debrief").hidden = false;
    $("vp-debrief").innerHTML = `<div class="panel-title"><h2>${esc(debrief.title || "Red flags on this call")}</h2></div>
      <ul class="vp-debrief-list">${beats.map((b, i) => { const ok = picks[i] != null && b.options[picks[i]].safe;
        return `<li class="${ok ? "ok" : "miss"}"><span class="vp-di" aria-hidden="true">${ok ? "✓" : "○"}</span> ${gl(b.flag)}</li>`; }).join("")}</ul>
      <p class="vp-done">${gl(debrief.safeLine || "On any call like this: slow down, hang up, and call the organisation back on a number you look up yourself. A real service desk never needs your password or a one-time code.")}</p>`;
    if (s.safe) onComplete();
    const patch = globalThis.PN_patch;
    if (patch) patch(s.safe ? "You hung up and reported it. Textbook." : "A couple slipped through. On a real call: slow down, hang up, and ring back on a number you look up yourself.", 7000);
    $("vp-debrief").scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  function reset() { stopAudio(); clearInterval(ticker); phase = "ringing"; bi = 0; picks = []; onReset(); $("vp-debrief").hidden = true; renderRinging(); }

  renderRinging();
}
