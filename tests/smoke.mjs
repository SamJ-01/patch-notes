// Browser smoke test (runs in CI after the build, before deploy): serves site/, opens the key routes on a desktop
// (dark theme) and a phone (light theme), and plays three journeys a learner takes: an evidence lab to the end,
// a shadowed Agency shift to "Your turn", and a route started from a home role card with its route bar.
// It fails on page errors, failed requests to the site and sideways scrolling. Deliberately small and quick: the
// fuller checks (axe, screenshots) stay in tests/browser_check.mjs, run by hand. Writes nothing into site/.
//
//   python3 build.py --offline && node tests/smoke.mjs
import { createServer } from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = new URL("../site/", import.meta.url).pathname;
const TYPES = { ".webmanifest": "application/manifest+json", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".xml": "application/xml", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp" };
const { chromium } = (() => { try { return require("playwright"); } catch { return require(execSync("npm root -g").toString().trim() + "/playwright"); } })();
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, p.endsWith("/") ? p + "index.html" : p);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const exe = ["/opt/pw-browsers/chromium/chrome-linux/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const labs = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url), "utf8"));
const problems = [];
// A journey that throws (a selector that never appears, say) is recorded as a problem and the rest still run.
const journey = async (name, fn) => { try { await fn(); } catch (e) { problems.push(`${name}: ${e.message.split("\n")[0]}`); } };

async function open(route, width, theme) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(15000);
  const where = `${route} @${width}`;
  page.on("pageerror", e => problems.push(`${where}: page error: ${e.message}`));
  page.on("response", r => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(`${where}: ${r.status()} ${r.url().slice(base.length)}`); });
  page.on("requestfailed", r => { if (r.url().startsWith(base)) problems.push(`${where}: failed ${r.url().slice(base.length)}`); });
  await page.addInitScript(t => { try { localStorage.setItem("pn-theme", t); } catch (e) {} }, theme);
  await page.goto(base + route);
  await page.waitForTimeout(400);
  return page;
}
const overflow = async (page, where) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) problems.push(`${where}: scrolls sideways by ${over}px`);
};

// 1. Key routes: every tab, a cert page, and one of each kind of activity.
const ROUTES = ["#today", "#learn", "#missions", "#agency", "#exams", "#progress", "#news", "#cves", "#cert-network-plus",
  "#feedback", "#path-soc", "#lesson-phishing", "#lab-slow-network", "#lab-vlans", "#lab-network-builder", "#mission-dhcp", "#agency-shift-01", "#subnet-calc", "#lab-port-corridor", "#lab-firewall-packet", "#lab-vishing-call"];
for (const route of ROUTES) for (const [width, theme] of [[1280, "dark"], [390, "light"]]) {
  const page = await open(route, width, theme);
  if (!(await page.evaluate(() => (document.querySelector("main")?.innerText || "").trim().length > 40))) problems.push(`${route} @${width}: the page is empty`);
  await overflow(page, `${route} @${width}`);
  await page.close();
}

// Signature features: the thing that makes each of these pages worth visiting must still be there. A rewrite once
// dropped the VLAN lab's live colour-coded diagram and addressing table (10 Nov) and nothing noticed until the owner
// did (19 Nov); if one of these goes missing, the build fails instead.
const SIGNATURE = {
  "#agency": [".ag-badge > img", ".ag-b-name", ".ag-b-stamps .ag-bstamp"],
  "#lab-vlans": ["#v-diagram svg", "#v-diagram [data-seg]", ".vl-table table", "#v-now", "#v-tasks li", "#v-panel .sw-panel", "#v-now [data-nowhint]"],
  "#lab-intervlan": ["#v-diagram svg", ".vl-table table", "#v-now", "#v-now [data-nowhint]"],
  "#lab-linux-terminal": ["#t-now", "#t-now [data-nowhint]", "#t-tasks li", "#t-in"],
  "#lab-net-detective": ["#t-now", "#t-now [data-nowhint]", "#t-tasks li", "#nd-links .nd-link"],
  "#lab-recon-basics": ["#t-now", ".scope-note", "#t-tasks li"],
  "#lab-permissions": ["#pm-now [data-nowhint]", "#pm-matrix table", ".pm-bits", "#pm-tasks li"],
  "#lab-network-builder": ["main svg"],
  "#lab-firewall-packet": ["#fwg-chip", ".fwg-rule"],
  "#lab-telnet-ssh": ["#tap-svg", "#tap-go"],
  "#lab-sqli-shop": [".bw #ws-u", "#sq-behind", "#sq-safe"],
  "#lab-malware-tree": [".pt-node", "#lab-pre"],
  "#lesson-networking": [".flow.is-route .route-slab", ".route-lit"],
  "#lesson-zero-day": [".zd-svg", "#zd-n"],
  "#lesson-attack-models": [".kc-chain", "[data-run]"],
  "#lesson-ransomware": ["main .xpl"],
  "#today": [".home-hero .hh-screen"],
};
await journey("signature features", async () => {
  for (const [route, sels] of Object.entries(SIGNATURE)) {
    const page = await open(route, 1280, "dark");
    for (const sel of sels) {
      const found = await page.waitForSelector(sel, { state: "attached", timeout: 6000 }).then(() => true, () => false);
      if (!found) problems.push(`${route}: its signature feature "${sel}" is missing`);
    }
    await page.close();
  }
});

