import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDate, statusBadge, qs } from './utils.js';

async function loadDebts() {
  const data = await api.get('/business/debts');

  renderTable(qs('#debtsTableMount'), data.productDebts, [
    { key: 'reference', label: 'Ref' },
    { key: 'debtor_name', label: 'Customer' },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    { key: 'total_amount', label: 'Total', render: (r) => formatCurrency(r.total_amount) },
    { key: 'amount_paid', label: 'Paid', render: (r) => formatCurrency(r.amount_paid) },
    { key: 'balance', label: 'Remaining', render: (r) => formatCurrency(r.balance) },
    { key: 'due_date', label: 'Due', render: (r) => formatDate(r.due_date) },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
    { key: 'actions', label: '', render: (r) => r.status === 'PAID' ? '' : `<button class="btn btn-sm btn-outline" data-pay-debt="${r.id}" data-balance="${r.balance}" data-name="${r.debtor_name}">Record Payment</button>` },
  ], { emptyMessage: 'No outstanding customer/product debts.' });

  renderTable(qs('#salariesTableMount'), data.salaryDebts, [
    { key: 'debtor_name', label: 'Employee' },
    { key: 'description', label: 'Period', render: (r) => r.description },
    { key: 'total_amount', label: 'Salary', render: (r) => formatCurrency(r.total_amount) },
    { key: 'amount_paid', label: 'Paid', render: (r) => formatCurrency(r.amount_paid) },
    { key: 'balance', label: 'Remaining', render: (r) => formatCurrency(r.balance) },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
    { key: 'actions', label: '', render: (r) => `<button class="btn btn-sm btn-outline" data-pay-salary="${r.id}" data-balance="${r.balance}" data-name="${r.debtor_name}">Record Payment</button>` },
  ], { emptyMessage: 'No unpaid staff salaries — everyone is fully paid.' });

  // Delegate click handlers (table redraws on pagination, so bind on the mount, not the row).
  qs('#debtsTableMount').onclick = (e) => {
    const btn = e.target.closest('[data-pay-debt]');
    if (!btn) return;
    openFormModal({
      title: `Record Payment — ${btn.dataset.name}`,
      submitLabel: 'Record Payment',
      fields: [
        { name: 'amount', label: `Amount (Remaining: ${formatCurrency(btn.dataset.balance)})`, type: 'number', required: true },
        { name: 'paymentMethod', label: 'Payment Method', type: 'select', options: [{ value: 'CASH', label: 'Cash' }, { value: 'MOMO', label: 'Mobile Money' }, { value: 'BANK', label: 'Bank' }] },
      ],
      onSubmit: async (v) => { await api.post(`/business/debts/${btn.dataset.payDebt}/pay`, { amount: Number(v.amount), paymentMethod: v.paymentMethod }); await loadDebts(); },
    });
  };

  qs('#salariesTableMount').onclick = (e) => {
    const btn = e.target.closest('[data-pay-salary]');
    if (!btn) return;
    openFormModal({
      title: `Pay Salary — ${btn.dataset.name}`,
      submitLabel: 'Record Payment',
      fields: [{ name: 'amount', label: `Amount (Remaining: ${formatCurrency(btn.dataset.balance)})`, type: 'number', required: true }],
      onSubmit: async (v) => { await api.patch(`/business/salary-debts/${btn.dataset.paySalary}/pay`, { amount: Number(v.amount) }); await loadDebts(); },
    });
  };
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'debts' });

  qs('#pageActions').innerHTML = `<button id="addDebtBtn" class="btn btn-primary">Register a Debt</button>`;
  qs('#pageRoot').innerHTML = `
    <h2 style="margin-top:0;">Customer / Product Debts</h2>
    <div id="debtsTableMount" style="margin-bottom:36px;"></div>
    <h2>Unpaid Staff Salaries</h2>
    <div id="salariesTableMount"></div>`;
  await loadDebts();

  qs('#addDebtBtn').addEventListener('click', () => openFormModal({
    title: 'Register a Debt',
    submitLabel: 'Save Debt',
    fields: [
      { name: 'debtorName', label: 'Debtor / Customer Name', required: true },
      { name: 'debtorContact', label: 'Contact' },
      { name: 'description', label: 'Product / Service', full: true },
      { name: 'totalAmount', label: 'Total Amount (FCFA)', type: 'number', required: true },
      { name: 'amountPaid', label: 'Amount Already Paid (FCFA)', type: 'number' },
      { name: 'dueDate', label: 'Due Date', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
    onSubmit: async (v) => {
      await api.post('/business/debts', { ...v, totalAmount: Number(v.totalAmount), amountPaid: Number(v.amountPaid) || 0 });
      await loadDebts();
    },
  }));
}
main();
