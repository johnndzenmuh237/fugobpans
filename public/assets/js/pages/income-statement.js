import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, opts } from '../utils.js';
import { lookups, card, selectHtml } from './_common.js';

const first = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
const state = { from: first(), to: new Date().toLocaleDateString('en-CA'), propertyId: '' };
const line = (label, v, o = {}) => `<tr><td style="${o.indent ? 'padding-left:28px;' : ''}${o.bold ? 'font-weight:700;' : ''}">${label}</td><td style="text-align:right;${o.bold ? 'font-weight:700;' : ''}${o.color ? `color:${o.color}` : ''}">${formatCurrency(v)}</td></tr>`;

async function load() {
  const s = await api.get(`/finance/income-statement${api.qs(state)}`);
  const max = Math.max(1, ...s.monthly.flatMap((m) => [m.revenue, m.expenses]));
  qs('#out').innerHTML = `
    <div class="stat-grid">${card('Total revenue', formatCurrency(s.totalRevenue))}${card('Total expenses', formatCurrency(s.totalExpenses))}${card('Net income', formatCurrency(s.netIncome), { cls: s.netIncome >= 0 ? 'good' : 'warn' })}${card('Deposits collected', formatCurrency(s.depositsCollected), { sub: 'Held for tenants — not income' })}</div>
    <div class="two-col" style="margin-top:22px"><div class="card card-pad"><h3 style="margin-top:0">Income statement</h3><div class="table-wrap"><table><tbody>
      ${line('Rent income', s.rentIncome, { indent: 1 })}${line('Other income', s.otherIncome, { indent: 1 })}${line('Debt recoveries', s.debtRecoveries, { indent: 1 })}${line('Total revenue', s.totalRevenue, { bold: 1 })}
      ${s.expensesByCategory.map((e) => line(escapeHtml(e.category), e.total, { indent: 1 })).join('')}${line('Total expenses', s.totalExpenses, { bold: 1 })}
      ${line('Net income', s.netIncome, { bold: 1, color: s.netIncome >= 0 ? 'var(--success-600)' : 'var(--danger-600)' })}</tbody></table></div></div>
      <div class="card card-pad"><h3 style="margin-top:0">Month by month</h3><div class="legend"><span><i style="background:var(--indigo-600)"></i>Revenue</span><span><i style="background:var(--amber-500)"></i>Expenses</span></div>
      <div class="bar-chart">${s.monthly.map((m) => `<div class="col"><div class="pair"><i class="rev" style="height:${(m.revenue / max) * 100}%" title="${formatCurrency(m.revenue)}"></i><i class="exp" style="height:${(m.expenses / max) * 100}%" title="${formatCurrency(m.expenses)}"></i></div></div>`).join('')}</div>
      <div class="bar-labels">${s.monthly.map((m) => `<span>${m.month.slice(2)}</span>`).join('')}</div></div></div>
    <div class="section-title"><h2>By property</h2></div><div id="propMount"></div>`;
  renderTable(qs('#propMount'), s.byProperty, [{ label: 'Property', render: (p) => escapeHtml(p.name) }, { label: 'Revenue', render: (p) => formatCurrency(p.revenue) }, { label: 'Expenses', render: (p) => formatCurrency(p.expenses) }, { label: 'Net', render: (p) => `<strong style="color:${p.net >= 0 ? 'var(--success-600)' : 'var(--danger-600)'}">${formatCurrency(p.net)}</strong>` }], { pageSize: 15 });
}
async function main() {
  await initPortalLayout({ activeKey: 'income-statement', perms: ['finance'], title: 'Financial Records', subtitle: 'Revenue, expenses and net income for any period, from the real ledger.' });
  const props = await lookups.properties();
  qs('#pageActions').innerHTML = '<button class="btn btn-outline btn-sm no-print" onclick="print()">Print / Save PDF</button> <button class="btn btn-outline btn-sm" id="csvBtn">Revenue CSV</button>';
  qs('#pageRoot').innerHTML = `<div class="filters-bar no-print"><div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">FROM</label><input type="date" id="fFrom" value="${state.from}"/></div><div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">TO</label><input type="date" id="fTo" value="${state.to}"/></div>${selectHtml('fProp', 'Property', opts(props, 'id', 'name'), { all: 'All properties' })}</div><div id="out"><div class="spinner"></div></div>`;
  [['#fFrom', 'from'], ['#fTo', 'to'], ['#fProp', 'propertyId']].forEach(([s, k]) => qs(s).addEventListener('change', (e) => { state[k] = e.target.value; load(); }));
  qs('#csvBtn').addEventListener('click', () => downloadFile(api.url(`/analytics/reports/revenue${api.qs({ ...state, format: 'csv' })}`), 'revenue.csv'));
  await load();
}
main();
