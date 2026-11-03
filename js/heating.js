// Issiqlik yo'qotish, radiator tanlash, quvur yo'li va o'zi aylanish tekshiruvi.
import { ROOM_TYPES, WALL_MATERIALS } from "./model.js";
import { SIDES, coverage, extLength, floorList, floorOf, fv, isExterior, sideInfo, openingRect } from "./geometry.js";
import { buildGrid, multiFloor, riserPoint, routeTree, segLen } from "./route.js";
import { MAX_LOOP, entryPoint, meander, ufhRoom } from "./ufh.js";
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
    // Iliq pol bo'lsa, yetmagan qismini radiator beradi
    const uf = r.ufh ? ufhRoom(r, p, t.ti) : null;
    const rest = uf ? Math.max(0, l.Q - uf.power) : l.Q;
    // Qo'lda boshqariladigan xonada foydalanuvchi qo'ygan radiatorlar, aks holda avtomatik joylar
    let entries;
    if (r.radManual) entries = (p.radiators || []).filter((q) => q.room === r.id);
    else if (rest < l.Q * 0.05) entries = [];
    else {
      const spots = radiatorSpots(fv(p, f), r);
      const windows = spots.filter((s) => s.rank === 0).length;
      const units = Math.max(1, uf ? 1 : windows, Math.ceil(rest / unitMax(p.radType || "cast", p, dTm)));
      entries = [];
      for (const s of spots) {
        if (entries.length >= units) break;
        if (entries.some((c) => c.side === s.side && Math.abs(c.off - s.off) < 170)) continue;
        entries.push({ side: s.side, off: s.off });
      }
      if (!entries.length) warnings.push(`${r.name}: radiator uchun bo'sh devor topilmadi.`);
    }
    if (r.radManual && !entries.length && !uf) warnings.push(`${r.name}: radiator yo'q.`);
    const per = entries.length ? rest / entries.length : 0;
    let power = uf ? uf.power : 0;
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
    if ((entries.length || uf) && power < l.Q * 0.95) warnings.push(`${r.name}: ${uf ? "iliq pol va radiatorlar" : "radiatorlar"} ${Math.round(l.Q - power)} W kam beradi.`);
    const same = labels.every((x) => x === labels[0]);
    let label = !labels.length ? "" : same ? `${labels.length} × ${labels[0]}` : labels.join(", ");
    if (uf) label = `iliq pol ${Math.round(uf.power)} W` + (label ? ` + ${label}` : "");
    rooms.push({ r, floor: f, A: l.A, Q: l.Q, power, label: label || "yo'q", units: entries.length, ti: t.ti, manual: !!r.radManual, ufh: uf });
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

  const ufhRooms = rooms.filter((x) => x.ufh);
  const collector = p.radScheme === "collector";
  if (ufhRooms.length && p.circ === "gravity") warnings.push("Iliq pol nasossiz ishlamaydi: aralashtirish uzeli va nasos kerak.");
  if (ufhRooms.length && p.circ === "hybrid") warnings.push("Elektr uzilganda iliq pol ishlamaydi, faqat radiatorlar isitadi.");
  if (collector && grav) warnings.push("Nurli (kollektorli) sxema qarshiligi katta, elektrsiz aylanishga mos emas.");
  out.ufh = []; out.manifolds = []; out.starSegs = []; out.starLens = {};

  if (!boiler) {
    if (rads.length || ufhRooms.length) warnings.push("Qozon qo'yilmagan, quvurlar chizilmadi.");
    return out;
  }

  // Kollektorlar: qo'yilganlari, yetmagan qavatga avtomatik
  const live = (p.floors || 1);
  const mans = p.items.filter((i) => i.kind === "manifold" && floorOf(i) < live)
    .map((i) => ({ id: i.id, x: i.x, y: i.y, floor: floorOf(i), load: 0, ports: 0, ufhPorts: 0, auto: false }));
  const needF = new Set([...ufhRooms.map((x) => x.floor), ...(collector ? rads.map((r) => r.floor) : [])]);
  for (const f of needF) {
    if (mans.some((m) => m.floor === f)) continue;
    const at = floorOf(boiler) === f ? { x: boiler.x + 80, y: boiler.y } : riserPoint(p, boiler, f);
    mans.push({ id: `auto-man-${f}`, x: at.x, y: at.y, floor: f, load: 0, ports: 0, ufhPorts: 0, auto: true });
    warnings.push(`${f + 1}-qavatda kollektor avtomatik joylandi. "Kollektor" asbobi bilan o'zingiz qo'yishingiz mumkin.`);
  }
  const nearest = (f, x, y) => mans.filter((m) => m.floor === f).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  const cache = new Map(), gridOf = (f) => { if (!cache.has(f)) cache.set(f, buildGrid(fv(p, f))); return cache.get(f); };
  const star = (m, t, kind) => {
    const r = routeTree(gridOf(m.floor), m, [t]);
    const len = r.length;
    out.starSegs.push(...r.segs.map((s) => ({ ...s, floor: m.floor, kind })));
    return len;
  };
  for (const x of ufhRooms) {
    const m = nearest(x.floor, x.r.x + x.r.w / 2, x.r.y + x.r.d / 2);
    const e = entryPoint(x.r, m);
    const feed = star(m, e, "ufh");
    const loops = Math.max(1, Math.ceil(x.ufh.len / (MAX_LOOP - 2 * Math.min(feed, 30))));
    const pipe = x.ufh.len + loops * 2 * feed;
    m.load += x.ufh.power; m.ports += loops; m.ufhPorts += loops;
    out.ufh.push({ room: x.r, floor: x.floor, ...x.ufh, loops, feed, pipe, manifold: m.id, pattern: meander(x.r, x.ufh.step, loops) });
  }
  if (collector) for (const r of rads) {
    const m = nearest(r.floor, r.x, r.y);
    const len = star(m, { x: r.x, y: r.y }, "rad");
    m.load += r.power; m.ports += 1;
    out.starLens[r.power > 1500 ? 20 : 16] = (out.starLens[r.power > 1500 ? 20 : 16] || 0) + len * 2;
  }
  out.manifolds = mans.filter((m) => m.ports);
  out.ufhPipe = out.ufh.reduce((a, u) => a + u.pipe, 0);

  const mainTargets = [...(collector ? [] : rads), ...out.manifolds.map((m) => ({ x: m.x, y: m.y, floor: m.floor, load: m.load }))];
  const net = multiFloor(p, boiler, mainTargets);
  if (!net.ok) warnings.push("Ba'zi radiatorlarga quvur yo'li topilmadi.");
  out.risers = net.risers;
  if (net.risers.some((q) => q.auto)) warnings.push("Stoyak avtomatik joylandi. Reja bo'limida o'zingiz qo'yishingiz mumkin.");

  // Eng uzun halqa bo'yicha taxminiy qarshilik
  const longest = Math.max(0, ...rads.map((r) => Math.hypot(r.x - boiler.x, r.y - boiler.y) / 100)) * 2.6;
  // O'zi aylanishda bosim: issiq va sovuq suv og'irligi farqi, qozon chuquriga bog'liq
  const H = 0.42 + p.pit / 100 - 0.55;
  const head = 9.81 * H * (RHO_55 - RHO_80) + 80;
  // Nasossiz: har metrga ruxsat etilgan qarshilik shunday tanlanadiki, eng uzun halqa bosimning 90 % idan oshmasin
  const Rmax = Math.max(0.5, (head * 0.9 - 15) / Math.max(1, longest * 1.4));
  const size = (w, grav) => {
    if (grav) {
      const g = w / (1.163 * 25);
      return PIPES.find((d) => d.dn >= 25 && fric(g, d.id) <= Rmax) || PIPES[PIPES.length - 1];
    }
    const g = flow(w);
    return PIPES.find((d) => (g / 3.6e6) / ((Math.PI / 4) * (d.id / 1000) ** 2) <= 0.7) || PIPES[PIPES.length - 1];
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

  const volPipes = out.segs.reduce((a, s) => a + (Math.PI / 4) * (s.id / 100) ** 2 * s.len * 2 * 10, 0);
  out.volume = rads.reduce((a, x) => a + x.litre, 0) + volPipes + 40 + out.ufhPipe * 0.113;
  out.tank = Math.ceil((out.volume * 0.06) / 10) * 10;
  out.vessel = [8, 12, 18, 24, 35, 50, 80].find((v) => v >= (out.volume * 0.04) / (1 - 1.5 / 3)) || 100;

  if (grav) {
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
  if (p.loop === "open") a.push(`Ochiq kengayish baki ${h.tank || 20} l, eng baland nuqtada, izolyatsiyali`, "Qozondan bakka kengayish quvuri: unga kran qo'yilmaydi", "To'kish quvuri bakdan pastga", "Havo bak orqali chiqadi");
  else a.push(`Yopiq membranali bak ${h.vessel || 18} l, servis krani bilan`, "Xavfsizlik guruhi qozon chiqishida: klapan 3 bar, avtomatik havo chiqargich, manometr. Klapan bilan qozon orasida kran bo'lmaydi", "Klapan to'kish quvuri kanalizatsiyaga");
  if (p.fuel === "solid" && p.loop === "closed") a.push("Termik to'kish klapani, sovuq suv bilan sovitadi");
  if (p.fuel === "solid" && p.circ === "pump") a.push("Uch yo'lli klapan 55 °C: qozon qaytishini isitib, kondensat va smola hosil bo'lishidan saqlaydi");
  a.push("Termomanometr chiqishda, termometr qaytishda", "Loyqa filtr qaytish liniyasida, qozon oldida", "To'ldirish krani teskari klapan bilan, to'kish krani eng past nuqtada",
    "Har radiatorda ikki kran va Mayevskiy krani", "PPR PN25 armaturali quvur", `Qozon oldida po'lat quvur Ø${h.steelPipe?.dn || 32}, har liniyada 2 m`,
    p.fuel === "solid" ? "Izolyatsiyali tutun quvuri, tortish regulyatori bilan" : "Koaksial tutun quvuri");
  return a;
}

export function heatingBom(p, h) {
  const rows = [];
  if (!h.rads.length && !h.ufh?.length) return rows;
  const G = "Isitish", solid = p.fuel === "solid";
  rows.push({ g: G, k: "boiler", name: solid ? "Qattiq yoqilg'i qozoni" : "Gaz qozoni", spec: `${h.boilerKw} kW`, unit: "dona", qty: 1 });
  for (const kind of ["cast", "bimetal"]) {
    const n = h.rads.filter((r) => r.kind === kind).reduce((a, r) => a + r.sec, 0);
    if (n) rows.push({ g: G, k: "rad_" + kind, name: `${RAD_KINDS[kind].name} radiator`, spec: "o'qi 500 mm", unit: "seksiya", qty: n });
  }
  const panels = {};
  h.rads.filter((r) => r.kind === "panel").forEach((r) => (panels[r.label] = (panels[r.label] || 0) + 1));
  for (const [spec, n] of Object.entries(panels)) rows.push({ g: G, k: "panel_" + spec, name: "Po'lat panel radiator", spec, unit: "dona", qty: n });
  // Har bir radiator uchun mayda qismlar
  const R = h.rads.length, secR = h.rads.filter((r) => r.kind !== "panel");
  if (R) {
    rows.push({ g: G, k: "radval", name: "Radiator krani, amerikanka bilan", spec: "1/2\", to'la kesimli", unit: "dona", qty: R * 2 });
    rows.push({ g: G, k: "mayev", name: "Mayevskiy krani (havo chiqargich)", spec: "1/2\"", unit: "dona", qty: R });
    if (secR.length) {
      rows.push({ g: G, k: "plugs", name: "Radiator probka va zaglushkalari to'plami", spec: "1\" × 1/2\"", unit: "to'plam", qty: secR.length });
      rows.push({ g: G, k: "brack", name: "Radiator kronshteyni", spec: "devorga", unit: "dona", qty: secR.reduce((a, r) => a + (r.sec > 10 ? 4 : 3), 0) });
    }
  }
  for (const dn of Object.keys(h.lens).sort((a, b) => a - b)) {
    if (h.lens[dn] < 0.1) continue;
    rows.push({ g: G, k: "pipe" + dn, name: "PPR PN25 armaturali quvur", spec: `Ø${dn}`, unit: "m", qty: Math.ceil(h.lens[dn] * 1.1) });
  }
  if (h.steelPipe) {
    rows.push({ g: G, k: "steel", name: "Po'lat quvur, qozon oldida", spec: `Ø${h.steelPipe.dn}`, unit: "m", qty: STEEL_M });
    rows.push({ g: G, k: "adapter", name: "Po'latdan PPR ga o'tish muftasi", spec: "rezbali", unit: "dona", qty: 2 });
  }
  const conn = h.topSupply ? p.h / 100 + 1 : 2.5;
  if (h.rads.length && p.radScheme !== "collector") rows.push({ g: G, k: "conn", name: "Radiator ulanishi, PPR PN25", spec: "Ø25", unit: "m", qty: Math.ceil(h.rads.length * conn) });
  for (const [dn, len] of Object.entries(h.starLens || {})) {
    rows.push({ g: G, k: "pexal" + dn, name: "Metalloplastik quvur, kollektordan radiatorga", spec: `${dn}×2`, unit: "m", qty: Math.ceil(len * 1.1) });
  }
  for (const m of h.manifolds || []) {
    rows.push({ g: G, k: `man_${m.ports}`, name: "Kollektor, rasxodomer va kranlar bilan", spec: `${m.ports} chiqishli`, unit: "dona", qty: 1 });
    rows.push({ g: G, k: "mancab", name: "Kollektor shkafi", spec: "devorga", unit: "dona", qty: 1 });
    if (m.ufhPorts) rows.push({ g: G, k: "mix", name: "Iliq pol aralashtirish uzeli, nasosi bilan", spec: p.ufhRegime || "45/35", unit: "dona", qty: 1 });
  }
  if (h.ufh?.length) {
    const area = h.ufh.reduce((a, u) => a + u.room.w * u.room.d / 1e4, 0);
    const per = h.ufh.reduce((a, u) => a + 2 * (u.room.w + u.room.d) / 100, 0);
    const G2 = "Iliq pol";
    rows.push({ g: G2, k: "pex16", name: "PEX quvur, kislorod to'sig'i bilan", spec: "16×2", unit: "m", qty: Math.ceil(h.ufhPipe * 1.05) });
    rows.push({ g: G2, k: "eps", name: "Issiqlik izolyatsiyasi plitasi", spec: "30 mm", unit: "m²", qty: Math.ceil(area * 1.05) });
    rows.push({ g: G2, k: "damper", name: "Demfer lenta", spec: "devor bo'ylab", unit: "m", qty: Math.ceil(per) });
    rows.push({ g: G2, k: "clips", name: "Quvur mahkamlagich", spec: "", unit: "dona", qty: Math.ceil(h.ufhPipe * 3) });
    rows.push({ g: G2, k: "screed", name: "Beton qoplama (styajka)", spec: "50 mm", unit: "m²", qty: Math.ceil(area) });
    rows.push({ g: "Isitish ishi", k: "l_ufh", name: "Iliq pol yotqizish", unit: "m²", qty: Math.ceil(area), labor: true });
  }
  if (h.manifolds?.length) rows.push({ g: "Isitish ishi", k: "l_man", name: "Kollektorni o'rnatish va sozlash", unit: "dona", qty: h.manifolds.length, labor: true });
  // PPR fitinglari: ikkala liniya uchun
  const bends = h.segs.reduce((a, s) => a + Math.max(0, s.pts.length - 2), 0), tees = Math.max(0, h.segs.length - 1);
  const pipeL = h.pipeTotal || 0, mainDn = h.steelPipe?.dn || 32;
  if (pipeL) {
    rows.push({ g: G, k: "hbend", name: "PPR tirsak 90°", spec: "Ø20–" + mainDn, unit: "dona", qty: bends * 2 + R * 4 });
    rows.push({ g: G, k: "htee", name: "PPR troynik", spec: "Ø20–" + mainDn, unit: "dona", qty: tees * 2 + R * 2 });
    rows.push({ g: G, k: "hcoup", name: "PPR mufta", spec: "Ø20–" + mainDn, unit: "dona", qty: Math.ceil(pipeL / 4) });
    rows.push({ g: G, k: "hclip", name: "PPR quvur qisqichi", spec: "Ø20–" + mainDn, unit: "dona", qty: Math.ceil(pipeL / 0.7) });
    rows.push({ g: G, k: "hins", name: "Quvur izolyatsiyasi, issiq bo'lmagan joylarda", spec: "Ø25–" + mainDn, unit: "m", qty: Math.ceil(Math.min(pipeL, 6 + (p.loop === "open" ? p.h / 100 + 2 : 0))) });
  }
  // Qozon uzeli
  rows.push({ g: G, k: "bunion", name: "Qozon ulash amerikankasi", spec: `${mainDn >= 40 ? "1 1/2\"" : "1 1/4\""}`, unit: "dona", qty: 2 });
  if (p.loop === "closed") rows.push({ g: G, k: "bval", name: "Qozon kranlari (servis uchun)", spec: "to'la kesimli", unit: "dona", qty: 2 });
  rows.push({ g: G, k: "filter", name: "Loyqa filtr (gryazevik), qaytishda", spec: `Ø${mainDn}`, unit: "dona", qty: 1 });
  rows.push({ g: G, k: "tmano", name: "Termomanometr, qozon chiqishida", spec: "0–120 °C, 0–4 bar", unit: "dona", qty: 1 });
  rows.push({ g: G, k: "thermo", name: "Termometr, qaytish liniyasida", spec: "0–120 °C", unit: "dona", qty: 1 });
  rows.push({ g: G, k: "fill", name: "To'ldirish krani va teskari klapan, sovuq suvdan", spec: "1/2\"", unit: "to'plam", qty: 1 });
  rows.push({ g: G, k: "drain", name: "To'kish krani, eng past nuqtada", spec: "1/2\"", unit: "dona", qty: 1 });
  if (p.circ !== "gravity") {
    rows.push({ g: G, k: "pump", name: "Aylanma nasos", spec: "25-60", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "pumpval", name: "Nasos kranlari, amerikanka bilan", spec: "to'la kesimli", unit: "dona", qty: 2 });
    if (solid && p.circ === "pump") rows.push({ g: G, k: "antic", name: "Uch yo'lli termostatik klapan, qozon qaytishiga", spec: "55 °C", unit: "dona", qty: 1 });
    if (solid && p.circ === "pump") rows.push({ g: G, k: "ups", name: "Zaxira quvvat manbai (UPS) nasos uchun", spec: "300–500 VA", unit: "dona", qty: 1 });
  }
  if (p.circ === "hybrid") {
    rows.push({ g: G, k: "check", name: "Bypass teskari klapani", spec: "past qarshilikli", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "bypval", name: "Bypass krani", spec: "to'la kesimli", unit: "dona", qty: 1 });
  }
  if (p.loop === "open") {
    rows.push({ g: G, k: "tank", name: "Ochiq kengayish baki, qopqoqli", spec: `${h.tank || 20} l`, unit: "dona", qty: 1 });
    rows.push({ g: G, k: "tankins", name: "Bak izolyatsiyasi (cherdakda muzlamasligi uchun)", spec: "", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "exp", name: "Kengayish quvuri, qozondan bakka (kransiz)", spec: "Ø25", unit: "m", qty: Math.ceil(((p.floors || 1) * (p.h + (p.slab ?? 30))) / 100 + 1.5) });
    rows.push({ g: G, k: "over", name: "To'kish (signal) quvuri, bakdan pastga", spec: "Ø20", unit: "m", qty: Math.ceil(((p.floors || 1) * p.h) / 100 + 4) });
  } else {
    rows.push({ g: G, k: "vessel", name: "Yopiq membranali bak", spec: `${h.vessel || 18} l`, unit: "dona", qty: 1 });
    rows.push({ g: G, k: "vesval", name: "Membranali bak servis krani", spec: "3/4\"", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "vesbr", name: "Membranali bak kronshteyni", spec: "", unit: "dona", qty: 1 });
    // Xavfsizlik guruhi qismlari alohida
    rows.push({ g: G, k: "sgbody", name: "Xavfsizlik guruhi konsoli", spec: "1\"", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "sgvalve", name: "Xavfsizlik klapani", spec: "3 bar", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "sgvent", name: "Avtomatik havo chiqargich", spec: "1/2\"", unit: "dona", qty: 1 + (h.risers?.length || 0) });
    rows.push({ g: G, k: "sgmano", name: "Manometr", spec: "0–4 bar", unit: "dona", qty: 1 });
    rows.push({ g: G, k: "sgdrain", name: "Xavfsizlik klapani to'kish quvuri, kanalizatsiyaga", spec: "Ø20", unit: "m", qty: 2 });
    if (solid) {
      rows.push({ g: G, k: "thermal", name: "Termik to'kish klapani", spec: "95 °C", unit: "dona", qty: 1 });
      rows.push({ g: G, k: "thermalw", name: "Termik klapan uchun sovuq suv kirishi va filtr", spec: "1/2\"", unit: "to'plam", qty: 1 });
    }
  }
  // Tutun yo'li
  const flueH = Math.ceil(((p.floors || 1) * (p.h + (p.slab ?? 30))) / 100 + 2);
  if (solid) {
    rows.push({ g: G, k: "flue", name: "Tutun quvuri (dymohod), zanglamas, izolyatsiyali", spec: "Ø150–180", unit: "m", qty: flueH });
    rows.push({ g: G, k: "flueb", name: "Tutun quvuri tirsagi va reviziya troynigi", spec: "Ø150–180", unit: "dona", qty: 2 });
    rows.push({ g: G, k: "fluer", name: "Tomdan o'tish va qalpoq", spec: "Ø150–180", unit: "to'plam", qty: 1 });
    rows.push({ g: G, k: "draft", name: "Tortish regulyatori (termoregulyator)", spec: "", unit: "dona", qty: 1 });
  } else {
    rows.push({ g: G, k: "coax", name: "Koaksial tutun quvuri to'plami", spec: "60/100", unit: "to'plam", qty: 1 });
    rows.push({ g: G, k: "gasv", name: "Gaz krani va gaz filtri", spec: "1/2\"", unit: "to'plam", qty: 1 });
  }
  rows.push({ g: "Isitish ishi", k: "l_boiler", name: "Qozonni o'rnatish va ulash", unit: "dona", qty: 1, labor: true });
  rows.push({ g: "Isitish ishi", k: "l_safety", name: p.loop === "open" ? "Kengayish bakini o'rnatish" : "Xavfsizlik guruhi va membranali bakni o'rnatish", unit: "dona", qty: 1, labor: true });
  if (h.rads.length) rows.push({ g: "Isitish ishi", k: "l_rad", name: "Radiatorni osish va ulash", unit: "dona", qty: h.rads.length, labor: true });
  if (h.risers?.length) rows.push({ g: "Isitish ishi", k: "l_riser", name: "Qavatlararo stoyak", unit: "dona", qty: h.risers.length * 2, labor: true });
  rows.push({ g: "Isitish ishi", k: "l_pipe", name: "Quvur yotqizish", unit: "m", qty: Math.ceil((h.pipeTotal || 0) * 1.1), labor: true });
  rows.push({ g: "Isitish ishi", k: "l_start", name: "Sinov va ishga tushirish", unit: "dona", qty: 1, labor: true });
  return rows;
}
