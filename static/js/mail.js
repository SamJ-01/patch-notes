// The Patch Notes email: one way to show an email anywhere on the site (the Phish or Legit game, the header lab,
// missions). It looks like a mail app (sender, subject, body, buttons), and its links never open: tapping one shows
// where it really goes, like hovering does on a computer. With raw headers it gains two more views: Details (who
// really sent it, the route it took and the receiving server's checks, drawn as pictures) and Original (the raw
// headers). Clues can be pinned to the part of the email they're about.
// Pure string output plus one wire() for the clicks. build.py inlines this file into the main page (minus
// "export"), so everything sits inside MAIL to keep the page's global names clear.
export const MAIL = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- reading headers (RFC 5322, with RFC 8601 Authentication-Results)
  // Names and subjects outside plain ASCII arrive MIME-encoded (RFC 2047): =?UTF-8?B?...?= (base64) or ?Q? (quoted).
  // Decode them so the reader sees what the mail app shows, and the checks can look inside.
  function decodeWords(v) {
    return String(v || "").replace(/=\?([\w-]+)\?([BQ])\?([^?]*)\?=(\s+(?==\?))?/gi, (all, cs, enc, data) => {
      try {
        const bytes = enc.toUpperCase() === "B" ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
          : Uint8Array.from(data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0));
        return new TextDecoder(cs.toLowerCase() === "utf8" ? "utf-8" : cs).decode(bytes);
      } catch { return all; }
    });
  }
  const addr = v => {
    const m = String(v || "").match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/) || [null, "", String(v || "").trim()];
    const address = m[2].trim();
    return { name: decodeWords((m[1] || "").trim()), address, domain: address.includes("@") ? address.split("@").pop().toLowerCase() : "" };
  };
  function parseHeaders(raw) {
    const fields = [];
    for (const line of String(raw || "").split(/\r?\n/)) {
      if (/^[ \t]/.test(line) && fields.length) fields.at(-1)[1] += " " + line.trim();
      else { const i = line.indexOf(":"); if (i > 0) fields.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]); }
    }
    const one = n => fields.find(([k]) => k === n)?.[1] || "";
    // Received headers are added on top, so the first one is the last hop: reverse them to read in order.
    const received = fields.filter(([k]) => k === "received").map(([, v]) => {
      // "from HOST (RDNS [IP])" (Postfix, Gmail) or "from HOST (IP)" (Microsoft 365); "by HOST" names the receiver.
      const m = v.match(/^from\s+(\S+)\s+\(([^)]*)\)/), paren = m ? m[2] : "";
      const ip = (paren.match(/\[([\d.:a-fA-F]+)\]/) || paren.trim().match(/^((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]*:[0-9a-fA-F:]+)$/) || [])[1] || "";
      return { helo: m ? m[1] : (v.match(/^from\s+(\S+)/) || [])[1] || "", rdns: paren.replace(/\[[^\]]*\]/, "").replace(/\bhelo=\S+/i, "").replace(/^[\d.:a-fA-F]+$/, "").trim().replace(/\.$/, ""), ip, by: (v.match(/\bby\s+([^\s;]+)/) || [])[1] || "" };
    }).reverse();
    // Authentication-Results (RFC 8601), top first. Only the receiving server's own verdicts count: anyone can add
    // a fake "pass" header further down. So trust the topmost header and others from the same server (its
    // authserv-id, the part before the first ";"; Microsoft 365 leaves it out), and list the rest as ignored.
    const ar = fields.filter(([k]) => k === "authentication-results").map(([, v]) => { const first = v.split(";")[0].trim(); return { id: /=/.test(first) ? "" : first.toLowerCase(), raw: v }; });
    const trustedId = ar.length ? ar[0].id : null, trusted = ar.filter(a => a.id === trustedId), ignored = ar.filter(a => a.id !== trustedId);
    const results = trusted.map(a => a.raw).join("; ");
    const spfHeader = one("received-spf");
    const verdict = k => {
      const m = results.match(new RegExp(`\\b${k}=(\\w+)([^;]*)`));
      if (m) return { result: m[1].toLowerCase(), detail: m[2].trim() };
      if (k === "spf" && spfHeader) return { result: spfHeader.split(/[\s(]/)[0].toLowerCase(), detail: "(from Received-SPF)" };
      return { result: "none", detail: "" };
    };
    return {
      from: addr(one("from")), replyTo: one("reply-to") ? addr(one("reply-to")) : null, returnPath: addr(one("return-path")),
      to: one("to"), subject: decodeWords(one("subject")), date: one("date"), messageId: one("message-id"),
      received, auth: { spf: verdict("spf"), dkim: verdict("dkim"), dmarc: verdict("dmarc") },
      authBy: trustedId, authIgnored: ignored.map(a => a.id || "(no server named)"),
    };
  }
  // Where a link really goes: the host in its href, against any address its text shows. The browser's own URL
  // parser decides the host, so tricks like https://bank.example:443@evil.example (everything before @ is just a
  // "username") are read the way a browser follows them.
  const urlHost = s => { try { return new URL(String(s).trim()).hostname.toLowerCase().replace(/\.$/, ""); } catch { return ""; } };
  function linkFacts({ text, href }) {
    const t = String(text || "").trim();
    // Text "shows an address" when it's a URL or looks like one (paypal.com/signin), not when it's words like "Sign in".
    const shown = /^[a-z][\w+.-]*:\/\//i.test(t) ? urlHost(t) : /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t) ? urlHost("https://" + t) : "";
    const real = urlHost(href);
    return { text, href, real, shown, mismatch: !!shown && shown !== real };
  }

  // ---------- drawing
  const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = n => String(n || "?").replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
  // The domain set apart in a fixed-width font, so a 1 and an l (or rn and m) look different.
  const showAddr = (address, domain) => domain ? `${esc(address.slice(0, -domain.length))}<b class="em-dom">${esc(domain)}</b>` : esc(address);
  const showUrl = (href, real) => {
    const i = real ? href.toLowerCase().indexOf(real) : -1;
    return i < 0 ? esc(href) : `${esc(href.slice(0, i))}<b class="em-dom">${esc(href.slice(i, i + real.length))}</b>${esc(href.slice(i + real.length))}`;
  };
  const outside = (d, org) => !!org && !!d && d !== org && !d.endsWith("." + org);
  const TONE = { pass: "ok", fail: "bad", softfail: "warn", neutral: "warn", none: "warn", temperror: "warn", permerror: "bad" };
  const pin = (pins, at) => pins.map((p, i) => (p.at === at ? `<span class="em-pin" aria-hidden="true">${i + 1}</span>` : "")).join("");

  function details(h, org) {
    const check = (k, label, q) => { const r = h.auth[k]; return `<li class="em-check ${TONE[r.result] || "warn"}"><b>${label}</b><span class="em-res">${esc(r.result)}</span><span class="em-q">${esc(q)}</span></li>`; };
    const hop = r => { const name = r.rdns || r.helo || "unknown", out = outside(name, org); return `<li><span class="em-hop${out ? " out" : ""}"><b>${esc(name)}</b>${r.ip ? `<span class="mono">${esc(r.ip)}</span>` : ""}${org ? `<span class="em-tag">${out ? "outside" : "yours"}</span>` : ""}</span><span class="em-arrow" aria-hidden="true">→</span><span class="em-hop"><b>${esc(r.by)}</b></span></li>`; };
    return `<dl class="em-facts">
        <div><dt>Name shown</dt><dd>${esc(h.from.name || "(none)")} <span class="em-aside">anyone can type any name</span></dd></div>
        <div><dt>Real address</dt><dd class="mono">${showAddr(h.from.address, h.from.domain)}</dd></div>
        ${h.replyTo && h.replyTo.address.toLowerCase() !== h.from.address.toLowerCase() ? `<div class="warn"><dt>Replies go to</dt><dd class="mono">${showAddr(h.replyTo.address, h.replyTo.domain)}</dd></div>` : ""}
        ${h.returnPath.address && h.returnPath.domain !== h.from.domain ? `<div><dt>Bounces go to</dt><dd class="mono">${showAddr(h.returnPath.address, h.returnPath.domain)}</dd></div>` : ""}</dl>
      ${h.received.length ? `<h4 class="em-h">How it reached you</h4><ol class="em-route">${h.received.map(hop).join("")}</ol>` : ""}
      <h4 class="em-h">The receiving server's checks</h4><ul class="em-checks">${check("spf", "SPF", "Was the sending server allowed to send for this domain?")}${check("dkim", "DKIM", "Was it signed by the domain, unchanged?")}${check("dmarc", "DMARC", "Does the From domain match what SPF or DKIM proved?")}</ul>
      <p class="em-aside">Passing proves which domain sent it, not that the domain is honest.</p>`;
  }

  // m: { fromName, fromAddr, to, date, subject, body (text, blank lines between paragraphs, or a list), links: [{ text, href }],
  //      attachments: [{ name, size }], folder, headers (raw, optional) }
  // opts: { id, org (your domain: other senders are marked external), tab, views (which of message, details, original to offer),
