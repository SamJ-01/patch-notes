// TCP handshake & SYN flood: a visual, clickable model of the three-way handshake and how a SYN flood
// fills a server's half-open connection queue until real users can't get in, and how SYN cookies defend it.
// The model (createServer) is pure and tested in tests/labs.test.mjs; mount() is the on-page interactive.
import { hw } from "../hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A server's backlog is a small queue of half-open connections (SYN received, waiting for the final ACK).
// Each half-open slot is held for holdTicks before the server gives up. With SYN cookies on, the server
// encodes the state in its reply instead of holding a slot, so the queue never fills.
export function createServer({ slots = 8, holdTicks = 8 } = {}) {
  let backlog = Array(slots).fill(null);  // null | { kind: "flood"|"client", ttl }
  let cookies = false, established = 0, dropped = 0;
  const free = () => backlog.indexOf(null);
  const halfOpen = () => backlog.filter(Boolean).length;

  return {
    get state() { return { slots, backlog: backlog.map(s => s && s.kind), halfOpen: halfOpen(), full: free() < 0, cookies, established, dropped }; },
    setCookies(on) { cookies = !!on; },
    reset() { backlog = Array(slots).fill(null); established = 0; dropped = 0; },
    // A SYN arrives. Returns what happened so the UI can animate it.
    syn(kind) {
      if (cookies) {
        if (kind === "client") established++;  // real client completes; flood SYNs cost the server nothing
        return cookies && kind === "client" ? "cookie-connect" : "cookie-ignore";
      }
      const k = free();
      if (k < 0) { dropped++; return "dropped"; }          // queue full: the SYN is refused
      backlog[k] = { kind, ttl: holdTicks };
      if (kind === "client") { backlog[k] = null; established++; return "connect"; }  // real client sends the final ACK at once
      return "half-open";                                    // flood SYN: nobody will ever send the ACK
    },
    // Time passes: half-open connections time out and free their slot.
    tick() { backlog = backlog.map(s => (s && --s.ttl <= 0 ? null : s)); },
  };
}

