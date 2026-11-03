import { ITEM_KINDS, LIGHT_TYPES, ROOM_TYPES, TANK_PLACES, TANK_VOLUMES, WALL_COLOR, WALL_COLORS, WALL_MATERIALS, emptyProject, mountH, normalize, sampleProject, tankBase, uid } from "./model.js";
import { PANEL_HEIGHTS, PANEL_TYPES, RAD_KINDS } from "./radiators.js";
import { COVERS, STEPS } from "./ufh.js";
import { CABLE_SPECS, METALS, SECTIONS, busCount, lightOf, watts } from "./electric.js";
import { Editor } from "./editor.js";
import { floorList, floorOf, fv, overlaps } from "./geometry.js";
import { computeHeating, heatingBom, schemeParts } from "./heating.js";
import { computeElectric, electricBom } from "./electric.js";
import { computePlumbing, plumbingBom, pumped } from "./plumbing.js";
import { EXTRA_GROUP, priceOf, renderReport } from "./report.js";

const $ = (id) => document.getElementById(id);
const KEY = "santex-loyiha";
const TOOLS = {
  plan: [["select", "Tanlash"], ["room", "Xona chizish"], ["door", "Ichki eshik"], ["entry", "Kirish eshigi"], ["window", "Deraza"], ["stairs", "Zina"], ["riser", "Stoyak"]],
  heat: [["select", "Tanlash"], ["boiler", "Qozon"], ["rad", "Radiator qo'shish"], ["manifold", "Kollektor"]],
  elec: [["select", "Tanlash"], ["panel", "Shchit"], ["jbox", "Korobka"], ["light", "Chiroq"], ["switch", "Viklyuchatel"], ["socket", "Rozetka"], ["power", "Quvvatli rozetka"]],
  plumb: [["select", "Tanlash"], ["waterin", "Suv kirishi"], ["tank", "Suv bochkasi"],["sewerout", "Kanalizatsiya chiqishi"], ["sink", "Rakovina"], ["toilet", "Unitaz"], ["bathtub", "Vanna"], ["shower", "Dush"], ["washer", "Kir mashinasi"], ["heater", "Suv isitkich"]],
};

const ctx = {
  p: load(), tab: "plan", tool: "select", sel: null, res: null, floor: 0,
  undo: [], redo: [], pending: null,
  commit() { this.pending = JSON.stringify(this.p); },
  discardCommit() { this.pending = null; },
  // Avtomatik radiatorlarni xona bo'yicha qo'lda boshqariladiganga o'tkazadi
  materialize(room) {
    const p = this.p;
    p.radiators = p.radiators || [];
    if (room.radManual) return [];
    room.radManual = true;
    return this.res.heat.rads.filter((x) => x.room.id === room.id).map((x) => {
      const n = { id: uid(), room: room.id, side: x.side, off: x.off };
      x.id = n.id; x.manual = true; p.radiators.push(n);
      return n;
    });
  },
  ensureManualRad(id) {
    const p = this.p;
    const have = (p.radiators || []).find((x) => x.id === id);
    if (have) return have;
    const rr = this.res.heat.rads.find((x) => x.id === id);
    if (!rr) return null;
    this.commit();
    const made = this.materialize(p.rooms.find((x) => x.id === rr.room.id));
    this.changed();
    return made[rr.idx] || null;
  },
  addRadiator(room, side, off) {
    if (!ROOM_TYPES[room.type].heated) return;
    this.commit();
    this.materialize(room);
    const n = { id: uid(), room: room.id, side, off };
    this.p.radiators.push(n);
    this.sel = { type: "rad", id: n.id };
    this.changed();
  },
  select(s) { this.sel = s; renderSide(); editor.draw(); },
  changed() {
    if (this.pending) { this.undo.push(this.pending); this.undo.length > 60 && this.undo.shift(); this.redo = []; this.pending = null; }
    recompute(); save();
  },
};

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return normalize(JSON.parse(s));
  } catch (e) { /* saqlangan ma'lumot o'qilmasa namunadan boshlaymiz */ }
  return sampleProject();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(ctx.p)); } catch (e) { /* xotira yopiq bo'lsa ham ishlayveradi */ } }

const editor = new Editor($("plan"), ctx);

function recompute() {
  const p = ctx.p;
  ctx.res = { heat: computeHeating(p), elec: computeElectric(p), plumb: computePlumbing(p) };
  if (ctx.floor >= (p.floors || 1)) ctx.floor = 0;
  $("planHint").hidden = fv(p, ctx.floor).rooms.length > 0;
  renderFloors();
  editor.draw();
  renderSide();
  if (ctx.tab === "report") renderRep();
  if (ctx.tab === "view3d") show3D();
}

