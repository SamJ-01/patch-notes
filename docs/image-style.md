# Image style: the Patch Notes house look

The owner chose this on 11 November 2026 and prefers it. Do not go back to neon shields, tunnels, holograms or cyberpunk posters.

The look in one line: **a dark room, one teal light, a real object.** Classy, quiet, photoreal. The home hero (`static/img/hero-soc.webp`) is the reference.

## Hard rules
- One practical teal light. No second neon colour, no holographic UI, no glowing emblems.
- The subject is a real thing: a phone, a terminal, a server cabinet, a door, a keycard. Not an illustrated icon.
- No people. No readable text, logos or watermarks.
- Related cards may share a still. Do not invent a new style for one card.
- Teaching diagrams stay as live SVG, not fake screenshots of real tools.

## Prompt preamble
> Photoreal cinematic still, 16:9. A quiet dark room at night, no people. One soft teal light, everything else matte black. A single real object. No neon, no holograms, no glowing icons, no readable text, no logos. Restrained film photograph.

Export cards at 2:1, about 1200×600 webp, into `static/img/cards/<id>.webp`.
The hero is `static/img/hero-soc.webp`, with an 800px copy beside it.
Do not use the old holographic preamble. It is withdrawn.
