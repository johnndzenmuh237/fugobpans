import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal, downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, opts, toast } from '../utils.js';
import { lookups, selectHtml, card } from './_common.js';

let profile; let cats = []; let props = []; let table;
const state = { propertyId: '', categoryId: '', from: '', to: '' };
async function load() {
  const rows = await api.get(`/finance/expenses${api.qs(state)}`);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = {}; rows.forEach((r) => { byCat[r.category_name] = (byCat[r.category_name] || 0) + r.amount; });
  qs('#cards').innerHTML = `<div class="stat-grid">${card('Total expenses', formatCurrency(total), { sub: `${rows.length} entries` })}${Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => card(escapeHtml(k), formatCurrency(v))).join('')}</div>`;
  const cols = [{ label: 'Date', render: (e) => formatDate(e.expense_date) }, { label: 'Ref', render: (e) => `<span class="mono" style="font-size:.76rem">${escapeHtml(e.reference)}</span>` }, { label: 'Property', render: (e) => escapeHtml(e.property_name || 'General') },
    { label: 'Category', render: (e) => escapeHtml(e.category_name) }, { label: 'Description', render: (e) => `${escapeHtml(e.description || '—')}${e.auto_generated ? ' <span class="badge badge-info">from maintenance</span>' : ''}` }, { label: 'Vendor', render: (e) => escapeHtml(e.vendor || '—') }, { label: 'Amount', render: (e) => `<strong>${formatCurrency(e.amount)}</strong>` }];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { pageSize: 20, emptyMessage: 'No expenses recorded.' });
}
async function main() {
  profile = await initPortalLayout({ activeKey: 'expenses', perms: ['finance'], title: 'Expenses', subtitle: 'Repairs, electricity, water, security, cleaning, salaries — per property.' });
  [cats, props] = await Promise.all([api.get('/finance/expense-categories'), lookups.properties()]);
  qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ Record expense</button> <button class="btn btn-outline" id="catBtn">+ Category</button>';
  qs('#pageRoot').innerHTML = `<div class="filters-bar">${selectHtml('fProp', 'Property', opts(props, 'id', 'name'))}${selectHtml('fCat', 'Category', opts(cats, 'id', 'name'))}
    <div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">FROM</label><input type="date" id="fFrom"/></div><div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">TO</label><input type="date" id="fTo"/></div>
    <button class="btn btn-outline btn-sm" id="csvBtn" style="align-self:end">Export CSV</button></div><div id="cards"></div><div id="tableMount"></div>`;
  [['#fProp', 'propertyId'], ['#fCat', 'categoryId'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([s, k]) => qs(s).addEventListener('change', (e) => { state[k] = e.target.value; load(); }));
  qs('#csvBtn').addEventListener('click', () => downloadFile(api.url(`/analytics/reports/expenses${api.qs({ ...state, format: 'csv' })}`), 'expenses.csv'));
  qs('#catBtn').addEventListener('click', () => openFormModal({ title: 'New expense category', fields: [{ name: 'name', label: 'Name', required: true }], onSubmit: async (v) => { await api.post('/finance/expense-categories', v); location.reload(); } }));
  qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'Record an expense',
    fields: [{ name: 'propertyId', label: profile.role === 'MANAGER' ? 'Property' : 'Property (blank = general)', type: 'select', required: profile.role === 'MANAGER', options: opts(props, 'id', 'name') }, { name: 'categoryId', label: 'Category', type: 'select', required: true, options: opts(cats, 'id', 'name') },
      { name: 'amount', label: 'Amount (FCFA)', type: 'number', min: 1, required: true }, { name: 'expenseDate', label: 'Date', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { name: 'paymentMethod', label: 'Paid by', type: 'select', noBlank: true, options: [['CASH', 'Cash'], ['MTN_MOMO', 'MTN MoMo'], ['ORANGE_MONEY', 'Orange Money'], ['BANK', 'Bank']].map(([value, label]) => ({ value, label })) }, { name: 'vendor', label: 'Vendor / paid to' }, { name: 'description', label: 'Description', type: 'textarea', full: true }],
    onSubmit: async (v) => { await api.post('/finance/expenses', { ...v, amount: Number(v.amount) }); toast('Expense recorded.', 'success'); await load(); } }));
  await load();
}
main();
