// By hand, before a release (a few minutes a width; run widths in parallel): every route at the widths in WIDTHS, and every
// SVG <text> on it must sit inside its own SVG's box. The box check skips SVG text, so a diagram label drawn past its
// viewBox (the 19 Nov cycle diagram: "Remediate" below a fixed 220 x 200 box) was only found by eye. Prints
// "width #route svg-class: "label" past the left/right/top/bottom by Npx". Labels hidden or inside a closed fold are skipped.
// Use: WIDTHS=390,1280 node tests/svg_check.mjs   (ONLY=route,route to narrow)
import { createServer } from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { join, extname, normalize } from "node:path"; import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".mp3": "audio/mpeg" };
const s = createServer((q, r) => { let f = join("site", normalize(decodeURIComponent(q.url.split("?")[0]))); if (f.endsWith("/")) f += "index.html"; if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const base = `http://localhost:${s.address().port}/`, b = await chromium.launch();
const p0 = await b.newPage(); await p0.goto(base);
const routes = process.env.ONLY ? process.env.ONLY.split(",") : await p0.evaluate(() => { const r = ["today", "learn", "missions", "agency", "exams", "progress", "play", "careers", "feedback", "news", "cve-radar", "review", "headers-check", "log-search", "cvss-decode", "subnet-calc"];
  DATA.lessons.forEach(x => r.push("lesson-" + x.id)); DATA.labs.forEach(x => r.push("lab-" + x.id)); DATA.missions.forEach(x => r.push("mission-" + x.id)); DATA.certs.forEach(x => r.push("cert-" + x.id));
  DATA.certs.forEach(x => (x.pbqs || []).forEach(q => r.push("pbq-" + q.id))); DATA.agency.forEach(x => r.push("agency-" + x.id)); (DATA.paths || []).forEach(x => r.push("path-" + x.id)); return r; });
await p0.close();
const widths = (process.env.WIDTHS || "390,1280").split(",").map(Number), out = [];
// Every visible <text> (and <tspan>-less text) against the box of the <svg> it belongs to (the outermost one on the page,
// so a nested icon svg is judged against the drawing it sits in). 2 px of slack for anti-aliasing.
const probe = () => {
  const res = [], cls = el => (el.getAttribute("class") || el.id || "svg").split(/\s+/)[0];
  const hidden = el => { for (let e = el; e; e = e.parentElement) { if (e.tagName === "DETAILS" && !e.open && !e.querySelector(":scope > summary")?.contains(el)) return true; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return true; } return false; };
  for (const t of document.querySelectorAll("main svg text")) {
    if (!t.textContent.trim() || hidden(t)) continue;
    let svg = t.ownerSVGElement; while (svg?.parentElement?.closest("svg")) svg = svg.parentElement.closest("svg");
    if (!svg) continue;
    const a = t.getBoundingClientRect(), o = svg.getBoundingClientRect();
    if (a.width < 1 || o.width < 1) continue;
    const past = { left: o.left - a.left, right: a.right - o.right, top: o.top - a.top, bottom: a.bottom - o.bottom };
    const [side, px] = Object.entries(past).sort((x, y) => y[1] - x[1])[0];
    if (px > 2) res.push(`${cls(svg)}: "${t.textContent.trim().slice(0, 30)}" past the ${side} by ${Math.round(px)}px`);
  }
  return [...new Set(res)];
};
for (const w of widths) {
  const pg = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
  for (const r of routes) {
    try { await pg.goto(base + "#" + r); await pg.waitForTimeout(900); } catch (e) { out.push(`${w} #${r} failed to load: ${e.message}`); continue; }
    for (const line of await pg.evaluate(probe)) out.push(`${w} #${r} ${line}`);
  }
  await pg.close();
  console.log(`-- ${w}: ${routes.length} routes`);
}
console.log(out.join("\n")); console.log(`${out.length} findings`);
await b.close(); s.close();
