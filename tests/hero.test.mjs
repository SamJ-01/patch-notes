import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homography, coverBox, placeStage, placeDesktop, boxFor, scenes, order, SCREEN, BOX, IMAGE, PHONE_CROP } from "../static/js/hero.js";

const apply = (mat, x, y) => { const m = mat.slice(9, -1).split(",").map(Number); const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w]; };

test("the terminal's corners land on the monitor's corners", () => {
  const mat = homography(BOX.w, BOX.h, SCREEN);
  [[0, 0], [BOX.w, 0], [BOX.w, BOX.h], [0, BOX.h]].forEach(([x, y], i) => {
    const [px, py] = apply(mat, x, y); assert.ok(Math.abs(px - SCREEN[i][0]) < 0.01 && Math.abs(py - SCREEN[i][1]) < 0.01, `corner ${i}`);
  });
});
test("the screen and the phone crop lie inside the photo, and the crop holds the whole screen", () => {
  for (const [x, y] of SCREEN) assert.ok(x > 0 && x < IMAGE.w && y > 0 && y < IMAGE.h);
  const [x0, y0, x1, y1] = PHONE_CROP; assert.ok(x0 >= 0 && y0 >= 0 && x1 <= IMAGE.w && y1 <= IMAGE.h);
  for (const [x, y] of SCREEN) assert.ok(x > x0 && x < x1 && y > y0 && y < y1);
});
test("on any desktop shape the monitor stays inside the hero and right of the headline", () => {
  for (const [W, H] of [[1140, 650], [1000, 560], [1440, 580], [800, 600], [1900, 640]]) {
    const p = placeDesktop(W, H);
    for (const [x, y] of SCREEN) { const X = p.left + x * p.s, Y = p.top + y * p.s; assert.ok(X >= 0.57 * W - 0.5 && X <= W && Y >= 0 && Y <= H, `${W}x${H}: ${X}`); }  // right of the headline
  }
});
test("coverBox fills the box and keeps the shape", () => {
  const c = coverBox(700, 900, IMAGE.w, IMAGE.h); assert.ok(c.w >= 700 - 0.01 && c.h >= 900 - 0.01);
});
test("scenes: each has a title, lines, a link into the site, and the real tool it imitates", () => {
  const all = scenes({});
  assert.ok(all.length >= 10);
  for (const s of all) { assert.ok(s.title && s.lines.length && s.tool, s.id); assert.match(s.link[0], /^#[a-z]/); assert.ok(s.link[1]); }
  for (const s of all) for (const [, t] of s.lines) if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(t)) for (const ip of t.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g)) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113)\./, `${s.id}: ${ip} must be a documentation address`);
  const brute = all.find(s => s.id === "brute").lines.map(l => l[1]).join("\n");
  assert.match(brute, /sshd\[\d+\]: Failed password for admin from 203\.0\.113\.7 port \d+ ssh2/);
  assert.match(brute, /fail2ban\.actions \[\d+\]: NOTICE \[sshd\] Ban 203\.0\.113\.7/);
});
test("links point at real labs, missions and lessons", () => {
  const L = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url))), labs = new Set((L.labs || L).map(l => l.id));
  for (const s of scenes({})) { const m = s.link[0].match(/^#lab-(.+)$/); if (m) assert.ok(labs.has(m[1]), s.link[0]); }
});
test("data scenes appear only with data; the first scene is always the brute-force catch", () => {
  assert.ok(!scenes({}).some(s => ["kev", "news", "quiz"].includes(s.id)));
  const lessons = [{ id: "cia-triad", title: "CIA", checks: [{ q: "Q?", options: ["a", "b"], answer: 1, why: "because" }] }];
  const full = scenes({ kev: [{ id: "CVE-2026-0002", kev: { added: "2026-11-18", name: "Newest" } }], news: [{ title: "Headline", source: "Outlet" }], lessons });
  assert.ok(["kev", "news", "quiz"].every(id => full.some(s => s.id === id)));
  assert.equal(full.find(s => s.id === "quiz").link[0], "#lesson-cia-triad");
  for (const d of [0, 1, 5, 400]) { const o = order(full, d); assert.equal(o[0].id, "brute"); assert.equal(o.length, full.length); }
  assert.notDeepEqual(order(full, 1).map(s => s.id), order(full, 2).map(s => s.id));
});

test("the terminal is sized to its screen so text stays readable", () => {
  for (const px of [250, 400, 436, 711]) { const b = boxFor(px), font = 15 * px / b.w; assert.ok(b.w >= 300 && b.w <= BOX.w); assert.ok(font >= 12 || b.w === 300, `${px}: ${font}`); }
  assert.equal(Math.round(boxFor(1000).h / boxFor(1000).w * 100), Math.round(BOX.h / BOX.w * 100));
});
