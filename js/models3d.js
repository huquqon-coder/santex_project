// Jihozlarning 3D modellari. Koordinata boshi polda, modelning markazida, oldi +z tomonda, o'lchamlar metrda.
const THREE = window.THREE;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
export const M = {
  white: std(0xf4f5f4, { roughness: 0.3 }), ceramic: std(0xfafafa, { roughness: 0.15 }), iron: std(0xe6e7e3, { roughness: 0.6 }),
  chrome: std(0xd5dadd, { metalness: 0.9, roughness: 0.2 }), steel: std(0xaab3b8, { metalness: 0.6, roughness: 0.4 }),
  galv: std(0x9aa7ad, { metalness: 0.5, roughness: 0.5 }), dark: std(0x262c30, { roughness: 0.5 }), black: std(0x121517, { roughness: 0.4 }),
  orange: std(0xd9641c, { roughness: 0.45 }), brass: std(0xc99a3a, { metalness: 0.6, roughness: 0.35 }), red: std(0xb5252b), blue: std(0x2469b3),
  plastic: std(0xeeeeea, { roughness: 0.4 }), grey: std(0x8b9398), wood: std(0x8a5f3b, { roughness: 0.6 }), woodDark: std(0x4a3323, { roughness: 0.5 }),
  frame: std(0xf3f3ef, { roughness: 0.4 }), sewer: std(0xc8652b, { roughness: 0.5 }), purple: std(0xe9e6df),
  glass: new THREE.MeshStandardMaterial({ color: 0xa9d6ea, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 }),
  shower: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, transparent: true, opacity: 0.25, roughness: 0.05 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 0.9 }),
};

function B(g, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
// axis: y tik, x va z yotiq
function C(g, r, len, mat, x, y, z, axis = "y", r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, 20), mat);
  m.position.set(x, y, z);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  m.castShadow = true; g.add(m); return m;
}
function S(g, r, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
}
function T(g, R, r, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 10, 28), mat);
  m.position.set(x, y, z); g.add(m); return m;
}
function line(g, pts, r, mat) {
  pts.forEach((p, i) => {
    if (!i) return;
    const a = pts[i - 1], d = p.clone().sub(a), len = d.length();
    if (len < 0.001) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    g.add(m);
    S(g, r, mat, p.x, p.y, p.z);
  });
}
const G = () => new THREE.Group();

export function radiator(sec) {
  // Cho'yan seksiyali radiator: har seksiyada ikki kolonna, tepada va pastda kollektor
  const g = G(), pitch = 0.093, H = 0.58, w = sec * pitch, x0 = -w / 2 + pitch / 2;
  const col = new THREE.CylinderGeometry(0.024, 0.024, H - 0.1, 10);
  const body = new THREE.InstancedMesh(col, M.iron, sec * 2);
  const d = new THREE.Object3D();
  for (let i = 0; i < sec; i++) {
    for (let k = 0; k < 2; k++) {
      d.position.set(x0 + i * pitch, H / 2 + 0.13, k ? 0.035 : -0.035); d.updateMatrix(); body.setMatrixAt(i * 2 + k, d.matrix);
    }
  }
  body.castShadow = true; g.add(body);
  const rib = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, H - 0.04, 0.13), M.iron, sec);
  for (let i = 0; i < sec; i++) { d.position.set(x0 + i * pitch, H / 2 + 0.13, 0); d.updateMatrix(); rib.setMatrixAt(i, d.matrix); }
  g.add(rib);
  for (const y of [0.13 + 0.05, 0.13 + H - 0.05]) {
    C(g, 0.034, w, M.iron, 0, y, 0.0, "x");
    C(g, 0.02, 0.02, M.chrome, w / 2 + 0.008, y, 0, "x");
    C(g, 0.02, 0.02, M.chrome, -w / 2 - 0.008, y, 0, "x");
  }
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) B(g, 0.03, 0.14, 0.05, M.grey, x, 0, -0.03);
  return g;
}

