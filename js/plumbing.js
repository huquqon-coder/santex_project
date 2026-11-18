// Santexnika: suv manbai (shahar suvi yoki bochka), sovuq va issiq suv, kanalizatsiya nishabligi va ventilyatsiyasi.
import { TANK_PLACES, tankBase } from "./model.js";
import { floorOf, fv, roomAt } from "./geometry.js";
import { multiFloor, segLen } from "./route.js";
import { crossings, treeFittings } from "./fittings.js";

// Hisobiy sarf, l/s; need: kerakli bosim, m suv ustuni; tap: kran balandligi poldan, m; conn: devordan ulanish balandligi, m
export const FIX = {
  sink: { name: "Rakovina", cold: 0.1, hot: 0.1, drain: 50, need: 2, tap: 1.0, conn: 0.55 },
  toilet: { name: "Unitaz", cold: 0.1, hot: 0, drain: 110, need: 1, tap: 0.2, conn: 0.2 },
  squat: { name: "Chashagen", cold: 0.1, hot: 0, drain: 110, need: 1, tap: 1.5, conn: 1.5 },
  wudu: { name: "Tahorat joyi", cold: 0.1, hot: 0.1, drain: 50, need: 2, tap: 0.6, conn: 0.6 },
  bathtub: { name: "Vanna", cold: 0.15, hot: 0.15, drain: 50, need: 2, tap: 0.8, conn: 0.8 },
  shower: { name: "Dush", cold: 0.12, hot: 0.12, drain: 50, need: 3, tap: 2.0, conn: 1.1 },
  washer: { name: "Kir yuvish mashinasi", cold: 0.15, hot: 0, drain: 50, need: 5, tap: 0.8, conn: 0.8 },
};
// PPR: sovuq suvga PN20, issiq suvga armaturali PN25; id ichki diametr, mm
const PPR = [{ dn: 20, id: 13.2 }, { dn: 25, id: 16.6 }, { dn: 32, id: 21.2 }, { dn: 40, id: 26.6 }];
const SLOPE = { 50: 0.03, 110: 0.02 };
// PPR diametriga mos rezba
const THREAD = { 20: '1/2"', 25: '3/4"', 32: '1"', 40: '1 1/4"' };
const START_DEPTH = 0.1; // sifon chiqishi poldan pastda, m
const G = { door: 25, wall: 3, outside: 2 };

// Bir vaqtda ishlash ehtimoli bilan hisobiy sarf (DIN 1988-300, turar joy)
const design = (sum) => (sum <= 0.2 ? sum : Math.max(0.15, Math.min(sum, 1.48 * sum ** 0.19 - 0.94)));
const pipeFor = (sum) => {
  const q = design(sum) / 1000;
  return PPR.find((d) => q / ((Math.PI / 4) * (d.id / 1000) ** 2) <= 1.5) || PPR[PPR.length - 1];
};
export const pumped = (t) => !!t && (t.pump || t.place === "ground");
const sewerDn = (load) => (load >= 100 || load > 3 ? 110 : 50);
// Burilish va troyniklar soni: chiziq ichidagi har bir burchak bitta tirsak, har bir yangi tarmoq bitta troynik
const fittings = (segs) => ({ bends: segs.reduce((a, s) => a + Math.max(0, s.pts.length - 2), 0), tees: Math.max(0, segs.length - 1) });

