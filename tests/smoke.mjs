// Browser smoke test (runs in CI after the build, before deploy): serves site/, opens the key routes on a desktop
// (dark theme) and a phone (light theme), and plays three journeys a learner takes: an evidence lab to the end,
// a shadowed Agency shift to "Your turn", and a route from "Learn the basics" with its route bar.
// It fails on page errors, failed requests to the site and sideways scrolling. Deliberately small and quick: the
// fuller checks (axe, screenshots) stay in tests/browser_check.mjs, run by hand. Writes nothing into site/.
//
//   python3 build.py --offline && node tests/smoke.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = new URL("../site/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".xml": "application/xml", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp" };
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
const ROUTES = ["#today", "#learn", "#missions", "#agency", "#exams", "#progress", "#news", "#cve-radar", "#cert-network-plus",
  "#path-soc", "#lesson-phishing", "#lab-slow-network", "#lab-vlans", "#lab-network-builder", "#mission-dhcp", "#agency-shift-01", "#subnet-calc"];
for (const route of ROUTES) for (const [width, theme] of [[1280, "dark"], [390, "light"]]) {
  const page = await open(route, width, theme);
  if (!(await page.evaluate(() => (document.querySelector("main")?.innerText || "").trim().length > 40))) problems.push(`${route} @${width}: the page is empty`);
  await overflow(page, `${route} @${width}`);
  await page.close();
}

// 2. An evidence lab, answered from its own content, to the end.
await journey("lab slow-network", async () => {
  const lab = labs.find(l => l.id === "slow-network"), page = await open("#lab-slow-network", 390, "light");
  await page.waitForSelector("#lab-steps");
  for (const [i, st] of lab.steps.entries()) {
    if (st.type === "choice") await page.evaluate(([i, j]) => document.querySelector(`.lab-step[data-i="${i}"] .opt[data-j="${j}"]`).click(), [i, st.answer]);
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

// 4. "Learn the basics" puts you on a route: the bar shows the stop, and Next stop moves along it.
await journey("route", async () => {
  const page = await open("", 390, "dark");
  await page.click(".start-card >> nth=0");
  await page.waitForTimeout(400);
  const bar = async () => page.evaluate(() => { const t = document.getElementById("trail"); return t && !t.hidden ? t.innerText.replace(/\s+/g, " ") : ""; });
  if (!/Stop 1 of \d+/.test(await bar())) problems.push(`route: no route bar on the first stop (${await bar() || "hidden"})`);
  await page.click("#trail .trail-nav .btn.brand");
  await page.waitForTimeout(300);
  if (!/Stop 2 of \d+/.test(await bar())) problems.push(`route: Next stop didn't reach stop 2 (${await bar() || "hidden"})`);
  await page.close();
});

await browser.close(); server.close();
if (problems.length) { console.error(problems.join("\n")); console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log(`Smoke test passed: ${ROUTES.length} routes at desktop and phone, a lab, a shadowed shift and a route.`);
