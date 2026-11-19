// Hisobni Projecty brendi bilan Excel (.xlsx) va PDF fayl qilib yuklab beradi. Tashqi kutubxonasiz.
// PDF da uy rejasi o'lchamlari bilan, uyning va xonalarning 3D ko'rinishlari ham bo'ladi.
import { ROOM_TYPES, WALL_MATERIALS } from "./model.js";
import { bounds, floorList, fv, openingRect } from "./geometry.js";

export const BRAND = { name: "Projecty", tagline: "Uy loyihasi va muhandislik tizimlari", site: "homeprojecty.netlify.app", color: "9C5219", dark: "172126" };

// Hisob qatorlarini guruhlab, summalari bilan tayyorlaydi
export function reportTable(rows, price) {
  const groups = [];
  for (const r of rows) {
    let g = groups.find((x) => x.g === r.g);
    if (!g) groups.push((g = { g: r.g, rows: [] }));
    const pr = price(r);
    g.rows.push({ name: r.name, spec: r.spec || "", qty: r.qty, unit: r.unit, price: pr, sum: r.qty * pr, labor: !!r.labor });
  }
  const all = groups.flatMap((g) => g.rows);
  const mat = all.filter((r) => !r.labor).reduce((a, r) => a + r.sum, 0), lab = all.filter((r) => r.labor).reduce((a, r) => a + r.sum, 0);
  return { groups, totals: { mat, lab, all: mat + lab } };
}

// Logo: 32×32 maydonda mis rangli kvadrat, ichida uy tomi va P harfi (img/logo-mark.svg bilan bir xil)
const MARK = {
  tile: "M7 0H25A7 7 0 0 1 32 7V25A7 7 0 0 1 25 32H7A7 7 0 0 1 0 25V7A7 7 0 0 1 7 0Z",
  roof: "M6.5 15.5L16 7.5L25.5 15.5",
  p: "M12.5 25V16H17A3.6 3.6 0 0 1 17 23.2H12.5",
};
// Excel uchun PNG rasm
function markPng(px) {
  const c = document.createElement("canvas"); c.width = c.height = px;
  const g = c.getContext("2d"), k = px / 32;
  g.scale(k, k);
  g.fillStyle = "#" + BRAND.color; g.fill(new Path2D(MARK.tile));
  g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
  g.lineWidth = 3; g.stroke(new Path2D(MARK.roof));
  g.lineWidth = 2.6; g.stroke(new Path2D(MARK.p));
  return new Promise((ok) => c.toBlob(async (b) => ok(new Uint8Array(await b.arrayBuffer())), "image/png"));
}

const today = () => new Date().toLocaleDateString("ru-RU");
const fileBase = (name) => `Projecty_${(name || "loyiha").replace(/[^\p{L}\p{N}]+/gu, "_")}`;
function download(bytes, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ZIP (siqmasdan saqlash) — xlsx fayli ichidagi qismlar uchun */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const [name, text] of files) {
    const nb = enc.encode(name), data = typeof text === "string" ? enc.encode(text) : text, crc = crc32(data);
    const head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
    parts.push(new Uint8Array([...u32(0x04034b50), ...head]), nb, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += 30 + nb.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...central, end]);
}