export function computePlumbing(p) {
  const warnings = [], notes = [];
  const live = (i) => floorOf(i) < (p.floors || 1);
  const fx = p.items.filter((i) => FIX[i.kind] && live(i));
  const inlet = p.items.find((i) => i.kind === "waterin" && live(i));
  const tank = p.items.find((i) => i.kind === "tank" && live(i));
  const outlet = p.items.find((i) => i.kind === "sewerout" && live(i));
  const heater = p.items.find((i) => i.kind === "heater" && live(i));
  const out = {
    warnings, notes, cold: [], hot: [], fill: [], sewer: [], risers: [], coldLen: {}, hotLen: {}, sewerLen: {},
    fixtures: fx.length, depth: 0, deepest: null, cleanouts: [], vent: null, tank: null, source: null, fit: {},
  };
  if (!fx.length && !tank) return out;
  const cache = new Map();
  const add = (o, dn, l) => (o[dn] = (o[dn] || 0) + l);

  // Suv manbai: bochka bo'lsa undan, bo'lmasa shahar suvidan
  const source = tank || inlet;
  out.source = tank ? "tank" : inlet ? "city" : null;
  if (tank) {
    const base = tankBase(tank, p) / 100;
    out.tank = { ...tank, base, place: TANK_PLACES[tank.place] ? tank.place : "stand", vol: tank.vol || 500 };
    if (inlet) {
      const t = multiFloor(p, inlet, [{ x: tank.x, y: tank.y, load: 0.3, floor: floorOf(tank) }], G, cache);
      out.fill = t.segs.map((s) => ({ ...s, dn: 25, len: segLen(s) }));
      add(out.coldLen, 25, out.fill.reduce((a, s) => a + s.len, 0) + base + 1);
      notes.push("Bochka shahar suvidan qalqovichli klapan orqali to'ladi.");
    } else notes.push("Suv kirishi qo'yilmagan: bochka tashib keltirilgan suv bilan to'ldiriladi.");
  }
  if (!fx.length) return out;
  if (!source) warnings.push("Suv manbai yo'q: \"Suv kirishi\" yoki \"Suv bochkasi\" qo'ying.");
  else {
    const targets = fx.filter((f) => FIX[f.kind].cold).map((f) => ({ x: f.x, y: f.y, load: FIX[f.kind].cold, floor: floorOf(f), f }));
    const hotSum = fx.reduce((a, f) => a + FIX[f.kind].hot, 0);
    if (heater) targets.push({ x: heater.x, y: heater.y, load: Math.max(0.1, hotSum), floor: floorOf(heater) });
    const t = multiFloor(p, source, targets, G, cache, () => 1);
    if (!t.ok) warnings.push("Sovuq suv yo'li topilmadi.");
    out.cold = t.segs.map((s) => ({ ...s, dn: pipeFor(s.load).dn, len: segLen(s) }));
    out.coldRoots = [{ x: source.x, y: source.y, floor: floorOf(source) }, ...t.risers.map((q) => ({ x: q.x, y: q.y, floor: q.to }))];
    for (const q of t.risers) { q.dn = pipeFor(q.load).dn; out.risers.push({ ...q, kind: "cold" }); add(out.coldLen, q.dn, q.len); }
    const main = pipeFor(fx.reduce((a, f) => a + FIX[f.kind].cold + FIX[f.kind].hot, 0));
    if (tank && tank.place !== "ground") add(out.coldLen, main.dn, tankBase(tank, p) / 100 + 0.5);
    out.mainDn = main.dn;
    // Bochkadan bosim: tub balandligi minus kran balandligi va yo'qotishlar
    if (tank && tank.place === "ground" && !tank.pump) notes.push("Yerdagi bochkadan suv o'zi chiqmaydi: nasos stansiyasi hisobga qo'shildi.");
    if (tank && !pumped(tank)) {
      const base = tankBase(tank, p) / 100;
      // Har jihoz turi uchun eng yomon holat
      const short = new Map();
      for (const q of targets.filter((x) => x.f)) {
        const k = FIX[q.f.kind], lift = floorOf(q.f) * (p.h + (p.slab ?? 30)) / 100;
        const head = Math.max(0, base - lift - k.tap - (q.path || 0) * 0.05 - 0.5);
        if (head < k.need && !(short.get(k.name)?.head <= head)) short.set(k.name, { head, need: k.need });
      }
      if (short.size) warnings.push(`Bochkadan bosim yetmaydi: ${[...short].map(([n, s]) => `${n} ${s.head.toFixed(1).replace(".", ",")} m (kerak ${s.need} m)`).join(", ")}. Bochkani balandroq ko'taring yoki nasos stansiyasi qo'shing.`);
    }
  }

  const hotFx = fx.filter((f) => FIX[f.kind].hot);
  if (hotFx.length && !heater) warnings.push("Issiq suv uchun suv isitkich qo'yilmagan.");
  else if (heater && hotFx.length) {
    const t = multiFloor(p, heater, hotFx.map((f) => ({ x: f.x, y: f.y, load: FIX[f.kind].hot, floor: floorOf(f) })), G, cache);
    out.hot = t.segs.map((s) => ({ ...s, dn: pipeFor(s.load).dn, len: segLen(s) }));
    out.hotRoots = [{ x: heater.x, y: heater.y, floor: floorOf(heater) }, ...t.risers.map((q) => ({ x: q.x, y: q.y, floor: q.to }))];
    for (const q of t.risers) { q.dn = pipeFor(q.load).dn; out.risers.push({ ...q, kind: "hot" }); add(out.hotLen, q.dn, q.len); }
    // Issiq suv uzunligi 10 m dan oshsa, kran ochilganda sovuq suv uzoq oqadi
    const far = Math.max(0, ...hotFx.map((f) => Math.hypot(f.x - heater.x, f.y - heater.y) / 100));
    if (far > 10) notes.push("Issiq suv nuqtasi isitkichdan uzoq: issiq suv kechroq keladi, quvurni izolyatsiya qiling.");
  }
  for (const s of out.cold) add(out.coldLen, s.dn, s.len);
  for (const s of out.hot) add(out.hotLen, s.dn, s.len);
  // Poldagi quvurdan jihoz ulanishigacha devordagi tik bo'lak, Ø20
  for (const f of fx) {
    const v = Math.abs(FIX[f.kind].conn - 0.3) + 0.2;
    if (FIX[f.kind].cold) add(out.coldLen, 20, v);
    if (FIX[f.kind].hot && heater) add(out.hotLen, 20, v);
  }
  if (heater) { add(out.coldLen, 20, 1); add(out.hotLen, 20, 1); }

  // Kanalizatsiya: nishablik bilan chiqishdagi chuqurlik
  if (!outlet) warnings.push("Kanalizatsiya chiqishi qo'yilmagan.");
  else {
    const targets = fx.map((f) => ({ x: f.x, y: f.y, load: FIX[f.kind].drain === 110 ? 100 : 1, floor: floorOf(f), f }));
    const t = multiFloor(p, outlet, targets, G, cache, (load) => SLOPE[sewerDn(load)]);
    if (!t.ok) warnings.push("Kanalizatsiya yo'li topilmadi.");
    out.sewer = t.segs.map((s) => {
      const dn = sewerDn(s.load);
      return { ...s, dn, len: segLen(s), slope: SLOPE[dn] };
    });
    for (const s of out.sewer) add(out.sewerLen, s.dn, s.len);
    const base = floorOf(outlet);
    for (const q of t.risers) {
      out.risers.push({ ...q, kind: "sewer", dn: 110 });
      add(out.sewerLen, 110, q.len);
      out.cleanouts.push({ x: q.x, y: q.y, floor: base, why: "stoyak tagida" });
    }
    // Eng chuqur nuqta: har bir jihozdan chiqishgacha nishablik yig'indisi
    const starts = [
      ...targets.filter((q) => floorOf(q) === base).map((q) => ({ name: FIX[q.f.kind].name, d: START_DEPTH + (q.walk || 0) })),
      ...t.risers.map((q) => ({ name: "Stoyak", d: 0.3 + (q.walk || 0) })),
    ];
    const deep = starts.sort((a, b) => b.d - a.d)[0];
    out.depth = deep ? deep.d : 0;
    out.deepest = deep?.name || null;
    if (out.depth > 1.2) warnings.push(`Kanalizatsiya chiqishda ${out.depth.toFixed(2)} m chuqurlikka tushadi. Chiqishni jihozlarga yaqinroq qo'ying.`);
    // Reviziya: Ø110 quvur burilishlarida va uydan chiqishda
    for (const s of out.sewer.filter((x) => x.dn === 110)) {
      for (const q of s.pts.slice(1, -1)) out.cleanouts.push({ x: q[0], y: q[1], floor: s.floor, why: "burilishda" });
    }
    out.cleanouts.push({ x: outlet.x, y: outlet.y, floor: base, why: "uydan chiqishda" });
    // Ventilyatsiya stoyagi: unitaz yonida, bo'lmasa eng uzoq jihozda
    const toilet = fx.find((f) => f.kind === "toilet" || f.kind === "squat");
    const far = targets.filter((q) => floorOf(q) === base).sort((a, b) => (b.walk || 0) - (a.walk || 0))[0];
    const at = t.risers[0] || toilet || far?.f;
    if (at) {
      const hAll = (p.floors || 1) * (p.h + (p.slab ?? 30)) / 100;
      const roof = p.sewerVent !== "valve";
      out.vent = { x: at.x, y: at.y, floor: base, roof, len: hAll + (roof ? 1.5 : 0.3) };
      if (!toilet && !roof) notes.push("Unitaz yo'q: havo klapani yetarli.");
    }
    out.fit.sewer = { 50: fittings(out.sewer.filter((s) => s.dn === 50)), 110: fittings(out.sewer.filter((s) => s.dn === 110)) };
  }
  out.wfit = {
    cold: treeFittings([...out.cold, ...out.fill], [...(out.coldRoots || []), ...(inlet ? [{ x: inlet.x, y: inlet.y, floor: floorOf(inlet) }] : [])]),
    hot: treeFittings(out.hot, out.hotRoots || []),
    cross: crossings(out.cold, out.hot),
  };
  return out;
}

