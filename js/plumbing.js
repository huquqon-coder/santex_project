// Santexnika: sovuq va issiq suv, kanalizatsiya yo'llari va diametrlari.
import { floorOf } from "./geometry.js";
import { multiFloor, segLen } from "./route.js";

const FIX = {
  sink: { cold: 1, hot: 1, drain: 50 },
  toilet: { cold: 1, hot: 0, drain: 110 },
  bathtub: { cold: 1, hot: 1, drain: 50 },
  shower: { cold: 1, hot: 1, drain: 50 },
  washer: { cold: 1, hot: 0, drain: 50 },
};

export function computePlumbing(p) {
  const warnings = [];
  const fx = p.items.filter((i) => FIX[i.kind] && floorOf(i) < (p.floors || 1));
  const inlet = p.items.find((i) => i.kind === "waterin");
  const out_ = p.items.find((i) => i.kind === "sewerout");
  const heater = p.items.find((i) => i.kind === "heater");
  const out = { warnings, cold: [], hot: [], sewer: [], risers: [], len: {}, sewerLen: {}, fixtures: fx.length, drop: 0 };
  if (!fx.length) return out;
  const G = { door: 25, wall: 3, outside: 2 }, cache = new Map();
  const size = (n) => (n > 5 ? 32 : n > 2 ? 25 : 20);
  const tag = (kind, q, dn) => {
    out.risers.push({ ...q, kind, dn });
    (kind === "sewer" ? out.sewerLen : out.len)[dn] = ((kind === "sewer" ? out.sewerLen : out.len)[dn] || 0) + q.len;
  };

  if (!inlet) warnings.push("Suv kirishi qo'yilmagan.");
  else {
    const targets = fx.filter((f) => FIX[f.kind].cold).map((f) => ({ x: f.x, y: f.y, load: 1, floor: floorOf(f) }));
    if (heater) targets.push({ x: heater.x, y: heater.y, load: 2, floor: floorOf(heater) });
    const t = multiFloor(p, inlet, targets, G, cache);
    if (!t.ok) warnings.push("Sovuq suv yo'li topilmadi.");
    out.cold = t.segs.map((s) => ({ ...s, dn: size(s.load), len: segLen(s) }));
    t.risers.forEach((q) => tag("cold", q, size(q.load)));
  }
  const hotFx = fx.filter((f) => FIX[f.kind].hot);
  if (hotFx.length && !heater) warnings.push("Issiq suv uchun suv isitkich qo'yilmagan.");
  else if (heater) {
    const t = multiFloor(p, heater, hotFx.map((f) => ({ x: f.x, y: f.y, load: 1, floor: floorOf(f) })), G, cache);
    out.hot = t.segs.map((s) => ({ ...s, dn: size(s.load), len: segLen(s) }));
    t.risers.forEach((q) => tag("hot", q, size(q.load)));
  }
  for (const s of [...out.cold, ...out.hot]) out.len[s.dn] = (out.len[s.dn] || 0) + s.len;

  if (!out_) warnings.push("Kanalizatsiya chiqishi qo'yilmagan.");
  else {
    const t = multiFloor(p, out_, fx.map((f) => ({ x: f.x, y: f.y, load: FIX[f.kind].drain === 110 ? 100 : 1, floor: floorOf(f) })), G, cache);
    if (!t.ok) warnings.push("Kanalizatsiya yo'li topilmadi.");
    t.risers.forEach((q) => tag("sewer", q, 110));
    out.sewer = t.segs.map((s) => {
      const dn = s.load >= 100 || s.load > 3 ? 110 : 50;
      return { ...s, dn, len: segLen(s), slope: dn === 110 ? 0.02 : 0.03 };
    });
    for (const s of out.sewer) out.sewerLen[s.dn] = (out.sewerLen[s.dn] || 0) + s.len;
    out.drop = Math.max(0, ...out.sewer.map((s) => s.len * s.slope)) + out.sewer.reduce((a, s) => a + s.len * s.slope, 0) * 0.5;
  }
  return out;
}

export function plumbingBom(p, w) {
  if (!w.fixtures) return [];
  const G = "Santexnika", rows = [];
  for (const dn of Object.keys(w.len).sort((a, b) => a - b)) rows.push({ g: G, k: "ppr" + dn, name: "PPR suv quvuri", spec: `Ø${dn}`, unit: "m", qty: Math.ceil(w.len[dn] * 1.1) });
  for (const dn of Object.keys(w.sewerLen).sort((a, b) => a - b)) rows.push({ g: G, k: "pvc" + dn, name: "PVX kanalizatsiya quvuri", spec: `Ø${dn}`, unit: "m", qty: Math.ceil(w.sewerLen[dn] * 1.1) });
  const live = p.items.filter((i) => floorOf(i) < (p.floors || 1));
  const sif = live.filter((i) => FIX[i.kind] && i.kind !== "toilet").length;
  if (sif) rows.push({ g: G, k: "trap", name: "Sifon", spec: "Ø50", unit: "dona", qty: sif });
  const names = { sink: "Rakovina", toilet: "Unitaz", bathtub: "Vanna", shower: "Dush", heater: "Suv isitkich" };
  for (const k of Object.keys(names)) {
    const n = live.filter((i) => i.kind === k).length;
    if (n) rows.push({ g: G, k: "f_" + k, name: names[k], spec: "", unit: "dona", qty: n });
  }
  const L = [...Object.values(w.len), ...Object.values(w.sewerLen)].reduce((a, b) => a + b, 0);
  rows.push({ g: "Santexnika ishi", k: "l_fix", name: "Jihozni ulash", unit: "dona", qty: w.fixtures, labor: true });
  rows.push({ g: "Santexnika ishi", k: "l_wpipe", name: "Suv va kanalizatsiya quvuri yotqizish", unit: "m", qty: Math.ceil(L * 1.1), labor: true });
  return rows;
}
