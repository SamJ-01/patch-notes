// The Patch Notes device library: one drawing per kind of hardware, used by every diagram on the site
// (home page, missions, labs, the subnet calculator, card art). Each drawing is centred on (0,0) in a
// 64×46 frame. Colours come from the hw-* CSS classes, so both themes and every state (ok, bad, talking)
// restyle them without new artwork. build.py also inlines this file into the main page (minus "export").

// Devices are drawn in a 3/4 view: the detail sits on the front face, with a lit top and a shaded right side
// (hwBox) for depth. Those faces also carry hw-body, so every state rule that recolours a device's outline
// (talking, ok, bad, selected) recolours its depth too.
const hwBox = (x, y, w, h, d = 6, cls = "") => `<path class="hw-body hw-side${cls}" d="M${x + w} ${y}l${d}-${d}v${h}l-${d} ${d}z"/><path class="hw-body hw-top${cls}" d="M${x} ${y}l${d}-${d}h${w}l-${d} ${d}z"/>`;

export const HW = {
  pc: `${hwBox(-31, -19, 40, 28, 3)}<rect class="hw-body" x="-31" y="-19" width="40" height="28" rx="2"/><rect class="hw-screen" x="-28" y="-16" width="34" height="22" rx="1.2"/>
    <path class="hw-line" d="M-11 9v5"/><path class="hw-body" d="M-20 14h18l2.5 3h-23z"/>
    ${hwBox(14, -19, 12, 36, 5)}<rect class="hw-body" x="14" y="-19" width="12" height="36" rx="1.5"/>
    <circle class="hw-led" cx="20" cy="-14" r="1.4"/><path class="hw-line" d="M16.5-8h7M16.5-4.5h7"/>`,
  laptop: `${hwBox(-23, -21, 44, 29, 3)}<rect class="hw-body" x="-23" y="-21" width="44" height="29" rx="2"/><rect class="hw-screen" x="-20" y="-18" width="38" height="23" rx="1.2"/>
    <path class="hw-body" d="M-23 8h44l7 7h-58z"/><path class="hw-body hw-side" d="M-30 15h58v3h-58z"/><path class="hw-line" d="M-6 11.5h12"/>`,
  phone: `${hwBox(-12, -21, 22, 42, 3)}<rect class="hw-body" x="-12" y="-21" width="22" height="42" rx="4"/><rect class="hw-screen" x="-9" y="-16" width="16" height="30" rx="1.2"/>
    <path class="hw-line" d="M-4 17.5h6"/>`,
  server: `${hwBox(-19, -17, 31, 40)}<rect class="hw-body" x="-19" y="-17" width="31" height="40" rx="2"/>
    ${[0, 1, 2].map(i => `<rect class="hw-port" x="-15" y="${-13 + i * 9.5}" width="23" height="7.5" rx="0.8"/><path class="hw-line" d="M-12 ${-9.25 + i * 9.5}h11"/><circle class="hw-led" cx="4.5" cy="${-9.25 + i * 9.5}" r="1.2"/>`).join("")}
    <path class="hw-vent" d="M-12 16h12M-12 19h12"/><circle class="hw-btn" cx="5" cy="17.5" r="1.5"/>`,
  db: `<path class="hw-body" d="M-18-14v28a18 6 0 0 0 36 0v-28"/><ellipse class="hw-body hw-top" cx="0" cy="-14" rx="18" ry="6"/>
    <path class="hw-line" d="M-18-2a18 6 0 0 0 36 0M-18 7a18 6 0 0 0 36 0"/><circle class="hw-led" cx="11" cy="3" r="1.3"/>`,
  // One row of eight ports with a light each, plus two uplinks: still readable at diagram size.
  switch: `${hwBox(-33, -7, 58, 17)}<rect class="hw-body" x="-33" y="-7" width="58" height="17" rx="1.5"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle class="hw-led" cx="${-27.3 + i * 5.2}" cy="-3" r="0.95"/><rect class="hw-port" x="${-29.5 + i * 5.2}" y="0" width="4.4" height="5" rx="0.6"/>`).join("")}
    <rect class="hw-port" x="13.5" y="0" width="4.4" height="5" rx="0.6"/><rect class="hw-port" x="19" y="0" width="4.4" height="5" rx="0.6"/><circle class="hw-led" cx="18.5" cy="-3" r="0.95"/>`,
  // A hub looks like a cheap switch: fewer ports, one shared activity light, and it says so on the front.
  hub: `${hwBox(-28, -6, 50, 16, 5)}<rect class="hw-body" x="-28" y="-6" width="50" height="16" rx="1.5"/><text class="hw-text" x="-23" y="0.5">HUB</text>
    <circle class="hw-led hw-amber" cx="16" cy="-1.5" r="1.4"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect class="hw-port" x="${-23 + i * 8}" y="3" width="5.5" height="4.5" rx="0.6"/>`).join("")}`,
  router: `<path class="hw-ant" d="M-16-9l-4-15M20-9l4-15"/>${hwBox(-30, -1, 52, 15)}<rect class="hw-body" x="-30" y="-1" width="52" height="15" rx="3"/>
    ${[0, 1, 2, 3].map(i => `<circle class="hw-led" cx="${-23 + i * 6}" cy="6.5" r="1.3"/>`).join("")}
    <path class="hw-vent" d="M4 3v7M7.5 3v7M11 3v7M14.5 3v7"/>`,
  firewall: `${hwBox(-27, -16, 48, 34, 6, " hw-fw")}<rect class="hw-body hw-fw" x="-27" y="-16" width="48" height="34" rx="2"/>
    <path class="hw-brick" d="M-27-4.7h48M-27 6.7h48M-11-16v11.3M5-16v11.3M-3-4.7v11.4M-19-4.7v11.4M13-4.7v11.4M-11 6.7v11.3M5 6.7v11.3"/>`,
  // A ceiling access point: a puck with its top showing, and its signal above.
  ap: `<path class="hw-wave w1" d="M-8-6a11 11 0 0 1 16 0"/><path class="hw-wave w2" d="M-14-12a19 19 0 0 1 28 0"/><path class="hw-wave w3" d="M-20-18a27 27 0 0 1 40 0"/>
    <path class="hw-body hw-side" d="M-20 6v6a20 5 0 0 0 40 0v-6"/><ellipse class="hw-body hw-top" cx="0" cy="6" rx="20" ry="5"/><circle class="hw-led" cx="0" cy="6" r="1.7"/>`,
  cloud: `<path class="hw-body hw-cloud" d="M-17 16a12 12 0 0 1-2-23.8a15 15 0 0 1 28.5-5.2a11.5 11.5 0 0 1 11 29z"/>
    <path class="hw-line hw-globe" d="M-6 6a7 7 0 1 0 14 0a7 7 0 1 0-14 0M-6 6h14M1-1c-3 4-3 10 0 14c3-4 3-10 0-14"/>`,
  // The attacker: a hooded figure behind a laptop, face in shadow. We see the back of the lid (logo, no keyboard),
  // tilted away from us, so the laptop faces them.
  attacker: `<path class="hw-body hw-threat" d="M-27 19c0-10 7-15 15-17h24c8 2 15 7 15 17z"/>
    <path class="hw-body hw-threat" d="M0-24c-10 0-16 8-16 18 0 5 2 9 4 11h24c2-2 4-6 4-11 0-10-6-18-16-18z"/>
    <path class="hw-face" d="M0-16c-6 0-9 5-9 10 0 4 3 7 9 7s9-3 9-7c0-5-3-10-9-10z"/><path class="hw-glint" d="M-5-5h3.5M1.5-5h3.5"/>
    <path class="hw-body" d="M-15 1h30l2 16h-34z"/><path class="hw-line" d="M-16 19.5h32"/><circle class="hw-led" cx="0" cy="9" r="1.8"/>`,
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