function renderFloors() {
  const p = ctx.p, list = floorList(p);
  $("floors").hidden = list.length < 2;
  $("floors").innerHTML = list.map((f) => `<button data-f="${f}" aria-pressed="${f === ctx.floor}">${f + 1}-qavat</button>`).join("");
  const s = $("o-floor"), cur = s.value || "all";
  s.innerHTML = `<option value="all">Barcha qavatlar</option>` + list.map((f) => `<option value="${f}">${f + 1}-qavat</option>`).join("");
  s.value = [...s.options].some((o) => o.value === cur) ? cur : "all";
  s.hidden = list.length < 2;
}
function setFloor(f) {
  ctx.floor = f; ctx.sel = null;
  $("planHint").hidden = fv(ctx.p, f).rooms.length > 0;
  renderFloors(); renderSide(); editor.draw();
}
// 1-qavat xonalari va eshik, derazalarini keyingi qavatga nusxalaydi
function copyFloor() {
  const { p, floor } = ctx;
  ctx.commit();
  const map = new Map();
  for (const r of fv(p, floor - 1).rooms) {
    if (!ROOM_TYPES[r.type].heated) continue;
    const c = { ...r, id: uid(), floor };
    map.set(r.id, c.id); p.rooms.push(c);
  }
  for (const o of p.openings.filter((q) => map.has(q.room))) {
    if (o.kind === "entry") continue;
    p.openings.push({ ...o, id: uid(), room: map.get(o.room) });
  }
  ctx.changed();
}

function setTab(t) {
  ctx.tab = t; ctx.tool = "select"; ctx.sel = null;
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === t));
  const plan2d = TOOLS[t];
  $("planWrap").hidden = !plan2d;
  $("view3dWrap").hidden = t !== "view3d";
  $("reportWrap").hidden = t !== "report";
  document.querySelector(".work").classList.toggle("noside", t === "report");
  renderTools();
  renderSide();
  if (plan2d) { editor.draw(); editor.fit(); }
  if (t === "view3d") show3D(true);
  if (t === "report") renderRep();
}
function renderTools() {
  const list = TOOLS[ctx.tab] || [];
  $("tools").hidden = !list.length;
  $("tools").innerHTML = list.map(([k, n]) => {
    const c = ITEM_KINDS[k]?.color;
    return `<button data-k="${k}" aria-pressed="${ctx.tool === k}">${c ? `<i style="background:${c}"></i>` : ""}${n}</button>`;
  }).join("");
}

const field = (id, label, input) => `<div class="f"><label for="${id}">${label}</label>${input}</div>`;
const numI = (id, v, min, max, step = 10) => `<input type="number" id="${id}" value="${v}" min="${min}" max="${max}" step="${step}">`;
const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, n]) => `<option value="${k}" ${k === v ? "selected" : ""}>${n}</option>`).join("")}</select>`;
const fmt = (n, d = 0) => n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, " ");

// Korobka ichidagi ulanish sxemasi: yuqorida klemma guruhlari, pastda korobkadan chiqadigan kabellar
const BUS_COLOR = { L: "#8a4b22", N: "#1c69ba", PE: "#3d9a3d" };
function boxHtml(b) {
  const n = busCount(b), buses = ["L", "N", ...(n.PE ? ["PE"] : []), ...Object.keys(n).filter((k) => !BUS_COLOR[k]).sort()];
  const step = 58, W = 56 + b.conns.length * step, top = 14, yDev = top + buses.length * 16 + 20;
  let svg = buses.map((k, i) => `<line class="bus" x1="40" x2="${W - 4}" y1="${top + i * 16}" y2="${top + i * 16}" stroke="${BUS_COLOR[k] || "#c0392b"}"/><text x="2" y="${top + i * 16 + 4}">${k}</text>`).join("");
  b.conns.forEach((c, j) => {
    const x = 56 + j * step + step / 2 - 8;
    c.wires.forEach((w, k) => {
      const xo = x + (k - (c.wires.length - 1) / 2) * 8, y = top + buses.indexOf(w) * 16, col = BUS_COLOR[w] || "#c0392b";
      svg += `<line x1="${xo}" x2="${xo}" y1="${y}" y2="${yDev}" stroke="${col}" stroke-width="2"/><circle cx="${xo}" cy="${y}" r="3.5" fill="${col}"/>`;
    });
    svg += `<rect class="dev" x="${x - 24}" y="${yDev}" width="48" height="22"/><text x="${x}" y="${yDev + 15}" text-anchor="middle">${c.label}</text>` +
      `<text x="${x}" y="${yDev + 36}" text-anchor="middle" style="fill:var(--muted)">${c.spec.replace(".", ",")}</text>`;
  });
  const wago = Object.entries(n).filter(([, v]) => v > 1).map(([k, v]) => `${k}: ${v} sim`).join(", ");
  return `<h3>${b.title}</h3><svg class="bx" viewBox="0 0 ${W} ${yDev + 44}" role="img" aria-label="Korobka ulanish sxemasi">${svg}</svg>` +
    `<table class="mini"><tr><th>Belgi</th><th>Nima</th><th>Kabel</th><th>Simlar</th></tr>${b.conns.map((c) =>
      `<tr><td>${c.label}</td><td style="text-align:left">${c.name}</td><td>${c.spec.replace(".", ",")}</td><td>${c.wires.join(", ")}</td></tr>`).join("")}</table>` +
    `<p class="hint">Klemmalar: ${wago || "yo'q"}. L faza (jigarrang), N nol (ko'k)${n.PE ? ", PE yerga ulash (sariq-yashil)" : ""}. V bilan boshlanganlar viklyuchatel o'chirib-yoqadigan faza: viklyuchatel faqat fazani uzadi, nol chiroqqa to'g'ridan boradi.${n.PE ? "" : " Ikki tomirli kabelda yerga ulash simi yo'q."}</p>`;
}

