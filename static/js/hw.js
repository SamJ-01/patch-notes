// The Patch Notes device library: one drawing per kind of hardware, used by every diagram on the site
// (home page, missions, labs, the subnet calculator, card art). Each drawing is centred on (0,0) in a
// 64×46 frame. Colours come from the hw-* CSS classes, so both themes and every state (ok, bad, talking)
// restyle them without new artwork. build.py also inlines this file into the main page (minus "export").

// Devices are drawn in a 3/4 view: the detail sits on the front face, with a lit top and a shaded right side
// (hwBox) for depth. Those faces also carry hw-body, so every state rule that recolours a device's outline
// (talking, ok, bad, selected) recolours its depth too.
const hwBox = (x, y, w, h, d = 6, cls = "") => `<path class="hw-body hw-side${cls}" d="M${x + w} ${y}l${d}-${d}v${h}l-${d} ${d}z"/><path class="hw-body hw-top${cls}" d="M${x} ${y}l${d}-${d}h${w}l-${d} ${d}z"/>`;

export const HW = {
  // A monitor on a stand (screen, a chin with its power light) beside a tower (two drive bays, power button, vents).
  pc: `${hwBox(-30, -16, 38, 26, 3)}<rect class="hw-body" x="-30" y="-16" width="38" height="26" rx="2"/><rect class="hw-screen" x="-27" y="-13" width="32" height="18" rx="1"/>
    <circle class="hw-led" cx="4.5" cy="7.6" r="0.9"/><path class="hw-body" d="M-13.5 10h5v5h-5z"/><path class="hw-body hw-top" d="M-22 18.5h20l2.5-4h-20z"/>
    ${hwBox(15, -17, 12, 35, 4)}<rect class="hw-body" x="15" y="-17" width="12" height="35" rx="1.5"/>
    <rect class="hw-port" x="17" y="-14" width="8" height="2.8" rx="0.6"/><rect class="hw-port" x="17" y="-9.6" width="8" height="2.8" rx="0.6"/>
    <circle class="hw-btn" cx="21" cy="-1.5" r="1.8"/><circle class="hw-led" cx="21" cy="3.3" r="0.9"/><path class="hw-vent" d="M17.5 9h7M17.5 11.7h7M17.5 14.4h7"/>`,
  // The lid stands at the back of the base; the base is a slab seen from above, going back the same way as every
  // other device's depth, with its front edge and right side showing, a keyboard and a trackpad on top.
  laptop: `<path class="hw-body hw-top" d="M-28 15h47l8-9h-47z"/><path class="hw-body hw-side" d="M19 15l8-9v2.5l-8 9z"/><path class="hw-body hw-side" d="M-28 15h47v2.5h-47z"/>
    <path class="hw-port" d="M-19.5 11.8h31l3.6-4.2h-31z"/><path class="hw-port" d="M-6.5 14.4h10l1.2-1.5h-10z"/>
    ${hwBox(-19, -21, 44, 26, 2)}<rect class="hw-body" x="-19" y="-21" width="44" height="26" rx="2"/><rect class="hw-screen" x="-16" y="-18" width="38" height="20" rx="1"/>`,
  // A slim handset: camera, screen and home bar.
  phone: `${hwBox(-11, -20, 22, 41, 3)}<rect class="hw-body" x="-11" y="-20" width="22" height="41" rx="4"/><rect class="hw-screen" x="-8.5" y="-15.5" width="17" height="31" rx="1.5"/>
    <circle class="hw-port" cx="0" cy="-17.8" r="0.9"/><path class="hw-line" d="M-3 18.3h6"/>`,
  // Three drive bays, each with its handle and a status light, then vents and the power button.
  server: `${hwBox(-18, -17, 32, 39, 5)}<rect class="hw-body" x="-18" y="-17" width="32" height="39" rx="2"/>
    ${[0, 1, 2].map(i => `<rect class="hw-port" x="-14.5" y="${-13.5 + i * 8.5}" width="25" height="6.5" rx="1"/><path class="hw-line" d="M-11.5 ${-10.25 + i * 8.5}h10"/><circle class="hw-led" cx="6.5" cy="${-10.25 + i * 8.5}" r="1.2"/>`).join("")}
    <path class="hw-vent" d="M-12 13.5h13M-12 16.5h13"/><circle class="hw-btn" cx="6.5" cy="15" r="1.8"/>`,
  // A cylinder in three layers, a light on each.
  db: `<path class="hw-body" d="M-18-13v26a18 6 0 0 0 36 0v-26"/><ellipse class="hw-body hw-top" cx="0" cy="-13" rx="18" ry="6"/>
    <path class="hw-line" d="M-18-3.5a18 6 0 0 0 36 0M-18 5a18 6 0 0 0 36 0"/>
    <circle class="hw-led" cx="11.5" cy="-3.6" r="1.1"/><circle class="hw-led" cx="11.5" cy="5.2" r="1.1"/><circle class="hw-led" cx="11.5" cy="13.6" r="1.1"/>`,
  // One row of eight ports with a light each, plus two uplinks set apart: still readable at diagram size.
  switch: `${hwBox(-31, -6, 55, 17)}<rect class="hw-body" x="-31" y="-6" width="55" height="17" rx="1.5"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle class="hw-led" cx="${-26 + i * 5}" cy="-2.2" r="0.95"/><rect class="hw-port" x="${-28.2 + i * 5}" y="0.8" width="4.4" height="4.8" rx="0.6"/>`).join("")}
    ${[0, 1].map(i => `<circle class="hw-led" cx="${15.5 + i * 4.8}" cy="-2.2" r="0.95"/><rect class="hw-port" x="${13.4 + i * 4.8}" y="0.8" width="4.2" height="4.8" rx="0.6"/>`).join("")}`,
  // A hub looks like a cheap switch: fewer ports, one shared activity light, and it says so on the front.
  hub: `${hwBox(-28, -6, 50, 16, 5)}<rect class="hw-body" x="-28" y="-6" width="50" height="16" rx="1.5"/><text class="hw-text" x="-23" y="0.5">HUB</text>
    <circle class="hw-led hw-amber" cx="16" cy="-1.5" r="1.4"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect class="hw-port" x="${-23 + i * 8}" y="3" width="5.5" height="4.5" rx="0.6"/>`).join("")}`,
  // Two antennas behind a low box: status lights on the left, vents on the right.
  router: `<path class="hw-ant" d="M-17-6l-3.5-14.5M18-6l3.5-14.5"/>${hwBox(-30, 0, 51, 14)}<rect class="hw-body" x="-30" y="0" width="51" height="14" rx="3"/>
    ${[0, 1, 2, 3].map(i => `<circle class="hw-led" cx="${-23 + i * 6}" cy="7" r="1.3"/>`).join("")}
    <path class="hw-vent" d="M4 3.5v7M7.5 3.5v7M11 3.5v7M14.5 3.5v7"/>`,
  // A brick-wall unit: staggered courses on the front, with its depth in the same red.
  firewall: `${hwBox(-27, -15, 48, 33, 6, " hw-fw")}<rect class="hw-body hw-fw" x="-27" y="-15" width="48" height="33" rx="2"/>
    <path class="hw-brick" d="M-27-4h48M-27 7h48M-11-15v11M5-15v11M-19-4v11M-3-4v11M13-4v11M-11 7v11M5 7v11"/>`,
  // A ceiling access point: a puck with its top showing, and three evenly spaced signal arcs above it.
  ap: `<path class="hw-wave w1" d="M-6.4-1.4a9 9 0 0 1 12.8 0"/><path class="hw-wave w2" d="M-11.3-6.3a16 16 0 0 1 22.6 0"/><path class="hw-wave w3" d="M-16.3-11.3a23 23 0 0 1 32.6 0"/>
    <path class="hw-body hw-side" d="M-19 11v5a19 4.8 0 0 0 38 0v-5"/><ellipse class="hw-body hw-top" cx="0" cy="11" rx="19" ry="4.8"/><circle class="hw-led" cx="0" cy="11" r="1.6"/>`,
  cloud: `<path class="hw-body hw-cloud" d="M-17 16a12 12 0 0 1-2-23.8a15 15 0 0 1 28.5-5.2a11.5 11.5 0 0 1 11 29z"/>
    <path class="hw-line hw-globe" d="M-6 6a7 7 0 1 0 14 0a7 7 0 1 0-14 0M-6 6h14M1-1c-3 4-3 10 0 14c3-4 3-10 0-14"/>`,
  // The attacker: a hooded figure behind a laptop, face in shadow. We see the back of the lid (logo, no keyboard)
  // with its thickness, so the laptop faces them.
  attacker: `<path class="hw-body hw-threat" d="M-27 20.5c0-10 7-15 15-17h24c8 2 15 7 15 17z"/>
    <path class="hw-body hw-threat" d="M0-22.5c-10 0-16 8-16 18 0 5 2 9 4 11h24c2-2 4-6 4-11 0-10-6-18-16-18z"/>
    <path class="hw-face" d="M0-14.5c-6 0-9 5-9 10 0 4 3 7 9 7s9-3 9-7c0-5-3-10-9-10z"/><path class="hw-glint" d="M-5-3.5h3.5M1.5-3.5h3.5"/>
    ${hwBox(-16, 2.5, 30, 16, 3)}<rect class="hw-body" x="-16" y="2.5" width="30" height="16" rx="1.5"/><path class="hw-body hw-side" d="M-16 18.5h30v2.5h-30z"/><circle class="hw-led" cx="-1" cy="10.5" r="1.8"/>`,
};

