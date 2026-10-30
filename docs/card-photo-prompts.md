# Card photo prompts: the 17 Diagnose cases

These fill the card-photo gaps for the 17 new Diagnose-stage labs. Each card is a 2:1 banner,
saved as `static/img/cards/<filename>.webp`, cropped/resized to 496 x 248, then its id added to
`CARD_PHOTOS` in `src/app/07-labs.js`.

House style: match the existing 78 cards (cinematic, moody, UK settings, neon-glow accents,
no text, no logos, fictional people and places only).

## Style suffix (append to every scene)

> Cinematic editorial illustration, photorealistic yet painterly, low-key moody lighting with
> vibrant neon-glow accents (electric cyan, warm amber, alert red, deep violet), volumetric light,
> shallow depth of field, atmospheric, UK setting, fictional, no text, no logos, no readable words,
> wide 2:1 banner composition, highly detailed.

## Scenes (filename -> scene)

1. cia-which-pillar -> Three tall translucent glowing pillars of light in a darkened UK accountancy office at night, one cyan, one amber, one violet, the middle amber pillar cracked and flickering, data motes drifting, desks in soft focus.
2. frameworks-which-fits -> A person seen from behind in a dim office reaching toward four floating glowing holographic rulebooks of different colours, each with a simple abstract emblem, shelves of binders softly lit behind.
3. controls-what-was-missing -> A glowing cyan barrier of light across a dark corridor with one panel missing, a shadowy figure slipping through the gap, warm light spilling from an office doorway beyond.
4. zero-day-or-known -> Two floating warning sigils over a dark server room, the left sealed by a forming cyan shield, the right an open jagged red breach with no shield, server racks glowing faintly.
5. patch-first -> An analyst's desk at night, four floating glowing severity orbs of different sizes over a keyboard, one red orb pulsing brightest and pulled forward, the others dim, cool monitor glow on the hands.
6. which-dependency -> A glowing conveyor belt of identical translucent cyan parcels flowing through a dark warehouse, one parcel glowing malicious red among them, faint code-like motes, industrial setting.
7. apt-or-smash-grab -> A dark office split by lighting, left side chaotic with red alarm light and shattered glass, right side calm and shadowed with a single patient silhouette watching from the corner.
8. ddos-who-stops-it -> A colossal glowing red torrent of data surging down a giant pipe toward a small office building, an upstream floodgate glowing cyan straining to hold it back, night cityscape, dramatic scale.
9. trust-the-ai-output -> A softly glowing AI assistant orb on a desk in a dim helpdesk office, a thin red thread of hidden text creeping into it from a document, its light wavering between calm cyan and warning red.
10. ot-patch-window -> A glowing industrial control panel on a bottling line in a dark factory at night, a hovering amber clock marking a maintenance window, machinery in soft focus, caution lighting.
11. rogue-or-misconfig -> A dark college corridor at night with two identical glowing cyan Wi-Fi halos on the ceiling and one deceptive red twin halo mimicking them, faint signal rings rippling, lockers softly lit.
12. change-broke-it -> A dark data centre where one glowing switch has just been flipped, a cascade of lights going dark down the racks like falling dominoes, a lone engineer's silhouette, red warning glow.
13. zero-trust-decision -> A glowing security checkpoint of light in a dark office lobby, one figure passing through on a green verified beam, another blocked by a red barrier despite standing inside, holographic identity rings.
14. encrypted-but-readable -> Three glowing padlocks floating over a dark desk, one bright red and hanging open though it looks shut, one amber and cracked, one solid green and sealed, data leaking from the open one.
15. why-untrusted -> A glowing chain of translucent certificate links bridging two dark towers, one central link broken and sparking red, a faint browser-window frame of light in the foreground, moody city night.
16. who-touched-the-file -> A single glowing document on a pedestal in a dark server room, ringed by access doors with one standing wide open spilling warm light, shadowy hands reaching from it, cyan terminal glow.
17. what-did-we-leak -> An office building at night with glowing fragments of information drifting out of its windows into the dark street, a tiny key, document scraps, light motes, a hooded figure quietly gathering them.

## After the images exist

1. Drop each `<filename>.webp` (496 x 248) into `static/img/cards/`.
2. Add each id to the `CARD_PHOTOS` set in `src/app/07-labs.js`.
3. `python3 -m unittest tests.test_core` (CardPhotos.test_card_photos_exist must pass), then build.

## Spare / alternative prompts (reserve)

Append the style suffix (above) to each.

- what-did-we-leak (primary) -> An office building at night with glowing fragments of information drifting out of its lit windows into the dark street, a tiny glowing key, floating document scraps and light motes, a hooded figure quietly gathering them from the shadows.
- S1 alt what-did-we-leak -> A shadowy figure with a laptop in a dark rain-slicked UK street outside a brightly lit office, glowing cyan threads of data drifting out of the building's windows and pulled into their screen.
- S2 phishing hook -> A giant glowing red fish-hook of light descending toward an open laptop on a desk in a dim UK home office, a single envelope of cyan light impaled on it, papers and a mug around.
- S3 firewall holding -> A towering glowing wall of cyan light shielding a small UK office building from a swirling storm of red data outside, a few red sparks breaking through the barrier.
- S4 backups / recovery -> A dark server room where dim racks flicker back to life in cyan light, being restored from a glowing backup vault, warm hopeful light returning down the aisle.
- S5 SOC analyst at night -> A lone analyst silhouetted before a curved wall of glowing monitors in a dark UK security operations centre at night, cyan and red alert light washing over the room, steam rising from a mug.