function selectionHtml() {
  const { p, sel: s } = ctx;
  if (!s) return "";
  if (s.type === "box") {
    const b = ctx.res.elec.boxes.find((x) => x.key === s.id);
    return b ? boxHtml(b) : "";
  }
  if (s.type === "room") {
    const r = p.rooms.find((x) => x.id === s.id); if (!r) return "";
    return `<h2>Xona</h2>` + field("rName", "Nomi", `<input id="rName" value="${r.name.replace(/"/g, "&quot;")}">`) +
      field("rType", "Turi", sel("rType", Object.entries(ROOM_TYPES).map(([k, v]) => [k, v.name]), r.type)) +
      `<div class="row">` + field("rW", "Eni, sm", numI("rW", r.w, 100, 3000)) + field("rD", "Bo'yi, sm", numI("rD", r.d, 100, 3000)) + `</div>` +
      (ROOM_TYPES[r.type].heated ? `<label class="chk"><input type="checkbox" id="rUfh" ${r.ufh ? "checked" : ""}> Iliq pol</label>` +
        (r.ufh ? `<div class="row">` + field("rUfhStep", "Qadam, sm", sel("rUfhStep", [["", "Loyiha"], ...STEPS.map((s) => [String(s), String(s)])], String(r.ufhStep || ""))) +
          field("rUfhCover", "Qoplama", sel("rUfhCover", [["", "Loyiha"], ...Object.entries(COVERS).map(([k, v]) => [k, v.name])], r.ufhCover || "")) + `</div>` : "") : "") +
      `<button class="del" id="del">Xonani o'chirish</button>`;
  }
  if (s.type === "open") {
    const o = p.openings.find((x) => x.id === s.id); if (!o) return "";
    const n = { door: "Ichki eshik", entry: "Kirish eshigi", window: "Deraza" }[o.kind];
    return `<h2>${n}</h2><div class="row">` + field("oW", "Eni, sm", numI("oW", o.w, 50, 400)) + field("oH", "Balandligi, sm", numI("oH", o.h, 50, 300)) + `</div>` +
      (o.kind === "window" ? field("oS", "Tokcha, sm", numI("oS", o.sill, 0, 200)) : "") +
      `<button class="del" id="del">O'chirish</button>`;
  }
  if (s.type === "rad") {
    const e = (p.radiators || []).find((x) => x.id === s.id), rr = ctx.res.heat.rads.find((x) => x.id === s.id);
    if (!e || !rr) return "";
    const room = ctx.res.heat.rooms.find((x) => x.r.id === e.room);
    const kinds = [["", `Loyiha bo'yicha (${RAD_KINDS[p.radType || "cast"].name.toLowerCase()})`], ...Object.entries(RAD_KINDS).map(([k, v]) => [k, v.name])];
    let h = `<h2>Radiator R${rr.no}</h2><p class="hint">${rr.room.name}: ${rr.label}, ${fmt(rr.power)} W. Xonaga ${fmt(room?.Q || 0)} W kerak, hammasi ${fmt(room?.power || 0)} W beradi.</p>` +
      field("rKind", "Turi", sel("rKind", kinds, e.kind || ""));
    if (RAD_KINDS[rr.kind].sectional) h += field("rSize", "Seksiyalar soni (bo'sh: avtomatik)", `<input type="number" id="rSize" min="3" max="30" step="1" value="${e.size || ""}" placeholder="${rr.sec}">`);
    else h += `<div class="row">` + field("rPtype", "Panel turi", sel("rPtype", [["", "Loyiha"], ...PANEL_TYPES.map((t) => [String(t), String(t)])], String(e.ptype || ""))) +
      field("rPh", "Balandligi, mm", sel("rPh", [["", "Loyiha"], ...PANEL_HEIGHTS.map((t) => [String(t), String(t)])], String(e.ph || ""))) + `</div>` +
      field("rSize", "Uzunligi, sm (bo'sh: avtomatik)", `<input type="number" id="rSize" min="40" max="300" step="10" value="${e.size || ""}" placeholder="${rr.len}">`);
    return h + `<p class="hint">Radiatorni sichqoncha bilan xona devori bo'ylab suring.</p><button class="plain" id="radReset">Bu xonani avtomatik joylashga qaytarish</button><button class="del" id="del">Radiatorni o'chirish</button>`;
  }
  if (s.type === "item") {
    const i = p.items.find((x) => x.id === s.id); if (!i) return "";
    const rot = i.kind === "stairs" ? `<button class="plain" id="rot">90° burish</button>` : "";
    let h = `<h2>${ITEM_KINDS[i.kind].name}</h2>`;
    if (i.kind === "light") {
      const t = lightOf(i);
      h += field("iLt", "Chiroq turi", sel("iLt", Object.entries(LIGHT_TYPES).map(([k, v]) => [k, v.name]), i.ltype || "ledpanel")) +
        `<div class="row">` + field("iN", i.ltype === "strip" ? "Uzunligi, m" : "Soni", numI("iN", i.n ?? t.n, 1, 50, 1)) +
        field("iW", "Jami quvvat, W", `<input type="number" id="iW" min="1" max="5000" step="1" value="${i.watts ?? ""}" placeholder="${watts(i)}">`) + `</div>`;
    }
    const E = ctx.res.elec;
    if (i.kind === "light") {
      const sws = p.items.filter((x) => x.kind === "switch" && floorOf(x) === floorOf(i));
      const auto = E.ctl?.light.get(i.id);
      h += field("iSw", "Viklyuchatel", sel("iSw", [["", `Avtomatik${auto && !i.sw ? ` (${E.labels.get(auto.sw)})` : ""}`], ...sws.map((x) => [x.id, E.labels.get(x.id) || "V"])], i.sw || ""));
    }
    if (i.kind === "switch") {
      const c = E.ctl?.sw.get(i.id);
      h += `<p class="hint">${E.labels.get(i.id) || ""}: ${c ? `${c.keys > 1 ? "2 klavishli, " : ""}yoqadi ${c.lights.map((l) => E.labels.get(l.id)).join(", ")}` : "hech qaysi chiroqqa bog'lanmagan"}. Chiroqni tanlab, viklyuchatelini o'zgartirish mumkin.</p>`;
    }
    if (i.kind === "jbox") h += E.boxes.filter((b) => b.id === i.id).map(boxHtml).join("") || `<p class="hint">Korobkaga ulanadigan nuqta yo'q: xonada kamida ikki nuqta bo'lishi kerak.</p>`;
    if (i.kind === "tank") {
      const w = ctx.res.plumb;
      h += `<div class="row">` + field("iVol", "Hajmi, l", sel("iVol", TANK_VOLUMES.map((v) => [String(v), String(v)]), String(i.vol || 500))) +
        field("iPlace", "Joyi", sel("iPlace", Object.entries(TANK_PLACES).map(([k, v]) => [k, v.name]), i.place || "stand")) + `</div>` +
        (i.place === "stand" ? field("iStand", "Tagkursi balandligi, sm", numI("iStand", i.stand ?? 300, 50, 800, 10)) : "") +
        `<label class="chk"><input type="checkbox" id="iPump" ${i.pump || i.place === "ground" ? "checked" : ""} ${i.place === "ground" ? "disabled" : ""}> Nasos stansiyasi</label>` +
        `<p class="hint">Bochka tubi ${fmt(tankBase(i, p) / 100, 1)} m balandlikda. ${pumped(i) ? "Suvni nasos beradi." : "Suv o'z og'irligi bilan oqadi: har 1 m balandlik 0,1 bar bosim beradi."}</p>` +
        (w.fill.length ? "" : `<p class="hint">Suv kirishi qo'yilsa, bochka shahar suvidan o'zi to'ladi.</p>`);
    }
    if (i.kind === "socket" || i.kind === "power") h += field("iW", "Hisobiy quvvat, W", `<input type="number" id="iW" min="1" max="10000" step="50" value="${i.watts ?? ""}" placeholder="${watts(i)}">`);
    if (ITEM_KINDS[i.kind].group === "elec") h += field("iH", "Poldan balandligi, sm", `<input type="number" id="iH" min="0" max="${p.h}" step="5" value="${i.h ?? ""}" placeholder="${mountH(i, p)}">`);
    return h + `${rot}<button class="del" id="del">O'chirish</button>`;
  }
  return "";
}

