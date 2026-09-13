import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, filterRows } from './crud-table.js';
import { formatCurrency, statusBadge, formatDateTime, debounce, qs, escapeHtml } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'registrations' });
  const [rows, categories, classes] = await Promise.all([
    api.get('/dashboard/registrations'),
    api.get('/academics/categories'),
    api.get('/academics/classes'),
  ]);

  qs('#pageRoot').innerHTML = `
    <div class="filters-bar">
      <div class="search-input-wrap"><input type="search" id="q" placeholder="Search student name…" /></div>
      <select id="catFilter"><option value="">All categories</option>${categories.map((c) => `<option value="${c.category_name || c.name}">${escapeHtml(c.name)}</option>`).join('')}</select>
      <select id="statusFilter"><option value="">All statuses</option>${['UNPAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'OVERPAID'].map((s) => `<option value="${s}">${s.replace('_', ' ')}</option>`).join('')}</select>
    </div>
    <div id="tableMount"></div>`;

  const columns = [
    { key: 'name', label: 'Student', render: (r) => `<a href="/admin/student-profile.html?id=${r.student_id}">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</a>` },
    { key: 'student_code', label: 'ID', render: (r) => `<span class="mono">${r.student_code}</span>` },
    { key: 'category_name', label: 'Category' },
    { key: 'class_name', label: 'Class' },
    { key: 'created_at', label: 'Registered', render: (r) => formatDateTime(r.created_at) },
    { key: 'total_amount', label: 'Total Fee', render: (r) => formatCurrency(r.total_amount) },
    { key: 'amount_paid', label: 'Paid', render: (r) => formatCurrency(r.amount_paid) },
    { key: 'balance', label: 'Balance', render: (r) => formatCurrency(r.balance) },
    { key: 'payment_status', label: 'Status', render: (r) => statusBadge(r.payment_status) },
  ];
  const table = renderTable(qs('#tableMount'), rows, columns);

  function applyFilters() {
    let filtered = rows;
    const cat = qs('#catFilter').value;
    const status = qs('#statusFilter').value;
    if (cat) filtered = filtered.filter((r) => r.category_name === cat);
    if (status) filtered = filtered.filter((r) => r.payment_status === status);
    filtered = filterRows(filtered, qs('#q').value, ['first_name', 'last_name', 'student_code']);
    table.redraw(filtered);
  }
  qs('#q').addEventListener('input', debounce(applyFilters, 250));
  qs('#catFilter').addEventListener('change', applyFilters);
  qs('#statusFilter').addEventListener('change', applyFilters);
}
main();
