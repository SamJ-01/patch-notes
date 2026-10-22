// Simulated Linux terminal: a small set of real commands over a file system defined in content/labs.json.
// createShell() is pure logic (tested in tests/labs.test.mjs); mount() is the on-page terminal.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = v => JSON.parse(JSON.stringify(v));

const MAN = {
  help: "help: list the commands this terminal supports",
  pwd: "pwd: print the folder you're in (print working directory)",
  whoami: "whoami: print the user you're logged in as",
  ls: "ls [-a] [-l] [path]: list a folder. -a shows hidden files (names starting with .), -l shows permissions, owner and size",
  cd: "cd [path]: change folder. cd .. goes up one, cd ~ (or just cd) goes home, cd - goes back",
  cat: "cat file...: print a file's contents",
  grep: "grep [-i] [-n] pattern file: print only lines containing pattern. -i ignores case, -n shows line numbers",
  find: "find [path] -name pattern: search for files by name. * matches anything, e.g. find / -name \"*.sh\"",
  mkdir: "mkdir [-p] folder: make a new folder",
  touch: "touch file: create an empty file (or update its time)",
  rm: "rm [-r] path: delete a file (-r to delete a folder and everything in it). There is no recycle bin",
  chmod: "chmod mode file: change permissions, e.g. chmod +x script.sh or chmod 755 script.sh",
  echo: "echo text: print text",
  history: "history: list the commands you've typed",
  clear: "clear: clear the screen",
  man: "man command: a one-line manual for a command",
  head: "head [-n N] [file]: print the first N lines (default 10). Often used after a pipe: grep Failed auth.log | head -n 3",
  tail: "tail [-n N] [file]: print the last N lines (default 10). Logs grow at the bottom, so tail shows the newest entries",
  wc: "wc -l [file]: count lines. grep Failed auth.log | wc -l counts the failed logins",
  sort: "sort [-r] [-n] [file]: sort lines (-r reverses, -n sorts by number)",
  uniq: "uniq [-c] [file]: collapse repeated neighbouring lines (-c counts them). Run sort first so repeats sit together",
  cut: "cut -d ' ' -f N [file]: print field N of each line, splitting on the -d character",
};

export const normalize = parts => {
  const out = [];
  for (const p of parts) { if (!p || p === ".") continue; if (p === "..") out.pop(); else out.push(p); }
  return "/" + out.join("/");
};
const parent = p => (p === "/" ? "/" : normalize(p.split("/").slice(0, -1)));
const base = p => p.split("/").filter(Boolean).pop() || "/";

// Split a command line into words, keeping "quoted strings" together.
export function tokenize(line) {
  const out = []; let cur = "", q = null, has = false;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ""; has = false; continue; }
    cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

// Split on | outside quotes: "grep x f | head" -> ["grep x f ", " head"].
export function splitPipes(line) {
  const out = [""]; let q = null;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "|") { out.push(""); continue; }
    out[out.length - 1] += ch;
  }
  return out;
}

const glob = pat => new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

function applyMode(mode, spec) {
  if (/^[0-7]{3}$/.test(spec)) {
    return [...spec].map(d => { const n = Number(d); return (n & 4 ? "r" : "-") + (n & 2 ? "w" : "-") + (n & 1 ? "x" : "-"); }).join("");
  }
  const m = spec.match(/^([ugoa]*)([+-])([rwx]+)$/);
  if (!m) return null;
  const who = m[1] && m[1] !== "a" ? m[1] : "ugo";
  const chars = mode.split("");
  for (const w of who) {
    const off = { u: 0, g: 3, o: 6 }[w];
    for (const p of m[3]) { const i = off + "rwx".indexOf(p); chars[i] = m[2] === "+" ? p : "-"; }
  }
  return chars.join("");
}

