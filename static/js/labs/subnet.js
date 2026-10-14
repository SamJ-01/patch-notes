// Subnetting: a live subnet calculator (mountCalc, also used on its own page) and the trainer lab (mount).
// The maths (subnetInfo, classify, splitNetwork, makeQuestion, check) is pure and tested in tests/labs.test.mjs.

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
// /31 is a two-address point-to-point link (RFC 3021) and /32 is a single host, so neither loses two addresses.
export const usableHosts = prefix => (prefix === 32 ? 1 : prefix === 31 ? 2 : 2 ** (32 - prefix) - 2);
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
    first: intToIp(prefix >= 31 ? network : network + 1), last: intToIp(prefix >= 31 ? broadcast : broadcast - 1),
    total: 2 ** (32 - prefix), networkInt: network, broadcastInt: broadcast,
    hosts: usableHosts(prefix), octet, maskOctet, block,
    blockStart: ((network >>> (24 - octet * 8)) & 255),
  };
}

// A dotted mask like 255.255.255.192 as a prefix (26), or null if the 1s aren't contiguous.
export function maskToPrefix(s) {
  const n = ipToInt(s);
  if (n === null) return null;
  const p = 32 - Math.log2(((~n >>> 0) + 1));
  return Number.isInteger(p) && maskOf(p) === n ? p : null;
}
// "10.0.0.0/22" or just "10.0.0.5"
export function parseCidr(s) {
  const [ip, pre] = String(s).trim().split("/");
  const addr = ipToInt(ip);
  if (addr === null) return null;
  if (pre === undefined) return { addr, prefix: null };
  const p = Number(pre);
  return /^\d{1,2}$/.test(pre) && p >= 0 && p <= 32 ? { addr, prefix: p } : null;
}

// Classful addressing: retired in 1993 but still on the exam.
export function ipClass(addr) {
  const a = addr >>> 24;
  if (a < 128) return { cls: "A", range: "1–126", defaultPrefix: 8 };
  if (a < 192) return { cls: "B", range: "128–191", defaultPrefix: 16 };
  if (a < 224) return { cls: "C", range: "192–223", defaultPrefix: 24 };
  if (a < 240) return { cls: "D", range: "224–239", defaultPrefix: null, note: "Multicast: one sender, many receivers. Not split into subnets." };
  return { cls: "E", range: "240–255", defaultPrefix: null, note: "Experimental: reserved, never used on real networks." };
}
const inNet = (addr, net, p) => ((addr & maskOf(p)) >>> 0) === ipToInt(net);
// What kind of address this is. Network+ asks about all of these.
export function classify(addr) {
  if (addr === 0xFFFFFFFF) return { kind: "broadcast", label: "Limited broadcast", note: "Sent to every device on the local network. Routers never forward it." };
  if (inNet(addr, "0.0.0.0", 8)) return { kind: "special", label: "\"This network\"", note: "0.0.0.0 means \"no address yet\" or \"any address\". Not usable on a device." };
  if (inNet(addr, "127.0.0.0", 8)) return { kind: "special", label: "Loopback", note: "127.0.0.1 is the computer talking to itself. Packets never leave the machine." };
  if (inNet(addr, "169.254.0.0", 16)) return { kind: "special", label: "APIPA / link-local", note: "A device gives itself one of these when it can't reach a DHCP server. Seeing it usually means DHCP is broken." };
  if (inNet(addr, "10.0.0.0", 8) || inNet(addr, "172.16.0.0", 12) || inNet(addr, "192.168.0.0", 16)) return { kind: "private", label: "Private (RFC 1918)", note: "Used inside homes and offices. Not routed on the internet: NAT swaps it for a public address on the way out." };
  if (inNet(addr, "100.64.0.0", 10)) return { kind: "special", label: "Carrier-grade NAT", note: "Used by internet providers to share public addresses between customers (RFC 6598)." };
  if (inNet(addr, "224.0.0.0", 4)) return { kind: "special", label: "Multicast", note: "Delivered to every device that has joined the group." };
  if (inNet(addr, "240.0.0.0", 4)) return { kind: "special", label: "Reserved", note: "Class E: reserved for experiments." };
  return { kind: "public", label: "Public", note: "Routable on the internet. Assigned to organisations by internet registries." };
}

