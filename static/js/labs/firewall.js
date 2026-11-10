// "You Are the Packet": a small, clear firewall lab. Rules are checked top-down and the first match decides allow or
// deny. You predict, then watch the packet tested against each rule in turn and the gate open or slam. The matcher and
// evaluator are pure and tested (tests/firewall.test.mjs); mount() is the on-page gauntlet.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- pure engine ---
export const ipToInt = ip => ip.split(".").reduce((a, o) => (a * 256 + (+o)) >>> 0, 0);
// Does an address sit inside a rule's source/destination? "any", an exact IP, or CIDR (10.0.0.0/24).
export function inCidr(ip, cidr) {
  if (cidr === "any" || cidr == null) return true;
  if (!String(cidr).includes("/")) return ip === cidr;
  const [net, bitsStr] = cidr.split("/");
  const bits = +bitsStr, mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
}
// Does a packet match one rule's 5-tuple? Any field can be "any".
export function matchRule(rule, p) {
  return (rule.proto === "any" || rule.proto === p.proto)
    && inCidr(p.src, rule.src)
    && inCidr(p.dst, rule.dst)
    && (rule.port === "any" || String(rule.port) === String(p.port));
}
// Walk the rules top-down; first match wins. No match → the implicit default deny.
export function evaluate(p, rules) {
  const trace = [];
  for (let i = 0; i < rules.length; i++) {
    const matched = matchRule(rules[i], p);
    trace.push({ i, matched });
    if (matched) return { action: rules[i].action, index: i, rule: rules[i], trace, defaulted: false };
  }
  return { action: "deny", index: -1, rule: null, trace, defaulted: true };
}
// Grade a learner's ruleset against a set of test packets with known expected outcomes.
export function gradeFirewall(rules, tests) {
  const results = tests.map(t => { const r = evaluate(t, rules); return { ...t, got: r.action, index: r.index, defaulted: r.defaulted, ok: r.action === t.expected }; });
  return { results, right: results.filter(r => r.ok).length, total: tests.length, pass: results.every(r => r.ok) };
}

const PROTO = { tcp: "TCP", udp: "UDP", icmp: "ICMP", any: "any" };
const ruleText = r => `${PROTO[r.proto] || r.proto} ${r.src} → ${r.dst}:${r.port}`;

