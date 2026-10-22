# Missions: the slate

Missions are Patch Notes' main draw. Each one is a scenario file in `content/missions/` running on the shared engine (`static/js/missions/`): devices, messages, tools, a goal, a root-cause question and an evidence check. A new mission is mostly writing and fact-checking, not code. Missions are listed here in build order; each one should reuse the engine as it is, or add one small, tested ability that later missions also need.

## How a mission earns its place

- It makes something invisible visible (packets, state, trust) and lets the learner change it.
- Guided, Practice and Challenge all come from one scenario.
- The Challenge has a real root cause, believable wrong turns (a tempting workaround, a symptom that looks like evidence) and an evidence check.
- Every tool output, field and Wireshark line is accurate, and anything simplified says so.

## Networking track (the engine already supports these)

| # | Mission | What it teaches | Challenge | Engine needs |
|---|---|---|---|---|
| 1 | **Where do IP addresses come from?** ✅ | DHCP: Discover, Offer, Request, Acknowledge; broadcasts; 169.254 addresses | DHCP service stopped; fixed IP is the workaround | — |
| 2 | **Why won't the intranet load?** | DNS lookups, the default gateway, the TCP three-way handshake, DNS caching | Stale DNS record after a server move; hosts-file workaround; flush the cache | Network zones on the diagram; "next mission" link |
| 3 | **Who has 192.168.1.1?** | ARP: how a PC finds the gateway's MAC address; ARP tables | ARP spoofing: two MACs claim the gateway, traffic detours via an attacker | A device that intercepts traffic (packets that change route) |
| 4 | **Open, closed or filtered?** | Ports and services: what SYN → SYN-ACK, SYN → RST and silence mean; how scanners read them | A firewall rule blocks a service; tell "closed" from "filtered" | Firewall device with rules the learner edits |
| 5 | **Getting out to the internet** | Routing tables and NAT: private vs public addresses | Missing default route on the router | Router tables shown in the inspector |
| 6 | **Is this site really my bank?** | DNS + TLS: certificates, names, trust warnings | A lookalike domain and a certificate mismatch | Certificate inspector panel |

## Security track (uses the log viewer, built for mission 7)

These are investigations of logs and timelines rather than packet journeys. They need one new reusable piece: a log or timeline viewer the learner can filter, with findings that feed the existing evidence check.

| # | Mission | What it teaches |
|---|---|---|
| 7 | **The 3am logins** ✅ | SSH brute force in `auth.log`: failed vs accepted logins, source IPs, containment (session, account, key-only SSH) vs just blocking the IP. Introduced the log viewer: `scenario.log` (lines + findings) searched with `engine.searchLog` |
| 8 | **Which email was it?** ✅ | Phishing triage: three reported emails (a real supplier, a spoof of the firm's own domain that failed DMARC, a lookalike domain that passed everything), Postfix/Dovecot/Squid logs, who clicked, containment order (purge everywhere, block, reset, then end sessions). Introduced the email inspector: `scenario.emails` (raw headers, body, links, findings) read with `engine.parseHeaders`, `engine.linkFacts` and `engine.inspectEmail` |
| 9 | **Who can read this file?** ✅ (built as a lab) | Linux permissions and ownership (`rwx`, `chmod`, groups); the over-shared secret |
| 10 | **The night the files changed** | Ransomware first response: timeline, patient zero, isolate vs shut down |

After mission 7 comes **PATCH//AGENCY** (`docs/agency-pilot.md`): a whole SOC shift of alerts built from the same log search, evidence check and rules.

## How networks are drawn

Any diagram of a network should come from `static/js/net/model.js` and `static/js/net/view.js`: one colour per broadcast domain, links as bundles of the domains they carry, and a legend that says who's in each. That keeps the picture honest (it's computed, not drawn by hand) and the same everywhere.

## Rules for writing one

