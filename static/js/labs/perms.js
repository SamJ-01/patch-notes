// Linux permissions lab: who can read this file? People, groups and a few files on a server, with every
// person's access worked out live from the permission bits, the way the Linux kernel decides it:
//   - root passes read and write checks; it can run a file only if at least one execute bit is set
//   - otherwise exactly one class applies: owner if you own it, else group if you're in its group, else others
//     (an owner gets the owner bits even when the group or others bits allow more)
//   - opening anything also needs execute (search) on every directory in its path
// Pure functions are tested in tests/perms.test.mjs; mount() is the on-page lab.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = v => JSON.parse(JSON.stringify(v));
export const CLASSES = ["owner", "group", "others"];
const BITS = { r: 4, w: 2, x: 1 };

// mode is a number 0-0777. "rwxr-x---" and "750" both describe it.
export const octal = mode => mode.toString(8).padStart(3, "0");
export const rwx = mode => [6, 3, 0].map(s => ["r", "w", "x"].map(b => ((mode >> s) & BITS[b] ? b : "-")).join("")).join("");
const shift = { owner: 6, group: 3, others: 0 };
export const has = (mode, cls, bit) => Boolean((mode >> shift[cls]) & BITS[bit]);
export const toggle = (mode, cls, bit) => mode ^ (BITS[bit] << shift[cls]);

// Which class of a file's permissions applies to a user.
export function classOf(world, user, file) {
  if (user === file.owner) return "owner";
  return world.users[user]?.groups.includes(file.group) ? "group" : "others";
}
// The directories above a path, outermost first: "/srv/payroll/salaries.csv" -> ["/srv", "/srv/payroll"].
const parents = path => path.split("/").slice(1, -1).map((_, i, a) => "/" + a.slice(0, i + 1).join("/"));

// Can `user` do `action` to the file or directory at `path`? Returns { ok, why }.
// Actions: read, write, run (files); list, enter, create (directories: ls, cd, make or delete files inside).
export function can(world, user, action, path) {
  const f = world.files[path];
  for (const dir of parents(path)) {
    const d = world.files[dir];
    if (d && user !== "root" && !has(d.mode, classOf(world, user, d), "x")) return { ok: false, why: `no x on ${dir} (${classOf(world, user, d)} bits ${rwx(d.mode).slice(...span(classOf(world, user, d)))}), so ${user} can't get into the folder at all` };
  }
  const cls = user === "root" ? "root" : classOf(world, user, f);
  const need = { read: ["r"], write: ["w"], run: ["x"], list: ["r", "x"], enter: ["x"], create: ["w", "x"] }[action];
  if (cls === "root") {
    if (action === "run" && !/x/.test(rwx(f.mode))) return { ok: false, why: "root skips read and write checks, but can only run a file that has an x bit somewhere" };
    return { ok: true, why: "root skips permission checks" };
  }
  const bits = rwx(f.mode).slice(...span(cls)), ok = need.every(b => has(f.mode, cls, b));
  return { ok, why: `${user} is ${cls === "owner" ? "the owner" : cls === "group" ? `in group ${f.group}` : "neither owner nor in the group"}, so the ${cls} bits apply: ${bits}${ok ? "" : ` (needs ${need.join(" and ")})`}` };
}
const span = cls => ({ owner: [0, 3], group: [3, 6], others: [6, 9] }[cls]);

