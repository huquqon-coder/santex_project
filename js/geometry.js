// Rejadagi geometriya: devorlar, tashqi tomonlar, ochilmalar.
import { ROOM_TYPES } from "./model.js";

export const inRoom = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d;
export const roomAt = (p, x, y) => p.rooms.find((r) => inRoom(r, x, y)) || null;

export function bounds(p) {
  const t = p.wallT;
  if (!p.rooms.length) return { x0: 0, y0: 0, x1: 1000, y1: 800 };
  return {
    x0: Math.min(...p.rooms.map((r) => r.x)) - t,
    y0: Math.min(...p.rooms.map((r) => r.y)) - t,
    x1: Math.max(...p.rooms.map((r) => r.x + r.w)) + t,
    y1: Math.max(...p.rooms.map((r) => r.y + r.d)) + t,
  };
}

// Devor ichki yuzasining uzunligi va tashqariga yo'nalishi
export function sideInfo(r, side) {
  switch (side) {
    case "n": return { len: r.w, nx: 0, ny: -1, at: (o) => [r.x + o, r.y] };
    case "s": return { len: r.w, nx: 0, ny: 1, at: (o) => [r.x + o, r.y + r.d] };
    case "w": return { len: r.d, nx: -1, ny: 0, at: (o) => [r.x, r.y + o] };
    case "e": return { len: r.d, nx: 1, ny: 0, at: (o) => [r.x + r.w, r.y + o] };
  }
}
export const SIDES = ["n", "e", "s", "w"];

// Devor ortida isitiladigan xona bo'lmasa, nuqta tashqi hisoblanadi
export function isExterior(p, r, side, off) {
  const s = sideInfo(r, side);
  const [x, y] = s.at(off);
  const d = p.wallT + 8;
  const n = roomAt(p, x + s.nx * d, y + s.ny * d);
  return !n || !ROOM_TYPES[n.type].heated;
}

export function extLength(p, r, side) {
  const s = sideInfo(r, side);
  let n = 0;
  for (let o = 5; o < s.len; o += 10) if (isExterior(p, r, side, o)) n += 10;
  return Math.min(n, s.len);
}

export function openingRect(p, o) {
  const r = p.rooms.find((q) => q.id === o.room);
  if (!r) return null;
  const t = p.wallT;
  const a = o.off - o.w / 2;
  switch (o.side) {
    case "n": return { x: r.x + a, y: r.y - t, w: o.w, d: t, axis: "h" };
    case "s": return { x: r.x + a, y: r.y + r.d, w: o.w, d: t, axis: "h" };
    case "w": return { x: r.x - t, y: r.y + a, w: t, d: o.w, axis: "v" };
    case "e": return { x: r.x + r.w, y: r.y + a, w: t, d: o.w, axis: "v" };
  }
}

export function nearestSide(p, x, y) {
  let best = null;
  for (const r of p.rooms) {
    for (const side of SIDES) {
      const h = side === "n" || side === "s";
      const s = sideInfo(r, side);
      const off = h ? x - r.x : y - r.y;
      if (off < 0 || off > s.len) continue;
      const [ax, ay] = s.at(off);
      const dist = Math.hypot(x - ax, y - ay);
      if (dist < 90 && (!best || dist < best.dist)) best = { room: r, side, off: Math.round(off / 5) * 5, dist };
    }
  }
  return best;
}

// Devor kataklari: xonani t ga kengaytirib, xonalarning o'zini va ochilmalarni olib tashlaymiz
export function wallBoxes(p) {
  const b = bounds(p), c = 10, t = p.wallT;
  const nx = Math.round((b.x1 - b.x0) / c), ny = Math.round((b.y1 - b.y0) / c);
  const cell = new Uint8Array(nx * ny);
  const rects = p.openings.map((o) => openingRect(p, o)).filter(Boolean);
  for (let j = 0; j < ny; j++) {
    const y = b.y0 + (j + 0.5) * c;
    for (let i = 0; i < nx; i++) {
      const x = b.x0 + (i + 0.5) * c;
      if (p.rooms.some((r) => inRoom(r, x, y))) continue;
      if (!p.rooms.some((r) => x > r.x - t && x < r.x + r.w + t && y > r.y - t && y < r.y + r.d + t)) continue;
      if (rects.some((q) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.d)) continue;
      cell[j * nx + i] = 1;
    }
  }
  const boxes = [];
  let open = new Map();
  for (let j = 0; j <= ny; j++) {
    const next = new Map();
    if (j < ny) {
      for (let i = 0; i < nx; ) {
        if (!cell[j * nx + i]) { i++; continue; }
        let e = i;
        while (e < nx && cell[j * nx + e]) e++;
        const key = `${i}:${e}`;
        const prev = open.get(key);
        if (prev) { prev.d += c; next.set(key, prev); open.delete(key); }
        else next.set(key, { x: b.x0 + i * c, y: b.y0 + j * c, w: (e - i) * c, d: c });
        i = e;
      }
    }
    for (const q of open.values()) boxes.push(q);
    open = next;
  }
  return boxes;
}
