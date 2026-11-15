# Diagram standard: devices in a room

The owner approved this on 12 November 2026, from the DHCP mission prototype, as the standard for every diagram on the site that shows devices and the traffic between them. It sits beside the other visual standards, which stay as they are: realistic emails (`static/js/mail.js`), tickets and team chat (`static/js/desk.js`), command lines and logs in their own terminal look, dashboards, and the photographs (`docs/image-style.md`).

The idea in one line: **the hardware stands in a dark room under one light; it is not an icon in a box on a chart.**

## The rules
1. **No cards.** A device is drawn on the floor with a soft shadow under it. Its name sits underneath in small spaced capitals; an address and one status line may follow. Nothing has a rounded rectangle round it.
2. **The devices are the subject.** Draw them large (about twice the old card size) and keep the room to what stands in it: no dead floor.
3. **Cables lie on the floor.** A cable is a curve, never right-angled, and it plugs in behind the device's body so its end is hidden. Between two devices in one column it swings to the side, clear of the labels under the upper one.
4. **Traffic rides the cable.** A packet is a small dark slab with a teal edge. It carries no words. The cable glows while a packet is on it and the device it reaches blinks once.
5. **Words go in a caption.** What is moving is named in one line under the scene. A small tag may appear on the packet on hover or keyboard focus. Speech stays in bubbles, and bubbles keep off the cables.
6. **State shows on the device.** A machine that is talking lights its screen and LEDs; working is green, a problem is red, a warning amber. The status line stays as well: nothing may depend on colour alone.
7. **Show the result on the thing itself** where there is one: the PC shows the address it was given on its own screen.
8. **One light, dark in both themes.** The room is the same dark room in light theme, and carries its own fixed colours rather than the page's. No neon, no second accent light, no extra panels.
9. **Notes go below.** The "Simulation" note and other disclaimers sit under the scene, not on it.
10. **Phones keep the desktop arrangement**, as the card pictures do: the same picture, scaled down, with its words drawn larger and its rows spread a little so nothing touches. Speech goes in a strip under the picture, named by speaker, instead of bubbles over it.
11. **Access stays.** Every scene keeps its text version, screen-reader labels, keyboard access to anything clickable, a 44 px touch target on packets, no sideways scroll at 390 px, and stillness under reduced motion.

## Where it is done
- All four missions (`content/missions/*.json`, `"scene": "room"`; `static/js/missions/ui.js`, cable geometry in `layout.js`; styles under "Mission room scene" in `src/site.css`).
- The networking lesson's route (`mountRoute` in `static/js/flow.js`). The address is the lesson, so a fixed address card sits above the room; the slab on the cable carries no words and stops at the device the packet is at. The figure is one height on every step: each step's card and caption are drawn stacked in one grid cell and only the current one shows, so there is no measured min-height. The old-address line is always reserved. Measured equal at every step in both themes at 1280 and 390 px.

- The network builder (`static/js/net/view.js`, styles under `.nb-canvas`). Two things differ on purpose. Each network keeps its own colour, because which network a device is in is what the lab teaches: a PC stands in a pool of light in its network's colour, and the cables carry one coloured wire per network on a dark bed. And cables are straight, because devices are dragged around and trunks are bundles.

- The topologies lab (`static/js/labs/topology.js`, styles under `.tp-room`). A device's state (working, cut off, failed, the target, a single point of failure) is a ring of light on the floor under it, and its label says the same for screen readers. Cables are straight because the shape of the network is the lesson.

- "How an app talks to the internet", both labs (`static/js/labs/journey.js`, styles under `.jr-svg`): every stop's picture. Zones (a home network, a private subnet) are faint dashed markings on the floor, not panels. The sequence charts in the TCP and WebSocket stops are charts, and stay charts.

- The TCP handshake and Telnet vs SSH labs (`.stage-box.room-box`, a reusable opt-in for small pictures; `.room-shadow` under each device). Their packets keep a short tag, because the words are the lesson: SYN and ACK, and what a sniffer can read.

- The subnet calculator's network picture (styles under `.sc-net`).
- The Agency client map (`static/js/agency/infra.js`, styles under `.infra-map`): each asset is the site's own hardware drawing standing on the floor with its name underneath. Shift files still name nodes by a generic icon name, so no vendor is implied; `DRAWING` in `infra.js` says which drawing stands in for each. The way in is red, the SOC's console has a lit screen.

## Still to bring up to it
Checked 12 November 2026. Each of these draws devices its own way:
- The home hero's device row. Not touched: the owner's standing instruction is that the home page stays as it is.
  Tried and rejected (15 November 2026): a room scene in place of the hero photo (branch `design/home-scene`). The owner felt it lost the premium feel: the hero sells mood, and simple device line art blown up to half the hero reads as clip art. Keep the photo hero; room diagrams belong where they teach.

Do them one engine at a time, each behind a browser check at desktop and 390 px in both themes, and tick them off here.

## What is not a device diagram
Leave these alone: emails, tickets, chat, terminals, log viewers, the OSI stack, charts, the firewall rule gauntlet, the phone call, the Port Corridor. They have their own looks.