// The on-page lab: predict, then watch the packet drop down the rules and the gate decide.
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const rules = lab.rules, packets = lab.packets, server = lab.server;
  const sent = new Set(solved);          // packet indices already run
  let pi = packets.findIndex((_, i) => !sent.has(i)); if (pi < 0) pi = 0;
  let phase = "idle", predicted = null, correctPredicts = 0, picks = {};
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const delay = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));

  root.innerHTML = `<div class="fwg-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="fwg-prog"></div>
    <section class="panel fwg-brief" id="fwg-brief" aria-live="polite"></section>
    <section class="fwg-board">
      <div class="fwg-shaft" id="fwg-shaft">
        <div class="fwg-you" id="fwg-you"><span class="fwg-chip" id="fwg-chip"></span></div>
        <ol class="fwg-rules" id="fwg-rules" aria-label="Firewall rules, checked top to bottom">${rules.map((r, i) =>
          `<li class="fwg-rule" data-i="${i}"><div class="fwg-beam"><span class="fwg-rn">${i + 1}</span><span class="fwg-act ${esc(r.action)}">${r.action === "allow" ? "ALLOW" : "DENY"}</span><span class="fwg-tuple">${esc(ruleText(r))}</span></div><span class="fwg-gatelet" data-state="idle" aria-hidden="true"><i></i><i></i></span><span class="fwg-note">${esc(r.note || "")}</span></li>`).join("")}</ol>
        <div class="fwg-floor" id="fwg-dest"><span class="eyebrow">Server</span> <b>${esc(server.name)}</b> <span class="mono">${esc(server.ip)}</span></div>
      </div>
    </section>
    <div class="fwg-actions" id="fwg-actions"></div>
    <section class="panel fwg-result" id="fwg-result" hidden aria-live="polite"></section>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const pkt = () => packets[pi];
  const ruleEl = i => $("fwg-rules").querySelector(`[data-i="${i}"]`);

  function renderProg() {
    $("fwg-prog").innerHTML = packets.map((p, i) => `<span class="pchip">${sent.has(i) ? "✓" : "○"} ${i + 1}</span>`).join("")
      + `<span class="pchip ghost">${sent.size}/${packets.length} sent</span>`;
  }
  function renderChip() {
    const p = pkt();
    $("fwg-chip").className = "fwg-chip" + (p.threat ? " threat" : "");
    $("fwg-chip").innerHTML = `<span class="fwg-cl">PACKET</span> <span class="fwg-cip">${esc(p.src)} → ${esc(p.dst)}:${esc(String(p.port))}</span> <span class="fwg-cpp">${esc(PROTO[p.proto] || p.proto)}</span>`;
  }
  function renderBrief() {
    const p = pkt();
    $("fwg-brief").innerHTML = `<div class="eyebrow">Packet ${pi + 1} of ${packets.length}</div><h2>${esc(p.label)}</h2>
      <p class="muted">You are this packet. The firewall checks its rules from the top; the first that matches you decides. Predict, then send yourself in.</p>`;
  }
  function renderActions() {
    if (phase === "flying") { $("fwg-actions").innerHTML = ""; return; }
    const backBtn = pi > 0 ? `<button class="btn ghost" type="button" id="fwg-back">← Back</button>` : "";
    if (phase === "done") {
      const moreAfter = pi < packets.length - 1;
      $("fwg-actions").innerHTML = backBtn
        + (moreAfter ? `<button class="btn brand" type="button" id="fwg-next">Next packet →</button>` : "")
        + `<button class="btn ghost" type="button" id="fwg-reset">↺ Reset lab</button>`;
      if ($("fwg-next")) $("fwg-next").onclick = next;
    } else {
      $("fwg-actions").innerHTML = `<div class="fwg-predict" role="group" aria-label="Predict the outcome">
          <span class="eyebrow">Your call</span>
          <button class="btn ghost fwg-guess" type="button" data-g="allow" aria-pressed="${predicted === "allow"}">Allowed</button>
          <button class="btn ghost fwg-guess" type="button" data-g="deny" aria-pressed="${predicted === "deny"}">Denied</button>
        </div>
        <button class="btn brand" type="button" id="fwg-send">Send me through ↓</button>
        ${backBtn}<button class="btn ghost" type="button" id="fwg-reset">↺ Reset lab</button>`;
      $("fwg-actions").querySelectorAll(".fwg-guess").forEach(b => b.onclick = () => { predicted = b.dataset.g; $("fwg-actions").querySelectorAll(".fwg-guess").forEach(x => x.setAttribute("aria-pressed", x.dataset.g === predicted)); });
      $("fwg-send").onclick = send;
    }
    if ($("fwg-back")) $("fwg-back").onclick = back;
    if ($("fwg-reset")) $("fwg-reset").onclick = reset;
  }
  function clearMarks() {
    $("fwg-rules").querySelectorAll(".fwg-rule").forEach(el => {
      el.classList.remove("checking", "nomatch", "hit-allow", "hit-deny", "unrun");
      el.querySelector(".fwg-gatelet")?.setAttribute("data-state", "idle");
    });
    $("fwg-chip").classList.remove("live");
  }
  function place(el) {
    const you = $("fwg-you");
    if (!el) { you.style.top = "8px"; return; }
    you.style.top = (el.offsetTop + Math.max(8, (el.offsetHeight - you.offsetHeight) / 2)) + "px";
  }

  async function send() {
    if (phase !== "idle") return;
    phase = "flying"; renderActions();
    const res = evaluate(pkt(), rules);
    clearMarks(); $("fwg-chip").classList.add("live");
    place(null);
    await delay(280);
    const last = res.index < 0 ? rules.length - 1 : res.index;
    for (let i = 0; i <= last; i++) {
      const el = ruleEl(i); if (!el) continue;
      place(el);
      el.classList.add("checking");
      await delay(420);
      el.classList.remove("checking");
      const hit = i === res.index;
      el.classList.add(hit ? (res.action === "allow" ? "hit-allow" : "hit-deny") : "nomatch");
      el.querySelector(".fwg-gatelet")?.setAttribute("data-state", hit ? (res.action === "allow" ? "open" : "deny") : "pass");
      if (hit) break;
    }
    for (let i = last + 1; i < rules.length; i++) ruleEl(i)?.classList.add("unrun");
    await delay(reduced ? 0 : 420);
    finish(res);
  }

  // The verdict panel for a packet; reused by finish() and by Back/Next review.
  function resultHtml(res, p) {
    const right = res.action === p.expected, pick = picks[pi];
    let guessLine = "";
    if (pick) { const pc = pick === res.action;
      guessLine = `<p class="${pc ? "fwg-pass" : "fwg-fail"}">${pc ? "Good call" : "Not what you guessed"}, you said it would be <b>${pick === "allow" ? "allowed" : "denied"}</b>.</p>`; }
    const r = res.rule;
    const decideLine = r
      ? `<p><b>Rule ${res.index + 1}</b> (${r.action === "allow" ? "ALLOW" : "DENY"} <span class="mono">${esc(ruleText(r))}</span>) is the first rule that matches you, so it decides. ${esc(r.note || "")}</p>`
      : `<p>No rule matched you, so the firewall’s <b>default deny</b> blocks you. A packet that no rule allows does not get through.</p>`;
    return `<div class="panel-title"><h2>${res.action === "allow" ? "Allowed in ✓" : "Blocked ✕"}</h2></div>
      ${guessLine}${decideLine}
      ${right ? "" : `<p class="muted">On a real network you’d expect this one to be <b>${p.expected === "allow" ? "allowed" : "denied"}</b>, worth a second look at the rules.</p>`}`;
  }

  function finish(res) {
    phase = "done";
    const p = pkt(); picks[pi] = predicted;
    const firstTime = !sent.has(pi);
    if (firstTime) { sent.add(pi); onPart(pi); if (predicted && predicted === res.action) correctPredicts++; }
    const done = sent.size >= packets.length;
    $("fwg-result").innerHTML = resultHtml(res, p)
      + (done ? `<p class="fwg-done">You’ve run every packet${correctPredicts ? ` and called ${correctPredicts}/${packets.length} right` : ""}. That’s how a firewall reads its rules: top to bottom, first match wins.</p>` : "");
    $("fwg-result").hidden = false;
    renderProg(); renderActions();
    if (done) onComplete();
    const patch = globalThis.PN_patch;
    if (patch && firstTime) {
      if (done) patch(`Every packet judged. Top to bottom, first match wins. You’ve got it.`, 6500);
      else if (res.action === "deny" && p.threat) patch(`Woah woah, ${p.src} knocking on :${p.port}? Denied. Not getting past me, buddy.`, 6500);
    }
    $("fwg-result").scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  // Render the current packet: a run packet shows its verdict for review (no animation); an un-run one is ready to play.
  function showPacket() {
    const p = pkt();
    predicted = picks[pi] ?? null;
    clearMarks(); renderBrief(); renderChip();
    if (sent.has(pi)) {
      phase = "done";
      const res = evaluate(p, rules);
      const last = res.index < 0 ? rules.length - 1 : res.index;
      for (let i = 0; i < rules.length; i++) {
        const el = ruleEl(i); if (!el) continue;
        if (i < last) { el.classList.add("nomatch"); el.querySelector(".fwg-gatelet")?.setAttribute("data-state", "pass"); }
        else if (i === res.index) { el.classList.add(res.action === "allow" ? "hit-allow" : "hit-deny"); el.querySelector(".fwg-gatelet")?.setAttribute("data-state", res.action === "allow" ? "open" : "deny"); place(el); }
        else el.classList.add("unrun");
      }
      $("fwg-result").innerHTML = resultHtml(res, p); $("fwg-result").hidden = false;
    } else {
      phase = "idle"; $("fwg-result").hidden = true; place(null);
    }
    renderActions();
  }
  function next() { pi = Math.min(packets.length - 1, pi + 1); showPacket(); }
  function back() { pi = Math.max(0, pi - 1); showPacket(); }
  function reset() {
    sent.clear(); picks = {}; pi = 0; phase = "idle"; predicted = null; correctPredicts = 0;
    $("fwg-result").hidden = true; clearMarks(); onReset();
    renderProg(); renderBrief(); renderChip(); renderActions();
  }

  renderProg(); renderBrief(); renderChip(); renderActions();
}
