# Prompt for ChatGPT: improve the Patch Notes device icons

Paste everything below the line into ChatGPT and attach icons-dark.png and icons-light.png (in this folder).

---

I run a cyber security learning website. Its network diagrams use a small library of device icons drawn as **inline SVG**, attached as two screenshots (dark and light theme). I want them to look more polished and realistic while staying clean and readable when drawn small (about 50 px wide in diagrams).

**Improve each icon, and give me back SVG code I can drop straight in.** Hard rules, because the site restyles these icons with CSS for two themes and several states:

1. **Same frame:** each drawing is centred on (0, 0) and fits a 64 × 46 box (x from -32 to 32, y from -23 to 23). Return only the inner SVG elements for each device, no `<svg>` wrapper.
2. **No colours in the SVG.** No `fill`, `stroke`, `style` or `opacity` attributes. Colour comes only from these classes, so keep using them for the same jobs:
   - `hw-body`: the device's casing (gets a gradient fill and the outline colour)
   - `hw-body hw-top` and `hw-body hw-side`: the lit top face and shaded right side (a 3/4 view, depth going up and to the right)
   - `hw-screen`: screens (turns red or green when a device is broken or fixed)
   - `hw-port`: sockets, slots and keyboards
   - `hw-line`: small details (stands, bezels); `hw-vent`: vents; `hw-ant`: antennas
   - `hw-led`: status lights (they blink); `hw-btn`: power buttons
   - `hw-wave`: Wi-Fi waves (access point); `hw-cloud`, `hw-globe`: the internet; `hw-threat`, `hw-face`, `hw-glint`: the attacker; `hw-fw`, `hw-brick`: the firewall; `hw-amber`, `hw-text`: the hub's amber light and its "HUB" label
