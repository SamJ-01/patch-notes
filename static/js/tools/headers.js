// Email header checker ("bring your own evidence"): paste real headers, get them explained. Everything runs in the
// browser; nothing is sent or stored. analyse() is pure and tested (tests/headers-tool.test.mjs); mount() draws the
// page with the site's shared email (static/js/mail.js) and points each finding at its header line.
// It never says "safe": headers can show warning signs, not prove an email is harmless.
import { MAIL } from "../mail.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Glossary underlining from the main page (gloss() in src/app/02-glossary.js), or plain escaped text without it.
const gl = (t, n = 3, seen) => (globalThis.PN_gloss ? globalThis.PN_gloss(t, n, seen) : esc(t));

const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|f[cd][0-9a-f]{2}:|fe80:)/i;
const domainOf = a => (String(a || "").includes("@") ? a.split("@").pop().toLowerCase().replace(/>$/, "") : "");
// The part of a domain someone registers: example.co.uk, not mail.example.co.uk.
export function baseDomain(d) {
  const p = String(d || "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (p.length <= 2) return p.join(".");
  const two = /^(co|ac|gov|org|net|com|ltd|plc|sch|nhs|police|edu)$/.test(p.at(-2)) && p.at(-1).length === 2;
  return p.slice(two ? -3 : -2).join(".");
}
// Letters that look alike once squashed: 1 and l, 0 and o, rn and m, vv and w. Hyphens dropped.
const squash = d => d.replace(/rn/g, "m").replace(/vv/g, "w").replace(/[1|]/g, "l").replace(/0/g, "o").replace(/3/g, "e").replace(/5/g, "s").replace(/-/g, "");
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Does `domain` imitate `yours`? Returns the reason, or "" when it's yours or unrelated.
export function lookalike(domain, yours) {
  const a = baseDomain(domain), b = baseDomain(yours);
  if (!a || !b || a === b) return "";
  if (a.startsWith("xn--") || a.includes(".xn--")) return "it's written in other alphabets (punycode), which can mimic any name";
  const name = b.split(".")[0];
  if (squash(a) === squash(b)) return "it reads the same as yours once look-alike letters are swapped";
  if (name.length >= 5 && a.split(".")[0] !== name && squash(a).includes(squash(name))) return `it contains your name, "${name}", plus extra words`;
  if (name.length >= 6 && distance(a.split(".")[0], name) === 1) return "it's one letter away from yours";
  return "";
}

// One finding: { level: "warn" | "info" | "ok", title, text, where (text to highlight in the headers), term (glossary id) }.
export function analyse(raw, { org = "" } = {}) {
  const text = String(raw || "").replace(/\r\n?/g, "\n").trim();
  const h = MAIL.parseHeaders(text);
  if (!h.from.address && !h.received.length) return { ok: false, error: "These don't look like email headers. In your mail app, open the email and choose Show original (Gmail) or View message source (Outlook), then copy everything from the top down to the Subject and Date lines." };
  const f = [], from = h.from.domain, a = h.auth;
  const add = (level, title, text, where = "", term = "") => f.push({ level, title, text, where, term });

  // The checks, from the receiving server's own Authentication-Results.
  const word = { pass: "passed", fail: "failed", softfail: "soft-failed", neutral: "came back neutral", none: "wasn't there", temperror: "hit a temporary error", permerror: "hit a broken record" };
  for (const [k, name, why] of [["spf", "SPF", "the sending server wasn't on the domain's list"], ["dkim", "DKIM", "the signature didn't match the domain"], ["dmarc", "DMARC", "the From domain wasn't proven by SPF or DKIM"]]) {
    // Point at the trusted result itself (spf=fail), so a fake "spf=pass" further down isn't marked too.
    const r = a[k].result, where = a[k].detail === "(from Received-SPF)" ? "Received-SPF" : r === "none" && !text.toLowerCase().includes(`${k}=none`) ? "" : `${k}=${r}`;
    if (r === "pass") add("ok", `${name} passed`, k === "dmarc" ? `The From domain (${from}) is proven. That shows who sent it, not that they're honest.` : `${name} checked out for the domain it names.`, where, k);
    else if (["fail", "softfail", "permerror"].includes(r)) add("warn", `${name} ${word[r]}`, `${why[0].toUpperCase()}${why.slice(1)}. Treat the From line as unproven.`, where, k);
    else add("info", `${name} ${word[r] || r}`, r === "none" ? `No ${name} result was recorded, so this check proves nothing either way.` : `No clear answer from ${name}.`, where, k);
  }
  if (h.authIgnored.length) add("info", "Some check results were ignored", `${h.authIgnored.length} Authentication-Results header${h.authIgnored.length === 1 ? " was" : "s were"} not added by your mail provider (${h.authIgnored.join(", ")}). Senders can write fake ones, so only the top one counts.`, h.authIgnored[0].includes(".") ? `Authentication-Results: ${h.authIgnored[0]}` : "Authentication-Results", "email-auth");
  if (h.authBy === null) add("info", "No check results at all", "There's no Authentication-Results header. Copy the full headers from your mail app, starting at the very top.", "", "email-auth");

  // Who it claims to be, and where replies and bounces go.
  if (h.replyTo && h.replyTo.domain && h.replyTo.domain !== from) add("warn", "Replies go somewhere else", `Reply-To sends your answer to ${h.replyTo.address}, not to ${from}.`, "Reply-To", "reply-to");
  const ret = h.returnPath.domain;
  if (ret && from && baseDomain(ret) !== baseDomain(from)) add("info", "Bounces go to another domain", `Return-Path is ${ret}. Normal for mailing services sending on a company's behalf; odd for a personal or bank email.`, "Return-Path", "return-path");
  const named = h.from.name.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  if (named && domainOf(named[0]) !== from) add("warn", "The name shows a different address", `The display name says ${named[0]}, but the real address is ${h.from.address}.`, "From:", "spoofing");
  if (from && /(^|\.)xn--/.test(from)) add("warn", "The domain uses other alphabets", `${from} is punycode: it can display as a name that looks like a familiar one.`, "From:", "spoofing");
  const like = org && lookalike(from, org);
  if (like) add("warn", "The domain imitates yours", `${from} isn't ${baseDomain(org)}, but ${like}.`, "From:", "typosquatting");
  else if (org && from && baseDomain(from) === baseDomain(org) && a.dmarc.result !== "pass") add("warn", "It claims to be from your own domain", `The From line says ${from}, but DMARC didn't prove it. Your own colleagues' email should pass.`, "From:", "spoofing");

  // Where it came from: the first server outside the sender's own machines with a public address.
  const firstPublic = h.received.find(r => r.ip && !PRIVATE.test(r.ip));
  if (firstPublic) add("info", "Where it was sent from", `${firstPublic.rdns || firstPublic.helo || "A server"} (${firstPublic.ip}) handed it to ${firstPublic.by}.`, firstPublic.ip, "ip-address");

  const order = { warn: 0, info: 1, ok: 2 };
  f.sort((x, y) => order[x.level] - order[y.level]);
  return { ok: true, parsed: h, findings: f, warnings: f.filter(x => x.level === "warn").length };
}

// ---------- the page
export function mount(root, { samples = [] } = {}) {
  root.innerHTML = `<div class="hc">
    <section class="panel hc-in"><div class="panel-title"><h2>Paste the headers</h2><span class="sim-tag hc-private">🔒 Stays on your device</span></div>
      <p class="muted hc-how">Open the email, then <b>Show original</b> (Gmail) or <b>View message source</b> (Outlook). Copy from the top down to Subject and Date.</p>
      <label class="sr-only" for="hc-raw">Email headers</label>
      <textarea id="hc-raw" class="hc-raw" rows="8" spellcheck="false" autocomplete="off" placeholder="Received: from …&#10;Authentication-Results: …&#10;From: …"></textarea>
      <div class="hc-row"><label for="hc-org">Your organisation's email domain <span class="muted">(optional, to spot imitations)</span></label><input id="hc-org" class="mono" placeholder="example.co.uk" autocomplete="off" spellcheck="false"></div>
      <div class="row"><button class="btn brand" type="button" id="hc-go">Check these headers</button>${samples.length ? `<span class="muted hc-try">or try an example:</span>${samples.map((x, i) => `<button class="chip" type="button" data-sample="${i}">${esc(x.label)}</button>`).join("")}` : ""}</div>
      <p class="muted hc-small">Nothing you paste leaves this page: no upload, no saving. Even so, remove anything you'd rather not have on screen.</p></section>
    <div id="hc-out" aria-live="polite"></div></div>`;
  const $ = id => root.querySelector("#" + id);
  const run = () => {
    const r = analyse($("hc-raw").value, { org: $("hc-org").value.trim() });
    if (!r.ok) { $("hc-out").innerHTML = `<div class="feedback"><b class="no">Not quite.</b> ${esc(r.error)}</div>`; return; }
    const icon = { warn: "⚠", info: "ℹ", ok: "✓" };
    $("hc-out").innerHTML = `<section class="panel"><div class="panel-title"><h2>${r.warnings ? `${r.warnings} thing${r.warnings === 1 ? "" : "s"} worth a look` : "No warning signs in the headers"}</h2></div>
        ${r.warnings ? "" : `<p class="muted hc-small">That isn't the same as safe: a lookalike domain can pass every check. Look at the sender's domain and where links go.</p>`}
        <ul class="hc-find">${r.findings.map((x, i) => `<li class="${x.level}"><span class="hc-ic" aria-hidden="true">${icon[x.level]}</span><div><b>${gl(x.title, 1)}</b><p>${gl(x.text, 2)}</p>
          ${x.where && $("hc-raw").value.toLowerCase().includes(x.where.toLowerCase()) ? `<button type="button" class="link-btn" data-hc-where="${i}">Show me where</button>` : ""}</div></li>`).join("")}</ul></section>
      <section class="panel"><h2>The email, explained</h2>${MAIL.card({ headers: $("hc-raw").value }, { id: "hc-mail", org: $("hc-org").value.trim().toLowerCase(), tab: "details", views: ["details", "original"] })}</section>
      <p class="muted hc-small">Want to practise? Try the <a href="#lab-header-inspector">header inspector lab</a> or the <a href="#mission-phish-triage">phishing mission</a>.</p>`;
    MAIL.wire($("hc-out"));
    $("hc-out").querySelectorAll("[data-hc-where]").forEach(b => b.addEventListener("click", () => {
      const em = $("hc-mail"); MAIL.highlight(em, r.findings[Number(b.dataset.hcWhere)].where);
      em.scrollIntoView({ block: "start" }); em.querySelector(".em-raw")?.focus({ preventScroll: true });
    }));
    $("hc-out").querySelector("h2")?.setAttribute("tabindex", "-1");
    $("hc-out").querySelector("h2")?.focus();
  };
  $("hc-go").addEventListener("click", run);
  root.querySelectorAll("[data-sample]").forEach(b => b.addEventListener("click", () => {
    const x = samples[Number(b.dataset.sample)];
    $("hc-raw").value = x.headers; $("hc-org").value = x.org || ""; run();
  }));
}
