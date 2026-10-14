// Mission Layout: the geometry of a mission stage, with no DOM code.
//
// Where cards go and how tall they are, how cables are routed, how status text wraps and where
// speech bubbles fit. Anything that needs real text measurement takes a `width(text)` function, so
// the browser passes in real font measurements and the tests pass in a simple estimate.

// Card spacing: padding, hardware drawing, gaps and the height of each text row.
export const CARD = { pad: 16, art: 46, gap: 10, name: 20, ip: 20, statusGap: 6, line: 16 };
// Used when a scenario has no layout of its own.
export const DEFAULT_WIDE = { w: 680, h: 320, dw: 172 };

// The layout to use: the scenario's portrait layout on narrow screens, if it has one.
export function chooseLayout(scenario, narrow) {
  return narrow && scenario.narrow ? { ...scenario.narrow, narrow: true } : { ...DEFAULT_WIDE, ...(scenario.wide || {}), narrow: false };
}

export function centerOf(scenario, layout, id) {
  if (layout.pos) return { x: layout.pos[id][0], y: layout.pos[id][1] };
  return { x: scenario.devices[id].x, y: scenario.devices[id].y };
}

// Every status text a device can show anywhere in the scenario, so its card is sized once and never jumps.
export function statusTexts(scenario, id) {
  const out = new Set([scenario.devices[id].status || ""]);
  const walk = o => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) k === `${id}.status` && typeof v === "string" ? out.add(v) : walk(v);
  };
  walk(scenario.messages); walk(scenario.modes);
  return [...out];
}

export const hasIp = (scenario, id) => "ip" in scenario.devices[id];
export const hasStatus = (scenario, id) => statusTexts(scenario, id).some(Boolean);

// Break text into lines no wider than maxW. Over maxLines, the last line ends with "…".
export function wrapLines(text, maxW, width, maxLines = 3) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean), lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (!line || width(next) <= maxW) line = next; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1] + "…";
    while (last.length > 1 && width(last) > maxW) last = last.slice(0, -2) + "…";
    lines[maxLines - 1] = last;
  }
  return lines;
}

// Card rectangles for every device. Each card holds a hardware drawing, a name, an IP row if the
// device has one, and as many status lines as its longest status needs. Cards with details on the same
// row share a height so their edges line up; name-only cards (a switch) stay compact.
// `top` is where the content starts, so it sits in the vertical middle of the card.
export function cardGeometry(scenario, layout, width) {
  const ids = Object.keys(scenario.devices);
  const inner = layout.dw - CARD.pad * 2;
  const content = {};
  for (const id of ids) {
    const lines = hasStatus(scenario, id) ? Math.max(1, ...statusTexts(scenario, id).map(t => wrapLines(t, inner, width).length)) : 0;
    content[id] = { lines, h: CARD.art + CARD.gap + CARD.name + (hasIp(scenario, id) ? CARD.ip : 0) + (lines ? CARD.statusGap + lines * CARD.line : 0) };
  }
  const detailed = id => hasIp(scenario, id) || hasStatus(scenario, id);
  const geo = {};
  for (const id of ids) {
    const c = centerOf(scenario, layout, id);
    const rowH = detailed(id)
      ? Math.max(...ids.filter(o => centerOf(scenario, layout, o).y === c.y && detailed(o)).map(o => content[o].h))
      : content[id].h;
    const h = rowH + CARD.pad * 2;
    geo[id] = { x: c.x - layout.dw / 2, y: c.y - h / 2, w: layout.dw, h, cx: c.x, cy: c.y, top: c.y - content[id].h / 2, lines: content[id].lines };
  }
  return geo;
}

// Network zones (e.g. "Office network 192.168.1.0/24"): a labelled area drawn behind the cards of the
// devices that share a network, sized to fit them with `pad` around and a label strip on top.
export const ZONE_LABEL = 22;
export function zoneRects(scenario, layout, geo) {
  const pad = layout.zonePad ?? 18;
  return (scenario.zones || []).map(z => {
    const cards = z.devices.map(id => geo[id]);
    const l = Math.min(...cards.map(c => c.x)) - pad, r = Math.max(...cards.map(c => c.x + c.w)) + pad;
    const t = Math.min(...cards.map(c => c.y)) - pad - ZONE_LABEL, b = Math.max(...cards.map(c => c.y + c.h)) + pad;
    return { label: z.label, devices: z.devices, x: l, y: t, w: r - l, h: b - t, labelBox: { x: l, y: t, w: r - l, h: ZONE_LABEL + 6 } };
  });
}

