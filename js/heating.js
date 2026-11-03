// Issiqlik yo'qotish, radiator tanlash, quvur yo'li va o'zi aylanish tekshiruvi.
import { ROOM_TYPES, WALL_MATERIALS } from "./model.js";
import { SIDES, coverage, extLength, floorList, floorOf, fv, isExterior, sideInfo, openingRect } from "./geometry.js";
import { multiFloor, segLen } from "./route.js";
import { RAD_KINDS, sizeRad, unitMax } from "./radiators.js";

const U_WIN = 1.6, U_DOOR = 2, U_CEIL = 0.5, U_FLOOR = 0.6, T_GROUND = 5, CEIL_K = 0.9;
const Q70 = 160, SEC_W = 9.3, SEC_L = 1.45, MAX_SEC = 14;
const BOILERS = [12, 15, 20, 25, 30, 40, 50, 60];
const RHO_80 = 971.8, RHO_55 = 985.7;
// Armaturali PPR PN25: dn tashqi diametr, id ichki diametr
const PIPES = [
  { dn: 20, id: 13.2 }, { dn: 25, id: 16.6 }, { dn: 32, id: 21.2 }, { dn: 40, id: 26.6 },
  { dn: 50, id: 33.4 }, { dn: 63, id: 42 }, { dn: 75, id: 50 }, { dn: 90, id: 60 },
];
// Qozon oldidagi po'lat qism: har liniyada 2 m, ichki kesimi PPR dan kichik emas
const STEEL = [{ dn: 20, id: 21.2 }, { dn: 25, id: 27.1 }, { dn: 32, id: 35.9 }, { dn: 40, id: 41 }, { dn: 50, id: 53 }, { dn: 65, id: 68 }];
const STEEL_M = 4;

function fric(gLh, idMm) {
  const d = idMm / 1000, v = gLh / 3.6e6 / ((Math.PI / 4) * d * d), Re = Math.max((v * d) / 0.41e-6, 1);
  const f = Re < 2300 ? 64 / Re : 0.11 * Math.pow(0.2 / idMm + 68 / Re, 0.25);
  return (f / d) * 975 * v * v / 2;
}

function roomLoss(all, r, wallU) {
  const p = fv(all, floorOf(r)), f = floorOf(r);
  const t = ROOM_TYPES[r.type];
  const A = (r.w * r.d) / 1e4, h = p.h / 100, dT = t.ti - p.tout;
  // Ustida isitiladigan qavat bo'lsa shiftdan, ostida bo'lsa poldan issiqlik yo'qolmaydi
  const openTop = f + 1 < (all.floors || 1) ? 1 - coverage(all, r, f + 1) : 1;
  const openBottom = f > 0 ? 1 - coverage(all, r, f - 1) : 1;
  const ops = p.openings.filter((o) => o.room === r.id || adjacent(p, o, r));
  let Awin = 0, Adoor = 0;
  for (const o of ops) {
    if (o.room !== r.id || !isExterior(p, r, o.side, o.off) || o.kind === "door") continue;
    const a = (o.w * o.h) / 1e4;
    if (o.kind === "window") Awin += a; else Adoor += a;
  }
  // Tashqi devor uzunligi burchak qalinligi bilan olinadi
  const L = SIDES.reduce((s, q) => {
    const e = extLength(p, r, q);
    return s + (e ? e + p.wallT * 1.5 : 0);
  }, 0) / 100;
  const Awall = Math.max(0, L * h - Awin - Adoor);
  const parts = {
    wall: Awall * wallU * dT,
    win: Awin * U_WIN * dT,
    door: Adoor * U_DOOR * dT,
    ceil: A * openTop * U_CEIL * CEIL_K * dT,
    floor: f === 0 ? A * U_FLOOR * Math.max(0, t.ti - T_GROUND) : A * openBottom * U_CEIL * dT,
    air: 0.34 * A * h * t.n * dT,
  };
  return { A, parts, Q: Object.values(parts).reduce((a, b) => a + b, 0) };
}
const adjacent = () => false;

