// The home hero's live monitor: the desk photo's blank screen shows a real terminal, drawn in the page and warped onto the
// screen's corners. It plays short scenes, one after another (the first is fixed, the rest shuffled by the day): a
// brute-force login caught, a DNS lookup, a VLAN set up, an expired certificate, a phishing email's failed checks, a
// Telnet password sniffed, a tampered download, a world-writable script fixed, a firewall's rules, a ransomware warning
// sign, and, from the site's own data, the newest exploited CVE, the top news story and a lesson question. Each scene
// links to the lab or page it comes from ("Try it"). Real tool output (named per scene), fictional companies,
// documentation IP ranges. The screen is decorative (aria-hidden); the "On screen" caption with its link is not.
// Pure helpers (homography, coverBox, placeStage, scenes) are tested in tests/hero.test.mjs; mount() only draws.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const IMAGE = { w: 1914, h: 822 };
// The monitor's glass in image pixels, clockwise from top left (measured from the photo, 19 Nov).
export const SCREEN = [[1062, 206], [1817, 205], [1817, 548], [1063, 547]];
export const BOX = { w: 480, h: 217 };  // ~8-10 lines on screen, ~13-14 px text on a laptop  // the terminal's own size before it is warped onto the glass (smaller = larger text)
export const PHONE_CROP = [990, 150, 1890, 640];  // on phones the photo is cropped to the monitor and shown below the buttons