1. Start from the root cause and its evidence, then design the wrong turns.
2. Write tool output the way the real tool prints it (Windows or Linux, say which) and keep it consistent with device state.
3. Give every message plain-language fields (level 1) and protocol fields (level 2), plus a Wireshark view where packets are involved.
4. Add the scenario's tests: guided order, practice checkpoints, the challenge's right path, the workaround, and the evidence check.
5. Run the layout tests: cards, zones and room for speech bubbles at phone and desktop widths.

## Labs (self-contained, one module each in `static/js/labs/`)

| Lab | Module | What it teaches |
|---|---|---|
| **The OSI model, layer by layer** ✅ | `osi.js` | Encapsulation down and up the stack, each layer's job, PDU, devices and protocols, mnemonics, TCP/IP mapping; a sorting game including real problems |
| **Network topologies: break them** ✅ | `topology.js` | Star, bus, ring, full/partial mesh, hub and spoke, spine and leaf, three-tier; break cables or devices; single points of failure computed from the graph |
| **Linux terminal basics** ✅ | `terminal.js` | `pwd`, `whoami`, `ls -a/-l`, `cd`, `cat`, `grep`, `find`, `chmod`, `mkdir`, `touch`, `rm`, pipes into `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, and running scripts over a simulated file system; 11 objectives |
| **Ports and protocols** ✅ | `ports.js` | 24 flip cards for the Network+ port list, insecure-to-secure pairs, and a 12-question drill (port, protocol, TCP/UDP, secure swap) |
| **Subnetting trainer** ✅ | `subnet.js` | Live binary view of the network/host split, mask, network, broadcast, host range and block size; typed practice with worked answers |
| **Who can read this file? Linux permissions** ✅ | `perms.js` | People, groups and files on a server; click rwx bits or type chmod/chown; every person's read/change/run worked out live as the kernel does (one class applies, x on every folder, root's rules), cross-checked against a real kernel, GNU chmod and ls |
| **Hashing: fingerprints, MD5, SHA-1 and passwords** ✅ | `hashing.js` | Live MD5 (own RFC 1321 code), SHA-1 and SHA-256; the avalanche effect; checking a download against its SHA-256; why MD5 and SHA-1 are retired (collisions, Flame, SHAttered); fast vs slow hashing measured in the browser (PBKDF2, OWASP's 600,000 rounds); a fictional leaked table unsalted then salted; storing passwords properly |
| **Network builder** ✅ | `netbuilder.js` on `net/model.js` + `net/view.js` | Packet-Tracer-style sandbox: add, drag and cable PCs, switches and routers; set IPs, VLANs, trunks and router subinterfaces with forms or IOS; every broadcast domain in its own colour, live; who can reach whom and why not; four goals; saved in the browser |
| **VLANs: one network, kept apart** ✅ | `vlan.js` | Three simulated Cisco 2960s (IOS commands, abbreviations, `?`, real error and log messages) and six Windows PCs: `show vlan brief`, create and name VLANs, access and voice ports (`mls qos trust cos`), why VLANs don't cross untrunked links (DTP), 802.1Q trunks, native VLAN mismatch. Covers the Packet Tracer "VLAN Configuration" activity and its fix |
| **One request, start to finish** ✅ | `journey.js` | One made-up ride app (Hopper) through seven stops: HTTP request and response (real HTTP/1.1, status codes), TCP vs UDP (lose segments; cumulative ACKs, fast retransmit, timeout; header layouts), HTTPS (what an eavesdropper captures with and without TLS; certificate name, authority and date checks with Chrome's error codes), load balancer (round robin, least connections, health checks), reverse proxy (nginx longest-prefix routing), firewall (first match, default deny; fix the rule order), WebSockets (polling vs the RFC 6455 upgrade). Each stop has a security angle |
| **Subnet calculator** ✅ (tool, `#subnet-calc/<ip>/<prefix>`) | `subnet.js` (`mountCalc`) | Live network diagram, class and address type, CIDR, masks, ranges, subnet map, binary AND, splitter; also embedded in the trainer |

Next for Network+ (Oct 2026 focus): hub vs switch vs router (MAC tables, collision and broadcast domains), inter-VLAN routing (router on a stick) on the VLAN lab's switches, spanning tree.
