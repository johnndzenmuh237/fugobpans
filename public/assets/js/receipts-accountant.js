import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatCurrency, formatDateTime, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'ACCOUNTANT', activeKey: 'receipts' });
  const payments = await api.get('/payments');
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  renderTable(qs('#tableMount'), payments, [
    { key: 'receipt_number', label: 'Receipt #', render: (r) => `<span class="mono">${r.receipt_number || '—'}</span>` },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
    { key: 'method', label: 'Method', render: (r) => r.method.replace('_', ' ') },
    { key: 'paid_at', label: 'Date', render: (r) => formatDateTime(r.paid_at) },
  ], { emptyMessage: 'No receipts issued yet.' });
}
main();
