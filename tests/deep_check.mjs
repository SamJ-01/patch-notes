// Deep bug run (by hand, not CI): on every route, at each width in WIDTHS, press every visible button in the page one
// after another with animations ON, and after each press look for page and console errors, failed requests, sideways
// scroll, anything that flew outside its diagram (measureEscapes) and broken text ("undefined", "NaN"). When a page is
// done, measure its final state for overlaps and content sticking out of its box (measureBoxes). Skips anything
// destructive or outbound, like tests/interaction_check.mjs. Split the routes across processes with PART=i/n.
//
//   python3 build.py --offline && WIDTHS=390 PART=1/2 node tests/deep_check.mjs
import { createServer } from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { join, extname, normalize } from "node:path"; import { createRequire } from "node:module";
import { measureBoxes, measureEscapes, measureText } from "./layout_probe.mjs";
const SITE = new URL("../site/", import.meta.url).pathname, { chromium } = createRequire(import.meta.url)("playwright");
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".css": "text/css", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const s = createServer((q, r) => { let f = join(SITE, normalize(decodeURIComponent(q.url.split("?")[0]))); if (f.endsWith("/")) f += "index.html"; if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const base = `http://localhost:${s.address().port}/`, b = await chromium.launch(), out = [];
const p0 = await b.newPage(); await p0.goto(base); await p0.waitForTimeout(800);
let routes = process.env.ONLY ? process.env.ONLY.split(",") : await p0.evaluate(() => { const r = ["today", "learn", "missions", "agency", "exams", "progress", "news", "cves", "play", "careers", "glossary", "review", "feedback", "headers-check", "log-search", "cvss-decode", "subnet-calc"];
  DATA.lessons.forEach(x => r.push("lesson-" + x.id)); DATA.labs.forEach(x => r.push("lab-" + x.id)); DATA.missions.forEach(x => r.push("mission-" + x.id)); DATA.paths.forEach(x => r.push("path-" + x.id));
  DATA.certs.forEach(x => { r.push("cert-" + x.id); (x.pbqs || []).forEach(q => r.push("pbq-" + q.id)); }); DATA.agency.forEach(x => r.push("agency-" + x.id)); return r; });
await p0.close();
if (process.env.PART) { const [i, n] = process.env.PART.split("/").map(Number); routes = routes.filter((_, k) => k % n === i - 1); }
const MAX = Number(process.env.MAX || 60), SKIP = /reset|clear|delete|remove|print|download|export|copy|restore|send feedback|forget|hide patch|start again/i;
const widths = (process.env.WIDTHS || "390,760,1280").split(",").map(Number);
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 860 }, reducedMotion: "no-preference" }), p = await ctx.newPage(); let route = "", last = "";
  const note = m => out.push(`${w} #${route} ${last ? `[after "${last}"] ` : ""}${m}`);
  p.on("pageerror", e => note(`PAGE ERROR ${e.message.slice(0, 200)}`));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource.*mp3/.test(m.text())) note(`CONSOLE ${m.text().slice(0, 200)}`); });
  p.on("response", r => { if (r.url().startsWith(base) && r.status() >= 400) note(`HTTP ${r.status()} ${r.url().slice(base.length)}`); });
  p.on("dialog", d => d.dismiss().catch(() => {}));
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("dc")) { localStorage.clear(); sessionStorage.setItem("dc", "1"); } localStorage.setItem("pn-hello", "1"); sessionStorage.setItem("pn-hello", "1"); } catch (e) {} });
  await p.goto(base); await p.waitForTimeout(500);
  let presses = 0;
  for (const r of routes) {
    route = r; last = ""; await p.evaluate(h => { location.hash = h; }, r); await p.waitForTimeout(900);
    const seen = new Set();
    for (const m of await p.evaluate(measureText)) { seen.add(m); note(m); }
    for (let k = 0; k < MAX; k++) {
      const btns = p.locator("main button:visible:not([disabled])"); const n = await btns.count(); if (k >= n) break;
      const bt = btns.nth(k), label = ((await bt.getAttribute("aria-label").catch(() => null)) || (await bt.innerText().catch(() => "")) || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (SKIP.test(label) || await bt.evaluate(e => e.type === "submit" && !!e.closest("#fb-form")).catch(() => true)) continue;
      last = label; await bt.click({ timeout: 1500 }).catch(() => {}); presses++;
      await p.waitForTimeout(260);
      if (await p.evaluate(h => location.hash.slice(1) !== h, r)) { await p.evaluate(h => { location.hash = h; }, r); await p.waitForTimeout(600); continue; }
      for (const m of [...await p.evaluate(measureEscapes), ...await p.evaluate(measureText)]) if (!seen.has(m)) { seen.add(m); note(m); }
      if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) && !seen.has("sideways")) { seen.add("sideways"); note("SIDEWAYS scroll"); }
    }
    last = "all buttons"; await p.waitForTimeout(800);
    for (const m of await p.evaluate(measureBoxes)) note(m);
  }
  out.push(`-- ${w}: ${routes.length} routes, ${presses} presses`);
  await ctx.close();
}
console.log(out.join("\n")); console.log(out.filter(l => !l.startsWith("--")).length + " findings");
await b.close(); s.close();
