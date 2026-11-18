// Interaction check for a built site (not part of CI; ~15 min): on every route, at desktop (dark) and phone (light),
// press every visible button in the page one after another, and report page errors, console errors, failed requests
// and sideways scroll. Skips anything destructive or outbound (reset, clear, delete, print, download, export, copy,
// restore, and the feedback form's send). It found the 18 Nov "Re-read" glossary clash that route-by-route checks missed.
//
//   python3 build.py --offline && node tests/interaction_check.mjs        # writes the report to $OUT (default stdout only)
import { createServer } from "node:http"; import { readFileSync, existsSync, writeFileSync } from "node:fs"; import { join, extname, normalize } from "node:path"; import { createRequire } from "node:module"; import { execSync } from "node:child_process";
const SITE = new URL("../site/", import.meta.url).pathname, require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require("playwright"); } catch { return require(execSync("npm root -g").toString().trim() + "/playwright"); } })();
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".css": "text/css", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".png": "image/png" };
const s = createServer((q, r) => { let f = join(SITE, normalize(decodeURIComponent(q.url.split("?")[0]))); if (f.endsWith("/")) f += "index.html"; if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const base = `http://localhost:${s.address().port}/`; const b = await chromium.launch(); const out = [];
const p0 = await b.newPage(); await p0.goto(base); await p0.waitForTimeout(800);
const routes = await p0.evaluate(() => { const r = ["today", "learn", "missions", "agency", "exams", "progress", "news", "cves", "play", "careers", "glossary", "stack", "review", "headers-check", "log-search", "cvss-decode", "subnet-calc"];
  DATA.lessons.forEach(x => r.push("lesson-" + x.id)); DATA.labs.forEach(x => r.push("lab-" + x.id)); DATA.missions.forEach(x => r.push("mission-" + x.id)); DATA.paths.forEach(x => r.push("path-" + x.id));
  DATA.certs.forEach(x => { r.push("cert-" + x.id); (x.pbqs || []).forEach(q => r.push("pbq-" + q.id)); }); DATA.agency.forEach(x => r.push("agency-" + x.id)); return r; });
await p0.close();
const SKIP = /reset|clear|delete|remove|print|download|export|copy|restore|send feedback|forget/i;
for (const [w, theme] of [[1280, "dark"], [390, "light"]]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" }); let route = "";
  p.on("pageerror", e => out.push(`${w} #${route} PAGE ERROR ${e.message}`));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource.*mp3/.test(m.text())) out.push(`${w} #${route} CONSOLE ${m.text().slice(0, 200)}`); });
  p.on("response", r => { if (r.url().startsWith(base) && r.status() >= 400) out.push(`${w} #${route} HTTP ${r.status()} ${r.url().slice(base.length)}`); });
  p.on("dialog", d => d.dismiss());
  await p.goto(base); await p.evaluate(t => { localStorage.clear(); localStorage.setItem("pn-hello", "1"); localStorage.setItem("pn-patch", "off"); localStorage.setItem("pn-theme", t); }, theme); await p.reload();
  let clicks = 0;
  for (const r of routes) {
    route = r; await p.evaluate(h => { location.hash = h; }, r); await p.waitForTimeout(700);
    for (let k = 0; k < 30; k++) {
      const btns = p.locator("main button:visible:not([disabled])");
      const n = await btns.count(); if (k >= n) break;
      const bt = btns.nth(k), label = ((await bt.getAttribute("aria-label").catch(() => null)) || (await bt.innerText().catch(() => "")) || "").trim();
      if (SKIP.test(label) || await bt.evaluate(e => e.type === "submit" && !!e.closest("#fb-form")).catch(() => true)) continue;
      await bt.click({ timeout: 1500 }).catch(() => {}); clicks++;
      await p.waitForTimeout(80);
      if (await p.evaluate(h => location.hash.slice(1) !== h, r)) { await p.evaluate(h => { location.hash = h; }, r); await p.waitForTimeout(500); }
    }
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) out.push(`${w} #${route} SIDEWAYS after clicking`);
  }
  out.push(`-- ${w} ${theme}: ${routes.length} routes, ${clicks} button presses`);
  await p.close();
}
if (process.env.OUT) writeFileSync(process.env.OUT, out.join("\n"));
const issues = out.filter(l => !l.startsWith("--"));
console.log(issues.join("\n")); console.log(out.filter(l => l.startsWith("--")).join("\n")); console.log(`${issues.length} issue(s)`);
await b.close(); s.close();
if (issues.length) process.exitCode = 1;
