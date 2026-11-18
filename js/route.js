// Quvur va kabellarni to'r bo'ylab yo'naltirish. Devor yonidan yuradi, devorni kamroq teshadi.
import { bounds, floorList, floorOf, fv, inRoom, openingRect } from "./geometry.js";

const SIZE = 20;

export function buildGrid(p, { door = 30, wall = 4, outside = 3 } = {}) {
  const b = { ...bounds(p) };
  // Uydan tashqaridagi jihozlar (bochka, chiqish) ham to'r ichida bo'lsin
  for (const i of p.items) { b.x0 = Math.min(b.x0, i.x); b.x1 = Math.max(b.x1, i.x); b.y0 = Math.min(b.y0, i.y); b.y1 = Math.max(b.y1, i.y); }
  const x0 = b.x0 - 200, y0 = b.y0 - 200;
  const nx = Math.ceil((b.x1 - b.x0 + 400) / SIZE), ny = Math.ceil((b.y1 - b.y0 + 400) / SIZE);
  const cost = new Float32Array(nx * ny);
  const rects = p.openings.map((o) => ({ o, q: openingRect(p, o) })).filter((e) => e.q);
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * SIZE;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * SIZE;
      const r = p.rooms.find((q) => inRoom(q, x, y));
      let c;
      if (r) {
        const edge = Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.d - y);
        c = edge < 35 ? 0.7 : 1.1;
      } else {
        const inWall = p.rooms.some((q) => x > q.x - p.wallT && x < q.x + q.w + p.wallT && y > q.y - p.wallT && y < q.y + q.d + p.wallT);
        c = inWall ? wall : outside;
      }
      for (const { o, q } of rects) {
        if (x > q.x - 20 && x < q.x + q.w + 20 && y > q.y - 20 && y < q.y + q.d + 20) {
          if (o.kind !== "window") c = Math.max(c, door);
        }
      }
      cost[j * nx + i] = c;
    }
  }
  return { x0, y0, nx, ny, cost };
}

const toCell = (g, x, y) => {
  const i = Math.max(0, Math.min(g.nx - 1, Math.floor((x - g.x0) / SIZE)));
  const j = Math.max(0, Math.min(g.ny - 1, Math.floor((y - g.y0) / SIZE)));
  return j * g.nx + i;
};
const cellXY = (g, c) => [g.x0 + (c % g.nx + 0.5) * SIZE, g.y0 + (Math.floor(c / g.nx) + 0.5) * SIZE];

class Heap {
  constructor() { this.a = []; }
  push(c, k) {
    const a = this.a; a.push([k, c]); let i = a.length - 1;
    while (i > 0) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        let m = i; const l = 2 * i + 1, r = l + 1;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

// Burilishni hisobga oluvchi qidiruv: holat = katak va kelgan yo'nalish, har burilishga g.turn jarima
function pathToNetTurns(g, start, inNet) {
  const T = g.turn, N = g.cost.length, D = [-1, 1, -g.nx, g.nx];
  const dist = new Float64Array(N * 5).fill(Infinity), prev = new Int32Array(N * 5).fill(-1);
  const h = new Heap(), s0 = start * 5 + 4;
  dist[s0] = 0; h.push(s0, 0);
  while (h.size) {
    const [d, s] = h.pop();
    if (d > dist[s]) continue;
    const c = Math.floor(s / 5), dir = s % 5;
    if (inNet.has(c)) {
      const path = [c];
      for (let q = prev[s]; q !== -1; q = prev[q]) path.push(Math.floor(q / 5));
      return path;
    }
    const i = c % g.nx;
    for (let k = 0; k < 4; k++) {
      const n = c + D[k];
      if (n < 0 || n >= N || (k === 0 && i === 0) || (k === 1 && i === g.nx - 1)) continue;
      const ns = n * 5 + k, nd = d + g.cost[n] + (dir !== 4 && dir !== k ? T : 0);
      if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = s; h.push(ns, nd); }
    }
  }
  return null;
}

function pathToNet(g, start, inNet) {
  if (g.turn) return pathToNetTurns(g, start, inNet);
  const dist = new Float64Array(g.cost.length).fill(Infinity), prev = new Int32Array(g.cost.length).fill(-1);
  const h = new Heap();
  dist[start] = 0; h.push(start, 0);
  while (h.size) {
    const [d, c] = h.pop();
    if (d > dist[c]) continue;
    if (inNet.has(c)) {
      const path = [c];
      for (let q = prev[c]; q !== -1; q = prev[q]) path.push(q);
      return path; // tarmoqdan nuqtaga
    }
    const i = c % g.nx;
    for (const n of [i > 0 ? c - 1 : -1, i < g.nx - 1 ? c + 1 : -1, c - g.nx, c + g.nx]) {
      if (n < 0 || n >= g.cost.length) continue;
      const nd = d + g.cost[n];
      if (nd < dist[n]) { dist[n] = nd; prev[n] = c; h.push(n, nd); }
    }
  }
  return null;
}

// Ildizdan nuqtalargacha daraxt. Har bir qirra orqali o'tuvchi yukni ham hisoblaydi.
// walk(load) berilsa, har bir nuqtadan ildizgacha metr boshiga shu qiymat yig'iladi (masalan, nishablik).
export function routeTree(g, root, targets, walk) {
  const rootC = toCell(g, root.x, root.y);
  const net = new Set([rootC]), parent = new Map();
  const order = targets
    .map((t) => ({ t, c: toCell(g, t.x, t.y), far: Math.hypot(t.x - root.x, t.y - root.y) }))
    .sort((a, b) => a.far - b.far);
  const lines = [];
  for (const e of order) {
    if (net.has(e.c)) continue;
    const path = pathToNet(g, e.c, net);
    if (!path) continue;
    for (let k = 1; k < path.length; k++) { parent.set(path[k], path[k - 1]); net.add(path[k]); }
    lines.push(path);
  }
  const load = new Map();
  for (const e of order) {
    for (let c = e.c; parent.has(c); c = parent.get(c)) load.set(c, (load.get(c) || 0) + (e.t.load || 0));
  }
  const segs = [];
  for (const path of lines) {
    let run = null;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k], l = load.get(b) || 0;
      const A = cellXY(g, a), B = cellXY(g, b);
      if (run && run.load === l) run.pts.push(B);
      else { run = { load: l, pts: [A, B] }; segs.push(run); }
    }
  }
  for (const s of segs) s.pts = simplify(s.pts);
  const length = (parent.size * SIZE) / 100;
  if (walk) for (const e of order) {
    let s = 0, n = 0;
    for (let c = e.c; parent.has(c); c = parent.get(c)) { s += walk(load.get(c) || 0) * SIZE / 100; n++; }
    e.t.walk = s; e.t.path = n * SIZE / 100;
  }
  return { segs, length, ok: order.every((e) => net.has(e.c)) };
}

