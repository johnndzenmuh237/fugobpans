import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDateTime, toast, qs } from './utils.js';

async function load() {
  const rows = await api.get('/payments');
  renderTable(qs('#tableMount'), rows, [
    { key: 'receipt_number', label: 'Receipt #', render: (r) => `<span class="mono">${r.receipt_number || '—'}</span>` },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
    { key: 'method', label: 'Method', render: (r) => r.method.replace('_', ' ') },
    { key: 'paid_at', label: 'Date', render: (r) => formatDateTime(r.paid_at) },
  ]);
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'payments' });
  qs('#pageActions').innerHTML = `<button id="addBtn" class="btn btn-primary">Record Office Payment</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();

  qs('#addBtn').addEventListener('click', () => openFormModal({
    title: 'Record Office Payment (spec §26)',
    fields: [
      { name: 'invoiceId', label: 'Invoice ID', required: true, full: true },
      { name: 'amount', label: 'Amount (FCFA)', type: 'number', required: true },
      { name: 'method', label: 'Method', type: 'select', required: true, options: [{ value: 'OFFICE_CASH', label: 'Cash' }, { value: 'OFFICE_OTHER', label: 'Other' }] },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    onSubmit: async (v) => { await api.post('/payments/office', { ...v, amount: Number(v.amount) }); toast('Payment recorded.', 'success'); load(); },
  }));
}
main();