// Keyboard accessibility: the first Tab reveals the skip link and Enter moves focus to main.
await journey("skip navigation", async () => {
  const page = await open("#today", 390, "dark");
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute("href"), top: document.activeElement?.getBoundingClientRect().top }));
  if (first.href !== "#main" || !/skip to main content/i.test(first.text || "") || first.top < 0) problems.push("skip navigation: first Tab does not reveal the skip link");
  await page.keyboard.press("Enter");
  const target = await page.evaluate(() => ({ id: document.activeElement?.id, tag: document.activeElement?.tagName }));
  if (target.id !== "main") problems.push(`skip navigation: Enter did not focus main (focused ${target.id || target.tag})`);
  await page.close();
  // On any other page, skipping must keep you on that page (left to the browser, "#main" routed to the home page).
  const lesson = await open("#lesson-phishing", 1280, "light");
  await lesson.keyboard.press("Tab"); await lesson.keyboard.press("Enter"); await lesson.waitForTimeout(400);
  const after = await lesson.evaluate(() => ({ hash: location.hash, h1: document.querySelector("main h1")?.textContent, focus: document.activeElement?.id }));
  if (after.hash !== "#lesson-phishing" || !/phishing/i.test(after.h1 || "") || after.focus !== "main") problems.push(`skip navigation: on a lesson the skip link left the page (${JSON.stringify(after)})`);
  await lesson.close();
});

// Progress survives a full reload, including on the phone-sized layout.
await journey("progress persistence", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(15000);
  page.on("pageerror", e => problems.push(`progress persistence: page error: ${e.message}`));
  await page.addInitScript(() => {
    localStorage.setItem("pn-theme", "dark");
    localStorage.setItem("patch-notes-progress", JSON.stringify({ xp: 125, done: {}, labs: {}, missions: {}, agency: {} }));
  });
  await page.goto(base + "#progress");
  await page.waitForFunction(() => /uid=intern/i.test(document.querySelector("main h1")?.innerText || ""));
  const before = await page.locator("main h1").innerText();
  await page.reload();
  await page.waitForFunction(() => /uid=intern/i.test(document.querySelector("main h1")?.innerText || ""));
  const after = await page.locator("main h1").innerText();
  if (!/uid=intern/i.test(before)) problems.push(`progress persistence: expected intern rank after restore, saw "${before}"`);
  if (after !== before) problems.push(`progress persistence: rank changed after reload ("${before}" -> "${after}")`);
  await page.close();
});

// 2. An evidence lab, answered from its own content, to the end.
await journey("lab slow-network", async () => {
  const lab = labs.find(l => l.id === "slow-network"), page = await open("#lab-slow-network", 390, "light");
  await page.waitForSelector("#lab-steps");
  for (const [i, st] of lab.steps.entries()) {
    // Options are shown in a mixed order, so pick the right one by its text, not its authored position.
    if (st.type === "choice") await page.evaluate(([i, text]) => [...document.querySelectorAll(`.lab-step[data-i="${i}"] .opt`)].find(o => o.textContent.trim() === text).click(), [i, st.options[st.answer]]);
    else { await page.fill(`#ans-${i}`, st.answers[0]); await page.evaluate(i => document.querySelector(`[data-form="${i}"]`).requestSubmit(), i); }
  }
  const solved = await page.evaluate(() => document.querySelectorAll(".lab-step.got").length);
  if (solved !== lab.steps.length) problems.push(`lab slow-network: ${solved} of ${lab.steps.length} steps solved`);
  await page.close();
});

