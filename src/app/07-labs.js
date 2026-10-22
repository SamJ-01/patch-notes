/* LABS */
const LAB = Object.fromEntries(DATA.labs.map(l => [l.id, l]));
/* ---------- card scenes: small illustrations built from the device library ---------- */
const GLYPH = {  // extras drawn next to devices, centred on (0,0)
  mail: '<rect x="-12" y="-8" width="24" height="16" rx="2"/><path d="M-11-7l11 8 11-8"/>',
  lock: '<rect x="-8" y="-2" width="16" height="12" rx="2"/><path d="M-5-2v-4a5 5 0 0 1 10 0v4"/>',
  bug: '<ellipse cx="0" cy="2" rx="6" ry="8"/><path d="M0-6v16M-6 0h-5M6 0h5M-6 6l-5 3M6 6l5 3M-5-4l-4-4M5-4l4-4"/>',
  shield: '<path d="M0-11l9 4v6c0 6-4 10-9 12c-5-2-9-6-9-12v-6z"/><path d="M-4 0l3 3 5-6"/>',
  key: '<circle cx="-5" cy="0" r="5"/><path d="M0 0h11M7 0v4M10 0v3"/>',
  search: '<circle cx="-3" cy="-3" r="7"/><path d="M2 2l8 8"/>',
  alert: '<path d="M0-10l11 19h-22z"/><path d="M0-3v5M0 6v.5"/>',
  chip: '<rect x="-8" y="-8" width="16" height="16" rx="2"/><path d="M-4-12v4M0-12v4M4-12v4M-4 8v4M0 8v4M4 8v4M-12-4h4M-12 0h4M-12 4h4M8-4h4M8 0h4M8 4h4"/>',
  eye: '<path d="M-12 0c4-7 20-7 24 0c-4 7-20 7-24 0z"/><circle cx="0" cy="0" r="3.5"/>',
  gauge: '<path d="M-14 6a14 14 0 1 1 28 0"/><path class="needle" d="M0 6l-9-7"/><circle cx="0" cy="6" r="2"/>',
  users: '<circle cx="-5" cy="-4" r="4.5"/><circle cx="6" cy="-3" r="3.5"/><path d="M-13 10a8 8 0 0 1 16 0M2 10a6 6 0 0 1 11-3"/>',
  doc: '<path d="M-8-11h10l6 6v16h-16z"/><path d="M2-11v6h6M-4 1h8M-4 5h8M-4-3h3"/>',
  clock: '<circle cx="0" cy="0" r="11"/><path d="M0-6v6l4 3"/>',
  coin: '<circle cx="0" cy="0" r="11"/><path d="M3-5c-1-2-7-2-7 1s7 2 7 5-6 3-7 1M0-8v16"/>',
  globe: '<circle cx="0" cy="0" r="11"/><path d="M-11 0h22M0-11c-5 6-5 16 0 22c5-6 5-16 0-22"/>',
  link: '<path d="M-2 3l5-5M-4-1l-3 3a4 4 0 0 0 6 6l3-3M4 1l3-3a4 4 0 0 0-6-6l-3 3"/>',
  cycle: '<path d="M9-4a10 10 0 1 0 1 7"/><path d="M10-10v6h-6"/>',
};
const glyph = (k, x, y, sc = 1, cls = "") => `<g class="gl ${cls}" transform="translate(${x},${y}) scale(${sc})">${GLYPH[k]}</g>`;
const ctag = (t, x, y, cls = "") => `<g class="ctag ${cls}" transform="translate(${x},${y})"><rect x="${-(t.length * 3.1 + 7)}" y="-8.5" width="${t.length * 6.2 + 14}" height="17" rx="8.5"/><text y="3.2" text-anchor="middle">${esc(t)}</text></g>`;
// A terminal window; hovering the card types the command again (the clip rect grows like a cursor).
let termN = 0;
const termArt = () => { const id = `cterm-clip-${++termN}`; return `<defs><clipPath id="${id}"><rect x="36" y="28" width="128" height="12"><animate attributeName="width" begin="indefinite" dur="1.1s" values="0;128" fill="freeze" calcMode="discrete" keyTimes="0;1"/></rect></clipPath></defs>
  <rect class="cterm" x="30" y="10" width="140" height="68" rx="6"/><path class="cterm-bar" d="M30 22h140"/><circle class="cdot" cx="39" cy="16" r="2"/><circle class="cdot" cx="46" cy="16" r="2"/><circle class="cdot" cx="53" cy="16" r="2"/>
  <text class="cterm-t" x="40" y="37" clip-path="url(#${id})">$ grep Failed auth.log</text><text class="cterm-t dim" x="40" y="51">3× 203.0.113.45</text><text class="cterm-t" x="40" y="66">$ <tspan class="blink">▌</tspan></text>`; };
