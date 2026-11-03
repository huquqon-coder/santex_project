// Iliq pol: issiqlik berishi, quvur uzunligi va konturlar. Qiymatlar taxminiy, quvur PEX 16×2.
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
  const area = ((r.w * r.d) / 1e4) * ACTIVE;
  // Pol yuzasi xonada 29 °C, hammomda 33 °C dan issiq bo'lmasligi kerak
  const qMax = 8.92 * Math.pow(Math.max(1, (r.type === "bath" ? 33 : 29) - ti), 1.1);
  const q = Math.min(qMax, K_STEP[step] * COVERS[cover].k * Math.max(0, tm - ti));
  const len = area / (step / 100);
  return { area, q, power: q * area, step, cover, len, limited: q >= qMax - 0.01 };
}

// Kontur shakli: xona eni bo'ylab ilon izi, har kontur o'z bo'lagida
export function meander(r, step, loops) {
  const pad = 15, x0 = r.x + pad, y0 = r.y + pad, w = r.w - 2 * pad, d = r.d - 2 * pad;
  const along = w >= d, out = [];
  const gap = Math.max(step, 12);
  for (let k = 0; k < loops; k++) {
    const pts = [];
    if (along) {
      const a = y0 + (d / loops) * k, b = a + d / loops;
      let left = true;
      for (let y = a + gap / 2; y < b; y += gap, left = !left) pts.push(left ? [x0, y] : [x0 + w, y], left ? [x0 + w, y] : [x0, y]);
    } else {
      const a = x0 + (w / loops) * k, b = a + w / loops;
      let top = true;
      for (let x = a + gap / 2; x < b; x += gap, top = !top) pts.push(top ? [x, y0] : [x, y0 + d], top ? [x, y0 + d] : [x, y0]);
    }
    out.push(pts);
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
