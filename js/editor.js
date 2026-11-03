// 2D reja muharriri (SVG). Tahrirlash xona, ochilma va jihozlar ustida ishlaydi.
import { ITEM_KINDS, ROOM_TYPES, item, opening, room } from "./model.js";
import { bounds, floorOf, fv, nearestSide, openingRect, roomAt } from "./geometry.js";

const SNAP = 10;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ONE_ONLY = new Set(["boiler", "panel", "waterin", "sewerout", "heater", "tank"]);
const mid = (pts) => {
  // Polilinyaning o'rtasidagi nuqta va yo'nalishi
  const L = pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  let r = L / 2;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (r <= l && l > 0) return { x: a[0] + (b[0] - a[0]) * r / l, y: a[1] + (b[1] - a[1]) * r / l, h: Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]), L };
    r -= l;
  }
  return { x: pts[0][0], y: pts[0][1], h: true, L };
};
const TAB_GROUP = { plan: "build", heat: "heat", elec: "elec", plumb: "plumb" };
const onFloor = (s, f) => floorOf(s) === f;

const LIGHT_LETTER = { chandelier: "L", ledpanel: "P", ledspot: "S", halogen: "G", bulb: "", sconce: "B", strip: "T" };

// Rejadagi shartli belgilar
function symbol(kind, k) {
  const w = k.w / 2, d = k.d / 2, c = k.color;
  switch (kind) {
    case "stairs": {
      let s = `<path d="M0 ${d - 12}V${-d + 20}M-12 ${-d + 32}L0 ${-d + 14}L12 ${-d + 32}"/>`;
      for (let y = -d + 25; y < d; y += 25) s += `<path d="M${-w} ${y}H${w}"/>`;
      return s;
    }
    case "manifold": {
      let s = `<path d="M${-w + 4} -3H${w - 4}M${-w + 4} 3H${w - 4}"/>`;
      for (let x = -w + 10; x < w - 4; x += 10) s += `<path d="M${x} ${-d}V${d}"/>`;
      return s;
    }
    case "riser": return `<circle r="${w - 6}"/><path d="M-9 -9L9 9M9 -9L-9 9"/>`;
    case "sink": return `<ellipse cx="0" cy="3" rx="${w - 6}" ry="${d - 6}"/><circle cx="0" cy="3" r="3"/>`;
    case "toilet": return `<rect x="${-w}" y="${-d}" width="${k.w}" height="16"/><ellipse cx="0" cy="10" rx="${w - 3}" ry="${d - 14}"/>`;
    case "bathtub": return `<rect x="${-w + 7}" y="${-d + 7}" width="${k.w - 14}" height="${k.d - 14}" rx="22"/><circle cx="${w - 24}" cy="0" r="4"/>`;
    case "shower": return `<path d="M${-w} ${-d}L${w} ${d}M${w} ${-d}L${-w} ${d}"/><circle r="6"/>`;
    case "washer": return `<circle r="${w - 9}"/><circle r="${w - 17}"/>`;
    case "heater": return `<circle r="${w - 8}"/><path d="M-9 0H9M0 -9V9"/>`;
    case "boiler": return `<rect x="${-w + 6}" y="${-d + 6}" width="${k.w - 12}" height="${k.d - 12}" style="fill:${c}"/><path d="M${-w + 6} ${-d + 6}L${w - 6} ${d - 6}M${w - 6} ${-d + 6}L${-w + 6} ${d - 6}"/>`;
    case "panel": return `<rect x="${-w}" y="${-d}" width="${k.w}" height="${k.d}" style="fill:${c}"/>`;
    case "jbox": return `<rect x="${-w + 2}" y="${-d + 2}" width="${k.w - 4}" height="${k.d - 4}" style="fill:${c}"/><path d="M${-w + 2} ${-d + 2}L${w - 2} ${d - 2}M${w - 2} ${-d + 2}L${-w + 2} ${d - 2}"/>`;
    case "light": return `<circle r="${w - 3}"/><path d="M-9 -9L9 9M9 -9L-9 9"/>`;
    case "switch": return `<circle r="5" style="fill:${c}"/><path d="M0 0L9 -9"/>`;
    case "socket": return `<path d="M-8 3A8 8 0 0 1 8 3Z" style="fill:${c}"/><path d="M0 -5V-11"/>`;
    case "power": return `<path d="M-10 4A10 10 0 0 1 10 4Z" style="fill:${c}"/><path d="M-4 -6V-12M4 -6V-12"/>`;
    case "waterin": return `<circle r="${w}" style="fill:${c}"/>`;
    case "sewerout": return `<circle r="${w}" style="fill:${c}"/><circle r="${w - 6}"/>`;
    case "tank": return `<circle r="${w - 6}"/><circle r="${w - 16}" style="fill:${c};opacity:.35"/><path d="M${-w + 18} 0H${w - 18}"/>`;
    default: return "";
  }
}
function openSymbol(p, o, z) {
  const r = p.rooms.find((x) => x.id === o.room), L = o.w;
  if (o.kind === "window") {
    return z.axis === "h"
      ? `<path class="sym" d="M${z.x} ${z.y + z.d / 2}h${z.w}"/>`
      : `<path class="sym" d="M${z.x + z.w / 2} ${z.y}v${z.d}"/>`;
  }
  const s = sideOf(o);
  const hx = z.axis === "h" ? z.x : s.x(r, p), hy = z.axis === "h" ? s.y(r, p) : z.y;
  if (z.axis === "h") {
    const dir = o.side === "n" ? 1 : -1, e = hy + dir * L, sw = o.side === "n" ? 0 : 1;
    return `<path class="sym" d="M${hx} ${hy}V${e}A${L} ${L} 0 0 ${sw} ${hx + L} ${hy}"/>`;
  }
  const dir = o.side === "w" ? 1 : -1, e = hx + dir * L, sw = o.side === "w" ? 1 : 0;
  return `<path class="sym" d="M${hx} ${hy}H${e}A${L} ${L} 0 0 ${sw} ${hx} ${hy + L}"/>`;
}
const sideOf = (o) => ({
  x: (r) => (o.side === "w" ? r.x : r.x + r.w),
  y: (r) => (o.side === "n" ? r.y : r.y + r.d),
});