// 3. Shadow an Agency shift from clocking in to "Your turn", then start working it.
await journey("shadow shift-01", async () => {
  const page = await open("#agency-shift-01", 390, "light");
  await page.waitForSelector("#ag-tap");
  await page.evaluate(() => document.querySelector("#ag-tap").click());
  await page.waitForSelector("#ag-dossier:not([hidden])", { timeout: 20000 });
  await page.waitForSelector("#ag-desk-go");
  await page.evaluate(() => { document.querySelector('[name="ag-level"][value="shadow"]').click(); document.querySelector("#ag-desk-go").click(); });
  await page.waitForSelector("#ag-sh-h");
  let steps = 1;
  while (await page.evaluate(() => { const b = document.querySelector("#ag-sh-next"); if (b) b.click(); return !!b; })) if (++steps > 120) break;
  if (!(await page.$('[data-turn="guided"]'))) problems.push(`shadow shift-01: never reached "Your turn" (${steps} steps)`);
  else {
    await page.evaluate(() => document.querySelector('[data-turn="guided"]').click());
    if (!(await page.evaluate(() => !document.querySelector("#ag-desk").hidden && document.querySelectorAll("#ag-queue li").length > 0))) problems.push("shadow shift-01: Your turn didn't open the desk");
  }
  await overflow(page, "shadow shift-01");
  await page.close();
});

// 3b. Work a shift by hand, guided: clock in, close every alert through the real close form (leaving part-way and
// carrying on once), then the handover
// form and the debrief. The engine is unit-tested; this checks the desk's form wiring actually drives it.
await journey("work shift-01", async () => {
  const page = await open("#agency-shift-01", 390, "light");
  await page.waitForSelector("#ag-tap");
  await page.evaluate(() => document.querySelector("#ag-tap").click());
  await page.waitForSelector("#ag-dossier:not([hidden])", { timeout: 20000 });
  await page.waitForSelector("#ag-desk-go");
  await page.evaluate(() => document.querySelector("#ag-desk-go").click());  // guided is the default
  await page.waitForSelector("#ag-desk:not([hidden])", { timeout: 10000 });
  for (let guard = 0; guard < 12; guard++) {
    const opened = await page.evaluate(() => { const b = document.querySelector("#ag-queue button.ag-qitem:not(.closed)"); if (b) { b.click(); return true; } return false; });
    if (opened && await page.$("#ag-closeform")) {
      await page.evaluate(() => document.querySelector("#ag-fill")?.click());   // "Show me the answer" fills the form
      await page.waitForTimeout(80);
      await page.evaluate(() => document.querySelector("#ag-closeform")?.requestSubmit());
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => document.querySelector("#ag-wait")?.click());  // let late alerts arrive
    await page.waitForTimeout(80);
    if (guard === 1) {  // leave part-way, come back and carry on: the shift is saved on the device
      const closed = await page.$$eval("#ag-queue button.ag-qitem.closed", l => l.length), clock = await page.textContent("#ag-clock");
      await page.evaluate(() => { location.hash = "#agency"; });
      await page.waitForTimeout(300);
      await page.evaluate(() => { location.hash = "#agency-shift-01"; });
      await page.waitForSelector("#ag-carry", { timeout: 10000 }).catch(() => problems.push("work shift-01: no Carry on after leaving part-way"));
      await page.evaluate(() => document.querySelector("#ag-carry")?.click());
      await page.waitForSelector("#ag-desk:not([hidden])", { timeout: 10000 });
      const again = [await page.$$eval("#ag-queue button.ag-qitem.closed", l => l.length), await page.textContent("#ag-clock")];
      if (again[0] !== closed || again[1] !== clock) problems.push(`work shift-01: resumed at ${again} not ${closed},${clock}`);
    }
    if (await page.evaluate(() => { const q = [...document.querySelectorAll("#ag-queue button.ag-qitem")]; return q.length > 0 && q.every(b => b.classList.contains("closed")); })) break;
  }
  if (!(await page.$("#ag-handform"))) { problems.push("work shift-01: handover form never appeared"); await page.close(); return; }
  await page.evaluate(() => { document.querySelector("#ag-hfill")?.click(); document.querySelector("#ag-handform")?.requestSubmit(); });
  await page.waitForSelector("#ag-debrief:not([hidden])", { timeout: 5000 }).catch(() => problems.push("work shift-01: no debrief after handover"));
  if (!/Clocked out/.test(await page.evaluate(() => document.querySelector("#ag-d-h")?.innerText || ""))) problems.push("work shift-01: debrief didn't render");
  if (await page.evaluate(() => localStorage.getItem("pn-shift:shift-01"))) problems.push("work shift-01: the part-way save outlived the finished shift");
  await overflow(page, "work shift-01");
  await page.close();
});

