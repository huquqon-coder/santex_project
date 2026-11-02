import { ITEM_KINDS, ROOM_TYPES, WALL_MATERIALS, emptyProject, sampleProject } from "./model.js";
import { Editor } from "./editor.js";
import { overlaps } from "./geometry.js";
import { computeHeating, heatingBom } from "./heating.js";
import { computeElectric, electricBom } from "./electric.js";
import { computePlumbing, plumbingBom } from "./plumbing.js";
import { renderReport } from "./report.js";

const $ = (id) => document.getElementById(id);
const KEY = "santex-loyiha";
const TOOLS = {
  plan: [["select", "Tanlash"], ["room", "Xona chizish"], ["door", "Ichki eshik"], ["entry", "Kirish eshigi"], ["window", "Deraza"]],
  heat: [["select", "Tanlash"], ["boiler", "Qozon"]],
  elec: [["select", "Tanlash"], ["panel", "Shchit"], ["jbox", "Korobka"], ["light", "Chiroq"], ["switch", "Viklyuchatel"], ["socket", "Rozetka"], ["power", "Quvvatli rozetka"]],
  plumb: [["select", "Tanlash"], ["waterin", "Suv kirishi"], ["sewerout", "Kanalizatsiya chiqishi"], ["sink", "Rakovina"], ["toilet", "Unitaz"], ["bathtub", "Vanna"], ["shower", "Dush"], ["washer", "Kir mashinasi"], ["heater", "Suv isitkich"]],
};

const ctx = {
  p: load(), tab: "plan", tool: "select", sel: null, res: null,
  undo: [], redo: [], pending: null,
  commit() { this.pending = JSON.stringify(this.p); },
  discardCommit() { this.pending = null; },
  select(s) { this.sel = s; renderSide(); editor.draw(); },
  changed() {
    if (this.pending) { this.undo.push(this.pending); this.undo.length > 60 && this.undo.shift(); this.redo = []; this.pending = null; }
    recompute(); save();
  },
};

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...emptyProject(), ...JSON.parse(s) };
  } catch (e) { /* saqlangan ma'lumot o'qilmasa namunadan boshlaymiz */ }
  return sampleProject();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(ctx.p)); } catch (e) { /* xotira yopiq bo'lsa ham ishlayveradi */ } }

const editor = new Editor($("plan"), ctx);

