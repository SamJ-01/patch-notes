// Patch: the site's guide. A little terminal that came alive, drawn in the same 3/4 house style as the device
// library (hw.js): lit top, shaded side, colours from CSS tokens so both themes and reduced motion just work.
// Its identity is built from the brand's own parts, not a generic mascot: the head is a terminal screen, the eye
// is the blinking caret, the antenna is the // from PATCH//NOTES, and the chest wears the + changelog patch plate.
// build.py inlines this file into the page (minus "export"), like hw.js and mail.js, so PATCH is always available.
// PATCH.svg(pose, { size, live, id }) returns one <svg>. Poses: idle, happy, think, point, talk.

// A rounded box seen in 3/4: the shaded side and lit top sweep up-right by d, then the front face on top.
const pnBox = (x, y, w, h, r, d = 7) =>
  `<path class="pn-body pn-side" d="M${x + w} ${y + r}l${d} -${d}v${h - 2 * r}l-${d} ${d}z"/>` +
  `<path class="pn-body pn-top" d="M${x + r} ${y}l${d} -${d}h${w - 2 * r}l-${d} ${d}z"/>` +
  `<rect class="pn-body" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;

// What goes on the screen, per mood: the eyes and the mouth. The blinking caret and prompt are always there.
function face(pose) {
  const eyes = {
    idle: `<rect class="pn-eye" x="-24" y="-33" width="11" height="15" rx="3"/><rect class="pn-eye" x="13" y="-33" width="11" height="15" rx="3"/>`,
    talk: `<rect class="pn-eye" x="-24" y="-33" width="11" height="15" rx="3"/><rect class="pn-eye" x="13" y="-33" width="11" height="15" rx="3"/>`,
    point: `<rect class="pn-eye" x="-20" y="-33" width="11" height="15" rx="3"/><rect class="pn-eye" x="17" y="-33" width="11" height="15" rx="3"/>`,
    happy: `<path class="pn-arc" d="M-24 -22q5.5 -12 11 0"/><path class="pn-arc" d="M13 -22q5.5 -12 11 0"/>`,
    wave: `<path class="pn-arc" d="M-24 -22q5.5 -12 11 0"/><path class="pn-arc" d="M13 -22q5.5 -12 11 0"/>`,
    think: `<rect class="pn-eye" x="-18" y="-34" width="9" height="12" rx="3"/><rect class="pn-eye" x="17" y="-34" width="9" height="12" rx="3"/>`,
  }[pose] || "";
  const mouth = {
    idle: `<path class="pn-mouth" d="M-11 -10q11 7 22 0"/>`,
    happy: `<path class="pn-mouth" d="M-14 -12q14 12 28 0"/>`,
    wave: `<path class="pn-mouth" d="M-14 -12q14 12 28 0"/>`,
    think: `<path class="pn-mouth" d="M-6 -9h12"/>`,
    point: `<path class="pn-mouth" d="M-11 -10q11 7 22 0"/>`,
    talk: `<rect class="pn-eye" x="-8" y="-13" width="16" height="9" rx="4"/>`,
  }[pose] || "";
  const think = pose === "think" ? `<g class="pn-think"><circle cx="30" cy="-24" r="2.4"/><circle cx="37" cy="-30" r="3"/><circle cx="46" cy="-37" r="3.6"/></g>` : "";
  return eyes + mouth + think;
}

// The right arm: resting at the side, raised to point, or raised to wave (the same raised arm, animated by CSS).
function arm(pose) {
  if (pose === "point") return `<g class="pn-live-arm"><rect class="pn-body" x="33" y="14" width="12" height="30" rx="6" transform="rotate(-42 39 20)"/><circle class="pn-body" cx="62" cy="-2" r="7"/></g>`;
  if (pose === "wave") return `<g class="pn-wave-arm"><rect class="pn-body" x="33" y="14" width="12" height="30" rx="6" transform="rotate(-42 39 20)"/><circle class="pn-body" cx="62" cy="-2" r="7"/></g>`;
  return `<rect class="pn-body" x="35" y="16" width="12" height="30" rx="6"/>`;
}

const PATCH = {
  svg(pose = "idle", { size = 120, live = true, id = "pn" } = {}) {
    const g = `${id}-sheen`;
    return `<svg class="patch${live ? " pn-live" : ""}" viewBox="-70 -84 140 172" width="${size}" height="${Math.round(size * 172 / 140)}" role="img" aria-label="Patch, the Patch Notes guide">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--hw-top)"/><stop offset="1" stop-color="var(--hw-bot)"/></linearGradient></defs>
      <ellipse class="pn-shadow" cx="0" cy="72" rx="42" ry="7"/>
      <g style="fill:url(#${g})">
        <!-- antenna: the // from the wordmark, tipped with amber -->
        <path class="pn-ant" d="M-15 -52l9 -18"/><path class="pn-ant" d="M-1 -52l9 -18"/>
        <circle class="pn-dot" cx="-6" cy="-70" r="3.6"/><circle class="pn-dot" cx="8" cy="-70" r="3.6"/>
        <!-- left arm (behind body), then body, then head screen on top -->
        <rect class="pn-body" x="-47" y="16" width="12" height="30" rx="6"/>
        ${arm(pose)}
        <rect class="pn-body" x="-23" y="48" width="16" height="12" rx="3"/><rect class="pn-body" x="7" y="48" width="16" height="12" rx="3"/>
        ${pnBox(-34, 10, 68, 44, 13)}
        <rect class="pn-plate" x="-16" y="22" width="32" height="22" rx="6"/>
        <rect class="pn-plus" x="-2.5" y="25" width="5" height="16" rx="1"/><rect class="pn-plus" x="-10" y="30.5" width="20" height="5" rx="1"/>
        <rect class="pn-body" x="-9" y="4" width="18" height="9" rx="2"/>
        ${pnBox(-46, -52, 92, 58, 14)}
        <rect class="pn-screen" x="-38" y="-44" width="76" height="44" rx="9"/>
        <g>${face(pose)}</g>
        <path class="pn-prompt" d="M-34 -16l4 4l-4 4"/><rect class="pn-caret" x="-24" y="-13" width="12" height="4" rx="1"/>
      </g>
    </svg>`;
  },
};

export { PATCH };
