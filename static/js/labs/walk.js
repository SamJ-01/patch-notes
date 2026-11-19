// Guided mode for the command-line labs: each objective carries `walk`, the real commands that complete it, each with the
// mode it needs and one line on why. nextCommand() looks at where the console actually is (its prompt) and returns what to
// type next: the step itself, or the move that gets there first (enable, configure terminal, end, or re-entering the
// interface or VLAN a step belongs to). Pure; tests/walk.test.mjs plays every objective of both VLAN labs through it.
//
// A step is [device, mode, command, why, enter?]: mode is "pc", "user", "priv", "config" or "sub" (inside an interface,
// VLAN or access list; `enter` is the command that opens it, e.g. "interface fa0/11").

export const modeOf = prompt => (/\(config-[\w-]+\)#\s*$/.test(prompt) ? "sub" : /\(config\)#\s*$/.test(prompt) ? "config" : /#\s*$/.test(prompt) ? "priv" : />\s*$/.test(prompt) && !/^[A-Z]:\\/.test(prompt) ? "user" : "pc");

// Loose match for what someone typed against a walk command: case, spacing and the common IOS short forms.
const SHORT = [[/^int(erface)?\b/, "interface"], [/^conf(igure)?( t(erminal)?)?$/, "configure terminal"], [/^en(able)?$/, "enable"], [/^sh(ow)?\b/, "show"], [/^sw(itchport)?\b/, "switchport"], [/\bmode acc(ess)?$/, "mode access"], [/\bacc(ess)? vl(an)?\b/, "access vlan"], [/\bvl(an)? br(ief)?$/, "vlan brief"], [/^encap(sulation)?\b/, "encapsulation"], [/^no shut(down)?$/, "no shutdown"]];
export function norm(cmd) {
  let s = String(cmd).trim().toLowerCase().replace(/\s+/g, " ").replace(/(\d)\s*-\s*(\d)/g, "$1 - $2");  // ranges only: "access-list" keeps its hyphen
  for (const [re, to] of SHORT) s = s.replace(re, to);
  return s;
}
export const same = (a, b) => norm(a) === norm(b);

const step = s => ({ dev: s[0], mode: s[1], cmd: s[2], why: s[3] || "", enter: s[4] || null });
export const steps = task => (task.walk || []).map(step);

// What to type next for a step, given the device's prompt and which submode it's in (the last enter command, or null).
// Returns { dev, cmd, why, own } where own = true when it's the step itself (so the walk moves on after it runs).
export function nextCommand(s, prompt, inside = null) {
  const m = modeOf(prompt), go = (cmd, why) => ({ dev: s.dev, cmd, why, own: false });
  if (s.mode === "pc" || m === "pc") return { ...s, own: true };
  if (m === "user") return s.mode === "user" ? { ...s, own: true } : go("enable", "Privileged mode first: it's where show and configure commands work.");
  if (s.mode === "user" || s.mode === "priv") return m === "priv" ? { ...s, own: true } : go("end", "Back to privileged mode, where show commands run.");
  if (m === "priv") return go("configure terminal", "Configuration mode: changes go into the running config.");
  if (s.mode === "config") return { ...s, own: true };  // global config commands also work from inside an interface or VLAN
  // s.mode === "sub": must be inside the right interface, VLAN or access list
  if (m === "sub" && inside && s.enter && same(inside, s.enter)) return { ...s, own: true };
  return { dev: s.dev, cmd: s.enter, why: "Opens the settings this command belongs to.", own: false, enters: true };
}

// Does this command open a submode (an interface, a VLAN or an access list)? Used to remember where the console is.
export const opensSub = cmd => /^(int(erface)?|vlan|ip access-list)\b/i.test(String(cmd).trim());

// A plain explanation for the common mistakes, shown under the real device's error (which only says "Invalid input" or
// "not recognized"). `before` is the prompt the command was typed at. Returns a tip or null. Pure; tested.
const IOS_WORD = /^(en|ena|enab|enabl|enable|conf|configure|sh|show|int|interface|vl|vlan|sw|switchport|no|ip|name|na|enc|encapsulation|end|exit|do|wr|copy)$/i;
export function explainError(line, before) {
  const t = String(line).trim(), w = t.split(/\s+/), first = w[0] || "", m = modeOf(before);
  const vlanSub = /\(config-vlan\)#\s*$/.test(before);
  if (!t) return null;
  if (m === "pc") return IOS_WORD.test(first) ? "This is a PC's Windows command prompt. Switch and router commands go on a switch or router: pick one above. PCs take ipconfig and ping." : null;
  if (/^en(a|ab|abl|able)?$/i.test(first) && w.length > 1) return "enable is a command on its own. Type en, press Enter, then the next command.";
  if (/^conf(igure)?$/i.test(first) && w.length > 2) return "configure terminal (conf t) is a command on its own. Press Enter after it, then the next command.";
  if (m === "user") return "You're in user mode (the > prompt), which can only look. Type en first, then conf t to change settings.";
  if (/^(sh|show)$/i.test(first) && (m === "config" || m === "sub")) return "show commands run in privileged mode. Put do in front (do show vlan brief), or type end first.";
  if (/^vl(an)?$/i.test(first) && w.length > 2) return `One thing per line: vlan ${w[1]} opens the VLAN, then name and the name, on the next line, names it.`;
  if (/^vl(an)?$/i.test(first) && m === "priv") return "VLANs are created in configuration mode: type conf t first.";
  if (vlanSub && w.length === 1 && !IOS_WORD.test(first)) return `You're inside the VLAN's settings. To name it, type name and then the name, for example name ${first[0].toUpperCase()}${first.slice(1)}.`;
  if (/^(sw|swi|swit|switchport)$/i.test(first) && (m === "priv" || m === "config")) return "switchport settings belong to a port. Open one first: conf t, then interface fa0/11 (the prompt changes to (config-if)#).";
  if (/^(enc|encap|encapsulation)$/i.test(first) && m !== "sub") return "encapsulation belongs to a subinterface. Open one first, for example interface g0/0.10.";
  return null;
}

// Typed a name that only differs in case from the one the objective needs? (It's accepted, but the check fails.)
export function caseSlip(line, task) {
  const m = String(line).trim().match(/^na(me)?\s+(\S+)$/i); if (!m) return null;
  const want = steps(task).map(s => s.cmd.match(/^name\s+(\S+)$/)?.[1]).find(n => n && n.toLowerCase() === m[2].toLowerCase());
  return want && want !== m[2] ? `Names are case-sensitive: this objective needs ${want}, not ${m[2]}. Type name ${want} to fix it.` : null;
}

// Three-step hints (19 Nov): 1 a nudge in words (the objective's `nudge`), 2 the command's shape with what you have to work
// out blanked, 3 the full command with Run it. shape() blanks the values (numbers, addresses, paths, file names, quoted
// text, interface and VLAN names) and keeps the command words and options; null when nothing would be blanked.
const KEEP = /^(dot1q|any|host|in|out|-|\|)$/i;
const split = cmd => String(cmd).match(/"[^"]*"|'[^']*'|\S+/g) || [];
export function shape(cmd) {
  const w = split(cmd); let blanks = 0;
  const out = w.map((t, i) => {
    if (i === 0 && !/[\/~]/.test(t)) return t;
    if (KEEP.test(t) || /^[-+][a-z]+$/i.test(t)) return t;
    if (/[\d\/.~"']/.test(t) || /^[A-Z]/.test(t)) { blanks++; return "____"; }
    return t;
  });
  return blanks && blanks < w.length ? out.join(" ") : null;  // all blanks would tell you nothing
}
// The level a hint opens at: the nudge first, unless it's been read for this objective already; skips a level that has
// nothing to show. more() moves one level on.
export const openLevel = ({ nudge, shaped, seen }) => (nudge && !seen ? 1 : shaped ? 2 : 3);
export const more = (level, { shaped }) => (level === 1 && shaped ? 2 : 3);
