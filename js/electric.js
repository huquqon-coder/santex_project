// Elektr tarmog'i: guruhlarga bo'lish, avtomat va kabel tanlash, kabel yo'li.
import { ROOM_TYPES } from "./model.js";
import { roomAt } from "./geometry.js";
import { buildGrid, routeTree } from "./route.js";

const WATT = { light: 40, socket: 200, power: 2000, switch: 0 };
const BREAKERS = [10, 16, 20, 25, 32, 40];
const CABLE = { 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10 };
const V = 220, MAX_SOCKETS = 6;

function buildGroups(p) {
  const pts = p.items.filter((i) => WATT[i.kind] !== undefined);
  const groups = [];
  const lights = pts.filter((i) => i.kind === "light" || i.kind === "switch");
  if (lights.length) groups.push({ name: "Yoritish", items: lights, wet: false });
  const wet = [], dry = [];
  for (const s of pts.filter((i) => i.kind === "socket")) {
    const r = roomAt(p, s.x, s.y);
    (r && (r.type === "bath" || r.type === "kitchen") ? wet : dry).push(s);
  }
  if (wet.length) groups.push({ name: "Oshxona va hammom rozetkalari", items: wet, wet: true });
  for (let i = 0; i < dry.length; i += MAX_SOCKETS) {
    groups.push({ name: `Rozetkalar ${Math.floor(i / MAX_SOCKETS) + 1}`, items: dry.slice(i, i + MAX_SOCKETS), wet: false });
  }
  pts.filter((i) => i.kind === "power").forEach((s, i) => {
    const r = roomAt(p, s.x, s.y);
    groups.push({ name: `Quvvatli liniya ${i + 1}${r ? `, ${r.name.toLowerCase()}` : ""}`, items: [s], wet: r?.type === "bath" });
  });
  return groups;
}

export function computeElectric(p) {
  const warnings = [];
  const panel = p.items.find((i) => i.kind === "panel");
  const groups = buildGroups(p);
  const out = { groups: [], warnings, segs: [], cable: {}, total: 0, inputA: 0 };
  if (!groups.length) return out;
  if (!panel) { warnings.push("Elektr shchiti qo'yilmagan, kabellar chizilmadi."); }
  const grid = panel ? buildGrid(p, { door: 3, wall: 2, outside: 4 }) : null;
  const dropM = Math.max(1, p.h / 100 - 0.3);
  for (const g of groups) {
    const P = g.items.reduce((a, i) => a + WATT[i.kind], 0);
    const I = (P * 1.1) / V;
    const br = BREAKERS.find((b) => b >= I && (g.name === "Yoritish" ? true : b >= 16)) || 40;
    const mm = CABLE[br];
    let len = 0, segs = [];
    if (panel) {
      const t = routeTree(grid, { x: panel.x, y: panel.y }, g.items.map((i) => ({ x: i.x, y: i.y })));
      if (!t.ok) warnings.push(`${g.name}: kabel yo'li topilmadi.`);
      segs = t.segs; len = t.length * 1.15 + g.items.length * dropM;
    }
    out.groups.push({ name: g.name, count: g.items.length, P, I, br, mm, len, rcd: g.wet, kind: g.items[0].kind });
    out.segs.push(...segs.map((s) => ({ ...s, mm })));
    out.cable[mm] = (out.cable[mm] || 0) + len;
    out.total += P;
  }
  out.demand = out.total * 0.6;
  out.inputA = BREAKERS.find((b) => b >= out.demand / V) || 63;
  for (const r of p.rooms) {
    if (!ROOM_TYPES[r.type].heated) continue;
    if (!p.items.some((i) => i.kind === "light" && i.x > r.x && i.x < r.x + r.w && i.y > r.y && i.y < r.y + r.d)) warnings.push(`${r.name}: chiroq yo'q.`);
  }
  return out;
}

export function electricBom(p, e) {
  if (!e.groups.length) return [];
  const G = "Elektr", n = (k) => p.items.filter((i) => i.kind === k).length;
  const rows = [];
  for (const mm of Object.keys(e.cable).sort((a, b) => a - b)) {
    rows.push({ g: G, k: "cable" + mm, name: "Mis kabel VVGng", spec: `3×${mm} mm²`, unit: "m", qty: Math.ceil(e.cable[mm]) });
  }
  const br = {};
  e.groups.forEach((g) => (br[g.br] = (br[g.br] || 0) + 1));
  for (const a of Object.keys(br)) rows.push({ g: G, k: "br" + a, name: "Avtomat", spec: `${a} A`, unit: "dona", qty: br[a] });
  rows.push({ g: G, k: "input", name: "Kirish avtomati", spec: `${e.inputA} A`, unit: "dona", qty: 1 });
  const rcd = e.groups.filter((g) => g.rcd).length;
  if (rcd) rows.push({ g: G, k: "rcd", name: "UZO, 30 mA", spec: "25 A", unit: "dona", qty: rcd });
  rows.push({ g: G, k: "box", name: "Elektr shchiti", spec: `${e.groups.length + 4} modul`, unit: "dona", qty: 1 });
  for (const [k, name] of [["socket", "Rozetka"], ["power", "Quvvatli rozetka"], ["switch", "Viklyuchatel"], ["light", "Chiroq"]]) {
    if (n(k)) rows.push({ g: G, k: "e_" + k, name, spec: "", unit: "dona", qty: n(k) });
  }
  const pts = n("socket") + n("power") + n("switch") + n("light");
  const cab = Object.values(e.cable).reduce((a, b) => a + b, 0);
  rows.push({ g: "Elektr ishi", k: "l_point", name: "Nuqtani o'rnatish", unit: "nuqta", qty: pts, labor: true });
  rows.push({ g: "Elektr ishi", k: "l_cable", name: "Kabel tortish", unit: "m", qty: Math.ceil(cab), labor: true });
  rows.push({ g: "Elektr ishi", k: "l_panel", name: "Shchitni yig'ish", unit: "dona", qty: 1, labor: true });
  return rows;
}
