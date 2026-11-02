// 2D reja muharriri (SVG). Tahrirlash xona, ochilma va jihozlar ustida ishlaydi.
import { ITEM_KINDS, ROOM_TYPES, item, opening, room } from "./model.js";
import { bounds, nearestSide, openingRect, roomAt } from "./geometry.js";

const SNAP = 10;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ONE_ONLY = new Set(["boiler", "panel", "waterin", "sewerout", "heater"]);
const TAB_GROUP = { heat: "heat", elec: "elec", plumb: "plumb" };

// Rejadagi shartli belgilar
function symbol(kind, k) {
  const w = k.w / 2, d = k.d / 2, c = k.color;
  switch (kind) {
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
    const c = this.ctx, q = this.pt(e), tool = c.tool;
    this.svg.setPointerCapture(e.pointerId);
    const onHandle = e.target.closest('[data-t="handle"]');
    if (tool === "room" && !onHandle && !roomAt(c.p, q.x, q.y)) {
      this.drag = { type: "new", x0: this.edge(q.x, "x"), y0: this.edge(q.y, "y") };
      return;
    }
    if (tool === "door" || tool === "window" || tool === "entry") {
      const s = nearestSide(c.p, q.x, q.y);
      if (s) {
        c.commit();
        const o = opening(tool, s.room.id, s.side, s.off);
        c.p.openings.push(o); c.select({ type: "open", id: o.id }); c.changed();
      }
      return;
    }
    if (ITEM_KINDS[tool] && !onHandle) {
      c.commit();
      if (ONE_ONLY.has(tool)) c.p.items = c.p.items.filter((i) => i.kind !== tool);
      const it = item(tool, snap(q.x), snap(q.y));
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
    const { p, tab, sel, res } = this.ctx;
    const t = p.wallT, o = [];
    const b = bounds(p);
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
      o.push(`<g class="${cls}" ${attr} transform="translate(${i.x} ${i.y})"><title>${k.name}</title>` +
        (hit ? `<circle class="bg" r="${hit}"/>` : `<rect class="bg" x="${-k.w / 2}" y="${-k.d / 2}" width="${k.w}" height="${k.d}"/>`) +
        symbol(i.kind, k) + `</g>`);
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
    for (const s of h.segs) { o.push(this.line(s.pts, "ph", -5)); o.push(this.line(s.pts, "pc", 5)); }
    for (const r of h.rads) {
      const W = r.horiz ? r.w : 14, D = r.horiz ? 14 : r.w;
      o.push(`<rect class="rad" x="${r.x - W / 2}" y="${r.y - D / 2}" width="${W}" height="${D}"><title>R${r.no}: ${r.sec} seksiya, ${Math.round(r.power)} W</title></rect>`);
      o.push(`<text class="rl" x="${r.x}" y="${r.y + (r.horiz ? -18 : 5)}">${r.sec}s</text>`);
    }
  }
  elec(o, e) {
    for (const s of e.segs) o.push(this.line(s.pts, s.branch ? "pb" : "pe"));
    for (const b of e.boxes) {
      if (b.manual) continue;
      o.push(`<rect class="jb" x="${b.x - 11}" y="${b.y - 11}" width="22" height="22"><title>${esc(b.title)}</title></rect>`);
    }
  }
  plumb(o, w) {
    for (const s of w.sewer) o.push(this.line(s.pts, "ps", 0, s.dn === 110 ? 9 : 5));
    for (const s of w.cold) o.push(this.line(s.pts, "pc", -7));
    for (const s of w.hot) o.push(this.line(s.pts, "ph", 7));
  }
}
