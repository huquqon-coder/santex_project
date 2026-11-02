// 3D ko'rinish. Ma'lumot rejadan olinadi, o'lchamlar metrga o'tkaziladi.
import { ITEM_KINDS, ROOM_TYPES } from "./model.js";
import { bounds, openingRect, wallBoxes } from "./geometry.js";

const THREE = window.THREE;
const m = (v) => v / 100;

export class View3D {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdae2e4);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9498, 0.8));
    const sun = new THREE.DirectionalLight(0xfff3e4, 0.75);
    sun.position.set(14, 24, 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 80 });
    this.sun = sun; this.scene.add(sun, sun.target);
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
    this.mat = {
      wall: std(0xc9c2b6), floor: std(0xb89468), cold: std(0x9a9c98), ground: std(0x79866f),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.4 }),
      door: std(0x8a5f3b), rad: std(0xd9dcdd), hot: std(0xd8392c), blue: std(0x2574cc),
      sewer: std(0x8b9a3e), cable: std(0xe2b52c), jbox: std(0x7a4fa3), roof: std(0x7d4f3b, { side: THREE.DoubleSide }),
      ghost: new THREE.MeshStandardMaterial({ color: 0x8a9aa2, transparent: true, opacity: 0.14, depthWrite: false }),
    };
    this.group = new THREE.Group(); this.scene.add(this.group);
    const g = new THREE.Mesh(new THREE.CircleGeometry(80, 48), this.mat.ground);
    g.rotation.x = -Math.PI / 2; g.position.y = -0.3; g.receiveShadow = true; this.scene.add(g);
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
    b.castShadow = mat !== this.mat.ghost && mat !== this.mat.glass; b.receiveShadow = true;
    this.group.add(b); return b;
  }
  tube(a, b, r, mat) {
    const d = b.clone().sub(a), len = d.length();
    if (len < 0.001) return;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    t.position.copy(a).addScaledVector(d, 0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.group.add(t);
  }
  run(pts, y, r, mat, off = 0) {
    const V = pts.map((q) => new THREE.Vector3(m(q[0] + off), y, m(q[1] + off)));
    V.slice(1).forEach((v, i) => this.tube(V[i], v, r, mat));
  }
  frame(p) {
    const b = bounds(p), cx = m(b.x0 + b.x1) / 2, cz = m(b.y0 + b.y1) / 2, R = Math.max(m(b.x1 - b.x0), m(b.y1 - b.y0));
    this.camera.position.set(cx + R * 0.7, R * 0.95, cz + R * 1.05);
    this.controls.target.set(cx, 0.3, cz);
    this.sun.target.position.set(cx, 0, cz);
  }
  update(p, res, opt) {
    while (this.group.children.length) {
      const o = this.group.children.pop();
      o.geometry?.dispose();
    }
    const H = m(p.h), mode = opt.mode, W = mode === "ghost" ? this.mat.ghost : this.mat.wall;
    const wallH = mode === "cut" ? 1.2 : H;
    for (const b of wallBoxes(p)) this.box(m(b.x), 0, m(b.y), m(b.w), wallH, m(b.d), W);
    for (const o of p.openings) {
      const q = openingRect(p, o); if (!q) continue;
      const [x, z, w, d] = [m(q.x), m(q.y), m(q.w), m(q.d)];
      const top = m(o.sill + o.h);
      if (o.sill) this.box(x, 0, z, w, Math.min(m(o.sill), wallH), d, W);
      if (top < wallH) this.box(x, top, z, w, wallH - top, d, W);
      const y1 = Math.min(top, wallH);
      if (mode !== "ghost") {
        const thin = q.axis === "h";
        const [ix, iz, iw, id] = thin ? [x, z + d / 2 - 0.02, w, 0.04] : [x + w / 2 - 0.02, z, 0.04, d];
        if (o.kind === "window") this.box(ix, m(o.sill), iz, iw, Math.max(0, y1 - m(o.sill)), id, this.mat.glass);
        else this.box(ix, 0, iz, iw, y1, id, this.mat.door);
      }
    }
    for (const r of p.rooms) {
      this.box(m(r.x), -0.02, m(r.y), m(r.w), 0.02, m(r.d), mode === "ghost" ? this.mat.ghost : ROOM_TYPES[r.type].heated ? this.mat.floor : this.mat.cold);
    }
    const b = bounds(p);
    if (mode === "full") {
      const ov = 0.4, x0 = m(b.x0) - ov, x1 = m(b.x1) + ov, z0 = m(b.y0) - ov, z1 = m(b.y1) + ov, zm = (z0 + z1) / 2, yr = H + (z1 - z0) * 0.22;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([
        x0, H, z0, x1, H, z0, x1, yr, zm, x0, H, z0, x1, yr, zm, x0, yr, zm,
        x0, H, z1, x0, yr, zm, x1, yr, zm, x0, H, z1, x1, yr, zm, x1, H, z1,
        x0, H, z0, x0, yr, zm, x0, H, z1, x1, H, z0, x1, H, z1, x1, yr, zm], 3));
      g.computeVertexNormals();
      const roof = new THREE.Mesh(g, this.mat.roof); roof.castShadow = true; this.group.add(roof);
    }
    for (const i of p.items) {
      const k = ITEM_KINDS[i.kind];
      if (!k || i.kind === "jbox") continue;
      if (k.group === "heat" && !opt.heat) continue;
      if (k.group === "elec" && !opt.elec) continue;
      if (k.group === "plumb" && !opt.plumb) continue;
      const tall = { boiler: 1.35, sink: 0.85, toilet: 0.45, bathtub: 0.55, shower: 0.1, washer: 0.85, heater: 0.8 }[i.kind] ?? 0.1;
      const y = { heater: 1.2, light: wallH - 0.1, switch: 1, socket: 0.3, power: 0.3, panel: 1.4 }[i.kind] ?? 0;
      this.box(m(i.x - k.w / 2), y, m(i.y - k.d / 2), m(k.w), tall, m(k.d), new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.6 }));
    }
    if (opt.heat) {
      for (const s of res.heat.segs) {
        const r = Math.min(0.03, s.id / 2000 + 0.006);
        this.run(s.pts, 0.1, r, this.mat.hot, -5); this.run(s.pts, 0.1, r, this.mat.blue, 5);
      }
      for (const r of res.heat.rads) {
        const w = m(r.horiz ? r.w : 14), d = m(r.horiz ? 14 : r.w);
        this.box(m(r.x) - w / 2, 0.13, m(r.y) - d / 2, w, 0.58, d, this.mat.rad);
      }
    }
    if (opt.elec) {
      for (const s of res.elec.segs) this.run(s.pts, wallH - 0.05, 0.008, this.mat.cable);
      for (const b of res.elec.boxes) this.box(m(b.x) - 0.05, wallH - 0.1, m(b.y) - 0.05, 0.1, 0.06, 0.1, this.mat.jbox);
    }
    if (opt.plumb) {
      for (const s of res.plumb.cold) this.run(s.pts, 0.3, 0.012, this.mat.blue, -7);
      for (const s of res.plumb.hot) this.run(s.pts, 0.3, 0.012, this.mat.hot, 7);
      for (const s of res.plumb.sewer) this.run(s.pts, 0.05, s.dn === 110 ? 0.055 : 0.03, this.mat.sewer);
    }
  }
}
