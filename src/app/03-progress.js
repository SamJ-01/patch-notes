/* ---------- progress & XP (stored only in this browser) ---------- */
const PKEY = "patch-notes-progress";
const RANKS = [[0, "guest"], [100, "intern"], [300, "analyst"], [700, "hunter"], [1500, "responder"], [3000, "root"]];
const FRESH = () => ({ xp: 0, done: {}, daily: null, streak: 0, lastDaily: null, best: {}, flags: {}, labs: {}, labSteps: {}, paths: {}, terms: {}, read: {}, badges: {}, stack: null, log: [], days: {}, missions: {}, exam: {}, mocks: {}, agency: {} });
// Progress is untrusted input: it lives in the browser (anyone can edit it) and can be restored from a file.
// Keep only known fields of the right type, and coerce the XP history so nothing in it can become HTML.
function cleanProgress(src) {
  if (!src || typeof src !== "object" || Array.isArray(src) || typeof src.xp !== "number" || !isFinite(src.xp)) throw new Error("not progress");
  const out = FRESH(), extra = { intro: "", egg: "" };  // flags set later in a visit, not in FRESH
  for (const k of [...Object.keys(out), ...Object.keys(extra)]) {
    const v = k in out ? out[k] : extra[k], got = src[k];
    if (got === undefined || got === null) continue;
    const ok = v === null || v === "" ? ["string", "number", "boolean", "object"].includes(typeof got)  // optional fields
      : Array.isArray(v) ? Array.isArray(got) : typeof got === typeof v && !Array.isArray(got);
    if (ok) out[k] = got;
  }
  out.xp = Math.max(0, Math.round(out.xp));
  out.log = out.log.filter(x => x && typeof x === "object").slice(0, 200)
    .map(x => ({ d: String(x.d ?? "").slice(0, 20), why: String(x.why ?? "").slice(0, 120), n: Number(x.n) || 0 }));
  // Mock exam scores per cert: keep only plain numbers and a short date, the last 20 of each.
  out.mocks = Object.fromEntries(Object.entries(out.mocks).filter(([k, v]) => /^[a-z0-9-]{1,40}$/.test(k) && Array.isArray(v))
    .map(([k, v]) => [k, v.filter(x => x && typeof x === "object").slice(-20).map(x => ({ d: String(x.d ?? "").slice(0, 10), score: Math.max(0, Number(x.score) || 0), total: Math.max(0, Number(x.total) || 0) }))]));
  // Agency shifts: when one was first completed and the best number of debrief checks passed.
  out.agency = Object.fromEntries(Object.entries(out.agency).filter(([k, v]) => /^[a-z0-9-]{1,40}$/.test(k) && v && typeof v === "object" && !Array.isArray(v))
    .map(([k, v]) => [k, { d: String(v.d ?? "").slice(0, 10), best: Math.min(20, Math.max(0, Math.round(Number(v.best) || 0))), total: Math.min(20, Math.max(0, Math.round(Number(v.total) || 0))), own: v.own === true }]));
  // Records of what's been done: an id (or a story's link) with the date or flag it happened. Anything else is dropped,
  // so a damaged file can't mark something done with a value nothing understands, or block recording it later.
  const keyOk = k => k.length > 0 && k.length <= 300, plain = v => (typeof v === "string" ? v.slice(0, 40) : typeof v === "number" && isFinite(v) ? v : v === true ? 1 : null);
  const record = o => Object.fromEntries(Object.entries(o).filter(([k, v]) => keyOk(k) && plain(v) !== null).slice(0, 5000).map(([k, v]) => [k, plain(v)]));
  const isMap = v => v && typeof v === "object" && !Array.isArray(v);
  for (const k of ["done", "flags", "labs", "paths", "terms", "read", "badges", "days"]) out[k] = record(out[k]);
  out.missions = Object.fromEntries(Object.entries(out.missions).filter(([k, v]) => keyOk(k) && isMap(v)).map(([k, v]) => [k, record(v)]));
  out.exam = Object.fromEntries(Object.entries(out.exam).filter(([k, v]) => keyOk(k) && isMap(v)).slice(0, 5000)
    .map(([k, v]) => [k, { r: Math.max(0, Math.round(Number(v.r) || 0)), w: Math.max(0, Math.round(Number(v.w) || 0)), last: v.last === 1 ? 1 : 0 }]));
  // Shapes the loop above can't check: the stack is a list of ids, lab steps are lists, best scores are numbers.
  out.stack = Array.isArray(out.stack) ? out.stack.filter(x => typeof x === "string").slice(0, 100) : null;
  out.labSteps = Object.fromEntries(Object.entries(out.labSteps).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.filter(x => ["string", "number"].includes(typeof x)).slice(0, 100)]));
  out.best = Object.fromEntries(Object.entries(out.best).filter(([k, v]) => /^[a-z0-9-]{1,40}$/.test(k) && Number.isFinite(Number(v)) && v !== "" && typeof v !== "boolean").map(([k, v]) => [k, Math.max(0, Math.round(Number(v)))]));
  return out;
}
const restoreProgress = file => cleanProgress(file && file.app === "patch-notes" ? file.progress : null);
let P = FRESH();
try { const saved = localStorage.getItem(PKEY); if (saved) P = cleanProgress(JSON.parse(saved)); } catch (e) {}
const saveP = () => { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) {} };
const count = o => Object.keys(o || {}).length;
function progressChanged() { checkProgress(); saveP(); renderXP(); if (typeof drawTrail === "function") drawTrail(); }  // ticks the route bar's dot
function rank() {
  let i = 0; while (i + 1 < RANKS.length && P.xp >= RANKS[i + 1][0]) i++;
  const next = RANKS[i + 1];
  return { name: RANKS[i][1], floor: RANKS[i][0], next: next ? next[0] : null, nextName: next ? next[1] : null };
}
function renderXP() {
  const r = rank();
  const prog = r.next ? (P.xp - r.floor) / (r.next - r.floor) : 1;
  $("xp").innerHTML = `<span class="lvl">${esc(r.name)}</span><span class="bar" aria-hidden="true"><i style="width:${Math.round(prog * 100)}%"></i></span><span class="pts">${P.xp} XP</span>`;
  $("xp").title = r.next ? `${r.next - P.xp} XP to ${r.nextName}. Click for your progress.` : "Top rank reached";
  renderStatus();
}