// ---------- the terminal: ls -l, ls -ld, chmod (octal or symbolic), chown, chgrp, id
// ls -l lines as GNU ls prints them: columns aligned across the listing (owner and group left-aligned, link
// count and size right-aligned), so a single file has no extra padding.
export function lsLines(world, list) {
  const rows = list.map(path => { const f = world.files[path]; return [`${f.dir ? "d" : "-"}${rwx(f.mode)}`, String(f.dir ? 2 : 1), f.owner, f.group, String(f.size), f.date, path.split("/").pop()]; });
  const w = i => Math.max(...rows.map(r => r[i].length));
  return rows.map(r => `${r[0]} ${r[1].padStart(w(1))} ${r[2].padEnd(w(2))} ${r[3].padEnd(w(3))} ${r[4].padStart(w(4))} ${r[5]} ${r[6]}`);
}
export const lsLine = (world, path) => lsLines(world, [path])[0];
// Lab content stores modes as octal strings ("644"); the lab works with numbers.
export function loadWorld(raw) {
  const w = clone(raw);
  for (const f of Object.values(w.files)) f.mode = parseInt(f.mode, 8);
  return w;
}
// Apply a chmod mode argument ("640", "g-w", "u=rwx,go=", "a+r") to a mode. Returns the new mode or null.
// With no who-letter ("+w" rather than "u+w"), GNU chmod acts as if "a" was given but leaves alone any bits set in
// the umask: with the usual umask of 022, "chmod +w" adds write for the owner only (and "=" still clears all).
export function applyChmod(mode, arg, umask = 0o022) {
  if (/^0?[0-7]{3}$/.test(arg)) return parseInt(arg.slice(-3), 8);
  let m = mode;
  for (const part of arg.split(",")) {
    const x = part.match(/^([ugoa]*)([+=-])([rwx]*)$/);
    if (!x) return null;
    const who = (x[1] || "a").replace("a", "ugo"), bits = [...x[3]].reduce((n, b) => n | BITS[b], 0);
    const classes = [...new Set(who)].reduce((n, c) => n | (7 << { u: 6, g: 3, o: 0 }[c]), 0);
    const set = (bits * 0o111) & (x[1] ? classes : ~umask & 0o777);  // the letters, in the classes they apply to
    if (x[2] === "+") m |= set;
    else if (x[2] === "-") m &= ~set;
    else m = (m & (x[1] ? ~classes : 0)) | set;  // "=" with no who-letter clears every bit, umask or not
  }
  return m & 0o777;
}

// Resolve a name typed in the terminal (relative to cwd) to a known path.
const resolve = (world, cwd, name) => { const p = name.startsWith("/") ? name.replace(/\/$/, "") : `${cwd}/${name}`.replace(/\/\.$/, "").replace(/\/$/, ""); return world.files[p] ? p : null; };

export function run(world, cwd, line) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { out: "" };
  const [cmd, ...args] = words;
  const err = msg => ({ out: msg, error: true });
  if (cmd === "ls") {
    const flags = args.filter(a => a.startsWith("-")).join(""), names = args.filter(a => !a.startsWith("-"));
    if (!flags.includes("l")) return { out: "[Simulator: use ls -l to see permissions, owners and groups.]" };
    const target = names[0] ? resolve(world, cwd, names[0]) : cwd;
    if (!target) return err(`ls: cannot access '${names[0]}': No such file or directory`);
    if (flags.includes("d") || !world.files[target].dir) return { out: lsLine(world, target) };
    const kids = Object.keys(world.files).filter(p => parents(p).at(-1) === target).sort();
    // "total" is the disk space used, in 1 KiB units: files take whole 4 KiB blocks.
    const total = kids.reduce((n, p) => n + Math.ceil(world.files[p].size / 4096) * 4, 0);
    return { out: [`total ${total}`, ...lsLines(world, kids)].join("\n") };
  }
  if (cmd === "id") {
    const u = args[0] || "root", info = world.users[u];
    if (!info && u !== "root") return err(`id: '${u}': no such user`);
    if (u === "root") return { out: "uid=0(root) gid=0(root) groups=0(root)" };
    return { out: `uid=${info.uid}(${u}) gid=${world.groups[info.groups[0]]}(${info.groups[0]}) groups=${info.groups.map(g => `${world.groups[g]}(${g})`).join(",")}` };
  }
  if (cmd === "chmod") {
    if (args.length !== 2) return err("chmod: missing operand\nTry 'chmod --help' for more information.");
    const path = resolve(world, cwd, args[1]);
    if (!path) return err(`chmod: cannot access '${args[1]}': No such file or directory`);
    const m = applyChmod(world.files[path].mode, args[0]);
    if (m == null) return err(`chmod: invalid mode: '${args[0]}'\nTry 'chmod --help' for more information.`);
    world.files[path].mode = m;
    return { out: "", changed: path };
  }
  if (cmd === "chown" || cmd === "chgrp") {
    if (args.length !== 2) return err(`${cmd}: missing operand\nTry '${cmd} --help' for more information.`);
    const path = resolve(world, cwd, args[1]);
    if (!path) return err(`${cmd}: cannot access '${args[1]}': No such file or directory`);
    let [owner, group] = cmd === "chgrp" ? [null, args[0]] : args[0].split(":");
    if (owner && !world.users[owner] && owner !== "root") return err(`chown: invalid user: '${args[0]}'`);
    if (group && !(group in world.groups)) return err(`${cmd}: invalid group: '${args[0]}'`);
    if (owner) world.files[path].owner = owner;
    if (group) world.files[path].group = group;
    return { out: "", changed: path };
  }
  if (cmd === "cd" || cmd === "cat" || cmd === "sudo") return { out: `[Simulator: this lab models permissions only. Try ls -l, chmod, chown or id.]` };
  return err(`${cmd}: command not found`);
}

