# Card shot list

No teal lamp, teal dot, halo or coloured wash. If a light would sit in an odd place, leave the shot dark. A screen may glow only when the screen is the subject.

The Practise copies called out on 11 November were split. Log search is a page of lines, not a dotted screen. Nmap is a blank grid. The topology switch has no LED. DNS, recon, OSI, scope, the two lockbox cards, permissions and the leak card each have their own object. No teal lamp.



Each line is one card. Do not copy one file onto the others.

## Done in this pass
The object is unique and the light source is in the frame.

| Card | Object | Light |
|---|---|---|
| ddos | ethernet cables | link LED on one plug |
| subnetting | patch panel | LED on one port |
| encryption | steel lockbox | monitor screen behind it |
| hashing | stamp and ink pad | desk lamp, shade in frame |
| certificates | ribbon folder | desk lamp, shade in frame |
| linux | monitor | the screen |
| ssh-brute | laptop and hardware key | light on the laptop lid |
| frameworks | closed binder | desk lamp, shade in frame |
| malware | USB stick | laptop screen at the edge of frame |
| zero-day | sealed envelope | desk lamp, shade in frame |
| vuln-management | clipboard | monitor screen at the edge of frame |
| supply-chain | cardboard boxes | scanner screen sitting on the box |
| data-breach | filing cabinet | flashlight inside the drawer |
| identity | card reader and keycard | LED on the reader |
| wireless | access point | LED on the access point |

Rejected: a ransomware laptop, because the screen had the words "LOCKED" and "Enter password". Shoot it again with a black screen and a padlock shape only.

Leave these alone. They were already their own picture: `cia-triad`, `cia-which-pillar`, `cloud`, `soc`, `sqli-log`, `vishing-call`.

## Still shared — shoot these next

None. As of 12 November every file in `static/img/cards/` is unique (97 cards, 97 pictures). Do not copy one file onto another card.

If a picture is a poor match for its card, replace that one file only.

Export 2:1, about 1200×600 webp, to `static/img/cards/<id>.webp`. Do not publish to production unless the owner asks.

## To replace (audit, 15 November 2026)
Found by a picture-similarity scan of all 97 card pictures and a look at them side by side. No new pictures yet: the image tool had no credits.

Make them as two 2 x 3 grids, with an earlier grid attached as the style reference, using the prompt preamble in [image-style.md](image-style.md). Then crop to 2:1, about 1200 x 600, at `static/img/cards/<id>.webp`.

**Grid A**

| Card | Why it goes | Object | Light |
|---|---|---|---|
| cia-which-pillar | the same picture as cia-triad (a near-identical file) | three brass balance weights in a row on a shelf | desk lamp, shade in frame |
| osint | teal wash with no source | a corkboard with blank index cards joined by string | desk lamp, shade in frame |
| signin-spray | teal pool of light on the lanyard | a key rack of identical hooks, one key missing | LED on a door lock at the edge |
| ai-security | teal wash across the wall | a smart speaker on a shelf | the speaker's own ring LED |
| xss-review | a red pen: off palette | a fountain pen on a face-down printed card | desk lamp, shade in frame |
| osi-model | abstract stripes, not a real object | a stack of seven thin slate coasters | desk lamp, shade in frame |

**Grid B**

| Card | Why it goes | Object | Light |
|---|---|---|---|
| vlans | two cable coils, almost the same shot as ddos-or-busy | patch leads tied into separate bundles at a switch | port LEDs |
| slow-network | nearly black, nothing to see at card size | an hourglass beside a home router | router LED |
| web-xss | nearly black | a tablet showing a blank web form | the screen (it is the subject) |
| who-touched-the-file | nearly black | a fingerprint brush and powder beside a closed folder | desk lamp, shade in frame |
| zero-trust-decision | nearly black | a security turnstile gate | LED on its card reader |
| ddos-who-stops-it | nearly black | a rope crowd barrier on stanchions | downlight in frame |

**For the owner's eye (not broken, but samey):** zero-day, zero-day-advisory, zero-day-or-known and trust-the-ai-output are all a blank sheet of paper on black; vishing-call and breach-clock carry a strong blue-teal cast.

After replacing, add a similarity check to the `CardPictures` test (the current one only catches two cards pointing at the same file, which is how this pair slipped through).

