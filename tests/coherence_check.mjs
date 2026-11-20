// Learner's-eye check (by hand, before a release; a few minutes): what a newcomer would notice that layout checks don't.
// Every route at one width (WIDTHS, default 1280; ONLY=route,route to narrow):
//  - the same label twice in one list or row of choices (20 Nov: two shifts both "PATCH//AGENCY: Pellow & Finch Logistics")
//  - a page with no way forward: no link or button to another page except going back
//  - stray placeholder or machine text in what a learner reads ("undefined", "NaN", "[object", "TODO", "lorem", "null")
//  - two links on one page with the same words going to different places (a learner can't tell them apart)
// Prints "#route: problem". Pairs with the data rules in tests/test_core.py `Coherence`.
import { createServer } from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { join, extname, normalize } from "node:path"; import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".mp3": "audio/mpeg" };
const s = createServer((q, r) => { let f = join("site", normalize(decodeURIComponent(q.url.split("?")[0]))); if (f.endsWith("/")) f += "index.html"; if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const base = `http://localhost:${s.address().port}/`, b = await chromium.launch();
const p0 = await b.newPage(); await p0.goto(base);
const routes = process.env.ONLY ? process.env.ONLY.split(",") : await p0.evaluate(() => { const r = ["today", "learn", "missions", "agency", "exams", "progress", "play", "careers", "feedback", "news", "cve-radar", "review", "glossary", "headers-check", "log-search", "cvss-decode", "subnet-calc"];
  DATA.lessons.forEach(x => r.push("lesson-" + x.id)); DATA.labs.forEach(x => r.push("lab-" + x.id)); DATA.missions.forEach(x => r.push("mission-" + x.id)); DATA.certs.forEach(x => r.push("cert-" + x.id));
  DATA.certs.forEach(x => (x.pbqs || []).forEach(q => r.push("pbq-" + q.id))); DATA.agency.forEach(x => r.push("agency-" + x.id)); (DATA.paths || []).forEach(x => r.push("path-" + x.id)); return r; });
await p0.close();
export const probe = route => {
  const out = [], main = document.querySelector("main"); if (!main) return ["no main"];
  const txt = el => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const visible = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.tagName === "DETAILS" && !e.open && !e.querySelector(":scope > summary")?.contains(el)) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; } return el.getClientRects().length > 0; };
  // 1. The same label twice among sibling choices.
  const groups = new Set([...main.querySelectorAll("a, button")].map(e => e.parentElement));
  for (const g of groups) {
    const items = [...g.children].filter(e => /^(A|BUTTON)$/.test(e.tagName) && visible(e)), seen = new Map();
    for (const e of items) { const t = txt(e); if (t.length < 8) continue; if (seen.has(t)) out.push(`the same choice twice in one list: "${t.slice(0, 70)}"`); seen.set(t, 1); }
  }
  // 2. A way forward: any link or button to another page that isn't "back".
  const forward = [...main.querySelectorAll("a[href^='#'], a[href^='http'], [data-go]")].filter(a => visible(a) && !/^←|back to/i.test(txt(a)) && a.getAttribute("href") !== "#" + route);
  // An Agency shift or the feedback form is itself the activity: its first screen is the way forward.
  if (!forward.length && !/^(agency-|feedback$)/.test(route)) out.push("no way forward: no link to another page");
  // 3. Machine text a learner would see.
  const body = txt(main);
  for (const bad of [/\bundefined\b/, /\[object /, /\bTODO\b/, /\blorem\b/i]) if (bad.test(body)) out.push(`machine text on the page: ${bad}`);
  // "null" and "NaN" are real words in some lessons (null pointers), so only an element that is nothing else counts.
  for (const e of main.querySelectorAll("*")) if (!e.children.length && /^(null|NaN|undefined)$/.test(txt(e)) && visible(e)) { out.push(`machine text on the page: "${txt(e)}"`); break; }
  // 4. Same words, different places.
  const byText = new Map();
  for (const a of main.querySelectorAll("a[href^='#']")) { if (!visible(a)) continue; const t = txt(a); if (t.length < 10) continue; const h = a.getAttribute("href"); if (!byText.has(t)) byText.set(t, new Set()); byText.get(t).add(h); }
  for (const [t, hs] of byText) if (hs.size > 1) out.push(`"${t.slice(0, 60)}" links to ${hs.size} different places: ${[...hs].slice(0, 3).join(", ")}`);
  return [...new Set(out)];
};
const widths = (process.env.WIDTHS || "1280").split(",").map(Number), out = [];
for (const w of widths) {
  const pg = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
  for (const r of routes) {
    try { await pg.goto(base + "#" + r); await pg.waitForTimeout(900); } catch (e) { out.push(`${w} #${r} failed to load`); continue; }
    for (const line of await pg.evaluate(probe, r)) out.push(`${w} #${r}: ${line}`);
  }
  await pg.close(); console.log(`-- ${w}: ${routes.length} routes`);
}
console.log(out.join("\n")); console.log(`${out.length} findings`);
await b.close(); s.close();
