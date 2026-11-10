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
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const beats = lab.beats, call = lab.call || {}, debrief = lab.debrief || {};
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phase = "ringing", bi = 0, picks = [], answeredThis = false;
  const initials = (call.from || "IT").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  root.innerHTML = `<div class="vp-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${gl(lab.intro)}</p></div>
    <div class="row osi-progress" id="vp-prog"></div>
    <section class="vp-stage">
      <div class="vp-phone" id="vp-phone" data-phase="ringing">
        <div class="vp-screen" id="vp-screen"></div>
      </div>
      <aside class="vp-side" id="vp-side"></aside>
    </section>
    <section class="panel vp-debrief" id="vp-debrief" hidden aria-live="polite"></section>
  </div>`;
  const $ = id => root.querySelector("#" + id);

  function caughtSoFar() { return summary(beats, picks).spotted.filter(Boolean); }
  function renderProg() {
    const done = picks.filter(p => p != null).length;
    $("vp-prog").innerHTML = beats.map((b, i) => `<span class="pchip">${picks[i] != null ? (beats[i].options[picks[i]].safe ? "✓" : "✕") : "○"} ${i + 1}</span>`).join("")
      + `<span class="pchip ghost">${done}/${beats.length} answered</span>`;
  }
  function renderSide() {
    const caught = caughtSoFar();
    $("vp-side").innerHTML = `<div class="eyebrow">Red flags you caught</div>
      ${caught.length ? `<ul class="vp-flags">${caught.map(f => `<li>${gl(f)}</li>`).join("")}</ul>` : `<p class="muted">Spot the manipulation as the call goes on. A safe reply catches the flag.</p>`}
      <p class="vp-rule">Golden rule: hang up and call back on a number you look up yourself. Never read out a password or a one-time code.</p>`;
  }
  function bubble(kind, who, text, extra = "") { return `<div class="vp-row ${kind}"><span class="vp-who">${esc(who)}</span><div class="vp-bubble">${gl(text)}${extra}</div></div>`; }

  function renderRinging() {
    $("vp-phone").dataset.phase = "ringing";
    $("vp-screen").innerHTML = `<div class="vp-call-head">
        <span class="vp-av" aria-hidden="true">${esc(initials)}</span>
        <div class="vp-id"><b>${esc(call.from || "Unknown")}</b><span class="mono">${esc(call.number || "number withheld")}</span>
        <span class="vp-ring">Incoming call…</span></div></div>
      <p class="vp-note">${gl(call.note || "You did not expect this call.")}</p>
      <div class="vp-calls">
        <button class="vp-btn decline" type="button" id="vp-decline" aria-label="Decline the call">✕ Decline</button>
        <button class="vp-btn answer" type="button" id="vp-answer" aria-label="Answer the call">✆ Answer</button>
      </div>`;
    $("vp-answer").onclick = () => { phase = "call"; bi = 0; renderCall(); };
    $("vp-decline").onclick = () => {
      $("vp-screen").innerHTML = `<div class="vp-safe-end"><h2>Call declined ✓</h2>
        <p>Declining or hanging up on an unexpected caller is always a safe choice: a real service desk will not mind you calling them back.</p>
        <p class="muted">To practise spotting the manipulation, answer and play it through.</p>
        <div class="vp-calls"><button class="vp-btn answer" type="button" id="vp-answer2">✆ Answer and practise</button></div></div>`;
      $("vp-answer2").onclick = () => { phase = "call"; bi = 0; renderCall(); };
    };
  }

  function renderCall() {
    $("vp-phone").dataset.phase = "call";
    const b = beats[bi];
    answeredThis = picks[bi] != null;
    const playBtn = b.voice ? `<button class="vp-play" type="button" aria-label="Play the caller's line"><span aria-hidden="true">▶</span> Play</button>
      <audio preload="none" src="${esc(b.voice)}"></audio>` : "";
    const transcript = beats.slice(0, bi).map((pb, i) => {
      const chosen = pb.options[picks[i]];
      return bubble("them", call.from || "Caller", pb.say) + (chosen ? bubble("you", "You", chosen.text) : "");
    }).join("");
    let ask = "";
    if (!answeredThis) {
      ask = `<div class="vp-ask"><p class="vp-prompt">${gl(b.ask)}</p>
        <div class="vp-options" role="group" aria-label="Your reply">${b.options.map((o, i) =>
          `<button class="vp-opt" type="button" data-i="${i}">${gl(o.text)}</button>`).join("")}</div></div>`;
    } else {
      const chosen = b.options[picks[bi]], r = beatResult(b, picks[bi]);
      ask = bubble("you", "You", chosen.text)
        + `<div class="vp-feedback ${r.safe ? "ok" : "bad"}" role="status"><span class="vp-fi" aria-hidden="true">${r.safe ? "✓" : "⚠"}</span>
            <div><p>${gl(r.feedback)}</p>${r.safe ? `<p class="vp-flag">Red flag spotted: <b>${gl(b.flag)}</b></p>` : (r.risk ? `<p class="vp-risk">What that would give away: ${gl(r.risk)}</p>` : "")}</div></div>
          <div class="vp-next"><button class="btn brand" type="button" id="vp-next">${bi < beats.length - 1 ? "Next →" : "End the call"}</button></div>`;
    }
    $("vp-screen").innerHTML = `<div class="vp-call-head slim"><span class="vp-av sm" aria-hidden="true">${esc(initials)}</span>
        <div class="vp-id"><b>${esc(call.from || "Caller")}</b><span class="vp-live">● on call · line ${bi + 1} of ${beats.length}</span></div></div>
      <div class="vp-transcript" id="vp-transcript" aria-live="polite">${transcript}${bubble("them", call.from || "Caller", b.say, playBtn)}${ask}</div>`;
    const pb = $("vp-screen").querySelector(".vp-play");
    if (pb) pb.onclick = () => { const a = pb.parentElement.querySelector("audio"); if (a) { a.currentTime = 0; a.play().catch(() => {}); } };
    $("vp-screen").querySelectorAll(".vp-opt").forEach(btn => btn.onclick = () => { picks[bi] = +btn.dataset.i; onPart(bi); renderProg(); renderSide(); renderCall(); });
    const nx = $("vp-next"); if (nx) nx.onclick = () => { if (bi < beats.length - 1) { bi++; renderCall(); } else { phase = "ended"; renderEnded(); } };
    const tr = $("vp-transcript"); if (tr && !reduced) tr.scrollTop = tr.scrollHeight;
  }

  function renderEnded() {
    $("vp-phone").dataset.phase = "ended";
    const s = summary(beats, picks);
    $("vp-screen").innerHTML = `<div class="vp-safe-end"><h2>${s.safe ? "Call handled safely ✓" : "Call ended"}</h2>
      <p>You caught <b>${s.caught} of ${s.total}</b> red flags.</p>
      <div class="vp-calls"><button class="vp-btn answer" type="button" id="vp-replay">↺ Take the call again</button></div></div>`;
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

  function reset() { phase = "ringing"; bi = 0; picks = []; onReset(); $("vp-debrief").hidden = true; renderProg(); renderSide(); renderRinging(); }

  renderProg(); renderSide(); renderRinging();
}
