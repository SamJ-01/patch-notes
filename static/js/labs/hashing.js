// Hashing lab: fingerprints, the avalanche effect, checking a download, why MD5 and SHA-1 are retired,
// and why password storage needs salts and slow hashes. Everything is computed live in the browser:
// SHA-1, SHA-256 and PBKDF2 with the Web Crypto API, MD5 with the small implementation below (Web Crypto
// leaves MD5 out on purpose). The pure functions are tested in tests/hashing.test.mjs.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

// ---------- MD5 (RFC 1321). Only for teaching: it shows what a 128-bit hash looks like.
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
export function md5(input) {
  const msg = typeof input === "string" ? enc.encode(input) : input;
  const len = msg.length, total = (((len + 8) >> 6) + 1) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg); buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, (len * 8) >>> 0, true);
  view.setUint32(total - 4, Math.floor(len / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => view.getUint32(off + i * 4, true));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((w, i) => out.setUint32(i * 4, w, true));
  return hex(out.buffer);
}

export const ALGORITHMS = ["MD5", "SHA-1", "SHA-256"];
export async function digest(alg, text) {
  if (alg === "MD5") return md5(text);
  return hex(await globalThis.crypto.subtle.digest(alg, enc.encode(text)));
}
// How many of the bits differ between two hex hashes of the same length.
export function diffBits(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } }
  return n;
}
// A deliberately slow password hash, as recommended for storage: PBKDF2-HMAC-SHA256.
export async function pbkdf2(password, salt, iterations) {
  const key = await globalThis.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations }, key, 256));
}
// Check a list of guesses against a table of stored hashes. Unsalted: one hash per guess covers every
// account. Salted: each guess must be hashed again for every account's salt. Returns what matched and the work done.
export async function tryGuesses(accounts, guesses, { salted }) {
  const cracked = {}; let hashes = 0;
  if (!salted) {
    for (const g of guesses) {
      const h = await digest("SHA-1", g); hashes++;
      for (const a of accounts) if (a.hash === h) cracked[a.user] = g;
    }
  } else {
    for (const a of accounts) for (const g of guesses) {
      hashes++;
      if (await digest("SHA-256", a.salt + g) === a.hash) { cracked[a.user] = g; break; }
    }
  }
  return { cracked, hashes };
}
// Accounts whose stored hash is shared with another account.
export const sharedHashes = accounts => accounts.filter(a => accounts.some(b => b !== a && b.hash === a.hash)).map(a => a.user);

