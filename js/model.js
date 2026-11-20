// Loyiha ma'lumoti va namunalar. Barcha o'lchamlar santimetrda, rejada x o'ngga, y pastga.

export const ROOM_TYPES = {
  living: { name: "Yashash xonasi", ti: 22, n: 0.5, heated: true },
  guest: { name: "Mehmonxona", ti: 22, n: 0.5, heated: true },
  bedroom: { name: "Yotoqxona", ti: 22, n: 0.5, heated: true },
  kitchen: { name: "Oshxona", ti: 20, n: 1, heated: true },
  bath: { name: "Hammom", ti: 25, n: 1, heated: true },
  hall: { name: "Yo'lak", ti: 18, n: 0.5, heated: true },
  boiler: { name: "Qozonxona", ti: 10, n: 1, heated: false },
  store: { name: "Omborxona", ti: 10, n: 0.3, heated: false },
};

export const WALL_MATERIALS = {
  brick: { name: "Pishgan g'isht", lam: 0.7 },
  adobe: { name: "Paxsa yoki guvala", lam: 0.5 },
  aerated: { name: "Gazoblok", lam: 0.2 },
};

// Devor rangi 3D ko'rinishda: tayyor ranglar va standart
export const WALL_COLOR = "#ece7dc";
export const WALL_COLORS = [
  ["#ece7dc", "Oqish"], ["#f6f3ec", "Oq"], ["#e8d9b8", "Qum"], ["#d9c19a", "Och jigarrang"],
  ["#c98f6b", "G'isht"], ["#b7c4b0", "Zaytun"], ["#a9bfcf", "Havorang"], ["#9aa0a3", "Kulrang"],
];

export const ITEM_KINDS = {
  stairs: { name: "Zina", group: "build", w: 100, d: 300, color: "#9c7a58" },
  riser: { name: "Stoyak", group: "build", w: 30, d: 30, color: "#55636b", round: true },
  boiler: { name: "Qozon", group: "heat", w: 60, d: 80, color: "#c9611c" },
  manifold: { name: "Kollektor", group: "heat", w: 60, d: 14, color: "#b0862b" },
  panel: { name: "Elektr shchiti", group: "elec", w: 40, d: 12, color: "#3b4a55" },
  jbox: { name: "Taqsimlash korobkasi", group: "elec", w: 22, d: 22, color: "#7a4fa3" },
  light: { name: "Chiroq", group: "elec", w: 26, d: 26, color: "#c79a1e", round: true },
  switch: { name: "Viklyuchatel", group: "elec", w: 16, d: 16, color: "#5a6a75" },
  socket: { name: "Rozetka", group: "elec", w: 16, d: 16, color: "#2f7d57" },
  power: { name: "Quvvatli rozetka", group: "elec", w: 20, d: 20, color: "#a33a2c" },
  waterin: { name: "Suv kirishi", group: "plumb", w: 22, d: 22, color: "#1c69ba", round: true },
  sewerout: { name: "Kanalizatsiya chiqishi", group: "plumb", w: 26, d: 26, color: "#6e7b3c", round: true },
  sink: { name: "Rakovina", group: "plumb", w: 55, d: 45, color: "#7f97a3" },
  toilet: { name: "Unitaz", group: "plumb", w: 40, d: 65, color: "#7f97a3" },
  squat: { name: "Chashagen", group: "plumb", w: 50, d: 60, color: "#7f97a3" },
  wudu: { name: "Tahorat joyi", group: "plumb", w: 80, d: 50, color: "#7f97a3" },
  bathtub: { name: "Vanna", group: "plumb", w: 170, d: 75, color: "#7f97a3" },
  shower: { name: "Dush", group: "plumb", w: 90, d: 90, color: "#7f97a3" },
  washer: { name: "Kir yuvish mashinasi", group: "plumb", w: 60, d: 60, color: "#7f97a3" },
  heater: { name: "Suv isitkich", group: "plumb", w: 45, d: 45, color: "#b4553f", round: true },
  tank: { name: "Suv bochkasi", group: "plumb", w: 90, d: 90, color: "#2b7fa8", round: true },
};

