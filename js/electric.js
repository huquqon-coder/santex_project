// Elektr tarmog'i: guruhlar, avtomat va kabel tanlash, korobkali yoki shleyf montaj.
import { LIGHT_TYPES, ROOM_TYPES } from "./model.js";
import { floorList, floorOf, fv, roomAt } from "./geometry.js";
import { buildGrid, multiFloor, routeTree } from "./route.js";

const WATT = { socket: 200, power: 2000, switch: 0 };
export const watts = (i) => i.watts ?? (i.kind === "light" ? lightOf(i).w * (i.n ?? lightOf(i).n) : WATT[i.kind]);
export const lightOf = (i) => LIGHT_TYPES[i.ltype] || LIGHT_TYPES.ledpanel;
const POINTS = new Set(["light", "switch", "socket", "power"]);
const BREAKERS = [10, 16, 20, 25, 32, 40];
export const SECTIONS = [1.5, 2.5, 4, 6, 10];
// Avtomat bo'yicha eng kichik kesim: alyuminiy mis'dan bir pog'ona yo'g'on
const CABLE = {
  cu: { 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10 },
  al: { 10: 2.5, 16: 2.5, 20: 4, 25: 4, 32: 6, 40: 10 },
};
export const METALS = { cu: { name: "Mis", rho: 0.0175, cable: "VVGng" }, al: { name: "Alyuminiy", rho: 0.028, cable: "AVVGng" } };
const V = 220, MAX_SOCKETS = 6;
const GRID = { door: 3, wall: 2, outside: 4 };

function buildGroups(v, f, many) {
  const suffix = many ? `, ${f + 1}-qavat` : "";
  const pts = v.items.filter((i) => POINTS.has(i.kind));
  const groups = [];
  const lights = pts.filter((i) => i.kind === "light" || i.kind === "switch");
  if (lights.length) groups.push({ name: "Yoritish" + suffix, items: lights, wet: false, light: true });
  const wet = [], dry = [];
  for (const s of pts.filter((i) => i.kind === "socket")) {
    const r = roomAt(v, s.x, s.y);
    (r && (r.type === "bath" || r.type === "kitchen") ? wet : dry).push(s);
  }
  if (wet.length) groups.push({ name: "Oshxona va hammom rozetkalari" + suffix, items: wet, wet: true });
  for (let i = 0; i < dry.length; i += MAX_SOCKETS) {
    groups.push({ name: `Rozetkalar ${Math.floor(i / MAX_SOCKETS) + 1}${suffix}`, items: dry.slice(i, i + MAX_SOCKETS), wet: false });
  }
  pts.filter((i) => i.kind === "power").forEach((s, i) => {
    const r = roomAt(v, s.x, s.y);
    groups.push({ name: `Quvvatli liniya ${i + 1}${r ? `, ${r.name.toLowerCase()}` : ""}${suffix}`, items: [s], wet: r?.type === "bath" });
  });
  return groups.map((g) => ({ ...g, floor: f }));
}

// Korobka joyi: nuqtalar markaziga eng yaqin devor bo'yida, shift ostida
function autoBoxSpot(r, pts) {
  const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length, cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
  const opts = [[cx, r.y + 15, cy - r.y], [cx, r.y + r.d - 15, r.y + r.d - cy], [r.x + 15, cy, cx - r.x], [r.x + r.w - 15, cy, r.x + r.w - cx]];
  const [x, y] = opts.sort((a, b) => a[2] - b[2])[0];
  return { x, y };
}

// Viklyuchatel va chiroqlar bog'lanishi: qo'lda tanlangan, bo'lmasa o'sha xonadagi, bo'lmasa 4 m ichidagi eng yaqin viklyuchatel
function controls(p, labels) {
  const map = new Map(), sw = new Map();
  for (const f of floorList(p)) {
    const v = fv(p, f), switches = v.items.filter((i) => i.kind === "switch");
    for (const l of v.items.filter((i) => i.kind === "light")) {
      const r = roomAt(v, l.x, l.y), d = (s) => Math.hypot(s.x - l.x, s.y - l.y);
      let s = switches.find((x) => x.id === l.sw);
      if (!s) s = switches.filter((x) => r && roomAt(v, x.x, x.y) === r).sort((a, b) => d(a) - d(b))[0];
      if (!s) s = switches.filter((x) => d(x) < 400).sort((a, b) => d(a) - d(b))[0];
      if (!s) continue;
      if (!sw.has(s.id)) sw.set(s.id, []);
      sw.get(s.id).push(l);
    }
  }
  // 1 yoki 2 klavish: ikkitadan ko'p chiroq bo'lsa ikkinchi klavish qolganlarini yoqadi
  for (const [id, lights] of sw) {
    const keys = Math.min(2, lights.length);
    lights.forEach((l, k) => map.set(l.id, { sw: id, bus: keys > 1 ? `${labels.get(id)}.${Math.min(k, 1) + 1}` : labels.get(id) }));
    sw.set(id, { lights, keys, buses: keys > 1 ? [`${labels.get(id)}.1`, `${labels.get(id)}.2`] : [labels.get(id)] });
  }
  return { light: map, sw };
}