// Bimetall seksiyali: yupqa yassi qanotlar, oq bo'yalgan
export function radiatorBimetal(sec) {
  const g = G(), pitch = 0.08, H = 0.56, w = sec * pitch, x0 = -w / 2 + pitch / 2;
  const d = new THREE.Object3D();
  const fin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.072, H - 0.06, 0.075), M.white, sec);
  const face = new THREE.InstancedMesh(new THREE.BoxGeometry(0.068, H - 0.16, 0.012), M.white, sec);
  for (let i = 0; i < sec; i++) {
    d.position.set(x0 + i * pitch, H / 2 + 0.13, 0); d.updateMatrix(); fin.setMatrixAt(i, d.matrix);
    d.position.set(x0 + i * pitch, H / 2 + 0.13, 0.043); d.updateMatrix(); face.setMatrixAt(i, d.matrix);
  }
  fin.castShadow = true; g.add(fin, face);
  for (const y of [0.13 + 0.04, 0.13 + H - 0.04]) {
    C(g, 0.022, 0.02, M.chrome, w / 2 + 0.008, y, 0, "x");
    C(g, 0.022, 0.02, M.chrome, -w / 2 - 0.008, y, 0, "x");
  }
  return g;
}

// Po'lat panel radiator: old yuzasi chiziqli, tepasida panjara
export function radiatorPanel(len, h, type) {
  const g = G(), d = { 11: 0.065, 22: 0.1, 33: 0.155 }[type] || 0.1, y0 = 0.13;
  B(g, len, h, d, M.white, 0, y0, 0);
  const n = Math.max(4, Math.round(len / 0.033));
  const groove = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, h - 0.06, 0.004), M.plastic, n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { o.position.set(-len / 2 + (i + 0.5) * (len / n), y0 + h / 2, d / 2 + 0.002); o.updateMatrix(); groove.setMatrixAt(i, o.matrix); }
  g.add(groove);
  B(g, len - 0.02, 0.006, d - 0.01, M.grey, 0, y0 + h, 0);
  for (const x of [-len / 2, len / 2]) B(g, 0.008, h, d, M.white, x, y0, 0);
  C(g, 0.015, 0.03, M.chrome, len / 2 - 0.05, y0 + h - 0.02, d / 2 + 0.01, "z");
  return g;
}

export function boilerSolid() {
  const g = G(), w = 0.85, H = 1.35, d = 0.55;
  B(g, w, H, d, M.orange, 0, 0, 0);
  B(g, w + 0.02, 0.06, d + 0.02, M.dark, 0, H, 0);
  [[0.1, 0.34], [0.5, 0.36], [0.92, 0.32]].forEach(([y, h]) => {
    B(g, w - 0.14, h, 0.04, M.black, 0, y, d / 2 + 0.02);
    B(g, w - 0.26, h - 0.12, 0.012, M.dark, 0, y + 0.06, d / 2 + 0.045);
    C(g, 0.012, 0.14, M.chrome, w / 2 - 0.2, y + h / 2, d / 2 + 0.06, "x");
  });
  C(g, 0.1, 0.12, M.white, w / 2 + 0.06, 0.28, 0.05, "x");
  T(g, 0.1, 0.012, M.dark, w / 2 + 0.12, 0.28, 0.05).rotation.y = Math.PI / 2;
  C(g, 0.09, 0.3, M.steel, 0, H + 0.2, -0.1);
  B(g, 0.22, 0.14, 0.03, M.dark, -0.2, H + 0.02, d / 2 - 0.02);
  C(g, 0.045, 0.012, M.white, 0.1, H + 0.09, d / 2 - 0.02, "z");
  return g;
}

export function boilerGas() {
  const g = G(), w = 0.44, H = 0.74, d = 0.34;
  const y0 = 1.0;
  B(g, w, H, d, M.white, 0, y0, 0);
  B(g, 0.3, 0.14, 0.012, M.dark, 0, y0 + 0.1, d / 2 + 0.004);
  B(g, 0.12, 0.05, 0.006, M.lamp, 0, y0 + 0.14, d / 2 + 0.012);
  C(g, 0.05, 0.12, M.white, 0, y0 + H + 0.06, 0);
  C(g, 0.05, 0.5, M.white, 0, y0 + H + 0.1, -0.25, "z");
  for (const [x, m] of [[-0.15, M.red], [-0.05, M.brass], [0.05, M.brass], [0.15, M.blue]]) C(g, 0.011, 0.16, m, x, y0 - 0.08, 0.03);
  return g;
}

