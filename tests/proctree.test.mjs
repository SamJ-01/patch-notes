import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, exeOf } from "../static/js/proctree.js";

const lab = JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url))).labs?.find?.(l => l.id === "malware-tree")
  ?? JSON.parse(readFileSync(new URL("../content/labs.json", import.meta.url))).find?.(l => l.id === "malware-tree");

test("exeOf takes the program name from a command line", () => {
  assert.equal(exeOf("explorer.exe"), "explorer.exe");
  assert.equal(exeOf('wscript.exe "C:\\x\\a.pdf.js"'), "wscript.exe");
  assert.equal(exeOf("C:\\Users\\k\\AppData\\Roaming\\WinSvc\\winsvc.exe"), "winsvc.exe");
  assert.equal(exeOf('"C:\\Program Files\\A B\\b.exe" -x'), "b.exe");
});
test("the malware-tree export parses into the tree it describes", () => {
  assert.ok(lab?.artifact?.tree, "malware-tree has artifact.tree");
  const { roots, notes } = parse(lab.artifact.text);
  assert.equal(roots.length, 1); assert.equal(roots[0].exe, "explorer.exe");
  const ws = roots[0].children[0], ps = ws.children[0], win = ps.children[0];
  assert.equal(ws.exe, "wscript.exe"); assert.equal(ps.exe, "powershell.exe"); assert.equal(win.exe, "winsvc.exe");
  assert.deepEqual(ps.events.map(e => e.type), ["net", "file"]);
  assert.deepEqual(win.events.map(e => e.type), ["read", "read", "net", "net"]);
  assert.equal(win.children[0].exe, "schtasks.exe");
  assert.equal(notes.length, 1); assert.match(notes[0].text, /Invoice_Nov_2026\.zip/);
});
test("every timed line in the export is drawn somewhere", () => {
  const timed = lab.artifact.text.split("\n").filter(l => /^\d\d:\d\d:\d\d /.test(l)).length;
  const { roots, notes } = parse(lab.artifact.text);
  const count = n => 1 + n.events.length + n.children.reduce((a, c) => a + count(c), 0);
  assert.equal(roots.reduce((a, r) => a + count(r), 0) + notes.length, timed);
});
