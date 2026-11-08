import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, statusBadge } from '../utils.js';

let isAdmin = false; let rows = [];
const FIELDS = [{ name: 'name', label: 'Full name', required: true }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'idNumber', label: 'ID number' }, { name: 'address', label: 'Address', full: true }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }];
async function load() {
  rows = await api.get('/landlords');
  renderTable(qs('#tableMount'), rows, [
    { label: 'Landlord', render: (l) => `<strong>${escapeHtml(l.name)}</strong><div class="text-muted mono" style="font-size:.72rem">${escapeHtml(l.landlord_code)}</div>` },
    { label: 'Contact', render: (l) => `${escapeHtml(l.phone || '—')}<div class="text-muted" style="font-size:.78rem">${escapeHtml(l.email || '')}</div>` },
    { label: 'Properties', render: (l) => l.property_count }, { label: 'Units', render: (l) => l.unit_count }, { label: 'Tenants', render: (l) => l.tenant_count },
    { label: 'Rent collected', render: (l) => formatCurrency(l.revenue) }, { label: 'Expenses', render: (l) => formatCurrency(l.expenses) },
    { label: 'Net income', render: (l) => `<strong style="color:${l.net_income >= 0 ? 'var(--success-600)' : 'var(--danger-600)'}">${formatCurrency(l.net_income)}</strong>` },
    { label: '', render: (l) => (isAdmin ? `<button class="btn btn-sm btn-ghost" data-edit="${l.id}">Edit</button>` : '') },
  ], { emptyMessage: 'No landlords yet. Add the owners whose properties you manage.' });
}
async function main() {
  const profile = await initPortalLayout({ activeKey: 'landlords', title: 'Landlords / Owners', subtitle: 'Owners of the properties you manage, with their revenue, expenses and net income.' });
  isAdmin = profile.role === 'ADMIN';
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  if (isAdmin) {
    qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ Add landlord</button>';
    qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'Add landlord / owner', fields: FIELDS, onSubmit: async (v) => { await api.post('/landlords', v); await load(); } }));
    qs('#pageRoot').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (!b) return; const l = rows.find((x) => x.id === b.dataset.edit);
      openFormModal({ title: `Edit ${l.name}`, fields: FIELDS, initial: { ...l, idNumber: l.id_number }, onSubmit: async (v) => { await api.patch(`/landlords/${l.id}`, v); await load(); } }); });
  }
  await load();
}
main();
