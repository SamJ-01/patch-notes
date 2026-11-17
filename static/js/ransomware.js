// Ransomware, walked across a small network: the attack moves device to device over six days, with a chance to
// catch it at each stop. Then "Stop it": pick two defences and run it again to see where it stops and what was
// already lost. The rules (runAttack) are pure and tested in tests/ransomware.test.mjs; mount() only draws them.
// Fictional organisation and figures; the stages match the lesson and the ransomware-timeline lab.
import { hw } from "./hw.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const BUDGET = 2;  // most small firms can only fund a couple of fixes at once: choosing is the lesson

export const DEFENCES = {
  mfa: { label: "MFA on remote access", short: "MFA", stops: "access" },
  segment: { label: "Network segmentation", short: "Segmentation", stops: "spread" },
  egress: { label: "Alerts on large uploads", short: "Upload alerts", stops: "steal" },
  offline: { label: "Offline backups", short: "Offline backups", stops: null },
  edr: { label: "EDR on the servers", short: "EDR", stops: "encrypt" },
};

// Devices in the picture, left to right. `at` is the x position in the drawing.
export const DEVICES = [
  { id: "attacker", kind: "attacker", label: "Attacker", at: 70 },
  { id: "vpn", kind: "firewall", label: "VPN", at: 230 },
  { id: "laptop", kind: "laptop", label: "Admin laptop", at: 390 },
  { id: "server", kind: "server", label: "File server", at: 550 },
  { id: "backup", kind: "db", label: "Backups", at: 710 },
];

export const STAGES = [
  { id: "access", device: "vpn", when: "Day 1, 22:14", title: "Logs in with a stolen password",
    text: "A password reused from another site's breach works on the VPN. There's no second factor, so it's straight in.",
    stop: "MFA on every remote access point would have asked for a second factor the attacker didn't have.", by: "mfa" },
  { id: "spread", device: "laptop", when: "Days 1 to 6", title: "Spreads quietly for days",
    text: "Using an admin's laptop, the attacker maps the network and finds the file server. Nothing looks broken yet.",
    stop: "Segmentation keeps remote users away from the servers they don't need, so the trail ends here.", by: "segment" },
  { id: "steal", device: "server", when: "Day 6, 03:20", title: "Copies 41 GB of files out",
    text: "Client files are uploaded to the attacker's cloud storage first, so they can threaten to leak them (double extortion).",
    stop: "An alert on unusually large uploads at 3am gets someone to cut the connection.", by: "egress" },
  { id: "backups", device: "backup", when: "Day 6, 03:55", title: "Deletes the backups it can reach",
    text: "Backups on the network are wiped, so the victim can't simply restore.",
    stop: "Offline backups can't be reached from the network, so they survive (they don't stop the attack).", by: "offline" },
  { id: "encrypt", device: "server", when: "Day 6, 04:10", title: "Encrypts the files, leaves a ransom note",
    text: "Thousands of files are renamed and locked in minutes, and a note demands payment.",
    stop: "EDR spots one process changing thousands of files and kills it within seconds.", by: "edr" },
];

// Run the attack against the chosen defences (at most BUDGET; unknown ones ignored). Each stage is "done",
// "blocked" (a defence stopped the attack there), "survived" (offline backups: the stage ran but did no harm) or
// "never" (after a block). The outcome says what was already lost.
export function runAttack(chosen = []) {
  const set = new Set([...new Set(chosen)].filter(k => DEFENCES[k]).slice(0, BUDGET));
  const steps = [], lost = { stolen: false, backups: false, encrypted: false };
  let stoppedAt = null;
  for (const st of STAGES) {
    if (stoppedAt) { steps.push({ id: st.id, state: "never" }); continue; }
    if (st.by !== "offline" && set.has(st.by)) { steps.push({ id: st.id, state: "blocked", by: st.by }); stoppedAt = st.id; continue; }
    if (st.id === "backups" && set.has("offline")) { steps.push({ id: st.id, state: "survived", by: "offline" }); continue; }
    steps.push({ id: st.id, state: "done" });
    if (st.id === "steal") lost.stolen = true;
    if (st.id === "backups") lost.backups = true;
    if (st.id === "encrypt") lost.encrypted = true;
  }
  const leak = lost.stolen ? " The 41 GB already stolen can still be leaked, so it's a data breach to report too." : "";
  let outcome;
  if (stoppedAt === "access" || stoppedAt === "spread") outcome = { kind: "stopped", title: "Stopped early", text: `Caught before any data left or a file was touched. This is where defences pay off most.` };
  else if (stoppedAt) outcome = { kind: "stopped", title: "Stopped, but late", text: `The attack was caught at "${STAGES.find(s => s.id === stoppedAt).title.toLowerCase()}".${lost.backups ? " The online backups were already gone." : ""}${leak}` };
  else if (set.has("offline")) outcome = { kind: "recovered", title: "Encrypted, but recoverable", text: `Every file was locked, but you restore from the offline backups in about two days without paying.${leak}` };
  else outcome = { kind: "lost", title: "Encrypted, no backups", text: `Files locked, backups gone, and the business stops. The choices left are rebuilding from scratch or the ransom.${leak}` };
  return { chosen: [...set], steps, stoppedAt, lost, outcome };
}

