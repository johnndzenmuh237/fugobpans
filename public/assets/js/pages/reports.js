import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, opts } from '../utils.js';
import { lookups } from './_common.js';

let current = null; let props = [];
const MONEY = /rent|amount|owing|revenue|deposit|balance|cost|collected/i;
async function run() {
  if (!current) return;
  const f = { propertyId: qs('#fProp').value, from: qs('#fFrom').value, to: qs('#fTo').value };
  qs('#out').innerHTML = '<div class="spinner"></div>';
  const rep = await api.get(`/analytics/reports/${current}${api.qs(f)}`);
  qs('#out').innerHTML = `<h2 style="margin:6px 0 12px">${escapeHtml(rep.title)}</h2><div id="tbl"></div>`;
  renderTable(qs('#tbl'), rep.rows, rep.columns.map((c) => ({ label: c.label, render: (r) => (typeof r[c.key] === 'number' && MONEY.test(c.label) ? formatCurrency(r[c.key]) : escapeHtml(r[c.key] ?? '')) })), { pageSize: 25, emptyMessage: 'No data for these filters.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'reports', title: 'Reports', subtitle: 'Open any report, then export CSV (opens in Excel) or print / save as PDF.' });
  const [list, p] = await Promise.all([api.get('/analytics/reports'), lookups.properties()]); props = p;
  qs('#pageRoot').innerHTML = `<div class="chip-row" id="chips">${list.map((r) => `<button class="chip" data-k="${r.key}">${escapeHtml(r.title)}</button>`).join('')}</div>
    <div class="filters-bar no-print"><select id="fProp"><option value="">All properties</option>${opts(props, 'id', 'name').map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}</select>
    <div><input type="date" id="fFrom" title="From"/></div><div><input type="date" id="fTo" title="To"/></div><button class="btn btn-outline btn-sm" id="csvBtn">Export CSV</button><button class="btn btn-outline btn-sm" onclick="print()">Print / PDF</button></div><div id="out"><p class="text-muted">Choose a report above.</p></div>`;
  qs('#chips').addEventListener('click', (e) => { const c = e.target.closest('[data-k]'); if (!c) return; current = c.dataset.k; qs('#chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c)); run(); });
  ['#fProp', '#fFrom', '#fTo'].forEach((s) => qs(s).addEventListener('change', run));
  qs('#csvBtn').addEventListener('click', () => current && downloadFile(api.url(`/analytics/reports/${current}${api.qs({ propertyId: qs('#fProp').value, from: qs('#fFrom').value, to: qs('#fTo').value, format: 'csv' })}`), `${current}-report.csv`));
}
main();