// An objective is met when commands were run ({ ran }), a file has a mode ({ mode: [path, "460"] }) or an owner
// ({ owner: [path, "bob"] }), and/or
// every listed access works out as wanted ({ all: [[user, action, path, true|false], ...] }).
export function checkTask(world, ran, c) {
  if (c.ran && !ran.includes(c.ran)) return false;
  if (c.mode && octal(world.files[c.mode[0]].mode) !== c.mode[1]) return false;
  if (c.owner && world.files[c.owner[0]].owner !== c.owner[1]) return false;
  return (c.all || []).every(([u, a, p, want]) => can(world, u, a, p).ok === want);
}

// ---------- the on-page lab
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const world = loadWorld(lab.world), done = new Set(solved), cwd = lab.cwd;
  let finished = lab.tasks.every(t => done.has(t.id)), focus = lab.focus, out = "";
  const people = Object.keys(world.users), paths = Object.keys(world.files).filter(p => world.files[p].show);
  const groupTone = g => `pg${Object.keys(world.groups).indexOf(g) % 6}`;

  root.innerHTML = `<div class="perm-lab stack">
    <div class="view-head"><a class="link-btn" href="#missions">← Practise</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <section class="panel"><h2>The people</h2><ul class="pm-people">${people.map(u => `<li><span class="pm-av" aria-hidden="true">${esc(u[0].toUpperCase())}</span><b>${esc(u)}</b> <span class="muted">${esc(world.users[u].role)}</span><span class="pm-groups">${world.users[u].groups.map(g => `<span class="pm-g ${groupTone(g)}">${esc(g)}</span>`).join("")}</span></li>`).join("")}</ul></section>
    <div class="pm-grid">
      <section class="panel" aria-labelledby="pm-files-h"><h2 id="pm-files-h">Files on ${esc(lab.host)}</h2><div class="row pm-tabs" role="group" aria-label="Choose a file">${paths.map(p => `<button type="button" class="chip" data-file="${esc(p)}">${esc(p.split("/").pop())}${world.files[p].dir ? "/" : ""}</button>`).join("")}</div><div id="pm-file"></div></section>
      <section class="panel" aria-labelledby="pm-who-h"><h2 id="pm-who-h">Who can do what</h2><div id="pm-matrix"></div></section>
    </div>
    <div class="term-grid">
      <section class="term-shell" aria-label="Simulated terminal"><div class="term-bar"><span>root@${esc(lab.host)}:${esc(cwd)}</span><span class="tag">Simulated</span></div>
        <div class="term-out" id="pm-out" aria-live="polite" tabindex="0" aria-label="Terminal output"></div>
        <form class="term-in" id="pm-form"><label class="sr" for="pm-in">Command</label><span class="term-ps">root@${esc(lab.host)}:${esc(cwd)}#</span><input id="pm-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form></section>
      <aside class="panel term-tasks"><div class="panel-title"><h2>Objectives</h2><span class="mono" id="pm-count"></span></div><ol id="pm-tasks"></ol>
        <div class="row"><button class="link-btn" id="pm-hint" type="button">Show a hint</button></div><div id="pm-hinttext"></div>
        <details class="tbl simplification"><summary>How this differs from a real server</summary><p>${esc(lab.simplification)}</p></details>
        <div class="row"><button class="btn ghost" id="pm-reset" type="button">↺ Reset lab</button></div></aside>
    </div>
    ${lab.next ? `<section class="panel" id="pm-next" hidden><h2>Take it further</h2><ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>` : ""}
  </div>`;
  const $ = id => root.querySelector("#" + id);

  // The selected file: its permission bits as a grid of switches, its owner and group, and the ls -l line.
  function drawFile() {
    const f = world.files[focus];
    root.querySelectorAll("[data-file]").forEach(b => b.setAttribute("aria-pressed", b.dataset.file === focus));
    $("pm-file").innerHTML = `<p class="mono pm-ls" role="region" aria-label="ls -l output" tabindex="0">${esc(lsLine(world, focus))}</p>
      <div class="pm-meta"><label>Owner <select id="pm-owner">${["root", ...people].map(u => `<option${u === f.owner ? " selected" : ""}>${esc(u)}</option>`).join("")}</select></label>
        <label>Group <select id="pm-group">${Object.keys(world.groups).map(g => `<option${g === f.group ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
        <span class="pm-oct">chmod <b class="mono">${octal(f.mode)}</b></span></div>
      <div class="pm-scroll" role="region" aria-label="Permission bits" tabindex="0"><table class="pm-bits"><caption class="sr-only">Permission bits for ${esc(focus)}</caption><thead><tr><th scope="col"></th>${["r", "w", "x"].map(b => `<th scope="col">${b} <span class="muted">${{ r: f.dir ? "list" : "read", w: f.dir ? "add/delete inside" : "write", x: f.dir ? "enter" : "run" }[b]}</span></th>`).join("")}</tr></thead>
        <tbody>${CLASSES.map(c => `<tr><th scope="row">${c === "owner" ? `owner <span class="muted">(${esc(f.owner)})</span>` : c === "group" ? `group <span class="pm-g ${groupTone(f.group)}">${esc(f.group)}</span>` : "others"}</th>${["r", "w", "x"].map(b => `<td><button type="button" class="pm-bit${has(f.mode, c, b) ? " on" : ""}" data-c="${c}" data-b="${b}" aria-pressed="${has(f.mode, c, b)}" aria-label="${c} ${b}">${has(f.mode, c, b) ? b : "-"}</button></td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="muted pm-note">${esc(world.files[focus].note || "")}</p>`;
    root.querySelectorAll(".pm-bit").forEach(b => b.addEventListener("click", () => { f.mode = toggle(f.mode, b.dataset.c, b.dataset.b); changed(`chmod ${octal(f.mode)} ${focus}`); $("pm-file").querySelector(`[data-c="${b.dataset.c}"][data-b="${b.dataset.b}"]`)?.focus(); }));
    $("pm-owner").addEventListener("change", e => { f.owner = e.target.value; changed(`chown ${f.owner} ${focus}`); });
    $("pm-group").addEventListener("change", e => { f.group = e.target.value; changed(`chgrp ${f.group} ${focus}`); });
  }
  // Every person, every relevant action on the selected file, with the class that decided it.
  function drawMatrix() {
    const f = world.files[focus], actions = f.dir ? ["list", "enter", "create"] : ["read", "write", "run"];
    const label = { read: "Read", write: "Change", run: "Run", list: "List", enter: "Enter (cd)", create: "Add or delete files" };
    $("pm-matrix").innerHTML = `<div class="pm-scroll" role="region" aria-label="Who can do what" tabindex="0"><table class="pm-matrix"><caption class="sr-only">Who can do what to ${esc(focus)}</caption><thead><tr><th scope="col">Person</th><th scope="col">Uses</th>${actions.map(a => `<th scope="col">${label[a]}</th>`).join("")}</tr></thead><tbody>
      ${["root", ...people].map(u => { const cls = u === "root" ? "root" : classOf(world, u, f); return `<tr class="pm-${cls}"><th scope="row">${esc(u)}</th><td><span class="pm-cls">${cls === "root" ? "superuser" : `${cls} bits`}</span></td>${actions.map(a => { const r = can(world, u, a, focus); return `<td class="${r.ok ? "yes" : "no"}" title="${esc(r.why)}"><span aria-hidden="true">${r.ok ? "✓" : "✗"}</span><span class="sr-only">${r.ok ? "yes" : "no"}: ${esc(r.why)}</span></td>`; }).join("")}</tr>`; }).join("")}
      </tbody></table></div><p class="muted pm-why" id="pm-why">${esc(whyLine())}</p>`;
  }
  const whyLine = () => { const u = lab.spotlight, a = world.files[focus].dir ? "list" : "read", r = can(world, u, a, focus); return `${u} (${world.users[u].role}): ${r.ok ? "can" : "can't"} ${a} ${focus}. ${r.why[0].toUpperCase()}${r.why.slice(1)}.`; };
  function changed(cmd) {
    if (cmd) { out += `<div class="muted">(same as: ${esc(cmd)})</div>`; $("pm-out").innerHTML = out; $("pm-out").scrollTop = $("pm-out").scrollHeight; }
    drawFile(); drawMatrix(); drawTasks();
  }
  function drawTasks() {
    lab.tasks.forEach(t => { if (!done.has(t.id) && check(t.check)) { done.add(t.id); onPart(t.id); } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("pm-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}${done.has(t.id) ? `<span class="vl-why">${esc(t.why)}</span>` : ""}</li>`).join("");
    $("pm-count").textContent = `${done.size}/${lab.tasks.length}`;
    $("pm-hinttext").innerHTML = ""; $("pm-hint").hidden = !next;
    if (!next) { if ($("pm-next")) $("pm-next").hidden = false; if (!finished) { finished = true; onComplete(); } }
  }
  const check = c => checkTask(world, ran, c);
  const ran = [];

  root.querySelectorAll("[data-file]").forEach(b => b.addEventListener("click", () => { focus = b.dataset.file; drawFile(); drawMatrix(); }));
  $("pm-form").addEventListener("submit", e => {
    e.preventDefault();
    const line = $("pm-in").value, r = run(world, cwd, line);
    out += `<div><span class="term-ps">root@${esc(lab.host)}:${esc(cwd)}#</span> ${esc(line)}</div>${r.out ? `<div class="${r.error ? "t-err" : ""}">${esc(r.out)}</div>` : ""}`;
    $("pm-out").innerHTML = out; $("pm-out").scrollTop = $("pm-out").scrollHeight; $("pm-in").value = "";
    if (!r.error && line.trim()) ran.push(line.trim().split(/\s+/)[0] + (line.includes(" -l") ? " -l" : ""));
    if (r.changed && world.files[r.changed].show) focus = r.changed;
    changed();
  });
  $("pm-hint").addEventListener("click", () => { const t = lab.tasks.find(x => !done.has(x.id)); if (t) $("pm-hinttext").innerHTML = `<div class="feedback">${esc(t.hint)}</div>`; });
  $("pm-reset").addEventListener("click", onReset);
  out = `<div class="muted">You're root on ${esc(lab.host)} (on a real server you'd use sudo). Try ls -l, chmod, chown and id.</div>`;
  $("pm-out").innerHTML = out;
  changed();
}