export function createShell(lab) {
  const state = { cwd: lab.home, prev: lab.home, fs: clone(lab.fs), history: [], events: [] };
  const home = lab.home, user = lab.user;

  const resolve = p => {
    if (!p || p === "~") return home;
    if (p.startsWith("~/")) p = home + p.slice(1);
    return normalize((p.startsWith("/") ? p : state.cwd + "/" + p).split("/"));
  };
  const node = p => state.fs[p];
  const children = dir => Object.keys(state.fs).filter(p => p !== dir && parent(p) === dir).sort();
  // You can write where you own the folder, in your home, or in /tmp (world-writable).
  // Like Linux: the owner gets the first three permission bits, everyone else the last three (groups aren't modelled).
  const may = (n, what) => (n.owner === user ? n.mode.slice(0, 3) : n.mode.slice(6, 9)).includes(what);
  const canWrite = dir => { const d = node(dir); return d && (d.owner === user || dir === "/tmp" || dir.startsWith(home)); };
  const short = p => (p === home ? "~" : p.startsWith(home + "/") ? "~" + p.slice(home.length) : p);
  const log = ev => state.events.push(ev);

  const sizeOf = n => (n.type === "dir" ? 4096 : (n.content || "").length);
  const longLine = (p, n) => `${n.type === "dir" ? "d" : "-"}${n.mode} 1 ${n.owner.padEnd(7)} ${n.owner.padEnd(7)} ${String(sizeOf(n)).padStart(5)} Oct 14 09:12 ${base(p)}`;

  const err = msg => ({ out: msg, error: true });

  // A pipeline runs left to right; each command's output becomes the next one's input (stdin).
  function run(line) {
    const raw = line.trim();
    if (!raw) return { out: "" };
    state.history.push(raw);
    const segs = splitPipes(raw).map(x => x.trim());
    if (segs.some(x => !x)) return err("bash: syntax error near unexpected token `|'");
    let res = null;
    for (let i = 0; i < segs.length; i++) {
      res = exec(segs[i], i ? res.out : null, i < segs.length - 1);
      if (res.error || res.clear) return res;
    }
    if (segs.length > 1) log({ cmd: "pipe", cmds: segs.map(x => tokenize(x)[0]) });
    return res;
  }

  // Text to filter: piped input if there is no file argument, otherwise the file(s).
  function input(name, files, stdin) {
    if (!files.length) return stdin === null ? err(`${name}: no input. Give a file, or pipe something in: cat file | ${name}`) : { text: stdin };
    const outs = [];
    for (const w of files) {
      const p = resolve(w), n = node(p);
      if (!n) return err(`${name}: ${w}: No such file or directory`);
      if (n.type === "dir") return err(`${name}: ${w}: Is a directory`);
      if (!may(n, "r")) return err(`${name}: ${w}: Permission denied`);
      outs.push(n.content || "");
    }
    return { text: outs.join("\n") };
  }
  const lines = t => (t === "" ? [] : t.replace(/\n$/, "").split("\n"));
  // -n 5, -n5 or -5
  function count(args, dflt) {
    const i = args.indexOf("-n");
    if (i >= 0) return { n: Number(args[i + 1]), rest: args.filter((_, j) => j !== i && j !== i + 1) };
    const short = args.find(a => /^-n?\d+$/.test(a));
    if (short) return { n: Number(short.replace(/^-n?/, "")), rest: args.filter(a => a !== short) };
    return { n: dflt, rest: args };
  }

  function exec(raw, stdin, piped = false) {
    const [cmd, ...args] = tokenize(raw);
    const flags = args.filter(a => /^-[a-zA-Z]+$/.test(a)).join("").replace(/-/g, "");
    const words = args.filter(a => !/^-[a-zA-Z]+$/.test(a));

    // Running a program by path: ./script.sh or /opt/backup/backup.sh
    if (cmd.includes("/")) {
      const p = resolve(cmd), n = node(p);
      log({ cmd: "exec", path: p, ok: false });
      if (!n) return err(`bash: ${cmd}: No such file or directory`);
      if (n.type === "dir") return err(`bash: ${cmd}: Is a directory`);
      if (!may(n, "x")) return err(`bash: ${cmd}: Permission denied`);
      state.events[state.events.length - 1].ok = true;
      const out = (n.content || "").split("\n").map(l => l.match(/^echo\s+["']?(.*?)["']?$/)).filter(Boolean).map(m => m[1]).join("\n");
      return { out };
    }

    switch (cmd) {
      case "help": return { out: "Commands: " + Object.keys(MAN).join(", ") + "\nRun a script by its path, e.g. ./backup.sh. Type man <command> for details." };
      case "man": return words[0] && MAN[words[0]] ? { out: MAN[words[0]] } : err(`No manual entry for ${words[0] || "(nothing)"}`);
      case "pwd": log({ cmd }); return { out: state.cwd };
      case "whoami": log({ cmd }); return { out: user };
      case "echo": return { out: words.join(" ") };
      case "history": return { out: state.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n") };
      case "clear": return { out: "", clear: true };
      case "sudo": return err(`${user} is not in the sudoers file. This incident will be reported.`);
      case "exit": return { out: "logout (not really: this terminal stays open)" };
      case "cd": {
        const target = words[0] === "-" ? state.prev : resolve(words[0]);
        const n = node(target);
        if (!n) return err(`bash: cd: ${words[0]}: No such file or directory`);
        if (n.type !== "dir") return err(`bash: cd: ${words[0]}: Not a directory`);
        state.prev = state.cwd; state.cwd = target; log({ cmd, path: target });
        return { out: words[0] === "-" ? target : "" };
      }
      case "ls": {
        const target = resolve(words[0] || ".");
        const n = node(target);
        if (!n) return err(`ls: cannot access '${words[0]}': No such file or directory`);
        log({ cmd, path: target, flags });
        if (n.type === "file") return { out: flags.includes("l") ? longLine(target, n) : base(target) };
        let names = children(target);
        if (!flags.includes("a")) names = names.filter(p => !base(p).startsWith("."));
        if (flags.includes("l")) return { out: [`total ${names.length * 4}`, ...(flags.includes("a") ? [longLine(".", n).replace(/ \.$/, " ."), longLine("..", node(parent(target))).replace(/ \.\.$/, " ..")] : []), ...names.map(p => longLine(p, node(p)))].join("\n"), dirs: names.filter(p => node(p).type === "dir").map(base) };
        const listed = (flags.includes("a") ? [".", ".."] : []).concat(names.map(base));
        return { out: listed.join(piped ? "\n" : "  "), dirs: [".", "..", ...names.filter(p => node(p).type === "dir").map(base)] };
      }
      case "cat": {
        if (!words.length) return err("cat: missing file name");
        const outs = [];
        for (const w of words) {
          const p = resolve(w), n = node(p);
          if (!n) return err(`cat: ${w}: No such file or directory`);
          if (n.type === "dir") return err(`cat: ${w}: Is a directory`);
          if (!may(n, "r")) return err(`cat: ${w}: Permission denied`);
          log({ cmd, path: p }); outs.push(n.content || "");
        }
        return { out: outs.join("\n") };
      }
      case "grep": {
        if (words.length < (stdin === null ? 2 : 1)) return err("Usage: grep [-i] [-n] pattern file");
        const [pattern, file] = words;
        let text, p = null;
        if (file) {
          p = resolve(file); const n = node(p);
          if (!n) return err(`grep: ${file}: No such file or directory`);
          if (n.type === "dir") return err(`grep: ${file}: Is a directory`);
          text = n.content || "";
        } else text = stdin;
        const ci = flags.includes("i");
        const hits = text.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => (ci ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern)));
        log({ cmd, path: p, pattern, ci, matched: hits.length });
        return { out: hits.map(([i, l]) => (flags.includes("n") ? `${i}:` : "") + l).join("\n"), highlight: pattern, ci };
      }
      case "find": {
        const iName = args.indexOf("-name");
        const start = resolve(args[0] && args[0] !== "-name" ? args[0] : ".");
        if (!node(start)) return err(`find: '${args[0]}': No such file or directory`);
        const re = iName >= 0 && args[iName + 1] ? glob(args[iName + 1]) : null;
        const found = Object.keys(state.fs).filter(p => (p === start || p.startsWith(start === "/" ? "/" : start + "/")) && (!re || re.test(base(p)))).sort();
        log({ cmd, start, found });
        return { out: found.join("\n") };
      }
      case "mkdir": {
        if (!words.length) return err("mkdir: missing operand");
        for (const w of words) {
          const p = resolve(w);
          if (node(p)) { if (flags.includes("p")) continue; return err(`mkdir: cannot create directory '${w}': File exists`); }
          if (!node(parent(p))) return err(`mkdir: cannot create directory '${w}': No such file or directory`);
          if (!canWrite(parent(p))) return err(`mkdir: cannot create directory '${w}': Permission denied`);
          state.fs[p] = { type: "dir", owner: user, mode: "rwxr-xr-x" }; log({ cmd, path: p });
        }
        return { out: "" };
      }
      case "touch": {
        if (!words.length) return err("touch: missing file operand");
        for (const w of words) {
          const p = resolve(w);
          if (node(p)) continue;
          if (!node(parent(p))) return err(`touch: cannot touch '${w}': No such file or directory`);
          if (!canWrite(parent(p))) return err(`touch: cannot touch '${w}': Permission denied`);
          state.fs[p] = { type: "file", owner: user, mode: "rw-r--r--", content: "" }; log({ cmd, path: p });
        }
        return { out: "" };
      }
      case "rm": {
        if (!words.length) return err("rm: missing operand");
        for (const w of words) {
          const p = resolve(w), n = node(p);
          if (!n) return err(`rm: cannot remove '${w}': No such file or directory`);
          if (n.type === "dir" && !flags.includes("r")) return err(`rm: cannot remove '${w}': Is a directory`);
          if (!canWrite(parent(p)) || p === home || p === "/") return err(`rm: cannot remove '${w}': Permission denied`);
          Object.keys(state.fs).filter(q => q === p || q.startsWith(p + "/")).forEach(q => delete state.fs[q]);
          log({ cmd, path: p });
        }
        return { out: "" };
      }
      case "chmod": {
        if (words.length < 2) return err("Usage: chmod mode file (e.g. chmod +x script.sh)");
        const [spec, file] = words;
        const p = resolve(file), n = node(p);
        if (!n) return err(`chmod: cannot access '${file}': No such file or directory`);
        if (n.owner !== user) return err(`chmod: changing permissions of '${file}': Operation not permitted`);
        const mode = applyMode(n.mode, spec);
        if (!mode) return err(`chmod: invalid mode: '${spec}'`);
        n.mode = mode; log({ cmd, path: p, mode });
        return { out: "" };
      }
      case "head": case "tail": {
        const { n, rest } = count(args, 10);
        if (!Number.isInteger(n) || n < 0) return err(`${cmd}: invalid number of lines`);
        const inp = input(cmd, rest, stdin); if (inp.error) return inp;
        const ls = lines(inp.text); log({ cmd, n });
        return { out: (cmd === "head" ? ls.slice(0, n) : ls.slice(Math.max(0, ls.length - n))).join("\n") };
      }
      case "wc": {
        const inp = input(cmd, words, stdin); if (inp.error) return inp;
        const ls = lines(inp.text); log({ cmd });
        const w = inp.text.split(/\s+/).filter(Boolean).length, c = inp.text.length;
        return { out: flags.includes("l") ? String(ls.length) : `${ls.length} ${w} ${c}` };
      }
      case "sort": {
        const inp = input(cmd, words, stdin); if (inp.error) return inp;
        let ls = lines(inp.text).slice();
        ls.sort(flags.includes("n") ? (a, b) => parseFloat(a) - parseFloat(b) : (a, b) => (a < b ? -1 : a > b ? 1 : 0));
        if (flags.includes("r")) ls.reverse();
        log({ cmd }); return { out: ls.join("\n") };
      }
      case "uniq": {
        const inp = input(cmd, words, stdin); if (inp.error) return inp;
        const groups = [];
        for (const l of lines(inp.text)) { const g = groups[groups.length - 1]; if (g && g[0] === l) g[1]++; else groups.push([l, 1]); }
        log({ cmd }); return { out: groups.map(([l, k]) => (flags.includes("c") ? `${String(k).padStart(7)} ` : "") + l).join("\n") };
      }
      case "cut": {
        const di = args.indexOf("-d"), fi = args.indexOf("-f");
        if (fi < 0 || !/^\d+$/.test(args[fi + 1] || "")) return err("Usage: cut -d ' ' -f N file (e.g. cut -d ' ' -f 11)");
        const delim = di >= 0 ? (args[di + 1] ?? "\t") : "\t", f = Number(args[fi + 1]);
        const files = args.filter((_, j) => ![di, di + 1, fi, fi + 1].includes(j));
        const inp = input(cmd, files, stdin); if (inp.error) return inp;
        log({ cmd }); return { out: lines(inp.text).map(l => l.split(delim)[f - 1] ?? "").join("\n") };
      }
      default: return err(`${cmd}: command not found. Type help to see the commands this terminal supports.`);
    }
  }

  // Each task's check is data in labs.json; this decides whether it's been met.
  function isDone(check) {
    const ev = state.events;
    if (check.ran) return check.ran.every(c => ev.some(e => e.cmd === c));
    if (check.ls) return ev.some(e => e.cmd === "ls" && e.path === check.ls.dir && e.flags.includes(check.ls.flag));
    if (check.read) return ev.some(e => e.cmd === "cat" && e.path === check.read);
    if (check.cwd) return state.cwd === check.cwd;
    if (check.grep) return ev.some(e => e.cmd === "grep" && e.path === check.grep.file && e.matched > 0 && (e.ci ? check.grep.match.toLowerCase().includes(e.pattern.toLowerCase()) || e.pattern.toLowerCase().includes(check.grep.match.toLowerCase()) : e.pattern.includes(check.grep.match)));
    if (check.piped) return ev.some(e => e.cmd === "pipe" && check.piped.every((c, i) => e.cmds[i] === c));
    if (check.found) return ev.some(e => e.cmd === "find" && e.found.includes(check.found));
    if (check.tried) return ev.some(e => e.cmd === "exec" && e.path === check.tried);
    if (check.executed) return ev.some(e => e.cmd === "exec" && e.path === check.executed && e.ok);
    if (check.exists) return !!state.fs[check.exists];
    if (check.missing) return !state.fs[check.missing] && (!check.keep || !!state.fs[check.keep]);
    return false;
  }

  function complete(prefix) {
    const words = tokenize(prefix), last = prefix.endsWith(" ") ? "" : words.pop() || "";
    const dirPart = last.includes("/") ? last.slice(0, last.lastIndexOf("/") + 1) : "";
    const dir = resolve(dirPart || ".");
    const opts = node(dir) ? children(dir).map(base).filter(n => n.startsWith(last.slice(dirPart.length))) : [];
    if (opts.length !== 1) return { line: prefix, options: opts };
    const full = dirPart + opts[0] + (node(normalize((dir + "/" + opts[0]).split("/"))).type === "dir" ? "/" : "");
    return { line: prefix.slice(0, prefix.length - last.length) + full, options: [] };
  }

  return { state, run, isDone, complete, prompt: () => `${user}@${lab.host}:${short(state.cwd)}$` };
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const sh = createShell(lab);
  const done = new Set(solved);
  let histI = null;
  let finished = lab.tasks.every(t => done.has(t.id));  // celebrate only when the last objective is met, not on every visit

  root.innerHTML = `<div class="term-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="term-grid">
      <section class="term-shell" aria-label="Simulated terminal">
        <div class="term-bar"><span>${esc(lab.user)}@${esc(lab.host)}</span><span class="tag">Simulated</span></div>
        <div class="term-out" id="t-out" aria-live="polite"></div>
        <form class="term-in" id="t-form"><label class="sr" for="t-in">Command</label><span class="term-ps" id="t-ps"></span><input id="t-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
      </section>
      <aside class="panel term-tasks"><div class="panel-title"><h2>Objectives</h2><span class="mono" id="t-count"></span></div><ol id="t-tasks"></ol>
        <div class="row"><button class="link-btn" id="t-hint">Show a hint</button></div><div id="t-hinttext"></div>
        <div class="row"><button class="btn ghost" id="t-reset">↺ Reset lab</button></div></aside>
    </div>
    <section class="panel" id="t-next" hidden><h2>Ready for a real terminal?</h2><p class="muted">This one only knows a handful of commands. Practise on the real thing:</p>
      <ul>${lab.next.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label)} ↗</a></li>`).join("")}</ul></section>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const out = $("t-out"), input = $("t-in");

  function print(html) { out.insertAdjacentHTML("beforeend", html); out.scrollTop = out.scrollHeight; }
  function format(res) {
    if (res.error) return `<div class="t-err">${esc(res.out)}</div>`;
    if (!res.out) return "";
    let html = esc(res.out);
    if (res.highlight) html = html.replace(new RegExp(esc(res.highlight).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), res.ci ? "gi" : "g"), m => `<mark>${m}</mark>`);
    if (res.dirs) for (const d of res.dirs) html = html.replace(new RegExp(`(^|\\s)${d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "gm"), `$1<span class="t-dir">${esc(d)}</span>`);
    return `<div>${html}</div>`;
  }
  function renderTasks() {
    lab.tasks.forEach(t => { if (!done.has(t.id) && sh.isDone(t.check)) { done.add(t.id); onPart(t.id); } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("t-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}</li>`).join("");
    $("t-count").textContent = `${done.size}/${lab.tasks.length}`;
    $("t-hinttext").innerHTML = "";
    $("t-hint").hidden = !next;
    if (!next) { $("t-next").hidden = false; if (!finished) { finished = true; onComplete(); } }
  }
  const ps = () => { $("t-ps").textContent = sh.prompt(); };

  $("t-form").addEventListener("submit", e => {
    e.preventDefault();
    const line = input.value;
    print(`<div><span class="term-ps">${esc(sh.prompt())}</span> ${esc(line)}</div>`);
    const res = sh.run(line);
    if (res.clear) out.innerHTML = ""; else print(format(res));
    input.value = ""; histI = null;
    ps(); renderTasks();
  });
  input.addEventListener("keydown", e => {
    const h = sh.state.history;
    if (e.key === "ArrowUp" && h.length) { e.preventDefault(); histI = histI == null ? h.length - 1 : Math.max(0, histI - 1); input.value = h[histI]; }
    else if (e.key === "ArrowDown" && histI != null) { e.preventDefault(); histI = Math.min(h.length, histI + 1); input.value = h[histI] || ""; if (histI >= h.length) histI = null; }
    else if (e.key === "Tab") {
      e.preventDefault();
      const r = sh.complete(input.value);
      input.value = r.line;
      if (r.options.length > 1) print(`<div><span class="term-ps">${esc(sh.prompt())}</span> ${esc(input.value)}</div><div>${r.options.map(esc).join("  ")}</div>`);
    }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
  });
  out.addEventListener("click", () => input.focus());
  $("t-hint").addEventListener("click", () => { const t = lab.tasks.find(x => !done.has(x.id)); if (t) $("t-hinttext").innerHTML = `<div class="feedback">Try: <code>${esc(t.hint)}</code></div>`; });
  $("t-reset").addEventListener("click", onReset);

  print(`<div class="muted">Welcome to ${esc(lab.host)}. Type <b>help</b> to list commands. ↑/↓ for history, Tab to complete names.</div>`);
  ps(); renderTasks();
}