function recompute() {
  const p = ctx.p;
  ctx.res = { heat: computeHeating(p), elec: computeElectric(p), plumb: computePlumbing(p) };
  $("planHint").hidden = p.rooms.length > 0;
  editor.draw();
  renderSide();
  if (ctx.tab === "report") renderRep();
  if (ctx.tab === "view3d") show3D();
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

function selectionHtml() {
  const { p, sel: s } = ctx;
  if (!s) return "";
  if (s.type === "room") {
    const r = p.rooms.find((x) => x.id === s.id); if (!r) return "";
    return `<h2>Xona</h2>` + field("rName", "Nomi", `<input id="rName" value="${r.name.replace(/"/g, "&quot;")}">`) +
      field("rType", "Turi", sel("rType", Object.entries(ROOM_TYPES).map(([k, v]) => [k, v.name]), r.type)) +
      `<div class="row">` + field("rW", "Eni, sm", numI("rW", r.w, 100, 3000)) + field("rD", "Bo'yi, sm", numI("rD", r.d, 100, 3000)) + `</div>` +
      `<button class="del" id="del">Xonani o'chirish</button>`;
  }
  if (s.type === "open") {
    const o = p.openings.find((x) => x.id === s.id); if (!o) return "";
    const n = { door: "Ichki eshik", entry: "Kirish eshigi", window: "Deraza" }[o.kind];
    return `<h2>${n}</h2><div class="row">` + field("oW", "Eni, sm", numI("oW", o.w, 50, 400)) + field("oH", "Balandligi, sm", numI("oH", o.h, 50, 300)) + `</div>` +
      (o.kind === "window" ? field("oS", "Tokcha, sm", numI("oS", o.sill, 0, 200)) : "") +
      `<button class="del" id="del">O'chirish</button>`;
  }
  if (s.type === "item") {
    const i = p.items.find((x) => x.id === s.id); if (!i) return "";
    return `<h2>${ITEM_KINDS[i.kind].name}</h2><button class="del" id="del">O'chirish</button>`;
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
    const bad = overlaps(p);
    return warningsHtml(bad.map(([a, b]) => `${a.name} va ${b.name} ustma-ust tushgan.`)) + `<h2>Loyiha</h2>` + field("pName", "Nomi", `<input id="pName" value="${p.name.replace(/"/g, "&quot;")}">`) +
      `<div class="row">` + field("pH", "Shift, sm", numI("pH", p.h, 240, 500)) + field("pT", "Devor, sm", numI("pT", p.wallT, 10, 80)) + `</div>` +
      field("pMat", "Devor materiali", sel("pMat", Object.entries(WALL_MATERIALS).map(([k, v]) => [k, v.name]), p.wallMaterial)) +
      field("pIns", "Izolyatsiya", sel("pIns", [["0", "Yo'q"], ["5", "5 sm"], ["10", "10 sm"]], String(p.ins))) +
      field("pOut", "Tashqi harorat, °C", numI("pOut", p.tout, -40, 5, 1));
  }
  if (tab === "heat") {
    const h = res.heat, g = h.gravity;
    return `<h2>Isitish</h2>` + field("pReg", "Suv rejimi", sel("pReg", [["80/60", "80 / 60 °C"], ["75/60", "75 / 60 °C"], ["70/55", "70 / 55 °C"]], p.regime)) +
      `<label class="chk"><input type="checkbox" id="pGrav" ${p.gravity ? "checked" : ""}> Elektrsiz o'zi aylansin</label>` +
      (p.gravity ? field("pPit", "Qozon chuquri, sm", numI("pPit", p.pit, 0, 250)) : "") +
      `<dl class="u"><dt>Issiqlik yo'qotish</dt><dd>${fmt(h.Q / 1000, 1)} kW</dd><dt>Qozon</dt><dd>${h.boilerKw} kW</dd><dt>Radiator</dt><dd>${h.rads.length} dona, ${h.secs} seks.</dd><dt>Quvur</dt><dd>${fmt(h.pipeTotal || 0)} m</dd>` +
      (g ? `<dt>Bosim / qarshilik</dt><dd>${fmt(g.head)} / ${fmt(g.loss)} Pa</dd>` : "") + `</dl>` +
      (g ? `<p class="${g.ok ? "good" : "bad"}">${g.ok ? "Elektrsiz suv aylanadi." : "Elektrsiz aylanish yetmaydi."}</p>` : "") +
      `<table class="mini"><tr><th>Xona</th><th>W</th><th>Radiator</th></tr>${h.rooms.map((x) => `<tr><td>${x.r.name}</td><td>${fmt(x.Q)}</td><td>${x.units} × ${x.sec}</td></tr>`).join("")}</table>` + warningsHtml(h.warnings);
  }
  if (tab === "elec") {
    const e = res.elec;
    return `<h2>Elektr</h2>` + field("pElec", "Montaj usuli", sel("pElec", [["box", "Taqsimlash korobkasi bilan"], ["loop", "Korobkasiz (shleyf)"]], p.elecMode)) +
      `<dl class="u"><dt>O'rnatilgan quvvat</dt><dd>${fmt(e.total / 1000, 1)} kW</dd><dt>Hisobiy quvvat</dt><dd>${fmt((e.demand || 0) / 1000, 1)} kW</dd><dt>Kirish avtomati</dt><dd>${e.inputA} A</dd>` +
      `<dt>Korobkalar</dt><dd>${e.boxes.length} dona</dd><dt>Kabel</dt><dd>${fmt(e.len)} m</dd><dt>${e.boxMode ? "Korobkasiz bo'lsa" : "Korobka bilan bo'lsa"}</dt><dd>${fmt(e.altLen)} m</dd></dl>` +
      (e.boxMode ? `<p class="hint">Xonaga korobka qo'ymasangiz, u avtomatik joylanadi (siyohrang). "Korobka" bilan o'zingiz joyini tanlaysiz.</p>` : "") +
      `<table class="mini"><tr><th>Guruh</th><th>Avtomat</th><th>Kabel</th><th>m</th></tr>${e.groups.map((g) => `<tr><td>${g.name}${g.rcd ? " (UZO)" : ""}</td><td>${g.br} A</td><td>${g.mm}</td><td>${fmt(g.len)}</td></tr>`).join("")}</table>` + warningsHtml(e.warnings);
  }
  if (tab === "plumb") {
    const w = res.plumb;
    const list = (o) => Object.entries(o).map(([d, l]) => `<dt>Ø${d}</dt><dd>${fmt(l, 1)} m</dd>`).join("");
    return `<h2>Santexnika</h2><dl class="u"><dt>Jihozlar</dt><dd>${w.fixtures} dona</dd>${list(w.len)}</dl><h3>Kanalizatsiya</h3><dl class="u">${list(w.sewerLen)}<dt>Chiqish chuqurligi</dt><dd>${fmt(w.drop, 2)} m</dd></dl>` + warningsHtml(w.warnings);
  }
  return "";
}
function renderSide() {
  $("side").innerHTML = selectionHtml() + resultHtml();
}

function renderRep() {
  const { p, res } = ctx;
  const rows = [...heatingBom(p, res.heat), ...electricBom(p, res.elec), ...plumbingBom(p, res.plumb)];
  renderReport($("report"), rows, p.prices, (k, v) => { p.prices[k] = v; save(); });
}

let view3d = null, view3dFramed = false;
const opt3d = { mode: "cut" };
async function show3D(frame) {
  $("view3dErr").hidden = true;
  try {
    if (!view3d) { const { View3D } = await import("./view3d.js"); view3d = new View3D($("gl")); }
    if (frame && !view3dFramed) { view3d.frame(ctx.p); view3dFramed = true; }
    view3d.update(ctx.p, ctx.res, { ...opt3d, heat: $("o-heat").checked, elec: $("o-elec").checked, plumb: $("o-plumb").checked });
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
  const r = s?.type === "room" && p.rooms.find((x) => x.id === s.id);
  const o = s?.type === "open" && p.openings.find((x) => x.id === s.id);
  const set = {
    rName: () => (r.name = v), rW: () => (r.w = n), rD: () => (r.d = n),
    rType: () => { r.type = v; r.name = ROOM_TYPES[v].name; },
    oW: () => (o.w = n), oH: () => (o.h = n), oS: () => (o.sill = n),
    pName: () => (p.name = v), pH: () => (p.h = n), pT: () => (p.wallT = n), pMat: () => (p.wallMaterial = v),
    pIns: () => (p.ins = n), pOut: () => (p.tout = n), pReg: () => (p.regime = v),
    pGrav: () => (p.gravity = e.target.checked), pPit: () => (p.pit = n), pElec: () => (p.elecMode = v),
  }[id];
  if (!set) return ctx.discardCommit();
  set(); ctx.changed();
});
$("side").addEventListener("click", (e) => { if (e.target.id === "del") removeSel(); });
function removeSel() {
  const { p, sel: s } = ctx; if (!s) return;
  ctx.commit();
  if (s.type === "room") { p.rooms = p.rooms.filter((r) => r.id !== s.id); p.openings = p.openings.filter((o) => o.room !== s.id); }
  if (s.type === "open") p.openings = p.openings.filter((o) => o.id !== s.id);
  if (s.type === "item") p.items = p.items.filter((i) => i.id !== s.id);
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
function replace(p) { ctx.undo.push(JSON.stringify(ctx.p)); ctx.p = p; ctx.sel = null; view3dFramed = false; recompute(); save(); setTab("plan"); }
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
  try { replace({ ...emptyProject(), ...JSON.parse(await f.text()) }); }
  catch (err) { alert("Fayl o'qilmadi: JSON loyiha fayli kerak."); }
  e.target.value = "";
};
$("print").onclick = () => print();
document.querySelectorAll("#view3dWrap input").forEach((c) => c.addEventListener("change", () => show3D()));
$("modes").addEventListener("click", (e) => {
  if (!e.target.dataset.m) return;
  opt3d.mode = e.target.dataset.m;
  [...$("modes").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === opt3d.mode));
  show3D();
});

recompute();
setTab("plan");
