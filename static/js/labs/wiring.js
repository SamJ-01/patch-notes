// Build an Ethernet cable: arrange the 8 wires into an RJ45 connector in the right order, learn the two
// standards (T568A/T568B) and what makes a cable straight-through or crossover.
// checkWiring()/cableType() are pure (tested in tests/labs.test.mjs); mount() is the on-page interactive.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The eight conductors in a twisted-pair cable (four pairs). "striped" ones are the white-striped half of a pair.
export const WIRES = {
  wo: { name: "White / Orange", colour: "#E8820C", striped: true },
  o: { name: "Orange", colour: "#E8820C" },
  wg: { name: "White / Green", colour: "#2F9E44", striped: true },
  g: { name: "Green", colour: "#2F9E44" },
  bl: { name: "Blue", colour: "#1971C2" },
  wbl: { name: "White / Blue", colour: "#1971C2", striped: true },
  wbr: { name: "White / Brown", colour: "#8B5A2B", striped: true },
  br: { name: "Brown", colour: "#8B5A2B" },
};
// Pin 1 → 8, left to right, clip facing away.
export const T568B = ["wo", "o", "wg", "bl", "wbl", "g", "wbr", "br"];
export const T568A = ["wg", "g", "wo", "bl", "wbl", "o", "wbr", "br"];
const STANDARDS = { T568B, T568A };

