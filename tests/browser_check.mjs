// Browser check for a built site (not part of CI): serves site/, opens each route at desktop and
// phone widths in dark and light themes, and reports page errors, failed requests, sideways
// overflow, broken images and axe-core WCAG A/AA violations. Screenshots go to $OUT (default: site/_checks).
//
//   python3 build.py --offline && node tests/browser_check.mjs                 # default routes
//   node tests/browser_check.mjs "#mission-ssh-brute|[data-mode=challenge]"     # route|selector to click first
//
// Needs Playwright (global install) and Chromium. axe-core is optional: set AXE to axe.min.js
// (e.g. from `npm pack axe-core`), or have node_modules/axe-core. PROGRESS=file.json preloads progress.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = new URL("../site/", import.meta.url).pathname;
const OUT = process.env.OUT || join(ROOT, "_checks");
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["#today", "#learn", "#missions", "#cert-network-plus", "#progress"];
const axePath = process.env.AXE || new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname;
const axe = existsSync(axePath) ? readFileSync(axePath, "utf8") : null;
const progress = process.env.PROGRESS ? readFileSync(process.env.PROGRESS, "utf8") : null;
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
mkdirSync(OUT, { recursive: true });
let problems = 0;
for (const spec of routes) {
  const [route, click] = spec.split("|");
  for (const theme of ["dark", "light"]) for (const [vw, width] of [["desktop", 1280], ["phone", 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, bypassCSP: !!axe });  // bypass only so axe can be injected
    const errs = [];
    page.on("pageerror", e => errs.push("error: " + e.message));
    page.on("response", r => r.status() >= 400 && !r.url().endsWith("favicon.ico") && errs.push(`${r.status()} ${r.url()}`));
    await page.goto(base);
    await page.evaluate(([t, p]) => { localStorage.clear(); localStorage.setItem("pn-theme", t); if (p) localStorage.setItem("patch-notes-progress", p); }, [theme, progress]);
    await page.goto(base + route); await page.reload(); await page.waitForTimeout(600);
    if (click) { await page.click(click).catch(e => errs.push("click failed: " + e.message.split("\n")[0])); await page.waitForTimeout(400); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) errs.push("horizontal overflow");
    const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.loading !== "lazy").map(i => i.getAttribute("src")));
    if (broken.length) errs.push("broken images: " + broken.join(", "));
    if (axe) {
      await page.addScriptTag({ content: axe });
      const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(v => `${v.id} ×${v.nodes.length}: ${v.nodes[0].target}`));
      errs.push(...v.map(x => "axe " + x));
    }
    const name = `${route.replace(/\W+/g, "") || "home"}${click ? "-clicked" : ""}-${theme}-${vw}.png`;
    await page.screenshot({ path: join(OUT, name), fullPage: true });
    problems += errs.length;
    console.log(`${errs.length ? "✗" : "✓"} ${spec} · ${theme} · ${vw}${errs.length ? "\n    " + errs.join("\n    ") : ""}`);
    await page.close();
  }
}
await browser.close(); server.close();
console.log(axe ? "" : "(axe-core not found: set AXE to check accessibility)", `\n${problems} problem(s). Screenshots: ${OUT}`);
process.exit(problems ? 1 : 0);