export function sink() {
  const g = G();
  C(g, 0.08, 0.72, M.ceramic, 0, 0.36, -0.05, "y", 0.11);
  const b = S(g, 0.25, M.ceramic, 0, 0.83, 0.02, 1.1, 0.42, 0.85);
  S(g, 0.2, M.white, 0, 0.87, 0.02, 1.1, 0.2, 0.85);
  B(g, 0.56, 0.05, 0.1, M.ceramic, 0, 0.84, -0.17);
  line(g, [V3(0, 0.88, -0.16), V3(0, 1.02, -0.16), V3(0, 1.05, -0.04), V3(0, 1.0, -0.02)], 0.012, M.chrome);
  C(g, 0.022, 0.08, M.chrome, 0, 0.92, -0.16);
  C(g, 0.008, 0.08, M.chrome, 0, 1.0, -0.13, "z");
  return g;
}

export function toilet() {
  const g = G();
  C(g, 0.11, 0.3, M.ceramic, 0, 0.15, 0.03, "y", 0.14);
  S(g, 0.2, M.ceramic, 0, 0.36, 0.12, 0.9, 0.3, 1.2);
  const seat = T(g, 0.15, 0.03, M.white, 0, 0.42, 0.12); seat.rotation.x = Math.PI / 2; seat.scale.set(0.95, 1.2, 1);
  B(g, 0.38, 0.38, 0.16, M.ceramic, 0, 0.4, -0.22);
  B(g, 0.4, 0.03, 0.18, M.white, 0, 0.78, -0.22);
  C(g, 0.022, 0.012, M.chrome, 0, 0.815, -0.22);
  return g;
}

// Chashagen (chasha Genuya): polga tushirilgan sopol chasha, oyoq qo'yadigan joyi bilan, devorda yuvish bachogi
export function squat() {
  const g = G(), w = 0.5, d = 0.6;
  B(g, w, 0.04, d, M.ceramic, 0, 0, 0.03);
  S(g, 0.15, M.white, 0, 0.04, 0.0, 1, 0.12, 1.45);
  C(g, 0.05, 0.01, M.grey, 0, 0.045, -0.12);
  for (const x of [-0.15, 0.15]) B(g, 0.11, 0.012, 0.24, M.white, x, 0.04, 0.2);
  B(g, 0.4, 0.3, 0.14, M.ceramic, 0, 1.6, -0.24);
  C(g, 0.012, 1.25, M.chrome, 0.12, 0.98, -0.24);
  line(g, [V3(0.12, 0.36, -0.24), V3(0.12, 0.08, -0.24), V3(0.05, 0.05, -0.2)], 0.012, M.chrome);
  return g;
}
// Gigiyenik dush: unitaz yoki chashagen yonida devorda, aralashtirgich, shlang va leyka (joyi o'ngda, devorga yaqin)
export function hygShower() {
  const g = G(), x = 0.38, z = -0.3;
  B(g, 0.07, 0.07, 0.04, M.chrome, x, 0.78, z);
  C(g, 0.012, 0.05, M.chrome, x, 0.88, z + 0.02);
  line(g, [V3(x, 0.78, z + 0.03), V3(x + 0.04, 0.55, z + 0.06), V3(x + 0.12, 0.7, z + 0.04)], 0.007, M.chrome);
  B(g, 0.04, 0.04, 0.03, M.chrome, x + 0.12, 0.92, z);
  C(g, 0.016, 0.12, M.chrome, x + 0.12, 0.98, z + 0.03, "y", 0.02);
  return g;
}
// Tahorat joyi: devorga past o'rnatilgan aralashtirgich, kafel supa, pol trapi va kichik o'rindiq
export function wudu() {
  const g = G(), w = 0.8, d = 0.5;
  B(g, w, 0.06, d, M.ceramic, 0, 0, 0);
  B(g, w - 0.08, 0.01, d - 0.08, M.white, 0, 0.06, 0);
  B(g, 0.1, 0.012, 0.1, M.chrome, 0, 0.065, 0.05);
  B(g, 0.16, 0.06, 0.06, M.chrome, 0, 0.62, -d / 2 + 0.04);
  line(g, [V3(0, 0.62, -d / 2 + 0.07), V3(0, 0.6, -d / 2 + 0.2), V3(0, 0.55, -d / 2 + 0.22)], 0.012, M.chrome);
  B(g, 0.3, 0.04, 0.3, M.wood, 0, 0.3, d / 2 + 0.22);
  for (const [x, z] of [[-0.12, 0.1], [0.12, 0.1], [-0.12, 0.34], [0.12, 0.34]]) B(g, 0.03, 0.3, 0.03, M.woodDark, x, 0, d / 2 + z);
  return g;
}

