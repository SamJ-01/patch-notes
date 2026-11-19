# Card photo prompts, 19 November 2026

**Status (19 Nov):** 12 of 14 are in. Still needed: `physical-test` (only a two-panel image came back; make the door
as one photo) and `web-xss` (the tablet came back bright with a readable "Contact Us" form; make it with the screen dim
and the form as blank grey bars, no words). Coasters: the second take had exactly seven.

Fourteen card pictures: the seven newest labs (they show drawn scenes until these exist) and the seven older cards still
on the replace list in `card-shot-list.md`. Same house look as every card: `image-style.md`.

**How to make them:** paste one grid prompt at a time, and attach an earlier finished grid as the style reference (for
example the one that made `ai-security`, `slow-network` and `zero-trust-decision`). Send the grids back as they are; they
get cropped to 2:1 by script, checked for brightness against the site (about 20 out of 255) and added to `CARD_PHOTOS`.

**What went wrong last time (16 November), so avoid it:** too bright and warm (desk lamps, brass, cork), a grey-green haze
over the whole frame, a soft rendered look, and miscounted objects (ten slates instead of seven). Dark, sharp, one light.

---

## Grid C: the seven new labs (six here, one in Grid E)

> Photoreal cinematic stills in a 2 x 3 grid: six separate photographs with thin black gutters between them, each its own
> scene, all matching. Each is a quiet dark room at night with no people. Everything is matte black except one small,
> real light source that is visible in the frame. A single real object in each. No neon, no holograms, no glowing icons,
> no coloured wash, no readable text, no logos. Restrained, sharp film photograph, like the attached reference.
>
> 1. A single sheet of folded tractor-feed printer paper lying on a dark desk, a pencil resting across it. Light: a laptop screen just at the edge of frame.
> 2. A black mechanical metronome on a dark desk, its arm caught mid-swing. Light: a monitor screen just at the edge of frame.
> 3. A heavy office door in a dark corridor, propped open a few centimetres with a small wooden wedge. Light: a strip of light from the room beyond, coming through the gap.
> 4. A dustpan and brush on the floor of a dark server room, beside a neatly coiled network cable. Light: small status LEDs on the rack behind.
> 5. A ceiling smoke detector, its cover open and its battery hanging out on its wires. Light: a window at the edge of frame, faint streetlight.
> 6. Four plain hardback books stacked on a dark shelf, blank spines, a single ribbon bookmark hanging from one. Light: a small, dim reading lamp with its shade in frame.

Crop to: 1 `recon-script`, 2 `automation-script`, 3 `physical-test`, 4 `cleanup-log`, 5 `risk-gone-wrong`, 6 `which-law-applies`.

---

## Grid D: replacements from the 15 November audit

Use the same opening paragraph as Grid C, then:

> 1. A pair of binoculars resting on a dark windowsill at night, blurred city lights far outside. Light: the window.
> 2. A row of identical grey metal lockers in a dark corridor, a single key left in the lock of the first one. Light: a ceiling light at the far end of the corridor.
> 3. A small handwritten note, its writing unreadable, tucked under the edge of a printed card on a dark desk. Light: a monitor screen just at the edge of frame.
> 4. Exactly seven thin dark slate coasters stacked neatly on a dark table, each edge clearly separate (count them: seven). Light: a small, dim reading lamp with its shade in frame.
> 5. Network patch leads at a rack switch, tied into separate neat bundles with velcro straps, muted blue and grey cables. Light: the switch's port LEDs.
> 6. A tablet lying flat on a dark desk showing a blank web form, a yellow sticky note stuck across one form field (no writing on it). Light: the tablet screen, which is the subject.

Crop to: 1 `osint`, 2 `signin-spray`, 3 `xss-review`, 4 `osi-model`, 5 `vlans`, 6 `web-xss`.

---

## Grid E: the last two (or make them as two single images)

Use the same opening paragraph, but "a 1 x 2 grid of two separate photographs":

> 1. Four different metal keys laid in a neat row on a dark desk, beside a closed padlock; only one key's shape would fit it. Light: a monitor screen just at the edge of frame.
> 2. A single filing-cabinet drawer secured with three small padlocks of different sizes. Light: a flashlight lying on top of the cabinet, its beam falling across the locks.

Crop to: 1 `which-model-fits`, 2 `who-touched-the-file` (a Linux file-permissions lab: three locks for owner, group and others, not forensics).

---

## Checks before sending them over
- The light source is in the frame, and nothing else glows.
- No readable text anywhere (paint out any brand on a lamp, tablet or switch).
- Counts are right: seven coasters, four keys, three padlocks.
- Dark overall: if a frame looks like a bright product photo, run it again darker.
