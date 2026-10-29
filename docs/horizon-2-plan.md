# Patch Notes: Horizon 2 plan (handoff for Claude)

A short, living plan so a future session can pick up without re-auditing. `CLAUDE.md`
stays the source of truth for what exists; this is what's next and why. Two detailed
specs sit beside it: `docs/vlan-terminal-plan.md` and `docs/agency-workplace-learning-plan.md`
(both GPT-authored handoffs, their claims verified against the repo on 2026-10-28).

## Repo and publish flow
- Work happens in the private `patch-notes-dev` repo. Publishing to the public
  `patch-notes` repo is what rebuilds patchnoteslab.com (dev's own deploy is disabled,
  `if: false` in `.github/workflows/daily.yml`).
- Keep code changes on a preview/feature branch and verify before any publish. Plan docs
  (like this one) can land on `main`. No production publish without owner approval.

## Gates (run before any commit that touches code)
- `python3 -m unittest discover -s tests -q`
- `node --test tests/*.test.mjs`
- `python3 build.py --offline` (in a fresh clone first make data stubs:
  `mkdir -p data && echo '{"rows":[],"watchlist":[],"days":30}' > data/cves.json && echo '[]' > data/news.json`)
- `node tests/smoke.mjs`
- `node tests/browser_check.mjs "#route" ...` (axe, dark + light, 390 px) for any UI change
- Add any new Node test file to `.github/workflows/daily.yml`.

## A. Polish items (from class-trial feedback)

1. **DONE** — shift-01 "only tbrooks's key got in" hint reworded so the reasoning is
   explicit: the only `Accepted` logins are tbrooks, a Pellow & Finch admin, using a key
   from the office (198.51.100.23); every attempt from the alert's address failed, so
   nothing got in; a true positive but low severity. Evidence line clarified to match.
   (`content/agency/shift-01.json`.)
2. **DONE** — "password spray" is now underlined and defined everywhere a learner reads it:
   aliases `password spray` and `spray` added to the `password-spraying` glossary entry
   (`content/glossary.json`), and shift-01 alert a5's detection now names the "password
   spray pattern" so the term glosses on the alert panel itself (kept the test-pinned
   "13 accounts tried ... 12 failed"). Alert titles stay un-glossed by convention; the
   term is defined in the detection/hint/why right below them.
3. **DONE (card)** — identity/MFA lesson card image (`static/img/cards/identity.webp`)
   replaced with an owner-supplied dark cinematic image (phone biometric + checkmark,
   laptop shield/password, hardware security key), downscaled to 494x247 WebP. Legible at
   card size and on-theme. **Still TODO:** audit all card photos and older pre-upgrade
   images for other off-theme/low-quality ones; list candidates and confirm with the
   owner before redoing (owner said "certain images"; MFA was the named example).

## B. Confirmed, no action needed
- Publishing does **not** reset learner progress. Progress lives in `localStorage`
  (`patch-notes-progress`) and reloads when the site opens; only a different
  domain/browser, cleared storage or private browsing loses it. The recent commit added a
  restore warning on the You page and a `progress persistence` smoke journey. (Owner
  question answered.)

## C. Workstream 1 — simulated terminal realism (VLAN labs)
Spec: `docs/vlan-terminal-plan.md`. Verified: all referenced emulator files exist
(`vlan.js`, `terminal.js`, `perms.js`, `nettools.js`, `net/view.js`, `net/model.js`);
IOS prefix + Tab completion already covered in `tests/vlan.test.mjs`; `net/view.js`
already colours by broadcast-domain segment. Do in this order:
1. Make VLAN membership colour more visible (tinted plate / stripe / badge + legend),
   colour following the real model (not VLAN-ID numbers), accessible and reduced-motion
   aware.
2. Post-success command reuse: a "Fill command" action that inserts a proven line and
   never auto-runs; per-device recipes; cannot complete an objective by itself; if
   persisted, bounded/validated with clean-up tests.
3. Per-terminal abbreviation audit across all four shells; don't apply IOS rules to
   Windows/Linux; keep the tested Cisco behaviour; parser tests per family; fix the
   `ping` at `S1(config-vlan)#` guidance (teach `end`, then the PC console).
Verify with `node --test tests/vlan.test.mjs tests/intervlan.test.mjs tests/netmodel.test.mjs`
plus the full gates.

## D. Workstream 2 — "See it at work" learning links in shifts (and site-wide)
Spec: `docs/agency-workplace-learning-plan.md`. Verified: shifts carry broad top-level
`lessons` metadata but no per-alert teaching link; `web-access` (IDOR) has no flow
diagram; `identity` has an MFA flow but no VPN visual. Principle: an optional, specific
"See it at work" per alert where a visual genuinely helps; never navigate away or lose
shift state. Order:
1. Per-alert teaching map in shift data, separate from the exam/topic `lessons` metadata.
2. A reusable, accessible in-shift "See it at work" disclosure in
   `static/js/agency/ui.js` (no route change, no clock advance, no lost findings).
3. First explainer: shift-01 impossible travel + a VPN on/off egress visual (the owner's
   named example; `identity` lacks a VPN visual).
4. Next: shift-02 repeated-MFA + malicious inbox rule; shift-04 IDOR + cloud permissions;
   shift-03 combined attack-chain timeline. Reuse existing lesson diagrams and labs first.
5. Contextual links for the remaining alerts; keep a site-wide concept -> taught ->
   practised coverage map current; never render a generic pile of links.