// Which pins match the target standard, and whether the whole arrangement is correct.
export function checkWiring(arrangement, standard) {
  const target = STANDARDS[standard];
  const perPin = target.map((w, i) => arrangement[i] === w);
  return { perPin, correct: perPin.every(Boolean) && arrangement.filter(Boolean).length === 8 };
}
// What standard an arrangement matches, if any.
export function matchesStandard(arrangement) {
  for (const s of Object.keys(STANDARDS)) if (checkWiring(arrangement, s).correct) return s;
  return null;
}
// Given the two ends' standards, what kind of cable it is and what it's for.
export function cableType(endA, endB) {
  if (!endA || !endB) return null;
  if (endA === endB) return { type: "Straight-through", use: "The normal cable: PC to switch, or switch to router." };
  return { type: "Crossover", use: "Connects two of the same kind directly: PC to PC, or switch to switch. Modern ports auto-detect, so these are rare now, but the exam still asks." };
}

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const done = new Set(solved);
  let standard = "T568B";
  let slots = Array(8).fill(null);     // the 8 pins, each a wire id or null
  let held = null;                      // the wire colour currently picked up

  root.innerHTML = `<div class="wire-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="row osi-progress" id="w-parts"></div>
    <section class="panel">
      <div class="panel-title"><h2>Wire the connector to <span id="w-std-name">${standard}</span></h2>
        <div class="row" role="group" aria-label="Wiring standard">
          <button class="chip" data-std="T568B" aria-pressed="true">T568B</button>
          <button class="chip" data-std="T568A" aria-pressed="false">T568A</button></div></div>
      <p class="muted" id="w-help">Pick up a wire from the tray, then click a pin to place it. Click a filled pin to take the wire back.</p>
      <div class="rj45" role="group" aria-label="RJ45 connector, pins 1 to 8">
        <div class="rj45-body"><div class="rj45-pins" id="w-pins"></div></div>
        <div class="rj45-clip"></div>
      </div>
      <div class="wire-tray" id="w-tray" role="group" aria-label="Wire tray"></div>
      <div class="row"><button class="btn brand" id="w-check" type="button">Check the wiring</button><button class="btn ghost" id="w-reset" type="button">↺ Clear</button></div>
      <p class="wire-result" id="w-result" aria-live="polite"></p>
    </section>
    <section class="panel"><div class="panel-title"><h2>Straight-through or crossover?</h2></div>
      <p class="muted">Both ends wired the same way (both B, or both A) makes a <b>straight-through</b> cable for connecting different devices, like a PC to a switch. One end A and the other B makes a <b>crossover</b> cable for two of the same device. Reference order:</p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Pinout reference"><table class="wire-table"><thead><tr><th>Pin</th>${[1,2,3,4,5,6,7,8].map(n => `<th>${n}</th>`).join("")}</tr></thead>
        <tbody><tr><th>T568B</th>${T568B.map(w => `<td>${swatch(w)}</td>`).join("")}</tr><tr><th>T568A</th>${T568A.map(w => `<td>${swatch(w)}</td>`).join("")}</tr></tbody></table></div>
    </section>
  </div>`;
  const $ = id => root.querySelector("#" + id);

  function swatch(w, small = true) {
    const c = WIRES[w];
    const bg = c.striped ? `repeating-linear-gradient(135deg, ${c.colour} 0 6px, #fff 6px 10px)` : c.colour;
    return `<span class="w-swatch${small ? " sm" : ""}" style="background:${bg}" title="${esc(c.name)}"></span>`;
  }
  function drawParts() {
    const parts = [["b", "Wire a T568B end"], ["a", "Wire a T568A end"]];
    $("w-parts").innerHTML = parts.map(([k, t]) => `<span class="pchip">${done.has(k) ? "✓" : "○"} ${esc(t)}</span>`).join("");
  }
  function markPart(k) { if (done.has(k)) return; done.add(k); onPart(k); drawParts(); if (done.has("a") && done.has("b")) onComplete(); }

  function drawPins() {
    $("w-pins").innerHTML = slots.map((w, i) => `<button type="button" class="rj45-pin${w ? " filled" : ""}" data-pin="${i}"
      aria-label="Pin ${i + 1}${w ? `: ${WIRES[w].name}` : ", empty"}">
      ${w ? `<span class="w-wire" style="background:${WIRES[w].striped ? `repeating-linear-gradient(0deg, ${WIRES[w].colour} 0 5px, #fff 5px 8px)` : WIRES[w].colour}"></span>` : ""}
      <span class="rj45-num">${i + 1}</span></button>`).join("");
  }
  function drawTray() {
    $("w-tray").innerHTML = Object.keys(WIRES).map(w => {
      const used = slots.includes(w);
      return `<button type="button" class="w-chip${held === w ? " held" : ""}${used ? " used" : ""}" data-wire="${w}" ${used ? "disabled" : ""} aria-pressed="${held === w}">
        ${swatch(w, false)}<span>${esc(WIRES[w].name)}</span></button>`;
    }).join("");
  }
  const say = (msg, cls = "") => { $("w-result").className = `wire-result ${cls}`; $("w-result").innerHTML = msg; };

  function place(pin) {
    if (slots[pin]) { held = held || slots[pin]; slots[pin] = null; }  // take the wire back (hold it if hands were empty)
    else if (held) { slots[pin] = held; held = null; }
    drawPins(); drawTray();
  }

  $("w-pins").addEventListener("click", e => { const b = e.target.closest("[data-pin]"); if (b) { place(Number(b.dataset.pin)); b.focus(); } });
  $("w-tray").addEventListener("click", e => { const b = e.target.closest("[data-wire]"); if (!b || b.disabled) return; held = held === b.dataset.wire ? null : b.dataset.wire; drawTray(); });
  root.querySelector('[data-std="T568B"]').parentElement.addEventListener("click", e => {
    const b = e.target.closest("[data-std]"); if (!b) return;
    standard = b.dataset.std; $("w-std-name").textContent = standard;
    root.querySelectorAll("[data-std]").forEach(x => x.setAttribute("aria-pressed", x === b));
    say("");
  });
  $("w-check").addEventListener("click", () => {
    const filled = slots.filter(Boolean).length;
    if (filled < 8) return say(`${8 - filled} pin${8 - filled === 1 ? "" : "s"} still empty. Fill all eight, then check.`, "no");
    const res = checkWiring(slots, standard);
    root.querySelectorAll(".rj45-pin").forEach((p, i) => p.classList.toggle("wrong", !res.perPin[i]));
    if (res.correct) {
      markPart(standard === "T568B" ? "b" : "a");
      const other = matchesStandard(slots);
      say(`<b class="ok">Correct — that's a valid ${standard} end.</b> ${done.has("a") && done.has("b") ? "You've now wired both standards. A cable with the same standard on both ends is straight-through; mixing them makes a crossover." : `Now try the other standard (${standard === "T568B" ? "T568A" : "T568B"}).`}`, "ok");
    } else {
      const m = matchesStandard(slots);
      say(m ? `<b class="no">Not ${standard}.</b> This order is actually a valid <b>${m}</b> end. Switch the standard above, or rearrange.` : `<b class="no">Not quite.</b> The pins marked red don't match ${standard}. Use the reference table below.`, "no");
    }
  });
  $("w-reset").addEventListener("click", () => { slots = Array(8).fill(null); held = null; drawPins(); drawTray(); say(""); root.querySelectorAll(".rj45-pin.wrong").forEach(p => p.classList.remove("wrong")); onReset(); });

  drawParts(); drawPins(); drawTray();
}