// 4. "Learn the basics" puts you on a route: the bar shows the stop, going deeper keeps it, and Next stop moves along it.
await journey("route", async () => {
  const page = await open("", 390, "dark");
  await page.click(".start-card >> nth=0");   // a role card on the home page opens that path's ladder
  await page.waitForTimeout(400);
  await page.click(".steps a >> nth=0");       // start the route at the ladder's first stop
  await page.waitForTimeout(400);
  const bar = async () => page.evaluate(() => { const t = document.getElementById("trail"); return t && !t.hidden ? t.innerText.replace(/\s+/g, " ") : ""; });
  if (!/Stop 1 of \d+/.test(await bar())) problems.push(`route: no route bar on the first stop (${await bar() || "hidden"})`);
  // Going deeper on the stop's topic (its next stage) keeps you at that stop, not on a side trip.
  if (await page.evaluate(() => { const n = document.querySelector("main .loopwrap a.loop-node"); if (n) n.click(); return !!n; })) {
    await page.waitForTimeout(800);
    if (!/going deeper.*Stop 1 of \d+/i.test(await bar())) problems.push(`route: going deeper lost the stop (${await bar() || "hidden"})`);
    if (!(await page.$("main .loop-node.here"))) problems.push("route: the topic steps don't show where you are");
    await page.goBack(); await page.waitForTimeout(400);
  }
  await page.click("#trail .trail-nav .btn.brand");
  await page.waitForTimeout(300);
  if (!/Stop 2 of \d+/.test(await bar())) problems.push(`route: Next stop didn't reach stop 2 (${await bar() || "hidden"})`);
  await page.close();
});

// 5. A PBQ answered by hand: choose every answer in its selects, check, see 100%, and find the best score saved on the
// exam page. Then a firewall PBQ built rule by rule. Grading is unit-tested; this checks the page's wiring drives it.
await journey("PBQ answered by hand", async () => {
  const page = await open("#pbq-np-pbq-ports", 390, "light");
  await page.waitForSelector(".pbq-match select");
  const answers = await page.evaluate(() => Object.fromEntries(DATA.certs.find(c => c.id === "network-plus").pbqs.find(q => q.id === "np-pbq-ports").items.map(i => [i.id, i.answer])));
  for (const [id, a] of Object.entries(answers)) await page.selectOption(`select[data-id="${id}"]`, a);
  await page.click('[data-act="check"]');
  if (!/8 of 8 parts right \(100%\)/.test(await page.textContent(".pbq-score"))) problems.push("PBQ: answering every item right didn't score 100%");
  await page.goto(base + "#cert-network-plus"); await page.waitForSelector(".pbq-panel");
  if (!/best 100%/i.test(await page.locator(".pbq-panel").textContent())) problems.push("PBQ: the best score wasn't saved to the exam page");
  await page.goto(base + "#pbq-sp-pbq-firewall"); await page.waitForSelector('select[data-r="0"][data-f="action"]');
  const rules = [["allow", "tcp", "any", "10.0.0.5", "443"], ["allow", "tcp", "10.0.5.0/24", "10.0.0.5", "22"], ["deny", "any", "any", "any", "any"]];
  for (const [k, r] of rules.entries()) for (const [j, f] of ["action", "proto", "src", "dst", "port"].entries()) await page.selectOption(`select[data-r="${k}"][data-f="${f}"]`, r[j]);
  await page.click('[data-act="check"]');
  if (!/9 of 9 parts right/.test(await page.textContent(".pbq-score"))) problems.push("PBQ: a correct firewall rule set didn't score 9 of 9");
  await overflow(page, "#pbq-sp-pbq-firewall @390");
  await page.close();
});