// Toasts queue up so a badge unlocked by the same action doesn't hide the XP message.
const toasts = [];
function toast(text) {
  toasts.push(text);
  if (toasts.length === 1) showToast();
}
function showToast() {
  if (!toasts.length) return;
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = toasts[0];
  document.body.appendChild(t);
  setTimeout(() => { t.remove(); toasts.shift(); showToast(); }, 2300);
}
function gain(n, why) { P.xp += n; P.days = P.days || {}; P.days[todayStr()] = 1; P.log.unshift({ d: todayStr(), n, why }); P.log = P.log.slice(0, 40); }
function award(n, why, { quiet = false } = {}) {
  const before = rank().name;
  gain(n, why);
  if (!quiet) toast(`+${n} XP · ${why}`);
  checkProgress();
  const after = rank().name;
  if (after !== before) toast(`Access level raised: ${after}`);
  saveP(); renderXP();
}

const BADGES = [
  { id: "first-steps", name: "First steps", desc: "Finish your first lesson", test: () => count(P.done) >= 1 },
  { id: "scholar", name: "Scholar", desc: "Finish 10 lessons", test: () => count(P.done) >= 10 },
  { id: "graduate", name: "Graduate", desc: "Finish every lesson", test: () => count(P.done) >= DATA.lessons.length },
  { id: "hands-on", name: "Hands-on", desc: "Complete a lab", test: () => count(P.labs) >= 1 },
  { id: "lab-master", name: "Lab master", desc: "Complete every lab", test: () => count(P.labs) >= DATA.labs.length },
  { id: "first-flag", name: "First flag", desc: "Capture a hidden flag", test: () => count(P.flags) >= 1 },
  { id: "ctf", name: "CTF champion", desc: "Capture all 3 flags", test: () => count(P.flags) >= 3 },
  { id: "phish-proof", name: "Phish-proof", desc: "Spot every email in Phish or Legit", test: () => (P.best.phish || 0) >= DATA.phish.length },
  { id: "quiz-ace", name: "Quiz ace", desc: "Score 10/10 in the quiz", test: () => (P.best.quiz || 0) >= 10 },
  { id: "returning", name: "Returning learner", desc: "Practise on 3 different days", test: () => count(P.days) >= 3 },
  { id: "regular", name: "Regular", desc: "Practise on 7 different days", test: () => count(P.days) >= 7 },
  { id: "first-mission", name: "Mission complete", desc: "Finish any mission mode", test: () => Object.values(P.missions || {}).some(m => count(m) > 0) },
  { id: "pathfinder", name: "Pathfinder", desc: "Complete a learning path", test: () => count(P.paths) >= 1 },
  { id: "word-nerd", name: "Word nerd", desc: "Look up 25 glossary terms", test: () => count(P.terms) >= 25 },
  { id: "informed", name: "Informed", desc: "Read 10 story explanations", test: () => count(P.read) >= 10 },
  { id: "know-your-stack", name: "Know your stack", desc: "Set up “Am I affected?”", test: () => !!(P.stack && P.stack.length) },
  { id: "nice-try", name: "Nice try", desc: "Try sudo in the terminal", test: () => !!P.egg },
];
const BADGE_XP = 20, PATH_XP = 100, LAB_XP = 30;

