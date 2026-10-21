// Network builder: a sandbox like Packet Tracer, built for seeing. Add PCs, switches and routers, cable them,
// set IP addresses, VLANs, trunks and router subinterfaces (with forms or the command line), and the diagram
// redraws every broadcast domain in its own colour as you go. Pick a PC to see who it can reach, and why not.
// Pure parts (expand, sanitize, goals) are tested in tests/netbuilder.test.mjs; the model is net/model.js.
import * as M from "../net/model.js";
import * as V from "../net/view.js";
import { createCli } from "./vlan.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = v => JSON.parse(JSON.stringify(v));
export const W = 900, H = 600, LIMIT = { devices: 30, links: 60, subs: 8 };
const MODES = ["access", "trunk", "dynamic auto", "dynamic desirable"];
const ID = /^(PC|S|R)\d{1,3}$/;
const str = (v, n = 40) => (typeof v === "string" ? v.slice(0, n) : "");
const vid = v => (Number.isInteger(v) && v >= 1 && v <= 4094 ? v : null);

// Build full devices from a compact description (only what differs from a fresh device), dropping anything
// that isn't valid. Used for the starting networks in content/labs.json and for networks saved in the browser,
// which anyone can edit, so nothing is trusted.
export function expand(raw) {
  const topo = { devices: {}, links: [] }, layout = {};
  const devices = raw && typeof raw.devices === "object" && !Array.isArray(raw.devices) ? raw.devices : {};
  for (const [id, d] of Object.entries(devices).slice(0, LIMIT.devices)) {
    if (!ID.test(id) || !d || typeof d !== "object") continue;
    if (d.kind === "pc") topo.devices[id] = M.makePc({ ip: str(d.ip, 15), mask: str(d.mask, 15) || "255.255.255.0", gw: str(d.gw, 15) });
    else if (d.kind === "switch") {
      const sw = M.makeSwitch();
      for (const [v, name] of Object.entries(d.vlans || {})) {
        const n = Number(v);  // normal-range VLANs only: 1-1001 (1002-1005 are reserved)
        if (vid(n) && n <= 1001) sw.vlans[n] = n === 1 ? "default" : str(name, 32) || `VLAN${String(n).padStart(4, "0")}`;
      }
      for (const [p, cfg] of Object.entries(d.ports || {})) {
        if (!sw.ports[p] || !cfg || typeof cfg !== "object") continue;
        const port = sw.ports[p];
        if (MODES.includes(cfg.mode)) port.mode = cfg.mode;
        for (const k of ["access", "native"]) if (vid(cfg[k])) port[k] = cfg[k];
        if (vid(cfg.voice)) port.voice = cfg.voice;
        if (Array.isArray(cfg.allowed)) port.allowed = cfg.allowed.filter(vid).slice(0, 4094);
        port.shutdown = cfg.shutdown === true;
      }
      topo.devices[id] = sw;
    } else if (d.kind === "router") {
      const r = M.makeRouter();
      for (const [p, cfg] of Object.entries(d.ports || {})) {
        if (!r.ports[p] || !cfg || typeof cfg !== "object") continue;
        r.ports[p].shutdown = cfg.shutdown === true;
        r.ports[p].subs = (Array.isArray(cfg.subs) ? cfg.subs : []).slice(0, LIMIT.subs).filter(s => s && typeof s === "object")
          .map(s => ({ tag: vid(s.tag), ip: str(s.ip, 15), mask: str(s.mask, 15) || "255.255.255.0" }));
      }
      topo.devices[id] = r;
    } else continue;
    const [x, y] = Array.isArray(raw.layout?.[id]) ? raw.layout[id].map(Number) : [];
    layout[id] = [Number.isFinite(x) ? Math.min(W - 50, Math.max(50, x)) : W / 2, Number.isFinite(y) ? Math.min(H - 45, Math.max(45, y)) : H / 2];
  }
  for (const l of (Array.isArray(raw?.links) ? raw.links : []).slice(0, LIMIT.links)) {
    const ok = end => Array.isArray(end) && topo.devices[end[0]] && M.portsOf(topo.devices[end[0]]).includes(end[1]) && !M.linkOf(topo, end[0], end[1]);
    if (l && ok(l.a) && ok(l.b) && l.a[0] !== l.b[0]) topo.links.push({ a: [l.a[0], l.a[1]], b: [l.b[0], l.b[1]] });
  }
  return { topo, layout };
}