function warningsHtml(list) {
  return list.length ? `<ul class="warn">${list.map((w) => `<li>${w}</li>`).join("")}</ul>` : "";
}
function resultHtml() {
  const { p, res, tab } = ctx;
  if (!res) return "";
  if (tab === "plan" || tab === "view3d") {
    const bad = floorList(p).flatMap((f) => overlaps(fv(p, f)));
    const many = p.floors > 1;
    const notes = bad.map(([a, b]) => `${a.name} va ${b.name} ustma-ust tushgan.`);
    if (many && !p.items.some((i) => i.kind === "stairs")) notes.push("Qavatlar orasiga zina qo'yilmagan.");
    const copy = ctx.floor > 0 && !fv(p, ctx.floor).rooms.length
      ? `<button class="plain" id="copyFloor">${ctx.floor}-qavat rejasini nusxalash</button>` : "";
    return warningsHtml(notes) + `<h2>Loyiha</h2>` + field("pName", "Nomi", `<input id="pName" value="${p.name.replace(/"/g, "&quot;")}">`) +
      `<div class="row">` + field("pFloors", "Qavatlar", sel("pFloors", [["1", "1 qavat"], ["2", "2 qavat"]], String(p.floors))) +
      (many ? field("pSlab", "Yopma, sm", numI("pSlab", p.slab, 15, 50, 5)) : "") + `</div>` + copy +
      `<div class="row">` + field("pH", "Shift, sm", numI("pH", p.h, 240, 500)) + field("pT", "Devor, sm", numI("pT", p.wallT, 10, 80)) + `</div>` +
      field("pMat", "Devor materiali", sel("pMat", Object.entries(WALL_MATERIALS).map(([k, v]) => [k, v.name]), p.wallMaterial)) +
      `<div class="f"><label for="pWallC">Devor rangi (3D)</label><div class="swatches">` +
      WALL_COLORS.map(([c, n]) => `<button type="button" class="sw" data-wc="${c}" style="background:${c}" title="${n}" aria-label="${n}" aria-pressed="${(p.wallColor || WALL_COLOR) === c}"></button>`).join("") +
      `<input type="color" id="pWallC" value="${p.wallColor || WALL_COLOR}" aria-label="Boshqa rang"></div></div>` +
      field("pIns", "Izolyatsiya", sel("pIns", [["0", "Yo'q"], ["5", "5 sm"], ["10", "10 sm"]], String(p.ins))) +
      field("pOut", "Tashqi harorat, °C", numI("pOut", p.tout, -40, 5, 1));
  }
  if (tab === "heat") {
    const h = res.heat, g = h.gravity;
    return `<h2>Isitish</h2>` +
      field("pCirc", "Suv aylanishi", sel("pCirc", [["hybrid", "Gibrid: nasos, tok o'chsa o'zi"], ["pump", "Faqat nasos bilan"], ["gravity", "Faqat o'zi aylanadi"]], p.circ)) +
      field("pLoop", "Tizim turi", sel("pLoop", [["open", "Ochiq (bak cherdakda)"], ["closed", "Yopiq (membranali bak)"]], p.loop)) +
      field("pFuel", "Qozon", sel("pFuel", [["solid", "Qattiq yoqilg'i"], ["gas", "Gaz"]], p.fuel)) +
      field("pReg", "Suv rejimi", sel("pReg", [["80/60", "80 / 60 °C"], ["75/60", "75 / 60 °C"], ["70/55", "70 / 55 °C"]], p.regime)) +
      field("pScheme", "Radiatorlarni ulash", sel("pScheme", [["tree", "Troynikli (ketma-ket)"], ["collector", "Kollektordan (nurli)"]], p.radScheme || "tree")) +
      field("pRad", "Radiatorlar", sel("pRad", Object.entries(RAD_KINDS).map(([k, v]) => [k, v.name]), p.radType || "cast")) +
      (p.radType === "panel" ? `<div class="row">` + field("pPtype", "Panel turi", sel("pPtype", PANEL_TYPES.map((t) => [String(t), String(t)]), String(p.panelType || 22))) +
        field("pPh", "Balandligi, mm", sel("pPh", PANEL_HEIGHTS.map((t) => [String(t), String(t)]), String(p.panelH || 500))) + `</div>` : "") +
      (p.circ !== "pump" ? field("pPit", "Qozon chuquri, sm", numI("pPit", p.pit, 0, 250)) : "") +
      `<dl class="u"><dt>Issiqlik yo'qotish</dt><dd>${fmt(h.Q / 1000, 1)} kW</dd><dt>Qozon</dt><dd>${h.boilerKw} kW</dd><dt>Radiator</dt><dd>${h.rads.length} dona, ${h.secs} seks.</dd><dt>Quvur</dt><dd>${fmt(h.pipeTotal || 0)} m</dd>` +
      (g ? `<dt>Bosim / qarshilik</dt><dd>${fmt(g.head)} / ${fmt(g.loss)} Pa</dd>` : "") + `</dl>` +
      (g ? `<p class="${g.ok ? "good" : "bad"}">${g.ok ? "Elektrsiz suv aylanadi." : "Elektrsiz aylanish yetmaydi."}</p>` : "") +
      `<h3>Tizim tarkibi</h3><ul class="comp">${schemeParts(p, h).map((x) => `<li>${x}</li>`).join("")}</ul>` +
      `<table class="mini"><tr><th>Xona</th><th>W</th><th>Isitish</th><th>Iliq pol</th></tr>${h.rooms.map((x) =>
        `<tr><td>${x.r.name}${x.manual ? " ✎" : ""}</td><td>${fmt(x.Q)}</td><td>${x.label}</td>` +
        `<td><input type="checkbox" data-ufh="${x.r.id}" ${x.r.ufh ? "checked" : ""} aria-label="${x.r.name} iliq pol"></td></tr>`).join("")}</table>` +
      `<p class="hint">✎ belgili xonalarda radiatorlar qo'lda boshqariladi. Radiatorni bosib suring yoki o'lchamini o'zgartiring.</p>` +
      (h.ufh.length || p.radScheme === "collector" ? `<h3>Iliq pol va kollektor</h3>` +
        field("pUfhReg", "Iliq pol suv rejimi", sel("pUfhReg", [["45/35", "45 / 35 °C"], ["50/40", "50 / 40 °C"], ["40/30", "40 / 30 °C"]], p.ufhRegime || "45/35")) +
        `<div class="row">` + field("pUfhStep", "Quvur qadami, sm", sel("pUfhStep", STEPS.map((s) => [String(s), String(s)]), String(p.ufhStep || 15))) +
        field("pUfhCover", "Pol qoplamasi", sel("pUfhCover", Object.entries(COVERS).map(([k, v]) => [k, v.name]), p.ufhCover || "tile")) + `</div>` +
        (h.ufh.length ? `<table class="mini"><tr><th>Xona</th><th>W/m²</th><th>Kontur</th><th>Quvur, m</th></tr>${h.ufh.map((u) => `<tr><td>${u.room.name}</td><td>${fmt(u.q)}${u.limited ? "*" : ""}</td><td>${u.loops}</td><td>${fmt(u.pipe)}</td></tr>`).join("")}</table>` +
          (h.ufh.some((u) => u.limited) ? `<p class="hint">* pol yuzasi harorat chegarasiga yetdi, bundan ko'p bera olmaydi.</p>` : "") : "") +
        `<dl class="u">${h.manifolds.map((m, i) => `<dt>Kollektor ${i + 1}${m.auto ? " (avto)" : ""}, ${m.floor + 1}-qavat</dt><dd>${m.ports} chiqish</dd>`).join("")}</dl>` : "") + warningsHtml(h.warnings);
  }
  if (tab === "elec") {
    const e = res.elec;
    return `<h2>Elektr</h2>` + field("pElec", "Montaj usuli", sel("pElec", [["box", "Taqsimlash korobkasi bilan"], ["loop", "Korobkasiz (shleyf)"]], p.elecMode)) +
      field("pMetal", "Sim metali", sel("pMetal", Object.entries(METALS).map(([k, v]) => [k, `${v.name} (${v.cable})`]), p.cableMetal || "cu")) +
      `<dl class="u"><dt>O'rnatilgan quvvat</dt><dd>${fmt(e.total / 1000, 1)} kW</dd><dt>Hisobiy quvvat</dt><dd>${fmt((e.demand || 0) / 1000, 1)} kW</dd><dt>Kirish avtomati</dt><dd>${e.inputA} A</dd>` +
      `<dt>Korobkalar</dt><dd>${e.boxes.length} dona</dd><dt>Kabel</dt><dd>${fmt(e.len)} m</dd><dt>${e.boxMode ? "Korobkasiz bo'lsa" : "Korobka bilan bo'lsa"}</dt><dd>${fmt(e.altLen)} m</dd></dl>` +
      (e.boxMode ? `<h3>Kabellar</h3><div class="row">` +
        [["cFeed", "feed", "Shchitdan korobkaga"], ["cLight", "light", "Chiroq va viklyuchatel"], ["cSock", "socket", "Oddiy rozetka"], ["cPow", "power", "Quvvatli rozetka"]]
          .map(([id, k, n]) => field(id, n, sel(id, CABLE_SPECS.map((s) => [s, s.replace(".", ",") + " mm²"]), e.cab[k]))).join("") + `</div>` +
        `<p class="hint">Har bir xona alohida guruh: shchitdan xona korobkasiga bitta kabel keladi, korobkadan har bir nuqtaga alohida kabel ketadi. Korobkani qo'ymasangiz, u avtomatik joylanadi (siyohrang, K belgili). "Korobka" bilan o'zingiz joyini tanlaysiz. Korobkani bossangiz, ichidagi ulanish sxemasi chiqadi.</p>` : "") +
      `<p class="hint">Rejada: qizil uzuq chiziq korobkadan viklyuchatelga, sariq korobkadan chiroqqa, kulrang egri chiziq viklyuchatel qaysi chiroqni yoqishini ko'rsatadi. Kabel ustida tomirlar soni va kesimi yozilgan.</p>` +
      `<table class="mini"><tr><th>${e.boxMode ? "Xona" : "Guruh"}</th><th>Avtomat</th><th>${e.boxMode ? "Kirish kabeli" : "Kesim, mm²"}</th><th>m</th><th>ΔU</th></tr>${e.groups.map((g) =>
        `<tr><td>${g.name}${g.rcd ? " (UZO)" : ""}<br><small>${fmt(g.P)} W</small></td><td>${g.br} A</td>` +
        (e.boxMode ? `<td>${g.feed.replace(".", ",")}</td>`
          : `<td><select class="gsel" data-g="${g.name.replace(/"/g, "&quot;")}" aria-label="${g.name} sim kesimi"><option value="">avto ${g.need}</option>${SECTIONS.map((s) => `<option value="${s}" ${g.manual && g.mm === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>`) +
        `<td>${fmt(g.len)}</td><td class="${g.dU > 4 ? "bad" : ""}">${fmt(g.dU, 1)}%</td></tr>`).join("")}</table>` +
      (e.boxMode ? `<p class="hint">Avtomat xonadagi eng ingichka kabelni ham himoya qiladigan qilib tanlanadi. ΔU shchitdan korobkagacha.</p>` : "") + warningsHtml(e.warnings);
  }
  if (tab === "plumb") {
    const w = res.plumb;
    const list = (o, pre = "") => Object.entries(o).map(([d, l]) => `<dt>${pre}Ø${d}</dt><dd>${fmt(l, 1)} m</dd>`).join("");
    const src = w.source === "tank" ? `Bochka ${w.tank.vol} l, ${TANK_PLACES[w.tank.place].name.toLowerCase()}${pumped(w.tank) ? ", nasos bilan" : ""}` : w.source === "city" ? "Shahar suvi" : "yo'q";
    return `<h2>Santexnika</h2><dl class="u"><dt>Suv manbai</dt><dd>${src}</dd><dt>Jihozlar</dt><dd>${w.fixtures} dona</dd>${w.mainDn ? `<dt>Asosiy quvur</dt><dd>Ø${w.mainDn}</dd>` : ""}</dl>` +
      `<h3>Suv quvurlari</h3><dl class="u">${list(w.coldLen, "sovuq ")}${list(w.hotLen, "issiq ")}</dl>` +
      `<h3>Kanalizatsiya</h3><dl class="u">${list(w.sewerLen)}<dt>Chiqishda chuqurlik</dt><dd>${fmt(w.depth, 2)} m</dd>${w.deepest ? `<dt>Eng uzoq nuqta</dt><dd>${w.deepest}</dd>` : ""}<dt>Reviziya</dt><dd>${w.cleanouts.length} dona</dd></dl>` +
      `<p class="hint">Nishablik: Ø50 quvur 3 %, Ø110 quvur 2 %. Chuqurlik pol sathidan quvur tagigacha.</p>` +
      field("pVent", "Kanalizatsiya ventilyatsiyasi", sel("pVent", [["roof", "Stoyak tomdan chiqadi"], ["valve", "Havo klapani (cherdakda)"]], p.sewerVent || "roof")) +
      (w.notes.length ? `<ul class="comp">${w.notes.map((x) => `<li>${x}</li>`).join("")}</ul>` : "") + warningsHtml(w.warnings);
  }
  return "";
}
function renderSide() {
  $("side").innerHTML = selectionHtml() + resultHtml();
}

let repRows = [];
function renderRep() {
  const { p, res } = ctx;
  const extras = (p.extras || []).map((x) => ({ g: x.g || EXTRA_GROUP, k: "x_" + x.id, name: x.name, spec: x.spec, unit: x.unit, qty: x.qty, labor: !!x.labor, extra: x.id }));
  const rows = [...heatingBom(p, res.heat), ...electricBom(p, res.elec), ...plumbingBom(p, res.plumb), ...extras];
  repRows = rows;
  renderReport($("report"), rows, p.prices, (k, v) => { p.prices[k] = v; save(); }, {
    onAdd: (x, price) => {
      ctx.commit();
      const id = uid();
      p.extras = [...(p.extras || []), { id, ...x }];
      p.prices["x_" + id] = price;
      ctx.changed();
    },
    onDel: (id) => {
      ctx.commit();
      p.extras = (p.extras || []).filter((x) => x.id !== id);
      delete p.prices["x_" + id];
      ctx.changed();
    },
    onQty: (id, v) => { const x = (p.extras || []).find((q) => q.id === id); if (x) { x.qty = v; save(); } },
  });
}

let view3d = null, view3dFramed = false;
const opt3d = { mode: "cut" };
async function show3D(frame) {
  $("view3dErr").hidden = true;
  try {
    if (!view3d) { const { View3D } = await import("./view3d.js"); view3d = new View3D($("gl")); }
    if (frame && !view3dFramed) { view3d.frame(ctx.p); view3dFramed = true; }
    view3d.update(ctx.p, ctx.res, { ...opt3d, floor: $("o-floor").value || "all", heat: $("o-heat").checked, elec: $("o-elec").checked, plumb: $("o-plumb").checked });
  } catch (e) {
    console.error(e);
    $("view3dErr").textContent = "3D ishga tushmadi: " + e.message;
    $("view3dErr").hidden = false;
  }
}

/* Hodisalar */
$("tabs").addEventListener("click", (e) => { if (e.target.dataset.t) setTab(e.target.dataset.t); });
$("tools").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  ctx.tool = b.dataset.k; renderTools();
});
$("side").addEventListener("change", (e) => {
  const { p, sel: s } = ctx, id = e.target.id, v = e.target.value, n = +v;
  ctx.commit();
  if (e.target.dataset.ufh) {
    const room = p.rooms.find((x) => x.id === e.target.dataset.ufh);
    if (room) room.ufh = e.target.checked;
    return ctx.changed();
  }
  if (e.target.dataset.g) {
    p.groupCable = p.groupCable || {};
    if (v) p.groupCable[e.target.dataset.g] = n; else delete p.groupCable[e.target.dataset.g];
    return ctx.changed();
  }
  const it = s?.type === "item" && p.items.find((x) => x.id === s.id);
  const rd = s?.type === "rad" && (p.radiators || []).find((x) => x.id === s.id);
  const opt = (x) => (x === "" ? undefined : +x);
  const r = s?.type === "room" && p.rooms.find((x) => x.id === s.id);
  const o = s?.type === "open" && p.openings.find((x) => x.id === s.id);
  const set = {
    rName: () => (r.name = v), rW: () => (r.w = n), rD: () => (r.d = n),
    rType: () => { r.type = v; r.name = ROOM_TYPES[v].name; },
    oW: () => (o.w = n), oH: () => (o.h = n), oS: () => (o.sill = n),
    pName: () => (p.name = v), pWallC: () => (p.wallColor = v), pH: () => (p.h = n), pT: () => (p.wallT = n), pMat: () => (p.wallMaterial = v),
    pIns: () => (p.ins = n), pOut: () => (p.tout = n), pReg: () => (p.regime = v),
    pFloors: () => { p.floors = n; view3dFramed = false; }, pSlab: () => (p.slab = n),
    pScheme: () => (p.radScheme = v), pUfhReg: () => (p.ufhRegime = v), pUfhStep: () => (p.ufhStep = n), pUfhCover: () => (p.ufhCover = v),
    rUfh: () => (r.ufh = e.target.checked), rUfhStep: () => (r.ufhStep = opt(v)), rUfhCover: () => (r.ufhCover = v || undefined),
    pRad: () => (p.radType = v), pPtype: () => (p.panelType = n), pPh: () => (p.panelH = n), pMetal: () => (p.cableMetal = v),
    rKind: () => { rd.kind = v || undefined; rd.size = undefined; },
    rSize: () => (rd.size = opt(v)), rPtype: () => (rd.ptype = opt(v)), rPh: () => (rd.ph = opt(v)),
    iLt: () => { it.ltype = v; delete it.n; delete it.watts; if (!LIGHT_TYPES[v].wall) delete it.h; },
    iN: () => (it.n = Math.max(1, n || 1)), iW: () => (it.watts = opt(v)), iH: () => (it.h = opt(v)),
    pCirc: () => (p.circ = v), pLoop: () => (p.loop = v), pFuel: () => (p.fuel = v),
    pPit: () => (p.pit = n), pElec: () => (p.elecMode = v), pVent: () => (p.sewerVent = v),
    iSw: () => (it.sw = v || undefined), iVol: () => (it.vol = n), iPlace: () => (it.place = v), iStand: () => (it.stand = n),
    iPump: () => (it.pump = e.target.checked),
    cFeed: () => (p.boxCable = { ...(p.boxCable || {}), feed: v }), cLight: () => (p.boxCable = { ...(p.boxCable || {}), light: v }),
    cSock: () => (p.boxCable = { ...(p.boxCable || {}), socket: v }), cPow: () => (p.boxCable = { ...(p.boxCable || {}), power: v }),
  }[id];
  if (!set) return ctx.discardCommit();
  set(); ctx.changed();
});
$("side").addEventListener("click", (e) => {
  if (e.target.id === "del") removeSel();
  if (e.target.id === "copyFloor") copyFloor();
  if (e.target.dataset.wc) { ctx.commit(); ctx.p.wallColor = e.target.dataset.wc; ctx.changed(); }
  if (e.target.id === "radReset") {
    const rd = (ctx.p.radiators || []).find((x) => x.id === ctx.sel?.id);
    if (!rd) return;
    ctx.commit();
    const room = ctx.p.rooms.find((x) => x.id === rd.room);
    if (room) room.radManual = false;
    ctx.p.radiators = ctx.p.radiators.filter((x) => x.room !== rd.room);
    ctx.sel = null; ctx.changed();
  }
  if (e.target.id === "rot") {
    const i = ctx.p.items.find((x) => x.id === ctx.sel.id);
    ctx.commit(); i.rot = !i.rot; ctx.changed();
  }
});
$("floors").addEventListener("click", (e) => { if (e.target.dataset.f) setFloor(+e.target.dataset.f); });
$("o-floor").addEventListener("change", () => show3D());
function removeSel() {
  const { p, sel: s } = ctx; if (!s) return;
  ctx.commit();
  if (s.type === "room") {
    p.rooms = p.rooms.filter((r) => r.id !== s.id); p.openings = p.openings.filter((o) => o.room !== s.id);
    p.radiators = (p.radiators || []).filter((o) => o.room !== s.id);
  }
  if (s.type === "open") p.openings = p.openings.filter((o) => o.id !== s.id);
  if (s.type === "item") p.items = p.items.filter((i) => i.id !== s.id);
  if (s.type === "rad") p.radiators = (p.radiators || []).filter((i) => i.id !== s.id);
  ctx.sel = null; ctx.changed();
}
function history(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(ctx.p));
  ctx.p = JSON.parse(from.pop()); ctx.sel = null;
  recompute(); save();
}
$("undo").onclick = () => history(ctx.undo, ctx.redo);
$("redo").onclick = () => history(ctx.redo, ctx.undo);
addEventListener("keydown", (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? history(ctx.redo, ctx.undo) : history(ctx.undo, ctx.redo); }
  if (e.key === "Delete") removeSel();
  if (e.key === "Escape") { ctx.tool = "select"; renderTools(); }
});
function replace(p) { ctx.undo.push(JSON.stringify(ctx.p)); ctx.p = p; ctx.sel = null; ctx.floor = 0; view3dFramed = false; recompute(); save(); setTab("plan"); }
$("new").onclick = () => { replace(emptyProject()); ctx.tool = "room"; renderTools(); };
$("sample").onclick = () => replace(sampleProject());
$("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(ctx.p, null, 2)], { type: "application/json" }));
  a.download = `${ctx.p.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};
$("import").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { replace(normalize(JSON.parse(await f.text()))); }
  catch (err) { alert("Fayl o'qilmadi: JSON loyiha fayli kerak."); }
  e.target.value = "";
};
$("print").onclick = () => print();
// Hisobni Projecty brendi bilan yuklab olish
const exportRep = async (kind) => {
  if (!repRows.length) renderRep();
  const { exportPdf, exportXlsx } = await import("./export.js");
  const price = (r) => priceOf(r, ctx.p.prices);
  try { await (kind === "pdf" ? exportPdf : exportXlsx)(repRows, price, { name: ctx.p.name }); }
  catch (e) { console.error(e); alert("Fayl tayyorlanmadi: " + e.message); }
};
$("xlsx").onclick = () => exportRep("xlsx");
$("pdf").onclick = () => exportRep("pdf");
document.querySelectorAll("#view3dWrap input").forEach((c) => c.addEventListener("change", () => show3D()));
$("modes").addEventListener("click", (e) => {
  if (!e.target.dataset.m) return;
  opt3d.mode = e.target.dataset.m;
  [...$("modes").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === opt3d.mode));
  show3D();
});

recompute();
setTab("plan");