// Burchak vanna: chorak doira shaklida, burchagi orqa-chapda (-x, -z), oldi egri
export function bathtubCorner(R = 1.5) {
  const g = G(), H = 0.56, x0 = -R / 2, z0 = -R / 2;
  const q = (r, h, mat, y) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32, 1, false, 0, Math.PI / 2), mat);
    m.position.set(x0, y + h / 2, z0); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  q(R, H, M.ceramic, 0);
  q(R - 0.09, 0.012, M.white, H - 0.2);
  q(R - 0.07, 0.02, M.white, H - 0.01).material = M.white;
  line(g, [V3(x0 + 0.12, H, z0 + 0.35), V3(x0 + 0.12, H + 0.14, z0 + 0.35), V3(x0 + 0.27, H + 0.14, z0 + 0.35)], 0.012, M.chrome);
  C(g, 0.03, 0.01, M.chrome, x0 + 0.35, H - 0.19, z0 + 0.35);
  return g;
}

export function bathtub(w = 1.7, d = 0.75) {
  const g = G(), H = 0.56, t = 0.07;
  B(g, w, H - 0.2, d, M.ceramic, 0, 0, 0);
  B(g, w, 0.2, t, M.ceramic, 0, H - 0.2, d / 2 - t / 2);
  B(g, w, 0.2, t, M.ceramic, 0, H - 0.2, -d / 2 + t / 2);
  B(g, t, 0.2, d, M.ceramic, w / 2 - t / 2, H - 0.2, 0);
  B(g, t, 0.2, d, M.ceramic, -w / 2 + t / 2, H - 0.2, 0);
  B(g, w - 2 * t, 0.01, d - 2 * t, M.white, 0, H - 0.2, 0);
  line(g, [V3(w / 2 - 0.05, H, 0), V3(w / 2 - 0.05, H + 0.14, 0), V3(w / 2 - 0.2, H + 0.14, 0)], 0.012, M.chrome);
  C(g, 0.03, 0.01, M.chrome, 0.4, H - 0.19, 0);
  return g;
}

export function shower() {
  const g = G(), w = 0.9;
  B(g, w, 0.1, w, M.ceramic, 0, 0, 0);
  B(g, w - 0.1, 0.01, w - 0.1, M.white, 0, 0.09, 0);
  C(g, 0.04, 0.01, M.chrome, 0, 0.1, 0);
  const glass = (gw, gd, x, z) => B(g, gw, 1.9, gd, M.shower, x, 0.1, z);
  glass(w, 0.012, 0, w / 2 - 0.01); glass(0.012, w, w / 2 - 0.01, 0);
  [[w / 2 - 0.01, w / 2 - 0.01], [-w / 2 + 0.01, w / 2 - 0.01], [w / 2 - 0.01, -w / 2 + 0.01]].forEach(([x, z]) => C(g, 0.012, 1.9, M.chrome, x, 1.05, z));
  C(g, 0.012, 1.1, M.chrome, -0.1, 1.45, -w / 2 + 0.04);
  line(g, [V3(-0.1, 2, -w / 2 + 0.04), V3(-0.1, 2.05, -w / 2 + 0.3)], 0.01, M.chrome);
  C(g, 0.1, 0.02, M.chrome, -0.1, 2.03, -w / 2 + 0.3);
  B(g, 0.16, 0.06, 0.06, M.chrome, -0.1, 1.05, -w / 2 + 0.05);
  return g;
}