// The CSS matrix3d that maps a w x h box (origin top left) onto the quad [tl, tr, br, bl].
export function homography(w, h, quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, k = 0;
  if (dx3 || dy3) { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; k = (dx1 * dy3 - dx3 * dy1) / den; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map(n => +n.toFixed(8)).join(",")})`;
}
// Where an image drawn like object-fit: cover (anchored at px, py of the spare room) sits in a W x H box.
export function coverBox(W, H, iw, ih, px = 0.5, py = 0.5) {
  const s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s;
  return { s, w, h, left: (W - w) * px, top: (H - h) * py };
}
// The whole photo placed so that `crop` (image pixels [x0, y0, x1, y1]) covers a W x H box. Desktop: the full photo,
// anchored right, so narrow screens lose the empty left side and never the monitor. Phones: just the monitor.
export function placeStage(W, H, crop, px = 0.5, py = 0.5) {
  const [x0, y0, x1, y1] = crop, c = coverBox(W, H, x1 - x0, y1 - y0, px, py);
  return { s: c.s, w: IMAGE.w * c.s, h: IMAGE.h * c.s, left: c.left - x0 * c.s, top: c.top - y0 * c.s };
}

// Desktop: the monitor takes the right of the hero, its screen starting at or beyond `from` of the width, so the
// headline on the left never runs over it. The photo is scaled down if it has to be (its dark top and bottom fade into
// the hero's own dark background), anchored right and centred vertically.
export function placeDesktop(W, H, from = 0.57) {
  const cover = Math.max(W / IMAGE.w, H / IMAGE.h), fit = ((1 - from) * W) / (IMAGE.w - SCREEN[0][0]);
  const s = Math.min(cover, fit), w = IMAGE.w * s, h = IMAGE.h * s;
  return { s, w, h, left: W - w, top: (H - h) / 2 };
}

// The terminal's own size for a screen drawn `px` wide: aim for 13.5 px text, within 300 to 480 (BOX's shape).
export function boxFor(px) {
  const w = Math.round(Math.max(300, Math.min(BOX.w, (px * 15) / 13.5)));
  return { w, h: Math.round((w * BOX.h) / BOX.w) };
}

// ---------- the scenes. A line is [kind, text, tone?, prompt?]: "cmd" is typed after its prompt ("$" unless given),
// "out" appears whole like real output, "note" is a dim # comment.
const L = (kind, text, tone, ps) => [kind, text, tone || "", ps || ""];
const BASE = [
  { id: "brute", title: "web-01 · auth.log", link: ["#mission-ssh-brute", "The 3am logins"], tool: "Ubuntu 22.04 auth.log, fail2ban 0.11", lines: [
    L("cmd", "sudo tail -f /var/log/auth.log"),
    L("out", "Nov 19 06:12:01 web-01 sshd[2114]: Failed password for admin from 203.0.113.7 port 52144 ssh2", "bad"),
    L("out", "Nov 19 06:12:04 web-01 sshd[2114]: Failed password for admin from 203.0.113.7 port 52151 ssh2", "bad"),
    L("out", "Nov 19 06:12:07 web-01 sshd[2114]: Failed password for root from 203.0.113.7 port 52163 ssh2", "bad"),
    L("cmd", "sudo tail -n 1 /var/log/fail2ban.log"),
    L("out", "2026-11-19 06:12:09,412 fail2ban.actions [812]: NOTICE [sshd] Ban 203.0.113.7", "good"),
    L("note", "# three failures in a row: fail2ban blocked the address"),
  ] },
  { id: "dns", title: "laptop · dig", link: ["#lab-net-detective", "Network detective"], tool: "BIND 9.18 dig", lines: [
    L("cmd", "dig +short shop.wrenfield.example"), L("out", "203.0.113.20"),
    L("cmd", "dig +short MX wrenfield.example"), L("out", "10 mail.wrenfield.example."),
    L("cmd", "dig +short TXT wrenfield.example"), L("out", '"v=spf1 ip4:203.0.113.25 -all"'),
    L("note", "# the SPF record: only 203.0.113.25 may send its email"),
  ] },
  { id: "vlan", title: "S2 · console", link: ["#lab-vlans", "VLANs on three switches"], tool: "Cisco IOS 15 (Catalyst 2960)", lines: [
    L("cmd", "conf t", "", "S2#"), L("out", "Enter configuration commands, one per line.  End with CNTL/Z."),
    L("cmd", "vlan 10", "", "S2(config)#"), L("cmd", "name Staff", "", "S2(config-vlan)#"),
    L("cmd", "interface fa0/11", "", "S2(config-vlan)#"), L("cmd", "switchport mode access", "", "S2(config-if)#"),
    L("cmd", "switchport access vlan 10", "", "S2(config-if)#"), L("cmd", "end", "", "S2(config-if)#"),
    L("out", "%SYS-5-CONFIG_I: Configured from console by console", "good"),
  ] },
  { id: "cert", title: "web-01 · openssl", link: ["#lab-cert-check", "Read the certificate"], tool: "OpenSSL 3.0", lines: [
    L("cmd", "openssl x509 -in shop.crt -noout -subject -enddate"),
    L("out", "subject=CN = shop.wrenfield.example"), L("out", "notAfter=Nov 18 23:59:59 2026 GMT", "bad"),
    L("cmd", "date -u"), L("out", "Thu Nov 19 06:30:00 UTC 2026"),
    L("note", "# expired last night: every visitor now sees a warning"),
  ] },
  { id: "phish", title: "triage · invoice.eml", link: ["#headers-check", "Check an email's headers"], tool: "Microsoft 365 Authentication-Results", lines: [
    L("cmd", "grep -i '^authentication-results' invoice.eml"),
    L("out", "Authentication-Results: spf=fail (sender IP is 198.51.100.44) smtp.mailfrom=ashby1ane.example; dkim=none (message not signed) header.d=none;dmarc=fail action=quarantine header.from=ashby1ane.example;compauth=fail reason=000", "bad"),
    L("note", "# ashby1ane, not ashbylane: a lookalike domain, and every check failed"),
  ] },
  { id: "telnet", title: "lab · tcpdump", link: ["#lab-telnet-ssh", "Telnet vs SSH"], tool: "tcpdump 4.99", lines: [
    L("cmd", "sudo tcpdump -i eth0 -A port 23"),
    L("out", "listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes"),
    L("out", "06:41:02.118230 IP 192.0.2.10.51544 > 192.0.2.20.23: Flags [P.], seq 1:7, ack 1, win 502, length 6"),
    L("out", "admin", "bad"),
    L("out", "06:41:04.902117 IP 192.0.2.10.51544 > 192.0.2.20.23: Flags [P.], seq 7:20, ack 1, win 502, length 13"),
    L("out", "Sup3rSecret!", "bad"),
    L("note", "# Telnet sends passwords as plain text. SSH encrypts them."),
  ] },
  { id: "hash", title: "laptop · sha256sum", link: ["#lab-hashing", "Hashing"], tool: "GNU coreutils 9", lines: [
    L("cmd", "sha256sum -c SHA256SUMS"),
    L("out", "installer.iso: FAILED", "bad"), L("out", "sha256sum: WARNING: 1 computed checksum did NOT match", "bad"),
    L("note", "# the download isn't the file that was published: don't run it"),
  ] },
  { id: "perms", title: "web-01 · permissions", link: ["#lab-permissions", "Linux permissions"], tool: "GNU coreutils 9", lines: [
    L("cmd", "ls -l /srv/scripts/backup.sh"), L("out", "-rwxrwxrwx 1 root root 214 Nov 19 09:12 /srv/scripts/backup.sh", "bad"),
    L("note", "# anyone can edit a script that runs as root"),
    L("cmd", "sudo chmod 750 /srv/scripts/backup.sh"),
    L("cmd", "ls -l /srv/scripts/backup.sh"), L("out", "-rwxr-x--- 1 root root 214 Nov 19 09:12 /srv/scripts/backup.sh", "good"),
  ] },
  { id: "ufw", title: "web-01 · firewall", link: ["#lab-firewall-packet", "You are the packet"], tool: "ufw 0.36 (Ubuntu 22.04)", lines: [
    L("cmd", "sudo ufw status numbered"), L("out", "Status: active"), L("out", " "),
    L("out", "     To                         Action      From"), L("out", "     --                         ------      ----"),
    L("out", "[ 1] 443/tcp                    ALLOW IN    Anywhere", "good"),
    L("out", "[ 2] 22/tcp                     ALLOW IN    192.0.2.0/24", "good"),
    L("note", "# the shop is open to all; SSH only from the office network"),
  ] },
  { id: "ransom", title: "soc · EDR timeline", link: ["#lab-ransomware-timeline", "Ransomware timeline"], tool: "a simplified EDR export", lines: [
    L("cmd", "grep -i -e vssadmin -e wbadmin fs01-timeline.csv"),
    L("out", "2026-11-19 03:14:07,FS01,svc-backup,vssadmin.exe delete shadows /all /quiet", "bad"),
    L("out", "2026-11-19 03:14:19,FS01,svc-backup,wbadmin.exe delete catalog -quiet", "bad"),
    L("note", "# backups being wiped comes before encryption: isolate FS01 now"),
  ] },
];

// Every scene that can play, with the site's own data filled in. `data` = { kev, news, lessons } (any may be missing).
export function scenes(data = {}) {
  const out = BASE.map(s => ({ ...s, lines: s.lines.slice() }));
  const k = (data.kev || []).filter(c => c && c.kev && c.kev.added).sort((a, b) => b.kev.added.localeCompare(a.kev.added))[0];
  if (k) out.push({ id: "kev", title: "patchnotes · CVE radar", link: ["#cves", "CVE Radar"], tool: "the site's daily CISA KEV feed", lines: [
    L("cmd", "patchnotes kev --latest"), L("out", `${k.id}`, "bad"), L("out", String(k.kev.name || "")),
    L("out", `On CISA's exploited list since ${k.kev.added}${k.kev.ransomware ? ", used by ransomware" : ""}.`, "warn"),
    L("note", "# attackers are already using this one: patch first") ] });
  const n = (data.news || []).find(x => x && x.title);
  if (n) out.push({ id: "news", title: "patchnotes · news", link: ["#news", "Today's news, explained"], tool: "the site's daily news feed", lines: [
    L("cmd", "patchnotes news --top"), L("out", String(n.title), "warn"), L("out", `${n.source || ""}`.trim() || " "),
    L("note", "# every story links to the lesson that explains it") ] });
  const qs = (data.lessons || []).flatMap(l => (l.checks || []).map(c => ({ l, c }))).filter(x => x.c.q && x.c.options && x.c.options[x.c.answer] != null);
  if (qs.length) {
    const { l, c } = qs[(data.day || 0) % qs.length];
    out.push({ id: "quiz", title: "patchnotes · question of the day", link: [`#lesson-${l.id}`, l.title], tool: "a lesson's own question", lines: [
      L("cmd", "patchnotes quiz"), L("out", c.q), ...c.options.map((o, i) => L("out", `  ${"ABCD"[i]}) ${o}`)),
      L("pause", ""), L("out", `Answer: ${"ABCD"[c.answer]}) ${c.options[c.answer]}`, "good"), L("note", `# ${c.why || ""}`.trim()) ] });
  }
  return out;
}
// The order to play them: "brute" first (the clearest), then the rest shuffled by the day so each visit differs.
export function order(list, day = 0) {
  const first = list.filter(s => s.id === "brute"), rest = list.filter(s => s.id !== "brute");
  let seed = (day * 2654435761) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return first.concat(rest);
}

