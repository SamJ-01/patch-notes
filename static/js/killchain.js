// The Cyber Kill Chain, walked through one real-shaped incident (Ferrow Logistics, fictional; the same story as the
// which-model-fits Diagnose case): seven stages, each with the MITRE ATT&CK technique it used. Then "Break the chain":
// place one defence and run it again to see where the attack stops, and why earlier is cheaper. The rules (runChain)
// are pure and tested in tests/killchain.test.mjs; mount() only draws them.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ATT&CK IDs are real technique IDs (attack.mitre.org); the incident is fictional and simplified.
export const STAGES = [
  { id: "recon", name: "Reconnaissance", when: "Day 1", title: "Reads staff profiles online",
    text: "The attacker lists Ferrow's finance staff from LinkedIn and the company website.", attack: ["T1593.001", "Search open websites: social media"] },
  { id: "weapon", name: "Weaponisation", when: "Day 2", title: "Builds a booby-trapped invoice",
    text: "A Word invoice with a macro that installs malware. This happens on the attacker's own machines, out of Ferrow's sight.", attack: ["T1587.001", "Develop capabilities: malware"] },
  { id: "deliver", name: "Delivery", when: "Day 3", title: "Emails it to 40 staff",
    text: "The mail filter marks it suspicious, but still delivers it.", attack: ["T1566.001", "Phishing: spearphishing attachment"] },
  { id: "exploit", name: "Exploitation", when: "Day 3", title: "One person enables macros",
    text: "The invoice asks them to \"enable content to view it\". The macro runs.", attack: ["T1204.002", "User execution: malicious file"] },
  { id: "install", name: "Installation", when: "Day 3", title: "Sets itself to start at every logon",
    text: "The malware adds a Run key in the registry, so it survives a restart.", attack: ["T1547.001", "Boot or logon autostart: Run keys"] },
  { id: "c2", name: "Command and control", when: "Day 4", title: "Calls home every 5 minutes",
    text: "It checks in with 203.0.113.50 over HTTPS, waiting for instructions.", attack: ["T1071.001", "Application layer protocol: web protocols"] },
  { id: "act", name: "Actions on objectives", when: "Days 9 to 10", title: "Copies 2 GB of invoices out",
    text: "Using stolen admin credentials, the attacker copies invoices from the finance server and sends them out over the same channel.", attack: ["T1041", "Exfiltration over C2 channel"] },
];

// One defence each. `at` is the stage it acts on; `stops: false` means it helps but the attack carries on there.
export const DEFENCES = {
  profiles: { label: "Ask staff to limit what they post", at: "recon", stops: false,
    why: "Worth doing, but names and roles are easy to find elsewhere. The attacker carries on." },
  quarantine: { label: "Quarantine suspicious mail, don't deliver it", at: "deliver",
    why: "The filter had already flagged it. Holding it instead of delivering ends the attack before anyone sees it." },
  macros: { label: "Block macros in files from the internet", at: "exploit",
    why: "Office blocks the macro outright, so enabling content does nothing." },
  edr: { label: "EDR alert on new Run keys", at: "install",
    why: "EDR spots the new autostart entry and isolates the laptop. Someone still has to clean it up." },
  egress: { label: "Block traffic to newly seen domains", at: "c2",
    why: "The malware can't reach its server, so it waits for orders that never come. The laptop is still infected and needs cleaning." },
  dlp: { label: "Alert on large uploads", at: "act",
    why: "The upload is noticed and cut off, but some invoices are already gone: a breach to handle and maybe report." },
};

// Run the incident against one chosen defence (or none). Each stage is "done", "slowed" (a defence there helps but
// doesn't stop it), "blocked" (stopped here) or "never" (after a block). The outcome says what the stop costs.
export function runChain(defence = null) {
  const d = Object.hasOwn(DEFENCES, String(defence)) ? DEFENCES[defence] : null;
  const steps = []; let stoppedAt = null;
  for (const st of STAGES) {
    if (stoppedAt) { steps.push({ id: st.id, state: "never" }); continue; }
    if (d && d.at === st.id) {
      if (d.stops === false) { steps.push({ id: st.id, state: "slowed" }); continue; }
      steps.push({ id: st.id, state: "blocked" }); stoppedAt = st.id; continue;
    }
    steps.push({ id: st.id, state: "done" });
  }
  const at = stoppedAt ? STAGES.findIndex(s => s.id === stoppedAt) : -1;
  const outcome = !stoppedAt
    ? { kind: "lost", title: "The chain ran to the end", text: "2 GB of invoices left the company. Now it's incident response: find every foothold, clean up and decide whether to report a breach." }
    : at <= 3
      ? { kind: "stopped", title: `Broken at ${STAGES[at].name.toLowerCase()}`, text: "Nothing was installed, so there's nothing to clean up. Breaking the chain this early is the cheapest place to do it." }
      : at <= 5
        ? { kind: "stopped", title: `Broken at ${STAGES[at].name.toLowerCase()}`, text: "No data was lost, but a laptop was infected: it needs isolating, cleaning and checking for other footholds." }
        : { kind: "late", title: "Caught in the act, but late", text: "Stopped mid-theft. Some data is already gone, so it's a breach to investigate and possibly report." };
  return { defence: d ? defence : null, steps, stoppedAt, outcome };
}