export function washer() {
  const g = G(), w = 0.6, H = 0.85, d = 0.58;
  B(g, w, H, d, M.white, 0, 0, 0);
  B(g, w - 0.02, 0.1, 0.01, M.plastic, 0, H - 0.11, d / 2 + 0.003);
  C(g, 0.03, 0.02, M.chrome, 0.2, H - 0.06, d / 2 + 0.01, "z");
  B(g, 0.14, 0.05, 0.01, M.dark, -0.1, H - 0.085, d / 2 + 0.008);
  T(g, 0.19, 0.022, M.chrome, 0, 0.4, d / 2 + 0.01);
  C(g, 0.175, 0.012, M.dark, 0, 0.4, d / 2 + 0.008, "z");
  C(g, 0.13, 0.01, M.glass, 0, 0.4, d / 2 + 0.018, "z");
  return g;
}

export function heater() {
  const g = G(), H = 0.8, r = 0.22;
  C(g, r, H - 0.2, M.white, 0, 0.5, r);
  S(g, r, M.white, 0, 0.8, r, 1, 0.45, 1);
  S(g, r, M.white, 0, 0.2, r, 1, 0.45, 1);
  B(g, 0.1, 0.1, 0.02, M.dark, 0, 0.42, r * 2 - 0.0);
  for (const [x, m] of [[-0.06, M.blue], [0.06, M.red]]) C(g, 0.011, 0.2, m, x, 0.02, r);
  C(g, 0.03, 0.04, M.chrome, -0.06, 0.02, r);
  return g;
}

export function socket(power) {
  const g = G(), s = power ? 0.1 : 0.08;
  B(g, s, s, 0.012, power ? M.dark : M.white, 0, 0, 0.006);
  C(g, s * 0.32, 0.008, M.plastic, 0, s / 2, 0.015, "z");
  for (const x of [-0.011, 0.011]) C(g, 0.0035, 0.01, M.black, x, s / 2, 0.02, "z");
  return g;
}
export function wallSwitch() {
  const g = G();
  B(g, 0.08, 0.08, 0.012, M.white, 0, 0, 0.006);
  B(g, 0.05, 0.05, 0.008, M.plastic, 0, 0.015, 0.016);
  return g;
}
export function lamp(drop) {
  const g = G();
  C(g, 0.05, 0.02, M.white, 0, 0, 0);
  C(g, 0.004, drop, M.black, 0, -drop / 2, 0);
  C(g, 0.06, 0.16, M.white, 0, -drop - 0.08, 0, "y", 0.17);
  S(g, 0.05, M.lamp, 0, -drop - 0.16, 0);
  return g;
}
// Chiroq turlari. Koordinata boshi shiftda (bra uchun devorda)
export function light(type, n, drop) {
  const g = G();
  if (type === "chandelier") {
    C(g, 0.05, 0.03, M.brass, 0, -0.015, 0);
    C(g, 0.006, drop, M.brass, 0, -drop / 2, 0);
    S(g, 0.05, M.brass, 0, -drop, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 0.28, z = Math.sin(a) * 0.28;
      line(g, [V3(0, -drop, 0), V3(x, -drop - 0.03, z), V3(x, -drop + 0.06, z)], 0.008, M.brass);
      C(g, 0.06, 0.12, M.white, x, -drop + 0.12, z, "y", 0.035);
      S(g, 0.03, M.lamp, x, -drop + 0.1, z);
    }
  } else if (type === "ledpanel") {
    B(g, 0.6, 0.03, 0.6, M.white, 0, -0.03, 0);
    B(g, 0.56, 0.006, 0.56, M.lamp, 0, -0.036, 0);
  } else if (type === "ledspot" || type === "halogen") {
    const k = Math.max(1, n), cols = Math.ceil(Math.sqrt(k)), gap = 0.6;
    for (let i = 0; i < k; i++) {
      const x = ((i % cols) - (cols - 1) / 2) * gap, z = (Math.floor(i / cols) - (Math.ceil(k / cols) - 1) / 2) * gap;
      C(g, 0.045, 0.015, type === "halogen" ? M.chrome : M.white, x, -0.008, z);
      C(g, 0.03, 0.006, M.lamp, x, -0.018, z);
    }
  } else if (type === "sconce") {
    B(g, 0.12, 0.16, 0.03, M.brass, 0, -0.08, 0.015);
    line(g, [V3(0, 0, 0.03), V3(0, 0, 0.18), V3(0, 0.05, 0.2)], 0.01, M.brass);
    C(g, 0.08, 0.15, M.white, 0, 0.1, 0.2, "y", 0.05);
    S(g, 0.035, M.lamp, 0, 0.08, 0.2);
  } else if (type === "strip") {
    B(g, Math.max(0.3, n), 0.012, 0.02, M.lamp, 0, -0.012, 0);
  } else {
    C(g, 0.03, 0.04, M.white, 0, -0.02, 0);
    C(g, 0.004, drop, M.black, 0, -drop / 2, 0);
    S(g, 0.055, M.lamp, 0, -drop - 0.05, 0);
  }
  return g;
}

