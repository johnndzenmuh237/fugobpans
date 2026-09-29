import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDate, qs } from './utils.js';

let categories = [];

async function load() {
  const rows = await api.get('/business/expenses');
  renderTable(qs('#tableMount'), rows, [
    { key: 'reference', label: 'Ref' },
    { key: 'expense_date', label: 'Date', render: (r) => formatDate(r.expense_date) },
    { key: 'category_name', label: 'Category' },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    { key: 'vendor', label: 'Vendor / Supplier', render: (r) => r.vendor || '—' },
    { key: 'payment_method', label: 'Method' },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
  ], { emptyMessage: 'No expenses recorded yet.' });

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  qs('#totalBanner').textContent = `${rows.length} expense${rows.length === 1 ? '' : 's'} · Total: ${formatCurrency(total)}`;
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'expenses' });
  categories = await api.get('/business/expense-categories');

  qs('#pageActions').innerHTML = `<button id="addCategoryBtn" class="btn btn-outline">New Category</button> <button id="addExpenseBtn" class="btn btn-primary">Record Expense</button>`;
  qs('#pageRoot').innerHTML = '<div class="text-muted" id="totalBanner" style="margin-bottom:12px;"></div><div id="tableMount"></div>';
  await load();

  qs('#addCategoryBtn').addEventListener('click', () => openFormModal({
    title: 'New Expense Category',
    fields: [{ name: 'name', label: 'Category name', required: true }],
    onSubmit: async (v) => {
      await api.post('/business/expense-categories', v);
      categories = await api.get('/business/expense-categories');
    },
  }));

  qs('#addExpenseBtn').addEventListener('click', () => openFormModal({
    title: 'Record an Expense',
    submitLabel: 'Save Expense',
    fields: [
      { name: 'categoryId', label: 'Category', type: 'select', required: true, options: categories.map((c) => ({ value: c.id, label: c.name })) },
      { name: 'description', label: 'Description', full: true },
      { name: 'amount', label: 'Amount (FCFA)', type: 'number', required: true },
      { name: 'expenseDate', label: 'Date', type: 'date' },
      { name: 'paymentMethod', label: 'Payment Method', type: 'select', options: [{ value: 'CASH', label: 'Cash' }, { value: 'MOMO', label: 'Mobile Money' }, { value: 'BANK', label: 'Bank' }, { value: 'OTHER', label: 'Other' }] },
      { name: 'vendor', label: 'Vendor / Supplier' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
    onSubmit: async (v) => {
      await api.post('/business/expenses', { ...v, amount: Number(v.amount) });
      await load();
    },
  }));
}
main();