// Which devices look compromised once `upto` stages have played (index into steps), for the picture.
export function deviceStates(run, upto) {
  const state = {};
  run.steps.slice(0, upto + 1).forEach((s, i) => {
    const st = STAGES[i];
    if (s.state === "done") state[st.device] = st.id === "encrypt" ? "locked" : st.id === "backups" ? "wiped" : "bad";
    else if (s.state === "blocked") state[st.device] = state[st.device] || "guarded";
    else if (s.state === "survived") state[st.device] = "safe";
  });
  return state;
}

export function mount(el, { head = true } = {}) {
  let chosen = [], run = runAttack([]), i = 0;
  const lastIndex = () => (run.stoppedAt ? STAGES.findIndex(s => s.id === run.stoppedAt) : STAGES.length - 1);
  el.innerHTML = `<figure class="xpl rw">
    ${head ? `<div class="xpl-head"><div class="eyebrow">See it at work</div><b>How a ransomware attack unfolds</b></div>` : ""}
    <svg class="rw-map" viewBox="0 0 780 190" role="img" aria-label="An attacker, a VPN, an admin laptop, a file server and its backups, joined left to right"></svg>
    <div class="rw-track" aria-hidden="true"></div>
    <div class="rw-card" aria-live="polite"></div>
    <div class="row rw-step"><button type="button" class="btn ghost sm" data-go="-1">‹ Back</button><button type="button" class="btn brand sm" data-go="1">Next ›</button></div>
    <section class="rw-stop" aria-labelledby="rw-stop-h"><h3 id="rw-stop-h" class="eyebrow">Stop it: pick ${BUDGET} defences, then run it again</h3>
      <div class="row rw-pick" role="group" aria-label="Defences">${Object.entries(DEFENCES).map(([k, d]) => `<button type="button" class="chip" data-d="${k}" aria-pressed="false">${esc(d.label)}</button>`).join("")}</div>
      <div class="row"><button type="button" class="btn brand" data-run>Run with my defences</button><button type="button" class="btn ghost" data-reset>Clear</button></div></section>
    <p class="muted xpl-foot">Simplified and fictional: a real attack has more steps and more ways to catch it.</p>
  </figure>`;
  const svg = el.querySelector(".rw-map"), card = el.querySelector(".rw-card"), track = el.querySelector(".rw-track");
  const paint = () => {
    const ds = deviceStates(run, i), cur = STAGES[i], step = run.steps[i];
    // Wide screens: devices left to right. Narrow (phones): stacked top to bottom with labels beside them, so the
    // drawing stays readable instead of shrinking to a strip.
    const tall = el.clientWidth > 0 && el.clientWidth < 560;
    const W = tall ? 340 : 780, H = tall ? 560 : 210;
    const pos = d => (tall ? [96, 70 + DEVICES.indexOf(d) * 104] : [d.at, 92]);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const links = DEVICES.slice(1).map((d, k) => { const [x1, y1] = pos(DEVICES[k]), [x2, y2] = pos(d);
      return tall ? `<line class="rw-link" x1="${x1}" y1="${y1 + 30}" x2="${x2}" y2="${y2 - 30}"/>` : `<line class="rw-link" x1="${x1 + 34}" y1="${y1}" x2="${x2 - 34}" y2="${y2}"/>`; }).join("");
    const devs = DEVICES.map(d => {
      const [x, y] = pos(d);
      const st = ds[d.id] || (d.id === "attacker" ? "attacker" : ""), on = cur.device === d.id;
      const badge = { bad: "In", locked: "Locked", wiped: "Wiped", guarded: "Blocked", safe: "Safe" }[st] || "";
      const lbl = tall ? `<text class="rw-lbl" x="${x + 48}" y="${y + 5}">${esc(d.label)}</text>` : `<text class="rw-lbl" x="${x}" y="${y + 46}" text-anchor="middle">${esc(d.label)}</text>`;
      const bx = tall ? x + 214 : x, by = tall ? y : y - 44;
      return `<g class="rw-dev ${st}${on ? " on" : ""}">${hw(d.kind, x, y, 0.95, st === "bad" || st === "locked" || st === "wiped" ? "bad" : "")}${lbl}
        ${badge ? `<g class="rw-badge ${st}" transform="translate(${bx},${by})"><rect x="-30" y="-11" width="60" height="20" rx="10"/><text y="4" text-anchor="middle">${badge}</text></g>` : ""}</g>`;
    }).join("");
    const stolen = run.steps.slice(0, i + 1).some((s, k) => STAGES[k].id === "steal" && s.state === "done");
    const exfil = !stolen ? "" : tall
      ? `<path class="rw-exfil" d="M60 ${pos(DEVICES[3])[1]} C 14 ${pos(DEVICES[3])[1] - 60}, 14 ${pos(DEVICES[0])[1] + 60}, 58 ${pos(DEVICES[0])[1] + 14}"/><text class="rw-exfil-lbl" x="22" y="${(pos(DEVICES[0])[1] + pos(DEVICES[3])[1]) / 2}" transform="rotate(-90 22 ${(pos(DEVICES[0])[1] + pos(DEVICES[3])[1]) / 2})" text-anchor="middle" dy="-4">41 GB copied out</text>`
      : `<path class="rw-exfil" d="M550 154 C 420 178, 200 178, 70 154"/><text class="rw-exfil-lbl" x="310" y="200" text-anchor="middle">41 GB copied out</text>`;
    svg.innerHTML = `<defs><marker id="rw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs>${links}${exfil}${devs}
      <text class="rw-clock" x="${W - 10}" y="20" text-anchor="end">${esc(cur.when)}</text>`;
    track.innerHTML = STAGES.map((s, k) => `<span class="rw-dot ${run.steps[k].state}${k === i ? " on" : ""}"></span>`).join("");
    const by = step.by ? DEFENCES[step.by] : null;
    const verdict = step.state === "blocked" ? `<p class="rw-verdict good"><b>Stopped here: ${esc(by.label)}.</b> ${esc(cur.stop)}</p>`
      : step.state === "survived" ? `<p class="rw-verdict good"><b>Offline backups survive.</b> The network copies are wiped, but the offline copy can't be reached.</p>`
      : `<p class="rw-verdict"><b>How it's stopped here:</b> ${esc(cur.stop)}</p>`;
    const end = i === lastIndex() ? `<div class="rw-out ${run.outcome.kind}"><b>${esc(run.outcome.title)}</b><p>${esc(run.outcome.text)}</p>
      ${run.chosen.length ? "" : `<p class="muted">Now try "Stop it" below: which two defences would you pay for?</p>`}</div>` : "";
    card.className = `rw-card ${step.state === "blocked" || step.state === "survived" ? "good" : ""}`;
    card.innerHTML = `<span class="eyebrow">Step ${i + 1} of ${lastIndex() + 1} · ${esc(cur.when)}${run.chosen.length ? ` · with ${esc(run.chosen.map(k => DEFENCES[k].short).join(" + "))}` : ""}</span>
      <b class="rw-title">${esc(cur.title)}</b><p>${esc(cur.text)}</p>${verdict}${end}`;
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    el.querySelector('[data-go="1"]').disabled = i === lastIndex();
    el.querySelectorAll("[data-d]").forEach(b => { const on = chosen.includes(b.dataset.d); b.setAttribute("aria-pressed", String(on)); b.disabled = !on && chosen.length >= BUDGET; });
  };
  el.addEventListener("click", e => {
    const go = e.target.closest("[data-go]"), d = e.target.closest("[data-d]");
    if (go) { i = Math.max(0, Math.min(lastIndex(), i + Number(go.dataset.go))); return paint(); }
    if (d) { const k = d.dataset.d; chosen = chosen.includes(k) ? chosen.filter(x => x !== k) : [...chosen, k].slice(0, BUDGET); return paint(); }
    if (e.target.closest("[data-run]")) { run = runAttack(chosen); i = 0; return paint(); }
    if (e.target.closest("[data-reset]")) { chosen = []; run = runAttack([]); i = 0; return paint(); }
  });
  paint();
  if (typeof ResizeObserver === "function") { let wasTall = el.clientWidth < 560; new ResizeObserver(() => { const t = el.clientWidth < 560; if (t !== wasTall) { wasTall = t; paint(); } }).observe(el); }
  return { get run() { return run; } };
}
