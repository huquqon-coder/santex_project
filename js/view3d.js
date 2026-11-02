// 3D ko'rinish. Ma'lumot rejadan olinadi, o'lchamlar metrga o'tkaziladi.
import { ITEM_KINDS, ROOM_TYPES } from "./model.js";
import { bounds, nearestWall, openingRect, roomAt, sideInfo, wallBoxes } from "./geometry.js";
import * as P from "./models3d.js";

const THREE = window.THREE;
const m = (v) => v / 100;

// Pol va devor uchun chizilgan teksturalar
function texture(draw, size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
const planks = (x, s) => {
  x.fillStyle = "#b08a5c"; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 6; i++) {
    x.fillStyle = `hsl(${30 + (i * 7) % 6}, 38%, ${48 + ((i * 13) % 9)}%)`; x.fillRect(0, (i * s) / 6, s, s / 6 - 2);
    x.fillStyle = "rgba(60,40,20,.35)"; x.fillRect(((i * 97) % s), (i * s) / 6, 2, s / 6);
  }
};
const tiles = (base, joint) => (x, s) => {
  x.fillStyle = joint; x.fillRect(0, 0, s, s);
  x.fillStyle = base; x.fillRect(2, 2, s / 2 - 4, s / 2 - 4); x.fillRect(s / 2 + 2, 2, s / 2 - 4, s / 2 - 4);
  x.fillRect(2, s / 2 + 2, s / 2 - 4, s / 2 - 4); x.fillRect(s / 2 + 2, s / 2 + 2, s / 2 - 4, s / 2 - 4);
};
const roofTiles = (x, s) => {
  x.fillStyle = "#7d4f3b"; x.fillRect(0, 0, s, s);
  x.strokeStyle = "rgba(40,20,10,.5)"; x.lineWidth = 3;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) {
    x.beginPath(); x.arc((i + (r % 2) / 2) * (s / 4), (r + 1) * (s / 4), s / 8, Math.PI, 0); x.stroke();
  }
};