// One place decides what's complete: path bonuses and badges are granted here, never twice.
function pathSteps(p) {
  return p.steps.map(st => {
    if (st.type === "lesson") return { ...st, label: LESSON[st.id]?.title || st.id, href: "#lesson-" + st.id, done: !!P.done[st.id], kind: "lesson" };
    if (st.type === "lab") { const l = DATA.labs.find(x => x.id === st.id); return { ...st, label: l ? l.title : st.id, href: "#lab-" + st.id, done: !!P.labs[st.id], kind: "lab" }; }
    if (st.type === "mission") { const m = MISSION(st.id); return { ...st, label: m ? `${m.title} (${m.modes[st.mode]?.label || st.mode} mode)` : st.id, href: "#mission-" + st.id, done: !!(P.missions && P.missions[st.id] && P.missions[st.id][st.mode]), kind: "mission" }; }
    if (st.type === "agency") { const sh = SHIFT(st.id); return { ...st, label: sh ? `PATCH//AGENCY: ${sh.title}` : st.id, href: "#agency-" + st.id, done: !!(P.agency || {})[st.id], kind: "agency" }; }
    if (st.type === "game") return { ...st, label: `Score ${st.min}+ in Phish or Legit`, href: "#play", done: (P.best.phish || 0) >= st.min, kind: "game" };
    if (st.type === "flags") return { ...st, label: `Capture ${st.min} hidden flag${st.min > 1 ? "s" : ""}`, href: "#play", done: count(P.flags) >= st.min, kind: "ctf", flags: true };
    return { ...st, label: st.type, href: "#learn", done: false, kind: st.type };
  });
}
function checkProgress() {
  DATA.paths.forEach(p => {
    if (!P.paths[p.id] && pathSteps(p).every(st => st.done)) {
      P.paths[p.id] = todayStr(); gain(PATH_XP, `Path complete: ${p.title}`); toast(`Path complete: ${p.title} · +${PATH_XP} XP`);
      setTimeout(() => celebrate("Path complete!", `${p.title} · +${PATH_XP} XP`), 2400);
    }
  });
  BADGES.forEach(b => {
    if (!P.badges[b.id] && b.test()) {
      P.badges[b.id] = todayStr(); gain(BADGE_XP, `Badge: ${b.name}`); toast(`Badge unlocked: ${b.name} · +${BADGE_XP} XP`);
    }
  });
}

/* ---------- celebration: fireworks when a lab, mission, quiz round or path is finished ---------- */
function celebrate(title, sub = "") {
  document.querySelector(".celebrate")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "celebrate";
  wrap.setAttribute("role", "status");
  wrap.innerHTML = `<canvas aria-hidden="true"></canvas><div class="cele-card"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`;
  document.body.appendChild(wrap);
  const stop = () => wrap.remove();
  wrap.addEventListener("click", stop);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setTimeout(stop, 2800); return; }
  const c = wrap.querySelector("canvas"), x = c.getContext("2d"), W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr; x.scale(dpr, dpr);
  const colors = ["#3FE0E8", "#FFB000", "#3DDC97", "#FF5470", "#B794FF"];
  const rockets = Array.from({ length: 6 }, (_, i) => ({ x: W * (0.12 + 0.76 * Math.random()), y: H, vy: -(9 + Math.random() * 4), top: H * (0.12 + 0.3 * Math.random()), delay: i * 260, color: colors[i % colors.length] }));
  const sparks = [];
  const t0 = performance.now();
  (function frame(now) {
    if (!wrap.isConnected) return;
    const t = now - t0;
    x.clearRect(0, 0, W, H);
    for (const r of rockets) {
      if (r.burst || t < r.delay) continue;
      r.y += r.vy;
      x.fillStyle = r.color; x.fillRect(r.x - 1.5, r.y, 3, 12);
      if (r.y <= r.top) {
        r.burst = true;
        for (let k = 0; k < 70; k++) { const a = Math.random() * Math.PI * 2, v = 1.2 + Math.random() * 4.8; sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: r.color }); }
      }
    }
    for (const p of sparks) {
      p.vy += 0.06; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.life -= 0.011;
      if (p.life <= 0) continue;
      x.globalAlpha = p.life; x.fillStyle = p.color; x.beginPath(); x.arc(p.x, p.y, 2.2, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    t < 3400 ? requestAnimationFrame(frame) : stop();
  })(t0);
}

/* ---------- shared quiz block ---------- */
function quizBlock(q, { onAnswer, answered } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "stack";
  const draw = choice => {
    const done = choice != null;
    wrap.innerHTML = `<p class="q">${gloss(q.q, 3)}</p><div class="opts">${q.options.map((o, i) => {
      const cls = done ? (i === q.answer ? " right" : i === choice ? " wrong" : "") : "";
      return `<button class="opt${cls}" data-i="${i}" ${done ? "disabled" : ""}>${esc(o)}</button>`;
    }).join("")}</div>` + (done ? `<div class="feedback">${choice === q.answer ? '<b class="ok">Correct.</b>' : '<b class="no">Not quite.</b>'} ${gloss(q.why, 3)}</div>` : "");
  };
  draw(answered);
  wrap.addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b || b.disabled) return;
    const i = Number(b.dataset.i); draw(i); onAnswer && onAnswer(i, i === q.answer, wrap);
  });
  return wrap;
}

