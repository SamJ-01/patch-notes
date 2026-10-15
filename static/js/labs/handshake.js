// TCP handshake & SYN flood: a visual, clickable model of the three-way handshake and how a SYN flood
// fills a server's half-open connection queue until real users can't get in — and how SYN cookies defend it.
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
  let flooding = false, timer = null, busy = false;
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
    $("hs-queue").innerHTML = `<div class="eyebrow">Server half-open queue (${s.halfOpen}/${s.slots})</div>
      <div class="hs-slots">${s.backlog.map(k => `<span class="hs-slot ${k || "empty"}"></span>`).join("")}</div>`;
    $("hs-stats").innerHTML = `<div><dt>Connections made</dt><dd class="ok">${s.established}</dd></div><div><dt>Refused (queue full)</dt><dd class="${s.dropped ? "no" : ""}">${s.dropped}</dd></div><div><dt>SYN cookies</dt><dd>${s.cookies ? "on" : "off"}</dd></div>`;
    $("hs-flood").classList.toggle("brand", !flooding && done.has("handshake"));
    $("hs-flood").textContent = flooding ? "2 · Stop the flood" : "2 · Launch a SYN flood";
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
        <animateMotion dur="0.75s" path="${PATHS[route]}" fill="freeze" calcMode="linear"/>`;
      svg.appendChild(g);
      setTimeout(() => { g.remove(); resolve(); }, 760);
    });
  }

  async function normalConnection() {
    if (busy) return; busy = true;
    status("<b>SYN</b> → you ask the server to open a connection.");
    await packet("client-server", "SYN");
    status("<b>SYN-ACK</b> ← the server agrees and holds a half-open slot.");
    srv.state.backlog;  // (visual only)
    await packet("server-client", "SYN-ACK", "good");
    status("<b>ACK</b> → you confirm. The connection is established.");
    await packet("client-server", "ACK");
    srv.syn("client"); drawQueue();
    status("<b class='ok'>Connected.</b> A normal handshake is three messages: SYN, SYN-ACK, ACK.");
    markPart("handshake"); busy = false;
  }

  async function floodBurst() {
    if (busy) return;  // a manual connection is animating: pause so the queue (and the status line) hold still
    // Several forged SYNs arrive; the server answers each and holds a slot, but no ACK ever comes back.
    for (let n = 0; n < 3 && flooding; n++) {
      const before = srv.state.full;
      const r = srv.syn("flood");
      if (!reduced) packet("attacker-server", "SYN", "bad");
      drawQueue();
      if (r === "dropped" && !before) { /* just filled */ }
      await wait(120);
    }
    srv.tick(); drawQueue();
    if (srv.state.full && !srv.state.cookies) { status("<b class='no'>The half-open queue is full.</b> New SYNs are being refused. Try connecting now (button 3)."); markPart("flood"); }
    else if (srv.state.cookies) status("SYN cookies are on: the server answers without holding a slot, so the queue stays empty.");
    else status("A SYN flood is filling the server's half-open queue…");
  }

  async function clientDuringFlood() {
    if (busy) return; busy = true;
    status("<b>SYN</b> → you try to connect…");
    await packet("client-server", "SYN");
    const r = srv.syn("client"); drawQueue();
    if (r === "connect" || r === "cookie-connect") {
      await packet("server-client", "SYN-ACK", "good");
      status("<b class='ok'>You got through.</b> " + (srv.state.cookies ? "SYN cookies kept a slot free for you." : "There was still room in the queue — flood a bit more and try again."));
    } else {
      await packet("server-client", "RST", "bad");
      status("<b class='no'>Connection refused.</b> The queue is full of half-open flood connections, so your SYN was dropped. This is the denial of service. Now turn on SYN cookies (button 4).");
    }
    busy = false;
  }

  $("hs-connect").addEventListener("click", normalConnection);
  $("hs-client").addEventListener("click", clientDuringFlood);
  $("hs-flood").addEventListener("click", () => {
    flooding = !flooding;
    drawQueue();
    if (flooding) { status("Flood started. Watch the queue fill."); timer = setInterval(floodBurst, 500); }
    else { clearInterval(timer); timer = null; status("Flood stopped. Half-open slots will time out and free up."); }
  });
  $("hs-cookies").addEventListener("change", e => {
    srv.setCookies(e.target.checked); drawQueue();
    if (e.target.checked) { markPart("defend"); status("<b class='ok'>SYN cookies on.</b> The server now replies without reserving a slot. Try connecting during the flood (button 3) — it works."); }
    else status("SYN cookies off.");
  });
  $("hs-reset").addEventListener("click", () => { flooding = false; clearInterval(timer); timer = null; srv.reset(); $("hs-cookies").checked = false; srv.setCookies(false); onReset(); });

  // Keep the timer from running after the user leaves the lab.
  const stop = () => { if (!root.isConnected) { clearInterval(timer); } };
  setInterval(stop, 2000);

  drawParts(); drawQueue();
  status("Start with button 1 to see a normal three-way handshake.");
}