export class View3D {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfe0e8);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9498, 0.85));
    const sun = new THREE.DirectionalLight(0xfff3e4, 0.8);
    sun.position.set(14, 24, 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 80 });
    this.sun = sun; this.scene.add(sun, sun.target);
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
    this.tex = { wood: texture(planks), tile: texture(tiles("#d8dcd8", "#9ea5a3")), bath: texture(tiles("#a9c9d6", "#e8eeee")), roof: texture(roofTiles) };
    this.mat = {
      wall: std(0xece7dc), cold: std(0x9a9c98), ground: std(0x7d8b6c),
      hot: std(0xd8392c, { roughness: 0.4 }), blue: std(0x2574cc, { roughness: 0.4 }),
      sewer: std(0xc8652b, { roughness: 0.5 }), cable: std(0xe2b52c), over: std(0x7fb6c2, { roughness: 0.4 }),
      roof: new THREE.MeshStandardMaterial({ map: this.tex.roof, side: THREE.DoubleSide, roughness: 0.8 }),
      ghost: new THREE.MeshStandardMaterial({ color: 0x8a9aa2, transparent: true, opacity: 0.14, depthWrite: false }),
    };
    this.group = new THREE.Group(); this.scene.add(this.group);
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { this.controls.update(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  box(x, y, z, w, h, d, mat) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x + w / 2, y + h / 2, z + d / 2);
    b.castShadow = mat !== this.mat.ghost; b.receiveShadow = true;
    this.group.add(b); return b;
  }
  tube(a, b, r, mat) {
    const d = b.clone().sub(a), len = d.length();
    if (len < 0.001) return;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    t.position.copy(a).addScaledVector(d, 0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    t.castShadow = true;
    this.group.add(t);
    const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), mat);
    j.position.copy(b); this.group.add(j);
  }
  run(pts, y, r, mat, off = 0) {
    const v = pts.map((q) => new THREE.Vector3(m(q[0] + off), y, m(q[1] + off)));
    v.slice(1).forEach((q, i) => this.tube(v[i], q, r, mat));
  }
  place(obj, x, y, z, ix = 0, iz = 1) {
    obj.position.set(x, y, z); obj.rotation.y = Math.atan2(ix, iz); this.group.add(obj); return obj;
  }
  frame(p) {
    const b = bounds(p), cx = m(b.x0 + b.x1) / 2, cz = m(b.y0 + b.y1) / 2, R = Math.max(m(b.x1 - b.x0), m(b.y1 - b.y0));
    this.camera.position.set(cx + R * 0.6, R * 0.8, cz + R * 0.9);
    this.controls.target.set(cx, 0.3, cz);
    this.sun.target.position.set(cx, 0, cz);
  }
  // Yer: qozon chuquri joyi ochiq qoladi
  ground(pit) {
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh.geometry.dispose(); }
    const s = new THREE.Shape(); s.moveTo(-90, -90); s.lineTo(90, -90); s.lineTo(90, 90); s.lineTo(-90, 90); s.closePath();
    if (pit) {
      const h = new THREE.Path();
      h.moveTo(pit.x0, -pit.y1); h.lineTo(pit.x1, -pit.y1); h.lineTo(pit.x1, -pit.y0); h.lineTo(pit.x0, -pit.y0); h.closePath();
      s.holes.push(h);
    }
    const g = new THREE.Mesh(new THREE.ShapeGeometry(s), this.mat.ground);
    g.rotation.x = -Math.PI / 2; g.position.y = -0.3; g.receiveShadow = true;
    this.groundMesh = g; this.scene.add(g);
  }
  update(p, res, opt) {
    while (this.group.children.length) {
      const o = this.group.children.pop();
      o.traverse?.((n) => n.geometry?.dispose());
    }
    const H = m(p.h), mode = opt.mode, ghost = mode === "ghost", W = ghost ? this.mat.ghost : this.mat.wall;
    const wallH = mode === "cut" ? 1.2 : H;
    const heat = res.heat, boiler = heat.boiler;
    const pitRoom = boiler && p.circ !== "pump" ? roomAt(p, boiler.x, boiler.y) : null;
    const pitD = pitRoom ? m(p.pit) : 0;

    for (const b of wallBoxes(p)) this.box(m(b.x), 0, m(b.y), m(b.w), wallH, m(b.d), W);
    for (const o of p.openings) {
      const q = openingRect(p, o); if (!q) continue;
      const [x, z, w, d] = [m(q.x), m(q.y), m(q.w), m(q.d)];
      const top = m(o.sill + o.h), sill = m(o.sill);
      if (o.sill) this.box(x, 0, z, w, Math.min(sill, wallH), d, W);
      if (top < wallH) this.box(x, top, z, w, wallH - top, d, W);
      if (ghost) continue;
      const cx = x + w / 2, cz = z + d / 2, along = q.axis === "h", vis = Math.min(top, wallH);
      const len = along ? w : d;
      const obj = o.kind === "window" ? P.windowFrame(len, Math.max(0, vis - sill)) : P.door(len, vis, o.kind);
      obj.position.set(cx, sill, cz);
      if (!along) obj.rotation.y = Math.PI / 2;
      this.group.add(obj);
    }
    for (const r of p.rooms) {
      const lowered = r === pitRoom ? -pitD : 0;
      let mat = this.mat.cold;
      if (ghost) mat = this.mat.ghost;
      else if (ROOM_TYPES[r.type].heated) {
        const key = r.type === "bath" ? "bath" : r.type === "kitchen" ? "tile" : "wood";
        const t = this.tex[key].clone(); t.needsUpdate = true; t.repeat.set(m(r.w) / 1.2, m(r.d) / 1.2);
        mat = new THREE.MeshStandardMaterial({ map: t, roughness: key === "wood" ? 0.7 : 0.35 });
      }
      this.box(m(r.x), lowered - 0.02, m(r.y), m(r.w), 0.02, m(r.d), mat);
    }
    // Qozon chuquri: tashqi devorlar pastga davom etadi, tushish zinasi bilan
    if (pitRoom) {
      const r = pitRoom, t = m(p.wallT), [x, y, w, d] = [m(r.x), m(r.y), m(r.w), m(r.d)];
      const c = ghost ? this.mat.ghost : this.mat.cold;
      this.box(x - t, -pitD, y - t, w + 2 * t, pitD, t, c);
      this.box(x - t, -pitD, y + d, w + 2 * t, pitD, t, c);
      this.box(x - t, -pitD, y, t, pitD, d, c);
      this.box(x + w, -pitD, y, t, pitD, d, c);
      const n = Math.max(2, Math.round(pitD / 0.2)), tread = Math.min(0.3, d / n), rise = pitD / n;
      for (let i = 0; i < n; i++) this.box(x + w - 0.7, -pitD, y + i * tread, 0.7, pitD - i * rise, tread, c);
      this.ground({ x0: x - t, x1: x + w + t, y0: y - t, y1: y + d + t });
    } else this.ground(null);

    if (mode === "full") {
      const b = bounds(p), ov = 0.4, x0 = m(b.x0) - ov, x1 = m(b.x1) + ov, z0 = m(b.y0) - ov, z1 = m(b.y1) + ov, zm = (z0 + z1) / 2, yr = H + (z1 - z0) * 0.22;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([
        x0, H, z0, x1, H, z0, x1, yr, zm, x0, H, z0, x1, yr, zm, x0, yr, zm,
        x0, H, z1, x0, yr, zm, x1, yr, zm, x0, H, z1, x1, yr, zm, x1, H, z1,
        x0, H, z0, x0, yr, zm, x0, H, z1, x1, H, z0, x1, H, z1, x1, yr, zm], 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute([
        0, 0, 6, 0, 6, 3, 0, 0, 6, 3, 0, 3, 0, 0, 0, 3, 6, 3, 0, 0, 6, 3, 6, 0,
        0, 0, 1, 1, 2, 0, 0, 0, 2, 0, 1, 1], 2));
      g.computeVertexNormals();
      const roof = new THREE.Mesh(g, this.mat.roof); roof.castShadow = true; this.group.add(roof);
    }

    this.items(p, res, opt, wallH, pitD);
    if (opt.heat) this.heating(p, heat, H, pitD);
    if (opt.elec) {
      for (const s of res.elec.segs) this.run(s.pts, wallH - 0.05, s.branch ? 0.006 : 0.009, this.mat.cable);
      for (const b of res.elec.boxes) {
        const w = nearestWall(p, b.x, b.y);
        this.place(P.junctionBox(), m(w.x), wallH - 0.2, m(w.y), w.ix, w.iz);
      }
    }
    if (opt.plumb) {
      for (const s of res.plumb.cold) this.run(s.pts, 0.3, 0.012, this.mat.blue, -7);
      for (const s of res.plumb.hot) this.run(s.pts, 0.3, 0.012, this.mat.hot, 7);
      for (const s of res.plumb.sewer) this.run(s.pts, 0.05, s.dn === 110 ? 0.055 : 0.03, this.mat.sewer);
    }
  }
  items(p, res, opt, wallH, pitD) {
    for (const i of p.items) {
      const k = ITEM_KINDS[i.kind];
      if (!k || i.kind === "jbox" || i.kind === "boiler") continue;
      if (k.group === "elec" && !opt.elec) continue;
      if (k.group === "plumb" && !opt.plumb) continue;
      const w = nearestWall(p, i.x, i.y), x = m(i.x), z = m(i.y), wx = m(w.x), wz = m(w.y);
      switch (i.kind) {
        case "socket": this.place(P.socket(false), wx, 0.3, wz, w.ix, w.iz); break;
        case "power": this.place(P.socket(true), wx, 0.3, wz, w.ix, w.iz); break;
        case "switch": this.place(P.wallSwitch(), wx, 1, wz, w.ix, w.iz); break;
        case "panel": this.place(P.panel(), wx, Math.min(1.4, wallH - 0.5), wz, w.ix, w.iz); break;
        case "light": this.place(P.lamp(Math.min(0.5, wallH * 0.3)), x, wallH, z); break;
        case "heater": this.place(P.heater(), wx, Math.min(1.1, Math.max(0.9, wallH - 0.9)), wz, w.ix, w.iz); break;
        case "sink": this.place(P.sink(), x, 0, z, w.ix, w.iz); break;
        case "toilet": this.place(P.toilet(), x, 0, z, w.ix, w.iz); break;
        case "bathtub": this.place(P.bathtub(), x, 0, z, w.ix, w.iz); break;
        case "shower": this.place(P.shower(), x, 0, z, w.ix, w.iz); break;
        case "washer": this.place(P.washer(), x, 0, z, w.ix, w.iz); break;
        case "waterin": this.place(P.waterIn(), x, 0, z); break;
        case "sewerout": this.place(P.sewerOut(), x, 0, z); break;
      }
    }
  }
  heating(p, h, H, pitD) {
    const top = h.topSupply, YA = H + 0.15, ySup = top ? YA : 0.17, yRet = 0.08;
    for (const s of h.segs) {
      const r = Math.min(0.035, s.id / 2000 + 0.006);
      this.run(s.pts, ySup, r, this.mat.hot, -5); this.run(s.pts, yRet, r, this.mat.blue, 5);
    }
    for (const r of h.rads) {
      const s = sideInfo(r.room, r.side), ix = -s.nx, iz = -s.ny, tx = iz, tz = -ix;
      const x = m(r.x), z = m(r.y), half = m(r.w) / 2 + 0.04;
      this.place(P.radiator(r.sec), x, 0, z, ix, iz);
      const end = (k) => [x + tx * k * half, z + tz * k * half];
      const [ax, az] = end(-1), [bx, bz] = end(1);
      const yT = 0.66, yB = 0.18;
      const sOff = -0.05, rOff = 0.05;
      this.tube(new THREE.Vector3(x + sOff, ySup, z + sOff), new THREE.Vector3(ax, ySup, az), 0.012, this.mat.hot);
      this.tube(new THREE.Vector3(ax, ySup, az), new THREE.Vector3(ax, yT, az), 0.012, this.mat.hot);
      this.tube(new THREE.Vector3(x + rOff, yRet, z + rOff), new THREE.Vector3(bx, yRet, bz), 0.012, this.mat.blue);
      this.tube(new THREE.Vector3(bx, yRet, bz), new THREE.Vector3(bx, yB, bz), 0.012, this.mat.blue);
      this.place(P.ballValve(), ax, yT + 0.1, az, ix, iz);
      this.place(P.ballValve(), bx, yB - 0.03, bz, ix, iz);
    }
    const b = h.boiler;
    if (!b) return;
    const w = nearestWall(p, b.x, b.y), bx = m(b.x), bz = m(b.y), y0 = -pitD, solid = p.fuel === "solid";
    this.place(solid ? P.boilerSolid() : P.boilerGas(), bx, y0, bz, w.ix, w.iz);
    const bTop = y0 + (solid ? 1.45 : 1.0);
    const sx = bx - 0.05, sz = bz - 0.05, rx = bx + 0.05, rz = bz + 0.05, V = (a, y, c) => new THREE.Vector3(a, y, c);
    const main = 0.03;
    this.tube(V(sx, bTop, sz), V(sx, ySup, sz), main, this.mat.hot);
    // Qaytish tuguni qozon yonida
    const yNode = Math.min(yRet, 0), yLow = y0 + 0.3, nx = rx + 0.75, nz = rz;
    this.tube(V(rx, yRet, rz), V(nx, yRet, nz), main, this.mat.blue);
    this.tube(V(nx, yRet, nz), V(nx, yLow, nz), main, this.mat.blue);
    this.tube(V(nx, yLow, nz), V(rx, yLow, rz), main, this.mat.blue);
    const mid = (yRet + yLow) / 2;
    if (p.circ === "hybrid") {
      const o = nx + 0.4, a = yRet - 0.08, c = yLow + 0.1;
      [[V(nx, a, nz), V(o, a, nz)], [V(o, a, nz), V(o, c, nz)], [V(o, c, nz), V(nx, c, nz)]].forEach(([q, e]) => this.tube(q, e, 0.022, this.mat.blue));
      this.place(P.checkValve(), nx, mid, nz);
      this.place(P.pump(), o, mid, nz);
      this.place(P.ballValve(), o, a - 0.1, nz); this.place(P.ballValve(), o, c + 0.1, nz);
    } else if (p.circ === "pump") {
      this.place(P.pump(), nx, mid, nz);
      this.place(P.ballValve(), nx, mid + 0.22, nz); this.place(P.ballValve(), nx, mid - 0.22, nz);
    }
    if (p.loop === "open") {
      const bnd = bounds(p), tz = m(bnd.y0 + bnd.y1) / 2, ty = H + 0.85;
      const start = V(sx, ySup, sz);
      this.tube(top ? start : V(sx, bTop, sz), V(sx, ty, tz), 0.018, this.mat.hot);
      this.place(P.openTank(), sx, ty, tz);
      this.tube(V(sx + 0.15, ty + 0.3, tz), V(sx + 0.15, H + 0.2, sz), 0.012, this.mat.over);
      this.tube(V(sx + 0.15, H + 0.2, sz), V(sx + 0.15, y0 + 0.08, sz), 0.012, this.mat.over);
    } else {
      const vx = rx - 0.75;
      this.place(P.vessel(), vx, yLow - 0.25, rz);
      this.tube(V(vx, yLow + 0.22, rz), V(vx, yLow + 0.3, rz), 0.012, this.mat.blue);
      this.tube(V(vx, yLow + 0.3, rz), V(rx, yLow + 0.3, rz), 0.012, this.mat.blue);
      this.place(P.safetyGroup(), sx - 0.18, bTop + 0.18, sz);
      this.tube(V(sx - 0.12, bTop + 0.18, sz), V(sx, bTop + 0.18, sz), 0.012, this.mat.hot);
    }
    if (solid) {
      const f = 0.09, fy = y0 + 1.65, cz = bz - w.iz * 1.1, cx = bx - w.ix * 1.1;
      this.tube(V(bx, fy, bz), V(cx, fy, cz), f, P.M.steel);
      this.tube(V(cx, fy, cz), V(cx, H + 2.4, cz), f, P.M.steel);
    }
  }
}