// The goals: optional challenges that award the lab's XP. Each is checked against the live network and the
// pings run so far ({ from, to, result, routed }).
export const GOALS = {
  ping: (topo, pings) => pings.some(p => p.result === "ok" && topo.devices[p.to]?.kind === "pc" && p.to !== p.from),
  split: topo => Object.entries(topo.devices).some(([id, d]) => {
    if (d.kind !== "switch") return false;
    const seg = M.segments(topo);
    const used = new Set(topo.links.filter(l => l.a[0] === id || l.b[0] === id).map(l => (l.a[0] === id ? l.b[0] : l.a[0])).filter(o => topo.devices[o].kind === "pc").map(o => seg.of[`pc:${o}`]).filter(s => s != null));
    return used.size >= 2;
  }),
  trunk: topo => {
    const seg = M.segments(topo);
    return topo.links.some(l => topo.devices[l.a[0]].kind === "switch" && topo.devices[l.b[0]].kind === "switch" && M.carried(topo, l, seg).filter(s => seg.segments[s].hosts.length).length >= 2);
  },
  route: (topo, pings) => pings.some(p => p.result === "ok" && p.routed && topo.devices[p.to]?.kind === "pc"),
};

export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {} } = {}) {
  const KEY = "pn-netbuilder";
  const ac = new AbortController(), alive = () => root.isConnected || (ac.abort(), false);  // window listeners end with the page
  const done = new Set(solved);
  let finished = lab.goals.every(g => done.has(g.id));
  const topo = { devices: {}, links: [] };
  let layout = {}, cli, pings = [], selected = null, focus = null, connectFrom = null, connecting = false, tab = "settings";
  const undo = [], outs = {};

  // ---------- load / save / undo
  function load(raw, quiet) {
    const x = expand(raw);
    topo.devices = x.topo.devices; topo.links = x.topo.links; layout = x.layout;
    cli = createCli(topo); pings = cli.pings;
    for (const k of Object.keys(outs)) delete outs[k];
    selected = null; focus = null; connectFrom = null;
    if (!quiet) { save(); drawAll(); }
  }
  const snapshot = () => clone({ devices: topo.devices, links: topo.links, layout });
  function save() { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) {} }
  function change(fn) {  // every edit: remember the previous state, apply, save, redraw
    undo.push(snapshot()); if (undo.length > 60) undo.shift();
    fn(); save();
  }
  function undoLast() {
    const prev = undo.pop(); if (!prev) return say("Nothing to undo.");
    const sel = selected; load(prev, true); selected = topo.devices[sel] ? sel : null; save(); drawAll(); say("Undone.");
  }

  // ---------- layout of the page
  root.innerHTML = `<div class="nb-lab stack">
    <div class="view-head"><a class="link-btn" href="#missions">← Practise</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · sandbox</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="nb-toolbar row" role="toolbar" aria-label="Network builder tools">
      <button class="btn" type="button" data-add="pc">+ PC</button><button class="btn" type="button" data-add="switch">+ Switch</button><button class="btn" type="button" data-add="router">+ Router</button>
      <button class="btn ghost" type="button" id="nb-connect" aria-pressed="false">Connect</button>
      <button class="btn ghost" type="button" id="nb-undo">Undo</button>
      <label class="nb-scen">Start from <select id="nb-scenario">${lab.scenarios.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("")}</select></label>
      <button class="btn ghost" type="button" id="nb-load">Load</button>
    </div>
    <p class="muted nb-help" id="nb-help"></p>
    <div class="nb-grid">
      <section class="panel nb-canvas" aria-labelledby="nb-canvas-h"><h2 class="sr-only" id="nb-canvas-h">Your network</h2>
        <div id="nb-svg"></div><svg class="nb-fx" id="nb-fx" aria-hidden="true"></svg></section>
      <div class="stack">
        <aside class="panel nb-side" id="nb-side" aria-label="Selected device"></aside>
        <section class="panel nb-goals"><div class="panel-title"><h2>Goals</h2><span class="mono" id="nb-count"></span></div><ol id="nb-goals"></ol><p class="nb-goalmsg" id="nb-goalmsg" aria-live="polite"></p>
          <details class="tbl simplification"><summary>How this differs from real networks</summary><p>${esc(lab.simplification)}</p></details></section>
      </div>
    </div>
    <div class="nb-grid2">
      <section class="panel"><h2>Who can talk to whom</h2><div id="nb-legend"></div></section>
      <section class="panel"><h2>Things to check</h2><div id="nb-issues"></div></section>
    </div>
    <p class="sr-only" id="nb-say" aria-live="polite"></p>
  </div>`;
  const $ = id => root.querySelector("#" + id);
  const say = text => { $("nb-say").textContent = ""; setTimeout(() => { $("nb-say").textContent = text; }, 30); $("nb-help").textContent = text; };

  // ---------- drawing
  function reachFrom(id) {
    if (!id || topo.devices[id]?.kind !== "pc") return null;
    const seg = M.segments(topo), out = {};
    for (const [other, d] of Object.entries(topo.devices)) {
      if (other === id) continue;
      if (d.kind === "pc" && d.ip) out[other] = M.ping(topo, id, d.ip, seg);
      if (d.kind === "router") { const sub = Object.values(d.ports).flatMap(p => p.subs).find(s => s.ip && M.sameNet(s.ip, topo.devices[id].ip, topo.devices[id].mask)) || Object.values(d.ports).flatMap(p => p.subs).find(s => s.ip); if (sub) out[other] = M.ping(topo, id, sub.ip, seg); }
    }
    return out;
  }
  // Frame what's been built: the devices' bounding box plus room for labels, never smaller than a third of the
  // canvas, at the canvas's shape. Kept still while a device is being dragged so the view doesn't chase it.
  let frozen = null;
  function viewBox() {
    if (frozen) return frozen;
    const pts = Object.values(layout);
    if (!pts.length) return `0 0 ${W} ${H}`;
    let [x0, y0, x1, y1] = [Math.min(...pts.map(p => p[0])) - 80, Math.min(...pts.map(p => p[1])) - 70, Math.max(...pts.map(p => p[0])) + 80, Math.max(...pts.map(p => p[1])) + 70];
    let w = Math.max(x1 - x0, W / 3), h = Math.max(y1 - y0, H / 3);
    if (w / h > W / H) h = w * H / W; else w = h * W / H;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return `${Math.round(cx - w / 2)} ${Math.round(cy - h / 2)} ${Math.round(w)} ${Math.round(h)}`;
  }
  function drawCanvas() {
    const seg = M.segments(topo), vb = viewBox();
    $("nb-fx").setAttribute("viewBox", vb);
    if (focus != null && !seg.segments[focus]) focus = null;
    $("nb-svg").innerHTML = Object.keys(topo.devices).length
      ? V.svg(topo, { layout, width: W, height: H, viewBox: vb, seg, focus, selected, reach: reachFrom(selected), interactive: true })
      : `<div class="empty nb-empty">An empty network. Add a PC and a switch with the buttons above, then Connect them.</div>`;
    $("nb-legend").innerHTML = V.legend(topo, seg, focus);
    const iss = M.issues(topo, seg);
    $("nb-issues").innerHTML = iss.length ? `<ul class="nb-issues">${iss.map(i => `<li><button type="button" class="link-btn" data-pick="${esc(i.id)}">${esc(i.id)}</button> ${esc(i.text.replace(new RegExp(`^${i.id}:? `), ""))}</li>`).join("")}</ul>` : `<p class="muted">Nothing looks wrong.</p>`;
    if (connecting) root.querySelectorAll(".nv-dev").forEach(g => g.classList.toggle("nb-from", g.dataset.node === connectFrom));
    drawGoals();
  }
  function drawGoals() {
    for (const g of lab.goals) if (!done.has(g.id) && GOALS[g.id](topo, pings)) { done.add(g.id); onPart(g.id); $("nb-goalmsg").textContent = `Goal reached: ${g.text}`; }
    $("nb-goals").innerHTML = lab.goals.map(g => `<li class="${done.has(g.id) ? "got" : ""}">${done.has(g.id) ? "✓ " : ""}${esc(g.text)}${done.has(g.id) ? `<span class="vl-why">${esc(g.why)}</span>` : ""}</li>`).join("");
    $("nb-count").textContent = `${lab.goals.filter(g => done.has(g.id)).length}/${lab.goals.length}`;
    if (!finished && lab.goals.every(g => done.has(g.id))) { finished = true; onComplete(); }
  }
  function drawAll() { drawCanvas(); drawSide(); }

  // ---------- the side panel: settings or command line for the selected device
  function drawSide() {
    const side = $("nb-side"), d = topo.devices[selected];
    if (!d) {
      side.innerHTML = `<h2>Nothing selected</h2><p class="muted">Click a device (or Tab to it and press Enter) to change its settings, open its command line, or see who it can reach. Drag devices to tidy the picture; arrow keys move the selected one.</p>`;
      return;
    }
    side.innerHTML = `<div class="panel-title"><h2>${esc(selected)}</h2><button class="link-btn" type="button" id="nb-del">Delete</button></div>
      <div class="row" role="tablist" aria-label="${esc(selected)} views">${["settings", "console"].map(t => `<button type="button" role="tab" class="chip" data-tab="${t}" aria-selected="${tab === t}">${t === "settings" ? "Settings" : "Command line"}</button>`).join("")}</div>
      <div id="nb-pane"></div>`;
    side.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; drawSide(); }));
    $("nb-del").addEventListener("click", () => { const id = selected; change(() => { M.removeDevice(topo, id); delete layout[id]; cli.forget(id); }); selected = null; drawAll(); say(`${id} deleted.`); });
    if (tab === "console") return drawConsole();
    const pane = $("nb-pane");
    pane.innerHTML = (d.kind === "pc" ? pcForm(d) : d.kind === "switch" ? switchForm(d) : routerForm(d)) + linksList();
    wireForm(pane, d);
  }
  const portLabel = (id, p) => { const l = M.linkOf(topo, id, p), o = l && (l.a[0] === id ? l.b : l.a); return o ? `${o[0]} ${o[1] === "NIC" ? "" : o[1]}`.trim() : "nothing"; };
  function linksList() {
    const mine = topo.links.filter(l => l.a[0] === selected || l.b[0] === selected);
    const others = Object.keys(topo.devices).filter(id => id !== selected);
    return `<h3 class="eyebrow">Cables</h3>${mine.length ? `<ul class="nb-cables">${mine.map((l, i) => { const [me, o] = l.a[0] === selected ? [l.a, l.b] : [l.b, l.a]; return `<li>${esc(me[1])} → ${esc(o[0])} ${o[1] === "NIC" ? "" : esc(o[1])} <button type="button" class="link-btn" data-unplug="${i}">Unplug</button></li>`; }).join("")}</ul>` : `<p class="muted">Not connected.</p>`}
      ${others.length ? `<div class="row nb-plug"><label>Connect to <select id="nb-plug-to">${others.map(o => `<option>${esc(o)}</option>`).join("")}</select></label><button type="button" class="btn ghost" id="nb-plug">Connect</button></div>` : ""}`;
  }
  const field = (k, label, v, hint = "") => `<label class="nb-field">${label}<input data-k="${k}" value="${esc(v)}" spellcheck="false" autocomplete="off" inputmode="decimal">${hint ? `<span class="muted">${hint}</span>` : ""}</label>`;
  function pcForm(d) {
    const others = Object.entries(topo.devices).filter(([id, x]) => id !== selected && (x.kind === "pc" ? x.ip : x.kind === "router"));
    const r = reachFrom(selected) || {};
    return `<div class="nb-form">${field("ip", "IP address", d.ip, d.ip && M.ipNum(d.ip) != null && M.prefixOf(d.mask) != null ? `Network ${M.network(d.ip, d.mask)}` : "")}${field("mask", "Subnet mask", d.mask)}${field("gw", "Default gateway", d.gw, "The router address this PC sends other networks' traffic to")}</div>
      ${others.length ? `<h3 class="eyebrow">Can ${esc(selected)} reach them?</h3><ul class="nb-reach">${others.map(([id]) => r[id] ? `<li class="${r[id].result === "ok" ? "ok" : "no"}"><b>${r[id].result === "ok" ? "✓" : "✗"} ${esc(id)}</b> <span>${esc(r[id].reason)}</span> <button type="button" class="link-btn" data-ping="${esc(id)}">Ping</button></li>` : "").join("")}</ul>` : ""}`;
  }
  function switchForm(d) {
    const vl = Object.entries(d.vlans).map(([v, n]) => [Number(v), n]).sort((a, b) => a[0] - b[0]);
    const used = Object.keys(d.ports).filter(p => M.linkOf(topo, selected, p));
    const opt = (sel) => vl.map(([v, n]) => `<option value="${v}"${v === sel ? " selected" : ""}>${v} ${esc(n)}</option>`).join("");
    return `<h3 class="eyebrow">VLANs</h3><ul class="nb-vlans">${vl.map(([v, n]) => `<li><b>${v}</b> ${v === 1 ? "default" : `<input data-vname="${v}" value="${esc(n)}" aria-label="Name of VLAN ${v}" maxlength="32"> <button type="button" class="link-btn" data-vdel="${v}" aria-label="Delete VLAN ${v}">Delete</button>`}</li>`).join("")}</ul>
      <div class="row nb-addv"><label>New VLAN <input id="nb-newv" inputmode="numeric" placeholder="10" size="5"></label><label>Name <input id="nb-newn" placeholder="Staff" maxlength="32" size="10"></label><button type="button" class="btn ghost" id="nb-addv">Add</button></div>
      <h3 class="eyebrow">Connected ports</h3>${used.length ? `<div class="nb-ports">${used.map(p => { const x = d.ports[p], op = M.opMode(topo, selected, p); return `<fieldset class="nb-port"><legend><b>${esc(p)}</b> → ${esc(portLabel(selected, p))} <span class="tag">${op === "trunk" ? "trunking" : "access"}</span></legend>
        <label>Mode <select data-port="${p}" data-pk="mode">${MODES.map(m => `<option${m === x.mode ? " selected" : ""}>${m}</option>`).join("")}</select></label>
        ${op === "trunk" ? `<label>Native VLAN <select data-port="${p}" data-pk="native">${opt(x.native)}</select></label><label>Allowed VLANs <input data-port="${p}" data-pk="allowed" value="${x.allowed ? x.allowed.join(",") : "all"}" spellcheck="false"></label>` : `<label>VLAN <select data-port="${p}" data-pk="access">${opt(x.access)}</select></label>`}
        <label class="nb-check"><input type="checkbox" data-port="${p}" data-pk="shutdown"${x.shutdown ? " checked" : ""}> Shut down</label></fieldset>`; }).join("")}</div>` : `<p class="muted">No cables yet. Unused ports aren't shown.</p>`}`;
  }
  function routerForm(d) {
    return `<p class="muted">Give a port an address on each network it should route for. For one cable carrying several VLANs (router on a stick), add an address per VLAN and set the switch port to trunk.</p>
      ${Object.entries(d.ports).map(([p, x]) => `<fieldset class="nb-port"><legend><b>${esc(p)}</b> → ${esc(portLabel(selected, p))}</legend>
        ${x.subs.map((s, i) => `<div class="nb-sub"><label>VLAN tag <input data-sub="${p}|${i}" data-sk="tag" value="${s.tag ?? ""}" placeholder="none" size="4" inputmode="numeric"></label><label>IP <input data-sub="${p}|${i}" data-sk="ip" value="${esc(s.ip)}" size="13" spellcheck="false"></label><label>Mask <input data-sub="${p}|${i}" data-sk="mask" value="${esc(s.mask)}" size="13" spellcheck="false"></label><button type="button" class="link-btn" data-subdel="${p}|${i}">Remove</button></div>`).join("")}
        <div class="row"><button type="button" class="btn ghost" data-subadd="${p}">+ Address</button><label class="nb-check"><input type="checkbox" data-rshut="${p}"${x.shutdown ? " checked" : ""}> Shut down</label></div></fieldset>`).join("")}`;
  }
  // Settings edits apply as you type, so the picture changes live. Structural edits redraw the panel too.
  function wireForm(pane, d) {
    let typing = false;
    const live = fn => { if (!typing) { undo.push(snapshot()); typing = true; } fn(); save(); drawCanvas(); };
    pane.querySelectorAll("[data-k]").forEach(i => {
      i.addEventListener("input", () => live(() => { d[i.dataset.k] = i.value.trim().slice(0, 15); }));
      i.addEventListener("change", () => { typing = false; drawSide(); $("nb-pane").querySelector(`[data-k="${i.dataset.k}"]`)?.focus(); });
    });
    pane.querySelectorAll("[data-vname]").forEach(i => i.addEventListener("input", () => live(() => { d.vlans[i.dataset.vname] = i.value.trim().slice(0, 32) || `VLAN${i.dataset.vname.padStart(4, "0")}`; })));
    pane.querySelectorAll("[data-vdel]").forEach(b => b.addEventListener("click", () => { change(() => { delete d.vlans[b.dataset.vdel]; }); drawAll(); say(`VLAN ${b.dataset.vdel} deleted. Ports still assigned to it are now inactive.`); }));
    $("nb-addv")?.addEventListener("click", () => {
      const v = Number($("nb-newv").value), n = $("nb-newn").value.trim().slice(0, 32);
      if (!Number.isInteger(v) || v < 2 || v > 1001) return say("Use a VLAN number from 2 to 1001 (1 always exists).");
      change(() => { d.vlans[v] = n || `VLAN${String(v).padStart(4, "0")}`; }); drawAll(); say(`VLAN ${v} added to ${selected}.`);
    });
    pane.querySelectorAll("[data-port]").forEach(i => i.addEventListener("change", () => {
      const port = d.ports[i.dataset.port], k = i.dataset.pk;
      change(() => {
        if (k === "shutdown") port.shutdown = i.checked;
        else if (k === "allowed") { const v = i.value.trim().toLowerCase(); port.allowed = v === "all" || !v ? null : v === "none" ? [] : (v.split(",").map(x => Number(x.trim())).filter(x => vid(x))); }
        else if (k === "mode") port.mode = i.value;
        else port[k] = Number(i.value);
      });
      drawAll(); say(`${selected} ${i.dataset.port}: ${k} changed.`);
    }));
    pane.querySelectorAll("[data-sub]").forEach(i => i.addEventListener("input", () => {
      const [p, n] = i.dataset.sub.split("|"), s = d.ports[p].subs[Number(n)];
      live(() => { if (i.dataset.sk === "tag") s.tag = vid(Number(i.value)) && i.value.trim() ? Number(i.value) : null; else s[i.dataset.sk] = i.value.trim().slice(0, 15); });
    }));
    pane.querySelectorAll("[data-subadd]").forEach(b => b.addEventListener("click", () => { const p = d.ports[b.dataset.subadd]; if (p.subs.length >= LIMIT.subs) return; change(() => { p.subs.push({ tag: null, ip: "", mask: "255.255.255.0" }); }); drawSide(); }));
    pane.querySelectorAll("[data-subdel]").forEach(b => b.addEventListener("click", () => { const [p, n] = b.dataset.subdel.split("|"); change(() => { d.ports[p].subs.splice(Number(n), 1); }); drawAll(); }));
    pane.querySelectorAll("[data-rshut]").forEach(i => i.addEventListener("change", () => { change(() => { d.ports[i.dataset.rshut].shutdown = i.checked; }); drawAll(); }));
    pane.querySelectorAll("[data-ping]").forEach(b => b.addEventListener("click", () => pingTo(b.dataset.ping)));
    pane.querySelectorAll("[data-unplug]").forEach(b => b.addEventListener("click", () => { const mine = topo.links.filter(l => l.a[0] === selected || l.b[0] === selected), l = mine[Number(b.dataset.unplug)]; change(() => M.disconnect(topo, l)); drawAll(); say("Cable unplugged."); }));
    $("nb-plug")?.addEventListener("click", () => cable(selected, $("nb-plug-to").value));
  }

  // ---------- the command line in the side panel
  function drawConsole() {
    const pane = $("nb-pane"), kind = topo.devices[selected].kind;
    outs[selected] ??= `<div class="muted">${kind === "pc" ? "Windows command prompt: ipconfig, ping." : kind === "switch" ? "Cisco IOS: enable, configure terminal, vlan, interface… Type ? for help." : "Routers are set up in Settings here."}</div>`;
    pane.innerHTML = `<div class="term-shell nb-term"><div class="term-out" id="nb-out" aria-live="polite" tabindex="0" aria-label="Console output">${outs[selected]}</div>
      <form class="term-in" id="nb-form"><label class="sr" for="nb-in">Command for ${esc(selected)}</label><span class="term-ps" id="nb-ps">${esc(cli.prompt(selected))}</span><input id="nb-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form></div>`;
    const out = $("nb-out"), input = $("nb-in");
    out.scrollTop = out.scrollHeight;
    $("nb-form").addEventListener("submit", e => {
      e.preventDefault();
      const id = selected, line = input.value;
      undo.push(snapshot());
      const res = cli.exec(id, line);
      outs[id] += `<div><span class="term-ps">${esc($("nb-ps").textContent)}</span>${esc(line)}</div>${res.out ? `<div class="${res.error ? "t-err" : ""}">${esc(res.out)}</div>` : ""}`;
      out.innerHTML = outs[id]; out.scrollTop = out.scrollHeight;
      input.value = ""; $("nb-ps").textContent = cli.prompt(id);
      if (res.ping) markPing(id, res.ping);
      save(); drawCanvas();
    });
    let h = null;
    input.addEventListener("keydown", e => {
      const hist = cli.history(selected);
      if (e.key === "ArrowUp" && hist.length) { e.preventDefault(); h = h == null ? hist.length - 1 : Math.max(0, h - 1); input.value = hist[h]; }
      else if (e.key === "ArrowDown" && h != null) { e.preventDefault(); h = Math.min(hist.length, h + 1); input.value = hist[h] || ""; if (h >= hist.length) h = null; }
      else if (e.key === "Tab" && input.value) { e.preventDefault(); input.value = cli.complete(selected, input.value); }
    });
    input.focus();
  }

  // ---------- pings: run from the Settings list, animated along the real path
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function pingTo(target) {
    const d = topo.devices[target], ip = d.kind === "pc" ? d.ip : Object.values(d.ports).flatMap(p => p.subs).find(s => s.ip)?.ip;
    const res = cli.exec(selected, `ping ${ip}`);
    outs[selected] = (outs[selected] || "") + `<div><span class="term-ps">C:\\&gt;</span>ping ${esc(ip)}</div><div>${esc(res.out)}</div>`;
    if (res.ping) markPing(selected, res.ping);
    drawCanvas(); drawSide();
  }
  function markPing(from, r) {
    const last = pings.at(-1);
    if (last) last.routed = r.result === "ok" && /^Routed/.test(r.reason || "");
    const hops = [from, ...(r.via || [])];
    const path = hops.slice(1).reduce((acc, h) => [...acc, ...M.route(topo, acc.at(-1), h).slice(1)], [from]);
    say(`${r.result === "ok" ? "Reply" : "No reply"}: ${r.reason}`);
    animate(path, r.result === "ok");
    drawGoals();
  }
  function animate(path, ok) {
    const fx = $("nb-fx"), pts = path.map(id => layout[id]).filter(Boolean);
    if (pts.length < 2) return;
    const line = `<polyline class="nb-path ${ok ? "ok" : "no"}" points="${pts.map(p => p.join(",")).join(" ")}"/>`;
    if (reduced) { fx.innerHTML = line; setTimeout(() => { fx.innerHTML = ""; }, 1800); return; }
    fx.innerHTML = `${line}<circle class="nb-pkt ${ok ? "ok" : "no"}" r="7"/>`;
    const dot = fx.querySelector("circle"), seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = seg.reduce((a, b) => a + b, 0) || 1;
    const t0 = performance.now(), dur = 300 + total * 2.2;
    const step = now => {
      let d = Math.min(1, (now - t0) / dur) * total, i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const f = seg[i] ? d / seg[i] : 0, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
      dot.setAttribute("cx", x); dot.setAttribute("cy", y);
      if (now - t0 < dur) requestAnimationFrame(step); else setTimeout(() => { fx.innerHTML = ""; }, 700);
    };
    requestAnimationFrame(step);
  }

  // ---------- adding, cabling, selecting and moving devices
  function add(kind) {
    if (Object.keys(topo.devices).length >= LIMIT.devices) return say(`That's the limit of ${LIMIT.devices} devices.`);
    const id = M.nextId(topo, { pc: "PC", switch: "S", router: "R" }[kind]);
    change(() => {
      topo.devices[id] = kind === "pc" ? M.makePc() : kind === "switch" ? M.makeSwitch() : M.makeRouter();
      layout[id] = freeSpot(kind);
    });
    selected = id; tab = "settings"; drawAll(); say(`${id} added. Connect it with the Connect button or from its Cables list.`);
  }
  // Somewhere clear for a new device: routers along the top, switches in the middle, PCs along the bottom.
  function freeSpot(kind) {
    const row = { router: 100, switch: 280, pc: 460 }[kind], taken = Object.values(layout);
    for (const dy of [0, 70, -70, 130]) for (let i = 0; i < 7; i++) {
      const x = W / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 120, y = Math.min(H - 45, Math.max(45, row + dy));
      if (taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) > 95)) return [x, y];
    }
    return [W / 2, row];
  }
  function cable(a, b) {
    if (topo.links.length >= LIMIT.links) return say(`That's the limit of ${LIMIT.links} cables.`);
    let r;
    change(() => { r = M.connect(topo, a, b); });
    if (r.error) { undo.pop(); return say(r.error); }
    drawAll(); say(`Cabled ${r.link.a[0]} ${r.link.a[1]} to ${r.link.b[0]} ${r.link.b[1]}.`);
  }
  function pick(id) {
    if (connecting) {
      if (!connectFrom) { connectFrom = id; drawCanvas(); return say(`Connecting from ${id}: now pick the device to cable it to (Esc to stop).`); }
      const from = connectFrom; connectFrom = null; cable(from, id); return;
    }
    if (selected !== id) { selected = id; tab = "settings"; drawAll(); }
    say(V.describe(topo, id, M.segments(topo)));
  }
  function setConnecting(on) { connecting = on; connectFrom = null; $("nb-connect").setAttribute("aria-pressed", on); root.querySelector(".nb-canvas").classList.toggle("connecting", on); drawCanvas(); say(on ? "Connect mode: pick two devices to cable together." : "Connect mode off."); }

  const svgPoint = e => { const s = $("nb-svg").querySelector("svg"), p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(s.getScreenCTM().inverse()); };
  let drag = null;
  $("nb-svg").addEventListener("pointerdown", e => {
    const g = e.target.closest(".nv-dev"); if (!g) return;
    const id = g.dataset.node, p = svgPoint(e);
    drag = { id, dx: layout[id][0] - p.x, dy: layout[id][1] - p.y, moved: false, start: snapshot() };
    frozen = viewBox();
    e.preventDefault();
  });
  window.addEventListener("pointermove", e => {
    if (!alive() || !drag) return;
    const p = svgPoint(e), x = Math.min(W - 45, Math.max(45, p.x + drag.dx)), y = Math.min(H - 40, Math.max(40, p.y + drag.dy));
    if (!drag.moved && Math.hypot(x - layout[drag.id][0], y - layout[drag.id][1]) < 4) return;
    drag.moved = true; layout[drag.id] = [x, y]; drawCanvas();
  }, { signal: ac.signal });
  window.addEventListener("pointerup", () => {
    if (!alive() || !drag) return;
    const d = drag; drag = null; frozen = null;
    if (d.moved) { undo.push(d.start); save(); drawCanvas(); } else pick(d.id);
  }, { signal: ac.signal });
  $("nb-svg").addEventListener("keydown", e => {
    const g = e.target.closest(".nv-dev"); if (!g) return;
    const id = g.dataset.node;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(id); $("nb-svg").querySelector(`[data-node="${id}"]`)?.focus(); return; }
    const step = e.shiftKey ? 40 : 10, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); change(() => { layout[id] = [Math.min(W - 45, Math.max(45, layout[id][0] + mv[0])), Math.min(H - 40, Math.max(40, layout[id][1] + mv[1]))]; }); drawCanvas(); $("nb-svg").querySelector(`[data-node="${id}"]`)?.focus(); }
    if (e.key === "Delete") { e.preventDefault(); selected = id; $("nb-del")?.click(); }
  });
  // Clicking empty canvas, or Escape, lets go of the selection.
  $("nb-svg").addEventListener("click", e => { if (!e.target.closest(".nv-dev") && !connecting && selected) { selected = null; drawAll(); } });
  root.addEventListener("keydown", e => {
    if (e.key === "Escape" && !connecting && selected && !e.target.matches("input, select, textarea")) { selected = null; drawAll(); }
    if (e.key === "Escape" && connecting) setConnecting(false); if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.target.matches("input, textarea")) { e.preventDefault(); undoLast(); } });
  root.addEventListener("click", e => {
    const k = e.target.closest("[data-seg]"); if (k) { focus = focus === Number(k.dataset.seg) ? null : Number(k.dataset.seg); drawCanvas(); root.querySelector(`#nb-legend [data-seg="${k.dataset.seg}"]`)?.focus(); }
    const p = e.target.closest("[data-pick]"); if (p && topo.devices[p.dataset.pick]) { selected = p.dataset.pick; tab = "settings"; drawAll(); }
  });
  root.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => add(b.dataset.add)));
  $("nb-connect").addEventListener("click", () => setConnecting(!connecting));
  $("nb-undo").addEventListener("click", undoLast);
  $("nb-load").addEventListener("click", () => {
    const s = lab.scenarios.find(x => x.id === $("nb-scenario").value);
    undo.push(snapshot()); load(s.network); say(`Loaded: ${s.label}. ${s.about}`);
  });

  // Start from what this browser saved last time, or the first scenario.
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  load(saved && Object.keys(saved.devices || {}).length ? saved : lab.scenarios[0].network, true);
  drawAll();
  say(saved ? "Your saved network is back. Load a starting point to begin again." : lab.scenarios[0].about);
  return { topo, cli: () => cli };
}