// Divide a network into `count` equal subnets (rounded up to a power of two).
export function splitNetwork(addr, prefix, count, limit = 64) {
  const bits = Math.ceil(Math.log2(Math.max(1, count)));
  const np = prefix + bits;
  if (np > 32) return null;
  const base = (addr & maskOf(prefix)) >>> 0, size = 2 ** (32 - np), total = 2 ** bits;
  const subnets = [];
  for (let k = 0; k < Math.min(total, limit); k++) subnets.push(subnetInfo((base + k * size) >>> 0, np));
  return { prefix: np, borrowed: bits, total, subnets };
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

const ORD = ["1st", "2nd", "3rd", "4th"];
const PRESETS = [["Home Wi-Fi", "192.168.1.10/24"], ["Small office", "10.20.4.50/23"], ["Router-to-router link", "10.0.0.1/30"], ["Huge company", "10.0.0.1/8"], ["DHCP failed", "169.254.20.7/16"], ["Public address", "8.8.8.8/24"]];
// Device icons drawn (the rest are counted). Phones get a compact 4-column layout so the icons stay readable.
const LAYOUTS = {
  wide: { W: 640, cols: 8, rx: 60, sx: 150, sw: 80, dx: 300 },
  narrow: { W: 380, cols: 4, rx: 36, sx: 86, sw: 64, dx: 206 },
};
function netSvg(L) {
  const slots = L.cols * 3, pos = k => [L.dx + (k % L.cols) * 42, 48 + Math.floor(k / L.cols) * 72];
  return `<svg viewBox="0 0 ${L.W} 236" id="sc-svg" role="img" aria-labelledby="sc-netcap">
    <g class="sc-trunk"><line x1="${L.rx + 24}" y1="120" x2="${L.sx}" y2="120"/></g>
    ${[...Array(slots)].map((_, k) => { const [x, y] = pos(k); return `<line class="sc-wire" x1="${L.sx + L.sw}" y1="120" x2="${x - 16}" y2="${y}"/>`; }).join("")}
    <g class="sc-router" id="sc-router"><circle cx="${L.rx}" cy="120" r="24"/><path class="sc-glyph" d="M${L.rx - 12} 120h24M${L.rx + 6} 114l6 6-6 6M${L.rx - 6} 114l-6 6 6 6"/><title id="sc-rtitle"></title></g>
    <g class="sc-switch"><rect x="${L.sx}" y="106" width="${L.sw}" height="28" rx="4"/>${[...Array(Math.floor((L.sw - 10) / 11))].map((_, k) => `<rect class="sc-port" x="${L.sx + 9 + k * 11}" y="116" width="7" height="7" rx="1"/>`).join("")}</g>
    ${[...Array(slots)].map((_, k) => { const [x, y] = pos(k); return `<g transform="translate(${x},${y})"><g class="sc-dev" style="--i:${k}"><rect x="-15" y="-12" width="30" height="20" rx="2"/><path class="stand" d="M-6 13h12M0 8v5"/><title></title></g></g>`; }).join("")}
    <text class="sc-more" id="sc-more" x="${L.W - 8}" y="228" text-anchor="end"></text>
  </svg>`;
}

// Binary rows: each bit coloured as network or host, octet values underneath.
function bitRows(rows, prefix, hot) {
  return rows.map(([label, val]) => `<div class="sn-row"><span class="sn-lbl">${label}</span><div class="sn-octets">${[0, 1, 2, 3].map(o => `<div class="sn-oct${o === hot ? " hot" : ""}"><div class="sn-cells">${[...Array(8)].map((_, b) => { const bit = o * 8 + b; return `<i class="${bit < prefix ? "net" : "host"}">${(val >>> (31 - bit)) & 1}</i>`; }).join("")}</div><span class="sn-dec">${(val >>> (24 - o * 8)) & 255}</span></div>`).join("")}</div></div>`).join("");
}

// The live subnet calculator. Every input updates everything else, including the network drawing.
export function mountCalc(el, { ip = "192.168.10.77", prefix = 26, onChange = () => {}, share = false } = {}) {
  let addr = ipToInt(ip) ?? ipToInt("192.168.10.77"), pre = Math.min(32, Math.max(8, prefix));
  el.innerHTML = `<div class="sc">
    <div class="sc-controls">
      <label class="sn-field"><span class="eyebrow">IP address (or paste a CIDR)</span><input id="sc-ip" class="sn-input" value="${intToIp(addr)}" autocomplete="off" spellcheck="false" inputmode="decimal"></label>
      <div class="sn-field"><span class="eyebrow" id="sc-plabel">Prefix length (CIDR)</span>
        <div class="sc-pre"><button class="btn ghost sc-step" type="button" id="sc-minus" aria-label="Shorter prefix: a bigger subnet">−</button><input id="sc-prefix" type="range" min="8" max="32" value="${pre}" aria-labelledby="sc-plabel"><button class="btn ghost sc-step" type="button" id="sc-plus" aria-label="Longer prefix: a smaller subnet">+</button><b class="mono sc-pval" id="sc-pval"></b></div></div>
      <label class="sn-field"><span class="eyebrow">Subnet mask</span><input id="sc-mask" class="sn-input" autocomplete="off" spellcheck="false" inputmode="decimal"></label>
      <label class="sn-field"><span class="eyebrow">Hosts you need</span><input id="sc-need" class="sn-input" type="number" min="1" max="16777214" placeholder="e.g. 50"></label>
    </div>
    <div class="row sc-presets" role="group" aria-label="Examples">${PRESETS.map(([l, c]) => `<button class="chip" type="button" data-preset="${c}">${l}</button>`).join("")}</div>
    <p class="sc-msg" id="sc-msg" role="status"></p>
    <div class="sc-badges" id="sc-badges"></div>
    <p class="sc-note" id="sc-note"></p>
    <div class="sc-net" id="sc-net"></div>
    <p class="sc-cap" id="sc-netcap"></p>
    <div class="stat-row sc-stats" id="sc-stats"></div>
    <h3 class="sc-h">Where your subnet sits</h3>
    <div class="sc-map" id="sc-map" role="img">${"<i></i>".repeat(256)}</div>
    <div class="sc-legend" aria-hidden="true"><span><i class="cur"></i>Your subnet</span><span><i class="nw"></i>Network and broadcast (reserved)</span><span><i class="me"></i>Your address</span><span><i class="b0"></i><i class="b1"></i>Other subnets</span></div>
    <p class="sc-cap" id="sc-mapcap"></p>
    <h3 class="sc-h">In binary</h3>
    <p class="muted sc-cap"><span class="sn-key net">Network bits</span> pick the subnet; <span class="sn-key host">host bits</span> number the devices in it. The network address is the IP AND the mask: a bit stays 1 only where both are 1.</p>
    <div class="sn-bits" id="sc-bits" aria-hidden="true"></div>
    <p class="osi-tip" id="sc-tip"></p>
    <details class="sc-split"><summary>Split this network into smaller subnets</summary>
      <label class="sc-splitctl">Split into <select id="sc-n">${[2, 4, 8, 16, 32, 64].map(n => `<option>${n}</option>`).join("")}</select> subnets</label>
      <p class="sc-cap" id="sc-splitcap"></p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Subnets after splitting"><table class="sn-table" id="sc-split"></table></div>
    </details>
    ${share ? `<div class="row"><button class="btn ghost" type="button" id="sc-copy">Copy summary</button><button class="btn ghost" type="button" id="sc-link">Copy link</button><span class="muted sc-cap" id="sc-copied" role="status"></span></div>` : ""}
  </div>`;
  const $ = id => el.querySelector("#" + id);
  const cells = [...$("sc-map").children];
  let layout = null, devs = [], wires = [];
  // Draw the network for the space available; redraw only when crossing between phone and wider layouts.
  function fitSvg() {
    const want = el.clientWidth && el.clientWidth < 520 ? "narrow" : "wide";
    if (want === layout) return false;
    layout = want; $("sc-net").innerHTML = netSvg(LAYOUTS[want]);
    devs = [...el.querySelectorAll(".sc-dev")]; wires = [...el.querySelectorAll(".sc-wire")];
    return true;
  }
  fitSvg();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (fitSvg()) draw(); }).observe(el);
  const say = msg => { const m = $("sc-msg"); m.textContent = msg || ""; m.hidden = !msg; m.classList.remove("good"); };

  function draw() {
    const i = subnetInfo(addr, pre), cls = ipClass(addr), kind = classify(addr);
    $("sc-prefix").value = pre; $("sc-pval").textContent = "/" + pre;
    if (document.activeElement !== $("sc-mask")) $("sc-mask").value = i.mask;
    const role = pre >= 31 ? "host" : addr === i.networkInt ? "network" : addr === i.broadcastInt ? "broadcast" : "host";

    $("sc-badges").innerHTML = [
      `<span class="sc-badge cls">Class ${cls.cls}</span>`,
      `<span class="sc-badge k-${kind.kind}">${esc(kind.label)}</span>`,
      `<span class="sc-badge">${esc(i.network)}/${pre}</span>`,
      role === "host" ? `<span class="sc-badge ok">Usable host address</span>` : `<span class="sc-badge warn">This is the ${role} address: no device can use it</span>`,
    ].join("");
    const def = cls.defaultPrefix;
    const classful = !def ? cls.note
      : pre > def ? `Class ${cls.cls} (first octet ${cls.range}) defaults to /${def}. You've borrowed ${pre - def} bit${pre - def > 1 ? "s" : ""} from the host part, making ${(2 ** (pre - def)).toLocaleString()} subnets.`
      : pre < def ? `Shorter than the class ${cls.cls} default of /${def}: this joins ${(2 ** (def - pre)).toLocaleString()} class ${cls.cls} networks into one (a supernet).`
      : `This is the default mask for class ${cls.cls} (first octet ${cls.range}).`;
    $("sc-note").textContent = `${kind.note} ${classful}`;

    // The drawing: one router (the default gateway takes the first host address), a switch, and the devices that fit.
    const SLOTS = devs.length, devices = Math.max(0, i.hosts - 1), shown = Math.min(devices, SLOTS), firstInt = ipToInt(i.first);
    let meK = role === "host" && addr !== firstInt && pre < 31 ? addr - firstInt - 1 : -1;
    if (meK >= SLOTS) meK = SLOTS - 1;  // far down the range: stand in for it with the last icon
    devs.forEach((d, k) => {
      const on = k < shown, me = k === meK && on;
      d.classList.toggle("on", on); d.classList.toggle("me", me); wires[k].classList.toggle("on", on);
      d.querySelector("title").textContent = on ? (me ? `You: ${intToIp(addr)}` : `Device ${intToIp(firstInt + 1 + k)}`) : "";
    });
    $("sc-router").classList.toggle("me", addr === firstInt && pre < 31);
    $("sc-rtitle").textContent = `Router (default gateway) ${i.first}`;
    $("sc-more").textContent = devices > SLOTS ? `+ ${(devices - SLOTS).toLocaleString()} more` : "";
    $("sc-netcap").textContent = pre === 32 ? `A /32 is a single address: used for one host route or a loopback interface, with no room for a network.`
      : pre === 31 ? `A /31 has just two addresses and no broadcast: perfect for a link between two routers (RFC 3021).`
      : `The router's port (the default gateway) usually takes the first address, ${i.first}. That leaves room for ${devices.toLocaleString()} more device${devices === 1 ? "" : "s"}. ${i.network} (network) and ${i.broadcast} (broadcast) are reserved.`;

    const stat = (k, v, cls = "") => `<div class="stat ${cls}"><span class="eyebrow">${k}</span><b class="mono">${v}</b></div>`;
    $("sc-stats").innerHTML = stat("CIDR notation", `${i.network}<wbr>/${pre}`, "hl") + stat("Subnet mask", i.mask) + stat("Wildcard mask", i.wildcard)
      + stat("Network address", i.network) + stat("Broadcast address", pre >= 31 ? "none" : i.broadcast)
      + stat("First usable", i.first) + stat("Last usable", i.last) + stat("Usable hosts", i.hosts.toLocaleString(), "hl")
      + stat("Total addresses", i.total.toLocaleString()) + stat(`Block size (${ORD[i.octet]} octet)`, i.block)
      + stat("Class", def ? `${cls.cls} (default /${def})` : cls.cls);

    // The map: the octet where the split happens, 0–255, banded into subnets.
    const myVal = (addr >>> (24 - i.octet * 8)) & 255, end = i.blockStart + i.block - 1, last = i.octet === 3 && pre < 31;
    cells.forEach((c, v) => {
      const cur = v >= i.blockStart && v <= end;
      c.className = (Math.floor(v / i.block) % 2 ? "b1" : "b0") + (cur ? " cur" : "") + (last && (v === i.blockStart || v === end) ? " nw" : "") + (v === myVal ? " me" : "");
    });
    const per = 256 ** (3 - i.octet), prefixOct = intToIp(addr).split(".").slice(0, i.octet).join(".");
    const cap = `The ${ORD[i.octet]} octet${prefixOct ? ` of ${prefixOct}.x` : ""}, 0 to 255${per > 1 ? `; each square is ${per.toLocaleString()} addresses` : ""}. Each band is one /${pre} subnet of ${i.block} square${i.block > 1 ? "s" : ""}, so ${256 / i.block} fit here. Yours is ${i.blockStart}${i.block > 1 ? `–${end}` : ""}.`;
    $("sc-mapcap").textContent = cap; $("sc-map").setAttribute("aria-label", cap);

    const mask = maskOf(pre);
    $("sc-bits").innerHTML = bitRows([["IP", addr], ["Mask", mask], ["AND", i.networkInt]], pre, i.octet);
    $("sc-tip").innerHTML = `<b>Shortcut:</b> the split is in the ${ORD[i.octet]} octet, where the mask is ${i.maskOctet}. Block size = 256 − ${i.maskOctet} = ${i.block}, so subnets start at 0, ${i.block}${i.block * 2 < 256 ? `, ${i.block * 2}` : ""}… ${myVal} sits in the one starting at ${i.blockStart}.`;
    drawSplit();
  }

  function drawSplit() {
    const n = Number($("sc-n").value), r = splitNetwork(addr, pre, n);
    if (!r) { $("sc-splitcap").textContent = `A /${pre} can't be split into ${n}: there aren't enough host bits left.`; $("sc-split").innerHTML = ""; return; }
    $("sc-splitcap").textContent = `Borrow ${r.borrowed} bit${r.borrowed > 1 ? "s" : ""}: /${pre} becomes /${r.prefix}, giving ${r.total} subnets of ${usableHosts(r.prefix).toLocaleString()} usable hosts each.`;
    $("sc-split").innerHTML = `<thead><tr><th>#</th><th>Network</th><th>Usable range</th><th>Broadcast</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${r.subnets.map((x, k) =>
      `<tr${addr >= x.networkInt && addr <= x.broadcastInt ? ' class="cur"' : ""}><td>${k + 1}</td><td>${x.network}/${x.prefix}</td><td>${x.first} – ${x.last}</td><td>${r.prefix >= 31 ? "none" : x.broadcast}</td><td><button class="link-btn" type="button" data-use="${x.network}/${x.prefix}">Open</button></td></tr>`).join("")}</tbody>`;
  }

  const changed = () => onChange({ addr: intToIp(addr), prefix: pre });
  const setPrefix = (p, keepNeed = false) => { pre = Math.min(32, Math.max(8, p)); if (!keepNeed) $("sc-need").value = ""; say(""); draw(); changed(); };
  const load = cidr => { const c = parseCidr(cidr); addr = c.addr; $("sc-ip").value = intToIp(addr); setPrefix(c.prefix ?? pre); };

  $("sc-ip").addEventListener("input", e => {
    const c = parseCidr(e.target.value);
    if (!c) return say("Not a valid IPv4 address yet: four numbers from 0 to 255, separated by dots (add /24 for a prefix).");
    if (c.prefix !== null && c.prefix < 8) return say("This calculator covers /8 to /32.");
    addr = c.addr; say("");
    if (c.prefix !== null) { pre = c.prefix; $("sc-need").value = ""; }
    draw(); changed();
  });
  $("sc-prefix").addEventListener("input", e => setPrefix(Number(e.target.value)));
  $("sc-minus").addEventListener("click", () => setPrefix(pre - 1));
  $("sc-plus").addEventListener("click", () => setPrefix(pre + 1));
  $("sc-mask").addEventListener("input", e => {
    const p = maskToPrefix(e.target.value);
    if (p === null) return say("Not a valid mask yet. The 1s must be continuous, like 255.255.255.192 (not 255.0.255.0).");
    if (p < 8) return say("This calculator covers /8 to /32.");
    setPrefix(p);
  });
  $("sc-mask").addEventListener("blur", () => draw());
  $("sc-need").addEventListener("input", e => {
    const n = Math.floor(Number(e.target.value));
    if (!n || n < 1) return say("");
    const p = prefixFor(n);
    if (p === null || p < 8) return say("That's more hosts than a /8 can hold (16,777,214).");
    setPrefix(p, true);
    say(`/${p} gives ${usableHosts(p).toLocaleString()} usable hosts: the smallest subnet that fits ${n.toLocaleString()}.${p < 30 ? ` /${p + 1} would only fit ${usableHosts(p + 1).toLocaleString()}.` : ""}`);
    $("sc-msg").classList.add("good");
  });
  el.querySelector(".sc-presets").addEventListener("click", e => { const b = e.target.closest("[data-preset]"); if (b) load(b.dataset.preset); });
  $("sc-n").addEventListener("change", drawSplit);
  $("sc-split").addEventListener("click", e => { const b = e.target.closest("[data-use]"); if (b) { load(b.dataset.use); $("sc-ip").scrollIntoView({ block: "center" }); } });
  if (share) {
    const copy = async (text, done) => { try { await navigator.clipboard.writeText(text); $("sc-copied").textContent = done; } catch (e) { $("sc-copied").textContent = "Couldn't copy: select and copy it by hand."; } };
    $("sc-copy").addEventListener("click", () => {
      const i = subnetInfo(addr, pre);
      copy([`${intToIp(addr)}/${pre}`, `Network: ${i.network}/${pre}`, `Mask: ${i.mask} (wildcard ${i.wildcard})`, `Usable: ${i.first} - ${i.last} (${i.hosts.toLocaleString()} hosts)`, `Broadcast: ${i.broadcast}`, `Class ${ipClass(addr).cls}, ${classify(addr).label}`].join("\n"), "Summary copied.");
    });
    $("sc-link").addEventListener("click", () => copy(location.href, "Link copied."));
  }
  say(""); draw();
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved), tried = new Set();
  const ip = "192.168.10.77", prefix = 26;
  let prac = null;

  root.innerHTML = `<div class="subnet">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="sn-parts"></div>
    <section class="panel">
      <div class="panel-title"><h2>See the split</h2><a class="link-btn" href="#subnet-calc">Full-page calculator →</a></div>
      <div id="sn-calc"></div>
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

  mountCalc($("sn-calc"), { ip, prefix, onChange: st => {
    tried.add(st.prefix);
    if (tried.size >= lab.exploreGoal) markPart("explore");
    renderParts();
  } });

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
  renderParts(); drawPrac();
}