3. **Readable at 50 px:** few, bold shapes; no detail thinner than about 1 unit; no text except the hub's label.
4. **Keep each device recognisable as the same thing**, and keep the set consistent with each other (same angle, same depth, same weight).
5. **Keep what each is for:** the switch needs a visible row of ports with lights; the hub must look like a cheaper switch; the attacker is a hooded figure behind the back of a laptop lid (we see the lid's back, not the screen); the firewall is a brick wall unit.

For each device, give me: the device name, one sentence on what you changed, and the SVG elements in a code block.

## The current drawings (inner SVG for each device)

### PC (`pc`)

```svg
<path class="hw-body hw-side" d="M9 -19l3-3v28l-3 3z"/><path class="hw-body hw-top" d="M-31 -19l3-3h40l-3 3z"/><rect class="hw-body" x="-31" y="-19" width="40" height="28" rx="2"/><rect class="hw-screen" x="-28" y="-16" width="34" height="22" rx="1.2"/>
<path class="hw-line" d="M-11 9v5"/><path class="hw-body" d="M-20 14h18l2.5 3h-23z"/>
<path class="hw-body hw-side" d="M26 -19l5-5v36l-5 5z"/><path class="hw-body hw-top" d="M14 -19l5-5h12l-5 5z"/><rect class="hw-body" x="14" y="-19" width="12" height="36" rx="1.5"/>
<circle class="hw-led" cx="20" cy="-14" r="1.4"/><path class="hw-line" d="M16.5-8h7M16.5-4.5h7"/>
```

### Laptop (`laptop`)

```svg
<path class="hw-body hw-top" d="M-27 15h47l8-9h-47z"/><path class="hw-body hw-side" d="M20 15l8-9v3l-8 9z"/><path class="hw-body hw-side" d="M-27 15h47v3h-47z"/>
<path class="hw-port" d="M-20 13h31l5.5-6h-31z"/>
<path class="hw-body hw-side" d="M26 -21l2-2v27l-2 2z"/><path class="hw-body hw-top" d="M-18 -21l2-2h44l-2 2z"/><rect class="hw-body" x="-18" y="-21" width="44" height="27" rx="2"/><rect class="hw-screen" x="-15" y="-18" width="38" height="21" rx="1.2"/>
```

### Phone (`phone`)

```svg
<path class="hw-body hw-side" d="M10 -21l3-3v42l-3 3z"/><path class="hw-body hw-top" d="M-12 -21l3-3h22l-3 3z"/><rect class="hw-body" x="-12" y="-21" width="22" height="42" rx="4"/><rect class="hw-screen" x="-9" y="-16" width="16" height="30" rx="1.2"/>
<path class="hw-line" d="M-4 17.5h6"/>
```

### Server (`server`)

```svg
<path class="hw-body hw-side" d="M12 -17l6-6v40l-6 6z"/><path class="hw-body hw-top" d="M-19 -17l6-6h31l-6 6z"/><rect class="hw-body" x="-19" y="-17" width="31" height="40" rx="2"/>
<rect class="hw-port" x="-15" y="-13" width="23" height="7.5" rx="0.8"/><path class="hw-line" d="M-12 -9.25h11"/><circle class="hw-led" cx="4.5" cy="-9.25" r="1.2"/><rect class="hw-port" x="-15" y="-3.5" width="23" height="7.5" rx="0.8"/><path class="hw-line" d="M-12 0.25h11"/><circle class="hw-led" cx="4.5" cy="0.25" r="1.2"/><rect class="hw-port" x="-15" y="6" width="23" height="7.5" rx="0.8"/><path class="hw-line" d="M-12 9.75h11"/><circle class="hw-led" cx="4.5" cy="9.75" r="1.2"/>
<path class="hw-vent" d="M-12 16h12M-12 19h12"/><circle class="hw-btn" cx="5" cy="17.5" r="1.5"/>
```

### Database (`db`)

```svg
<path class="hw-body" d="M-18-14v28a18 6 0 0 0 36 0v-28"/><ellipse class="hw-body hw-top" cx="0" cy="-14" rx="18" ry="6"/>
<path class="hw-line" d="M-18-2a18 6 0 0 0 36 0M-18 7a18 6 0 0 0 36 0"/><circle class="hw-led" cx="11" cy="3" r="1.3"/>
```

### Switch (`switch`)

```svg
<path class="hw-body hw-side" d="M25 -7l6-6v17l-6 6z"/><path class="hw-body hw-top" d="M-33 -7l6-6h58l-6 6z"/><rect class="hw-body" x="-33" y="-7" width="58" height="17" rx="1.5"/>
<circle class="hw-led" cx="-27.3" cy="-3" r="0.95"/><rect class="hw-port" x="-29.5" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="-22.1" cy="-3" r="0.95"/><rect class="hw-port" x="-24.3" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="-16.9" cy="-3" r="0.95"/><rect class="hw-port" x="-19.1" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="-11.7" cy="-3" r="0.95"/><rect class="hw-port" x="-13.899999999999999" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="-6.5" cy="-3" r="0.95"/><rect class="hw-port" x="-8.7" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="-1.3000000000000007" cy="-3" r="0.95"/><rect class="hw-port" x="-3.5" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="3.900000000000002" cy="-3" r="0.95"/><rect class="hw-port" x="1.7000000000000028" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="9.099999999999998" cy="-3" r="0.95"/><rect class="hw-port" x="6.899999999999999" y="0" width="4.4" height="5" rx="0.6"/>
<rect class="hw-port" x="13.5" y="0" width="4.4" height="5" rx="0.6"/><rect class="hw-port" x="19" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="18.5" cy="-3" r="0.95"/>
```

### Hub (`hub`)

```svg
<path class="hw-body hw-side" d="M22 -6l5-5v16l-5 5z"/><path class="hw-body hw-top" d="M-28 -6l5-5h50l-5 5z"/><rect class="hw-body" x="-28" y="-6" width="50" height="16" rx="1.5"/><text class="hw-text" x="-23" y="0.5">HUB</text>
<circle class="hw-led hw-amber" cx="16" cy="-1.5" r="1.4"/>
<rect class="hw-port" x="-23" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="-15" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="-7" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="1" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="9" y="3" width="5.5" height="4.5" rx="0.6"/>
```

### Router (`router`)

```svg
<path class="hw-ant" d="M-16-9l-4-15M20-9l4-15"/><path class="hw-body hw-side" d="M22 -1l6-6v15l-6 6z"/><path class="hw-body hw-top" d="M-30 -1l6-6h52l-6 6z"/><rect class="hw-body" x="-30" y="-1" width="52" height="15" rx="3"/>
<circle class="hw-led" cx="-23" cy="6.5" r="1.3"/><circle class="hw-led" cx="-17" cy="6.5" r="1.3"/><circle class="hw-led" cx="-11" cy="6.5" r="1.3"/><circle class="hw-led" cx="-5" cy="6.5" r="1.3"/>
<path class="hw-vent" d="M4 3v7M7.5 3v7M11 3v7M14.5 3v7"/>
```

### Firewall (`firewall`)

```svg
<path class="hw-body hw-side hw-fw" d="M21 -16l6-6v34l-6 6z"/><path class="hw-body hw-top hw-fw" d="M-27 -16l6-6h48l-6 6z"/><rect class="hw-body hw-fw" x="-27" y="-16" width="48" height="34" rx="2"/>
<path class="hw-brick" d="M-27-4.7h48M-27 6.7h48M-11-16v11.3M5-16v11.3M-3-4.7v11.4M-19-4.7v11.4M13-4.7v11.4M-11 6.7v11.3M5 6.7v11.3"/>
```

### Access point (`ap`)

```svg
<path class="hw-wave w1" d="M-8-6a11 11 0 0 1 16 0"/><path class="hw-wave w2" d="M-14-12a19 19 0 0 1 28 0"/><path class="hw-wave w3" d="M-20-18a27 27 0 0 1 40 0"/>
<path class="hw-body hw-side" d="M-20 6v6a20 5 0 0 0 40 0v-6"/><ellipse class="hw-body hw-top" cx="0" cy="6" rx="20" ry="5"/><circle class="hw-led" cx="0" cy="6" r="1.7"/>
```

### Internet (`cloud`)

```svg
<path class="hw-body hw-cloud" d="M-17 16a12 12 0 0 1-2-23.8a15 15 0 0 1 28.5-5.2a11.5 11.5 0 0 1 11 29z"/>
<path class="hw-line hw-globe" d="M-6 6a7 7 0 1 0 14 0a7 7 0 1 0-14 0M-6 6h14M1-1c-3 4-3 10 0 14c3-4 3-10 0-14"/>
```

### Attacker (`attacker`)

```svg
<path class="hw-body hw-threat" d="M-27 19c0-10 7-15 15-17h24c8 2 15 7 15 17z"/>
<path class="hw-body hw-threat" d="M0-24c-10 0-16 8-16 18 0 5 2 9 4 11h24c2-2 4-6 4-11 0-10-6-18-16-18z"/>
<path class="hw-face" d="M0-16c-6 0-9 5-9 10 0 4 3 7 9 7s9-3 9-7c0-5-3-10-9-10z"/><path class="hw-glint" d="M-5-5h3.5M1.5-5h3.5"/>
<path class="hw-body hw-side" d="M14 1l3-3v16l-3 3z"/><path class="hw-body hw-top" d="M-16 1l3-3h30l-3 3z"/><rect class="hw-body" x="-16" y="1" width="30" height="16" rx="1.5"/><path class="hw-body hw-side" d="M-16 17h30v2.5h-30z"/><circle class="hw-led" cx="-1" cy="9" r="1.8"/>
```

## The CSS that colours them (for reference: don't change it)

```css
  --hw-stroke: #4A6080; --hw-screen: #0A1A26; --hw-port: #0A1018; --hw-top: #22324A; --hw-bot: #101A28; --hw-face-top: #2E4262; --hw-face-side: #0B131E; --hw-shadow: rgba(0, 0, 0, 0.45);
  --hw-stroke: #6F84A0; --hw-screen: #DCE7F2; --hw-port: #E7EDF5; --hw-top: #FFFFFF; --hw-bot: #D9E2EE; --hw-face-top: #F7FAFD; --hw-face-side: #BCCADB; --hw-shadow: rgba(15, 27, 45, 0.18);
.m-dev.talk .m-box { stroke: var(--brand); stroke-width: 2; filter: drop-shadow(0 0 10px rgba(var(--brand-rgb), 0.35)); }
.m-dev.ok .m-box { stroke: var(--good); }
.m-dev.bad .m-box { stroke: var(--exploited); }
.m-dev text { fill: var(--ink); font-family: var(--font-mono); }
.m-dev.warn .m-box { stroke: var(--likely); }
.hw-body { fill: url(#hw-sheen); stroke: var(--hw-stroke); stroke-width: 1.4; }
.hw { filter: drop-shadow(0 2px 2.5px var(--hw-shadow)); }
.hw-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.hw-defs .s1 { stop-color: var(--hw-top); } .hw-defs .s2 { stop-color: var(--hw-bot); }
.hw-text { font: 700 6px var(--font-mono); fill: var(--muted); letter-spacing: 0.08em; }
.hw-amber { fill: var(--sun); }
.hw-fw { stroke: rgba(var(--bad-rgb), 0.85); }
.hw-brick { fill: none; stroke: rgba(var(--bad-rgb), 0.55); stroke-width: 1.2; }
.hw-wave { fill: none; stroke: var(--brand); stroke-width: 2.2; stroke-linecap: round; }
.hw-cloud, .hw-globe { stroke: var(--good); }
.hw-threat { stroke: var(--bad); }
.hw-face { fill: #05080C; stroke: none; }
.hw-glint { fill: none; stroke: var(--bad); stroke-width: 1.6; stroke-linecap: round; opacity: .9; }
/* Depth faces of the 3/4 view: a lit top and a shaded side (they also carry hw-body, so state colours reach them). */
.hw-body.hw-top { fill: var(--hw-face-top); }
.hw-body.hw-side { fill: var(--hw-face-side); }
.hw-ant { fill: none; stroke: var(--hw-stroke); stroke-width: 3; stroke-linecap: round; }
.hw-vent { fill: none; stroke: var(--hw-stroke); stroke-width: 1.2; stroke-linecap: round; opacity: 0.6; }
.hw-btn { fill: none; stroke: var(--good); stroke-width: 1.2; }
.hw-screen { fill: var(--hw-screen); stroke: var(--dg-box); stroke-width: 1; }
.hw-line { fill: none; stroke: var(--hw-stroke); stroke-width: 1.6; stroke-linecap: round; }
.hw-port { fill: var(--hw-port); stroke: var(--dg-box); stroke-width: 0.8; }
.hw-led { fill: var(--good); opacity: 0.85; }
.m-dev.talk .hw-led { fill: var(--brand); opacity: 1; }
.m-dev.talk .hw-screen, .m-dev.talk .hw-body { stroke: rgba(var(--brand-rgb), 0.7); }
.m-dev.bad .hw-screen { fill: var(--exploited-tint); stroke: var(--exploited); }
.m-dev.ok .hw-screen { fill: var(--good-tint); stroke: var(--good); }
.m-dev.warn .hw-led { fill: var(--likely); }
.m-dev.talk .m-dot { fill: var(--brand); }
.m-dev.ok .m-dot { fill: var(--good); }
.m-dev.bad .m-dot { fill: var(--exploited); }
.m-dev.ok .m-status { fill: var(--good) !important; }
.m-dev.bad .m-status { fill: var(--exploited) !important; }
.tp-node.bad .hw-screen { fill: var(--exploited-tint); }
.tp-node.bad .hw-led, .tp-node.down .hw-led { fill: var(--exploited); }
.sc-router.me .hw-body { stroke: var(--sun); stroke-width: 2.4; }
.sc-dev.me .hw-screen { fill: rgba(var(--sun-rgb), 0.35); stroke: var(--sun); stroke-width: 2; }
.sc-dev.me .hw-body { stroke: var(--sun); }
.jr-srv.dead .hw-body { stroke: var(--bad); }
.jr-srv.dead .hw-led { fill: var(--bad); }
[data-svc].on .hw-body { stroke: var(--brand); stroke-width: 2.4; }
[data-hop].on .hw-body { stroke: var(--brand); stroke-width: 2.4; }
```