Reserved art (owner-supplied, dark cinematic, 1774x887, in `docs/reserved-images/`,
not shipped to the live site): `inbox-to-alerts.webp` (an inbox feeding a severity
alert table, one row flagged/hidden) is the intended concept image for the shift-02
malicious inbox-rule explainer; `evidence-pipeline.webp` (documents processed into
scored output rows) suits a SOC evidence/triage-pipeline visual. Existing card photos
(`soc`, `phish-triage`, `log-detective`, `incident-response`) were already strong, so
these were reserved rather than used to displace them. If the in-shift explainer is
built as interactive SVG (preferred, per this plan), use these as its hero/card image.

## E. Interactive "See it at work" explainers — opportunity map
The VPN explainer (A toggle that changes a system's state) proved the pattern. All 29 lessons
already carry a visual, but 21 are static `concept` diagrams (triad/cycle/cards) and only 8 are
step-through `diagram` flows. The gap is **mechanism concepts shown only statically, or only as logs
in a shift**, where an interactive toggle/step-through would teach the "why". Build these, not a
visual for every lesson. Each should be a reusable explainer in `static/js/explainers.js` (kind), linked
from both its lesson and the matching shift alert's "See it at work".

Priority (reuse the VPN pattern: a toggle or 2-3 step state change, SVG/CSS, reduced-motion, fictional data):

P1
- **Impossible travel / VPN egress** — DONE (shift-01 a2).
- **IDOR (broken access control)** — `web-access` lesson is `concept`; shift-04 IDOR alert; `idor-log` lab.
  Visual: switch between customer A and B, see `/orders/1001` vs `/orders/1002` returned, then the
  server-side ownership check denying B. Toggle "ownership check on/off".
- **Cloud key / bucket permissions** — `cloud` lesson is `concept`; shift-04 cloud alert; `open-bucket` lab.
  Visual: a key's scope + bucket policy; toggle over-broad/public -> least privilege and watch the
  download attempt flip from allowed to denied.
- **Malicious inbox rule (before/after)** — shift-02 a1; could also sit on `phishing`. Toggle the hidden
  rule off to reveal the supplier/payment mail it was quietly moving to RSS Feeds. (Reserved art:
  `docs/reserved-images/inbox-to-alerts.webp`.)

P2
- **DDoS** — `ddos` lesson is `concept`. A request-rate slider: normal load serves, a flood saturates the
  server; contrast a flash crowd with an attack (ties to the `ddos-or-busy` lab).
- **Certificate validation / chain of trust** — `certificates` lesson is `concept`; `cert-check` lab.
  Toggle valid vs expired / wrong host / self-signed and watch the browser trust decision flip.
- **Password spray vs brute force vs credential stuffing** — a one-password-many-accounts timeline vs
  many-guesses-one-account; links shift-01's spray alert and the `signin-spray` lab to `identity`/`soc`.
- **MFA fatigue** — extend the `identity` flow: repeated denied push prompts then one accidental approval;
  link shift-02 a2.

P3
- **Zero trust** — `network-modern` is `concept`: perimeter trust vs per-request verification (BeyondCorp).
- **VLAN segmentation** — the live colour-matching in Workstream 1 is this concept's "see it".
- **Attack-chain timeline** — shift-03: workstation -> stolen identity -> RDP to file server -> rclone
  exfil -> backup sabotage, as one optional stepped visual across the related alerts.

Each new explainer: a `kind` in `static/js/explainers.js`, a pure-core test in
`tests/explainers.test.mjs`, a `seeItAtWork` entry on the shift alert and/or a lesson hook, and a browser
check. Keep it optional and specific; never a generic pile of links.

## Done log
- 2026-10-28: A.1, A.2, A.3 done; the `See it at work` explainer surface built and the
  first explainer (VPN, shift-01) shipped. CI on both repos fixed (runner pinned to
  `ubuntu-24.04` after GitHub moved `ubuntu-latest` to 26.04, which Playwright 1.56.1
  can't install a browser on).
- 2026-10-29: Section D / E explainers done — IDOR, cloud, inbox-rule (P1) and spray,
  MFA-fatigue, DDoS, certificate validation (P2), 8 in total, each in
  `static/js/explainers.js` with a pure-core test, wired to its shift alert and/or
  lesson (new lesson `explainer` hook in 06-learn.js).
- 2026-10-29: VLAN terminal workstream (Section C / `docs/vlan-terminal-plan.md`) done.
  Part 1: PCs colour-match their VLAN (stripe + body tint + outline), segmentation
  seen live. Part 2: "Reuse a command" picker fills a sibling switch's proven config
  lines without auto-running (recorded per device as `recipe`). Part 3: IOS
  abbreviation + Tab support already existed and is retained; the Linux/Windows shells
  (`terminal.js`, `perms.js`, `nettools.js`) were audited and correctly do NOT do
  IOS-style prefix matching, so left unchanged; added a helpful hint when `ping` is
  typed at a switch prompt (points to the PC consoles; still doesn't fake a ping).
  Full suite green: Python 55, Node 244, smoke 18 + journeys, axe clean.
- 2026-10-29: shift-03 attack-chain timeline explainer (the `chain` kind). Every shift
  now has a "See it at work" explainer on at least one alert.
- 2026-10-29: zero-trust explainer on the network-modern lesson; and a per-shift SOC
  infrastructure map on every client file (new `static/js/agency/infra.js` + an `infra`
  field on each shift). 11 explainers in all. Node 247, build, smoke, axe clean.
  Remaining from Section E: optional only (per-alert highlighting of the infra map, more
  shifts/questions). Nothing outstanding or blocked.
