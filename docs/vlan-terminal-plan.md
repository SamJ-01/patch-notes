# VLAN lab and terminal improvements: Claude handoff

This is a requested development plan for Claude. Keep work on `preview`; do not deploy or change production. The screenshot is from `#lab-vlans` at the 12-objective VLAN lab, part-way through configuration.

## 1. Reuse long CLI work after the first successful run

### Problem seen

The learner is asked to create and name the same VLANs on S1, S2 and S3. This is useful once, but repeating a long, already-understood sequence can turn a networking lesson into typing practice. Objective 5 is the first clear candidate.

### Current behaviour

- `static/js/labs/vlan.js` creates a fresh `createNet()` and per-device command history for the mounted lab. Arrow Up/Down recalls history only on the currently selected device and only for this visit.
- The UI has a “Show a hint” control, but no command insertion or reuse control.
- Completed objective IDs are reported through lab progress, but the CLI sequence itself is not retained.

### Requested improvement

After the learner completes an objective using the CLI once, offer a small **Reuse my commands** or **Fill command** action on that objective. It should insert the previously successful command or next line of the proven sequence into the selected device's command field. The learner reviews/edits it and presses Enter; never execute a command automatically. This should make it easy to repeat VLAN creation/naming on S2 and S3 without skipping the first learning attempt.

For multi-line sequences, insert one line at a time and show which device each line is intended for. Do not fill unrelated commands such as `ping` into a switch configuration submode. It may be better to prefill per-device recipes from the learner's successful command history than to replay all commands from one switch on another.

The first version may reuse commands across devices during the current lab session. If “already done it once” is intended to include a later visit, persist only bounded, validated per-lab command snippets under the existing progress model. Add cleaning/migration tests and avoid storing arbitrary terminal output or secrets. A task being marked complete must not auto-run a command or make a wrong topology appear correct.

## 2. Make command abbreviations OS-accurate across terminal experiences

Inventory every simulated command surface before implementation. Current code indicates:

- Cisco IOS on switches/routers in `static/js/labs/vlan.js` already accepts unique command prefixes such as `sh vl br` and `conf t`; Tab completion is present and tests cover ambiguous/unique abbreviations. `netbuilder.js` uses the same network/CLI model.
- The VLAN lab also emulates Windows `C:\>` commands. Keep Windows command behavior accurate; do not apply IOS prefix rules to it.
- The Linux shell in `static/js/labs/terminal.js`, the permissions terminal in `static/js/labs/perms.js`, the networking-tools shell in `static/js/labs/nettools.js`, and any command prompts inside missions need their own review. They are not all the same shell and should not silently inherit Cisco parsing rules.

Add realistic, platform-specific abbreviations and aliases where the real shell supports them, with help text, Tab completion and ambiguity/error feedback consistent with that environment. Do not blindly accept every command prefix: real Linux and Windows shells do not generally treat arbitrary truncated command names as aliases. Common real aliases/shorthands may be offered explicitly (and labelled if they are configured conveniences). Keep quoting, pipes, options, command history and current-mode behavior coherent. Add parser tests for each terminal family, including ambiguous input and commands that must remain invalid.

The screenshot also shows `ping` entered at `S1(config-vlan)#`. That is the switch's VLAN-configuration submode; `ping` is not valid there. Improve the experience with a clear next step in hint/feedback (for example, `end` to return to privileged EXEC, then select the PC console to run Windows `ping`). Do not accept `ping` from the wrong device/mode merely to hide the issue. The learner should understand device and prompt context.

## 3. Make VLAN membership colour visibly change as configuration changes

### Current state: partly implemented

`static/js/net/view.js` already recalculates network segments on each diagram render and colours switch links plus the PC plate outline by broadcast-domain segment. `static/js/net/model.js` derives membership from VLANs and trunk state. The VLAN lab calls `drawDiagram()` after every command. Thus the requested live relationship exists in the model and is partly visible, but a thin outline can be too subtle to teach the concept at a glance.

### Requested improvement

- Make the PC's segment colour more visible (for example a restrained tinted device plate, stripe or VLAN badge as well as the outline), keeping text and device artwork legible in dark and light themes.
- Keep the same segment colour on PCs in the same connected VLAN across correctly configured trunks; show a different colour when they are in distinct broadcast domains. If trunk configuration breaks continuity, the picture should reflect the actual separated segments rather than simply matching VLAN ID numbers.
- Add a visible legend that pairs each colour with the VLAN/segment name and member devices. Retain textual membership so colour is never the only signal; check colour contrast and colour-vision accessibility.
- Update immediately after access VLAN, voice VLAN, trunk, native VLAN, allowed VLAN, link or shutdown changes. Respect multiple memberships for IP-phone/data and voice VLANs instead of implying a PC can only belong to one network.
- In the VLAN lab, use an explicit visual transition or status message when a PC changes segment, but keep animation optional/reduced-motion aware. Do not let visual state claim connectivity: pings and the model remain authoritative.

## Suggested order and verification

1. Improve the current diagram visibility and test that the colors follow the actual model after S1/S2/S3 configuration, including before trunks, after trunks, a mismatched native VLAN, an excluded allowed VLAN and the phone voice VLAN.
2. Add post-success command reuse for repeated VLAN setup. Verify it pre-fills but never executes, works across S1/S2/S3, does not incorrectly replay device-specific commands, and cannot mark an objective complete by itself.
3. Audit all command-line UIs and create a per-platform abbreviation/alias table. Implement the gaps with pure parser tests and terminal UI coverage. Preserve Cisco IOS behavior already tested; improve Windows/Linux realism without making all emulators accept the same syntax.
4. Verify with `node --test tests/vlan.test.mjs tests/intervlan.test.mjs tests/netmodel.test.mjs`, the full Python and JavaScript suites, offline build, smoke test and desktop/390 px browser checks. Check dark/light themes, keyboard input, screen-reader names, reduced motion and the visible prompt/context. Record results and commit references in this file.

## Acceptance checks

- A long repeated configuration sequence can be inserted after its first successful use, reviewed and edited, then run manually on another intended switch.
- The feature never auto-executes, bypasses checks, changes the topology or completes an objective merely because text was inserted.
- Every terminal has documented, tested, platform-specific shorthand behavior; ambiguity and wrong-mode feedback remain understandable.
- A learner can see at a glance which PCs share a broadcast domain and how the topology changes as they configure VLANs/trunks. Text and color both communicate the grouping.
- Current code's existing VLAN color and IOS abbreviation behavior are retained where already correct, not replaced with a duplicate implementation.
- Changes stay on `preview`; no production deploy or infrastructure change without explicit approval.