function wire(p, g, panel, grids, cache, boxMode, boxes, ctl, labels, mm) {
  const v = fv(p, g.floor), grid = grids(g.floor), dropM = Math.max(1, p.h / 100 - 0.3);
  const segs = [], by = {}, main = `3×${mm}`;
  let len = 0, ok = true;
  const addL = (spec, l) => { by[spec] = (by[spec] || 0) + l; len += l; };
  const trunk = [], direct = [];
  if (boxMode && g.items.length > 1) {
    const byRoom = new Map();
    for (const i of g.items) {
      const r = roomAt(v, i.x, i.y);
      const k = r ? r.id : "-";
      if (!byRoom.has(k)) byRoom.set(k, { r, pts: [] });
      byRoom.get(k).pts.push(i);
    }
    for (const { r, pts } of byRoom.values()) {
      if (!r || pts.length < 2) { direct.push(...pts); continue; }
      const manual = v.items.find((i) => i.kind === "jbox" && roomAt(v, i.x, i.y) === r);
      const spot = manual || autoBoxSpot(r, pts);
      const conns = [{ label: "Kirish", name: `Shchitdan, ${g.name.toLowerCase()}`, spec: main, wires: ["L", "N", "PE"] }];
      // Har bir nuqta korobkadan alohida kabel oladi
      for (const q of pts) {
        const t = routeTree(grid, spot, [{ x: q.x, y: q.y }]);
        ok = ok && t.ok;
        const c = conn(q, ctl, labels, mm, pts);
        conns.push(c);
        addL(c.spec, t.length * 1.15 + dropM);
        segs.push(...t.segs.map((s, k) => ({ ...s, branch: true, role: q.kind, spec: k ? null : c.spec, floor: g.floor })));
      }
      // Boshqa xonadagi viklyuchatel bilan bog'lovchi sim
      for (const q of pts.filter((x) => x.kind === "switch")) {
        for (const l of ctl.sw.get(q.id)?.lights || []) {
          if (pts.includes(l)) continue;
          const b = ctl.light.get(l.id).bus;
          if (!conns.some((c) => c.label === "→" + b)) conns.push({ label: "→" + b, name: `${b} boshqa xona korobkasiga (${labels.get(l.id)})`, spec: `1×${mm}`, wires: [b], link: true });
        }
      }
      const key = manual ? manual.id : `auto:${r.id}:${g.name}`;
      boxes.push({ key, x: spot.x, y: spot.y, floor: g.floor, manual: !!manual, id: manual?.id, room: r.name, group: g.name, title: `Korobka: ${r.name}, ${g.name}`, points: pts.length, conns });
      trunk.push({ x: spot.x, y: spot.y, floor: g.floor });
    }
  } else direct.push(...g.items);
  const t = multiFloor(p, panel, [...trunk, ...direct.map((i) => ({ x: i.x, y: i.y, floor: g.floor }))], GRID, cache);
  ok = ok && t.ok;
  addL(main, t.length * 1.15 + direct.length * dropM);
  segs.push(...t.segs.map((s, k) => ({ ...s, spec: k ? null : main })));
  return { segs, len, ok, risers: t.risers, by };
}

// Korobkadan nuqtaga: kabel tomirlari va qaysi klemmaga ulanishi
function conn(q, ctl, labels, mm, pts) {
  const label = labels.get(q.id) || "";
  if (q.kind === "switch") {
    const s = ctl.sw.get(q.id), keys = s?.keys || 1;
    return { label, name: `Viklyuchatel, ${keys > 1 ? "2 klavishli" : "1 klavishli"}`, spec: `${1 + keys}×${mm}`, wires: ["L", ...(s?.buses || [label])] };
  }
  if (q.kind === "light") {
    const c = ctl.light.get(q.id), t = lightOf(q);
    const far = c && !pts.some((x) => x.id === c.sw);
    return { label, name: `${t.name}${c ? "" : ", viklyuchatelsiz"}${far ? `, ${c.bus} boshqa korobkadan` : ""}`, spec: `3×${mm}`, wires: [c ? c.bus : "L", "N", "PE"] };
  }
  return { label, name: q.kind === "power" ? "Quvvatli rozetka" : "Rozetka", spec: `3×${mm}`, wires: ["L", "N", "PE"] };
}

