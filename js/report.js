// Materiallar va ish narxi jadvali. Standart narxlar faqat ish uchun va taxminiy.
export const LABOR = {
  l_boiler: 3000000, l_rad: 200000, l_pipe: 40000, l_start: 1000000,
  l_point: 60000, l_cable: 10000, l_panel: 800000, l_jbox: 50000,
  l_fix: 150000, l_wpipe: 30000,
};
const mln = (v) => (v / 1e6).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v) => Math.round(v).toLocaleString("ru-RU").replace(/ /g, " ");

export function renderReport(el, rows, prices, onPrice) {
  const price = (r) => prices[r.k] ?? (r.labor ? LABOR[r.k] ?? 0 : 0);
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.qty * price(r), 0);
  const groups = [...new Set(rows.map((r) => r.g))];
  let h = `<div class="kpis" id="rep-kpis"></div><table class="rep"><thead><tr><th>Nomi</th><th>O'lchami</th><th>Miqdori</th><th>Narxi, so'm</th><th>Summa, so'm</th></tr></thead>`;
  for (const g of groups) {
    h += `<tbody><tr><td class="grp" colspan="5">${g}</td></tr>`;
    for (const r of rows.filter((x) => x.g === g)) {
      h += `<tr><td>${r.name}</td><td>${r.spec || ""}</td><td>${r.qty} ${r.unit}</td>` +
        `<td><input type="number" min="0" step="1000" data-k="${r.k}" value="${price(r)}" aria-label="${r.name} narxi"></td><td data-s="${r.k}"></td></tr>`;
    }
    h += `</tbody>`;
  }
  el.innerHTML = rows.length ? h + `</table>` : `<p class="hint">Rejaga xona va jihozlar qo'shilgach, ro'yxat shu yerda chiqadi.</p>`;
  const totals = () => {
    for (const r of rows) {
      const c = el.querySelector(`[data-s="${r.k}"]`);
      if (c) c.textContent = num(r.qty * price(r));
    }
    const k = el.querySelector("#rep-kpis");
    if (k) k.innerHTML = [["Materiallar", sum((r) => !r.labor)], ["Ish haqi", sum((r) => r.labor)], ["Jami", sum(() => true)]]
      .map(([n, v]) => `<div class="kpi"><span>${n}</span><b>${mln(v)}<small>mln so'm</small></b></div>`).join("");
  };
  el.oninput = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    onPrice(k, Math.max(0, +e.target.value || 0));
    totals();
  };
  totals();
}
