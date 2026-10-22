// The Patch Notes service desk: one way to show work tickets and staff messages anywhere on the site (the Agency
// shift and hub, missions). Tickets look like a ticketing system's ticket: a numbered header, a priority stripe, a
// status pill, a row of fields and the description set apart, so they never blend into logs or terminals. Staff
// messages look like a team chat: who, which team, when, and the ticket they're about. System notices are a slim
// line of their own, not a bubble.
// Pure string output. build.py inlines this file into the main page (minus "export"), so everything sits inside DESK.
// Text is escaped here; fields named html (body, foot, text in messages) are trusted HTML the caller has escaped.
export const DESK = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Statuses a ticket or a request can be in, worded for people, with the tone used to colour them.
  const STATUS = {
    new: ["New", "info"], open: ["Open", "info"], pending: ["Waiting on team", "wait"], asks: ["Needs info", "warn"],
    done: ["Done", "ok"], refused: ["Refused", "bad"], closed: ["Closed", "ok"], escalated: ["Escalated", "bad"], monitoring: ["Watching", "wait"],
  };
  const PRIORITY = { low: "P4 · Low", medium: "P3 · Medium", high: "P2 · High", critical: "P1 · Critical" };
  const initials = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  // A steady colour per team, so people from the same team look alike.
  const hue = s => [...String(s || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
  const pill = (status, id = "") => {
    const [word, tone] = STATUS[status] || [String(status || ""), "info"];
    return status ? `<span class="dk-pill ${tone}"${id ? ` id="${esc(id)}"` : ""}>${esc(word)}</span>` : "";
  };
  const refChip = ref => (ref ? `<span class="dk-ref">${esc(ref)}</span>` : "");

  // A ticket. t = { ref, kind ("Alert", "Request", "Incident"…), title, priority (low…critical), status,
  // fields: [[label, value], …], bodyLabel, body (html), foot (html), steps: [{ label, state: "done"|"now"|"todo" }] }.
  // o = { headingId, level (2), statusId (so the caller can update the pill), compact }.
  function ticket(t, o = {}) {
    const h = Math.min(Math.max(Number(o.level) || 2, 2), 4), pr = PRIORITY[t.priority] ? t.priority : "";
    const steps = t.steps?.length ? `<ol class="dk-steps" aria-label="Progress">${t.steps.map(s => `<li class="${esc(s.state || "todo")}">${s.state === "done" ? '<span class="sr-only">Done: </span>' : s.state === "now" ? '<span class="sr-only">Now: </span>' : ""}${esc(s.label)}</li>`).join("")}</ol>` : "";
    return `<article class="dk-ticket${pr ? ` p-${pr}` : ""}${o.compact ? " compact" : ""}"${o.headingId ? ` aria-labelledby="${esc(o.headingId)}"` : ""}>
      <header class="dk-head"><span class="dk-kind">${esc(t.kind || "Ticket")}</span>${refChip(t.ref)}${pr ? `<span class="dk-pri">${esc(PRIORITY[pr])}</span>` : ""}${pill(t.status, o.statusId)}</header>
      <h${h} class="dk-title"${o.headingId ? ` id="${esc(o.headingId)}" tabindex="-1"` : ""}>${esc(t.title)}</h${h}>
      ${t.fields?.length ? `<dl class="dk-fields">${t.fields.filter(f => f && f[1] !== undefined && f[1] !== "").map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${t.body ? `<div class="dk-body">${t.bodyLabel ? `<p class="dk-label">${esc(t.bodyLabel)}</p>` : ""}${t.body}</div>` : ""}
      ${steps}${t.foot ? `<div class="dk-foot">${t.foot}</div>` : ""}</article>`;
  }

  // An avatar: the person's portrait when there is one (decorative: their name is next to it), else their initials.
  const avatar = (who, photo, cls = "dk-av") => (photo
    ? `<img class="${cls} dk-photo" src="${esc(photo)}" alt="" width="38" height="38" loading="lazy" decoding="async">`
    : `<span class="${cls}" aria-hidden="true">${esc(initials(who))}</span>`);

  // A scene picture (a client's site, say): full description for screen readers, a smaller file on phones.
  // img = { src, small, width, height, alt }.
  const scene = (img, { lazy = false } = {}) => (img?.src
    ? `<img class="dk-scene" src="${esc(img.src)}"${img.small ? ` srcset="${esc(img.small)} 800w, ${esc(img.src)} ${Number(img.width) || 1536}w" sizes="(max-width: 900px) 100vw, 800px"` : ""} alt="${esc(img.alt)}" width="${Number(img.width) || 1536}" height="${Number(img.height) || 538}"${lazy ? ' loading="lazy"' : ""} decoding="async">`
    : "");

  // A staff message. m = { from, role, team, at, html, ref, status, me, sys, typing, photo }.
  // System notices (sys) are one slim line with an icon; people get an avatar, a team badge and a bubble.
  function message(m) {
    if (m.sys) return `<li class="dk-msg sys"><span class="dk-sysicon" aria-hidden="true">!</span><p><b>${esc(m.from || "Alert system")}</b> <span class="dk-time">${esc(m.at || "")}</span> ${refChip(m.ref)} ${m.html || ""}</p></li>`;
    const who = m.me ? "You" : m.from;
    return `<li class="dk-msg${m.me ? " me" : ""}${m.typing ? " typing" : ""}${m.status === "asks" || m.status === "refused" ? " warn" : ""}" style="--dk-h:${hue(m.team || who)}">
      ${avatar(who, m.me ? "" : m.photo)}
      <div class="dk-bubble"><p class="dk-who"><b>${esc(who)}</b>${m.team || m.role ? `<span class="dk-team">${esc(m.role || m.team)}</span>` : ""}<span class="dk-time">${esc(m.at || "")}</span></p>
        ${m.ref || m.status ? `<p class="dk-about">${refChip(m.ref)}${pill(m.status)}</p>` : ""}
        <div class="dk-text">${m.typing ? '<span class="dk-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : m.html || ""}</div></div></li>`;
  }

  // A channel: a header (# name, who's in it) above a list of messages.
  const channel = (name, about, listAttrs = "") => `<div class="dk-channel"><p class="dk-chan"><span aria-hidden="true">#</span>${esc(name)}${about ? `<span class="dk-chan-about">${esc(about)}</span>` : ""}</p><ol class="dk-msgs" ${listAttrs}></ol></div>`;

  return { ticket, message, channel, avatar, scene, pill, refChip, initials, hue, STATUS, PRIORITY };
})();