// Suv bochkasi: hajmi va joyi. Balandlik bochka tubining yerdan balandligi, sm
export const TANK_VOLUMES = [200, 300, 500, 1000, 1500, 2000, 3000, 5000];
export const TANK_PLACES = {
  ground: { name: "Yerda" },
  stand: { name: "Ustunli tagkursida", h: 300 },
  tower: { name: "Minorada", h: 800 },
  roof: { name: "Tomda yoki cherdakda" },
  underground: { name: "Yer ostida", depth: 250 },
};
export const TANK_DIAM = { 200: 60, 300: 70, 500: 80, 1000: 110, 1500: 120, 2000: 135, 3000: 160, 5000: 190 };
export const tankBase = (t, p) => {
  if (t.place === "stand" || t.place === "tower") return t.stand ?? TANK_PLACES[t.place].h;
  if (t.place === "roof") return (p.floors || 1) * (p.h + (p.slab ?? 30)) + 20;
  if (t.place === "underground") return -(t.depth ?? TANK_PLACES.underground.depth);
  return 0;
};
// Uy kattaligiga qarab bochka: xonalar maydonidan odam soni, kishiga kuniga 150 l, bir kunlik zaxira
export function tankNeed(p) {
  const area = p.rooms.filter((r) => ROOM_TYPES[r.type].heated && (r.floor || 0) < (p.floors || 1)).reduce((a, r) => a + (r.w * r.d) / 1e4, 0);
  const people = Math.max(3, Math.ceil(area / 25)), day = people * 150;
  return { people, day, vol: TANK_VOLUMES.find((v) => v >= day) || TANK_VOLUMES[TANK_VOLUMES.length - 1] };
}
export const tankVol = (t, p) => (t.vol === "auto" || !t.vol ? tankNeed(p).vol : t.vol);

// Vanna turlari va o'lchamlari, sm (eni × chuqurligi rejada)
export const BATH_TYPES = {
  straight: { name: "Odatiy vanna", sizes: ["150×70", "160×70", "170×75", "180×80"], def: "170×75" },
  corner: { name: "Burchak vanna", sizes: ["120×120", "135×135", "150×150"], def: "150×150" },
};
// Jihoz o'lchami: vannada tanlangan turi va o'lchamiga qarab
export function kindOf(i) {
  const k = ITEM_KINDS[i.kind];
  if (i.kind !== "bathtub") return k;
  const t = BATH_TYPES[i.btype] ? i.btype : "straight";
  const [w, d] = (BATH_TYPES[t].sizes.includes(i.bsize) ? i.bsize : BATH_TYPES[t].def).split("×").map(Number);
  return { ...k, w, d, btype: t };
}

// Chiroq turlari: quvvati bitta chiroq uchun, n bitta nuqtadagi soni
export const LIGHT_TYPES = {
  chandelier: { name: "Lyustra", w: 120, n: 1 },
  ledpanel: { name: "LED panel", w: 36, n: 1 },
  ledspot: { name: "LED spot", w: 7, n: 6 },
  halogen: { name: "Galogen spot", w: 35, n: 6 },
  bulb: { name: "Oddiy lampochka", w: 60, n: 1 },
  sconce: { name: "Bra (devor chirog'i)", w: 40, n: 1, wall: true },
  strip: { name: "LED lenta", w: 14, n: 5 },
};
// O'rnatish balandligi poldan, sm. Shift ostidagilar uchun null.
export const MOUNT = { socket: 30, power: 30, switch: 90, panel: 170, jbox: null, light: null };
export const mountH = (i, p) => i.h ?? (i.kind === "light" && LIGHT_TYPES[i.ltype]?.wall ? 200 : MOUNT[i.kind] ?? null) ?? p.h - 20;

let seq = 1;
export const uid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

export function room(type, x, y, w, d, name) {
  return { id: uid(), type, name: name || ROOM_TYPES[type].name, x, y, w, d };
}
export function opening(kind, roomId, side, off, extra = {}) {
  const base = { door: { w: 90, h: 210, sill: 0 }, entry: { w: 100, h: 210, sill: 0 }, window: { w: 150, h: 150, sill: 90 } }[kind];
  return { id: uid(), kind, room: roomId, side, off, ...base, ...extra };
}
export function item(kind, x, y) {
  const i = { id: uid(), kind, x, y };
  if (kind === "light") i.ltype = "ledpanel";
  if (kind === "tank") Object.assign(i, { vol: "auto", place: "stand", pump: false });
  return i;
}

