import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, opts, pctBar } from '../utils.js';

let cats = []; let profile;
const thisMonth = () => new Date().toISOString().slice(0, 7);
async function load() {
  const rows = await api.get(`/finance/budgets${api.qs({ period: qs('#period').value })}`);
  renderTable(qs('#tableMount'), rows, [
    { label: 'Category', render: (b) => `<strong>${escapeHtml(b.category_name)}</strong>` }, { label: 'Budget', render: (b) => formatCurrency(b.amount) }, { label: 'Spent', render: (b) => formatCurrency(b.spent) },
    { label: 'Remaining', render: (b) => `<span style="color:${b.over_budget ? 'var(--danger-600)' : 'inherit'}">${formatCurrency(b.remaining)}</span>` }, { label: 'Used', render: (b) => `${b.percent_used}%${pctBar(Math.min(100, b.percent_used))}` },
  ], { emptyMessage: 'No budget set for this month.' });
}
async function main() {
  profile = await initPortalLayout({ activeKey: 'budgets', perms: ['finance'], title: 'Budgets', subtitle: 'Set a monthly limit per expense category and watch actual spending against it.' });
  cats = await api.get('/finance/expense-categories');
  if (['ADMIN', 'ACCOUNTANT'].includes(profile.role)) qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ Set budget</button>';
  qs('#pageRoot').innerHTML = `<div class="filters-bar"><div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">MONTH</label><input type="month" id="period" value="${thisMonth()}"/></div></div><div id="tableMount"></div>`;
  qs('#period').addEventListener('change', load);
  qs('#addBtn')?.addEventListener('click', () => openFormModal({ title: 'Set a monthly budget', fields: [{ name: 'categoryId', label: 'Category', type: 'select', required: true, options: opts(cats, 'id', 'name') }, { name: 'period', label: 'Month', type: 'month', default: qs('#period').value, required: true }, { name: 'amount', label: 'Budget (FCFA)', type: 'number', min: 0, required: true }], onSubmit: async (v) => { await api.post('/finance/budgets', { ...v, amount: Number(v.amount) }); await load(); } }));
  await load();
}
main();
