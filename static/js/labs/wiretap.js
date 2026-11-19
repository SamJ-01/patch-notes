// Telnet vs SSH: watch a login travel across the network and see what an eavesdropper on the wire captures.
// Telnet (port 23) sends everything in clear text; SSH (port 22) encrypts it. The capture panel makes the
// difference obvious. encrypt()/capture() are pure (tested in tests/labs.test.mjs); mount() is the interactive.
import { hw } from "../hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A deterministic, reversible-looking scramble so SSH "ciphertext" looks like random hex but is stable per run.
export function encrypt(text, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return [...text].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, "0")).join(" ");
}
// What the sniffer sees for a line sent over a protocol.
export function capture(protocol, line, seed) {
  return protocol === "ssh" ? encrypt(line, seed) : line;
}

const SESSION = [
  { who: "client", send: "login: admin", note: "your username" },
  { who: "client", send: "password: Sup3rSecret!", note: "your password" },
  { who: "server", send: "Welcome to web-01", note: "the server's banner" },
  { who: "client", send: "cat /etc/passwd", note: "a command you run" },
];

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved);
  let protocol = "telnet", running = false, tapStep = 0, tapSeed = (Date.now() % 100000) + 1;
  const tapLines = [];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  root.innerHTML = `<div class="tap">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="tap-parts"></div>
    <section class="panel">
      <div class="panel-title"><h2>Log in over <span id="tap-proto">Telnet</span></h2>
        <div class="row" role="group" aria-label="Protocol">
          <button class="chip" data-proto="telnet" aria-pressed="true">Telnet · port 23</button>
          <button class="chip" data-proto="ssh" aria-pressed="false">SSH · port 22</button></div></div>
      <div class="stage-box room-box"><svg viewBox="0 -8 420 168" id="tap-svg" role="img" aria-label="A client and a server with an eavesdropper tapping the wire between them"></svg></div>
      <div class="row"><button class="btn brand" id="tap-go" type="button">Send the login and a command</button></div>
    </section>
    <section class="panel tap-sniff">
      <div class="panel-title"><h2>What the eavesdropper captured</h2><span class="eyebrow" id="tap-verdict"></span></div>
      <pre class="tap-capture" id="tap-capture" aria-live="polite" tabindex="0">(nothing yet: send a login)</pre>
    </section>
    <details class="panel"><summary>Why this matters</summary>
      <p class="muted" style="max-width:72ch">Telnet and FTP send everything, including your password, as readable text. Anyone who can see the traffic (on the same Wi-Fi, a compromised switch, or a tapped cable) reads it straight off the wire. SSH (and SFTP, and HTTPS) encrypt the session, so a sniffer sees only ciphertext. This is why Telnet should never be used across a network, and why the exam always prefers the encrypted option.</p></details>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const svg = $("tap-svg");
  svg.innerHTML = `
    <line class="tap-wire" x1="70" y1="110" x2="350" y2="110"/>
    <g><ellipse class="room-shadow" cx="46" cy="130" rx="30" ry="4"/>${hw("laptop", 46, 108, 0.92)}<text class="tap-lbl" x="46" y="150">You</text></g>
    <g><ellipse class="room-shadow" cx="374" cy="134" rx="26" ry="4"/>${hw("server", 374, 108, 1)}<text class="tap-lbl" x="374" y="154">Server</text></g>
    <g><ellipse class="room-shadow" cx="210" cy="58" rx="24" ry="3.5"/>${hw("attacker", 210, 40, 0.74)}<text class="tap-lbl" x="210" y="76">Eavesdropper</text><line class="tap-tap" x1="210" y1="62" x2="210" y2="104"/></g>`;

  function drawParts() {
    const parts = [["telnet", "Sniff a Telnet login"], ["ssh", "Sniff an SSH login"], ["compare", "See the difference"]];
    $("tap-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(t)}</span>`).join("");
  }
  function markPart(k) { if (done.has(k)) return; done.add(k); onPart(k); drawParts(); if (done.has("telnet") && done.has("ssh")) markPart("compare"); if (["telnet", "ssh", "compare"].every(x => done.has(x))) onComplete(); }

  // The packet slides along the wire (drawn frame by frame, so it moves in every browser: an <animateMotion> added after
  // the page loads starts "in the past" in Safari and jumps to its end). As it passes under the eavesdropper the tap
  // strikes down onto it, the packet flashes, and a copy rises to the eavesdropper; then the packet carries on.
  function packet(label, tone, fromClient) {
    return new Promise(resolve => {
      const NS = "http://www.w3.org/2000/svg", Y = 110, MID = 210, TOP = 62, from = fromClient ? 70 : 350, to = fromClient ? 350 : 70;
      const short = esc(label.length > 10 ? label.slice(0, 9) + "…" : label);
      const g = document.createElementNS(NS, "g"); g.setAttribute("class", `tap-pkt ${tone}`);
      g.innerHTML = `<rect x="-30" y="-9" width="60" height="18" rx="4"/><text x="0" y="3">${short}</text>`;
      const strike = document.createElementNS(NS, "line"); strike.setAttribute("class", "tap-strike");
      const copy = document.createElementNS(NS, "g"); copy.setAttribute("class", `tap-copy ${tone}`);
      copy.innerHTML = `<rect x="-24" y="-7" width="48" height="14" rx="3"/><text x="0" y="2.5">${short}</text>`;
      svg.append(strike, g, copy);
      const place = (el, x, y, sc = 1, op = 1) => { el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc})`); el.style.opacity = op; };
      const reach = y => { strike.setAttribute("x1", MID); strike.setAttribute("x2", MID); strike.setAttribute("y1", TOP); strike.setAttribute("y2", y.toFixed(1)); };
      const done = () => { g.remove(); strike.remove(); copy.remove(); resolve(); };
      if (reduced) {  // no motion: show the moment of capture, then move on
        place(g, MID, Y); reach(Y - 9); g.classList.add("hit"); place(copy, MID, 46, 0.9, 0.9);
        return setTimeout(done, 900);
      }
      const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2, clamp = t => Math.max(0, Math.min(1, t)), lerp = (a, b, t) => a + (b - a) * t;
      // ms: travel to the tap 0-750, strike 750-880, copy rises 880-1250, strike lifts 1150-1250, travel on 1250-2000.
      place(copy, MID, Y, 1, 0); reach(TOP);
      let t0 = null;
      const frame = now => {
        if (!g.isConnected) return resolve();
        t0 ??= now; const t = now - t0;
        place(g, t < 750 ? lerp(from, MID, ease(t / 750)) : t < 1250 ? MID : lerp(MID, to, ease(clamp((t - 1250) / 750))), Y);
        reach(t < 750 ? TOP : t < 880 ? lerp(TOP, Y - 9, (t - 750) / 130) : t < 1150 ? Y - 9 : lerp(Y - 9, TOP, clamp((t - 1150) / 100)));
        g.classList.toggle("hit", t >= 860 && t < 1200);
        if (t >= 880 && t < 1250) { const k = ease((t - 880) / 370); place(copy, MID, lerp(Y, 44, k), lerp(1, 0.7, k), k < 0.8 ? 1 : (1 - k) * 5); }
        else place(copy, MID, Y, 1, 0);
        if (t >= 2000) return done();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  // Send the login one line at a time, so you can watch each one cross the wire and land in the capture.
  function updateGoBtn() {
    $("tap-go").textContent = tapStep >= SESSION.length ? "↺ Send it again" : `Send: ${SESSION[tapStep].note} ›`;
  }
  function resetCapture() {
    tapStep = 0; tapLines.length = 0; tapSeed = (Date.now() % 100000) + 1;
    $("tap-capture").textContent = protocol === "ssh" ? "(SSH encrypts the session: send a line to see)" : "(Telnet sends clear text: send a line to see)";
    $("tap-verdict").textContent = ""; updateGoBtn();
  }
  async function sendStep() {
    if (running) return; running = true;
    if (tapStep >= SESSION.length) { tapStep = 0; tapLines.length = 0; tapSeed = (Date.now() % 100000) + 1; $("tap-capture").textContent = ""; $("tap-verdict").textContent = ""; }
    const step = SESSION[tapStep];
    await packet(protocol === "ssh" ? "••••••" : step.send, protocol === "ssh" ? "enc" : "clear", step.who === "client");
    tapLines.push(capture(protocol, step.send, tapSeed + tapStep));
    $("tap-capture").textContent = tapLines.join("\n");
    tapStep++;
    if (tapStep >= SESSION.length) {
      if (protocol === "telnet") { $("tap-verdict").innerHTML = '<b class="no">Password stolen.</b>'; markPart("telnet"); }
      else { $("tap-verdict").innerHTML = '<b class="ok">Only ciphertext.</b>'; markPart("ssh"); }
      $("tap-capture").focus({ preventScroll: true });
    }
    updateGoBtn(); running = false;
  }

  $("tap-go").addEventListener("click", sendStep);
  root.querySelector('[data-proto="telnet"]').parentElement.addEventListener("click", e => {
    const b = e.target.closest("[data-proto]"); if (!b || running) return;
    protocol = b.dataset.proto; $("tap-proto").textContent = protocol === "ssh" ? "SSH" : "Telnet";
    root.querySelectorAll("[data-proto]").forEach(x => x.setAttribute("aria-pressed", x === b));
    resetCapture();
  });

  drawParts(); updateGoBtn();
}