export function computeElectric(p) {
  const warnings = [];
  const panel = p.items.find((i) => i.kind === "panel");
  const many = (p.floors || 1) > 1;
  const groups = floorList(p).flatMap((f) => buildGroups(fv(p, f), f, many));
  const boxMode = p.elecMode !== "loop";
  const out = { groups: [], warnings, segs: [], cable: {}, total: 0, inputA: 0, boxes: [], risers: [], boxMode, altLen: 0, len: 0, labels: new Map(), controls: [] };
  if (!groups.length) return out;
  // Rejadagi belgilar: V viklyuchatel, Ch chiroq, R rozetka, Q quvvatli rozetka; har qavatda alohida raqam
  const PREFIX = { switch: "V", light: "Ch", socket: "R", power: "Q" };
  for (const f of floorList(p)) {
    const cnt = {};
    for (const i of fv(p, f).items.filter((x) => PREFIX[x.kind])) {
      cnt[i.kind] = (cnt[i.kind] || 0) + 1;
      out.labels.set(i.id, PREFIX[i.kind] + (many ? `${f + 1}.` : "") + cnt[i.kind]);
    }
  }
  const ctl = controls(p, out.labels);
  out.ctl = ctl;
  for (const [id, s] of ctl.sw) {
    const a = p.items.find((i) => i.id === id);
    for (const l of s.lights) out.controls.push({ floor: floorOf(a), a: [a.x, a.y], b: [l.x, l.y] });
  }
  for (const l of p.items.filter((i) => i.kind === "light" && floorOf(i) < (p.floors || 1) && !ctl.light.has(i.id))) {
    warnings.push(`${out.labels.get(l.id)}: chiroqqa viklyuchatel topilmadi. Xonaga viklyuchatel qo'ying yoki chiroqni tanlab bog'lang.`);
  }
  if (!panel) warnings.push("Elektr shchiti qo'yilmagan, kabellar chizilmadi.");
  const cache = new Map();
  const grids = (f) => {
    const k = "g" + f;
    if (!cache.has(k)) cache.set(k, buildGrid(fv(p, f), GRID));
    return cache.get(k);
  };
  const metal = p.cableMetal === "al" ? "al" : "cu";
  if (metal === "al") warnings.push("Uy ichida alyuminiy sim tavsiya etilmaydi: ulanish joylari qiziydi va yong'in xavfi yuqori.");
  for (const g of groups) {
    const P = g.items.reduce((a, i) => a + watts(i), 0);
    const I = (P * 1.1) / V;
    const br = BREAKERS.find((b) => b >= I && (g.light ? true : b >= 16)) || 40;
    const need = CABLE[metal][br], manual = p.groupCable?.[g.name];
    const mm = manual || need;
    if (manual && manual < need) warnings.push(`${g.name}: ${manual} mm² sim ${br} A avtomatga yupqa, kamida ${need} mm² kerak.`);
    let len = 0;
    if (panel) {
      const w = wire(p, g, panel, grids, cache, boxMode, out.boxes, ctl, out.labels, mm);
      if (!w.ok) warnings.push(`${g.name}: kabel yo'li topilmadi.`);
      len = w.len;
      out.segs.push(...w.segs);
      out.risers.push(...w.risers);
      for (const [s, l] of Object.entries(w.by)) out.cable[s] = (out.cable[s] || 0) + l;
      out.altLen += wire(p, g, panel, grids, cache, !boxMode, [], ctl, out.labels, mm).len;
    }
    // Kuchlanish tushishi: yuk liniya bo'ylab taqsimlangan bo'lsa yarim uzunlik bilan
    const Lr = g.items.length > 1 ? len / 2 : len;
    const dU = ((2 * METALS[metal].rho * Lr * (P / V)) / mm / V) * 100;
    if (dU > 4) warnings.push(`${g.name}: kuchlanish ${dU.toFixed(1)} % tushadi, simni yo'g'onlashtiring.`);
    out.groups.push({ name: g.name, count: g.items.length, P, I, br, mm, need, manual: !!manual, dU, len, rcd: g.wet, kind: g.items[0].kind });
    out.total += P;
    out.len += len;
  }
  out.demand = out.total * 0.6;
  out.inputA = BREAKERS.find((b) => b >= out.demand / V) || 63;
  for (const b of p.items.filter((i) => i.kind === "jbox")) {
    if (boxMode && !roomAt(fv(p, floorOf(b)), b.x, b.y)) warnings.push("Korobka xona ichiga qo'yilishi kerak.");
  }
  for (const r of p.rooms) {
    if (!ROOM_TYPES[r.type].heated || floorOf(r) >= (p.floors || 1)) continue;
    const f = floorOf(r);
    if (!p.items.some((i) => i.kind === "light" && floorOf(i) === f && i.x > r.x && i.x < r.x + r.w && i.y > r.y && i.y < r.y + r.d)) warnings.push(`${r.name}: chiroq yo'q.`);
  }
  return out;
}

