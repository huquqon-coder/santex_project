// Iliq pol: issiqlik berishi, quvur uzunligi va konturlar. Qiymatlar taxminiy, quvur PEX 16×2.
import { kindOf } from "./model.js";
import { fv, nearestWall } from "./geometry.js";

// Ostiga iliq pol yotqizilmaydigan jihozlar: vanna, dush poddoni, unitaz, kir mashinasi va boshqalar
const FIXED = new Set(["bathtub", "shower", "toilet", "squat", "wudu", "washer", "tank", "boiler", "stairs"]);
const GAP = 5; // jihoz chetidan quvurgacha, sm

// Jihozning poldagi to'g'ri to'rtburchagi; devor yonidagisi devorga qarab buriladi
export function footprint(p, i) {
  const k = kindOf(i);
  let w = k.w, d = k.d;
  if (i.kind === "stairs") { if (i.rot) [w, d] = [d, w]; }
  else if (k.btype !== "corner") {
    const n = nearestWall(p, i.x, i.y);
    if (n.d !== undefined && n.d <= Math.max(w, d) / 2 + 40 && n.ix) [w, d] = [d, w];
  }
  return { x: i.x - w / 2, y: i.y - d / 2, w, d };
}
export function ufhBlocks(p, r) {
  const f = r.floor || 0, v = fv(p, f);
  return v.items.filter((i) => FIXED.has(i.kind) && (i.kind !== "stairs" || (i.floor || 0) === f)).map((i) => footprint(v, i))
    .map((b) => ({ x0: Math.max(r.x, b.x - GAP), y0: Math.max(r.y, b.y - GAP), x1: Math.min(r.x + r.w, b.x + b.w + GAP), y1: Math.min(r.y + r.d, b.y + b.d + GAP) }))
    .filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
}
// Bir-birini qoplagan to'rtburchaklar maydoni, sm²
function unionArea(bs) {
  const xs = [...new Set(bs.flatMap((b) => [b.x0, b.x1]))].sort((a, b) => a - b);
  let s = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1];
    const iv = bs.filter((q) => q.x0 <= a && q.x1 >= b).map((q) => [q.y0, q.y1]).sort((p, q) => p[0] - q[0]);
    let len = 0, cur = null;
    for (const [y0, y1] of iv) {
      if (!cur || y0 > cur[1]) { if (cur) len += cur[1] - cur[0]; cur = [y0, y1]; } else cur[1] = Math.max(cur[1], y1);
    }
    if (cur) len += cur[1] - cur[0];
    s += len * (b - a);
  }
  return s;
}
export const COVERS = {
  tile: { name: "Kafel yoki tosh", k: 1 },
  laminate: { name: "Laminat yoki parket", k: 0.75 },
  carpet: { name: "Gilam", k: 0.6 },
};
export const STEPS = [10, 15, 20, 25];
const K_STEP = { 10: 6.5, 15: 5.6, 20: 4.8, 25: 4.2 }; // W/m²K, kafel ostida
export const MAX_LOOP = 100;   // bitta kontur uzunligi, m
const ACTIVE = 0.85;           // mebel va chetlar uchun 15 % joy qoldiriladi

export function ufhRoom(r, p, ti) {
  const [ts, tr] = (p.ufhRegime || "45/35").split("/").map(Number);
  const tm = (ts + tr) / 2;
  const step = r.ufhStep || p.ufhStep || 15, cover = r.ufhCover || p.ufhCover || "tile";
  const blocks = ufhBlocks(p, r);
  const area = Math.max(0, (r.w * r.d - unionArea(blocks)) / 1e4) * ACTIVE;
  // Pol yuzasi xonada 29 °C, hammomda 33 °C dan issiq bo'lmasligi kerak
  const qMax = 8.92 * Math.pow(Math.max(1, (r.type === "bath" ? 33 : 29) - ti), 1.1);
  const q = Math.min(qMax, K_STEP[step] * COVERS[cover].k * Math.max(0, tm - ti));
  const len = area / (step / 100);
  return { area, q, power: q * area, step, cover, len, limited: q >= qMax - 0.01, blocks };
}

// Kontur shakli: xona eni bo'ylab ilon izi, har kontur o'z bo'lagida.
// Jihoz turgan joyda qator uziladi va quvur jihoz chetidan qaytadi.
export function meander(r, step, loops, blocks = []) {
  const pad = 15, x0 = r.x + pad, y0 = r.y + pad, w = r.w - 2 * pad, d = r.d - 2 * pad;
  const along = w >= d, out = [];
  const gap = Math.max(step, 12);
  // Qator bo'ylab o'q: along bo'lsa x, aks holda y; qatorlar ko'ndalang o'qda
  const [u0, u1] = along ? [x0, x0 + w] : [y0, y0 + d];
  const cut = blocks.map((b) => (along ? { a: b.x0, b: b.x1, c0: b.y0, c1: b.y1 } : { a: b.y0, b: b.y1, c0: b.x0, c1: b.x1 }));
  const free = (c) => {
    let iv = [[u0, u1]];
    for (const q of cut.filter((q) => c > q.c0 && c < q.c1)) {
      iv = iv.flatMap(([s, e]) => [[s, Math.min(e, q.a)], [Math.max(s, q.b), e]]).filter(([s, e]) => e - s > gap);
    }
    return iv;
  };
  const P = (u, c) => (along ? [u, c] : [c, u]);
  const span = along ? d : w, c0 = along ? y0 : x0;
  for (let k = 0; k < loops; k++) {
    const a = c0 + (span / loops) * k, b = a + span / loops, rows = [];
    for (let c = a + gap / 2; c < b; c += gap) rows.push({ c, iv: free(c) });
    rows.forEach((row, n) => {
      for (const [s, e] of row.iv) out.push([P(s, row.c), P(e, row.c)]);
      const next = rows[n + 1];
      if (!next) return;
      // Navbatma-navbat o'ng va chap uchlarda keyingi qatorga burilish
      // Jihoz chetida qator qisqarsa ham burilish keyingi qatorga tushadi
      for (const u of row.iv.map((q) => q[n % 2 ? 0 : 1])) {
        if (next.iv.some(([s, e]) => u >= s - 1 && u <= e + 1)) out.push([P(u, row.c), P(u, next.c)]);
      }
    });
  }
  return out;
}

// Kollektorga eng yaqin xona chekkasi: konturning kirish nuqtasi
export function entryPoint(r, m) {
  return {
    x: Math.max(r.x + 20, Math.min(r.x + r.w - 20, m.x)),
    y: Math.max(r.y + 20, Math.min(r.y + r.d - 20, m.y)),
  };
}
