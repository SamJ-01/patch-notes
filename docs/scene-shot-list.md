# Photo scenes: shot list

Interactive photo scenes (concept type `scene`, see CLAUDE.md) are a recurring theme: wherever a lesson's idea happens in a
real place, the lesson opens on a photo with numbered hotspots instead of a diagram. The first is the CIA lesson's pharmacy
counter (`static/img/scenes/cia-pharmacy.webp`), which also fixes the cast (`docs/image-style.md`).

## How to make one
1. Generate **one image per scene** (not a grid), landscape 1536 x 1024, with GPT. Attach `img/scenes/cia-pharmacy.webp` and
   `img/cards/ai-security.webp` as style references. Make three or four versions and keep the best one or two.
2. Paste the shared opening below, then the scene's own lines.
3. Send the image back. It is checked for: brightness (the site sits about 15 to 27 out of 255), no logos or readable text
   (except a correctly spelt sign named in the prompt), and every hotspot object clearly visible. Hotspots are then pinned
   beside (not on) each object by reading the finished image.

## Shared opening (the cast and the light)
> Match the darkness, grade and mood of the attached reference photos. Photoreal cinematic still, landscape 1536 x 1024.
> Cool, low light; most of the frame dark; deep blacks; no haze, no neon, no logos, no brands, no readable text unless named
> below. People are faceless figures: smooth, matte off-white heads like unglazed plaster, with no features, not grey or blue
> and not glossy; realistic bodies and clothes; calm, natural poses. Staff wear plain dark navy; customers and members of the
> public wear grey or charcoal knitwear; contractors wear a plain dark work jacket. Nothing eerie: an ordinary workplace,
> photographed at night. Restrained film photograph.

The cast is confirmed (refined pharmacy image, 16 Nov) and recorded in `docs/image-style.md`.

## Scenes

### 1. Security controls: an office entrance at night (`security-controls`)
> An office building's glass entrance lobby at night. Left: a keycard reader beside the door with a small green LED. Upper
> right: a small CCTV camera on the wall. On the door, a small plain warning sticker with a camera symbol and no words. On the
> reception desk: an open paper sign-in book and a pen, and beside it an external backup drive with a blue LED. On the wall
> behind the desk, a framed one-page poster with blurred, unreadable lines of text. A faceless security guard in navy sits at
> the desk.

Hotspots: reader (preventive), CCTV (detective), sticker (deterrent), backup drive (corrective), poster (directive), sign-in
book as a stopgap while the reader is broken (compensating).

### 2. Data breaches: an office after hours (`data-breach`)
> An open-plan office after hours, one desk lamp off, light from screens only. Foreground: a desk with a monitor left
> unlocked showing a blurred spreadsheet (no readable text), a yellow sticky note on the monitor's edge with blurred marks. A
> printer behind with a small stack of papers left in its tray. A window to a dark car park, slightly open. No people.

Hotspots: unlocked screen, sticky note, papers on the printer, open window.

### 3. Malware: a workstation (`malware`)
> A single desk at night. A laptop shows a blurred email with a paperclip attachment icon (no readable text). A small
> unbranded USB stick lies beside the laptop, and an external backup drive is still plugged in with its light on. A faceless
> figure in grey knitwear reaches towards the USB stick.

Hotspots: USB stick of unknown origin, the attachment, the backup drive left connected (ransomware reaches it too).

### 4. Wi-Fi security: a café (`wireless`)
> A small café at night, warm but dim, mostly dark. A faceless customer in grey works on a laptop at a window table; a phone
> on the table shows a blurred list of Wi-Fi networks. Behind the counter, a small router with blue LEDs on a shelf. On a
> nearby table, a second small router or travel hotspot that doesn't belong, with its LEDs on. No readable text.

Hotspots: the open network on the laptop, the café's real router, the rogue hotspot (evil twin), the phone's network list.

### 5. IoT and OT: a factory floor (`iot-ot`)
> A small factory floor at night, machines idle. A grey control cabinet with a touchscreen panel (blurred, no readable text)
> and green and amber indicator lights. Beside it, an old beige desktop PC on a metal trolley, still running. On top of the
> cabinet, a small black box with an aerial and a blinking LED. A faceless contractor in a dark work jacket stands nearby.

Hotspots: the control panel (HMI), the old PC running it, the remote-access box, the contractor's access.

### 6. Running a network: a comms cupboard (`network-ops`)
> A small comms cupboard at night, lit by equipment LEDs. An open network rack: neat labelled cables on the left half, a
> tangle of unlabelled cables on the right half (labels blank, no readable text). A UPS at the bottom with a green light. A
> small temperature sensor on the wall. The rack's glass door stands open.

Hotspots: UPS, labelled cables, tangled cables, temperature sensor, open rack door.

## Also possible later
Agency client files (a scene of each client's premises with hotspots on what the SOC watches), and the "Your own evidence"
tools. Lessons that already lead with a diagram (phishing, networking, identity, encryption) keep it.

## Status (16 November 2026)
Done (on the preview): CIA pharmacy counter, security controls entrance, data breaches office, malware desk, Wi-Fi cafe,
IoT/OT factory, comms cupboard, OSINT office photo, supply-chain contractor. Card photo: threat-model (option 02, gamma 1.4).
Held: the tailgating entrance (option 03 of that batch) has no lesson to sit in yet, and its "one person per card" sticker
came out as a men's toilet sign in every version. Next time ask for "a small plain sticker showing a keycard with a line
through a second person" or leave the sticker out.
Edits made to generated images (never more): small logos painted out, a badge photo's face blurred (cast is faceless),
gentle gamma darkening where a lamp made a frame too bright (malware 1.25, OSINT 1.2).
