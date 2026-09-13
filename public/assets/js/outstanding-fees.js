import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatCurrency, statusBadge, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'outstanding' });
  const rows = (await api.get('/dashboard/registrations')).filter((r) => r.payment_status === 'UNPAID' || r.payment_status === 'PARTIALLY_PAID');
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  renderTable(qs('#tableMount'), rows, [
    { key: 'name', label: 'Student', render: (r) => `<a href="/admin/student-profile.html?id=${r.student_id}">${r.first_name} ${r.last_name}</a>` },
    { key: 'category_name', label: 'Category' },
    { key: 'class_name', label: 'Class' },
    { key: 'total_amount', label: 'Total', render: (r) => formatCurrency(r.total_amount) },
    { key: 'amount_paid', label: 'Paid', render: (r) => formatCurrency(r.amount_paid) },
    { key: 'balance', label: 'Outstanding', render: (r) => formatCurrency(r.balance) },
    { key: 'payment_status', label: 'Status', render: (r) => statusBadge(r.payment_status) },
  ], { emptyMessage: 'No outstanding balances — everyone is fully paid.' });
}
main();
