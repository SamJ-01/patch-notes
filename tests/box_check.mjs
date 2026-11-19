// By hand, before a release (about 10 minutes for one width; run widths in parallel): every route at the widths in WIDTHS: anything that sticks out of the card/panel/chip it sits in, text cut off by its
// own box, and text boxes overlapping other text. Prints "width #route selector: problem".
import { measureBoxes } from "./layout_probe.mjs";
import { createServer } from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { join, extname, normalize } from "node:path"; import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
const s = createServer((q, r) => { let f = join("site", normalize(decodeURIComponent(q.url.split("?")[0]))); if (f.endsWith("/")) f += "index.html"; if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const base = `http://localhost:${s.address().port}/`, b = await chromium.launch();
const p0 = await b.newPage(); await p0.goto(base);
const routes = process.env.ONLY ? process.env.ONLY.split(",") : await p0.evaluate(() => { const r = ["today", "learn", "missions", "agency", "exams", "progress", "play", "careers", "feedback", "news", "cve-radar", "review", "headers-check", "log-search", "cvss-decode", "subnet-calc"];
  DATA.lessons.forEach(x => r.push("lesson-" + x.id)); DATA.labs.forEach(x => r.push("lab-" + x.id)); DATA.missions.forEach(x => r.push("mission-" + x.id)); DATA.certs.forEach(x => r.push("cert-" + x.id));
  DATA.certs.forEach(x => (x.pbqs || []).forEach(q => r.push("pbq-" + q.id))); DATA.agency.forEach(x => r.push("agency-" + x.id)); (DATA.paths || []).forEach(x => r.push("path-" + x.id)); return r; });
await p0.close();
const measure = measureBoxes;
const widths = (process.env.WIDTHS || "390,600,760,900,1024,1280").split(",").map(Number); const out = [];
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" }), pg = await ctx.newPage();
  await pg.addInitScript(() => { localStorage.setItem("pn-hello", "1"); localStorage.setItem("pn-patch", "off"); });
  for (const r of routes) { try { await pg.goto(base + "?w#" + r); await pg.waitForTimeout(700); for (const f of await pg.evaluate(measure)) out.push(`${w} #${r} ${f}`); } catch (e) { out.push(`${w} #${r} ERROR ${e.message.slice(0, 80)}`); } }
  await ctx.close();
}
console.log(out.join("\n")); console.log(out.length + " findings"); await b.close(); s.close();