export function mount(el, { head = true } = {}) {
  let pick = null, run = runChain(null), i = 0;
  const last = () => (run.stoppedAt ? STAGES.findIndex(s => s.id === run.stoppedAt) : STAGES.length - 1);
  el.innerHTML = `<figure class="xpl kc">
    ${head ? `<div class="xpl-head"><div class="eyebrow">See it at work</div><b>One attack, seven links</b></div>` : ""}
    <ol class="kc-chain" aria-label="The seven stages of the Cyber Kill Chain"></ol>
    <div class="kc-card" aria-live="polite"></div>
    <div class="row kc-step"><button type="button" class="btn ghost sm" data-go="-1">‹ Back</button><button type="button" class="btn brand sm" data-go="1">Next ›</button></div>
    <section class="kc-break" aria-labelledby="kc-break-h"><h3 id="kc-break-h" class="eyebrow">Break the chain: pick one defence, then run it again</h3>
      <div class="row kc-pick" role="group" aria-label="Defences">${Object.entries(DEFENCES).map(([k, d]) => `<button type="button" class="chip" data-d="${k}" aria-pressed="false">${esc(d.label)}</button>`).join("")}</div>
      <div class="row"><button type="button" class="btn brand" data-run>Run with this defence</button><button type="button" class="btn ghost" data-reset>Clear</button></div></section>
    <p class="muted xpl-foot">Simplified and fictional; the ATT&amp;CK technique IDs are real (attack.mitre.org).</p>
  </figure>`;
  const chain = el.querySelector(".kc-chain"), card = el.querySelector(".kc-card");
  const paint = () => {
    chain.innerHTML = STAGES.map((s, k) => { const st = run.steps[k].state;
      return `<li class="kc-link ${st}${k === i ? " on" : ""}${k > i && st !== "never" ? " ahead" : ""}"><span class="kc-n" aria-hidden="true">${st === "blocked" ? "✕" : k + 1}</span><span class="kc-name">${esc(s.name)}</span><span class="kc-id">${esc(s.attack[0])}</span>
        <span class="sr-only">${st === "blocked" ? " (stopped here)" : st === "never" ? " (never reached)" : ""}</span></li>`; }).join("");
    const s = STAGES[i], step = run.steps[i], d = run.defence ? DEFENCES[run.defence] : null;
    const here = d && d.at === s.id ? `<p class="kc-verdict ${step.state === "blocked" ? "good" : ""}"><b>${step.state === "blocked" ? "Stopped here" : "Slowed, not stopped"}: ${esc(d.label)}.</b> ${esc(d.why)}</p>` : "";
    const end = i === last() ? `<div class="kc-out ${run.outcome.kind}"><b>${esc(run.outcome.title)}</b><p>${esc(run.outcome.text)}</p>
      ${run.defence ? "" : `<p class="muted">Now break the chain below: where would one defence do the most good?</p>`}</div>` : "";
    card.className = `kc-card${step.state === "blocked" ? " good" : ""}`;
    card.innerHTML = `<span class="eyebrow">Stage ${i + 1} of 7 · ${esc(s.name)} · ${esc(s.when)}</span>
      <b class="kc-title">${esc(s.title)}</b><p>${esc(s.text)}</p>
      <p class="kc-attack"><span class="eyebrow">MITRE ATT&amp;CK</span> <a href="https://attack.mitre.org/techniques/${esc(s.attack[0].replace(".", "/"))}/" rel="noopener">${esc(s.attack[0])}</a> ${esc(s.attack[1])}</p>${here}${end}`;
    el.querySelector('[data-go="-1"]').disabled = i === 0;
    el.querySelector('[data-go="1"]').disabled = i === last();
    el.querySelectorAll("[data-d]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.d === pick)));
  };
  el.addEventListener("click", e => {
    const go = e.target.closest("[data-go]"), d = e.target.closest("[data-d]");
    if (go) { i = Math.max(0, Math.min(last(), i + Number(go.dataset.go))); return paint(); }
    if (d) { pick = pick === d.dataset.d ? null : d.dataset.d; return paint(); }
    if (e.target.closest("[data-run]")) { run = runChain(pick); i = run.stoppedAt ? STAGES.findIndex(s => s.id === run.stoppedAt) : 0; return paint(); }
    if (e.target.closest("[data-reset]")) { pick = null; run = runChain(null); i = 0; return paint(); }
  });
  paint();
  return { get run() { return run; } };
}