// Cables run at right angles: across then down when the gap is mostly sideways, otherwise down then across.
export function route(p, q) {
  if (p.x === q.x || p.y === q.y) return [p, q];
  if (Math.abs(q.x - p.x) > Math.abs(q.y - p.y)) { const mx = (p.x + q.x) / 2; return [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q]; }
  const my = (p.y + q.y) / 2;
  return [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
}

// An SVG path through the points, with each corner rounded.
export function roundedPath(pts, r = 12) {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const k = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const unit = (from, to) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: (to.x - from.x) / l, y: (to.y - from.y) / l }; };
    const d1 = unit(b, a), d2 = unit(b, c);
    d += ` L${b.x + d1.x * k},${b.y + d1.y * k} Q${b.x},${b.y} ${b.x + d2.x * k},${b.y + d2.y * k}`;
  }
  const z = pts[pts.length - 1];
  return d + ` L${z.x},${z.y}`;
}

// A packet's route to a device, ending just outside the card so the packet never covers its label.
// `half` is half the packet's size.
export function arrivalRoute(pts, card, half = { w: 50, h: 13 }, gap = 6) {
  const [p, q] = pts.slice(-2);
  const end = q.x === p.x
    ? { x: q.x, y: p.y < q.y ? card.y - half.h - gap : card.y + card.h + half.h + gap }
    : { x: p.x < q.x ? card.x - half.w - gap : card.x + card.w + half.w + gap, y: q.y };
  return [...pts.slice(0, -1), end];
}

// Rectangles are { l, t, r, b }. The +4 means rectangles closer than 4px also count as touching.
export const overlapArea = (a, o) =>
  Math.max(0, Math.min(a.r, o.r) - Math.max(a.l, o.l) + 4) * Math.max(0, Math.min(a.b, o.b) - Math.max(a.t, o.t) + 4);

// Where a speech bubble of size { w, h } goes next to `target` (the speaker's card).
// It tries above, below, right and left, and takes the first spot that's inside `area` and clear of
// every obstacle (cards and other bubbles). If none is clear, it takes the spot that overlaps least.
// Returns { side, x, y, tail }: `tail` is where the pointer sits along the bubble's edge.
export function placeBubble(size, target, obstacles, area, { gap = 12, edge = 6 } = {}) {
  const { w, h } = size;
  const cx = (target.l + target.r) / 2, cy = (target.t + target.b) / 2;
  const clampX = x => Math.max(edge, Math.min(area.width - w - edge, x));
  const spots = [
    { side: "above", x: clampX(cx - w / 2), y: target.t - h - gap },
    { side: "below", x: clampX(cx - w / 2), y: target.b + gap },
    { side: "right", x: target.r + gap, y: cy - h / 2 },
    { side: "left", x: target.l - w - gap, y: cy - h / 2 },
  ];
  const cost = s => {
    const r = { l: s.x, t: s.y, r: s.x + w, b: s.y + h };
    const outside = Math.max(0, edge - r.l) + Math.max(0, edge - r.t) + Math.max(0, r.r - area.width + edge) + Math.max(0, r.b - area.height + edge);
    return outside * 1000 + obstacles.reduce((n, o) => n + overlapArea(r, o), 0);
  };
  const best = spots.map(s => ({ ...s, cost: cost(s) })).reduce((a, s) => (s.cost < a.cost ? s : a));
  const y = Math.max(edge, Math.min(area.height - h - edge, best.y));
  const tail = best.side === "above" || best.side === "below"
    ? Math.max(14, Math.min(w - 14, cx - best.x))
    : Math.max(12, Math.min(h - 12, cy - y));
  return { side: best.side, x: best.x, y, tail, clear: best.cost === 0 };
}
