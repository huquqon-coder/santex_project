// Quvur daraxtidan fitinglarni sanash: burilishlar, troyniklar, o'tishlar, kesishishlar.
// segs: { pts, dn, floor } bo'laklari, har birining birinchi nuqtasi yuqori oqim tomonda.

const key = (f, q) => `${f || 0}:${q[0]}:${q[1]}`;
const dir = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
const inc = (o, k, n = 1) => (o[k] = (o[k] || 0) + n);

// Nuqta to'g'ri burchakli polilinyada yotadimi
function onPoly(pts, x, y) {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])) return true;
  }
  return false;
}

export function treeFittings(segs, roots = []) {
  const out = { bend: {}, half: {}, tee: {}, red: {} };
  const rootK = new Set(roots.map((q) => key(q.floor, [q.x, q.y])));
  // Burilish: 90° tirsak. Qisqa (40 sm dan kam) Z siljish ikki 45° yarim tirsak bilan qilinadi
  for (const s of segs) {
    const P = s.pts;
    for (let k = 1; k < P.length - 1; k++) {
      const leg = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
      const z = k + 2 < P.length && leg < 40 && dir(P[k - 1], P[k]).join() === dir(P[k + 1], P[k + 2]).join();
      if (z) { inc(out.half, s.dn, 2); k++; } else inc(out.bend, s.dn);
    }
  }
  // Tarmoqlanish: bo'lak boshlangan har bir nuqta (ildizdan tashqari)
  const starts = new Map();
  for (const s of segs) {
    const k = key(s.floor, s.pts[0]);
    if (rootK.has(k)) continue;
    if (!starts.has(k)) starts.set(k, []);
    starts.get(k).push(s);
  }
  for (const [k, list] of starts) {
    const [f, x, y] = k.split(":").map(Number);
    const through = segs.filter((s) => (s.floor || 0) === f && !list.includes(s) && onPoly(s.pts, x, y));
    if (!through.length) continue;
    const D = Math.max(...through.map((s) => s.dn));
    const ends = through.some((s) => { const q = s.pts[s.pts.length - 1]; return q[0] === x && q[1] === y; });
    const sorted = [...list].sort((a, b) => b.dn - a.dn);
    // Oqim shu nuqtada tugasa, eng yo'g'on davom etuvchi bo'lak quvurning o'zi, qolganlari tarmoq
    const branches = ends ? sorted.slice(1) : sorted;
    if (ends && sorted[0].dn < D && branches.length) inc(out.red, `Ø${D}×${sorted[0].dn}`);
    if (ends && !branches.length && sorted[0].dn < D) inc(out.red, `Ø${D}×${sorted[0].dn}`);
    for (const b of branches) inc(out.tee, b.dn === D ? `Ø${D}` : `Ø${D}×${b.dn}×${D}`);
  }
  return out;
}

// Ikki tarmoq (sovuq va issiq) kesishgan joylar: birini aylanib o'tish kerak
export function crossings(a, b) {
  const pieces = (segs) => segs.flatMap((s) => s.pts.slice(1).map((q, i) => ({ a: s.pts[i], b: q, f: s.floor || 0, dn: s.dn })));
  const A = pieces(a), B = pieces(b), out = {};
  for (const p of A) for (const q of B) {
    if (p.f !== q.f) continue;
    const ph = p.a[1] === p.b[1], qh = q.a[1] === q.b[1];
    if (ph === qh) continue;
    const [h, v] = ph ? [p, q] : [q, p];
    const x = v.a[0], y = h.a[1];
    const inH = x > Math.min(h.a[0], h.b[0]) + 5 && x < Math.max(h.a[0], h.b[0]) - 5;
    const inV = y > Math.min(v.a[1], v.b[1]) + 5 && y < Math.max(v.a[1], v.b[1]) - 5;
    if (inH && inV) inc(out, Math.min(p.dn, q.dn));
  }
  return out;
}