/* Excel */
const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export async function exportXlsx(rows, price, meta) {
  const png = await markPng(96);
  const t = reportTable(rows, price), out = [], merges = [];
  let n = 0;
  const str = (ref, v, s = 0) => `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  const num = (ref, v, s = 2) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  const fx = (ref, f, v, s = 2) => `<c r="${ref}" s="${s}"><f>${f}</f><v>${v}</v></c>`;
  const row = (cells, ht) => { n++; out.push(`<row r="${n}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells(n)}</row>`); return n; };
  // Sarlavha: brend, loyiha nomi, sana
  row((r) => str(`A${r}`, BRAND.name, 1), 32); merges.push(`A1:F1`);
  row((r) => str(`A${r}`, BRAND.tagline, 6)); merges.push(`A2:F2`);
  row((r) => str(`A${r}`, `Loyiha: ${meta.name}`, 7) + str(`F${r}`, today(), 6));
  row(() => "");
  const hdr = row((r) => ["Nomi", "O'lchami", "Miqdori", "Birligi", "Narxi, so'm", "Summa, so'm"].map((h, i) => str(`${"ABCDEF"[i]}${r}`, h, 3)).join(""), 22);
  const first = n + 1;
  for (const g of t.groups) {
    const gr = row((r) => str(`A${r}`, g.g, 4) + ["B", "C", "D", "E", "F"].map((c) => `<c r="${c}${r}" s="4"/>`).join(""));
    merges.push(`A${gr}:F${gr}`);
    for (const q of g.rows) {
      row((r) => str(`A${r}`, q.name + (q.labor ? " (ish)" : ""), 5) + str(`B${r}`, q.spec, 5) + num(`C${r}`, q.qty, 8) + str(`D${r}`, q.unit, 5) +
        num(`E${r}`, q.price) + fx(`F${r}`, `C${r}*E${r}`, q.sum) + str(`G${r}`, q.labor ? "Ish haqi" : "Material", 9));
    }
  }
  const last = n;
  row(() => "");
  const tot = (label, f, v, s) => row((r) => str(`E${r}`, label, s === 11 ? 10 : 7) + fx(`F${r}`, f, v, s));
  const a = tot("Materiallar", `SUMIF(G${first}:G${last},"Material",F${first}:F${last})`, t.totals.mat, 2);
  const b = tot("Ish haqi", `SUMIF(G${first}:G${last},"Ish haqi",F${first}:F${last})`, t.totals.lab, 2);
  tot("Jami", `F${a}+F${b}`, t.totals.all, 11);
  row(() => "");
  row((r) => str(`A${r}`, `${BRAND.name} · ${BRAND.site}. Hajmlar loyihadan hisoblangan, narxlar taxminiy.`, 6)); merges.push(`A${n}:F${n}`);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${hdr}" topLeftCell="A${hdr + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="52" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="11" customWidth="1"/><col min="4" max="4" width="10" customWidth="1"/><col min="5" max="6" width="16" customWidth="1"/><col min="7" max="7" width="10" customWidth="1" hidden="1"/></cols>
<sheetData>${out.join("")}</sheetData>
<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L${BRAND.name} · ${BRAND.site}&amp;R&amp;P / &amp;N</oddFooter></headerFooter>
<drawing r:id="rId1"/>
</worksheet>`;
  const C = BRAND.color, D = BRAND.dark;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="6"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="22"/><color rgb="FF${D}"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF${D}"/><name val="Arial"/></font><font><sz val="9"/><color rgb="FF56666D"/><name val="Arial"/></font><font><b/><sz val="12"/><color rgb="FF${C}"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${D}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3EDE7"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFCDD6D9"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="12">
<xf/>
<xf fontId="1" applyFont="1" applyAlignment="1"><alignment vertical="center" indent="5"/></xf>
<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="2" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
<xf fontId="3" fillId="3" applyFont="1" applyFill="1"/>
<xf borderId="1" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>
<xf fontId="4" applyFont="1"/>
<xf fontId="3" applyFont="1"/>
<xf numFmtId="0" borderId="1" applyBorder="1"/>
<xf fontId="4" applyFont="1"/>
<xf fontId="5" applyFont="1"/>
<xf numFmtId="164" fontId="5" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
</styleSheet>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(meta.name)}</dc:title><dc:creator>${BRAND.name}</dc:creator></cp:coreProperties>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hisob" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">Hisob!$${hdr}:$${hdr}</definedName></definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/styles.xml", styles],
    ["xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`],
    ["xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`],
    ["xl/drawings/drawing1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>28575</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>28575</xdr:rowOff></xdr:from><xdr:ext cx="333375" cy="333375"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="${BRAND.name}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="333375" cy="333375"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`],
    ["xl/media/image1.png", png],
  ];
  download(zip(files), fileBase(meta.name) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/* PDF: A4, standart Helvetica shrifti, WinAnsi kodlash */
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const EXTRA_W = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa0: 278, 0xb0: 400, 0xb2: 333, 0xb3: 333, 0xb7: 278, 0xd7: 584, 0xd8: 778 };
const MAP = { "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "ʻ": 0x91, "ʼ": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "…": 0x85, "€": 0x80, " ": 32, " ": 32, "≤": 60, "≥": 62 };
const code = (ch) => { const c = ch.charCodeAt(0); if (MAP[ch] !== undefined) return MAP[ch]; if ((c >= 32 && c < 127) || (c >= 160 && c < 256)) return c; return 63; };
const winAnsi = (s) => [...String(s)].map((ch) => String.fromCharCode(code(ch))).join("");
const width = (s, size, bold) => [...winAnsi(s)].reduce((a, ch) => { const c = ch.charCodeAt(0); return a + (c >= 32 && c < 127 ? W[c - 32] : EXTRA_W[c] || 556); }, 0) * size / 1000 * (bold ? 1.07 : 1);
const pdfStr = (s) => "(" + winAnsi(s).replace(/[\\()]/g, "\\$&") + ")";
const fmtN = (v) => Math.round(v).toLocaleString("ru-RU").replace(/\s/g, " ");
function wrap(s, w, size, bold) {
  const out = []; let line = "";
  for (const word of String(s).split(/\s+/)) {
    const t = line ? line + " " + word : word;
    if (width(t, size, bold) <= w || !line) line = t; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

const fmtArea = (v) => v.toFixed(1).replace(".", ",");
const MASSHTAB = [25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];

// Rejani PDF ga vektor bo'lib chizadi: devorlar, eshik va derazalar, xona nomlari va o'lcham zanjirlari.
// Masshtab standart qatordan, chizma maydonga sig'adigan eng kattasi tanlanadi. Qaytaradi: masshtab maxraji
function drawPlan(ops, p, f, bx, by, bw, bh, { dark, muted }) {
  const v = fv(p, f), b = bounds(v), t = v.wallT, pad = 54;
  const N = MASSHTAB.find((n) => (b.x1 - b.x0) * (28.3465 / n) <= bw - 2 * pad && (b.y1 - b.y0) * (28.3465 / n) <= bh - 2 * pad) || 500;
  const s = 28.3465 / N;
  const ox = bx + (bw - (b.x1 - b.x0) * s) / 2 + pad / 3, top = by + bh - (bh - (b.y1 - b.y0) * s) / 2 + pad / 3;
  const X = (x) => ox + (x - b.x0) * s, Y = (y) => top - (y - b.y0) * s, f2 = (n) => n.toFixed(2);
  const fill = (x, y, w, h, c) => ops.push(`${c} rg ${f2(X(x))} ${f2(Y(y + h))} ${f2(w * s)} ${f2(h * s)} re f`);
  const stroke = (pts, c, w = 0.6) => ops.push(`${c} RG ${w} w ` + pts.map(([x, y], i) => `${f2(X(x))} ${f2(Y(y))} ${i ? "l" : "m"}`).join(" ") + " S");
  const txt = (s0, x, y, size, font = "F1", c = dark, rot = false) => {
    const w = width(s0, size, font === "F2"), px = X(x), py = Y(y);
    ops.push(rot
      ? `BT ${c} rg /${font} ${size} Tf 0 1 -1 0 ${f2(px + size / 3)} ${f2(py - w / 2)} Tm ${pdfStr(s0)} Tj ET`
      : `BT ${c} rg /${font} ${size} Tf ${f2(px - w / 2)} ${f2(py - size / 3)} Td ${pdfStr(s0)} Tj ET`);
  };
  // Devorlar kulrang, xonalar oq (isitilmaydigan xona och kulrang)
  for (const r of v.rooms) fill(r.x - t, r.y - t, r.w + 2 * t, r.d + 2 * t, "0.45 0.50 0.53");
  for (const r of v.rooms) fill(r.x, r.y, r.w, r.d, ROOM_TYPES[r.type].heated ? "1 1 1" : "0.90 0.91 0.91");
  // Eshik va derazalar
  for (const o of v.openings) {
    const z = openingRect(v, o), r = v.rooms.find((q) => q.id === o.room);
    if (!z || !r) continue;
    if (o.kind === "window") {
      fill(z.x, z.y, z.w, z.d, "0.66 0.84 0.92");
      stroke(z.axis === "h" ? [[z.x, z.y + z.d / 2], [z.x + z.w, z.y + z.d / 2]] : [[z.x + z.w / 2, z.y], [z.x + z.w / 2, z.y + z.d]], dark, 0.5);
      continue;
    }
    fill(z.x, z.y, z.w, z.d, o.kind === "entry" ? "0.96 0.90 0.85" : "1 1 1");
    // Eshik tavaqasi va ochilish yoyi (chorak doira, Bezier bilan)
    const L = o.w, K = 0.5523;
    let hx, hy, ax, ay, ux, uy;
    if (z.axis === "h") { hx = z.x; hy = o.side === "n" ? r.y : r.y + r.d; [ax, ay, ux, uy] = [0, o.side === "n" ? 1 : -1, 1, 0]; }
    else { hy = z.y; hx = o.side === "w" ? r.x : r.x + r.w; [ax, ay, ux, uy] = [o.side === "w" ? 1 : -1, 0, 0, 1]; }
    const P0 = [hx + ax * L, hy + ay * L], P3 = [hx + ux * L, hy + uy * L];
    stroke([[hx, hy], P0], dark, 0.8);
    ops.push(`${muted} RG 0.4 w ${f2(X(P0[0]))} ${f2(Y(P0[1]))} m ${f2(X(P0[0] + ux * K * L))} ${f2(Y(P0[1] + uy * K * L))} ${f2(X(P3[0] + ax * K * L))} ${f2(Y(P3[1] + ay * K * L))} ${f2(X(P3[0]))} ${f2(Y(P3[1]))} c S`);
  }
  // O'lcham chizig'i: chetlarida qiya chiziqcha, ustida son
  const tick = (x, y) => ops.push(`${dark} RG 0.6 w ${f2(X(x) - 2.5)} ${f2(Y(y) - 2.5)} m ${f2(X(x) + 2.5)} ${f2(Y(y) + 2.5)} l S`);
  const dimH = (x0, x1, y, label, c = dark) => { stroke([[x0, y], [x1, y]], c, 0.4); tick(x0, y); tick(x1, y); txt(label, (x0 + x1) / 2, y - 6 / s, 6.5, "F1", c); };
  const dimV = (y0, y1, x, label, c = dark) => { stroke([[x, y0], [x, y1]], c, 0.4); tick(x, y0); tick(x, y1); txt(label, x - 6 / s, (y0 + y1) / 2, 6.5, "F1", c, true); };
  // Xona nomi, maydoni va ichki o'lchamlari
  for (const r of v.rooms) {
    const cx = r.x + r.w / 2, cy = r.y + r.d / 2;
    txt(r.name, cx, cy - 6 / s, 8, "F2");
    txt(`${fmtArea((r.w * r.d) / 1e4)} m²`, cx, cy + 6 / s, 7, "F1", muted);
    if (r.w * s > 70 && r.d * s > 50) dimH(r.x, r.x + r.w, r.y + 18 / s, String(r.w), muted);
    if (r.d * s > 70 && r.w * s > 50) dimV(r.y, r.y + r.d, r.x + 18 / s, String(r.d), muted);
  }
  // Tashqi o'lcham zanjirlari: pastda va chapda devor va xonalar bo'yicha, tashqarisida umumiy o'lcham
  // Zanjirga faqat shu fasadga tegib turgan xonalar kiradi
  const bottom = v.rooms.filter((r) => Math.abs(r.y + r.d + t - b.y1) < 1), left = v.rooms.filter((r) => Math.abs(r.x - t - b.x0) < 1);
  const xs = [...new Set(bottom.flatMap((r) => [r.x - t, r.x, r.x + r.w, r.x + r.w + t]))].sort((a, c) => a - c);
  const ys = [...new Set(left.flatMap((r) => [r.y - t, r.y, r.y + r.d, r.y + r.d + t]))].sort((a, c) => a - c);
  const yb = b.y1 + 22 / s, xl = b.x0 - 22 / s;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] >= 5) dimH(xs[i - 1], xs[i], yb, String(Math.round(xs[i] - xs[i - 1])));
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] >= 5) dimV(ys[i - 1], ys[i], xl, String(Math.round(ys[i] - ys[i - 1])));
  dimH(b.x0, b.x1, yb + 18 / s, String(b.x1 - b.x0));
  dimV(b.y0, b.y1, xl - 18 / s, String(b.y1 - b.y0));
  // Shimol belgisi
  const nx = X(b.x1) + 26, ny = Y(b.y0) - 6;
  ops.push(`${dark} rg ${f2(nx)} ${f2(ny)} m ${f2(nx - 5)} ${f2(ny - 14)} l ${f2(nx + 5)} ${f2(ny - 14)} l f`);
  ops.push(`BT ${dark} rg /F2 8 Tf ${f2(nx - 3)} ${f2(ny + 4)} Td (N) Tj ET`);
  return N;
}

export function exportPdf(rows, price, meta) {
  const t = reportTable(rows, price);
  const PW = 595.28, PH = 841.89, M = 40, FS = 8.5, LH = 11.5;
  const brand = [0x9c / 255, 0x52 / 255, 0x19 / 255].map((v) => v.toFixed(3)).join(" "), dark = "0.090 0.129 0.149", muted = "0.337 0.400 0.427", line = "0.804 0.839 0.851";
  // Ustunlar: nomi, o'lchami, miqdori, narxi, summa
  const cols = [{ w: 0, a: "l" }, { w: 92, a: "l" }, { w: 62, a: "r" }, { w: 66, a: "r" }, { w: 76, a: "r" }];
  cols[0].w = PW - 2 * M - cols.slice(1).reduce((a, c) => a + c.w, 0);
  const X = []; cols.reduce((x0, c) => (X.push(x0), x0 + c.w), M);
  const pages = [], images = [];
  let ops, y, page;
  const text = (s, x0, y0, size, font = "F1", color = dark) => ops.push(`BT ${color} rg /${font} ${size} Tf ${x0.toFixed(2)} ${y0.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
  const rect = (x0, y0, w, h, color) => ops.push(`${color} rg ${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const hline = (y0, color = line, w = 0.5) => ops.push(`${color} RG ${w} w ${M} ${y0.toFixed(2)} m ${PW - M} ${y0.toFixed(2)} l S`);
  const cell = (s, i, y0, size = FS, font = "F1", color = dark) => {
    const c = cols[i], tw = width(s, size, font === "F2");
    text(s, c.a === "r" ? X[i] + c.w - 4 - tw : X[i] + 4, y0, size, font, color);
  };
  // Logo: SVG koordinatalarida chiziladi, cm bilan joyiga va o'lchamiga keltiriladi (y pastga qarab)
  const K = 0.5523;
  const logo = (x0, top, s) => {
    const k = s / 32;
    ops.push(`q ${k.toFixed(4)} 0 0 ${(-k).toFixed(4)} ${x0} ${top} cm`);
    const r = 7, c = r * K;
    ops.push(`${brand} rg 7 0 m 25 0 l ${25 + c} 0 32 ${7 - c} 32 7 c 32 25 l 32 ${25 + c} ${25 + c} 32 25 32 c 7 32 l ${7 - c} 32 0 ${25 + c} 0 25 c 0 7 l 0 ${7 - c} ${7 - c} 0 7 0 c f`);
    ops.push("1 1 1 RG 1 J 1 j 3 w 6.5 15.5 m 16 7.5 l 25.5 15.5 l S");
    const a = 3.6 * K;
    ops.push(`2.6 w 12.5 25 m 12.5 16 l 17 16 l ${17 + a} 16 20.6 ${19.6 - a} 20.6 19.6 c 20.6 ${19.6 + a} ${17 + a} 23.2 17 23.2 c 12.5 23.2 l S Q`);
  };
  // Yangi sahifa: tepasida logo, brend va sana. Reja va 3D sahifalari yotiq (landshaft)
  const newPage = (W = PW, H = PH) => {
    page = { ops: [], W, H, imgs: [] }; ops = page.ops; pages.push(page);
    y = H - M;
    logo(M, y, 30);
    text(BRAND.name, M + 38, y - 19, 20, "F2", dark);
    text(BRAND.tagline, M + 38, y - 30, 8, "F1", muted);
    const d = today(), tw = width(d, 8.5);
    text(d, W - M - tw, y - 22, 8.5, "F1", muted);
    y -= 44;
    ops.push(`${brand} rg ${M} ${y.toFixed(2)} ${W - 2 * M} 2 re f`);
    y -= 18;
  };
  const image = (img, x0, y0, w, h) => {
    images.push(img); const id = images.length - 1; page.imgs.push(id);
    ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x0.toFixed(2)} ${y0.toFixed(2)} cm /Im${id} Do Q`);
    ops.push(`${line} RG 0.5 w ${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  };
  const LW = PH, LH2 = PW;
  // Uy rejasi har qavat uchun, o'lchamlari bilan
  if (meta.project) {
    const p = meta.project;
    for (const f of floorList(p)) {
      if (!fv(p, f).rooms.length) continue;
      newPage(LW, LH2);
      const many = (p.floors || 1) > 1;
      const N = drawPlan(ops, p, f, M, M + 14, LW - 2 * M, y - 26 - (M + 14), { text, dark, muted, line });
      text(`${many ? `${f + 1}-qavat rejasi` : "Uy rejasi"}`, M, y, 14, "F2");
      const info = `Masshtab 1:${N}. O'lchamlar santimetrda. Devor ${p.wallT} sm, ${WALL_MATERIALS[p.wallMaterial]?.name.toLowerCase() || ""}, shift ${p.h} sm. Loyiha: ${meta.name}`;
      text(info, M, y - 14, 8, "F1", muted);
    }
  }
  // 3D ko'rinishlar: uy 6 proeksiyada, har bir xona 4 tomondan
  const shots = meta.shots;
  // Bitta yotiq sahifaga 2 × 2 tartibda 4 ta katta rasm, har birining tagida nomi
  const grid4 = (list, title, sub) => {
    newPage(LW, LH2);
    text(title, M, y, 14, "F2");
    if (sub) text(sub, M + width(title, 14, true) + 14, y, 9, "F1", muted);
    const gap = 12, cap = 15, top = y - 12, bottom = M + 10;
    let cw = (LW - 2 * M - gap) / 2, ih = cw * (list[0].h / list[0].w);
    // Ikki qator sig'masa, rasmlar balandlik bo'yicha kichraytiriladi va o'rtaga suriladi
    const maxH = (top - bottom - 2 * cap - gap) / 2;
    if (ih > maxH) { ih = maxH; cw = ih * (list[0].w / list[0].h); }
    const x0 = (LW - (2 * cw + gap)) / 2;
    list.forEach((s, i) => {
      const cx = x0 + (i % 2) * (cw + gap), ty = top - Math.floor(i / 2) * (ih + cap + gap);
      image(s, cx, ty - ih, cw, ih);
      text(s.title, cx, ty - ih - 11, 8.5, "F1", muted);
    });
  };
  if (shots?.house?.length) {
    const pages3d = Math.ceil(shots.house.length / 4);
    for (let i = 0; i < shots.house.length; i += 4) {
      grid4(shots.house.slice(i, i + 4), "Uyning 3D ko'rinishi", pages3d > 1 ? `${i / 4 + 1} / ${pages3d}` : "");
    }
  }
  for (const r of shots?.rooms || []) {
    const name = `${r.name}${(meta.project?.floors || 1) > 1 ? `, ${r.floor + 1}-qavat` : ""}`;
    grid4(r.imgs, `Xona: ${name}`, `${r.w} × ${r.d} sm, ${fmtArea(r.w * r.d / 1e4)} m²`);
  }
  const header = (firstPage) => {
    newPage();
    if (firstPage) {
      text("Materiallar va ish narxi hisobi", M, y, 14, "F2");
      y -= 16;
      text(`Loyiha: ${meta.name}`, M, y, 9.5, "F1", muted);
      y -= 20;
      // Asosiy ko'rsatkichlar
      const kw = (PW - 2 * M) / 3;
      [["Materiallar", t.totals.mat], ["Ish haqi", t.totals.lab], ["Jami", t.totals.all]].forEach(([n, v], i) => {
        const x0 = M + i * kw;
        rect(x0 + (i ? 4 : 0), y - 34, kw - 4, 40, i === 2 ? brand : "0.953 0.929 0.906");
        text(n, x0 + 12, y - 8, 8, "F1", i === 2 ? "1 1 1" : muted);
        text(fmtN(v) + " so'm", x0 + 12, y - 25, 13, "F2", i === 2 ? "1 1 1" : dark);
      });
      y -= 52;
    }
    rect(M, y - 6, PW - 2 * M, 18, dark);
    ["Nomi", "O'lchami", "Miqdori", "Narxi, so'm", "Summa, so'm"].forEach((h, i) => cell(h, i, y, 8, "F2", "1 1 1"));
    y -= 20;
  };
  let cur = null;
  const groupBar = (s) => { rect(M, y - 4, PW - 2 * M, 15, "0.953 0.929 0.906"); text(s, M + 4, y, 9, "F2", brand); y -= 17; };
  // Sahifa tugasa yangisini ochadi, guruh o'rtasida bo'lsa uning nomini takrorlaydi
  const need = (h) => { if (y - h < M + 24) { header(false); if (cur) groupBar(`${cur} (davomi)`); } };
  header(true);
  for (const g of t.groups) {
    cur = null;
    need(LH * 3);
    groupBar(g.g);
    cur = g.g;
    for (const q of g.rows) {
      const lines = wrap(q.name + (q.labor ? " (ish)" : ""), cols[0].w - 8, FS), spec = wrap(q.spec, cols[1].w - 8, FS);
      const h = Math.max(lines.length, spec.length) * LH;
      need(h + 4);
      lines.forEach((s, k) => cell(s, 0, y - k * LH));
      spec.forEach((s, k) => cell(s, 1, y - k * LH, FS, "F1", muted));
      cell(`${q.qty} ${q.unit}`, 2, y);
      cell(fmtN(q.price), 3, y);
      cell(fmtN(q.sum), 4, y, FS, "F2");
      y -= h;
      hline(y + LH - 7);
      y -= 3;
    }
    y -= 6;
  }
  cur = null;
  need(70);
  y -= 4;
  hline(y + 8, dark, 1);
  [["Materiallar", t.totals.mat], ["Ish haqi", t.totals.lab], ["Jami", t.totals.all]].forEach(([n, v], i) => {
    const last = i === 2, f = last ? "F2" : "F1", s = last ? 11 : 9;
    text(n, X[3] - 40, y - 6, s, f, last ? brand : dark);
    const tw = width(fmtN(v) + " so'm", s, last);
    text(fmtN(v) + " so'm", PW - M - 4 - tw, y - 6, s, f, last ? brand : dark);
    y -= last ? 18 : 14;
  });
  y -= 10;
  wrap("Hajmlar loyihadan hisoblangan. Material narxlari foydalanuvchi kiritgan, ish haqi taxminiy. Qurilishdan oldin mutaxassis tekshirishi kerak.", PW - 2 * M, 7.5)
    .forEach((s) => { need(10); text(s, M, y, 7.5, "F1", muted); y -= 10; });
  // Har sahifa pastida brend va sahifa raqami
  pages.forEach((pg, i) => {
    const o = pg.ops;
    o.push(`${line} RG 0.5 w ${M} ${M} m ${pg.W - M} ${M} l S`);
    o.push(`BT ${muted} rg /F1 7.5 Tf ${M} ${M - 12} Td ${pdfStr(`${BRAND.name} · ${BRAND.site}`)} Tj ET`);
    const s = `${i + 1} / ${pages.length}`;
    o.push(`BT ${muted} rg /F1 7.5 Tf ${(pg.W - M - width(s, 7.5)).toFixed(2)} ${M - 12} Td ${pdfStr(s)} Tj ET`);
  });
  // Fayl tuzilishi
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const cat = add(""), pagesId = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const imgIds = images.map((im) => add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${im.data}\nendstream`));
  const kids = pages.map((pg) => {
    const body = pg.ops.join("\n");
    const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    const xo = pg.imgs.length ? ` /XObject << ${pg.imgs.map((i) => `/Im${i} ${imgIds[i]} 0 R`).join(" ")} >>` : "";
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pg.W} ${pg.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xo} >> /Contents ${c} 0 R >>`);
  });
  objs[cat - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfStr(meta.name)} /Author (${BRAND.name}) /Producer (${BRAND.name}) >>`);
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs = objs.map((o, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  download(bytes, fileBase(meta.name) + ".pdf", "application/pdf");
}
