// The Patch Notes device library: one drawing per kind of hardware, used by every diagram on the site
// (home page, missions, labs, the subnet calculator, card art). Each drawing is centred on (0,0) in a
// 64×46 frame. Colours come from the hw-* CSS classes, so both themes and every state (ok, bad, talking)
// restyle them without new artwork. build.py also inlines this file into the main page (minus "export").

export const HW = {
  pc: `<rect class="hw-body" x="-31" y="-21" width="44" height="31" rx="3"/><rect class="hw-screen" x="-28" y="-18" width="38" height="24" rx="1.5"/>
    <path class="hw-line" d="M-9 10v5M-17 16h16"/><rect class="hw-body" x="18" y="-21" width="14" height="37" rx="2"/>
    <circle class="hw-led" cx="25" cy="-15" r="1.6"/><path class="hw-line" d="M21-8h8M21-4h8"/>`,
  laptop: `<rect class="hw-body" x="-24" y="-21" width="48" height="31" rx="3"/><rect class="hw-screen" x="-21" y="-18" width="42" height="25" rx="1.5"/>
    <path class="hw-body" d="M-31 11h62l-4 7h-54z"/><path class="hw-line" d="M-6 14.5h12"/>`,
  phone: `<rect class="hw-body" x="-12" y="-22" width="24" height="44" rx="5"/><rect class="hw-screen" x="-9" y="-17" width="18" height="31" rx="1.5"/>
    <path class="hw-line" d="M-3 18h6"/>`,
  server: `<rect class="hw-body" x="-17" y="-22" width="34" height="44" rx="3"/>
    ${[0, 1, 2].map(i => `<rect class="hw-port" x="-12" y="${-17 + i * 10}" width="24" height="7" rx="1"/><circle class="hw-led" cx="8" cy="${-13.5 + i * 10}" r="1.2"/>`).join("")}
    <path class="hw-line" d="M-10 16h20M-10 19h20"/>`,
  db: `<path class="hw-body" d="M-18-14v28a18 6 0 0 0 36 0v-28"/><ellipse class="hw-body" cx="0" cy="-14" rx="18" ry="6"/>
    <path class="hw-line" d="M-18-2a18 6 0 0 0 36 0M-18 7a18 6 0 0 0 36 0"/><circle class="hw-led" cx="11" cy="3" r="1.3"/>`,
  switch: `<rect class="hw-body" x="-32" y="-11" width="64" height="22" rx="3"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle class="hw-led" cx="${-24.5 + i * 7}" cy="-5" r="1.1"/><rect class="hw-port" x="${-27 + i * 7}" y="-1" width="5" height="6" rx="0.8"/>`).join("")}`,
  // A hub looks like a cheap switch: fewer ports, one shared activity light, and it says so on the front.
  hub: `<rect class="hw-body" x="-27" y="-10" width="54" height="20" rx="3"/><text class="hw-text" x="-21" y="-1.5">HUB</text>
    <circle class="hw-led hw-amber" cx="20" cy="-4" r="1.4"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect class="hw-port" x="${-21 + i * 8.6}" y="1.5" width="5.5" height="5.5" rx="0.8"/>`).join("")}`,
  router: `<path class="hw-line" d="M-17-3l-5-17M17-3l5-17"/><circle class="hw-tip" cx="-22" cy="-20" r="2"/><circle class="hw-tip" cx="22" cy="-20" r="2"/>
    <rect class="hw-body" x="-29" y="-3" width="58" height="18" rx="5"/>
    ${[0, 1, 2, 3].map(i => `<circle class="hw-led" cx="${-19 + i * 7}" cy="6" r="1.4"/>`).join("")}<path class="hw-line" d="M12 6h10"/>`,
  firewall: `<rect class="hw-body hw-fw" x="-26" y="-19" width="52" height="38" rx="3"/>
    <path class="hw-brick" d="M-26-6.5h52M-26 6.5h52M-9-19v12.5M9-19v12.5M0-6.5v13M-18-6.5v13M18-6.5v13M-9 6.5v12.5M9 6.5v12.5"/>`,
  ap: `<path class="hw-wave w1" d="M-8-4a11 11 0 0 1 16 0"/><path class="hw-wave w2" d="M-14-10a19 19 0 0 1 28 0"/><path class="hw-wave w3" d="M-20-16a27 27 0 0 1 40 0"/>
    <rect class="hw-body" x="-20" y="4" width="40" height="13" rx="6.5"/><circle class="hw-led" cx="0" cy="10.5" r="1.7"/>`,
  cloud: `<path class="hw-body hw-cloud" d="M-17 16a12 12 0 0 1-2-23.8a15 15 0 0 1 28.5-5.2a11.5 11.5 0 0 1 11 29z"/>
    <path class="hw-line hw-globe" d="M-6 6a7 7 0 1 0 14 0a7 7 0 1 0-14 0M-6 6h14M1-1c-3 4-3 10 0 14c3-4 3-10 0-14"/>`,
  // The attacker: a hooded figure behind a laptop, face in shadow.
  attacker: `<path class="hw-body hw-threat" d="M-27 19c0-10 7-15 15-17h24c8 2 15 7 15 17z"/>
    <path class="hw-body hw-threat" d="M0-24c-10 0-16 8-16 18 0 5 2 9 4 11h24c2-2 4-6 4-11 0-10-6-18-16-18z"/>
    <path class="hw-face" d="M0-16c-6 0-9 5-9 10 0 4 3 7 9 7s9-3 9-7c0-5-3-10-9-10z"/><path class="hw-glint" d="M-5-5h3.5M1.5-5h3.5"/>
    <rect class="hw-body" x="-17" y="2" width="34" height="14" rx="2"/><path class="hw-body" d="M-22 16h44l-2 3h-40z"/><circle class="hw-led" cx="0" cy="9" r="1.6"/>`,
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
