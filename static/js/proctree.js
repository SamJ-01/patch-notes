// An EDR process tree drawn as a tree: each process a node under the one that started it, with what it did (files
// written or read, network connections) listed on it. Parsed from the same simplified export the lab shows as text
// (indented lines are children), so the picture can never disagree with the evidence. parse() is pure and tested in
// tests/proctree.test.mjs; mount() draws it. It marks nothing as bad: reading the tree is the learner's job.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LINE = /^(\d\d:\d\d:\d\d)( +)(PROCESS|FILE READ|FILE|NETWORK)\s+(.*)$/;
// The program's own name from a command line: the first word, or a quoted path, cut to its file name.
export function exeOf(cmd) {
  const s = String(cmd).trim(), first = s.startsWith('"') ? s.slice(1, s.indexOf('"', 1)) : s.split(/\s+/)[0];
  return first.split(/[\\/]/).pop();
}

// text -> { roots: [node], notes: [event] }, node = { time, exe, cmd, events: [{ time, type, text }], children: [node] }.
// A line's depth is its indent after the time (two spaces per level). Events belong to the process one level up;
// a top-level event that names a process ("winsvc.exe -> ...") joins that process, any other is a note.
export function parse(text) {
  const roots = [], notes = [], stack = [], all = [];
  for (const raw of String(text).split("\n")) {
    const m = raw.match(LINE); if (!m) continue;
    const [, time, pad, type, rest] = m, depth = Math.max(0, (pad.length - 2) / 2);
    if (type === "PROCESS") {
      const node = { time, exe: exeOf(rest), cmd: rest, events: [], children: [] };
      stack.length = depth; (depth && stack[depth - 1] ? stack[depth - 1].children : roots).push(node); stack[depth] = node; all.push(node);
      continue;
    }
    const ev = { time, type: type === "FILE READ" ? "read" : type === "FILE" ? "file" : "net", text: rest };
    const owner = depth ? stack[depth - 1] : null;
    if (owner) { owner.events.push(ev); continue; }
    const named = [...all].reverse().find(n => rest.toLowerCase().startsWith(n.exe.toLowerCase() + " "));
    (named ? named.events : notes).push(ev);
  }
  return { roots, notes };
}

const ICON = { net: ["Network", "↗"], file: ["Wrote", "✎"], read: ["Read", "◉"] };
const evHtml = e => `<li class="pt-ev ${e.type}"><span class="pt-ico" aria-hidden="true">${ICON[e.type][1]}</span><span class="sr-only">${ICON[e.type][0]}: </span><span class="pt-t">${esc(e.time)}</span> <span class="pt-txt">${esc(e.text)}</span></li>`;
function nodeHtml(n) {
  const args = n.cmd.slice(n.cmd.indexOf(n.exe) + n.exe.length).trim().replace(/^"\s*/, "");
  return `<li><div class="pt-node"><div class="pt-head"><span class="pt-t">${esc(n.time)}</span> <b class="pt-exe">${esc(n.exe)}</b></div>
    ${args || n.cmd !== n.exe ? `<code class="pt-cmd">${esc(n.cmd)}</code>` : ""}
    ${n.events.length ? `<ul class="pt-evs">${n.events.map(evHtml).join("")}</ul>` : ""}</div>
    ${n.children.length ? `<ul class="pt-kids">${n.children.map(nodeHtml).join("")}</ul>` : ""}</li>`;
}

export function mount(el, text) {
  const { roots, notes } = parse(text);
  el.innerHTML = `<div class="pt" role="group" aria-label="Process tree: each process sits under the one that started it">
    ${notes.length ? `<ul class="pt-evs pt-notes">${notes.map(evHtml).join("")}</ul>` : ""}
    <ul class="pt-root">${roots.map(nodeHtml).join("")}</ul>
    <p class="muted pt-key"><span aria-hidden="true">↗</span> network &nbsp; <span aria-hidden="true">✎</span> file written &nbsp; <span aria-hidden="true">◉</span> file read</p></div>`;
  return { roots, notes };
}