// ---------- the on-page lab
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved), parts = lab.parts;
  let finished = parts.every(p => done.has(p.id));
  const mark = id => {
    if (!done.has(id)) { done.add(id); onPart(id); }
    drawParts();
    if (!finished && parts.every(p => done.has(p.id))) { finished = true; onComplete(); }
  };

  const q = (id, data) => `<fieldset class="ev-set hl-q" id="${id}"><legend class="q">${esc(data.q)}</legend>
    ${data.options.map((o, i) => `<div class="ev-item"><label><input type="radio" name="${id}" value="${i}"><span>${esc(o)}</span></label></div>`).join("")}
    <div class="row"><button class="btn" type="button" data-check="${id}">Check</button></div><div class="hl-fb" aria-live="polite"></div></fieldset>`;
  const hashRows = (prefix) => ALGORITHMS.map(a => `<div class="hl-row"><dt>${a}</dt><dd class="mono" id="${prefix}-${a}"></dd></div>`).join("");
  const table = (id, rows, salted) => `<div class="vl-table" role="region" aria-label="${salted ? "Salted" : "Unsalted"} password table" tabindex="0"><table class="tbl hl-table" id="${id}">
    <thead><tr><th scope="col">User</th>${salted ? '<th scope="col">Salt</th>' : ""}<th scope="col">Stored hash (${salted ? "SHA-256 of salt + password" : "SHA-1, no salt"})</th><th scope="col">Found</th></tr></thead>
    <tbody>${rows.map(r => `<tr><th scope="row">${esc(r.user)}</th>${salted ? `<td class="mono">${esc(r.salt)}</td>` : ""}<td class="mono hl-hash">${esc(r.hash)}</td><td data-user="${esc(r.user)}">–</td></tr>`).join("")}</tbody></table></div>`;

  root.innerHTML = `<div class="hash-lab stack">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row pchips" id="h-parts"></div>
    <details class="tbl simplification"><summary>How this lab differs from real systems</summary><p>${esc(lab.simplification)}</p></details>

    <section class="panel"><h2>1. A fingerprint for any data</h2><p>${esc(lab.text.fingerprint)}</p>
      <label class="hl-label" for="h-in">Type anything</label><textarea id="h-in" rows="2" spellcheck="false">Patch Notes</textarea>
      <dl class="fields hl-out">${hashRows("h1")}</dl><p class="muted" id="h-len"></p></section>

    <section class="panel"><h2>2. Change one character</h2><p>${esc(lab.text.avalanche)}</p>
      <div class="hl-two"><label>First<input id="h-a" value="Patch Notes" spellcheck="false"></label><label>Second<input id="h-b" value="Patch notes" spellcheck="false"></label></div>
      <dl class="fields hl-out" id="h-diff"></dl></section>

    <section class="panel"><h2>3. Check a download</h2><p>${esc(lab.text.integrity)}</p>
      <p class="feedback"><b>${esc(lab.download.name)}</b><br>Published SHA-256: <span class="mono hl-hash">${esc(lab.download.sha256)}</span></p>
      <div class="hl-mirrors">${lab.download.mirrors.map((m, i) => `<div class="ev-item"><b>${esc(m.label)}</b><pre class="console hl-file">${esc(m.content)}</pre>
        <div class="row"><button class="btn ghost" type="button" data-mirror="${i}">Hash this file</button><button class="btn" type="button" data-pick="${i}">This one matches</button></div><p class="mono hl-hash" id="h-m${i}"></p></div>`).join("")}</div>
      <div class="hl-fb" id="h-dlfb" aria-live="polite"></div></section>

    <section class="panel"><h2>4. Why MD5 and SHA-1 are retired</h2>${lab.text.retired.map(p => `<p>${esc(p)}</p>`).join("")}
      ${q("q-retired", lab.questions.retired)}</section>

    <section class="panel"><h2>5. Fast is bad for passwords</h2><p>${esc(lab.text.speed)}</p>
      <div class="row"><button class="btn brand" type="button" id="h-bench">Measure it in your browser</button></div><div id="h-benchout" aria-live="polite"></div></section>

    <section class="panel"><h2>6. A leaked table with no salt</h2><p>${esc(lab.text.unsalted)}</p>
      ${table("h-t1", lab.unsalted, false)}
      <fieldset class="ev-set" id="q-shared"><legend class="q">Without guessing anything: which accounts share a password?</legend>
        ${lab.unsalted.map(r => `<div class="ev-item"><label><input type="checkbox" value="${esc(r.user)}"><span>${esc(r.user)}</span></label></div>`).join("")}
        <div class="row"><button class="btn" type="button" id="h-shared">Check</button></div><div class="hl-fb" aria-live="polite"></div></fieldset>
      <p>${esc(lab.text.guess)}</p><p class="muted mono hl-guesses">${lab.guesses.map(esc).join(" · ")}</p>
      <div class="row"><button class="btn brand" type="button" id="h-try1">Try the list against this table</button></div><div class="hl-fb" id="h-try1out" aria-live="polite"></div></section>

    <section class="panel"><h2>7. The same passwords, salted</h2><p>${esc(lab.text.salted)}</p>
      ${table("h-t2", lab.salted, true)}
      <div class="row"><button class="btn brand" type="button" id="h-try2">Try the same list again</button></div><div class="hl-fb" id="h-try2out" aria-live="polite"></div></section>

    <section class="panel"><h2>8. Storing passwords properly</h2>${lab.text.defend.map(p => `<p>${esc(p)}</p>`).join("")}
      ${q("q-defend", lab.questions.defend)}</section>
    ${lab.next ? `<section class="panel" id="h-next" hidden><h2>Take it further</h2><ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>` : ""}
    <div class="row"><button class="btn ghost" type="button" id="h-reset">↺ Reset lab</button></div>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  function drawParts() {
    $("h-parts").innerHTML = parts.map(p => `<span class="pchip">${done.has(p.id) ? "✓" : "○"} ${esc(p.label)}</span>`).join("");
    if ($("h-next")) $("h-next").hidden = !parts.every(p => done.has(p.id));
  }
  const say = (el, ok, html) => { el.innerHTML = `<div class="feedback"><b class="${ok ? "ok" : "no"}">${ok ? "Yes." : "Not quite."}</b> ${html}</div>`; };

  // 1. fingerprint
  let typed = false;
  async function fingerprint() {
    const text = $("h-in").value;
    for (const a of ALGORITHMS) $(`h1-${a}`).textContent = await digest(a, text);
    $("h-len").textContent = `${text.length} character${text.length === 1 ? "" : "s"} in. Out: always 32, 40 and 64 hex digits (128, 160 and 256 bits), whatever you type.`;
    if (typed) mark("fingerprint");
  }
  $("h-in").addEventListener("input", () => { typed = true; fingerprint(); });

  // 2. avalanche
  async function avalanche() {
    const a = $("h-a").value, b = $("h-b").value, rows = [];
    for (const alg of ALGORITHMS) {
      const ha = await digest(alg, a), hb = await digest(alg, b), bits = ha.length * 4, n = diffBits(ha, hb);
      rows.push(`<div class="hl-row"><dt>${alg}</dt><dd><span class="mono">${ha}</span><span class="mono">${hb}</span><span>${a === b ? "Same input, same hash." : `${n} of ${bits} bits differ (${Math.round((n / bits) * 100)}%).`}</span></dd></div>`);
    }
    $("h-diff").innerHTML = rows.join("");
    if (a !== b && (a !== "Patch Notes" || b !== "Patch notes")) mark("avalanche");
  }
  ["h-a", "h-b"].forEach(id => $(id).addEventListener("input", avalanche));

  // 3. integrity
  root.querySelectorAll("[data-mirror]").forEach(b => b.addEventListener("click", async () => {
    const i = Number(b.dataset.mirror), h = await digest("SHA-256", lab.download.mirrors[i].content);
    $(`h-m${i}`).textContent = `SHA-256: ${h}`;
  }));
  root.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", async () => {
    const i = Number(b.dataset.pick), m = lab.download.mirrors[i];
    const ok = (await digest("SHA-256", m.content)) === lab.download.sha256;
    say($("h-dlfb"), ok, esc(m.why));
    if (ok) mark("integrity");
  }));

  // 4 and 8. questions
  root.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.check, data = lab.questions[id.slice(2)], fs = $(id);
    const pick = fs.querySelector("input:checked");
    if (!pick) return say(fs.querySelector(".hl-fb"), false, "Choose an answer first.");
    const ok = Number(pick.value) === data.answer;
    say(fs.querySelector(".hl-fb"), ok, esc(ok ? data.why : data.wrong));
    if (ok) mark(data.part);
  }));

  // 5. speed, measured live
  $("h-bench").addEventListener("click", async () => {
    const out = $("h-benchout"), btn = $("h-bench");
    btn.disabled = true; out.innerHTML = `<p class="muted">Measuring for about a second…</p>`;
    let n = 0; const t0 = performance.now();
    while (performance.now() - t0 < 1000) { await digest("SHA-256", "guess" + n); n++; }
    const fast = n / ((performance.now() - t0) / 1000);
    const t1 = performance.now(); await pbkdf2("guess", "salt", lab.pbkdf2Iterations); const slowMs = performance.now() - t1;
    const slow = 1000 / slowMs;
    out.innerHTML = `<dl class="fields"><div><dt>SHA-256, once</dt><dd><span>about <b>${Math.round(fast).toLocaleString()}</b> guesses a second</span></dd></div>
      <div><dt>PBKDF2-SHA256, ${lab.pbkdf2Iterations.toLocaleString()} rounds</dt><dd><span>about <b>${slow < 10 ? slow.toFixed(1) : Math.round(slow)}</b> guesses a second (${Math.round(slowMs)} ms each)</span></dd></div></dl>
      <p>${esc(lab.text.speedResult.replace("{ratio}", Math.round(fast / slow).toLocaleString()))}</p>`;
    btn.disabled = false;
    mark("speed");
  });

  // 6 and 7. the leaked tables
  $("h-shared").addEventListener("click", () => {
    const fs = $("q-shared"), picked = [...fs.querySelectorAll("input:checked")].map(i => i.value).sort();
    const want = sharedHashes(lab.unsalted).sort(), ok = picked.join() === want.join();
    say(fs.querySelector(".hl-fb"), ok, ok ? esc(lab.text.sharedRight) : "Look for hashes that are exactly the same. Identical hash, identical password: no salt means no difference.");
    if (ok) mark("shared");
  });
  async function attack(tableId, accounts, salted, outId) {
    const r = await tryGuesses(accounts, lab.guesses, { salted });
    root.querySelectorAll(`#${tableId} [data-user]`).forEach(td => { const g = r.cracked[td.dataset.user]; td.textContent = g ? `"${g}"` : "not in the list"; td.classList.toggle("hl-hit", !!g); });
    const found = Object.keys(r.cracked).length;
    $(outId).innerHTML = `<div class="feedback">${found} of ${accounts.length} accounts matched, using <b>${r.hashes}</b> hash calculations. ${esc(salted ? lab.text.saltedResult : lab.text.unsaltedResult)}</div>`;
    return r;
  }
  $("h-try1").addEventListener("click", async () => { await attack("h-t1", lab.unsalted, false, "h-try1out"); mark("guess"); });
  $("h-try2").addEventListener("click", async () => { await attack("h-t2", lab.salted, true, "h-try2out"); mark("salt"); });
  $("h-reset").addEventListener("click", onReset);

  drawParts(); fingerprint(); avalanche();
}
