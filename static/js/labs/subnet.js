// Subnetting trainer: a visual calculator that shows the network/host split in binary, then practice questions.
// The maths (subnetInfo, makeQuestion, check) is pure and tested in tests/labs.test.mjs; mount() is the on-page lab.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function ipToInt(s) {
  const m = String(s).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}
export const intToIp = n => [24, 16, 8, 0].map(s => (n >>> s) & 255).join(".");
export const maskOf = prefix => (prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0);
export const usableHosts = prefix => 2 ** (32 - prefix) - 2;
// The smallest subnet (largest prefix) with room for n hosts.
export const prefixFor = n => { for (let p = 30; p >= 1; p--) if (usableHosts(p) >= n) return p; return null; };

// Everything about ip/prefix, plus the "block size" shortcut people use in the exam.
export function subnetInfo(ip, prefix) {
  const addr = typeof ip === "number" ? ip : ipToInt(ip);
  const mask = maskOf(prefix);
  const network = (addr & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
  const octet = Math.floor((prefix - 1) / 8);                 // the "interesting" octet, where the split happens
  const maskOctet = (mask >>> (24 - octet * 8)) & 255;
  const block = 256 - maskOctet;
  return {
    ip: intToIp(addr), prefix, mask: intToIp(mask), wildcard: intToIp(~mask >>> 0),
    network: intToIp(network), broadcast: intToIp(broadcast),
    first: intToIp(network + 1), last: intToIp(broadcast - 1),
    hosts: usableHosts(prefix), octet, maskOctet, block,
    blockStart: ((network >>> (24 - octet * 8)) & 255),
  };
}

export const QTYPES = {
  network: "What is the network address?",
  broadcast: "What is the broadcast address?",
  first: "What is the first usable host?",
  last: "What is the last usable host?",
  hosts: "How many usable hosts does this subnet have?",
  mask: "What is the subnet mask, in dotted decimal?",
};

const randInt = (a, b, rng) => a + Math.floor(rng() * (b - a + 1));
// Private addresses, like the ones you'll subnet at work and in the exam.
function randomIp(rng) {
  const k = randInt(0, 2, rng);
  const o = k === 0 ? [10, randInt(0, 255, rng)] : k === 1 ? [172, randInt(16, 31, rng)] : [192, 168];
  return `${o[0]}.${o[1]}.${randInt(0, 255, rng)}.${randInt(1, 254, rng)}`;
}

export function makeQuestion(rng = Math.random, type = null) {
  const types = [...Object.keys(QTYPES), "needs"];
  type = type || types[Math.floor(rng() * types.length)];
  if (type === "needs") {
    const n = [5, 12, 25, 50, 60, 100, 120, 200, 250, 500, 1000][randInt(0, 10, rng)];
    const p = prefixFor(n);
    return { type, q: `A department needs ${n} hosts. What's the smallest subnet that fits? Answer as a prefix, like /26.`, answer: "/" + p, prefix: p, n };
  }
  const prefix = randInt(0, 3, rng) === 0 ? randInt(17, 23, rng) : randInt(24, 30, rng);  // mostly the last octet, sometimes the third
  const ip = randomIp(rng), info = subnetInfo(ip, prefix);
  return { type, ip, prefix, q: QTYPES[type], answer: String(info[type]) };
}

export function check(q, input) {
  const v = String(input || "").trim().replace(/\s+/g, "");
  if (q.type === "needs") return v.replace(/^\/?/, "/") === q.answer;
  if (q.type === "hosts") return v.replace(/,/g, "") === q.answer;
  return v === q.answer;
}

// The working, step by step, using the block-size method.
export function explain(q) {
  if (q.type === "needs") return `Hosts per subnet = 2^(host bits) − 2. 2^${32 - q.prefix} − 2 = ${usableHosts(q.prefix)} fits ${q.n}${q.prefix < 30 ? `, but /${q.prefix + 1} only gives ${usableHosts(q.prefix + 1)}` : ""}. So /${q.prefix}.`;
  const i = subnetInfo(q.ip, q.prefix), oct = ["1st", "2nd", "3rd", "4th"][i.octet];
  const ipOct = q.ip.split(".")[i.octet];
  const steps = [`/${q.prefix} means ${q.prefix} network bits, so the mask is ${i.mask}.`];
  if (q.type === "mask") return steps[0];
  if (q.type === "hosts") return `${32 - q.prefix} host bits: 2^${32 - q.prefix} − 2 = ${i.hosts} (minus the network and broadcast addresses).`;
  steps.push(`The split is in the ${oct} octet (mask ${i.maskOctet}), so the block size is 256 − ${i.maskOctet} = ${i.block}.`);
  steps.push(`${ipOct} falls in the block starting at ${i.blockStart}, so the network is ${i.network} and the broadcast (one before the next block) is ${i.broadcast}.`);
  if (q.type === "first") steps.push(`First host = network + 1 = ${i.first}.`);
  if (q.type === "last") steps.push(`Last host = broadcast − 1 = ${i.last}.`);
  return steps.join(" ");
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved), tried = new Set();
  let ip = "192.168.10.77", prefix = 26, prac = null;

  root.innerHTML = `<div class="subnet">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="sn-parts"></div>
    <section class="panel">
      <div class="panel-title"><h2>See the split</h2></div>
      <div class="sn-controls">
        <label class="sn-field"><span class="eyebrow">IP address</span><input id="sn-ip" class="sn-input" value="${ip}" inputmode="decimal" autocomplete="off" spellcheck="false"></label>
        <label class="sn-field sn-slide"><span class="eyebrow">Prefix <b id="sn-pval" class="mono">/${prefix}</b></span><input id="sn-prefix" type="range" min="8" max="30" value="${prefix}" aria-describedby="sn-help"></label>
      </div>
      <p class="muted" id="sn-help">Drag the prefix. <span class="sn-key net">Network bits</span> say which subnet you're in; <span class="sn-key host">host bits</span> number the devices inside it.</p>
      <div class="sn-bits" id="sn-bits" aria-hidden="true"></div>
      <div class="stat-row" id="sn-stats" aria-live="polite"></div>
      <p class="osi-tip" id="sn-tip"></p>
    </section>
    <section class="panel" id="sn-prac"></section>
    <section class="panel"><div class="panel-title"><h2>Cheat sheet: the last octet</h2></div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Prefix cheat sheet"><table class="sn-table"><thead><tr><th>Prefix</th><th>Mask</th><th>Block size</th><th>Usable hosts</th></tr></thead>
      <tbody>${[24, 25, 26, 27, 28, 29, 30].map(p => { const i = subnetInfo("0.0.0.0", p); return `<tr><td>/${p}</td><td>${i.mask}</td><td>${i.block}</td><td>${i.hosts}</td></tr>`; }).join("")}</tbody></table></div>
    </section>
    <div class="row"><button class="btn ghost" id="sn-reset">↺ Reset lab</button></div>
  </div>`;
  const $ = id => root.querySelector("#" + id);

  function renderParts() {
    const parts = [["explore", `Try ${lab.exploreGoal} different prefixes (${Math.min(tried.size, lab.exploreGoal)}/${lab.exploreGoal})`], ["practice", `Get ${lab.passScore} of ${lab.practiceLength} right`]];
    $("sn-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(done.has(k) && k === "explore" ? "Explore the split" : t)}</span>`).join("");
  }
  function markPart(k) { if (done.has(k)) return; done.add(k); onPart(k); renderParts(); if (done.has("explore") && done.has("practice")) onComplete(); }

  function drawCalc() {
    const addr = ipToInt(ip);
    $("sn-pval").textContent = "/" + prefix;
    if (addr === null) { $("sn-stats").innerHTML = `<div class="feedback">That isn't a valid IPv4 address. Four numbers from 0 to 255, separated by dots.</div>`; $("sn-bits").innerHTML = ""; $("sn-tip").textContent = ""; return; }
    const i = subnetInfo(addr, prefix), mask = maskOf(prefix);
    const row = (val, label) => `<div class="sn-row"><span class="sn-lbl">${label}</span><div class="sn-octets">${[0, 1, 2, 3].map(o => `<div class="sn-oct${o === i.octet ? " hot" : ""}"><div class="sn-cells">${[...Array(8)].map((_, b) => { const bit = o * 8 + b; return `<i class="${bit < prefix ? "net" : "host"}">${(val >>> (31 - bit)) & 1}</i>`; }).join("")}</div><span class="sn-dec">${(val >>> (24 - o * 8)) & 255}</span></div>`).join("")}</div></div>`;
    $("sn-bits").innerHTML = row(addr, "IP") + row(mask, "Mask");
    const stat = (k, v) => `<div class="stat"><span class="eyebrow">${k}</span><b class="mono">${v}</b></div>`;
    $("sn-stats").innerHTML = stat("Mask", i.mask) + stat("Network", i.network) + stat("Broadcast", i.broadcast) + stat("First host", i.first) + stat("Last host", i.last) + stat("Usable hosts", i.hosts.toLocaleString()) + stat("Block size", i.block);
    $("sn-tip").innerHTML = `<b>Shortcut:</b> the split is in the ${["1st", "2nd", "3rd", "4th"][i.octet]} octet, where the mask is ${i.maskOctet}. Block size = 256 − ${i.maskOctet} = ${i.block}, so subnets start at 0, ${i.block}, ${i.block * 2}… ${(addr >>> (24 - i.octet * 8)) & 255} sits in the one starting at ${i.blockStart}.`;
  }
  $("sn-prefix").addEventListener("input", e => {
    prefix = Number(e.target.value); tried.add(prefix);
    if (tried.size >= lab.exploreGoal) markPart("explore");
    renderParts(); drawCalc();
  });
  $("sn-ip").addEventListener("input", e => { ip = e.target.value; drawCalc(); });

  function drawPrac() {
    const box = $("sn-prac");
    if (!prac) {
      box.innerHTML = `<div class="panel-title"><h2>Practice</h2></div><p class="muted">${lab.practiceLength} questions. Type the answer, like you'll work it out on paper in the exam. Wrong answers show the working.</p><button class="btn brand" id="sp-go" style="justify-self:start">Start practice</button>`;
      $("sp-go").addEventListener("click", () => start(Array.from({ length: lab.practiceLength }, () => makeQuestion())));
      return;
    }
    const z = prac;
    if (z.i >= z.qs.length) {
      const full = z.qs.length === lab.practiceLength, passed = full && z.score >= lab.passScore;
      if (passed) markPart("practice");
      box.innerHTML = `<div class="panel-title"><h2>Practice</h2><span class="mono">${z.score}/${z.qs.length}</span></div>
        <p>${passed ? "Passed. Subnetting gets fast with repetition: come back tomorrow for a new set." : full ? `You need ${lab.passScore} to pass.` : "Review done."}</p>
        <div class="row">${z.wrong.length ? `<button class="btn brand" id="sp-retry">↺ Retry the ${z.wrong.length} you missed</button>` : ""}<button class="btn ${z.wrong.length ? "ghost" : "brand"}" id="sp-again">New set</button></div>`;
      $("sp-again").addEventListener("click", () => start(Array.from({ length: lab.practiceLength }, () => makeQuestion())));
      $("sp-retry")?.addEventListener("click", () => start(z.wrong.slice()));
      $(z.wrong.length ? "sp-retry" : "sp-again").focus();
      return;
    }
    const q = z.qs[z.i], answered = z.given != null, ok = answered && check(q, z.given);
    box.innerHTML = `<div class="panel-title"><h2>Practice</h2><span class="mono">${z.i + 1}/${z.qs.length}</span></div>
      ${q.ip ? `<p class="sn-given mono">${esc(q.ip)}/${q.prefix}</p>` : ""}
      <p class="q">${esc(q.q)}</p>
      <form class="row" id="sp-form"><input id="sp-in" class="sn-input" aria-label="Your answer" autocomplete="off" spellcheck="false" inputmode="${q.type === "hosts" ? "numeric" : "text"}" value="${esc(z.given ?? "")}" ${answered ? "disabled" : ""}><button class="btn brand" ${answered ? "disabled" : ""}>Check</button></form>
      ${answered ? `<div class="feedback">${ok ? '<b class="ok">Correct.</b>' : `<b class="no">The answer is ${esc(q.answer)}.</b>`} ${esc(explain(q))}</div>
        <button class="btn brand" id="sp-next" style="justify-self:start">${z.i + 1 < z.qs.length ? "Next ›" : "See score"}</button>` : ""}`;
    $("sp-form").addEventListener("submit", e => {
      e.preventDefault();
      const v = $("sp-in").value; if (!v.trim()) return;
      z.given = v; if (check(q, v)) z.score++; else z.wrong.push(q);
      drawPrac(); $("sp-next")?.focus();
    });
    $("sp-next")?.addEventListener("click", () => { z.i++; z.given = null; drawPrac(); $("sp-in")?.focus(); });
  }
  function start(qs) { prac = { qs, i: 0, score: 0, wrong: [], given: null }; drawPrac(); $("sp-in")?.focus(); }

  $("sn-reset").addEventListener("click", onReset);
  renderParts(); drawCalc(); drawPrac();
}