// Wide screens: the Agency page (view-wide) is centred, not pushed right (it was, by double centring, above ~1600 px).
await journey("agency on a wide screen", async () => {
  const page = await open("#agency-shift-01", 1920, "dark");
  await page.waitForSelector("#agency-root");
  const r = await page.evaluate(() => { const b = document.querySelector("#agency-root").getBoundingClientRect(), m = document.querySelector("main").getBoundingClientRect(); return { left: Math.round(b.left - m.left), right: Math.round(m.right - b.right) }; });
  if (Math.abs(r.left - r.right) > 4) problems.push(`agency on a wide screen: not centred (${r.left} px left, ${r.right} px right)`);
  await page.close();
});

// Card pictures must look different, not just have different names: two re-encoded copies of one picture slipped
// through once (cia-triad and cia-which-pillar). The browser decodes each card and compares a 16 x 16 difference hash:
// a re-encoded copy scores 0 of 256, the closest genuinely different cards (16 Nov) about 22.
await journey("no two card pictures are the same image", async () => {
  const page = await browser.newPage(); await page.goto(base);
  const files = readdirSync(new URL("../site/img/cards/", import.meta.url)).filter(f => f.endsWith(".webp"));
  await page.waitForLoadState("networkidle");
  const hashes = [];
  for (const f of files) hashes.push(await page.evaluate(async f => {
    const img = new Image(); img.src = "img/cards/" + f;
    try { await img.decode(); } catch (e) { return [f, null]; }
    const c = document.createElement("canvas"); c.width = 17; c.height = 16; const x = c.getContext("2d"); x.drawImage(img, 0, 0, 17, 16);
    const d = x.getImageData(0, 0, 17, 16).data, g = i => d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    let bits = ""; for (let r = 0; r < 16; r++) for (let k = 0; k < 16; k++) bits += g(r * 17 + k) > g(r * 17 + k + 1) ? "1" : "0";
    return [f, bits];
  }, f));
  const broken = hashes.filter(h => !h[1]).map(h => h[0]);
  if (broken.length) problems.push(`card pictures that won't load: ${broken.join(", ")}`);
  const ok = hashes.filter(h => h[1]);
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    let dist = 0; for (let k = 0; k < 256; k++) dist += ok[i][1][k] !== ok[j][1][k];
    if (dist <= 8) problems.push(`card pictures look identical: ${ok[i][0]} and ${ok[j][0]}`);
  }
  await page.close();
});

// Offline: after one online visit the service worker (static/sw.js) serves the page and a lesson with no connection.
await journey("works offline after a visit", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" }), page = await ctx.newPage();
  await page.goto(base); await page.evaluate(() => localStorage.setItem("pn-hello", "1"));
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.goto(base + "#lesson-malware"); await page.waitForSelector(".sc-spot");  // the photo scene, and its image
  await page.waitForFunction(() => document.querySelector(".sc-photo img")?.complete);
  // The worker stores its copy after the image has loaded: wait until it's really in the cache (CI is slower).
  await page.waitForFunction(async () => !!(await caches.match(document.querySelector(".sc-photo img").currentSrc, { ignoreSearch: true })), null, { timeout: 10000 })
    .catch(() => problems.push("offline: the lesson's photo was never stored in the cache"));
  await ctx.setOffline(true); await page.reload();
  await page.waitForSelector(".sc-spot", { timeout: 8000 });
  if (!(await page.evaluate(() => document.querySelector(".sc-photo img")?.naturalWidth))) problems.push("offline: the lesson's photo didn't load from the cache");
  if (!/Malware/i.test(await page.locator("h1").first().textContent())) problems.push("offline: the lesson didn't load from the cache");
  await ctx.close();
});

await browser.close(); server.close();
if (problems.length) { console.error(problems.join("\n")); console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log(`Smoke test passed: ${ROUTES.length} routes at desktop and phone, signature features on ${Object.keys(SIGNATURE).length} pages, a lab, a shadowed shift, a route, two PBQs and offline.`);
