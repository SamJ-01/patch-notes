# Image style: the Patch Notes house look

The owner chose this on 11 November 2026 and prefers it. Do not go back to neon shields, tunnels, holograms or cyberpunk posters.

The look in one line: **a dark room, one teal light, a real object.** Classy, quiet, photoreal. The home hero (`static/img/hero-soc.webp`) is the reference.

## Hard rules
- No teal lamp, teal dot, halo or coloured wash. If the light would sit in an odd place, leave the shot dark. A screen may glow only when the screen is the subject.
- The subject is a real thing: a phone, a terminal, a server cabinet, a door, a keycard. Not an illustrated icon.
- No people. No readable text, logos or watermarks.
- One picture per card. Every card has its own since 12 November 2026, and a test keeps it that way. Do not invent a new style for one card.
- Teaching diagrams stay as live SVG, not fake screenshots of real tools.

## Prompt preamble
> Photoreal cinematic still, 16:9. A quiet dark room at night, no people. One soft teal light, everything else matte black. A single real object. No neon, no holograms, no glowing icons, no readable text, no logos. Restrained film photograph.

Export cards at 2:1, about 1200×600 webp, into `static/img/cards/<id>.webp`.
The hero is `static/img/hero-soc.webp`, with an 800px copy beside it.
Do not use the old holographic preamble. It is withdrawn.

## Photo scenes and the cast (16 November 2026)
Interactive photo scenes (lessons that open on a photo with numbered hotspots; shot list in `docs/scene-shot-list.md`) are
the one place people appear. The reference is `static/img/scenes/cia-pharmacy.webp`.
- **The cast:** faceless figures. Smooth, matte, off-white heads like unglazed plaster, with no features; not grey, blue,
  glossy or eerie. Realistic bodies, clothes and calm, natural poses.
- **Who wears what:** staff in plain dark navy; customers and the public in grey or charcoal knitwear; contractors in a plain
  dark work jacket. Attackers, when needed, in a charcoal hooded jacket, shown from behind or as hands only; never weapons.
- **Light:** the same dark, cool, mostly black frame as the cards, a little brighter where the action is (the site sits about
  15 to 27 out of 255; the pharmacy scene is 21).
- **Text:** none, except a short sign the prompt names and spells (for example OPEN). Check spelling, and paint out any small
  logo on a screen or bezel.
- One image per scene, 1536 x 1024. Cards keep their own rule: one object, no people.

## Exceptions and fixes (photo audit, 16 November 2026)
- `cards/cia-which-pillar` is a crop of the pharmacy scene (the "which pillar?" lab matches it exactly). It is the one card
  with people in it; it replaced a byte-for-byte copy of `cards/cia-triad`.
- The four Agency client scenes had real car-brand badges and half-legible plates: softened in place, and the Wrenfield sign's
  final letter (an AI "Q" tail) evened into an O. The 800 px copies are regenerated from the fixed full-size files.
- Graded in place (16 Nov, second pass): the four client scenes darker, cooler and less saturated (about 41-59 down to 24-30,
  lit windows kept); the Port Corridor backdrop and door desaturated and darkened (still a sci-fi corridor by design: it is a game);
  six near-black cards lifted to about 12-16 with a gentle curve (`subnetting` and `who-touched-the-file` with a small shadow toe,
  because lifting further exposed compression blocks).
- Replaced (17 Nov, GPT, one image each): `play` (dice with correct pips and adjacent faces; also the Play page header),
  `who-touched-the-file` (padlocks on a drawer), `zero-day` (sealed envelope), `zero-day-advisory` (red emergency phone),
  `zero-day-or-known` (two keys, one tagged), `trust-the-ai-output` (smart speaker; like `ai-security`, deliberately, both
  AI topics), `map-the-attack` (pins joined by thread), and `agency/owen` (now clearly a different man from Tomasz).
  Still blank-paper cards: `nmap-read`, `what-did-we-leak`, `prompt-injection` (they show paper on purpose: a scan printout,
  leaked pages, a hidden-text card).
