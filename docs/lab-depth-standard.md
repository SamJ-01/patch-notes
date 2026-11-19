# The lab depth standard

The owner's bar (19 Nov): "I truly want people to feel like no step was missed in the thought process." The VLAN labs set it.
Every lab is brought up to this, one at a time, and `tests/test_core.py` `LabDepth` checks the ones that are (`DEEP_LABS`).

## Every lab
1. **Why before how.** A short intro (about 30 words) that says what you'll do and why it matters, and the picture first.
2. **Every action has three layers of help**, each one step further than the last:
   - a **hint** that nudges (what to think about, not the answer);
   - a **"show me"** that points at the exact place or fills in the exact command (`walk` in console labs, `where` in
     evidence labs, Patch's "Rule one out");
   - a **why** after it's done, so the reason sticks, not just the result.
3. **A guided route.** Someone who just wants to follow along can step through every objective, with every step filled in
   and explained, and still learn the reason for each one. Doing it yourself is always allowed and always moves it on.
4. **Failsafes.** A wrong move is explained in plain words (what you did, why it didn't work, what to do instead), never
   just "wrong" or "invalid input". Two misses in a row offer the way on. A rejected action never moves progress. There is
   always a way back (reset, step back) and never a dead end.
5. **Real.** Output, errors and shortcuts match the real tool (say which), the usual abbreviations work, and anything
   simplified says so in `simplification`.
6. **Everywhere.** Works at 390 px, by keyboard and with a screen reader; the safety note says what's safe.
7. **A finish.** It ends with what you learned and where to go next.

## By kind
- **Console labs** (vlan, terminal, nettools, perms): `tasks[].walk` `[device, mode, command, why, enter?]`, `hint`, `why`,
  `nudge` (hint 1 of 3, the idea without the command), `found` (what the step showed);
  tips for the common mistakes in that shell (see `walk.js` `explainError`); tested to complete from a fresh start using only
  the walk.
- **Question labs** (doc, log, quiz): each step has a `hint`, a `where`, an `explain`, and `notes`, one per option (None at the
  answer): why that answer is tempting and why it's wrong, pointing back at the evidence, never naming the right answer (the
  explanation still comes from choosing it). A miss teaches instead of saying "Look at the evidence again".
- **Interactive labs** (the rest): reviewed one by one against the list above; each gets its own guided route.

## Where each lab stands (19 Nov)
- Done: `vlans`, `intervlan`, `linux-terminal` (19 Nov: walk with paths that work from any folder, Guided strip, `explain()`
  tips for Windows commands, capitals, case-sensitive names, a file in another folder, running a script without ./, missing x,
  unquoted phrases, sudo, rm on a folder, mkdir before touch, typos; rescue after two errors).
- Done: `net-detective`, `recon-basics` (19 Nov: walks where some steps are meant to fail, a dead DNS server and an
  out-of-scope target; `explain()` reads what a timeout or refusal tells you; nslookup, dig and host all count as a lookup).
  The strip is now shared: `static/js/labs/guide.js` (Linux and network tools labs).
- Done: `permissions` (19 Nov). Every console lab now meets the standard, with three-step hints.
- Question labs (56 labs, 294 steps): wrong-answer notes on every multiple-choice question in every lab (19 Nov; the 10 exam-route labs first, 41
  questions, then the other 46, 209 questions; `WrongAnswerNotes` requires them everywhere).
- Interactive labs (reviewed 19 Nov, one by one):
  - Already met it: vishing (per-reply feedback, risk and debrief), hashing (why/wrong per question), sqli-shop (hint and
    why per objective), wiring (red pins plus the reference table), corridor (every wrong door explained), subnetting
    (worked method on every answer), the two journey labs, the TCP handshake and Telnet vs SSH demos (narrated, nothing to
    get wrong).
  - Brought up: firewall-packet (a Hint that walks the rules above the deciding one, pure `hintFor`/`missReason`, and "Why
    the rules above didn't match" in every verdict), topologies (a wrong pick says what that layout looks like, `missNote`,
    each topology's `looks`), osi-model (`layerNote`: what the layer you picked does), ports-protocols (`pickNote`: what
    the port or protocol you picked really is), network-builder (a Hint per goal, in the builder's own words) and
    cvss-builder (a clue question per wrong metric, `CVSS_CLUES`, never the value). Tested in firewall.test and labs.test.
