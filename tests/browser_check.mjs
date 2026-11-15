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
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["#today", "#learn", "#missions", "#agency", "#exams", "#progress", "#news", "#cves", "#cert-network-plus", "#lesson-phishing", "#lab-slow-network", "#subnet-calc", "#lab-vlans", "#lesson-web-access", "#lesson-phishing|text=Sign in to keep your mail", "#lesson-certificates|text=Self-signed"];
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


// Check all four pre-shift client maps at phone width: long node labels must stay inside their plates.
for (const id of ["01", "02", "03", "04"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
  const errs = [];
  page.on("pageerror", e => errs.push(`page error: ${e.message}`));
  page.on("response", r => r.status() >= 400 && !r.url().endsWith("favicon.ico") && errs.push(`${r.status()} ${r.url()}`));
  try {
    await page.goto(base);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pn-theme", "dark"); });
    await page.goto(base + `#agency-shift-${id}`);
    await page.waitForSelector("#ag-tap");
    await page.click("#ag-tap");
    await page.waitForSelector("#ag-dossier:not([hidden])");
    const labels = await page.evaluate(() => [...document.querySelectorAll(".infra-map .im-node")].map(node => {
      const plate = node.querySelector(".im-plate")?.getBoundingClientRect();
      const labelEl = node.querySelector(".im-lbl");
      const subEl = node.querySelector(".im-sub");
      const label = labelEl?.getBoundingClientRect();
      const sub = subEl?.getBoundingClientRect();
      const inside = box => !box || (!!plate && box.left >= plate.left - 1 && box.right <= plate.right + 1);
      return {
        text: labelEl?.dataset.label || labelEl?.textContent || "(missing)",
        subtext: subEl?.dataset.label || subEl?.textContent || "",
        plateLeft: plate?.left ?? null, plateRight: plate?.right ?? null, plateWidth: plate?.width ?? null,
        labelLeft: label?.left ?? null, labelRight: label?.right ?? null, labelWidth: label?.width ?? null,
        subLeft: sub?.left ?? null, subRight: sub?.right ?? null, subWidth: sub?.width ?? null,
        fits: !!plate && !!label && inside(label) && inside(sub),
      };
    }));
    if (labels.length !== 5) errs.push(`expected 5 infrastructure nodes, found ${labels.length}`);
    const overflow = labels.filter(x => !x.fits);
    if (overflow.length) errs.push(`node labels outside their plates: ${JSON.stringify(overflow)}`);
    // The labels once "fitted" inside a map that had been squeezed to 47px by a two-column rule that ignored
    // the phone layout, so the map must also be a readable size and the client file must not scroll sideways.
    const size = await page.evaluate(() => ({ map: document.querySelector(".infra-map svg")?.getBoundingClientRect().width || 0,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
    if (size.map < 280) errs.push(`the client map is only ${Math.round(size.map)}px wide on a phone`);
    if (size.sideways) errs.push("the client file scrolls sideways on a phone");
  } catch (e) {
    errs.push(`journey error: ${e.message.split(String.fromCharCode(10))[0]}`);
  }
  problems += errs.length;
  console.log(`${errs.length ? "✗" : "✓"} Agency map ${id} · dark · phone${errs.length ? String.fromCharCode(10) + "    " + errs.join(String.fromCharCode(10) + "    ") : ""}`);
  await page.close();
}

// Every mission is a room (docs/diagram-standard.md). At phone width, with motion on: the packet must be big
// enough to tap although the stage is scaled down, a delivered packet must leave the tab order, and nothing may
// stand outside the room or make the page scroll sideways.
for (const id of ["dhcp", "dns", "ssh-brute", "phish-triage"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(`page error: ${e.message}`));
  try {
    await page.goto(base);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pn-theme", "dark"); });
    await page.goto(base + `#mission-${id}`);
    await page.waitForSelector("#m-svg .m-dev");
    if (!(await page.locator("section.stage.room").count())) errs.push("the mission is not drawn as a room");
    await page.click("#m-step");
    await page.waitForSelector("#m-svg .m-pkt");
    const tap = await page.$eval("#m-svg .m-pkt .m-hit", r => Math.min(r.getBoundingClientRect().width, r.getBoundingClientRect().height));
    if (tap < 44) errs.push(`the packet's tap area is ${Math.round(tap)}px across on a phone`);
    await page.waitForSelector("#m-svg .m-pkt.arrived", { timeout: 8000 });
    const stops = await page.$$eval("#m-svg .m-pkt.arrived", ps => ps.filter(p => p.getAttribute("tabindex") !== "-1" || p.getAttribute("aria-hidden") !== "true").length);
    if (stops) errs.push(`${stops} delivered packet(s) are still keyboard stops`);
    const room = await page.evaluate(() => {
      const sb = document.querySelector("#m-svg").getBoundingClientRect();
      const out = [...document.querySelectorAll("#m-svg .m-name, #m-svg .m-ip, #m-svg .m-status")].map(t => t.getBoundingClientRect()).filter(r => r.width && (r.left < sb.left - 1 || r.right > sb.right + 1 || r.bottom > sb.bottom + 1)).length;
      return { out, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    if (room.out) errs.push(`${room.out} label(s) stand outside the room`);
    // A phone keeps the desktop arrangement, so the picture must still be wider than tall and its speech must
    // sit under it, not over it.
    const shape = await page.evaluate(() => { const r = document.querySelector("#m-svg").getBoundingClientRect(); return { wide: r.width > r.height, floating: document.querySelectorAll("#m-bubbles .bubble").length, said: document.querySelectorAll("#m-says .m-say").length }; });
    if (!shape.wide) errs.push("the room is taller than it is wide on a phone (it should keep the desktop arrangement)");
    if (shape.floating || !shape.said) errs.push(`speech should sit under the room on a phone (${shape.floating} over it, ${shape.said} under it)`);
    if (room.sideways) errs.push("the mission scrolls sideways on a phone");
  } catch (e) {
    errs.push(`journey error: ${e.message.split(String.fromCharCode(10))[0]}`);
  }
  problems += errs.length;
  console.log(`${errs.length ? "✗" : "✓"} Mission room ${id} · dark · phone${errs.length ? String.fromCharCode(10) + "    " + errs.join(String.fromCharCode(10) + "    ") : ""}`);
  await page.close();
}

// The route matrix above checks the Agency hub. Also exercise its live shift UI: shadowing,
// the final "Your turn" state, and the real workstation (including the phone-only tabs).
for (const theme of ["dark", "light"]) for (const [vw, width] of [["desktop", 1280], ["phone", 390]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, bypassCSP: !!axe, reducedMotion: "reduce" });
  page.setDefaultTimeout(20000);
  const errs = [];
  const where = `Agency shift · ${theme} · ${vw}`;
  page.on("pageerror", e => errs.push(`page error: ${e.message}`));
  page.on("response", r => r.status() >= 400 && !r.url().endsWith("favicon.ico") && errs.push(`${r.status()} ${r.url()}`));
  const audit = async state => {
    if (axe) {
      const violations = await page.evaluate(async () =>
        (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations
          .map(v => `${v.id} ×${v.nodes.length}: ${v.nodes[0].target}`)
      );
      errs.push(...violations.map(v => `axe ${state}: ${v}`));
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) errs.push(`${state}: horizontal overflow by ${overflow}px`);
    await page.screenshot({ path: join(OUT, `agency-${state}-${theme}-${vw}.png`), fullPage: true });
  };
  try {
    await page.goto(base);
    await page.evaluate(t => { localStorage.clear(); localStorage.setItem("pn-theme", t); }, theme);
    await page.goto(base + "#agency-shift-01");
    await page.waitForSelector("#ag-tap");
    await page.click("#ag-tap");
    await page.waitForSelector("#ag-dossier:not([hidden])", { timeout: 20000 });
    await page.locator('[name="ag-level"][value="shadow"]').check();
    await page.click("#ag-desk-go");
    await page.waitForSelector("#ag-sh-h");
    const shadowFrame = await page.evaluate(() => {
      const heading = document.querySelector("#ag-sh-h");
      const masthead = document.querySelector(".masthead");
      const h = heading?.getBoundingClientRect();
      const m = masthead?.getBoundingClientRect();
      return { headingTop: h?.top ?? -1, headingBottom: h?.bottom ?? -1, mastheadBottom: m?.bottom ?? 0, viewportHeight: innerHeight };
    });
    if (shadowFrame.headingTop < shadowFrame.mastheadBottom + 4 || shadowFrame.headingBottom > shadowFrame.viewportHeight) {
      errs.push(`shadow heading is obscured or outside the viewport: ${JSON.stringify(shadowFrame)}`);
    }
    if (axe) await page.addScriptTag({ content: axe });
    await audit("shadow-start");

    let shadowSteps = 0;
    while (await page.locator("#ag-sh-next").count() && shadowSteps < 120) {
      await page.click("#ag-sh-next");
      shadowSteps++;
    }
    if (await page.locator("#ag-sh-next").count()) errs.push("shadowing did not reach the final step within 120 advances");
    await page.waitForSelector(".ag-sh-turn");
    await audit("shadow-your-turn");

    await page.click('[data-turn="guided"]');
    await page.waitForSelector("#ag-desk:not([hidden])");
    const statusStrip = await page.evaluate(() => {
      const strip = document.querySelector("#ag-stats");
      const style = strip ? getComputedStyle(strip) : null;
      return {
        display: style?.display || "missing",
        columns: style ? style.gridTemplateColumns.trim().split(" ").filter(Boolean).length : 0,
        count: strip?.querySelectorAll(".ag-tile").length || 0,
        labels: [...(strip?.querySelectorAll(".ag-tile-l") || [])].map(x => x.textContent.trim()),
      };
    });
    const expectedColumns = width <= 600 ? 2 : 4;
    if (statusStrip.display !== "grid" || statusStrip.columns !== expectedColumns || statusStrip.count !== 4) {
      errs.push(`status strip layout mismatch: expected grid with ${expectedColumns} columns and 4 tiles; saw ${JSON.stringify(statusStrip)}`);
    }
    if (statusStrip.labels.join("|") !== "Open|Closed|Top severity|Shift time") {
      errs.push(`status strip labels changed: ${statusStrip.labels.join(", ")}`);
    }
    await audit("desk-queue");
    if (width <= 900) {
      await page.click('.ag-tab[data-tab="alert"]');
      await audit("desk-alert");
      await page.click('.ag-tab[data-tab="chat"]');
      await audit("desk-chat");
    }
  } catch (e) {
    errs.push(`journey error: ${e.message.split("\n")[0]}`);
  }
  problems += errs.length;
  console.log(`${errs.length ? "✗" : "✓"} ${where}${errs.length ? "\n    " + errs.join("\n    ") : ""}`);
  await page.close();
}

await browser.close(); server.close();
console.log(axe ? "" : "(axe-core not found: set AXE to check accessibility)", `\n${problems} problem(s). Screenshots: ${OUT}`);
process.exit(problems ? 1 : 0);