export function panel() {
  const g = G(), w = 0.4, h = 0.5;
  B(g, w, h, 0.1, M.grey, 0, 0, 0.05);
  B(g, w - 0.04, h - 0.04, 0.008, M.dark, 0, 0.02, 0.104);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
    B(g, 0.05, 0.08, 0.014, i % 2 ? M.white : M.plastic, -0.14 + i * 0.056, 0.12 + r * 0.2, 0.112);
  }
  B(g, 0.03, 0.03, 0.01, M.red, 0.15, 0.25, 0.112);
  return g;
}
export function junctionBox() {
  const g = G();
  B(g, 0.1, 0.1, 0.05, M.purple, 0, 0, 0.025);
  B(g, 0.104, 0.104, 0.01, M.white, 0, -0.002, 0.052);
  for (const [x, y] of [[-0.04, 0.01], [0.04, 0.01], [-0.04, 0.09], [0.04, 0.09]]) C(g, 0.005, 0.004, M.grey, x, y, 0.059, "z");
  C(g, 0.012, 0.02, M.dark, 0, 0.11, 0.025);
  return g;
}
export function waterIn() {
  const g = G();
  C(g, 0.022, 0.6, M.blue, 0, 0.3, 0);
  S(g, 0.04, M.brass, 0, 0.3, 0);
  B(g, 0.1, 0.025, 0.02, M.red, 0, 0.33, 0);
  C(g, 0.05, 0.08, M.brass, 0, 0.5, 0, "z");
  C(g, 0.035, 0.006, M.white, 0, 0.5, 0.042, "z");
  return g;
}
export function sewerOut() {
  const g = G();
  C(g, 0.055, 0.12, M.sewer, 0, 0.06, 0);
  C(g, 0.062, 0.02, M.sewer, 0, 0.13, 0);
  return g;
}

export function door(w, h, kind) {
  const g = G(), f = 0.06, mat = kind === "entry" ? M.dark : M.wood;
  B(g, f, h, 0.14, M.woodDark, -w / 2 + f / 2, 0, 0);
  B(g, f, h, 0.14, M.woodDark, w / 2 - f / 2, 0, 0);
  if (h > 1.9) B(g, w, f, 0.14, M.woodDark, 0, h - f, 0);
  const lw = w - 2 * f, lh = Math.max(0.1, h - f);
  B(g, lw, lh, 0.04, mat, 0, 0, 0);
  if (lh > 1.2) for (const [y, ph] of [[0.15, 0.7], [1.0, 0.85]]) {
    B(g, lw - 0.2, ph, 0.05, kind === "entry" ? M.black : M.woodDark, 0, y, 0);
    B(g, lw - 0.26, ph - 0.06, 0.054, mat, 0, y + 0.03, 0);
  }
  if (lh > 1) { C(g, 0.01, 0.1, M.chrome, lw / 2 - 0.1, 1.0, 0.05, "x"); C(g, 0.01, 0.1, M.chrome, lw / 2 - 0.1, 1.0, -0.05, "x"); }
  return g;
}
export function windowFrame(w, h, depthOut = 0.15) {
  const g = G(), f = 0.06;
  if (h < 0.05) return g;
  B(g, w, f, 0.1, M.frame, 0, 0, 0); B(g, w, f, 0.1, M.frame, 0, h - f, 0);
  B(g, f, h, 0.1, M.frame, -w / 2 + f / 2, 0, 0); B(g, f, h, 0.1, M.frame, w / 2 - f / 2, 0, 0);
  B(g, f, h, 0.1, M.frame, 0, 0, 0);
  B(g, w - 2 * f, h - 2 * f, 0.012, M.glass, 0, f, 0);
  B(g, w + 0.08, 0.03, 0.34, M.frame, 0, -0.03, -depthOut + 0.02);
  return g;
}

