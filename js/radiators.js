// Radiator turlari va ularning issiqlik berishi. Qiymatlar ΔT 50 °C uchun taxminiy, aniq modelning pasportini tekshiring.
export const RAD_KINDS = {
  cast: { name: "Cho'yan seksiyali", sectional: true, q50: 103, secW: 9.3, depth: 14, h: 58, litre: 1.45 },
  bimetal: { name: "Bimetall seksiyali", sectional: true, q50: 135, secW: 8, depth: 8, h: 56, litre: 0.2 },
  panel: { name: "Po'lat panel", sectional: false },
};
export const PANEL_TYPES = [11, 22, 33];
export const PANEL_HEIGHTS = [300, 500, 600];
const PANEL_W = { 11: 750, 22: 1450, 33: 2060 };   // W/m, balandligi 500 mm
const PANEL_K = { 300: 0.62, 500: 1, 600: 1.16 };
export const PANEL_DEPTH = { 11: 6.5, 22: 10, 33: 15.5 };
const MAX_SEC = 14, MAX_PANEL = 160;

const rate = (dT, n) => Math.pow(Math.max(dT, 1) / 50, n);

// Bitta radiatorning eng katta quvvati: xonaga nechta radiator kerakligini aniqlash uchun
export function unitMax(kind, p, dT) {
  const k = RAD_KINDS[kind];
  if (k.sectional) return MAX_SEC * k.q50 * rate(dT, 1.3);
  return (MAX_PANEL / 100) * PANEL_W[p.panelType || 22] * PANEL_K[p.panelH || 500] * rate(dT, 1.33);
}

// Radiator o'lchami: qo'lda berilgan bo'lsa o'sha, bo'lmasa kerakli quvvatdan
export function sizeRad(e, p, need, dT) {
  const kind = e.kind || p.radType || "cast", k = RAD_KINDS[kind];
  if (k.sectional) {
    const qs = k.q50 * rate(dT, 1.3);
    const sec = e.size || Math.max(3, Math.ceil(need / qs));
    return { kind, sec, w: sec * k.secW, h: k.h, depth: k.depth, power: sec * qs, label: `${sec} seks.`, short: `${sec}s`, litre: sec * k.litre, auto: !e.size };
  }
  const ptype = e.ptype || p.panelType || 22, ph = e.ph || p.panelH || 500;
  const qm = PANEL_W[ptype] * PANEL_K[ph] * rate(dT, 1.33);
  const len = e.size || Math.min(300, Math.max(40, Math.ceil((need / qm) * 10) * 10));
  return {
    kind, ptype, ph, len, w: len, h: ph / 10 + 4, depth: PANEL_DEPTH[ptype], power: (qm * len) / 100,
    label: `${ptype}-${ph}-${len * 10}`, short: `${ptype}/${len}`, litre: (len / 100) * (ptype / 11) * 2.5, auto: !e.size,
  };
}
