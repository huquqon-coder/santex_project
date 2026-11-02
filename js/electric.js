// Elektr tarmog'i: guruhlar, avtomat va kabel tanlash, korobkali yoki shleyf montaj.
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

// Korobka joyi: nuqtalar markaziga eng yaqin devor bo'yida, shift ostida
function autoBoxSpot(r, pts) {
  const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length, cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
  const opts = [[cx, r.y + 15, cy - r.y], [cx, r.y + r.d - 15, r.y + r.d - cy], [r.x + 15, cy, cx - r.x], [r.x + r.w - 15, cy, r.x + r.w - cx]];
  const [x, y] = opts.sort((a, b) => a[2] - b[2])[0];
  return { x, y };
}

function wire(p, g, panel, grid, boxMode, boxes) {
  const dropM = Math.max(1, p.h / 100 - 0.3);
  const segs = [];
  let len = 0, ok = true;
  const trunkTargets = [], direct = [];
  if (boxMode && g.items.length > 1) {
    const byRoom = new Map();
    for (const i of g.items) {
      const r = roomAt(p, i.x, i.y);
      const k = r ? r.id : "-";
      if (!byRoom.has(k)) byRoom.set(k, { r, pts: [] });
      byRoom.get(k).pts.push(i);
    }
    for (const { r, pts } of byRoom.values()) {
      if (!r || pts.length < 2) { direct.push(...pts); continue; }
      const manual = p.items.find((i) => i.kind === "jbox" && roomAt(p, i.x, i.y) === r);
      const spot = manual || autoBoxSpot(r, pts);
      boxes.push({ x: spot.x, y: spot.y, manual: !!manual, id: manual?.id, room: r.name, title: `Korobka: ${r.name}, ${g.name}`, points: pts.length });
      trunkTargets.push({ x: spot.x, y: spot.y });
      // Har bir nuqta korobkadan alohida kabel oladi
      for (const q of pts) {
        const t = routeTree(grid, spot, [{ x: q.x, y: q.y }]);
        ok = ok && t.ok;
        len += t.length * 1.15 + dropM;
        segs.push(...t.segs.map((s) => ({ ...s, branch: true })));
      }
    }
  } else direct.push(...g.items);
  const t = routeTree(grid, { x: panel.x, y: panel.y }, [...trunkTargets, ...direct.map((i) => ({ x: i.x, y: i.y }))]);
  ok = ok && t.ok;
  len += t.length * 1.15 + direct.length * dropM;
  segs.push(...t.segs);
  return { segs, len, ok };
}

export function computeElectric(p) {
  const warnings = [];
  const panel = p.items.find((i) => i.kind === "panel");
  const groups = buildGroups(p);
  const boxMode = p.elecMode !== "loop";
  const out = { groups: [], warnings, segs: [], cable: {}, total: 0, inputA: 0, boxes: [], boxMode, altLen: 0, len: 0 };
  if (!groups.length) return out;
  if (!panel) warnings.push("Elektr shchiti qo'yilmagan, kabellar chizilmadi.");
  const grid = panel ? buildGrid(p, { door: 3, wall: 2, outside: 4 }) : null;
  for (const g of groups) {
    const P = g.items.reduce((a, i) => a + WATT[i.kind], 0);
    const I = (P * 1.1) / V;
    const br = BREAKERS.find((b) => b >= I && (g.name === "Yoritish" ? true : b >= 16)) || 40;
    const mm = CABLE[br];
    let len = 0;
    if (panel) {
      const w = wire(p, g, panel, grid, boxMode, out.boxes);
      if (!w.ok) warnings.push(`${g.name}: kabel yo'li topilmadi.`);
      len = w.len;
      out.segs.push(...w.segs);
      out.altLen += wire(p, g, panel, grid, !boxMode, []).len;
    }
    out.groups.push({ name: g.name, count: g.items.length, P, I, br, mm, len, rcd: g.wet, kind: g.items[0].kind });
    out.cable[mm] = (out.cable[mm] || 0) + len;
    out.total += P;
    out.len += len;
  }
  out.demand = out.total * 0.6;
  out.inputA = BREAKERS.find((b) => b >= out.demand / V) || 63;
  for (const b of p.items.filter((i) => i.kind === "jbox")) {
    if (boxMode && !roomAt(p, b.x, b.y)) warnings.push("Korobka xona ichiga qo'yilishi kerak.");
  }
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
  if (e.boxes.length) {
    const wires = e.boxes.reduce((a, b) => a + b.points + 1, 0);
    rows.push({ g: G, k: "jbox", name: "Taqsimlash korobkasi", spec: "100×100 mm", unit: "dona", qty: e.boxes.length });
    rows.push({ g: G, k: "wago", name: "Ulash klemmasi", spec: "5 kontaktli", unit: "dona", qty: Math.ceil((wires * 3) / 4) });
  }
  for (const [k, name] of [["socket", "Rozetka"], ["power", "Quvvatli rozetka"], ["switch", "Viklyuchatel"], ["light", "Chiroq"]]) {
    if (n(k)) rows.push({ g: G, k: "e_" + k, name, spec: "", unit: "dona", qty: n(k) });
  }
  const pts = n("socket") + n("power") + n("switch") + n("light");
  rows.push({ g: "Elektr ishi", k: "l_point", name: "Nuqtani o'rnatish", unit: "nuqta", qty: pts, labor: true });
  rows.push({ g: "Elektr ishi", k: "l_cable", name: "Kabel tortish", unit: "m", qty: Math.ceil(e.len), labor: true });
  if (e.boxes.length) rows.push({ g: "Elektr ishi", k: "l_jbox", name: "Korobkani o'rnatish va ulash", unit: "dona", qty: e.boxes.length, labor: true });
  rows.push({ g: "Elektr ishi", k: "l_panel", name: "Shchitni yig'ish", unit: "dona", qty: 1, labor: true });
  return rows;
}
