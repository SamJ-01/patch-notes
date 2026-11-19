// Browser compatibility guards for the code we ship. Each rule is a bug that reached (or nearly reached) a learner:
// a look-behind regex makes a whole module fail to parse on iOS before 16.4; an <animateMotion> added after the page
// has loaded starts "in the past" in Safari, so the packet teleported (19 Nov); requestIdleCallback doesn't exist in Safari.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } })(join(root, "static/js"));
for (const f of readdirSync(join(root, "src/app"))) if (f.endsWith(".js")) files.push(join(root, "src/app", f));
// Code only: drop // line comments so explanations can name the things they avoid.
const code = f => readFileSync(f, "utf8").split("\n").map(l => l.replace(/(^|\s)\/\/ .*$/, "")).join("\n");

test("no look-behind in regular expressions (iOS before 16.4 can't parse them)", () => {
  const bad = files.filter(f => /\(\?<[=!]/.test(code(f))).map(f => f.slice(root.length));
  assert.deepEqual(bad, []);
});
test("SVG animations added by script start on demand (begin=\"indefinite\" + beginElement), never on insert", () => {
  const bad = files.filter(f => { const c = code(f); return /<animate(Motion|Transform)?\b/.test(c) && !/begin="indefinite"/.test(c); }).map(f => f.slice(root.length));
  assert.deepEqual(bad, []);
});
test("requestIdleCallback is only used behind a check (Safari has none)", () => {
  const bad = files.filter(f => { const c = code(f); return /requestIdleCallback\(/.test(c) && !/typeof requestIdleCallback/.test(c); }).map(f => f.slice(root.length));
  assert.deepEqual(bad, []);
});
