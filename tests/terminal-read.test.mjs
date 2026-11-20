// "Read the prompt" and "Read a command" in the Linux terminal lab (labs/terminal.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPrompt, readCommand } from "../static/js/labs/terminal.js";

const label = parts => Object.fromEntries(parts.filter(p => p[1]).map(p => [p[0], p[1]]));

test("the prompt splits into who, which machine, where and the ready sign, and follows the folder", () => {
  const home = readPrompt("analyst", "web-01", "/home/analyst", "/home/analyst");
  assert.equal(home.map(p => p[0]).join(""), "analyst@web-01:~$");
  assert.equal(label(home)["~"], "where you are");
  assert.equal(readPrompt("analyst", "web-01", "/home/analyst/reports", "/home/analyst").map(p => p[0]).join(""), "analyst@web-01:~/reports$");
  assert.equal(label(readPrompt("analyst", "web-01", "/var/log", "/home/analyst"))["/var/log"], "where you are");
  assert.match(label(readPrompt("root", "web-01", "/root", "/home/analyst"))["#"], /root/);
});

test("a command splits into the command, options, what it works on and pipes", () => {
  const p = label(readCommand('grep -c "Failed password" /var/log/auth.log | wc -l'));
  assert.equal(p.grep, "command: find lines containing");
  assert.equal(p["-c"], "option: count matching lines");
  assert.equal(p['"Failed password"'], "what to look for (quoted)");
  assert.equal(p["/var/log/auth.log"], "which file or folder");
  assert.match(p["|"], /pipe/);
  assert.equal(p.wc, "command: count lines, words or bytes");  // after a pipe, the next word is a command again
  assert.equal(label(readCommand("ls -l"))["-l"], "option: long format, one per line");
  assert.equal(label(readCommand("cat auth.log | wc -l"))["-l"], "option: count lines");  // the same letter, another command
  const g = label(readCommand("grep -c Failed auth.log"));
  assert.equal(g.Failed, "what to look for"); assert.equal(g["auth.log"], "which file or folder");
  assert.deepEqual(readCommand("  "), []);
  assert.equal(readCommand("frobnicate --now")[0][1], "command");
});
