// 2D reja muharriri (SVG). Tahrirlash xona, ochilma va jihozlar ustida ishlaydi.
import { ITEM_KINDS, ROOM_TYPES, item, opening, room } from "./model.js";
import { bounds, nearestSide, openingRect } from "./geometry.js";

const SNAP = 10;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ONE_ONLY = new Set(["boiler", "panel", "waterin", "sewerout", "heater"]);
const TAB_GROUP = { heat: "heat", elec: "elec", plumb: "plumb" };

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
    if (tool === "room") { this.drag = { type: "new", x0: snap(q.x), y0: snap(q.y) }; return; }
    if (tool === "door" || tool === "window" || tool === "entry") {
      const s = nearestSide(c.p, q.x, q.y);
      if (s) {
        c.commit();
        const o = opening(tool, s.room.id, s.side, s.off);
        c.p.openings.push(o); c.select({ type: "open", id: o.id }); c.changed();
      }
      return;
    }
    if (ITEM_KINDS[tool]) {
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
    if (d.type === "new") { this.preview = { x: Math.min(d.x0, snap(q.x)), y: Math.min(d.y0, snap(q.y)), w: Math.abs(snap(q.x) - d.x0), d: Math.abs(snap(q.y) - d.y0) }; }
    if (d.type === "room") { d.r.x = snap(d.o.x + q.x - d.x0); d.r.y = snap(d.o.y + q.y - d.y0); }
    if (d.type === "item") { d.i.x = snap(d.o.x + q.x - d.x0); d.i.y = snap(d.o.y + q.y - d.y0); }
    if (d.type === "open") {
      const r = this.ctx.p.rooms.find((x) => x.id === d.o.room);
      const h = d.o.side === "n" || d.o.side === "s";
      const len = h ? r.w : r.d, half = d.o.w / 2;
      d.o.off = Math.max(half, Math.min(len - half, snap(h ? q.x - r.x : q.y - r.y)));
    }
    if (d.type === "handle") {
      const dx = snap(q.x - d.x0), dy = snap(q.y - d.y0), r = d.r, o = d.o, min = 100;
      if (d.h === "e") r.w = Math.max(min, o.w + dx);
      if (d.h === "s") r.d = Math.max(min, o.d + dy);
      if (d.h === "w") { const w = Math.max(min, o.w - dx); r.x = o.x + o.w - w; r.w = w; }
      if (d.h === "n") { const h = Math.max(min, o.d - dy); r.y = o.y + o.d - h; r.d = h; }
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
    if (d.moved) this.ctx.changed(); else this.ctx.discardCommit();
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
      o.push(k.round
        ? `<circle ${attr} class="${cls}" style="fill:${k.color}" cx="${i.x}" cy="${i.y}" r="${k.w / 2}"><title>${k.name}</title></circle>`
        : `<rect ${attr} class="${cls}" style="fill:${k.color}" x="${i.x - k.w / 2}" y="${i.y - k.d / 2}" width="${k.w}" height="${k.d}"><title>${k.name}</title></rect>`);
    }
    if (sel?.type === "room" && tab === "plan") {
      const r = p.rooms.find((x) => x.id === sel.id);
      if (r) {
        const h = 22;
        for (const [n, x, y] of [["n", r.x + r.w / 2, r.y], ["s", r.x + r.w / 2, r.y + r.d], ["w", r.x, r.y + r.d / 2], ["e", r.x + r.w, r.y + r.d / 2]]) {
          o.push(`<rect data-t="handle" data-h="${n}" data-id="${r.id}" class="hd" x="${x - h / 2}" y="${y - h / 2}" width="${h}" height="${h}"/>`);
        }
      }
    }
    if (this.preview) {
      const v = this.preview;
      o.push(`<rect class="pv" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.d}"/>`);
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
  elec(o, e) { for (const s of e.segs) o.push(this.line(s.pts, "pe")); }
  plumb(o, w) {
    for (const s of w.sewer) o.push(this.line(s.pts, "ps", 0, s.dn === 110 ? 9 : 5));
    for (const s of w.cold) o.push(this.line(s.pts, "pc", -7));
    for (const s of w.hot) o.push(this.line(s.pts, "ph", 7));
  }
}