// Radiator joylari: avval tashqi deraza tagi, keyin tashqi devor, oxirida ichki devor
function radiatorSpots(p, r) {
  const items = p.items.filter((i) => i.x > r.x - 40 && i.x < r.x + r.w + 40 && i.y > r.y - 40 && i.y < r.y + r.d + 40);
  const rects = p.openings.map((o) => openingRect(p, o)).filter(Boolean);
  const blocked = (x, y, half) => rects.some((q) => x > q.x - half - 15 && x < q.x + q.w + half + 15 && y > q.y - 60 && y < q.y + q.d + 60)
    || rects.some((q) => y > q.y - half - 15 && y < q.y + q.d + half + 15 && x > q.x - 60 && x < q.x + q.w + 60)
    || items.some((i) => Math.hypot(i.x - x, i.y - y) < half + 45);
  const out = [];
  for (const o of p.openings) {
    if (o.room === r.id && o.kind === "window") out.push({ side: o.side, off: o.off, rank: isExterior(p, r, o.side, o.off) ? 0 : 3 });
  }
  for (const side of SIDES) {
    const s = sideInfo(r, side);
    for (let off = 60; off <= s.len - 60; off += 30) {
      const [x, y] = s.at(off);
      const [ix, iy] = [x - s.nx * 8, y - s.ny * 8];
      if (blocked(ix, iy, 40)) continue;
      out.push({ side, off, rank: isExterior(p, r, side, off) ? 1 : 2 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export function computeHeating(p) {
  const [ts, tr] = p.regime.split("/").map(Number);
  const tm = (ts + tr) / 2, dt = ts - tr;
  const lam = WALL_MATERIALS[p.wallMaterial].lam;
  const wallU = 1 / (0.2 + p.wallT / 100 / lam + p.ins / 100 / 0.04);
  const totals = { wall: 0, win: 0, door: 0, ceil: 0, floor: 0, air: 0 };
  const rooms = [], rads = [];
  const warnings = [];

  for (const r of p.rooms) {
    const t = ROOM_TYPES[r.type], f = floorOf(r);
    if (!t.heated || f >= (p.floors || 1)) continue;
    const l = roomLoss(p, r, wallU);
    for (const k in totals) totals[k] += l.parts[k];
    const dTm = tm - t.ti;
    // Qo'lda boshqariladigan xonada foydalanuvchi qo'ygan radiatorlar, aks holda avtomatik joylar
    let entries;
    if (r.radManual) entries = (p.radiators || []).filter((q) => q.room === r.id);
    else {
      const spots = radiatorSpots(fv(p, f), r);
      const windows = spots.filter((s) => s.rank === 0).length;
      const units = Math.max(1, windows, Math.ceil(l.Q / unitMax(p.radType || "cast", p, dTm)));
      entries = [];
      for (const s of spots) {
        if (entries.length >= units) break;
        if (entries.some((c) => c.side === s.side && Math.abs(c.off - s.off) < 170)) continue;
        entries.push({ side: s.side, off: s.off });
      }
      if (!entries.length) warnings.push(`${r.name}: radiator uchun bo'sh devor topilmadi.`);
    }
    if (r.radManual && !entries.length) warnings.push(`${r.name}: radiator yo'q.`);
    const per = entries.length ? l.Q / entries.length : 0;
    let power = 0;
    const labels = [];
    entries.forEach((e, idx) => {
      const s = sideInfo(r, e.side);
      const [x, y] = s.at(e.off);
      const z = sizeRad(e, p, per, dTm);
      power += z.power; labels.push(z.label);
      rads.push({
        ...z, no: rads.length + 1, id: e.id || `auto:${r.id}:${idx}`, manual: !!e.id, idx, room: r, floor: f, side: e.side, off: e.off,
        x: x - s.nx * 9, y: y - s.ny * 9, load: z.power, horiz: e.side === "n" || e.side === "s",
      });
    });
    if (entries.length && power < l.Q * 0.95) warnings.push(`${r.name}: radiatorlar ${Math.round(l.Q - power)} W kam beradi.`);
    const same = labels.every((x) => x === labels[0]);
    const label = !labels.length ? "yo'q" : same ? `${labels.length} × ${labels[0]}` : labels.join(", ");
    rooms.push({ r, floor: f, A: l.A, Q: l.Q, power, label, units: entries.length, ti: t.ti, manual: !!r.radManual });
  }

  const Q = rooms.reduce((a, x) => a + x.Q, 0);
  const grav = p.circ !== "pump", solid = p.fuel === "solid";
  const margin = solid ? 1.3 : 1.15;
  const need = (Q * margin) / 1000;
  const boilerKw = BOILERS.find((b) => b >= need) || BOILERS[BOILERS.length - 1];
  const boiler = p.items.find((i) => i.kind === "boiler");
  const flow = (w) => w / (1.163 * dt);
  const out = {
    rooms, rads, Q, need, boilerKw, totals, wallU, warnings, secs: rads.reduce((a, x) => a + (x.sec || 0), 0),
    segs: [], lens: {}, gravity: null, flow: flow(Q), boiler,
    topSupply: grav,
  };
  warnings.push(...schemeWarnings(p));

  if (!boiler) {
    if (rads.length) warnings.push("Qozon qo'yilmagan, quvurlar chizilmadi.");
    return out;
  }
  const net = multiFloor(p, boiler, rads);
  if (!net.ok) warnings.push("Ba'zi radiatorlarga quvur yo'li topilmadi.");
  out.risers = net.risers;
  if (net.risers.some((q) => q.auto)) warnings.push("Stoyak avtomatik joylandi. Reja bo'limida o'zingiz qo'yishingiz mumkin.");

  const size = (w, grav) => {
    const g = grav ? w / (1.163 * 25) : flow(w);
    const vmax = grav ? 0.07 : 0.7;
    return PIPES.find((d) => (g / 3.6e6) / ((Math.PI / 4) * (d.id / 1000) ** 2) <= vmax) || PIPES[PIPES.length - 1];
  };
  const sumL = {};
  out.segs = net.segs.map((s) => {
    const d = size(s.load, grav), len = segLen(s);
    sumL[d.dn] = (sumL[d.dn] || 0) + len * 2;
    return { ...s, dn: d.dn, id: d.id, len };
  });
  for (const q of net.risers) {
    const d = size(q.load, grav);
    sumL[d.dn] = (sumL[d.dn] || 0) + q.len * 2;
    q.dn = d.dn; q.id = d.id;
  }
  out.lens = sumL;
  out.pipeTotal = Object.values(sumL).reduce((a, b) => a + b, 0);
  // Qozon oldidagi qism po'lat, shuncha PPR kamayadi
  const mainPipe = size(Q, grav);
  out.steelPipe = STEEL.find((d) => d.id >= mainPipe.id) || STEEL[STEEL.length - 1];
  if (sumL[mainPipe.dn]) sumL[mainPipe.dn] = Math.max(0, sumL[mainPipe.dn] - STEEL_M);

  // Eng uzun halqa bo'yicha taxminiy qarshilik
  const longest = Math.max(0, ...rads.map((r) => Math.hypot(r.x - boiler.x, r.y - boiler.y) / 100)) * 2.6;
  const volPipes = out.segs.reduce((a, s) => a + (Math.PI / 4) * (s.id / 100) ** 2 * s.len * 2 * 10, 0);
  out.volume = rads.reduce((a, x) => a + x.litre, 0) + volPipes + 40;
  out.tank = Math.ceil((out.volume * 0.06) / 10) * 10;
  out.vessel = [8, 12, 18, 24, 35, 50, 80].find((v) => v >= (out.volume * 0.04) / (1 - 1.5 / 3)) || 100;

  if (grav) {
    const H = 0.42 + p.pit / 100 - 0.55;
    const head = 9.81 * H * (RHO_55 - RHO_80) + 80;
    const G = Q / (1.163 * 25);
    const main = size(Q, true);
    const loss = fric(G, main.id) * longest * 1.4 + 15;
    out.gravity = { H, head, loss, ok: H > 0.3 && loss <= head * 0.9 };
    if (H <= 0.3) warnings.push("Qozon radiatorlardan yetarli past emas. Qozonxona polini chuqurroq qiling.");
    if (!out.gravity.ok) warnings.push(p.circ === "gravity" ? "Bosim yetmaydi, bu tizim nasossiz ishlamaydi." : "Elektr uzilganda to'liq issiqlik yetmaydi.");
  }
  return out;
}

// Tanlangan sxema nimaga e'tibor talab qilishini aytadi
function schemeWarnings(p) {
  const w = [], solid = p.fuel === "solid", grav = p.circ !== "pump";
  if (!solid && grav) w.push("Oddiy devorga osma gaz qozoni elektrsiz ishlamaydi. Elektrga bog'liq bo'lmagan gaz qozoni kerak.");
  if (solid && p.loop === "closed" && p.circ !== "gravity") w.push("Yopiq tizimda qattiq yoqilg'i qozoni elektr uzilganda qizib ketishi mumkin. Xavfsizlik guruhi va termik to'kish klapani shart.");
  if (solid && p.loop === "closed" && p.circ === "gravity") w.push("Yopiq tizimda qattiq yoqilg'i qozoniga termik to'kish klapani shart.");
  if (solid && p.circ === "pump") w.push("Elektr uzilsa, suv aylanmaydi, qozon esa yonishda davom etadi. Zaxira quvvat manbai kerak.");
  if (p.loop === "open") w.push("Ochiq tizimda suvga havo tegadi: bakdagi suv sathini kuzating.");
  if (solid) w.push("PPR 95 °C dan oshsa buziladi. Qozon suvi 90 °C dan oshmasligi kerak: faqat armaturali PN25 quvur va harorat cheklovi ishlating.");
  return w;
}

// Tanlangan tizim tarkibi, sahifada ro'yxat bo'lib chiqadi
export function schemeParts(p, h) {
  const a = [];
  a.push(p.fuel === "solid" ? `Qattiq yoqilg'i qozoni ${h.boilerKw} kW, havo ventilyatori bilan` : `Gaz qozoni ${h.boilerKw} kW`);
  if (p.circ === "pump") a.push("Aylanma nasos, ikki tomonida kran", "Quvurlar polda, ikkala liniya pastda");
  if (p.circ === "gravity") a.push("Nasos yo'q, elektrga bog'liq emas", "Issiq suv cherdakdan tushadi, qaytish polda");
  if (p.circ === "hybrid") a.push("Nasos bypass tarmog'ida, kranlar bilan", "Teskari klapan: tok o'chsa suv nasosni aylanib o'tadi", "Issiq suv cherdakdan tushadi, qaytish polda");
  if (p.loop === "open") a.push(`Ochiq kengayish baki ${h.tank || 20} l, eng baland nuqtada`, "To'kish quvuri bakdan pastga", "Havo bak orqali chiqadi");
  else a.push(`Yopiq membranali bak ${h.vessel || 18} l`, "Xavfsizlik guruhi: klapan 3 bar, havo chiqargich, manometr");
  if (p.fuel === "solid" && p.loop === "closed") a.push("Termik to'kish klapani");
  a.push("PPR PN25 armaturali quvur", `Qozon oldida po'lat quvur Ø${h.steelPipe?.dn || 32}, har liniyada 2 m`);
  return a;
}

export function heatingBom(p, h) {
  const rows = [];
  if (!h.rads.length) return rows;
  const G = "Isitish", solid = p.fuel === "solid";
  rows.push({ g: G, k: "boiler", name: solid ? "Qattiq yoqilg'i qozoni" : "Gaz qozoni", spec: `${h.boilerKw} kW`, unit: "dona", qty: 1 });
  for (const kind of ["cast", "bimetal"]) {
    const n = h.rads.filter((r) => r.kind === kind).reduce((a, r) => a + r.sec, 0);
    if (n) rows.push({ g: G, k: "rad_" + kind, name: `${RAD_KINDS[kind].name} radiator`, spec: "o'qi 500 mm", unit: "seksiya", qty: n });
  }
  const panels = {};
  h.rads.filter((r) => r.kind === "panel").forEach((r) => (panels[r.label] = (panels[r.label] || 0) + 1));
  for (const [spec, n] of Object.entries(panels)) rows.push({ g: G, k: "panel_" + spec, name: "Po'lat panel radiator", spec, unit: "dona", qty: n });
  rows.push({ g: G, k: "radset", name: "Radiator kranlari va to'plami", spec: "3/4\"", unit: "to'plam", qty: h.rads.length });
  for (const dn of Object.keys(h.lens).sort((a, b) => a - b)) {
    if (h.lens[dn] < 0.1) continue;
    rows.push({ g: G, k: "pipe" + dn, name: "PPR PN25 armaturali quvur", spec: `Ø${dn}`, unit: "m", qty: Math.ceil(h.lens[dn] * 1.1) });
  }
  if (h.steelPipe) {
    rows.push({ g: G, k: "steel", name: "Po'lat quvur, qozon oldida", spec: `Ø${h.steelPipe.dn}`, unit: "m", qty: STEEL_M });
    rows.push({ g: G, k: "adapter", name: "Po'latdan PPR ga o'tish muftasi", spec: "rezbali", unit: "dona", qty: 2 });
  }
  const conn = h.topSupply ? p.h / 100 + 1 : 2.5;
  rows.push({ g: G, k: "conn", name: "Radiator ulanishi, PPR PN25", spec: "Ø25", unit: "m", qty: Math.ceil(h.rads.length * conn) });
  rows.push({ g: G, k: "filter", name: "Loyqa filtr va kranlar", spec: "qozon uchun", unit: "to'plam", qty: 1 });
  if (p.circ !== "gravity") {
    rows.push({ g: G, k: "pump", name: "Aylanma nasos", spec: "25-60", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "pumpval", name: "Nasos kranlari", spec: "to'la kesimli", unit: "dona", qty: 2 });
  }
  if (p.circ === "hybrid") rows.push({ g: G, k: "check", name: "Bypass teskari klapani", spec: "past qarshilikli", unit: "dona", qty: 1 });
  if (p.loop === "open") {
    rows.push({ g: G, k: "tank", name: "Ochiq kengayish baki", spec: `${h.tank || 20} l`, unit: "dona", qty: 1 });
    rows.push({ g: G, k: "over", name: "To'kish quvuri", spec: "Ø20", unit: "m", qty: Math.ceil(p.h / 100 + 4) });
  } else {
    rows.push({ g: G, k: "vessel", name: "Yopiq membranali bak", spec: `${h.vessel || 18} l`, unit: "dona", qty: 1 });
    rows.push({ g: G, k: "safety", name: "Xavfsizlik guruhi", spec: "3 bar", unit: "to'plam", qty: 1 });
    if (solid) rows.push({ g: G, k: "thermal", name: "Termik to'kish klapani", spec: "95 °C", unit: "dona", qty: 1 });
  }
  rows.push({ g: "Isitish ishi", k: "l_boiler", name: "Qozonni o'rnatish va ulash", unit: "dona", qty: 1, labor: true });
  rows.push({ g: "Isitish ishi", k: "l_rad", name: "Radiatorni osish va ulash", unit: "dona", qty: h.rads.length, labor: true });
  if (h.risers?.length) rows.push({ g: "Isitish ishi", k: "l_riser", name: "Qavatlararo stoyak", unit: "dona", qty: h.risers.length * 2, labor: true });
  rows.push({ g: "Isitish ishi", k: "l_pipe", name: "Quvur yotqizish", unit: "m", qty: Math.ceil((h.pipeTotal || 0) * 1.1), labor: true });
  rows.push({ g: "Isitish ishi", k: "l_start", name: "Sinov va ishga tushirish", unit: "dona", qty: 1, labor: true });
  return rows;
}