export class Editor {
  constructor(svg, ctx) {
    this.svg = svg; this.ctx = ctx;
    this.vb = { x: -200, y: -200, w: 1500, h: 1100 };
    this.drag = null; this.preview = null;
    svg.addEventListener("pointerdown", (e) => this.down(e));
    svg.addEventListener("pointermove", (e) => this.move(e));
    svg.addEventListener("pointerup", (e) => this.up(e));
    svg.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    new ResizeObserver(() => this.applyVB()).observe(svg);
  }
  fit() {
    const b = bounds(this.ctx.p), pad = 130;
    const w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
    const r = this.svg.clientWidth / (this.svg.clientHeight || 1) || 1.4;
    const W = Math.max(w, h * r), H = W / r;
    this.vb = { x: (b.x0 + b.x1) / 2 - W / 2, y: (b.y0 + b.y1) / 2 - H / 2, w: W, h: H };
    this.applyVB();
  }
  applyVB() {
    const v = this.vb;
    this.svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  }
  pt(e) {
    const m = this.svg.getScreenCTM().inverse();
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: q.x, y: q.y };
  }
  wheel(e) {
    e.preventDefault();
    const q = this.pt(e), k = e.deltaY > 0 ? 1.12 : 0.89, v = this.vb;
    v.x = q.x - (q.x - v.x) * k; v.y = q.y - (q.y - v.y) * k; v.w *= k; v.h *= k;
    this.applyVB();
  }
  down(e) {
    const c = this.ctx, q = this.pt(e), tool = c.tool, v = fv(c.p, c.floor);
    this.svg.setPointerCapture(e.pointerId);
    const onHandle = e.target.closest('[data-t="handle"]');
    if (tool === "room" && !onHandle && !roomAt(v, q.x, q.y)) {
      this.drag = { type: "new", x0: this.edge(q.x, "x"), y0: this.edge(q.y, "y") };
      return;
    }
    if (tool === "door" || tool === "window" || tool === "entry") {
      const s = nearestSide(v, q.x, q.y);
      if (s) {
        c.commit();
        const o = opening(tool, s.room.id, s.side, s.off);
        c.p.openings.push(o); c.select({ type: "open", id: o.id }); c.changed();
      }
      return;
    }
    if (tool === "rad") {
      const s = nearestSide(v, q.x, q.y);
      if (s) c.addRadiator(s.room, s.side, s.off);
      return;
    }
    const radEl = e.target.closest('[data-t="rad"]');
    if (radEl) {
      const r2 = c.ensureManualRad(radEl.dataset.id);
      if (r2) {
        c.select({ type: "rad", id: r2.id });
        c.commit();
        this.drag = { type: "rad", e: r2, r: c.p.rooms.find((x) => x.id === r2.room) };
      }
      return;
    }
    if (ITEM_KINDS[tool] && !onHandle) {
      c.commit();
      if (ONE_ONLY.has(tool)) c.p.items = c.p.items.filter((i) => i.kind !== tool);
      const it = item(tool, snap(q.x), snap(q.y));
      it.floor = c.floor;
      c.p.items.push(it); c.select({ type: "item", id: it.id }); c.changed();
      return;
    }
    const t = e.target.closest("[data-t]");
    if (t) {
      const type = t.dataset.t, id = t.dataset.id;
      if (type === "handle") {
        c.commit();
        const r = c.p.rooms.find((x) => x.id === id);
        this.drag = { type: "handle", r, h: t.dataset.h, x0: q.x, y0: q.y, o: { ...r } };
        return;
      }
      c.select({ type, id });
      c.commit();
      if (type === "room") {
        const r = c.p.rooms.find((x) => x.id === id);
        this.drag = { type: "room", r, x0: q.x, y0: q.y, o: { x: r.x, y: r.y } };
      } else if (type === "item") {
        const i = c.p.items.find((x) => x.id === id);
        this.drag = { type: "item", i, x0: q.x, y0: q.y, o: { x: i.x, y: i.y } };
      } else if (type === "open") {
        this.drag = { type: "open", o: c.p.openings.find((x) => x.id === id) };
      }
      return;
    }
    c.select(null);
    this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: this.vb.x, vy: this.vb.y };
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const q = this.pt(e);
    if (d.type === "pan") {
      const k = this.vb.w / this.svg.clientWidth;
      this.vb.x = d.vx - (e.clientX - d.sx) * k; this.vb.y = d.vy - (e.clientY - d.sy) * k;
      this.applyVB(); return;
    }
    if (d.type === "new") {
      const x = this.edge(q.x, "x"), y = this.edge(q.y, "y");
      this.preview = { x: Math.min(d.x0, x), y: Math.min(d.y0, y), w: Math.abs(x - d.x0), d: Math.abs(y - d.y0) };
    }
    if (d.type === "room") {
      const nx = d.o.x + q.x - d.x0, ny = d.o.y + q.y - d.y0;
      d.r.x = this.moveEdge(nx, d.r.w, "x", d.r);
      d.r.y = this.moveEdge(ny, d.r.d, "y", d.r);
    }
    if (d.type === "item") { d.i.x = snap(d.o.x + q.x - d.x0); d.i.y = snap(d.o.y + q.y - d.y0); }
    if (d.type === "rad") {
      // Radiator faqat o'z xonasining devorlari bo'ylab suriladi
      const r = d.r, opts = [
        ["n", q.x - r.x, Math.abs(q.y - r.y), r.w], ["s", q.x - r.x, Math.abs(q.y - r.y - r.d), r.w],
        ["w", q.y - r.y, Math.abs(q.x - r.x), r.d], ["e", q.y - r.y, Math.abs(q.x - r.x - r.w), r.d],
      ].sort((a, b) => a[2] - b[2]);
      const [side, off, , len] = opts[0];
      const rr = this.ctx.res.heat.rads.find((x) => x.id === d.e.id);
      const half = Math.min(len / 2, (rr?.w || 60) / 2 + 5);
      d.e.side = side; d.e.off = Math.max(half, Math.min(len - half, snap(off)));
      if (rr) {
        const o = d.e.off;
        rr.side = side; rr.horiz = side === "n" || side === "s";
        rr.x = side === "w" ? r.x + 9 : side === "e" ? r.x + r.w - 9 : r.x + o;
        rr.y = side === "n" ? r.y + 9 : side === "s" ? r.y + r.d - 9 : r.y + o;
      }
    }
    if (d.type === "open") {
      const r = this.ctx.p.rooms.find((x) => x.id === d.o.room);
      const h = d.o.side === "n" || d.o.side === "s";
      const len = h ? r.w : r.d, half = d.o.w / 2;
      d.o.off = Math.max(half, Math.min(len - half, snap(h ? q.x - r.x : q.y - r.y)));
    }
    if (d.type === "handle") {
      const r = d.r, o = d.o, min = 100;
      const dx = q.x - d.x0, dy = q.y - d.y0;
      if (d.h.includes("e")) r.w = Math.max(min, this.edge(o.x + o.w + dx, "x", r) - o.x);
      if (d.h.includes("s")) r.d = Math.max(min, this.edge(o.y + o.d + dy, "y", r) - o.y);
      if (d.h.includes("w")) { const w = Math.max(min, o.x + o.w - this.edge(o.x + dx, "x", r)); r.x = o.x + o.w - w; r.w = w; }
      if (d.h.includes("n")) { const h = Math.max(min, o.y + o.d - this.edge(o.y + dy, "y", r)); r.y = o.y + o.d - h; r.d = h; }
    }
    d.moved = true;
    this.draw();
  }
  up() {
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.type === "new") {
      const v = this.preview; this.preview = null;
      if (v && v.w >= 100 && v.d >= 100) {
        this.ctx.commit();
        const r = room("living", v.x, v.y, v.w, v.d);
        r.floor = this.ctx.floor;
        this.ctx.p.rooms.push(r); this.ctx.select({ type: "room", id: r.id }); this.ctx.changed();
      } else this.draw();
      return;
    }
    if (d.type === "handle" && d.moved) this.keepOpenings(d);
    if (d.type === "pan") return;
    if (d.moved) this.ctx.changed(); else this.ctx.discardCommit();
  }
  // Chap yoki yuqori devor surilsa ham eshik va derazalar joyida qoladi
  keepOpenings(d) {
    const r = d.r, dx = r.x - d.o.x, dy = r.y - d.o.y;
    for (const o of this.ctx.p.openings) {
      if (o.room !== r.id) continue;
      const h = o.side === "n" || o.side === "s";
      o.off -= h ? dx : dy;
      const len = h ? r.w : r.d, half = o.w / 2;
      o.off = Math.max(half, Math.min(len - half, o.off));
    }
  }
  // Qo'shni xona devoriga yopishish: chekka yoki bir devor qalinligi narida
  edge(v, axis, self) {
    const t = this.ctx.p.wallT, best = { d: 16, c: snap(v) };
    for (const r of this.ctx.p.rooms) {
      if (r === self) continue;
      const a = axis === "x" ? r.x : r.y, b = a + (axis === "x" ? r.w : r.d);
      for (const c of [a, b, a - t, b + t]) {
        const dist = Math.abs(c - v);
        if (dist < best.d) { best.d = dist; best.c = c; }
      }
    }
    return best.c;
  }
  moveEdge(v, len, axis, self) {
    const a = this.edge(v, axis, self);
    if (a !== snap(v)) return a;
    const b = this.edge(v + len, axis, self);
    return b !== snap(v + len) ? b - len : a;
  }
  dims(o, r) {
    const pad = this.vb.w / 40, fs = this.vb.w / 75;
    o.push(`<text class="ld" style="font-size:${fs}px" x="${r.x + r.w / 2}" y="${r.y - pad / 2}">${r.w}</text>`);
    o.push(`<text class="ld" style="font-size:${fs}px" transform="rotate(-90 ${r.x - pad / 2} ${r.y + r.d / 2})" x="${r.x - pad / 2}" y="${r.y + r.d / 2}">${r.d}</text>`);
  }

  draw() {
    const { tab, sel, res, floor } = this.ctx;
    const p = fv(this.ctx.p, floor);
    const t = p.wallT, o = [];
    const b = bounds(p.rooms.length ? p : this.ctx.p);
    // Pastki qavat devorlari mo'ljal uchun xira ko'rinadi
    if (floor > 0) for (const r of fv(this.ctx.p, floor - 1).rooms) o.push(`<rect class="under" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.d}"/>`);
    for (const r of p.rooms) o.push(`<rect class="w" x="${r.x - t}" y="${r.y - t}" width="${r.w + 2 * t}" height="${r.d + 2 * t}"/>`);
    for (const r of p.rooms) {
      const s = sel?.type === "room" && sel.id === r.id;
      const hit = tab === "plan" ? `data-t="room" data-id="${r.id}"` : "";
      o.push(`<rect ${hit} class="r ${ROOM_TYPES[r.type].heated ? "" : "cold"} ${s ? "s" : ""}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.d}"/>`);
      o.push(`<text class="rn" x="${r.x + r.w / 2}" y="${r.y + r.d / 2 - 6}">${esc(r.name)}</text>`);
      o.push(`<text class="rs" x="${r.x + r.w / 2}" y="${r.y + r.d / 2 + 24}">${r.w} × ${r.d}</text>`);
    }
    for (const q of p.openings) {
      const z = openingRect(p, q); if (!z) continue;
      const s = sel?.type === "open" && sel.id === q.id;
      o.push(`<rect ${tab === "plan" ? `data-t="open" data-id="${q.id}"` : ""} class="op ${q.kind} ${s ? "s" : ""}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.d}"/>`);
      o.push(openSymbol(p, q, z));
    }
    if (tab === "heat" && res) this.heat(o, res.heat);
    if (tab === "elec" && res) this.elec(o, res.elec);
    if (tab === "plumb" && res) this.plumb(o, res.plumb);
    for (const i of p.items) {
      const k = ITEM_KINDS[i.kind]; if (!k) continue;
      const on = TAB_GROUP[tab] === k.group;
      if (!on && tab !== "plan") continue;
      const s = sel?.type === "item" && sel.id === i.id;
      const attr = on ? `data-t="item" data-id="${i.id}"` : "";
      const cls = `it ${on ? "" : "dim"} ${s ? "s" : ""}`;
      const hit = k.round ? 2 + k.w / 2 : 0;
      o.push(`<g class="${cls}" ${attr} transform="translate(${i.x} ${i.y})${i.rot ? " rotate(90)" : ""}"><title>${k.name}</title>` +
        (hit ? `<circle class="bg" r="${hit}"/>` : `<rect class="bg" x="${-k.w / 2}" y="${-k.d / 2}" width="${k.w}" height="${k.d}"/>`) +
        symbol(i.kind, k) + (i.kind === "light" ? `<text class="lt" y="${-k.w / 2 - 6}" style="fill:var(--fg);stroke:none;font:600 15px var(--mono);text-anchor:middle">${LIGHT_LETTER[i.ltype] || ""}</text>` : "") + `</g>`);
    }
    if (sel?.type === "room" && tab === "plan") {
      const r = p.rooms.find((x) => x.id === sel.id);
      if (r) {
        const h = Math.max(16, this.vb.w / 70), [X, Y, W, D] = [r.x, r.y, r.w, r.d];
        const list = [["n", X + W / 2, Y], ["s", X + W / 2, Y + D], ["w", X, Y + D / 2], ["e", X + W, Y + D / 2],
          ["nw", X, Y], ["ne", X + W, Y], ["sw", X, Y + D], ["se", X + W, Y + D]];
        for (const [n, x, y] of list) {
          o.push(`<rect data-t="handle" data-h="${n}" data-id="${r.id}" class="hd ${n}" x="${x - h / 2}" y="${y - h / 2}" width="${h}" height="${h}"/>`);
        }
        this.dims(o, r);
      }
    }
    if (this.preview) {
      const v = this.preview;
      o.push(`<rect class="pv" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.d}"/>`);
      this.dims(o, v);
    }
    if (p.rooms.length) {
      const y = b.y1 + 60, x = b.x0 - 60;
      o.push(`<line class="dm" x1="${b.x0}" x2="${b.x1}" y1="${y}" y2="${y}"/><text class="dt" x="${(b.x0 + b.x1) / 2}" y="${y - 10}">${b.x1 - b.x0}</text>`);
      o.push(`<line class="dm" y1="${b.y0}" y2="${b.y1}" x1="${x}" x2="${x}"/><text class="dt" transform="rotate(-90 ${x - 10} ${(b.y0 + b.y1) / 2})" x="${x - 10}" y="${(b.y0 + b.y1) / 2}">${b.y1 - b.y0}</text>`);
    }
    this.svg.innerHTML = o.join("");
  }
  line(pts, cls, off = 0, w) {
    const d = pts.map((q) => `${q[0] + off},${q[1] + off}`).join(" ");
    return `<polyline class="${cls}" points="${d}" ${w ? `style="stroke-width:${w}"` : ""}/>`;
  }
  heat(o, h) {
    const f = this.ctx.floor;
    for (const s of h.segs.filter((q) => onFloor(q, f))) { o.push(this.line(s.pts, "ph", -5)); o.push(this.line(s.pts, "pc", 5)); }
    for (const q of h.risers || []) o.push(`<circle class="rs2" cx="${q.x}" cy="${q.y}" r="13"><title>Stoyak</title></circle>`);
    for (const u of (h.ufh || []).filter((q) => onFloor(q, f))) {
      for (const pts of u.pattern) o.push(this.line(pts, "pu"));
    }
    for (const s of (h.starSegs || []).filter((q) => onFloor(q, f))) { o.push(this.line(s.pts, "ph thin", -3)); o.push(this.line(s.pts, "pc thin", 3)); }
    for (const m of (h.manifolds || []).filter((q) => onFloor(q, f) && q.auto)) {
      o.push(`<rect class="man" x="${m.x - 30}" y="${m.y - 7}" width="60" height="14"><title>Kollektor (avtomatik), ${m.ports} chiqish</title></rect>`);
    }
    const sel = this.ctx.sel;
    for (const r of h.rads.filter((q) => onFloor(q, f))) {
      const W = r.horiz ? r.w : 16, D = r.horiz ? 16 : r.w, s = sel?.type === "rad" && sel.id === r.id;
      o.push(`<rect data-t="rad" data-id="${r.id}" class="rad ${r.kind} ${s ? "s" : ""}" x="${r.x - W / 2}" y="${r.y - D / 2}" width="${W}" height="${D}"><title>R${r.no}: ${r.label}, ${Math.round(r.power)} W</title></rect>`);
      o.push(`<text class="rl" x="${r.x}" y="${r.y + (r.horiz ? -18 : 5)}">${r.short}</text>`);
    }
  }
  // Quvur yoki kabel ustidagi yozuv, kalta bo'laklarga yozilmaydi
  tag(o, pts, text, cls, off = 0, min = 0.8) {
    const m = mid(pts);
    if (m.L / 100 < min) return;
    const x = m.x + (m.h ? 0 : off + 8), y = m.y + (m.h ? off - 8 : 0);
    o.push(`<text class="${cls}" x="${x}" y="${y}" ${m.h ? "" : `transform="rotate(-90 ${x} ${y})"`}>${esc(text)}</text>`);
  }
  elec(o, e) {
    const f = this.ctx.floor, sel = this.ctx.sel;
    // Viklyuchatel qaysi chiroqni yoqishi: egri uzuq chiziq
    for (const c of (e.controls || []).filter((q) => onFloor(q, f))) {
      const [a, b] = [c.a, c.b], mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.2, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.2;
      o.push(`<path class="ctl" d="M${a[0]} ${a[1]}Q${mx} ${my} ${b[0]} ${b[1]}"/>`);
    }
    for (const s of e.segs.filter((q) => onFloor(q, f))) {
      o.push(this.line(s.pts, s.branch ? `pb ${s.role === "switch" ? "sw" : s.role === "light" ? "lt" : "so"}` : "pe"));
      if (s.spec) this.tag(o, s.pts, s.spec.replace(".", ","), "cl", 0, s.branch ? 0.6 : 1.5);
    }
    for (const b of e.boxes) {
      if (!onFloor(b, f)) continue;
      const s = sel?.type === "box" && sel.id === b.key;
      if (!b.manual) o.push(`<rect data-t="box" data-id="${esc(b.key)}" class="jb ${s ? "s" : ""}" x="${b.x - 14}" y="${b.y - 14}" width="28" height="28"><title>${esc(b.title)}. Ulanish sxemasi uchun bosing.</title></rect>`);
      if (b.label) o.push(`<text class="el kb" x="${b.x + 18}" y="${b.y + 24}">${esc(b.label)}</text>`);
    }
    for (const i of this.ctx.p.items.filter((q) => onFloor(q, f) && e.labels?.has(q.id))) {
      o.push(`<text class="el" x="${i.x + 14}" y="${i.y - 12}">${e.labels.get(i.id)}</text>`);
    }
  }
  plumb(o, w) {
    const f = this.ctx.floor;
    for (const s of w.sewer.filter((q) => onFloor(q, f))) {
      o.push(this.line(s.pts, "ps", 0, s.dn === 110 ? 9 : 5));
      this.tag(o, s.pts, `Ø${s.dn} i=${Math.round(s.slope * 100)}%`, "pl ps", 0, 1);
    }
    for (const s of (w.fill || []).filter((q) => onFloor(q, f))) o.push(this.line(s.pts, "pc fl", -7));
    for (const s of w.cold.filter((q) => onFloor(q, f))) { o.push(this.line(s.pts, "pc", -7)); this.tag(o, s.pts, `Ø${s.dn}`, "pl pc", -14, 1.2); }
    for (const s of w.hot.filter((q) => onFloor(q, f))) { o.push(this.line(s.pts, "ph", 7)); this.tag(o, s.pts, `Ø${s.dn}`, "pl ph", 22, 1.2); }
    for (const q of (w.cleanouts || []).filter((x) => onFloor(x, f))) {
      o.push(`<g class="co"><circle cx="${q.x}" cy="${q.y}" r="10"/><text x="${q.x}" y="${q.y + 5}">R</text><title>Reviziya, ${q.why}</title></g>`);
    }
    for (const q of w.risers || []) o.push(`<circle class="rs2" cx="${q.x}" cy="${q.y}" r="13"><title>Stoyak</title></circle>`);
    if (w.vent && onFloor(w.vent, f)) {
      const v = w.vent;
      o.push(`<g class="vt"><circle cx="${v.x + 22}" cy="${v.y + 22}" r="13"/><text x="${v.x + 22}" y="${v.y + 27}">V</text><title>${v.roof ? "Ventilyatsiya stoyagi tomdan chiqadi" : "Havo klapani"}, Ø110</title></g>`);
    }
  }
}
