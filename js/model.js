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

export const ITEM_KINDS = {
  boiler: { name: "Qozon", group: "heat", w: 60, d: 80, color: "#c9611c" },
  panel: { name: "Elektr shchiti", group: "elec", w: 40, d: 12, color: "#3b4a55" },
  light: { name: "Chiroq", group: "elec", w: 26, d: 26, color: "#c79a1e", round: true },
  switch: { name: "Viklyuchatel", group: "elec", w: 16, d: 16, color: "#5a6a75" },
  socket: { name: "Rozetka", group: "elec", w: 16, d: 16, color: "#2f7d57" },
  power: { name: "Quvvatli rozetka", group: "elec", w: 20, d: 20, color: "#a33a2c" },
  waterin: { name: "Suv kirishi", group: "plumb", w: 22, d: 22, color: "#1c69ba", round: true },
  sewerout: { name: "Kanalizatsiya chiqishi", group: "plumb", w: 26, d: 26, color: "#6e7b3c", round: true },
  sink: { name: "Rakovina", group: "plumb", w: 55, d: 45, color: "#7f97a3" },
  toilet: { name: "Unitaz", group: "plumb", w: 40, d: 65, color: "#7f97a3" },
  bathtub: { name: "Vanna", group: "plumb", w: 170, d: 75, color: "#7f97a3" },
  shower: { name: "Dush", group: "plumb", w: 90, d: 90, color: "#7f97a3" },
  washer: { name: "Kir yuvish mashinasi", group: "plumb", w: 60, d: 60, color: "#7f97a3" },
  heater: { name: "Suv isitkich", group: "plumb", w: 45, d: 45, color: "#b4553f", round: true },
};

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
  return { id: uid(), kind, x, y };
}

export function emptyProject() {
  return {
    version: 1,
    name: "Yangi loyiha",
    h: 300,
    tout: -15,
    wallMaterial: "brick",
    wallT: 40,
    ins: 0,
    regime: "80/60",
    gravity: false,
    pit: 100,
    rooms: [],
    openings: [],
    items: [],
    prices: {},
  };
}

// Namuna: oldingi loyihadagi uy
export function sampleProject() {
  const p = emptyProject();
  p.name = "Namuna uy, 12,3 × 8,3 m";
  p.gravity = true;
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
    item("light", 180, 375), item("light", 575, 375), item("light", 970, 100), item("light", 970, 495), item("light", 380, -140),
    item("switch", 350, 520), item("switch", 410, 520), item("switch", 800, 260), item("switch", 830, 190),
    item("socket", 10, 200), item("socket", 10, 520), item("socket", 180, 740), item("socket", 420, 20), item("socket", 700, 20),
    item("socket", 1140, 400), item("socket", 1000, 740),
    item("power", 1005, 10), item("power", 300, -60),
  ];
  return p;
}