export function mount(hero, data = {}) {
  const bg = hero.querySelector(".hh-bg"), img = hero.querySelector(".hh-img");
  if (!bg || !img || hero.querySelector(".hh-stage")) return;
  const day = Math.floor(Date.now() / 864e5), list = order(scenes({ ...data, day }), day);
  const stage = document.createElement("div"); stage.className = "hh-stage"; stage.setAttribute("aria-hidden", "true");
  img.replaceWith(stage); stage.append(img);
  const scr = document.createElement("div"); scr.className = "hh-screen";
  scr.style.width = BOX.w + "px"; scr.style.height = BOX.h + "px";
  scr.innerHTML = `<div class="hs-bar"><span class="hs-logo">PATCH<i>//</i>NOTES</span><span class="hs-tab"></span></div><div class="hs-body"></div>`;
  stage.append(scr);
  // The phone layout: the monitor in its own frame under the buttons. The "On screen" caption (a real link) follows it.
  const phone = document.createElement("div"); phone.className = "hh-phone";
  const shot = document.createElement("div"); shot.className = "hh-shot"; shot.setAttribute("aria-hidden", "true"); phone.append(shot);
  const cap = document.createElement("p"); cap.className = "hh-now";
  hero.append(phone, cap);  // desktop: the caption sits over the photo; fit() moves it under the phone frame on phones
  const body = scr.querySelector(".hs-body"), tab = scr.querySelector(".hs-tab");
  const narrowQ = typeof matchMedia === "function" ? matchMedia("(max-width: 1050px)") : { matches: false };
  const fit = () => {
    const narrow = narrowQ.matches, box = narrow ? shot : hero, r = box.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (narrow && stage.parentElement !== shot) { shot.append(stage); phone.append(cap); }
    if (!narrow && stage.parentElement !== bg) { bg.prepend(stage); hero.append(cap); }
    const p = narrow ? placeStage(r.width, r.height, PHONE_CROP, 0.5, 0.5) : placeDesktop(r.width, r.height);
    Object.assign(stage.style, { width: p.w + "px", height: p.h + "px", left: p.left + "px", top: p.top + "px" });
    // The terminal is sized to the screen it's drawn on, so its 15 px text shows at about 13 px wherever it is.
    const b = boxFor((SCREEN[1][0] - SCREEN[0][0]) * p.s);
    scr.style.width = b.w + "px"; scr.style.height = b.h + "px";
    scr.style.transform = homography(b.w, b.h, SCREEN.map(([x, y]) => [x * p.s, y * p.s]));
  };
  fit();
  if (typeof ResizeObserver === "function") { const ro = new ResizeObserver(fit); ro.observe(hero); ro.observe(shot); }
  narrowQ.addEventListener?.("change", fit);

  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const row = ([kind, text, tone, ps]) => kind === "pause" ? "" : `<div class="hs-line ${kind}${tone ? " " + tone : ""}">${kind === "cmd" ? `<span class="hs-ps">${esc(ps || "$")}</span> ` : ""}<span class="hs-t">${esc(text)}</span></div>`;
  let si = 0, li = 0, ch = 0, visible = true, timer = null;
  const caption = s => { cap.innerHTML = `<span class="hh-now-k">On screen:</span> ${esc(s.title.split(" · ")[1] || s.title)} <a href="${esc(s.link[0])}">Try it: ${esc(s.link[1])} →</a>`; };
  const startScene = () => { const s = list[si]; tab.textContent = s.title; body.innerHTML = ""; li = 0; ch = 0; caption(s); };
  if (!list.length) return;
  startScene();
  if (reduced) { body.innerHTML = list[0].lines.map(row).join(""); body.scrollTop = body.scrollHeight; return; }
  if (typeof IntersectionObserver === "function") new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible && !timer) step(); }).observe(hero);
  function step() {
    timer = null;
    if (!hero.isConnected) return;
    if (!visible || document.hidden) return void (timer = setTimeout(step, 800));
    const s = list[si];
    if (li >= s.lines.length) { timer = setTimeout(() => { si = (si + 1) % list.length; startScene(); step(); }, 7000); return; }
    const [kind, text] = s.lines[li];
    if (kind === "pause") { li++; timer = setTimeout(step, 2600); return; }
    if (kind === "cmd" && ch < text.length) {
      if (ch === 0) body.insertAdjacentHTML("beforeend", row(["cmd", "", "", s.lines[li][3]]).replace('<span class="hs-t"></span>', '<span class="hs-t"></span><b class="hs-cur"></b>'));
      ch++; body.lastElementChild.querySelector(".hs-t").textContent = text.slice(0, ch);
      return void (timer = setTimeout(step, 40 + Math.random() * 55));
    }
    if (kind === "cmd") body.lastElementChild.querySelector(".hs-cur")?.remove(); else body.insertAdjacentHTML("beforeend", row(s.lines[li]));
    body.scrollTop = body.scrollHeight;
    li++; ch = 0;
    timer = setTimeout(step, kind === "cmd" ? 450 : kind === "note" ? 900 : 380);
  }
  timer = setTimeout(step, 900);
}
