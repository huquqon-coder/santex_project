// Materiallar va ish narxi jadvali. Standart narxlar faqat ish uchun va taxminiy.
export const LABOR = {
  l_riser: 300000, l_boiler: 3000000, l_ufh: 80000, l_man: 600000, l_rad: 200000, l_pipe: 40000, l_start: 1000000,
  l_point: 60000, l_cable: 10000, l_panel: 800000, l_jbox: 50000,
  l_fix: 150000, l_wpipe: 30000, l_tank: 400000, l_pumpst: 500000, l_vent: 300000, l_safety: 300000,
};
export const EXTRA_GROUP = "Qo'lda qo'shilgan";
const UNITS = ["dona", "m", "m²", "m³", "kg", "l", "to'plam", "qop", "xizmat"];
const mln = (v) => (v / 1e6).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v) => Math.round(v).toLocaleString("ru-RU").replace(/ /g, " ");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// rows: hisoblangan qatorlar; qo'lda qo'shilganlarida extra: id bo'ladi
export const priceOf = (r, prices) => prices[r.k] ?? (r.labor ? LABOR[r.k] ?? 0 : 0);

export function renderReport(el, rows, prices, onPrice, extra = {}) {
  const price = (r) => priceOf(r, prices);
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.qty * price(r), 0);
  const groups = [...new Set(rows.map((r) => r.g))];
  let h = `<div class="kpis" id="rep-kpis"></div><table class="rep"><thead><tr><th>Nomi</th><th>O'lchami</th><th>Miqdori</th><th>Narxi, so'm</th><th>Summa, so'm</th></tr></thead>`;
  for (const g of groups) {
    h += `<tbody><tr><td class="grp" colspan="5">${esc(g)}</td></tr>`;
    for (const r of rows.filter((x) => x.g === g)) {
      const qty = r.extra
        ? `<input class="qty" type="number" min="0" step="any" data-q="${r.extra}" value="${r.qty}" aria-label="${esc(r.name)} miqdori"> ${esc(r.unit)} <button class="xdel" data-del="${r.extra}" title="O'chirish" aria-label="${esc(r.name)} qatorini o'chirish">×</button>`
        : `${r.qty} ${r.unit}`;
      h += `<tr><td>${esc(r.name)}${r.extra && r.labor ? " <small>(ish)</small>" : ""}</td><td>${esc(r.spec || "")}</td><td>${qty}</td>` +
        `<td><input type="number" min="0" step="1000" data-k="${esc(r.k)}" value="${price(r)}" aria-label="${esc(r.name)} narxi"></td><td data-s="${esc(r.k)}"></td></tr>`;
    }
    h += `</tbody>`;
  }
  h = rows.length ? h + `</table>` : `<p class="hint">Rejaga xona va jihozlar qo'shilgach, ro'yxat shu yerda chiqadi.</p>`;
  // Qo'lda mahsulot yoki ish qo'shish
  const gopts = [EXTRA_GROUP, ...groups.filter((g) => g !== EXTRA_GROUP)].map((g) => `<option>${esc(g)}</option>`).join("");
  h += `<form class="addrow" id="addRow"><h3>Qo'lda qo'shish</h3>` +
    `<label class="wide">Nomi<input name="name" required maxlength="120" placeholder="Masalan, PPR kran Ø25"></label>` +
    `<label>O'lchami<input name="spec" maxlength="60" placeholder="Ø25"></label>` +
    `<label>Miqdori<input name="qty" type="number" min="0" step="any" value="1" required></label>` +
    `<label>Birligi<select name="unit">${UNITS.map((u) => `<option>${u}</option>`).join("")}</select></label>` +
    `<label>Narxi, so'm<input name="price" type="number" min="0" step="1000" value="0"></label>` +
    `<label class="wide">Bo'lim<select name="g">${gopts}</select></label>` +
    `<label class="chk"><input name="labor" type="checkbox"> Ish haqi</label>` +
    `<button class="plain" type="submit">Qo'shish</button></form>`;
  el.innerHTML = h;
  const totals = () => {
    for (const r of rows) {
      const c = el.querySelector(`[data-s="${CSS.escape(r.k)}"]`);
      if (c) c.textContent = num(r.qty * price(r));
    }
    const k = el.querySelector("#rep-kpis");
    if (k) k.innerHTML = [["Materiallar", sum((r) => !r.labor)], ["Ish haqi", sum((r) => r.labor)], ["Jami", sum(() => true)]]
      .map(([n, v]) => `<div class="kpi"><span>${n}</span><b>${mln(v)}<small>mln so'm</small></b></div>`).join("");
  };
  el.oninput = (e) => {
    const k = e.target.dataset.k, q = e.target.dataset.q;
    if (k) { onPrice(k, Math.max(0, +e.target.value || 0)); totals(); }
    if (q) {
      const r = rows.find((x) => x.extra === q), v = Math.max(0, +e.target.value || 0);
      if (r) { r.qty = v; extra.onQty?.(q, v); totals(); }
    }
  };
  el.onclick = (e) => { if (e.target.dataset.del) extra.onDel?.(e.target.dataset.del); };
  el.querySelector("#addRow").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    extra.onAdd?.({
      name: f.get("name").trim(), spec: f.get("spec").trim(), qty: Math.max(0, +f.get("qty") || 0), unit: f.get("unit"),
      g: f.get("g") || EXTRA_GROUP, labor: f.get("labor") === "on",
    }, Math.max(0, +f.get("price") || 0));
  };
  totals();
}
