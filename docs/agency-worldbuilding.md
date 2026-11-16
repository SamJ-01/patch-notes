# PATCH//AGENCY worldbuilding and technology naming

**House rule: fictional organisations, real technologies, realistic attacks, simulated evidence.**

PATCH//AGENCY is a fictional SOC simulation. The clients, staff, contact details, incidents, activity and evidence are invented for training. Product names should remain real when the scenario's evidence supports them.

## 1. What stays fictional

- Client organisations, suppliers, employees, analysts, internal team names and incident storylines.
- Client domains and email addresses. Use reserved `.example` domains, not real organisations' domains.
- Network addresses in evidence. Use documentation-only IPv4 ranges such as `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24`.
- Hosts, tenant names, bucket names, usernames, keys, tickets and records are fictional scenario data.
- Do not imply that a real company, customer or named person experienced a simulated breach.

The recurring provider **Lanternfield Security Operations** is fictional. All four current client organisations are fictional.

## 2. What should be real

Use accurate, recognisable names for operating systems, protocols, cloud platforms, security products, commands, log sources and event names when the scenario actually uses them. These are useful learning signals and should not be replaced with invented equivalents.

Examples grounded in the current shifts:

| Shift | Real technology to retain | What remains generic or fictional |
|---|---|---|
| 01 · Pellow & Finch Logistics | Ubuntu 22.04, OpenSSH, nginx | VPN and SIEM sign-in export are generic; no identity-provider vendor is established |
| 02 · Fernhollow Veterinary Group | Microsoft 365 mailbox operations and email format | Client, staff and supplier are fictional; SIEM export is simplified |
| 03 · Halstead & Rowe | Windows tools and Veeam backup | EDR/SIEM timeline format is generic; client and hosts are fictional |
| 04 · Wrenfield & Co | AWS CloudTrail event names, Amazon S3 bucket operations, sqlmap | Web/WAF and application exports are generic; WAF vendor is not identified |

Do not invent a vendor attribution just because a capability is common. For example, do not call a generic EDR export Microsoft Defender or CrowdStrike unless the scenario's content explicitly identifies that product. Similarly, do not call a generic VPN, SIEM or WAF a named vendor product without evidence.

## 3. Naming rules for infrastructure maps

(The client-file map was replaced on 16 November by source cards built from each shift's `sources`; these rules still apply to source names and any future diagram.)

1. **Name the actual platform where known.** Use `Microsoft 365` for Shift 02. Use `Amazon S3` for Shift 04 because its cloud evidence is explicitly modelled on AWS CloudTrail, `ListBucket`/`GetObject` events and an AWS-style `AKIA` access key.
2. **Keep generic components generic.** Use labels such as `VPN`, `EDR / SIEM`, `Web app` or `WAF` when no vendor is supported.
3. **Use real product names in the supporting node detail.** Shift 03's backup node can remain the fictional host `BACKUP02`, while its sublabel identifies the real Veeam backup software.
4. **Never sacrifice correctness to fit a box.** Adjust the map's layout, available text width, type size or label wrapping. Do not truncate, misspell or replace a real product name with a made-up brand to solve a layout problem.
5. **Use neutral line icons.** Product names in text are enough; do not add third-party logos or imply endorsement.
6. **Keep the map, caption, client notes and log descriptions consistent.** A named platform in one place should not become a different vendor elsewhere in the same shift.

## 4. How to describe simulated evidence

- Say clearly when logs are generic SIEM exports, simplified or written for the shift.
- Preserve authentic command names, event names, file paths and operating-system formats where they are part of the learning objective.
- Separate real product behaviour from fictional tenant values and scripted events.
- When a scenario deliberately combines multiple vendors, say so and make the integration explicit.
- Keep the distinction between a real attack technique and a fictional incident clear.

## 5. Adding a new client or shift

Before adding vendor names, confirm each proposed product from the scenario's configuration, source descriptions, command output or audit-event vocabulary. Record the evidence in the shift's `simplification` note or `notes` source. If the provider is not established, use a neutral label until the scenario is designed to teach that product.

Each new shift should define:
- A fictional client profile, staff, suppliers and documentation-safe domain names.
- A coherent, documented technology stack.
- The real formats/tools being simulated and what has been simplified.
- A consistent infrastructure map, client notes, log names and event vocabulary.
- Explicit wording that the people, organisations and incident are fictional.