export const HW_INFO = {
  pc: ["PC", "An end device: where people work. It needs an IP address to talk to anything."],
  laptop: ["Laptop", "An end device that moves around, usually on Wi-Fi."],
  phone: ["Phone", "A mobile end device. On Wi-Fi it's just another host on the network."],
  server: ["Server", "Provides a service to others: websites, files, DHCP, DNS."],
  db: ["Database", "Stores the data behind an app. A favourite target in breaches."],
  switch: ["Switch", "Connects devices on one network. It learns which device is on which port and sends each frame only there (layer 2)."],
  hub: ["Hub", "An old repeater: copies every signal out of every port, so everyone hears everything (layer 1)."],
  router: ["Router", "Connects different networks and chooses the path between them using IP addresses (layer 3). Usually your default gateway."],
  firewall: ["Firewall", "Checks traffic against rules and blocks what isn't allowed. Sits between your network and the internet."],
  ap: ["Access point", "Gives wireless devices a way onto the wired network."],
  cloud: ["Internet", "Everyone else's networks. Your router hands traffic to your internet provider."],
  attacker: ["Attacker", "Someone trying to get in. Every defence on this site is about them."],
};

// One device as an SVG group: hw("router", 120, 80, 0.8, "me")
export const hw = (kind, x = 0, y = 0, s = 1, cls = "") =>
  `<g class="hw hw-k-${kind}${cls ? " " + cls : ""}" transform="translate(${x},${y})${s !== 1 ? ` scale(${s})` : ""}">${HW[kind] || ""}</g>`;
