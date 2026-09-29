import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, escapeHtml, qs } from './utils.js';

let categories = [];

function currentPeriod() { return new Date().toISOString().slice(0, 7); }

async function load(period) {
  const rows = await api.get(`/business/budgets?period=${encodeURIComponent(period)}`);
  renderTable(qs('#tableMount'), rows, [
    { key: 'category_name', label: 'Category' },
    { key: 'period', label: 'Period' },
    { key: 'amount', label: 'Budget', render: (r) => formatCurrency(r.amount) },
    { key: 'spent', label: 'Spent', render: (r) => formatCurrency(r.spent) },
    { key: 'remaining', label: 'Remaining', render: (r) => formatCurrency(r.remaining) },
    { key: 'percent_used', label: '% Used', render: (r) => `${r.percent_used}%` },
    { key: 'over_budget', label: 'Status', render: (r) => r.over_budget
        ? '<span class="badge badge-danger">Over Budget</span>'
        : r.percent_used >= 80 ? '<span class="badge badge-warning">Near Limit</span>' : '<span class="badge badge-success">On Track</span>' },
  ], { emptyMessage: `No budgets set for ${period} yet.` });
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'budgets' });
  categories = await api.get('/business/expense-categories');
  let period = currentPeriod();

  qs('#pageActions').innerHTML = `
    <input id="periodPicker" type="month" value="${period}" class="btn btn-outline" style="padding:8px 12px;" />
    <button id="addBudgetBtn" class="btn btn-primary">Set Budget</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load(period);

  qs('#periodPicker').addEventListener('change', async (e) => { period = e.target.value; await load(period); });

  qs('#addBudgetBtn').addEventListener('click', () => openFormModal({
    title: `Set Budget for ${period}`,
    fields: [
      { name: 'categoryId', label: 'Category', type: 'select', required: true, options: categories.map((c) => ({ value: c.id, label: c.name })) },
      { name: 'amount', label: 'Budget Amount (FCFA)', type: 'number', required: true },
    ],
    onSubmit: async (v) => {
      await api.post('/business/budgets', { categoryId: v.categoryId, period, amount: Number(v.amount) });
      await load(period);
    },
  }));
}
main();