export function plumbingBom(p, w) {
  if (!w.fixtures && !w.tank) return [];
  const G = "Santexnika", rows = [];
  const live = p.items.filter((i) => floorOf(i) < (p.floors || 1));
  const n = (k) => live.filter((i) => i.kind === k).length;
  const push = (k, name, spec, unit, qty) => qty > 0 && rows.push({ g: G, k, name, spec, unit, qty: Math.ceil(qty) });
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  // Suv manbai va kirish uzeli
  if (w.tank) {
    const t = w.tank;
    push("tank_" + t.vol, "Suv bochkasi, plastik", `${t.vol} l`, "dona", 1);
    if (t.place === "stand") push("tankstand", "Bochka tagkursi, metall", `${Math.round(t.base * 100)} sm`, "dona", 1);
    if (w.fill.length) push("float", "Qalqovichli to'ldirish klapani", "1/2\"", "dona", 1);
    push("tankval", "Bochka chiqish krani", "1\"", "dona", 1);
    push("tankover", "Bochka to'kish quvuri", "Ø32", "m", 2);
    push("tankfilter", "Bochkadan keyin mexanik filtr", "1\"", "dona", 1);
    if (pumped(t)) {
      push("pumpst", "Nasos stansiyasi, gidroakkumulyator bilan", "24 l, 0,8 kW", "dona", 1);
      push("pumpdry", "Quruq ishlashdan himoya relesi", "", "dona", 1);
      push("pumpchk", "Nasos oldidan teskari klapan", "1\"", "dona", 1);
    }
  }
  if (live.some((i) => i.kind === "waterin")) {
    push("inval", "Asosiy kran, kirishda", "1\"", "dona", 1);
    push("infilter", "Mexanik filtr, yuviladigan", "1\"", "dona", 1);
    push("meter", "Suv hisoblagichi", "Ø15", "dona", 1);
    push("inchk", "Teskari klapan", "1\"", "dona", 1);
    if (!w.tank) push("reducer", "Bosim reduktori", "3 bar", "dona", 1);
  }

  // Suv quvurlari va fitinglar
  for (const dn of Object.keys(w.coldLen).sort((a, b) => a - b)) push("pprc" + dn, "PPR PN20 quvur, sovuq suv", `Ø${dn}`, "m", w.coldLen[dn] * 1.1);
  for (const dn of Object.keys(w.hotLen).sort((a, b) => a - b)) push("pprh" + dn, "PPR PN25 armaturali quvur, issiq suv", `Ø${dn}`, "m", w.hotLen[dn] * 1.1);
  const waterL = sum(w.coldLen) + sum(w.hotLen);
  const fxc = live.filter((i) => FIX[i.kind]);
  const conn = fxc.reduce((a, i) => a + (FIX[i.kind].cold ? 1 : 0) + (FIX[i.kind].hot && n("heater") ? 1 : 0), 0);
  // Fitinglar diametr bo'yicha alohida qator bo'ladi
  const F = "Santexnika: PPR fitinglar";
  const fit = (k, name, spec, qty) => qty > 0 && rows.push({ g: F, k, name, spec, unit: "dona", qty: Math.ceil(qty) });
  const both = (key) => {
    const o = {};
    for (const src of [w.wfit?.cold?.[key], w.wfit?.hot?.[key]]) for (const [k, v] of Object.entries(src || {})) o[k] = (o[k] || 0) + v;
    return o;
  };
  const byDn = (o) => Object.entries(o).sort((a, b) => parseFloat(a[0].replace("Ø", "")) - parseFloat(b[0].replace("Ø", "")));
  // Har bir jihoz ulanishida devorga ko'tarilish uchun bitta Ø20 otvod
  const bends = both("bend"); bends[20] = (bends[20] || 0) + conn;
  for (const [dn, q] of byDn(bends)) fit("pbend" + dn, "Otvod (tirsak) 90°", `Ø${dn}`, q);
  for (const [dn, q] of byDn(both("half"))) fit("phalf" + dn, "Polotvod (yarim tirsak) 45°", `Ø${dn}`, q);
  for (const [s, q] of byDn(both("tee"))) fit("ptee" + s, s.includes("×") ? "Troynik, o'tuvchi (perexodnoy)" : "Troynik, teng", s, q);
  for (const [s, q] of byDn(both("red"))) fit("pred" + s, "O'tish muftasi (perexodnik)", s, q);
  for (const [dn, q] of byDn(w.wfit?.cross || {})) fit("pcross" + dn, "Obvod (aylanib o'tish), quvurlar kesishgan joyda", `Ø${dn}`, q);
  const coup = {};
  for (const o of [w.coldLen, w.hotLen]) for (const [dn, l] of Object.entries(o)) coup[dn] = (coup[dn] || 0) + l;
  for (const [dn, l] of byDn(coup)) {
    fit("pcoup" + dn, "Mufta (ulash)", `Ø${dn}`, Math.floor(l / 4) + 1);
    fit("pclip" + dn, "Quvur qisqichi (klips)", `Ø${dn}`, l / 0.6);
  }
  fit("pplate", "Ushastik adapter (vodorozetka), ichki rezba", "Ø20 × 1/2\"", conn);
  // Rezbali jihozlar (kran, filtr, hisoblagich, klapan): har ikki uchiga tashqi rezbali adapter
  const main = w.mainDn || 25, th = THREAD[main] || '1"';
  const inline = (live.some((i) => i.kind === "waterin") ? (w.tank ? 3 : 4) : 0) + (w.tank ? 2 : 0);
  fit("padapt" + main, "Adapter, tashqi rezbali (kombinatsiyalangan mufta)", `Ø${main} × ${th}`, inline * 2);
  if (w.fill.length) fit("padaptf", "Adapter, tashqi rezbali, qalqovich klapanga", "Ø25 × 1/2\"", 1);
  if (pumped(w.tank)) fit("pamer" + main, "Amerikanka (ajraladigan mufta), nasosga", `Ø${main} × ${th}`, 2);
  if (n("heater")) fit("pamerh", "Amerikanka, suv isitkichga", "Ø20 × 1/2\"", n("heater") * 2);
  const wet = new Set(fxc.map((i) => roomAt(fv(p, floorOf(i)), i.x, i.y)?.id || "-")).size;
  fit("pball", "PPR sharli kran, xona tarmog'iga", "Ø20–25", wet + (n("heater") && conn > wet ? wet : 0));
  fit("psleeve", "Devor va yopmadan o'tish gilzasi", "Ø32–40", (w.risers || []).filter((q) => q.kind !== "sewer").length + 2);
  push("pprins", "Issiq suv quvuri izolyatsiyasi", "Ø20–25", "m", sum(w.hotLen) * 1.1);

  // Jihozlarni ulash armaturasi. Rakovina aralashtirgichi shlangi bilan, vanna va dush aralashtirgichi ekssentrigi bilan,
  // suv isitkich xavfsizlik klapani bilan keladi
  push("anglev", "Burchakli kran", "1/2\" × 1/2\"", "dona", n("sink") * 2 + n("toilet") + n("squat"));
  push("flexh", "Moslashuvchan shlang (unitaz, bachok va suv isitkichga)", "1/2\", 40–60 sm", "dona", n("toilet") + n("squat") + n("heater") * 2);
  push("cistern", "Yuvish bachogi, chashagen uchun, quvuri bilan", "", "dona", n("squat"));
  push("sqtrap", "Chashagen sifoni (tirsak)", "Ø110", "dona", n("squat"));
  push("floortrap", "Pol trapi, tahorat joyi uchun", "Ø50", "dona", n("wudu"));
  push("mixer", "Aralashtirgich (smesitel)", "", "dona", n("sink") + n("bathtub") + n("shower") + n("wudu"));
  push("washv", "Kir mashinasi krani", "1/2\" × 3/4\"", "dona", n("washer"));
  if (n("heater")) push("heatval", "Suv isitkich kranlari", "1/2\"", "dona", n("heater") * 2);

  // Kanalizatsiya
  for (const dn of Object.keys(w.sewerLen).sort((a, b) => a - b)) push("pvc" + dn, "PVX kanalizatsiya quvuri", `Ø${dn}`, "m", w.sewerLen[dn] * 1.1);
  const fs = w.fit.sewer || {};
  push("sbend50", "Kanalizatsiya burilishi 45°", "Ø50", "dona", (fs[50]?.bends || 0) * 2 + n("sink") + n("bathtub") + n("shower") + n("washer") + n("wudu"));
  push("sbend110", "Kanalizatsiya burilishi 45°", "Ø110", "dona", (fs[110]?.bends || 0) * 2 + n("toilet") + n("squat"));
  push("stee50", "Qiya troynik 45°", "Ø50", "dona", fs[50]?.tees || 0);
  push("stee110", "Qiya troynik 45°", "Ø110 × 50/110", "dona", fs[110]?.tees || 0);
  if (w.sewerLen[50] && w.sewerLen[110]) push("sred", "O'tish muftasi", "Ø110 × 50", "dona", Math.max(1, fs[110]?.tees || 1));
  push("clean", "Reviziya (tozalash lyuki)", "Ø110", "dona", w.cleanouts.length);
  const sif = n("sink") + n("bathtub") + n("shower") + n("washer");
  push("trap", "Sifon", "Ø40/50", "dona", sif);
  push("tcuff", "Unitaz manjeti (gofra)", "Ø110", "dona", n("toilet"));
  push("sclip", "Kanalizatsiya quvuri xomuti", "Ø50–110", "dona", sum(w.sewerLen) + (w.vent?.len || 0));
  if (w.vent) {
    push("ventpipe", "Ventilyatsiya stoyagi", "Ø110", "m", w.vent.len);
    if (w.vent.roof) { push("venthood", "Ventilyatsiya qalpog'i", "Ø110", "dona", 1); push("ventroof", "Tomdan o'tish manjeti", "Ø110", "dona", 1); }
    else push("ventvalve", "Havo klapani (aerator)", "Ø110", "dona", 1);
  }

  // Jihozlar
  for (const k of ["sink", "toilet", "squat", "bathtub", "shower", "heater"]) push("f_" + k, k === "heater" ? "Suv isitkich" : FIX[k].name, "", "dona", n(k));

  const L = waterL + sum(w.sewerLen);
  rows.push({ g: "Santexnika ishi", k: "l_fix", name: "Jihozni ulash", unit: "dona", qty: w.fixtures, labor: true });
  rows.push({ g: "Santexnika ishi", k: "l_wpipe", name: "Suv va kanalizatsiya quvuri yotqizish", unit: "m", qty: Math.ceil(L * 1.1), labor: true });
  if (w.tank) rows.push({ g: "Santexnika ishi", k: "l_tank", name: "Bochkani o'rnatish va ulash", unit: "dona", qty: 1, labor: true });
  if (pumped(w.tank)) rows.push({ g: "Santexnika ishi", k: "l_pumpst", name: "Nasos stansiyasini o'rnatish", unit: "dona", qty: 1, labor: true });
  if (w.vent) rows.push({ g: "Santexnika ishi", k: "l_vent", name: "Ventilyatsiya stoyagini chiqarish", unit: "dona", qty: 1, labor: true });
  return rows.filter((r) => r.qty > 0);
}