// Korobkadagi har bir klemma guruhiga nechta sim keladi
export function busCount(b) {
  const n = {};
  for (const c of b.conns || []) for (const w of c.wires) n[w] = (n[w] || 0) + 1;
  return n;
}

export function electricBom(p, e) {
  if (!e.groups.length) return [];
  const G = "Elektr", n = (k) => p.items.filter((i) => i.kind === k && floorOf(i) < (p.floors || 1)).length;
  const rows = [];
  const mt = METALS[p.cableMetal === "al" ? "al" : "cu"];
  const order = (s) => { const [c, mm] = s.split("×").map(Number); return mm * 10 + c; };
  for (const s of Object.keys(e.cable).sort((a, b) => order(a) - order(b))) {
    rows.push({ g: G, k: `cable_${mt.cable}_${s}`, name: `${mt.name} kabel ${mt.cable}`, spec: `${s.replace(".", ",")} mm²`, unit: "m", qty: Math.ceil(e.cable[s]) });
  }
  const br = {};
  e.groups.forEach((g) => (br[g.br] = (br[g.br] || 0) + 1));
  for (const a of Object.keys(br)) rows.push({ g: G, k: "br" + a, name: "Avtomat", spec: `${a} A`, unit: "dona", qty: br[a] });
  rows.push({ g: G, k: "input", name: "Kirish avtomati", spec: `${e.inputA} A`, unit: "dona", qty: 1 });
  const rcd = e.groups.filter((g) => g.rcd).length;
  if (rcd) rows.push({ g: G, k: "rcd", name: "UZO, 30 mA", spec: "25 A", unit: "dona", qty: rcd });
  rows.push({ g: G, k: "box", name: "Elektr shchiti", spec: `${e.groups.length + 4} modul`, unit: "dona", qty: 1 });
  if (e.boxes.length) {
    rows.push({ g: G, k: "jbox", name: "Taqsimlash korobkasi", spec: "100×100 mm", unit: "dona", qty: e.boxes.length });
    // Har bir klemma guruhi (L, N, PE, viklyuchatel chiqishi) undagi simlar soniga qarab
    const wago = { 2: 0, 3: 0, 5: 0 };
    for (const b of e.boxes) {
      for (const n of Object.values(busCount(b))) {
        if (n < 2) continue;
        if (n <= 2) wago[2]++; else if (n <= 3) wago[3]++; else if (n <= 5) wago[5]++; else wago[5] += Math.ceil((n - 1) / 4);
      }
    }
    for (const c of [2, 3, 5]) if (wago[c]) rows.push({ g: G, k: "wago" + c, name: "Ulash klemmasi (Wago)", spec: `${c} kontaktli`, unit: "dona", qty: wago[c] });
  }
  for (const [k, name] of [["socket", "Rozetka"], ["power", "Quvvatli rozetka"], ["switch", "Viklyuchatel"]]) {
    if (n(k)) rows.push({ g: G, k: "e_" + k, name, spec: "", unit: "dona", qty: n(k) });
  }
  const lights = {};
  for (const i of p.items.filter((x) => x.kind === "light" && floorOf(x) < (p.floors || 1))) {
    const t = lightOf(i), cnt = i.n ?? t.n, w = i.watts ? Math.round(i.watts / cnt) : t.w, key = `${i.ltype || "ledpanel"}_${w}`;
    lights[key] = lights[key] || { name: t.name, spec: `${w} W`, qty: 0, unit: i.ltype === "strip" ? "m" : "dona" };
    lights[key].qty += cnt;
  }
  for (const [k, l] of Object.entries(lights)) rows.push({ g: G, k: "lt_" + k, name: l.name, spec: l.spec, unit: l.unit, qty: l.qty });
  const pts = n("socket") + n("power") + n("switch") + n("light");
  rows.push({ g: "Elektr ishi", k: "l_point", name: "Nuqtani o'rnatish", unit: "nuqta", qty: pts, labor: true });
  rows.push({ g: "Elektr ishi", k: "l_cable", name: "Kabel tortish", unit: "m", qty: Math.ceil(e.len), labor: true });
  if (e.boxes.length) rows.push({ g: "Elektr ishi", k: "l_jbox", name: "Korobkani o'rnatish va ulash", unit: "dona", qty: e.boxes.length, labor: true });
  rows.push({ g: "Elektr ishi", k: "l_panel", name: "Shchitni yig'ish", unit: "dona", qty: 1, labor: true });
  return rows;
}