### Outcome (16 November 2026)
Two Grok rounds. Kept only what matched the house look and brightness (average 21 to 25 against the site's 20), cropped but not recoloured:
- **Replaced:** ai-security (smart speaker, its own ring light; cropped to drop a plant), ddos-who-stops-it (rope barrier in a dark corridor), slow-network (hourglass beside a router), zero-trust-decision (turnstile, reader LED; cropped to drop a white gutter).
- **Not used:** the other eight. Round one was too bright and warm (desk lamps, brass, cork, props) and several ideas missed; round two had the right ideas but a grey-green haze over the whole frame and a soft rendered look, and `osi-model` had about ten slates instead of seven. Those cards keep their old pictures and stay on this list: cia-which-pillar (still the same picture as cia-triad), osint, signin-spray, xss-review, osi-model, vlans, web-xss, who-touched-the-file (about Linux file permissions, not forensics). Good ideas from round two to reuse: padlock + sealed letter + socket (CIA), one key in the first of a row of lockers (spray), three padlocks on one drawer (permissions), a note tucked under a review card (stored XSS), a sticky note over a form field (XSS).

### Page headers and the network builder card (16 November 2026)
- The Learn and Practise page headers were the withdrawn holographic style. Learn now uses the advisory-hunt lab picture (a clipboard on a dark desk) and Practise the linux lesson picture (a terminal cursor on a dark desk), each on the page where that card does not appear. Saved at 988 x 494 in `static/img/heads/`.
- The network builder card had a teal LED on one patch-panel port (a lit dot with no reason). Removed: the port was rebuilt from its neighbour and the teal glow around it neutralised to the panel's own tone.
- (The other six headers are covered in the next line.)
- Later the same day the other six headers went too, each to a house-style card picture that page does not show: news ← soc (a monitor showing a list), cves ← patch-first, exams ← certificates (a ribboned folder), play ← play (dice), progress ← hashing (a stamp and ink pad), careers ← network-ops (a headset). Every header is now in the house look.

### New cards waiting for photos (16 November 2026)
The Governance track's seven cards use drawn scenes until photos are made in the house look (dark room, one real object, a light source in frame):
- `risk`: a ledger or register book open on a desk, one line ruled off. Light: desk lamp edge.
- `law`: a closed legal-style document with a seal, beside a laptop. Light: laptop screen edge.
- `attack-models`: a chain of steel links on a desk, one link open. Light: a thin strip of light.
- `cyber-essentials-check`: a clipboard with a five-item checklist (no readable text) by a small office router. Light: the router's LEDs.
- `risk-register`: index cards in a tray, one pulled half out. Light: desk lamp edge.
- `allowed-or-not`: a door with a keycard reader, the reader's light on. Light: the reader LED.
- `threat-model`: a sheet of tracing paper over a printed plan, pencil beside it. Light: a lightbox under the paper.

### Ready-to-paste prompts: the nine cards still on drawn scenes (16 November 2026)
Seven Governance cards plus two new labs (`asset-register`, `soar-playbook`). Learned from the two Grok rounds above:
no warm desk lamps, no brass, no props, no haze, and no brighter than the site (average about 21 to 25 out of 255).
Light each object with its own small light (an LED, a screen edge), as in the four pictures that were kept.
Attach `static/img/cards/ai-security.webp` and `static/img/cards/zero-trust-decision.webp` as the style reference.

**Grid C (2 rows x 3, one image):**
> Photoreal cinematic still, a 2 x 3 grid of six separate frames with thin black gutters, each frame 2:1. Every frame:
> a quiet dark room at night, no people, matte black surroundings, one real object, lit only by its own small light or the
> edge of a screen. Cool, low light, deep blacks, no haze, no fog, no warm lamps, no brass, no props, no readable text,
> no logos, no neon, no holograms. Restrained film photograph, the same camera and grade in all six.
> Row 1: (1) an open ledger book on a dark desk, one ruled line, lit by the cold edge of a laptop screen out of frame;
> (2) a sealed document folder beside a closed laptop, lit by the laptop's small charging LED;
> (3) a short length of steel chain lying on a desk, one link open, lit by a thin cool strip of light from a door gap.
> Row 2: (4) a blank clipboard next to a small office router, lit by the router's row of tiny status LEDs;
> (5) a tray of blank index cards, one pulled halfway out, lit by the cold edge of a monitor out of frame;
> (6) a closed office door with a keycard reader beside it, the reader's single small LED lit.

**Grid D (1 row x 3, one image):** the same preamble, three frames:
> (1) a sheet of tracing paper over a printed floor plan on a lightbox, the lightbox the only light (no readable text);
> (2) three closed laptops standing in a charging shelf, small blank asset-tag stickers, one laptop's charging LED lit;
> (3) a plug-in timer switch in a wall socket in a dark room, its small LED lit.

Crop each frame to 2:1, about 1200 x 600 webp:
Grid C → `risk`, `law`, `attack-models`, `cyber-essentials-check`, `risk-register`, `allowed-or-not`.
Grid D → `threat-model`, `asset-register`, `soar-playbook`.
Then add each id to `CARD_PHOTOS` in `src/app/07-labs.js` (the drawn scene stays as the fallback). Keep only frames that
match the house look; a card is better on its drawn scene than with a picture that doesn't fit.
