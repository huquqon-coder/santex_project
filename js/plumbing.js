// Santexnika: sovuq va issiq suv, kanalizatsiya yo'llari va diametrlari.
import { buildGrid, routeTree, segLen } from "./route.js";

const FIX = {
  sink: { cold: 1, hot: 1, drain: 50 },
  toilet: { cold: 1, hot: 0, drain: 110 },
  bathtub: { cold: 1, hot: 1, drain: 50 },
  shower: { cold: 1, hot: 1, drain: 50 },
  washer: { cold: 1, hot: 0, drain: 50 },
};

export function computePlumbing(p) {
  const warnings = [];
  const fx = p.items.filter((i) => FIX[i.kind]);
  const inlet = p.items.find((i) => i.kind === "waterin");
  const out_ = p.items.find((i) => i.kind === "sewerout");
  const heater = p.items.find((i) => i.kind === "heater");
  const out = { warnings, cold: [], hot: [], sewer: [], len: {}, sewerLen: {}, fixtures: fx.length, drop: 0 };
  if (!fx.length) return out;
  const grid = buildGrid(p, { door: 25, wall: 3, outside: 2 });
  const size = (n) => (n > 5 ? 32 : n > 2 ? 25 : 20);

  if (!inlet) warnings.push("Suv kirishi qo'yilmagan.");
  else {
    const targets = fx.filter((f) => FIX[f.kind].cold).map((f) => ({ x: f.x, y: f.y, load: 1 }));
    if (heater) targets.push({ x: heater.x, y: heater.y, load: 2 });
    const t = routeTree(grid, inlet, targets);
    if (!t.ok) warnings.push("Sovuq suv yo'li topilmadi.");
    out.cold = t.segs.map((s) => ({ ...s, dn: size(s.load), len: segLen(s) }));
  }
  const hotFx = fx.filter((f) => FIX[f.kind].hot);
  if (hotFx.length && !heater) warnings.push("Issiq suv uchun suv isitkich qo'yilmagan.");
  else if (heater) {
    const t = routeTree(grid, heater, hotFx.map((f) => ({ x: f.x, y: f.y, load: 1 })));
    out.hot = t.segs.map((s) => ({ ...s, dn: size(s.load), len: segLen(s) }));
  }
  for (const s of [...out.cold, ...out.hot]) out.len[s.dn] = (out.len[s.dn] || 0) + s.len;

  if (!out_) warnings.push("Kanalizatsiya chiqishi qo'yilmagan.");
  else {
    const t = routeTree(grid, out_, fx.map((f) => ({ x: f.x, y: f.y, load: FIX[f.kind].drain === 110 ? 100 : 1 })));
    if (!t.ok) warnings.push("Kanalizatsiya yo'li topilmadi.");
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
  const sif = p.items.filter((i) => FIX[i.kind] && i.kind !== "toilet").length;
  if (sif) rows.push({ g: G, k: "trap", name: "Sifon", spec: "Ø50", unit: "dona", qty: sif });
  const names = { sink: "Rakovina", toilet: "Unitaz", bathtub: "Vanna", shower: "Dush", heater: "Suv isitkich" };
  for (const k of Object.keys(names)) {
    const n = p.items.filter((i) => i.kind === k).length;
    if (n) rows.push({ g: G, k: "f_" + k, name: names[k], spec: "", unit: "dona", qty: n });
  }
  const L = [...Object.values(w.len), ...Object.values(w.sewerLen)].reduce((a, b) => a + b, 0);
  rows.push({ g: "Santexnika ishi", k: "l_fix", name: "Jihozni ulash", unit: "dona", qty: w.fixtures, labor: true });
  rows.push({ g: "Santexnika ishi", k: "l_wpipe", name: "Suv va kanalizatsiya quvuri yotqizish", unit: "m", qty: Math.ceil(L * 1.1), labor: true });
  return rows;
}