function simplify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [out[out.length - 1], pts[i], pts[i + 1]];
    if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const segLen = (s) => s.len ?? s.pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - s.pts[i][0], q[1] - s.pts[i][1]), 0) / 100;

// Stoyak joyi: qo'yilgan bo'lsa o'sha, bo'lmasa ildizga eng yaqin xona burchagi
export function riserPoint(p, root, f) {
  const set = p.items.find((i) => i.kind === "riser");
  if (set) return { x: set.x, y: set.y, auto: false };
  let best = null;
  for (const r of fv(p, f).rooms) {
    const x = Math.max(r.x + 15, Math.min(r.x + r.w - 15, root.x)), y = Math.max(r.y + 15, Math.min(r.y + r.d - 15, root.y));
    const d = Math.hypot(x - root.x, y - root.y);
    if (!best || d < best.d) best = { x, y, d, auto: true };
  }
  return best || { x: root.x, y: root.y, auto: true };
}

// Ildizdan barcha qavatlardagi nuqtalargacha: har qavatda daraxt, qavatlar orasi stoyak orqali
export function multiFloor(p, root, targets, opts = {}, cache = new Map(), walk) {
  const base = floorOf(root), height = (p.h + (p.slab ?? 30)) / 100;
  const grid = (f) => {
    const key = f + JSON.stringify(opts);
    if (!cache.has(key)) cache.set(key, Object.assign(buildGrid(fv(p, f), opts), { turn: opts.turn || 0 }));
    return cache.get(key);
  };
  const segs = [], risers = [];
  let ok = true, length = 0;
  for (const f of floorList(p)) {
    if (f === base) continue;
    const list = targets.filter((t) => floorOf(t) === f);
    if (!list.length) continue;
    const pt = riserPoint(p, root, f);
    const load = list.reduce((a, t) => a + (t.load || 0), 0);
    const r = routeTree(grid(f), pt, list, walk);
    ok = ok && r.ok; length += r.length + height * Math.abs(f - base);
    segs.push(...r.segs.map((s) => ({ ...s, floor: f })));
    risers.push({ x: pt.x, y: pt.y, from: base, to: f, load, len: height * Math.abs(f - base), auto: pt.auto });
  }
  const here = targets.filter((t) => floorOf(t) === base);
  const all = [...here, ...risers.map((q) => ({ x: q.x, y: q.y, load: q.load }))];
  const r = routeTree(grid(base), root, all, walk);
  ok = ok && r.ok; length += r.length;
  segs.push(...r.segs.map((s) => ({ ...s, floor: base })));
  risers.forEach((q, i) => { q.walk = all[here.length + i].walk; });
  return { segs, risers, ok, length };
}