const OSI_ART = [0, 1, 2, 3, 4, 5, 6].map(k => `<rect class="cosi" x="74" y="${14 + k * 8.6}" width="52" height="6" rx="1.5" style="fill:${["var(--critical)", "var(--high)", "var(--brand)", "var(--good)", "var(--sun)", "var(--likely)", "var(--exploited)"][k]}"/>`).join("");
// d: devices [kind, x, y, scale], g: glyphs, l: links [x1, y1, x2, y2, air?], t: tags, p: packet paths, tone: packet colour
const SCENE = {
  hashing: { d: [["laptop", 40, 52, 0.5]], g: [["key", 160, 50, 1.4]], l: [[60, 52, 140, 50]], t: [["a1f3…9c", 100, 26], ["sha256", 100, 80]], p: ["M40 52L160 50"] },
  permissions: { d: [["server", 100, 46, 0.62]], t: [["-rw-r-----", 100, 16], ["alice ✓  dave ✗", 100, 84]] },
  "network-builder": { d: [["switch", 100, 30, 0.6], ["pc", 40, 72, 0.38], ["pc", 160, 72, 0.38], ["router", 100, 76, 0.4]], l: [[88, 36, 48, 62], [112, 36, 152, 62]], raw: `<line x1="86" y1="37" x2="46" y2="63" stroke="var(--seg0)" stroke-width="3"/><line x1="114" y1="37" x2="154" y2="63" stroke="var(--seg1)" stroke-width="3"/>` },
  vlans: { d: [["switch", 100, 24, 0.75], ["pc", 36, 66, 0.42], ["pc", 100, 70, 0.42], ["pc", 164, 66, 0.42]], l: [[84, 30, 46, 56], [100, 32, 100, 58], [116, 30, 154, 56]], t: [["VLAN 10", 36, 94], ["20", 100, 96], ["30", 164, 94]] },
  "telnet-ssh": { d: [["laptop", 36, 50, 0.5], ["server", 166, 50, 0.56], ["attacker", 100, 20, 0.0001]], g: [["eye", 100, 24, 0.9, "bad"]], l: [[52, 50, 150, 50]], t: [["admin / ••••", 100, 78, "bad"]], p: ["M36 50L166 50"], tone: "bad" },
  "cia-triad": { g: [["shield", 100, 44, 2.1, "good"]], t: [["C · I · A", 100, 76]] },
  "frameworks": { d: [["server", 150, 46, 0.5]], g: [["shield", 52, 44, 1.5, "good"], ["search", 100, 60, 0.7]], l: [[70, 46, 134, 46]], t: [["NIST CSF", 100, 18]], p: ["M52 44L150 46"], tone: "good" },
  "cable-wiring": { raw: `${[0,1,2,3,4,5,6,7].map(k=>`<rect x="${64+k*9}" y="30" width="6" height="34" rx="1.5" style="fill:${["#E8820C","#E8820C","#2F9E44","#1971C2","#1971C2","#2F9E44","#8B5A2B","#8B5A2B"][k]}"/>`).join("")}<rect x="58" y="24" width="84" height="44" rx="4" fill="none" stroke="var(--dg-strong)" stroke-width="2"/>` },
  "tcp-handshake": { d: [["laptop", 34, 44, 0.5], ["server", 166, 46, 0.56], ["attacker", 34, 70, 0.0001]], l: [[50, 44, 150, 46]], t: [["SYN →", 92, 20], ["← SYN-ACK", 92, 70, "good"]], p: ["M34 44L166 46", "M166 46L34 44"] },
  "net-detective": { d: [["pc", 32, 46, 0.5], ["router", 100, 44, 0.5], ["cloud", 170, 44, 0.5]], g: [["search", 134, 66, 0.7]], l: [[48, 46, 84, 44], [118, 44, 152, 44]], t: [["DNS?", 100, 18, "bad"]], p: ["M32 46L100 44L170 44"], tone: "bad" },
  "recon-basics": { d: [["laptop", 34, 48, 0.5], ["server", 128, 34, 0.42], ["server", 128, 60, 0.42]], g: [["search", 92, 46, 0.9]], l: [[50, 48, 108, 36], [50, 48, 108, 58]], t: [["in scope", 150, 18]], p: ["M34 48L128 34", "M34 48L128 60"] },
  dhcp: { d: [["pc", 38, 46, 0.58], ["switch", 100, 48, 0.55], ["server", 162, 46, 0.6]], l: [[58, 47, 82, 48], [118, 48, 150, 46]], t: [["IP?", 70, 18]], p: ["M38 46L100 48L162 46", "M162 46L100 48L38 46"] },
  "osi-model": { raw: OSI_ART, d: [["pc", 32, 46, 0.5], ["server", 170, 46, 0.55]], l: [[50, 46, 72, 46], [128, 46, 158, 46]], p: ["M32 46L100 12L100 78L170 46"] },
  topologies: { d: [["switch", 100, 46, 0.6], ["pc", 36, 20, 0.4], ["pc", 36, 70, 0.4], ["pc", 164, 20, 0.4], ["pc", 164, 70, 0.4]], l: [[48, 22, 84, 44], [48, 68, 84, 48], [152, 22, 116, 44], [152, 68, 116, 48]], p: ["M36 20L100 46L164 70"] },
  "ports-protocols": { d: [["laptop", 40, 48, 0.55], ["server", 160, 46, 0.62]], l: [[58, 50, 146, 46]], t: [[":443", 100, 20], [":22", 100, 70]], p: ["M40 48L160 46"] },
  subnetting: { raw: `<rect class="czone a" x="14" y="44" width="80" height="34" rx="6"/><rect class="czone b" x="106" y="44" width="80" height="34" rx="6"/>`, d: [["router", 100, 20, 0.52], ["pc", 38, 62, 0.36], ["pc", 72, 62, 0.36], ["pc", 128, 62, 0.36], ["pc", 162, 62, 0.36]], l: [[90, 26, 54, 44], [110, 26, 146, 44]], t: [["/26", 30, 44], [ "/26", 170, 44]], p: ["M100 22L54 44L38 62", "M100 22L146 44L162 62"] },
  "linux-terminal": { raw: termArt },
  "log-detective": { d: [["attacker", 36, 46, 0.6], ["server", 164, 46, 0.62]], l: [[52, 46, 150, 46]], t: [["ssh ×300", 100, 20, "bad"]], g: [["search", 172, 64, 0.8]], p: ["M36 46L164 46", "M36 46L164 46"], tone: "bad" },
  "header-inspector": { d: [["attacker", 34, 46, 0.58], ["laptop", 166, 48, 0.55]], g: [["mail", 100, 46, 1.1], ["search", 112, 36, 0.7]], l: [[50, 46, 86, 46], [114, 46, 148, 48]], p: ["M34 46L166 48"], tone: "bad" },
  "cvss-builder": { g: [["gauge", 100, 44, 2.3]], t: [["9.8 critical", 100, 72, "bad"]] },
  // lessons
  phishing: { d: [["attacker", 36, 46, 0.6], ["laptop", 164, 48, 0.55]], g: [["mail", 100, 46, 1.1]], l: [[52, 46, 86, 46], [114, 46, 146, 48]], p: ["M36 46L164 48"], tone: "bad" },
  ransomware: { d: [["attacker", 36, 46, 0.6], ["server", 160, 46, 0.62]], g: [["lock", 178, 30, 0.9, "bad"]], l: [[52, 46, 146, 46]], t: [["$$$", 100, 20, "bad"]], p: ["M36 46L160 46"], tone: "bad" },
  malware: { d: [["pc", 150, 46, 0.62]], g: [["bug", 54, 46, 1.4, "bad"]], l: [[70, 46, 128, 46]], p: ["M54 46L150 46"], tone: "bad" },
  "zero-day": { d: [["attacker", 36, 46, 0.6], ["server", 164, 46, 0.62]], l: [[52, 46, 150, 46]], t: [["0-day", 100, 20, "bad"]], p: ["M36 46L164 46"], tone: "bad" },
  "vuln-management": { d: [["server", 64, 46, 0.62]], g: [["shield", 140, 46, 1.6, "good"]], l: [[80, 46, 124, 46]], t: [["patched", 100, 70]], p: ["M140 46L64 46"], tone: "good" },
  "supply-chain": { d: [["server", 36, 46, 0.55], ["server", 100, 46, 0.55], ["laptop", 164, 48, 0.5]], l: [[48, 46, 88, 46], [112, 46, 148, 48]], t: [["update", 68, 20, "bad"]], p: ["M36 46L100 46L164 48"], tone: "bad" },
  "data-breach": { d: [["db", 56, 46, 0.66], ["attacker", 160, 46, 0.6]], l: [[72, 46, 144, 46]], t: [["records", 108, 20, "bad"]], p: ["M56 46L160 46", "M56 46L160 46"], tone: "bad" },
  "nation-state": { d: [["cloud", 36, 42, 0.55], ["firewall", 100, 46, 0.52], ["server", 164, 46, 0.58]], l: [[52, 44, 86, 46], [114, 46, 150, 46]], p: ["M36 42L100 46L164 46"], tone: "bad" },
  ddos: { d: [["attacker", 30, 18, 0.36], ["attacker", 30, 46, 0.36], ["attacker", 30, 74, 0.36], ["server", 164, 46, 0.62]], l: [[40, 20, 150, 44], [40, 46, 150, 46], [40, 72, 150, 48]], p: ["M30 18L164 46", "M30 46L164 46", "M30 74L164 46"], tone: "bad" },
  "ai-security": { d: [["server", 156, 46, 0.62]], g: [["chip", 56, 46, 1.5]], l: [[74, 46, 142, 46]], t: [["prompt", 104, 20, "bad"]], p: ["M56 46L156 46"], tone: "bad" },
  cloud: { d: [["cloud", 100, 28, 0.72], ["server", 56, 64, 0.42], ["server", 100, 66, 0.42], ["server", 144, 64, 0.42]], l: [[90, 40, 60, 54], [100, 40, 100, 56], [110, 40, 140, 54]], p: ["M100 28L56 64", "M100 28L144 64"] },
  identity: { d: [["phone", 54, 46, 0.6], ["laptop", 152, 48, 0.55]], g: [["key", 100, 44, 1.1, "good"]], t: [["MFA", 100, 20]], l: [[68, 46, 88, 46], [114, 46, 134, 48]], p: ["M54 46L152 48"], tone: "good" },
  "iot-ot": { d: [["ap", 100, 26, 0.6]], g: [["chip", 40, 64, 0.8], ["chip", 100, 70, 0.8], ["chip", 160, 64, 0.8]], l: [[90, 34, 48, 58, 1], [100, 36, 100, 60, 1], [110, 34, 152, 58, 1]], p: ["M100 26L40 64", "M100 26L160 64"] },
  "web-sqli": { d: [["laptop", 30, 48, 0.48], ["server", 100, 46, 0.55], ["db", 170, 46, 0.55]], l: [[46, 48, 88, 46], [112, 46, 156, 46]], t: [["' OR 1=1", 66, 20, "bad"]], p: ["M30 48L100 46L170 46"], tone: "bad" },
  "web-xss": { d: [["attacker", 32, 46, 0.52], ["server", 100, 46, 0.55], ["laptop", 168, 48, 0.48]], l: [[46, 46, 88, 46], [112, 46, 150, 48]], t: [["<script>", 100, 18, "bad"]], p: ["M32 46L100 46L168 48"], tone: "bad" },
  "web-access": { d: [["laptop", 38, 48, 0.55], ["server", 164, 46, 0.6]], g: [["lock", 100, 44, 1.2]], l: [[56, 48, 90, 46], [110, 46, 150, 46]], t: [["/admin", 100, 18, "bad"]], p: ["M38 48L164 46"], tone: "bad" },
  networking: { d: [["pc", 28, 48, 0.45], ["switch", 78, 50, 0.45], ["router", 128, 48, 0.48], ["cloud", 176, 46, 0.45]], l: [[42, 48, 64, 50], [92, 50, 114, 50], [142, 50, 164, 47]], p: ["M28 48L78 50L128 50L176 46"] },
  encryption: { d: [["laptop", 38, 48, 0.55], ["server", 164, 46, 0.6]], g: [["lock", 100, 44, 1.1, "good"]], l: [[56, 48, 90, 46], [110, 46, 150, 46]], t: [["TLS", 100, 20]], p: ["M38 48L164 46"], tone: "good" },
  linux: { raw: termArt },
  soc: { d: [["server", 40, 52, 0.5], ["pc", 100, 56, 0.5], ["laptop", 160, 56, 0.48]], g: [["eye", 100, 20, 1.3]], l: [[52, 40, 88, 26, 1], [100, 30, 100, 42, 1], [148, 40, 112, 26, 1]], t: [["alert", 160, 22, "bad"]] },
  "incident-response": { g: [["alert", 56, 46, 1.6, "bad"], ["shield", 144, 46, 1.6, "good"]], l: [[76, 46, 124, 46]], p: ["M56 46L144 46"], tone: "good" },
  osint: { d: [["cloud", 52, 46, 0.6]], g: [["search", 140, 44, 1.8]], l: [[70, 46, 120, 44, 1]], t: [["@handle", 100, 18]] },
};
SCENE["subnet-calc"] = SCENE.subnetting;
SCENE["ssh-brute"] = SCENE["log-detective"];
SCENE["phish-triage"] = { d: [["attacker", 34, 46, 0.58], ["laptop", 166, 48, 0.55]], g: [["mail", 100, 46, 1.1]], t: [["1 ≠ l", 100, 20, "bad"]], l: [[50, 46, 86, 46], [114, 46, 148, 48]], p: ["M34 46L166 48"], tone: "bad" };
SCENE["one-request"] = { d: [["phone", 30, 48, 0.62], ["firewall", 100, 48, 0.5], ["server", 168, 46, 0.6]], l: [[42, 48, 84, 48], [116, 48, 154, 46]], t: [["GET 200", 64, 22], ["TLS", 136, 22]], p: ["M30 48L168 46", "M168 46L30 48"] };
SCENE["finding-the-server"] = { d: [["phone", 30, 48, 0.62], ["router", 100, 50, 0.5], ["server", 168, 46, 0.6]], l: [[42, 48, 78, 50], [122, 50, 154, 46]], t: [["A?", 52, 20], ["TTL 300", 132, 20]], p: ["M30 48L168 46"] };
SCENE.agency = SCENE.soc;
function sceneSvg(sc) {
  const pk = (sc.p || []).map((d, i) => `<circle class="cpkt ${sc.tone || ""}" r="4" opacity="0"><animateMotion begin="indefinite" dur="1.5s" path="${d}" fill="freeze"/><animate attributeName="opacity" begin="indefinite" dur="1.5s" values="0;1;1;0" keyTimes="0;0.1;0.85;1" fill="freeze"/></circle>`).join("");
  return `<svg viewBox="-14 -9 228 106" aria-hidden="true" class="hw-live">
    ${(sc.l || []).map(([a, b, c, d, air]) => `<line class="cln${air ? " air" : ""}" x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join("")}${(typeof sc.raw === "function" ? sc.raw() : sc.raw) || ""}
    ${(sc.d || []).map(([k, x, y, z]) => hw(k, x, y, z)).join("")}${(sc.g || []).map(([k, x, y, z, c]) => glyph(k, x, y, z, c)).join("")}
    ${(sc.t || []).map(([t, x, y, c]) => ctag(t, x, y, c)).join("")}${pk}</svg>`;
}
// Section headers: a scene in the same style, on wide screens only.
const RADAR_ART = `<g class="radar" transform="translate(100,46)"><circle r="40"/><circle r="27"/><circle r="14"/><path d="M-40 0h80M0-40v80"/>
  <path class="sweep" d="M0 0L0-40A40 40 0 0 1 28.3-28.3z"/><circle class="blip b1" cx="17" cy="-22" r="3"/><circle class="blip b2" cx="-24" cy="9" r="3"/><circle class="blip b3" cx="9" cy="27" r="2.5"/></g>`;
const HEAD_SCENE = {
  missions: SCENE.networking,
  learn: { d: [["laptop", 52, 50, 0.72]], g: [["shield", 140, 46, 2, "good"]], l: [[76, 50, 116, 46]], p: ["M52 50L140 46"], tone: "good" },
  play: { d: [["attacker", 40, 48, 0.68], ["firewall", 116, 48, 0.6]], g: [["key", 170, 46, 1.3]], l: [[58, 48, 100, 48], [132, 48, 156, 46]], t: [["flag{…}", 116, 14]], p: ["M40 48L116 48L170 46"], tone: "bad" },
  careers: { d: [["laptop", 34, 66, 0.5], ["server", 100, 48, 0.58], ["cloud", 166, 28, 0.62]], l: [[48, 62, 88, 52], [112, 44, 150, 32]], t: [["SOC", 100, 80]], p: ["M34 66L100 48L166 28"] },
  progress: { g: [["gauge", 100, 44, 2.4]], t: [["root", 100, 76]] },
  news: { d: [["ap", 100, 50, 1]], t: [["breaking", 100, 80, "bad"], ["CVE", 38, 30], ["KEV", 162, 30, "bad"]] },
  cves: { raw: RADAR_ART },
};
SCENE.play = HEAD_SCENE.play;  // the games card on the practise page
const headArt = k => `<span class="head-art card-art" aria-hidden="true">${sceneSvg(HEAD_SCENE[k])}</span>`;
const cardArt = id => `<span class="card-art">${sceneSvg(SCENE[id] || SCENE.networking)}</span>`;
// Hovering a card sends its packets across the scene.
document.addEventListener("mouseover", e => {
  const card = e.target.closest?.(".art-card"); if (!card || card.dataset.playing || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const anims = card.querySelectorAll(".card-art animateMotion, .card-art animate"); if (!anims.length) return;
  card.dataset.playing = "1";
  anims.forEach((a, i) => { try { setTimeout(() => a.beginElement(), Math.floor(i / 2) * 220); } catch (err) {} });
  setTimeout(() => delete card.dataset.playing, 2200);
});
// Practise page: security tracks first, so networking (the biggest track) doesn't bury the rest.
const CATEGORY_ORDER = ["Security operations", "Your own evidence", "Cryptography", "Linux", "Networking", "Ethical hacking", "Games"];
// "Start here": one pick per track. When a pick is done, the next unfinished item in its track takes its place.
const PRACTISE_PICKS = ["agency:shift-01", "lab:hashing", "lab:permissions", "lab:network-builder"];
const PS = { track: "All", open: {} };  // the chosen filter and which tracks are expanded, for this visit
function practiseItems() {
  return [
    ...(DATA.agency || []).map(sh => ({ key: `agency:${sh.id}`, cat: "Security operations", done: !!(P.agency || {})[sh.id], html: shiftCard(sh) })),
    { key: "tool:headers-check", cat: "Your own evidence", done: false, html: headerToolCard() },
    { key: "tool:log-search", cat: "Your own evidence", done: false, html: logToolCard() },
    { key: "tool:cvss-decode", cat: "Your own evidence", done: false, html: cvssToolCard() },
    ...DATA.missions.map(m => ({ key: `mission:${m.id}`, cat: m.category || "Networking", done: Object.keys((P.missions || {})[m.id] || {}).length === Object.keys(m.modes).length, html: missionCard(m) })),
    ...DATA.labs.map(l => ({ key: `lab:${l.id}`, cat: l.category || "Security operations", done: !!P.labs[l.id], html: labCard(l) })),
    { key: "tool:subnet-calc", cat: "Networking", done: false, html: toolCard() },
    { key: "games", cat: "Games", done: false, html: gamesCard() },
  ];
}
VIEWS.missions = () => {
  const items = practiseItems();
  const cats = [...new Set([...CATEGORY_ORDER, ...items.map(i => i.cat)])].filter(c => items.some(i => i.cat === c));
  if (PS.track !== "All" && !cats.includes(PS.track)) PS.track = "All";
  const picks = PRACTISE_PICKS.map(k => items.find(i => i.key === k)).filter(Boolean)
    .map(p => (p.done ? items.find(i => i.cat === p.cat && !i.done && !PRACTISE_PICKS.includes(i.key)) || p : p));
  main.innerHTML = `<div class="view">
    <div class="view-head with-art">${headArt("missions")}<h1>Practise by doing</h1><p>Missions, labs, the Agency shift and games. Start with one from each track, or pick what you want to get better at.</p></div>
    <section class="stack pr-start"><h2 class="cat-h">Start here: one from each track</h2><div class="lessons">${picks.map(p => p.html).join("")}</div></section>
    <div class="row pr-tracks" role="group" aria-label="Show a track">${["All", ...cats].map(c => `<button type="button" class="chip" data-t="${esc(c)}" aria-pressed="${PS.track === c}">${esc(c)} <span class="n">${c === "All" ? items.length : items.filter(i => i.cat === c).length}</span></button>`).join("")}</div>
    <div class="stack" id="pr-grid" style="gap:30px"></div>
  </div>`;
  const SHOW = 4;
  const draw = () => {
    const shown = PS.track === "All" ? cats : [PS.track];
    $("pr-grid").innerHTML = shown.map(c => {
      const list = items.filter(i => i.cat === c), all = PS.track !== "All" || PS.open[c] || list.length <= SHOW + 1;
      return `<section class="stack"><h2 class="cat-h">${esc(c)}</h2><div class="lessons">${(all ? list : list.slice(0, SHOW)).map(i => i.html).join("")}</div>
        ${all ? "" : `<button type="button" class="btn ghost pr-more" data-more="${esc(c)}">Show all ${list.length} in ${esc(c)}</button>`}</section>`;
    }).join("");
  };
  main.querySelector(".pr-tracks").addEventListener("click", e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    PS.track = b.dataset.t; main.querySelectorAll(".pr-tracks [data-t]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw();
  });
  $("pr-grid").addEventListener("click", e => {
    const b = e.target.closest("[data-more]"); if (!b) return;
    PS.open[b.dataset.more] = true; draw();
    const sec = [...$("pr-grid").querySelectorAll(".cat-h")].find(h => h.textContent === b.dataset.more)?.parentElement;
    sec?.querySelectorAll(".lcard")[SHOW]?.focus();  // keep keyboard users where they were
  });
  draw();
};
function gamesCard() {
  return `<a class="lcard art-card" href="#play">${cardArt("play")}
    <span class="eyebrow">Games</span><h3>Phish or Legit, quizzes and a flag hunt</h3><p>Quick rounds to sharpen your instincts: spot the scam, test what you know, find hidden flags</p><span class="lmeta"><span>A few minutes</span><span>XP for every round</span></span></a>`;
}
function toolCard() {
  return `<a class="lcard art-card" href="#subnet-calc">${cardArt("subnet-calc")}
    <span class="eyebrow">Tool</span><h3>Subnet calculator</h3><p>Type any address and watch the network change: class, CIDR, mask, hosts, ranges and a live diagram</p><span class="lmeta"><span>Use any time</span><span>Shareable links</span></span></a>`;
}
function logToolCard() {
  return `<a class="lcard art-card" href="#log-search">${cardArt("log-detective")}
    <span class="eyebrow">Tool · your own evidence</span><h3>Log search</h3><p>Paste a real log; spot guessing and scanning</p><span class="lmeta"><span>Use any time</span><span>Stays on your device</span></span></a>`;
}
function cvssToolCard() {
  return `<a class="lcard art-card" href="#cvss-decode">${cardArt("cvss-builder")}
    <span class="eyebrow">Tool · your own evidence</span><h3>CVSS decoder</h3><p>Paste a vector; see the score and what it means</p><span class="lmeta"><span>Use any time</span><span>3.0, 3.1 and 4.0</span></span></a>`;
}
// Log search: paste or open a real log (static/js/tools/logs.js).
function logToolView() {
  main.innerHTML = `<div class="view"><div class="view-head"><a class="link-btn" href="#missions">← Practise</a><div class="eyebrow">Tool · your own evidence</div><h1>Log search</h1>
    <p>Paste or open a real log. Search it like ${gloss("grep", 1)}, and see the summary an analyst would build first.</p></div>
    <div id="lg-root"><div class="empty">Loading…</div></div></div>`;
  import("./js/tools/logs.js").then(mod => { if (parseRoute().path === "tools/log-search") mod.mount($("lg-root"), { samples: DATA.tools?.logSamples || [] }); })
    .catch(() => { $("lg-root").innerHTML = `<div class="empty">Couldn't load the log search. If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`; });
}
function headerToolCard() {
  return `<a class="lcard art-card" href="#headers-check">${cardArt("header-inspector")}
    <span class="eyebrow">Tool · your own evidence</span><h3>Email header checker</h3><p>Paste a real email's headers and see who sent it</p><span class="lmeta"><span>Use any time</span><span>Stays on your device</span></span></a>`;
}
// "Bring your own evidence": paste real email headers and get them explained (static/js/tools/headers.js).
function headersToolView() {
  main.innerHTML = `<div class="view"><div class="view-head"><a class="link-btn" href="#missions">← Practise</a><div class="eyebrow">Tool · Security operations</div><h1>Email header checker</h1>
    <p>Paste the headers of a real email you're unsure about. See who really sent it, the route it took and whether it passed ${gloss("SPF, DKIM and DMARC", 3)}.</p></div>
    <div id="hc-root"><div class="empty">Loading…</div></div></div>`;
  import("./js/tools/headers.js").then(mod => { if (parseRoute().path === "tools/headers-check") mod.mount($("hc-root"), { samples: DATA.tools?.headerSamples || [] }); })
    .catch(() => { $("hc-root").innerHTML = `<div class="empty">Couldn't load the checker. If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`; });
}
// The subnet calculator on its own page. The address lives in the URL (#subnet-calc/10.0.0.0/22) so it can be shared.
function calcView(h) {
  const [, ipS = "", preS = ""] = h.match(/^subnet-calc\/?([^/]*)\/?(\d*)/) || [];
  main.innerHTML = `<div class="view"><div class="view-head"><a class="link-btn" href="#missions">← Missions</a><div class="eyebrow">Tool · Networking</div><h1>Subnet calculator</h1>
    <p>Type an address, drag the prefix, enter a mask or say how many hosts you need. Everything updates as you go.</p></div>
    <section class="panel"><div class="panel-title"><h2>Calculator</h2><a class="link-btn" href="#lab-subnetting">Practise in the lab →</a></div><div id="calc-root"><div class="empty">Loading…</div></div></section></div>`;
  import("./js/labs/subnet.js").then(mod => {
    if (parseRoute().path !== "tools/subnet-calc") return;
    const addr = mod.ipToInt(ipS), p = Number(preS);
    mod.mountCalc($("calc-root"), {
      ip: addr !== null ? ipS : "192.168.10.77",
      prefix: preS && p >= 8 && p <= 32 ? p : addr !== null ? (mod.ipClass(addr).defaultPrefix || 24) : 26,
      share: true,
      onChange: st => history.replaceState(null, "", `#subnet-calc/${st.addr}/${st.prefix}`),
    });
  }).catch(() => { $("calc-root").innerHTML = `<div class="empty">Couldn't load the calculator. If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`; });
}
function labCard(l) {
  return `<a class="lcard art-card" href="#lab-${esc(l.id)}">${cardArt(l.id)}${P.labs[l.id] ? '<span class="done">DONE</span>' : ""}
    <span class="eyebrow">Lab</span><h3>${esc(l.title)}</h3><p>${esc(l.card || l.skill)}</p><span class="lmeta"><span>${l.minutes} min</span><span>+${LAB_XP} XP</span></span></a>`;
}
function missionCard(m) {
  const done = Object.keys((P.missions || {})[m.id] || {});
  const all = Object.keys(m.modes);
  return `<a class="lcard mission-card art-card" href="#mission-${esc(m.id)}">${cardArt(m.id)}${done.length === all.length ? '<span class="done">DONE</span>' : ""}
    <span class="eyebrow">Mission</span><h3>${esc(m.title)}</h3><p>${esc(m.card || m.summary)}</p>
    <span class="lmeta"><span>${m.minutes} min</span>${all.map(k => `<span>${done.includes(k) ? "✓ " : ""}${esc(m.modes[k].label)}</span>`).join("")}</span></a>`;
}
const MISSION = id => DATA.missions.find(x => x.id === id);
const SHIFT = id => (DATA.agency || []).find(x => x.id === id);
function shiftCard(sh) {
  const rec = (P.agency || {})[sh.id];
  return `<a class="lcard mission-card art-card" href="#agency">${cardArt("agency")}${rec ? '<span class="done">DONE</span>' : ""}
    <span class="eyebrow">PATCH//AGENCY</span><h3>${esc(sh.title)}</h3><p>${esc(sh.card || sh.summary)}</p>
    <span class="lmeta"><span>${sh.minutes} min</span><span>${rec ? `Best: ${rec.best} of ${rec.total} checks` : `+${sh.xp} XP`}</span></span></a>`;
}
// The Agency's own section: the agency, your staff badge, the time clock and the rota. Clocking in opens a shift.
VIEWS.agency = () => {
  const shifts = DATA.agency || [], rec = id => (P.agency || {})[id];
  const worked = shifts.filter(sh => rec(sh.id)).length, next = shifts.find(sh => !rec(sh.id)) || shifts[0];
  if (!next) { main.innerHTML = `<div class="view"><div class="empty">No shifts yet.</div></div>`; return; }
  const rank = worked ? "Analyst, tier 1" : "Trainee analyst";
  const best = shifts.map(sh => rec(sh.id)).filter(Boolean).reduce((a, r) => Math.max(a, r.total ? r.best / r.total : 0), 0);
  const day = d => d.replace(/^(\w{3})\w*\s+(\d+)\s+(\w{3}).*$/, "$1 $2 $3").toUpperCase();
  main.innerHTML = `<div class="view ag-hub">
    <header class="ag-hero"><div class="ag-logo" aria-hidden="true">PATCH<b>//</b>AGENCY</div>
      <h1>${esc(next.agency)}</h1>
      <p>A security operations centre (SOC) watching its clients' systems around the clock. You take the desk: read the alerts, work out what's real, get other teams to act, and hand over to the next shift.</p></header>
    <div class="ag-hubgrid">
      <section class="ag-idcard" aria-label="Your staff badge">
        <div class="ag-id-top"><span class="ag-logo sm" aria-hidden="true">LANTERNFIELD</span><span class="ag-id-no mono">LF-${String(1000 + worked * 37).padStart(4, "0")}</span></div>
        <svg class="ag-id-face" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="22" r="11"/><path d="M9 57c2-12 10-19 21-19s19 7 21 19z"/></svg>
        <div class="ag-id-name">You</div><div class="ag-id-rank">${rank}</div>
        <dl class="ag-id-stats"><div><dt>Shifts worked</dt><dd>${worked} of ${shifts.length}</dd></div><div><dt>Best report</dt><dd>${worked ? `${Math.round(best * 100)}%` : "–"}</dd></div></dl>
      </section>
      <section class="ag-tc ag-tc-hub" aria-labelledby="ag-next-h">
        ${DESK.scene(next.clientImage, { lazy: true })}
        <div class="ag-tc-screen" aria-hidden="true"><span>${esc(day(next.date))}</span><b>${esc(next.startsAt)}</b><span>${rec(next.id) ? "WORKED BEFORE" : "NEXT SHIFT"}</span></div>
        <h2 id="ag-next-h">${esc(next.title)}</h2>
        <p>${esc(next.card || next.summary)}</p>
        <a class="btn brand ag-clockin" href="#agency-${esc(next.id)}">Clock in</a>
        <p class="muted">About ${next.minutes} minutes. The clock only moves when you act, so take your time reading.</p>
      </section>
    </div>
    <section class="panel ag-pinned" aria-labelledby="ag-pin-h"><h2 id="ag-pin-h">Pinned by your lead</h2>
      <ol class="dk-msgs">${DESK.message({ from: next.lead.split(",")[0], role: (next.lead.split(",")[1] || "Shift lead").trim(), at: next.startsAt, photo: next.leadPhoto, html: `<p>${gloss((next.briefing.match(/[^.!?]+[.!?]+/g) || [next.briefing]).slice(0, 2).join(" ").trim(), 2)}</p>` })}</ol></section>
    <section class="panel"><h2>The rota</h2>
      <ol class="ag-rota">${shifts.map(sh => `<li><span class="mono ag-rota-when">${esc(day(sh.date))} · ${esc(sh.startsAt)}</span><b>${esc(sh.client)}</b><span class="muted">${esc(sh.title.split(":")[0])}, ${sh.minutes} min</span>
        <span class="ag-rota-st">${rec(sh.id) ? `✓ ${rec(sh.id).best} of ${rec(sh.id).total} checks` : "Open"}</span><a class="btn ghost" href="#agency-${esc(sh.id)}">${rec(sh.id) ? "Work it again" : "Clock in"}</a></li>`).join("")}
        <li class="ag-rota-soon"><span class="mono ag-rota-when">COMING</span><b>More shifts are being written</b><span class="muted">Each one a new client and new alerts</span></li></ol></section>
    <section class="panel"><h2>How a shift works</h2>
      <ol class="ag-steps">
        <li><b>Clock in</b><span>Tap your badge. Your shift lead briefs you and hands you the client file.</span></li>
        <li><b>Work the queue</b><span>Open each alert and search the logs behind it. Most are noise; some aren't.</span></li>
        <li><b>Ask other teams</b><span>You can't fix everything yourself. Ask, give a reason, and wait for replies.</span></li>
        <li><b>Hand over and clock out</b><span>Close every alert with evidence, leave notes for the next shift, and get your report.</span></li></ol>
      <p class="muted">${feedbackHref("PATCH//AGENCY") ? `The Agency is a pilot. <a href="${esc(feedbackHref("PATCH//AGENCY"))}" target="_blank" rel="noopener">Tell us what you think ↗</a>` : ""}</p></section>
  </div>`;
};
// A PATCH//AGENCY shift. Leaving mid-shift restarts it, so route() asks first (agencyShift.inProgress).
let agencyShift = null;
function agencyView(id) {
  const sh = SHIFT(id); if (!sh) return VIEWS.missions();
  main.innerHTML = `<div class="view" id="agency-root"><div class="empty">Loading the shift…</div></div>`;
  import("./js/agency/ui.js").then(ui => {
    if (parseRoute().path !== "agency/" + id) return;
    agencyShift = ui.mount($("agency-root"), sh, {
      done: !!(P.agency || {})[id],
      onAgain: () => agencyView(id),
      feedback: feedbackHref("Agency " + sh.title),
      onComplete: rep => {
        P.agency = P.agency || {};
        const prev = P.agency[id], first = !prev;
        P.agency[id] = { d: prev?.d || todayStr(), best: Math.max(prev?.best || 0, rep.passed), total: rep.checks.length };
        if (first) award(sh.xp, `PATCH//AGENCY: ${sh.title}`); else progressChanged();
        celebrate("Shift complete!", first ? `${sh.title} · +${sh.xp} XP` : `${rep.passed} of ${rep.checks.length} checks passed`);
      },
    });
  }).catch(() => {
    $("agency-root").innerHTML = `<div class="empty">Couldn't load the shift code (js/agency/ui.js). If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`;
  });
}
const LEAVE_SHIFT = "Leave this shift? It isn't saved part-way, so you'll start again next time.";
addEventListener("beforeunload", e => { if (agencyShift?.inProgress && main.contains($("agency-root"))) e.preventDefault(); });
function missionView(id) {
  const m = MISSION(id); if (!m) return VIEWS.missions();
  main.innerHTML = `<div class="view" id="mission-root"><div class="empty">Loading mission…</div></div>`;
  import("./js/missions/ui.js").then(ui => {
    if (parseRoute().path !== "missions/" + id) return;  // the learner navigated away while it loaded
    const next = m.next && MISSION(m.next);
    ui.mount($("mission-root"), m, {
      doneModes: Object.keys((P.missions || {})[id] || {}),
      next: next ? { id: next.id, title: next.title } : null,
      onComplete: mode => {
        P.missions = P.missions || {}; P.missions[id] = P.missions[id] || {};
        const first = !P.missions[id][mode];
        if (first) { P.missions[id][mode] = todayStr(); award(m.modes[mode].xp, `Mission: ${m.title} (${m.modes[mode].label})`); }
        celebrate(`${m.modes[mode].label} complete!`, first ? `${m.title} · +${m.modes[mode].xp} XP` : m.title);
        showDoneCard("mission", m, `${m.modes[mode].label} mode complete`);
      },
    });
  }).catch(() => {
    $("mission-root").innerHTML = `<div class="empty">Couldn't load the mission code (js/missions/ui.js). If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`;
  });
}
const MODULE_LABS = ["osi", "terminal", "topology", "ports", "subnet", "nettools", "handshake", "wiring", "wiretap", "vlan", "hashing", "netbuilder", "perms", "journey"];  // labs with their own module in static/js/labs/<kind>.js
function moduleLab(l) {
  main.innerHTML = `<div class="view" id="lab-root"><div class="empty">Loading lab…</div></div>`;
  import(`./js/labs/${l.kind}.js`).then(mod => {
    if (parseRoute().path !== "missions/" + l.id) return;
    mod.mount($("lab-root"), l, {
      solved: P.labSteps[l.id] || [],
      onPart: part => { P.labSteps[l.id] = [...new Set([...(P.labSteps[l.id] || []), part])]; saveP(); },
      onComplete: () => completeLab(l),
      onReset: () => resetLab(l.id),
    });
  }).catch(() => { $("lab-root").innerHTML = `<div class="empty">Couldn't load this lab. If you opened the file directly, preview with <span class="mono">python3 build.py --offline --serve</span>.</div>`; });
}
function completeLab(l) {
  if (P.labs[l.id]) { celebrate("Lab complete!", `${l.title} · practised again`); saveP(); }
  else { P.labs[l.id] = todayStr(); award(LAB_XP, `Lab complete: ${l.title}`); celebrate("Lab complete!", `${l.title} · +${LAB_XP} XP`); }
  showDoneCard("lab", l, "Lab complete");
}
// Clear a lab's answers so it can be practised again (XP is only ever awarded once).
function resetLab(id) { P.labSteps[id] = []; saveP(); route(); }
const norm = v => String(v || "").trim().toLowerCase().replace(/^["'<]+|[">']+$/g, "");
function labView(id) {
  const l = LAB[id]; if (!l) return VIEWS.missions();
  if (l.kind === "cvss") return cvssLab(l);
  if (MODULE_LABS.includes(l.kind)) return moduleLab(l);
  const solved = new Set(P.labSteps[id] || []);
  main.innerHTML = `<div class="view"><article class="article" style="max-width:900px">
    <a class="link-btn" href="#missions">← Missions</a>
    <div class="stack" style="gap:8px"><div class="eyebrow">Lab · ${esc(l.track)} · ${l.minutes} min · +${LAB_XP} XP</div><h1>${esc(l.title)}</h1><p class="hook">${gloss(l.intro, 4)}</p></div>
    ${l.primer ? `<section class="panel"><h2>${esc(l.primer.title)}</h2><ul class="keys">${l.primer.keys.map(k => `<li>${keyIcon(k.icon)}<b>${gloss(k.label, 1)}</b><span>${esc(k.text)}</span></li>`).join("")}</ul>
      ${l.primer.results ? `<p class="muted" style="margin:10px 0 4px">What each result means:</p><ul class="results">${l.primer.results.map(([w, m, tone]) => `<li class="${esc(tone)}"><b class="mono">${esc(w)}</b>${esc(m)}</li>`).join("")}</ul>` : ""}</section>` : ""}
    ${l.artifact.kind === "headers" ? `<section class="panel"><div class="panel-title"><h2>The email</h2><span class="sim-tag">Simulated email</span></div>
      ${MAIL.card({ headers: l.artifact.text, body: l.artifact.body, links: l.artifact.links }, { id: "lab-mail", views: ["message", "original"] })}</section>` : `<section class="panel"><div class="panel-title"><h2>${esc(l.artifact.name)}</h2><span class="muted mono" id="lab-n" style="font-size:0.78rem"></span></div>
      ${l.artifact.kind === "log" ? `<div class="row"><label class="sr" for="lab-f">Filter lines</label><span class="mono" style="color:var(--sun)">grep</span><input id="lab-f" type="search" placeholder="e.g. Failed password" autocomplete="off" spellcheck="false"></div>` : ""}
      <pre class="evidence" id="lab-pre" tabindex="0" aria-label="Evidence"></pre></section>`}
    <section class="stack" id="lab-steps">${l.steps.map((st, i) => `<div class="panel lab-step ${solved.has(i) ? "got" : ""}" data-i="${i}">
      <div class="panel-title"><h2>Question ${i + 1}</h2>${solved.has(i) ? '<span class="eyebrow" style="color:var(--good)">Solved</span>' : ""}</div>
      <p class="q">${gloss(st.q, 3)}</p>${st.where ? `<button type="button" class="link-btn where" data-where="${i}">Show me where ↑</button>` : ""}
      ${st.type === "choice" ? `<div class="opts">${st.options.map((o, j) => `<button class="opt" data-j="${j}" ${solved.has(i) ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>`
        : `<form class="flag-form" data-form="${i}"><label class="sr" for="ans-${i}">Answer</label><input id="ans-${i}" autocomplete="off" spellcheck="false" ${solved.has(i) ? `value="${esc(st.answers[0])}" disabled` : ""}><button class="btn" type="submit" ${solved.has(i) ? "disabled" : ""}>Check</button></form>`}
      <div class="fb">${solved.has(i) ? `<div class="feedback"><b class="ok">Correct.</b> ${gloss(st.explain, 3)}</div>` : ""}</div>
    </div>`).join("")}</section>
    <div class="row"><button class="btn ghost" data-reset-lab="${esc(id)}">↺ Reset answers</button><span class="muted">${P.labs[id] ? `Completed ${esc(P.labs[id])}.` : ""} Related: <a href="#lesson-${esc(l.lesson)}">${esc(LESSON[l.lesson]?.title || l.lesson)}</a></span></div>
  </article></div>`;
  const lines = l.artifact.text.split("\n");
  const drawLog = () => {
    const f = ($("lab-f")?.value || "").trim().toLowerCase();
    const shown = f ? lines.filter(x => x.toLowerCase().includes(f)) : lines;
    $("lab-pre").innerHTML = shown.map(x => markText(x, [f])).join("\n") || "(no matching lines)";
    $("lab-n").textContent = `${shown.length} of ${lines.length} lines`;
  };
  if ($("lab-pre")) drawLog(); else MAIL.wire($("lab-mail").parentElement);
  $("lab-f")?.addEventListener("input", drawLog);
  const solve = (i, box) => {
    solved.add(i); P.labSteps[id] = [...solved];
    box.classList.add("got");
    box.querySelector(".fb").innerHTML = `<div class="feedback"><b class="ok">Correct.</b> ${gloss(l.steps[i].explain, 3)}</div>`;
    box.querySelectorAll("button, input").forEach(el => el.disabled = true);
    if (solved.size === l.steps.length) completeLab(l); else { saveP(); }
  };
  const miss = (i, box, msg) => { box.querySelector(".fb").innerHTML = `<div class="feedback"><b class="no">Not quite.</b> ${gloss(msg, 3)}</div>`; };
  // "Show me where": point at the evidence for a question. Emails open Original with the lines marked; logs are filtered.
  const showWhere = i => {
    const needle = l.steps[i].where;
    if ($("lab-mail")) { MAIL.highlight($("lab-mail"), needle); $("lab-mail").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); $("lab-mail").querySelector(".em-raw")?.focus({ preventScroll: true }); }
    else if ($("lab-f")) { $("lab-f").value = needle; drawLog(); $("lab-pre").scrollIntoView({ block: "start" }); $("lab-pre").focus({ preventScroll: true }); }
  };
  $("lab-steps").addEventListener("click", e => {
    const w = e.target.closest("[data-where]"); if (w) return showWhere(Number(w.dataset.where));
    const b = e.target.closest(".opt"); if (!b || b.disabled) return;
    const box = b.closest(".lab-step"), i = Number(box.dataset.i), st = l.steps[i];
    Number(b.dataset.j) === st.answer ? solve(i, box) : (b.classList.add("wrong"), miss(i, box, "Look at the evidence again."));
  });
  $("lab-steps").addEventListener("submit", e => {
    e.preventDefault();
    const box = e.target.closest(".lab-step"), i = Number(box.dataset.i), st = l.steps[i];
    st.answers.map(norm).includes(norm(e.target.querySelector("input").value)) ? solve(i, box) : miss(i, box, st.hint || "Check the evidence and try again.");
  });
}

// CVSS 3.1 base score, per the FIRST specification (section 7.1 + Appendix A rounding).
const CVSS_METRICS = [
  ["AV", "Attack vector: where can the attacker be?", [["N", "Network (anywhere on the internet)"], ["A", "Adjacent (same local network)"], ["L", "Local (logged in on the machine)"], ["P", "Physical (hands on the device)"]]],
  ["AC", "Attack complexity", [["L", "Low (works reliably)"], ["H", "High (needs special conditions)"]]],
  ["PR", "Privileges required", [["N", "None (no login)"], ["L", "Low (a normal user account)"], ["H", "High (an admin account)"]]],
  ["UI", "User interaction", [["N", "None (nobody has to do anything)"], ["R", "Required (a victim must click or open something)"]]],
  ["S", "Scope: does the impact reach beyond the vulnerable part?", [["U", "Unchanged"], ["C", "Changed (e.g. the victim's browser)"]]],
  ["C", "Confidentiality impact (data read)", [["N", "None"], ["L", "Low (some data)"], ["H", "High (everything)"]]],
  ["I", "Integrity impact (data changed)", [["N", "None"], ["L", "Low (some data)"], ["H", "High (anything)"]]],
  ["A", "Availability impact (service down)", [["N", "None"], ["L", "Low (slower / partial)"], ["H", "High (fully down)"]]],
];
// v30: CVSS 3.0 uses the same formula, but simply rounds up to one decimal (3.1 rounds carefully to avoid float errors).
function cvss31(v, v30 = false) {
  const W = { AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }, AC: { L: 0.77, H: 0.44 }, UI: { N: 0.85, R: 0.62 }, CIA: { H: 0.56, L: 0.22, N: 0 } };
  const pr = v.S === "C" ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 };
  const iss = 1 - (1 - W.CIA[v.C]) * (1 - W.CIA[v.I]) * (1 - W.CIA[v.A]);
  const impact = v.S === "U" ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const expl = 8.22 * W.AV[v.AV] * W.AC[v.AC] * pr[v.PR] * W.UI[v.UI];
  if (impact <= 0) return 0;
  const roundup = v30 ? x => Math.ceil(Math.round(x * 100000) / 10000) / 10 : x => { const i = Math.round(x * 100000); return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10; };
  return roundup(Math.min((v.S === "U" ? 1 : 1.08) * (impact + expl), 10));
}
const cvssSeverity = s => s === 0 ? "None" : s < 4 ? "Low" : s < 7 ? "Medium" : s < 9 ? "High" : "Critical";
// CVSS decoder ("bring your own evidence"): read any vector, check it, score 3.x, explain each part.
// Version 4.0 is decoded but not scored: its scores come from FIRST's lookup tables, so we link to their calculator.
const CVSS4_METRICS = [
  ["AV", "Attack vector", [["N", "Network"], ["A", "Adjacent"], ["L", "Local"], ["P", "Physical"]]],
  ["AC", "Attack complexity", [["L", "Low"], ["H", "High"]]],
  ["AT", "Attack requirements", [["N", "None"], ["P", "Present (needs special conditions)"]]],
  ["PR", "Privileges required", [["N", "None"], ["L", "Low"], ["H", "High"]]],
  ["UI", "User interaction", [["N", "None"], ["P", "Passive (just view something)"], ["A", "Active (click, open, run)"]]],
  ["VC", "Confidentiality (the vulnerable system)", [["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["VI", "Integrity (the vulnerable system)", [["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["VA", "Availability (the vulnerable system)", [["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["SC", "Confidentiality (other systems)", [["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["SI", "Integrity (other systems)", [["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["SA", "Availability (other systems)", [["H", "High"], ["L", "Low"], ["N", "None"]]],
];
function readVector(str) {
  const raw = String(str || "").trim().replace(/^\(|\)$/g, "");
  const ver = (raw.match(/^CVSS:(3\.0|3\.1|4\.0)\//) || [])[1] || (/\bAu:/.test(raw) ? "2.0" : "");
  if (!ver) return { ok: false, error: "That doesn't look like a CVSS vector. They start with CVSS:3.1/, CVSS:3.0/ or CVSS:4.0/, like CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H." };
  if (ver === "2.0") return { ok: true, version: ver, metrics: parseVector(raw), defs: [], score: null, note: "This is CVSS version 2, retired in 2015. It's decoded below but not scored here; most databases now give a 3.1 or 4.0 score too." };
  const parts = raw.split("/").slice(1).filter(Boolean), metrics = {}, errors = [];
  for (const p of parts) {
    const [k, v] = p.split(":");
    if (k in metrics) errors.push(`${k} appears twice.`);
    metrics[k] = v;
  }
  const defs = ver === "4.0" ? CVSS4_METRICS : CVSS_METRICS;
  for (const [k, , opts] of defs) {
    if (!(k in metrics)) errors.push(`${k} is missing.`);
    else if (!opts.some(([v]) => v === metrics[k])) errors.push(`${k}:${metrics[k]} isn't a valid value (it can be ${opts.map(([v]) => v).join(", ")}).`);
  }
  if (errors.length) return { ok: false, error: `This vector has problems: ${errors.join(" ")}` };
  if (ver === "4.0") return { ok: true, version: ver, metrics, defs, score: null, note: "CVSS 4.0 scores come from lookup tables published by FIRST, so this page doesn't calculate one. The metrics are explained below; get the official score from FIRST's calculator." };
  const score = cvss31(metrics, ver === "3.0");
  return { ok: true, version: ver, metrics, defs, score, severity: cvssSeverity(score) };
}
function cvssToolView(h) {
  const raw = (h.match(/^cvss-decode\/(.+)$/) || [])[1] || "";
  let start = raw;
  try { start = decodeURIComponent(raw); } catch { /* a stray % in a shared link: show it as typed */ }
  const EX = [["Log4Shell (3.1)", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"], ["A phishing-style bug (3.1)", "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N"], ["A local bug (4.0)", "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"]];
  main.innerHTML = `<div class="view"><div class="view-head"><a class="link-btn" href="#missions">← Practise</a><div class="eyebrow">Tool · your own evidence</div><h1>CVSS decoder</h1>
    <p>Paste a ${gloss("CVSS", 1)} vector from an advisory and see what each part means, with the score.</p></div>
    <section class="panel hc-in"><label for="cv-in" class="sr-only">CVSS vector</label><input id="cv-in" class="mono cv-in" placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" autocomplete="off" spellcheck="false" value="${esc(start)}">
      <div class="row"><button class="btn brand" type="button" id="cv-go">Decode</button><span class="muted hc-try">or try:</span>${EX.map(([l, v]) => `<button class="chip" type="button" data-cv="${esc(v)}">${esc(l)}</button>`).join("")}</div></section>
    <div id="cv-out" aria-live="polite"></div></div>`;
  const run = () => {
    const v = $("cv-in").value.trim(), r = readVector(v);
    if (v) history.replaceState(null, "", "#cvss-decode/" + encodeURIComponent(v));
    if (!r.ok) { $("cv-out").innerHTML = `<div class="feedback"><b class="no">Not quite.</b> ${esc(r.error)}</div>`; return; }
    const plain = decodeVector(v.replace(/^CVSS:[\d.]+\//, "")) || [];
    const sev = (r.severity || "").toLowerCase();
    $("cv-out").innerHTML = `<section class="panel cv-res">
      ${r.score != null ? `<div class="cv-score ${esc(sev)}"><b>${r.score.toFixed(1)}</b><span>${esc(r.severity)}</span><span class="muted">CVSS ${esc(r.version)} base score</span></div>
        <div class="cv-scale" aria-hidden="true"><span style="left:${r.score * 10}%"></span></div><div class="cv-bands" aria-hidden="true"><span>None</span><span>Low</span><span>Medium</span><span>High</span><span>Critical</span></div>` : `<p class="feedback">${esc(r.note)}${r.version === "4.0" ? ` <a href="https://www.first.org/cvss/calculator/4.0#${esc(v)}" target="_blank" rel="noopener">Open FIRST's CVSS 4.0 calculator ↗</a>` : ""}</p>`}
      ${plain.length ? `<h2>In plain English</h2><ul class="checklist">${plain.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${r.defs.length ? `<h2>Each part</h2><dl class="cv-metrics">${r.defs.map(([k, label, opts]) => `<div><dt>${esc(label)} <span class="mono muted">${esc(k)}</span></dt><dd>${opts.map(([o, name]) => `<span class="cv-opt${o === r.metrics[k] ? " on" : ""}"${o === r.metrics[k] ? ' aria-current="true"' : ' aria-hidden="true"'}>${esc(name.replace(/ \(.*\)$/, ""))}</span>`).join("")}</dd></div>`).join("")}</dl>` : ""}
      <p class="muted hc-small">CVSS says how bad it could be, not how likely an attack is. For that, check whether it's on the ${gloss("KEV", 1)} list and its ${gloss("EPSS", 1)} score. <a href="#lab-cvss-builder">Practise scoring in the CVSS lab</a>.</p></section>`;
  };
  $("cv-go").addEventListener("click", run);
  $("cv-in").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
  main.querySelectorAll("[data-cv]").forEach(b => b.addEventListener("click", () => { $("cv-in").value = b.dataset.cv; run(); }));
  if (start) run();
}
const parseVector = str => Object.fromEntries(str.split("/").map(p => p.split(":")));
function cvssLab(l) {
  const done = new Set(P.labSteps[l.id] || []);
  let cur = Math.max(0, l.scenarios.findIndex((_, i) => !done.has(i)));
  const pick = { AV: "N", AC: "L", PR: "N", UI: "N", S: "U", C: "N", I: "N", A: "N" };
  const draw = () => {
    const sc = l.scenarios[cur], score = cvss31(pick), vec = CVSS_METRICS.map(([k]) => `${k}:${pick[k]}`).join("/");
    main.innerHTML = `<div class="view"><article class="article" style="max-width:900px">
      <a class="link-btn" href="#missions">← Missions</a>
      <div class="stack" style="gap:8px"><div class="eyebrow">Lab · ${esc(l.track)} · ${done.size}/${l.scenarios.length} scenarios · +${LAB_XP} XP</div><h1>${esc(l.title)}</h1><p class="hook">${esc(l.intro)}</p></div>
      <div class="row">${l.scenarios.map((x, i) => `<button class="chip" data-sc="${i}" aria-pressed="${i === cur}">${done.has(i) ? "✓ " : ""}${esc(x.title)}</button>`).join("")}</div>
      <section class="case"><h2 class="eyebrow">Scenario ${cur + 1}</h2><h3>${esc(sc.title)}</h3><p>${esc(sc.text)}</p></section>
      <div class="cvss-grid">${CVSS_METRICS.map(([k, label, opts]) => `<fieldset class="metric"><legend>${esc(label)}</legend><div class="row">${opts.map(([v, t]) => `<button class="chip" data-m="${k}" data-v="${v}" aria-pressed="${pick[k] === v}">${esc(t)}</button>`).join("")}</div></fieldset>`).join("")}</div>
      <section class="panel score-panel"><div><div class="eyebrow">Your score</div><div class="score-big">${score.toFixed(1)}</div><div class="mono muted">${esc(cvssSeverity(score))} · CVSS:3.1/${esc(vec)}</div></div>
        <div class="stack" style="gap:8px"><button class="btn brand" id="cvss-check">${done.has(cur) ? "Solved ✓" : "Check my vector"}</button><div id="cvss-fb"></div></div></section>
    </article></div>`;
  };
  draw();
  main.onclick = e => {
    if (!location.hash.startsWith("#lab-")) { main.onclick = null; return; }
    const m = e.target.closest("[data-m]"); if (m) { pick[m.dataset.m] = m.dataset.v; draw(); return; }
    const sc = e.target.closest("[data-sc]"); if (sc) { cur = Number(sc.dataset.sc); draw(); return; }
    if (e.target.closest("#cvss-check")) {
      const target = parseVector(l.scenarios[cur].target);
      const wrong = CVSS_METRICS.filter(([k]) => pick[k] !== target[k]);
      if (!wrong.length) {
        done.add(cur); P.labSteps[l.id] = [...done];
        if (done.size === l.scenarios.length) completeLab(l); else saveP();
        const next = l.scenarios.findIndex((_, i) => !done.has(i));
        $("cvss-fb").innerHTML = `<div class="feedback"><b class="ok">Spot on.</b> That's ${cvss31(target).toFixed(1)} (${cvssSeverity(cvss31(target))}).${next >= 0 ? " Try the next scenario." : " Lab complete!"}</div>`;
      } else {
        $("cvss-fb").innerHTML = `<div class="feedback"><b class="no">${wrong.length} metric${wrong.length > 1 ? "s" : ""} off.</b> Re-read the scenario and check: ${esc(wrong[0][1].split(":")[0])}${wrong.length > 1 ? " and others" : ""}.</div>`;
      }
    }
  };
}