const PATHS = {  // packet routes between the three devices in the scene
  "client-server": "M70 150 L330 150", "server-client": "M330 150 L70 150",
  "attacker-server": "M70 46 L330 150", "server-attacker": "M330 150 L70 46",
};

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const srv = createServer(lab);
  const done = new Set(solved);
  let flooded = false, busy = false, hsStep = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  root.innerHTML = `<div class="hs">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="hs-parts"></div>
    <div class="hs-grid">
      <section class="panel">
        <div class="stage-box"><svg viewBox="0 0 400 200" id="hs-svg" role="img" aria-label="An attacker, a client and a server, with the server's connection queue"></svg></div>
        <p class="hs-status" id="hs-status" aria-live="polite"></p>
      </section>
      <aside class="panel hs-ctl">
        <h2>Try it</h2>
        <div class="stack" style="gap:8px">
          <button class="btn brand" id="hs-connect" type="button">1 · Make a normal connection</button>
          <button class="btn" id="hs-flood" type="button">2 · Launch a SYN flood</button>
          <button class="btn" id="hs-client" type="button">3 · Try to connect during the flood</button>
          <label class="m-toggle"><input type="checkbox" id="hs-cookies"> 4 · Turn on SYN cookies (the defence)</label>
          <button class="btn ghost" id="hs-reset" type="button">↺ Reset</button>
        </div>
        <div class="hs-queue" id="hs-queue" aria-live="polite"></div>
        <dl class="hs-stats" id="hs-stats"></dl>
      </aside>
    </div>
    <details class="panel hs-explain"><summary>What am I looking at?</summary>
      <p>A TCP connection starts with a <b>three-way handshake</b>: the client sends <b>SYN</b>, the server replies <b>SYN-ACK</b> and holds a half-open slot, and the client finishes with <b>ACK</b>. A <b>SYN flood</b> sends SYNs from forged addresses and never sends the final ACK, so the server's half-open queue fills with connections that never complete. Once it's full, real users are turned away. <b>SYN cookies</b> let the server reply without holding a slot, so the queue can't be exhausted.</p></details>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const svg = $("hs-svg");

  svg.innerHTML = `
    <line class="hs-wire" x1="70" y1="150" x2="330" y2="150"/>
    <g>${hw("attacker", 46, 46, 0.72)}<text class="hs-lbl" x="46" y="82">Attacker</text></g>
    <g>${hw("laptop", 46, 150, 0.72)}<text class="hs-lbl" x="46" y="184">You</text></g>
    <g>${hw("server", 354, 150, 0.8)}<text class="hs-lbl" x="354" y="188">Server</text></g>`;

  function drawParts() {
    const parts = [["handshake", "See a handshake"], ["flood", "Fill the queue"], ["defend", "Defend with SYN cookies"]];
    $("hs-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(t)}</span>`).join("");
  }
  function markPart(k) { if (done.has(k)) return; done.add(k); onPart(k); drawParts(); if (["handshake", "flood", "defend"].every(x => done.has(x))) onComplete(); }

  function drawQueue() {
    const s = srv.state;
    // Show the queue filling from the left so it reads as a queue, not scattered slots.
    $("hs-queue").innerHTML = `<div class="eyebrow">Server half-open queue (${s.halfOpen}/${s.slots})</div>
      <div class="hs-slots">${Array.from({ length: s.slots }, (_, i) => `<span class="hs-slot ${i < s.halfOpen ? "flood" : "empty"}"></span>`).join("")}</div>`;
    $("hs-stats").innerHTML = `<div><dt>Connections made</dt><dd class="ok">${s.established}</dd></div><div><dt>Refused</dt><dd class="${s.dropped ? "no" : ""}">${s.dropped}</dd></div><div><dt>SYN cookies</dt><dd>${s.cookies ? "on" : "off"}</dd></div>`;
    const btn = $("hs-flood");
    btn.classList.toggle("brand", !flooded && done.has("handshake") && !srv.state.cookies);
    btn.disabled = flooded && !srv.state.cookies;
    btn.textContent = flooded && !srv.state.cookies ? "2 · Queue is full" : "2 · Launch a SYN flood";
  }
  const status = msg => { $("hs-status").innerHTML = msg; };
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));

  // Animate one packet along a route; label is the flag (SYN, SYN-ACK, ACK, RST).
  function packet(route, label, tone = "") {
    return new Promise(resolve => {
      if (reduced) return resolve();
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `hs-pkt ${tone}`);
      g.innerHTML = `<rect x="-22" y="-10" width="44" height="20" rx="4"/><text x="0" y="4">${esc(label)}</text>
        <animateMotion dur="1.05s" path="${PATHS[route]}" fill="freeze" calcMode="linear"/>`;
      svg.appendChild(g);
      setTimeout(() => { g.remove(); resolve(); }, 1060);
    });
  }

  // The three-way handshake, one message per click so you can watch each step at your own pace.
  const HS_STEPS = [
    { route: "client-server", label: "SYN", tone: "", pre: "<b>SYN</b> → you ask the server to open a connection." },
    { route: "server-client", label: "SYN-ACK", tone: "good", pre: "<b>SYN-ACK</b> ← the server agrees and holds a half-open slot." },
    { route: "client-server", label: "ACK", tone: "", pre: "<b>ACK</b> → you confirm, completing the handshake." },
  ];
  function updateConnectBtn() {
    const b = $("hs-connect");
    b.textContent = hsStep === 0 ? "1 · Send SYN ›" : hsStep === 1 ? "Send SYN-ACK ›" : hsStep === 2 ? "Send ACK ›" : "↺ Replay handshake";
    b.classList.toggle("brand", hsStep === 0 && !done.has("handshake"));
  }
  async function handshakeStep() {
    if (busy) return; busy = true;
    if (hsStep >= HS_STEPS.length) hsStep = 0;  // replay from the start
    const s = HS_STEPS[hsStep];
    status(s.pre);
    await packet(s.route, s.label, s.tone);
    hsStep++;
    if (hsStep === HS_STEPS.length) {
      srv.syn("client"); drawQueue();
      status("<b class='ok'>Connected.</b> A normal handshake is three messages: SYN, SYN-ACK, ACK.");
      markPart("handshake");
    }
    updateConnectBtn(); busy = false;
  }

  // A burst of forged SYNs arrives. The server holds a slot for each and waits for an ACK that never comes,
  // so the queue fills and stays full. With SYN cookies on, the server holds nothing and the queue stays empty.
  async function launchFlood() {
    if (busy || flooded) return; busy = true;
    if (srv.state.cookies) {
      status("Flooding… but SYN cookies are on, so the server holds no slots. The queue stays empty.");
      for (let n = 0; n < 4; n++) { srv.syn("flood"); if (!reduced) packet("attacker-server", "SYN", "bad"); await wait(170); }
      busy = false; return;
    }
    status("A SYN flood is filling the server's half-open queue…");
    const n = srv.state.slots;
    for (let i = 0; i < n; i++) {
      srv.syn("flood");
      if (!reduced) packet("attacker-server", "SYN", "bad");
      drawQueue();
      await wait(reduced ? 0 : 250);
    }
    flooded = true; drawQueue();
    status("<b class='no'>The half-open queue is full.</b> Every slot holds a forged connection that will never finish, so new SYNs are refused. Try to connect now (button 3).");
    markPart("flood"); busy = false;
  }

  async function clientDuringFlood() {
    if (busy) return; busy = true;
    status("<b>SYN</b> → you try to connect…");
    await packet("client-server", "SYN");
    const r = srv.syn("client"); drawQueue();
    if (r === "connect" || r === "cookie-connect") {
      await packet("server-client", "SYN-ACK", "good");
      status("<b class='ok'>You got through.</b> " + (srv.state.cookies ? "SYN cookies mean the server never ran out of room for you." : "The queue wasn't full yet. Launch the flood (button 2) first."));
    } else {
      await packet("server-client", "RST", "bad");
      srv.state.dropped;  // a refused real client
      status("<b class='no'>Connection refused.</b> The queue is full of half-open flood connections, so your SYN is dropped. That's the denial of service. Now turn on SYN cookies (button 4).");
    }
    busy = false;
  }

  $("hs-connect").addEventListener("click", handshakeStep);
  $("hs-client").addEventListener("click", clientDuringFlood);
  $("hs-flood").addEventListener("click", launchFlood);
  $("hs-cookies").addEventListener("change", e => {
    srv.setCookies(e.target.checked);
    if (e.target.checked) { srv.reset(); flooded = false; drawQueue(); markPart("defend"); status("<b class='ok'>SYN cookies on.</b> The server replies without reserving a slot, so the queue drains and can't be exhausted. Launch the flood again (the queue stays empty) then connect (button 3)."); }
    else { drawQueue(); status("SYN cookies off."); }
  });
  $("hs-reset").addEventListener("click", () => { flooded = false; hsStep = 0; srv.reset(); $("hs-cookies").checked = false; srv.setCookies(false); drawQueue(); updateConnectBtn(); onReset(); status("Reset. Start with button 1."); });

  drawParts(); drawQueue(); updateConnectBtn();
  status("Start with button 1 and click to send each message (SYN, then SYN-ACK, then ACK) one step at a time.");
}