//         reveal (show every link's destination), pins: [{ at, text }] }
  // A pin's `at` is one of: from, replyTo, subject, body, link, attachment, checks, route.
  function card(m, opts = {}) {
    const id = opts.id || "em", pins = (opts.pins || []).map(p => (typeof p === "string" ? { at: "", text: p } : p));
    const h = m.headers ? parseHeaders(m.headers) : null;
    const fromName = m.fromName ?? h?.from.name ?? "", fromAddr = m.fromAddr ?? h?.from.address ?? "", domain = fromAddr.includes("@") ? fromAddr.split("@").pop().toLowerCase() : "";
    const subject = m.subject ?? h?.subject ?? "", to = m.to ?? h?.to ?? "", date = m.date ?? (h?.date || "").replace(/:\d\d [+-]\d{4}.*$/, "");
    const replyTo = h?.replyTo && h.replyTo.address.toLowerCase() !== fromAddr.toLowerCase() ? h.replyTo : null;
    const paras = (Array.isArray(m.body) ? m.body : String(m.body || "").split(/\n\s*\n/)).filter(Boolean);
    const links = (m.links || []).map(linkFacts);
    const flags = [
      outside(domain, opts.org) ? `<span class="em-flag ext">External sender</span>` : "",
      m.folder && m.folder !== "Inbox" ? `<span class="em-flag">In ${esc(m.folder)}</span>` : "",
      replyTo ? `<span class="em-flag warn">Replies go to ${showAddr(replyTo.address, replyTo.domain)}${pin(pins, "replyTo")}</span>` : "",
    ].join("");
    const tabs = h ? [["message", "Message"], ["details", "Details"], ["original", "Original"]].filter(([k]) => !opts.views || opts.views.includes(k)) : [];
    const tab = tabs.some(([k]) => k === opts.tab) ? opts.tab : "message";
    return `<article class="em" id="${esc(id)}" data-em>
      ${tabs.length ? `<div class="em-tabs" role="group" aria-label="View">${tabs.map(([k, l]) => `<button type="button" class="em-tab" data-em-tab="${k}" aria-pressed="${k === tab}">${l}${k === "details" ? pin(pins, "checks") + pin(pins, "route") : ""}</button>`).join("")}</div>` : ""}
      <div class="em-pane" data-em-pane="message"${tab === "message" ? "" : " hidden"}>
        <header class="em-top"><span class="em-av" style="--em-h:${hue(fromAddr)}" aria-hidden="true">${esc(initials(fromName || fromAddr))}</span>
          <div class="em-who"><span class="em-name">${esc(fromName || fromAddr)}${pin(pins, "from")}</span> <span class="em-addr">&lt;${showAddr(fromAddr, domain)}&gt;</span>${to ? `<span class="em-to">to ${esc(to)}</span>` : ""}</div>
          ${date ? `<span class="em-date">${esc(date)}</span>` : ""}</header>
        ${flags ? `<div class="em-flags">${flags}</div>` : ""}
        <h3 class="em-subj">${esc(subject)}${pin(pins, "subject")}</h3>
        <div class="em-body">${paras.map(p => `<p>${esc(p)}</p>`).join("")}${pin(pins, "body")}</div>
        ${links.length ? `<div class="em-links">${links.map((l, i) => `<div class="em-link"><button type="button" class="${l.shown ? "em-url" : "em-cta"}" data-em-link="${i}" data-em-href="${esc(l.href)}" aria-describedby="${esc(id)}-go-${i}">${esc(l.text)}</button>${i === 0 ? pin(pins, "link") : ""}
            <p class="em-go${l.mismatch ? " bad" : ""}" id="${esc(id)}-go-${i}"${opts.reveal ? "" : " hidden"}>${opts.reveal ? goes(l) : ""}</p></div>`).join("")}
          ${opts.reveal ? "" : `<p class="em-aside">Links here never open. Tap one to see where it really goes.</p>`}</div>` : ""}
        ${(m.attachments || []).length ? `<ul class="em-files">${m.attachments.map(a => `<li><span aria-hidden="true">📎</span> ${esc(a.name)}${a.size ? ` <span class="em-aside">${esc(a.size)}</span>` : ""}</li>`).join("")}${pin(pins, "attachment")}</ul>` : ""}
      </div>
      ${tabs.some(([k]) => k === "details") ? `<div class="em-pane" data-em-pane="details"${tab === "details" ? "" : " hidden"}>${details(h, opts.org)}</div>` : ""}
      ${tabs.some(([k]) => k === "original") ? `<div class="em-pane" data-em-pane="original"${tab === "original" ? "" : " hidden"}><pre class="em-raw" tabindex="0" aria-label="Raw headers">${esc(m.headers)}</pre></div>` : ""}
      ${pins.length ? `<ol class="em-pins">${pins.map(p => `<li>${esc(p.text)}</li>`).join("")}</ol>` : ""}
    </article>`;
  }
  const goes = l => `<span class="em-k">Really goes to</span> <span class="mono">${showUrl(l.href, l.real)}</span>${l.mismatch ? ` <span class="em-flag warn">not the address it shows</span>` : !/^https:/i.test(l.href) ? ` <span class="em-flag warn">not encrypted (http)</span>` : ""}`;

  // Clicks for every email inside `root` (call once per container; it uses delegation, so redraws are fine).
  function wire(root, { onLink = () => {} } = {}) {
    root.addEventListener("click", e => {
      const t = e.target.closest("[data-em-tab]"), k = e.target.closest("[data-em-link]");
      if (t) {
        const em = t.closest("[data-em]");
        em.querySelectorAll("[data-em-tab]").forEach(b => b.setAttribute("aria-pressed", b === t));
        em.querySelectorAll("[data-em-pane]").forEach(p => { p.hidden = p.dataset.emPane !== t.dataset.emTab; });
      } else if (k) {
        const em = k.closest("[data-em]"), l = linkFacts({ text: k.textContent, href: k.dataset.emHref });
        const box = em.querySelector(`#${CSS.escape(em.id)}-go-${k.dataset.emLink}`);
        box.innerHTML = goes(l); box.hidden = false; box.classList.toggle("bad", l.mismatch);
        onLink(l);
      }
    });
  }
  // "Show me where": open an email's Original view and mark every header line containing `needle`.
  // Returns how many lines were marked. Header lines that continue onto the next line are marked together.
  function highlight(em, needle) {
    const raw = em.querySelector(".em-raw"), tab = em.querySelector('[data-em-tab="original"]');
    if (!raw || !tab) return 0;
    tab.click();
    const lines = raw.textContent.split("\n"), want = String(needle).toLowerCase();
    // A bare header name (Reply-To, From:) only matches at the start of a line, so In-Reply-To isn't marked too.
    const name = /^[\w-]+:?$/.test(want), has = l => (name ? l.toLowerCase().startsWith(want.endsWith(":") ? want : want + ":") : l.toLowerCase().includes(want));
    let hits = 0, inHit = false;
    raw.innerHTML = lines.map(l => {
      const start = !/^[ \t]/.test(l);
      if (start) inHit = has(l);
      const hit = inHit || (!name && has(l));
      if (hit) hits++;
      return hit ? `<mark>${esc(l)}</mark>` : esc(l);
    }).join("\n");
    raw.querySelector("mark")?.scrollIntoView?.({ block: "nearest" });
    return hits;
  }
  return { card, wire, parseHeaders, linkFacts, highlight, decodeWords };
})();