export function emptyProject() {
  return {
    version: 1,
    name: "Yangi loyiha",
    h: 300,
    floors: 1,
    slab: 30,
    tout: -15,
    wallMaterial: "brick",
    wallColor: WALL_COLOR,
    wallT: 40,
    ins: 0,
    regime: "80/60",
    circ: "pump",     // gravity: o'zi aylanadi, pump: nasos bilan, hybrid: ikkalasi
    loop: "closed",   // open: ochiq bak, closed: yopiq membranali bak
    fuel: "gas",      // gas yoki solid
    pit: 100,
    sewerVent: "roof", // roof: stoyak tomdan chiqadi, valve: havo klapani
    elecMode: "box",
    cableMetal: "al",  // cu: mis, al: alyuminiy
    boxCable: { feed: "2×10", socket: "2×4", power: "2×6", light: "2×2.5" }, // korobkali montajdagi kabellar
    groupCable: {},    // guruh nomi bo'yicha qo'lda tanlangan kesim, mm²
    pipeRule: "count", // count: magistral 32/40 radiatorlar soniga qarab, radiatorga 25; calc: gidravlik hisob
    mainAt: 7,         // shuncha va undan ko'p radiatorda magistral 40 mm
    radScheme: "tree", // tree: troynikli, collector: kollektordan nurli
    ufhRegime: "45/35",
    ufhStep: 15,
    ufhCover: "tile",
    radType: "cast",   // cast, bimetal yoki panel
    panelType: 22,
    panelH: 500,
    radiators: [],     // qo'lda qo'yilgan radiatorlar: { id, room, side, off, kind, size, ptype, ph }
    rooms: [],
    openings: [],
    items: [],
    prices: {},
    extras: [],
    hiddenRows: [],    // hisobdan chiqarilgan qatorlar kaliti (masalan, komplektda bor)
    repParts: { heat: true, elec: true, plumb: true, extra: true }, // hisobga kiritiladigan bo'limlar
  };
}

// Eski fayllardagi gravity belgisi yangi sozlamalarga o'tkaziladi
export function normalize(raw) {
  const p = { ...emptyProject(), ...raw };
  if (raw.circ === undefined && raw.gravity) { p.circ = "hybrid"; p.loop = "open"; p.fuel = "solid"; }
  delete p.gravity;
  return p;
}

// Namuna: oldingi loyihadagi uy
export function sampleProject() {
  const p = emptyProject();
  p.name = "Namuna uy, 12,3 × 8,3 m";
  p.circ = "hybrid"; p.loop = "open"; p.fuel = "solid";
  const m = room("guest", 0, 0, 360, 750);
  const o = room("kitchen", 400, 0, 350, 750);
  const h = room("bath", 790, 0, 360, 200);
  const y = room("living", 790, 240, 360, 510);
  const b = room("boiler", 280, -240, 200, 200);
  p.rooms = [m, o, h, y, b];
  p.openings = [
    opening("window", m.id, "s", 180),
    opening("window", y.id, "s", 180),
    opening("entry", o.id, "s", 175),
    opening("door", m.id, "e", 582),
    opening("door", o.id, "e", 582),
    opening("door", h.id, "s", 85, { w: 80 }),
    opening("door", b.id, "n", 165, { w: 70, h: 200 }),
  ];
  p.items = [
    item("boiler", 330, -130),
    item("sink", 435, 25), item("sink", 845, 25), item("washer", 1005, 32), item("heater", 1005, 90),
    item("shower", 1100, 48), item("waterin", 1140, 8), item("sewerout", 1100, 8),
    item("panel", 730, 720),
    { ...item("light", 180, 375), ltype: "chandelier" }, { ...item("light", 575, 375), ltype: "ledpanel" },
    { ...item("light", 970, 100), ltype: "ledspot" }, { ...item("light", 970, 495), ltype: "chandelier" }, { ...item("light", 380, -140), ltype: "bulb" },
    item("switch", 350, 520), item("switch", 410, 520), item("switch", 800, 260), item("switch", 830, 190), item("switch", 440, -215),
    item("socket", 10, 200), item("socket", 10, 520), item("socket", 180, 740), item("socket", 420, 20), item("socket", 700, 20),
    item("socket", 1140, 400), item("socket", 1000, 740),
    item("power", 1005, 10), item("power", 300, -60),
  ];
  return p;
}