// Zina: oldidan orqaga ko'tariladi, panjarasi bilan
export function stairs(w, d, rise) {
  const g = G(), n = Math.max(3, Math.round(rise / 0.18)), tread = d / n, r = rise / n;
  for (let i = 0; i < n; i++) {
    const z = d / 2 - (i + 0.5) * tread;
    B(g, w, 0.04, tread + 0.02, M.wood, 0, (i + 1) * r - 0.04, z);
    B(g, w - 0.04, r - 0.04, 0.02, M.woodDark, 0, i * r, z + tread / 2);
    if (i % 3 === 0) C(g, 0.012, 0.9, M.woodDark, w / 2 - 0.03, (i + 1) * r + 0.45, z);
  }
  line(g, [V3(w / 2 - 0.03, 0.9 + r, d / 2 - tread / 2), V3(w / 2 - 0.03, rise + 0.9, -d / 2 + tread / 2)], 0.02, M.wood);
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, Math.hypot(rise, d)), M.woodDark);
    m.position.set(x, rise / 2, 0); m.rotation.x = Math.atan2(rise, d); g.add(m);
  }
  return g;
}

// Kollektor: ikki latun taroq, rasxodomerlar va kranlar, shkaf ichida
export function manifold(ports) {
  const g = G(), n = Math.max(2, ports), w = 0.1 + n * 0.05;
  B(g, w + 0.16, 0.7, 0.12, M.white, 0, 0, -0.06).material = M.frame;
  for (const [y, mat] of [[0.48, M.red], [0.3, M.blue]]) {
    C(g, 0.016, w, M.brass, 0, y, 0.03, "x");
    C(g, 0.02, 0.05, mat, -w / 2 - 0.03, y, 0.03, "x");
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.05 + i * 0.05;
      C(g, 0.008, 0.12, M.brass, x, y - 0.07, 0.03);
      if (y > 0.4) C(g, 0.011, 0.06, M.glass, x, y + 0.05, 0.03);
      else C(g, 0.012, 0.03, M.white, x, y + 0.03, 0.03);
    }
  }
  C(g, 0.01, 0.04, M.chrome, w / 2 + 0.01, 0.52, 0.03);
  return g;
}

/* Isitish armaturasi */
export function ballValve() {
  const g = G();
  S(g, 0.03, M.brass, 0, 0, 0);
  B(g, 0.09, 0.012, 0.02, M.red, 0.03, 0.035, 0);
  return g;
}
export function pump() {
  const g = G();
  S(g, 0.07, M.dark, 0, 0, 0, 1, 1, 0.8);
  C(g, 0.055, 0.14, M.blue, 0.11, 0, 0, "x");
  B(g, 0.09, 0.06, 0.07, M.dark, 0.1, 0.05, 0);
  return g;
}
export function checkValve() {
  const g = G();
  C(g, 0.04, 0.11, M.brass, 0, 0, 0);
  B(g, 0.05, 0.05, 0.05, M.brass, 0.03, -0.025, 0);
  return g;
}
export function openTank(w = 0.6, d = 0.4, h = 0.4) {
  const g = G();
  B(g, w, h, d, M.galv, 0, 0, 0);
  B(g, w + 0.03, 0.02, d + 0.03, M.steel, 0, h, 0);
  B(g, 0.1, 0.012, 0.02, M.dark, 0, h + 0.02, 0);
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) B(g, 0.04, 0.08, d, M.dark, x, -0.08, 0);
  return g;
}
export function vessel() {
  const g = G();
  C(g, 0.17, 0.3, M.red, 0, 0.2, 0);
  S(g, 0.17, M.red, 0, 0.35, 0, 1, 0.4, 1);
  S(g, 0.17, M.red, 0, 0.05, 0, 1, 0.4, 1);
  C(g, 0.012, 0.06, M.brass, 0, 0.45, 0);
  return g;
}
// Dumaloq shkalali asbob (manometr, termometr), oldi +z
export function gauge(r = 0.04) {
  const g = G();
  C(g, 0.008, 0.06, M.brass, 0, -0.03, 0);
  C(g, r, 0.025, M.chrome, 0, r, 0, "z");
  C(g, r * 0.85, 0.027, M.white, 0, r, 0.001, "z");
  B(g, 0.004, r * 0.7, 0.003, M.red, 0, r, 0.016).rotation.z = -0.8;
  return g;
}
export function threeWay() {
  const g = G();
  C(g, 0.035, 0.12, M.brass, 0, 0, 0, "x");
  C(g, 0.03, 0.07, M.brass, 0, -0.04, 0);
  C(g, 0.03, 0.04, M.dark, 0, 0.05, 0);
  return g;
}

