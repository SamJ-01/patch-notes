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
<path class="hw-body hw-side" d="M8 -16l3-3v26l-3 3z"/><path class="hw-body hw-top" d="M-30 -16l3-3h38l-3 3z"/><rect class="hw-body" x="-30" y="-16" width="38" height="26" rx="2"/><rect class="hw-screen" x="-27" y="-13" width="32" height="18" rx="1"/>
<circle class="hw-led" cx="4.5" cy="7.6" r="0.9"/><path class="hw-body" d="M-13.5 10h5v5h-5z"/><path class="hw-body hw-top" d="M-22 18.5h20l2.5-4h-20z"/>
<path class="hw-body hw-side" d="M27 -17l4-4v35l-4 4z"/><path class="hw-body hw-top" d="M15 -17l4-4h12l-4 4z"/><rect class="hw-body" x="15" y="-17" width="12" height="35" rx="1.5"/>
<rect class="hw-port" x="17" y="-14" width="8" height="2.8" rx="0.6"/><rect class="hw-port" x="17" y="-9.6" width="8" height="2.8" rx="0.6"/>
<circle class="hw-btn" cx="21" cy="-1.5" r="1.8"/><circle class="hw-led" cx="21" cy="3.3" r="0.9"/><path class="hw-vent" d="M17.5 9h7M17.5 11.7h7M17.5 14.4h7"/>
```

### Laptop (`laptop`)

```svg
<path class="hw-body hw-top" d="M-28 15h47l8-9h-47z"/><path class="hw-body hw-side" d="M19 15l8-9v2.5l-8 9z"/><path class="hw-body hw-side" d="M-28 15h47v2.5h-47z"/>
<path class="hw-port" d="M-19.5 11.8h31l3.6-4.2h-31z"/><path class="hw-port" d="M-6.5 14.4h10l1.2-1.5h-10z"/>
<path class="hw-body hw-side" d="M25 -21l2-2v26l-2 2z"/><path class="hw-body hw-top" d="M-19 -21l2-2h44l-2 2z"/><rect class="hw-body" x="-19" y="-21" width="44" height="26" rx="2"/><rect class="hw-screen" x="-16" y="-18" width="38" height="20" rx="1"/>
```

### Phone (`phone`)

```svg
<path class="hw-body hw-side" d="M11 -20l3-3v41l-3 3z"/><path class="hw-body hw-top" d="M-11 -20l3-3h22l-3 3z"/><rect class="hw-body" x="-11" y="-20" width="22" height="41" rx="4"/><rect class="hw-screen" x="-8.5" y="-15.5" width="17" height="31" rx="1.5"/>
<circle class="hw-port" cx="0" cy="-17.8" r="0.9"/><path class="hw-line" d="M-3 18.3h6"/>
```

### Server (`server`)

```svg
<path class="hw-body hw-side" d="M14 -17l5-5v39l-5 5z"/><path class="hw-body hw-top" d="M-18 -17l5-5h32l-5 5z"/><rect class="hw-body" x="-18" y="-17" width="32" height="39" rx="2"/>
<rect class="hw-port" x="-14.5" y="-13.5" width="25" height="6.5" rx="1"/><path class="hw-line" d="M-11.5 -10.25h10"/><circle class="hw-led" cx="6.5" cy="-10.25" r="1.2"/><rect class="hw-port" x="-14.5" y="-5" width="25" height="6.5" rx="1"/><path class="hw-line" d="M-11.5 -1.75h10"/><circle class="hw-led" cx="6.5" cy="-1.75" r="1.2"/><rect class="hw-port" x="-14.5" y="3.5" width="25" height="6.5" rx="1"/><path class="hw-line" d="M-11.5 6.75h10"/><circle class="hw-led" cx="6.5" cy="6.75" r="1.2"/>
<path class="hw-vent" d="M-12 13.5h13M-12 16.5h13"/><circle class="hw-btn" cx="6.5" cy="15" r="1.8"/>
```

### Database (`db`)

```svg
<path class="hw-body" d="M-18-13v26a18 6 0 0 0 36 0v-26"/><ellipse class="hw-body hw-top" cx="0" cy="-13" rx="18" ry="6"/>
<path class="hw-line" d="M-18-3.5a18 6 0 0 0 36 0M-18 5a18 6 0 0 0 36 0"/>
<circle class="hw-led" cx="11.5" cy="-3.6" r="1.1"/><circle class="hw-led" cx="11.5" cy="5.2" r="1.1"/><circle class="hw-led" cx="11.5" cy="13.6" r="1.1"/>
```

### Switch (`switch`)

```svg
<path class="hw-body hw-side" d="M24 -6l6-6v17l-6 6z"/><path class="hw-body hw-top" d="M-31 -6l6-6h55l-6 6z"/><rect class="hw-body" x="-31" y="-6" width="55" height="17" rx="1.5"/>
<circle class="hw-led" cx="-26" cy="-2.2" r="0.95"/><rect class="hw-port" x="-28.2" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="-21" cy="-2.2" r="0.95"/><rect class="hw-port" x="-23.2" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="-16" cy="-2.2" r="0.95"/><rect class="hw-port" x="-18.2" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="-11" cy="-2.2" r="0.95"/><rect class="hw-port" x="-13.2" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="-6" cy="-2.2" r="0.95"/><rect class="hw-port" x="-8.2" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="-1" cy="-2.2" r="0.95"/><rect class="hw-port" x="-3.1999999999999993" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="4" cy="-2.2" r="0.95"/><rect class="hw-port" x="1.8000000000000007" y="0.8" width="4.4" height="4.8" rx="0.6"/><circle class="hw-led" cx="9" cy="-2.2" r="0.95"/><rect class="hw-port" x="6.800000000000001" y="0.8" width="4.4" height="4.8" rx="0.6"/>
<circle class="hw-led" cx="15.5" cy="-2.2" r="0.95"/><rect class="hw-port" x="13.4" y="0.8" width="4.2" height="4.8" rx="0.6"/><circle class="hw-led" cx="20.3" cy="-2.2" r="0.95"/><rect class="hw-port" x="18.2" y="0.8" width="4.2" height="4.8" rx="0.6"/>
```

### Hub (`hub`)

```svg
<path class="hw-body hw-side" d="M22 -6l5-5v16l-5 5z"/><path class="hw-body hw-top" d="M-28 -6l5-5h50l-5 5z"/><rect class="hw-body" x="-28" y="-6" width="50" height="16" rx="1.5"/><text class="hw-text" x="-23" y="0.5">HUB</text>
<circle class="hw-led hw-amber" cx="16" cy="-1.5" r="1.4"/>
<rect class="hw-port" x="-23" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="-15" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="-7" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="1" y="3" width="5.5" height="4.5" rx="0.6"/><rect class="hw-port" x="9" y="3" width="5.5" height="4.5" rx="0.6"/>
```

### Router (`router`)

```svg
<path class="hw-ant" d="M-17-6l-3.5-14.5M18-6l3.5-14.5"/><path class="hw-body hw-side" d="M21 0l6-6v14l-6 6z"/><path class="hw-body hw-top" d="M-30 0l6-6h51l-6 6z"/><rect class="hw-body" x="-30" y="0" width="51" height="14" rx="3"/>
<circle class="hw-led" cx="-23" cy="7" r="1.3"/><circle class="hw-led" cx="-17" cy="7" r="1.3"/><circle class="hw-led" cx="-11" cy="7" r="1.3"/><circle class="hw-led" cx="-5" cy="7" r="1.3"/>
<path class="hw-vent" d="M4 3.5v7M7.5 3.5v7M11 3.5v7M14.5 3.5v7"/>
```

### Firewall (`firewall`)

```svg
<path class="hw-body hw-side hw-fw" d="M21 -15l6-6v33l-6 6z"/><path class="hw-body hw-top hw-fw" d="M-27 -15l6-6h48l-6 6z"/><rect class="hw-body hw-fw" x="-27" y="-15" width="48" height="33" rx="2"/>
<path class="hw-brick" d="M-27-4h48M-27 7h48M-11-15v11M5-15v11M-19-4v11M-3-4v11M13-4v11M-11 7v11M5 7v11"/>
```

### Access point (`ap`)

```svg
<path class="hw-wave w1" d="M-6.4-1.4a9 9 0 0 1 12.8 0"/><path class="hw-wave w2" d="M-11.3-6.3a16 16 0 0 1 22.6 0"/><path class="hw-wave w3" d="M-16.3-11.3a23 23 0 0 1 32.6 0"/>
<path class="hw-body hw-side" d="M-19 11v5a19 4.8 0 0 0 38 0v-5"/><ellipse class="hw-body hw-top" cx="0" cy="11" rx="19" ry="4.8"/><circle class="hw-led" cx="0" cy="11" r="1.6"/>
```

### Internet (`cloud`)

```svg
<path class="hw-body hw-cloud" d="M-17 16a12 12 0 0 1-2-23.8a15 15 0 0 1 28.5-5.2a11.5 11.5 0 0 1 11 29z"/>
<path class="hw-line hw-globe" d="M-6 6a7 7 0 1 0 14 0a7 7 0 1 0-14 0M-6 6h14M1-1c-3 4-3 10 0 14c3-4 3-10 0-14"/>
```

### Attacker (`attacker`)

```svg
<path class="hw-body hw-threat" d="M-27 20.5c0-10 7-15 15-17h24c8 2 15 7 15 17z"/>
<path class="hw-body hw-threat" d="M0-22.5c-10 0-16 8-16 18 0 5 2 9 4 11h24c2-2 4-6 4-11 0-10-6-18-16-18z"/>
<path class="hw-face" d="M0-14.5c-6 0-9 5-9 10 0 4 3 7 9 7s9-3 9-7c0-5-3-10-9-10z"/><path class="hw-glint" d="M-5-3.5h3.5M1.5-3.5h3.5"/>
<path class="hw-body hw-side" d="M14 2.5l3-3v16l-3 3z"/><path class="hw-body hw-top" d="M-16 2.5l3-3h30l-3 3z"/><rect class="hw-body" x="-16" y="2.5" width="30" height="16" rx="1.5"/><path class="hw-body hw-side" d="M-16 18.5h30v2.5h-30z"/><circle class="hw-led" cx="-1" cy="10.5" r="1.8"/>
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