/* Suv ta'minoti va kanalizatsiya */
// Plastik bochka: d diametr, h balandlik, legs tagkursi balandligi (pastga), metr
export function waterTank(d, h, legs = 0) {
  const g = G(), mat = std(0x2f7fb0, { roughness: 0.6 });
  C(g, d / 2, h, mat, 0, h / 2, 0);
  for (let y = 0.15; y < h - 0.05; y += 0.25) T(g, d / 2 + 0.004, 0.012, mat, 0, y, 0).rotation.x = Math.PI / 2;
  C(g, d / 2 - 0.02, 0.06, mat, 0, h + 0.03, 0, "y", d / 2 - 0.08);
  C(g, 0.12, 0.05, M.dark, 0, h + 0.08, 0);
  C(g, 0.02, 0.1, M.brass, d / 2 + 0.03, 0.08, 0, "x");
  if (legs > 0) {
    const s = d / 2 + 0.05;
    B(g, d + 0.2, 0.05, d + 0.2, M.steel, 0, -0.05, 0);
    for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) B(g, 0.06, legs - 0.05, 0.06, M.steel, x, -legs, z);
    for (const y of [-legs * 0.65, -legs * 0.3]) {
      B(g, 2 * s, 0.03, 0.03, M.steel, 0, y, -s); B(g, 2 * s, 0.03, 0.03, M.steel, 0, y, s);
      B(g, 0.03, 0.03, 2 * s, M.steel, -s, y, 0); B(g, 0.03, 0.03, 2 * s, M.steel, s, y, 0);
    }
  }
  return g;
}
// Nasos stansiyasi: yotiq gidroakkumulyator ustida nasos va rele
export function pumpStation() {
  const g = G();
  C(g, 0.15, 0.42, M.blue, 0, 0.2, 0, "x");
  S(g, 0.15, M.blue, -0.21, 0.2, 0, 0.35, 1, 1); S(g, 0.15, M.blue, 0.21, 0.2, 0, 0.35, 1, 1);
  for (const x of [-0.14, 0.14]) B(g, 0.04, 0.06, 0.24, M.dark, x, 0, 0);
  C(g, 0.08, 0.26, M.dark, 0, 0.45, 0, "x");
  C(g, 0.07, 0.08, M.blue, 0.16, 0.45, 0, "x");
  B(g, 0.06, 0.05, 0.05, M.white, -0.05, 0.53, 0.04);
  const m = gauge(0.03); m.position.set(0.05, 0.53, 0.04); g.add(m);
  return g;
}
export function cleanout() {
  const g = G();
  C(g, 0.06, 0.12, M.sewer, 0, 0.06, 0);
  C(g, 0.066, 0.025, M.grey, 0, 0.13, 0);
  return g;
}
export function ventCap(valve) {
  const g = G();
  if (valve) { C(g, 0.06, 0.12, M.grey, 0, 0.06, 0); S(g, 0.06, M.grey, 0, 0.12, 0, 1, 0.6, 1); return g; }
  C(g, 0.07, 0.04, M.galv, 0, 0.02, 0);
  C(g, 0.02, 0.09, M.galv, 0, 0.09, 0, "y", 0.13);
  return g;
}

export function safetyGroup() {
  const g = G();
  C(g, 0.02, 0.2, M.brass, 0, 0, 0, "x");
  C(g, 0.016, 0.06, M.brass, -0.07, 0.04, 0);
  C(g, 0.03, 0.05, M.red, -0.07, 0.09, 0);
  C(g, 0.016, 0.06, M.brass, 0, 0.04, 0);
  C(g, 0.04, 0.02, M.white, 0, 0.1, 0, "z");
  C(g, 0.016, 0.1, M.brass, 0.07, 0.05, 0);
  C(g, 0.014, 0.05, M.chrome, 0.07, 0.12, 0);
  return g;
}
