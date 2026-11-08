import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatDate, statusBadge, opts, toast } from '../utils.js';
import { lookups } from './_common.js';

const PERMS = [['properties', 'Manage properties & units'], ['tenants', 'Manage tenants'], ['contracts', 'Manage contracts'], ['payments', 'Confirm / record payments'], ['maintenance', 'Manage maintenance'], ['finance', 'View financial reports & expenses'], ['announcements', 'Post announcements & reviews'], ['analytics', 'View AI analytics']];
let rows = []; let props = [];
async function load() {
  rows = await api.get('/users');
  renderTable(qs('#tableMount'), rows, [
    { label: 'User', render: (u) => `<strong>${escapeHtml(u.name)}</strong><div class="text-muted" style="font-size:.78rem">${escapeHtml(u.email)}${u.phone ? ` · ${escapeHtml(u.phone)}` : ''}</div>` }, { label: 'Role', render: (u) => escapeHtml(u.role) },
    { label: 'Properties', render: (u) => (u.role === 'MANAGER' ? (u.properties.map((p) => escapeHtml(p.name)).join(', ') || '<span class="text-muted">None assigned</span>') : 'All') },
    { label: 'Permissions', render: (u) => (u.role === 'MANAGER' ? escapeHtml(u.permissions.join(', ') || 'none') : u.role === 'ADMIN' ? 'Everything' : 'Payments, finance, analytics') },
    { label: 'Status', render: (u) => statusBadge(u.status) }, { label: 'Since', render: (u) => formatDate(u.created_at) }, { label: '', render: (u) => `<button class="btn btn-sm btn-outline" data-edit="${u.id}">Edit</button>` },
  ], { emptyMessage: 'No users.' });
}
const propOptions = () => props.filter((p) => p.kind !== 'LAND' || true).map((p) => ({ value: p.id, label: p.name }));
async function main() {
  await initPortalLayout({ activeKey: 'users', title: 'Managers & Staff', subtitle: 'Create managers, choose exactly what each may do, and assign their properties.' });
  props = await lookups.properties();
  qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ Add user</button>';
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'Add a user', wide: true, intro: 'They must change this temporary password the first time they sign in.', fields: [
    { name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Email (login)', type: 'email', required: true }, { name: 'phone', label: 'Phone' }, { name: 'password', label: 'Temporary password', type: 'text', required: true, minlength: 8 },
    { name: 'role', label: 'Role', type: 'select', noBlank: true, default: 'MANAGER', options: [{ value: 'MANAGER', label: 'Manager (permissions + assigned properties)' }, { value: 'ACCOUNTANT', label: 'Accountant (payments & finance)' }, { value: 'ADMIN', label: 'Administrator (everything)' }], help: 'Permissions and properties below only apply to Managers.' },
    { name: 'permissions', label: 'Manager permissions', type: 'checks', full: true, options: PERMS.map(([value, label]) => ({ value, label })) }, { name: 'propertyIds', label: 'Assigned properties', type: 'checks', full: true, options: propOptions() }],
    onSubmit: async (v) => { await api.post('/users', v); toast('User created.', 'success'); await load(); } }));
  qs('#tableMount').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (!b) return; const u = rows.find((x) => x.id === b.dataset.edit);
    openFormModal({ title: `Edit ${u.name}`, wide: true, initial: { name: u.name, phone: u.phone, status: u.status, permissions: u.permissions, propertyIds: u.properties.map((p) => p.id) },
      fields: [{ name: 'name', label: 'Full name', required: true }, { name: 'phone', label: 'Phone' }, { name: 'status', label: 'Account', type: 'select', noBlank: true, options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended (cannot sign in)' }] }, { name: 'newPassword', label: 'Reset password (optional)', help: 'They must change it at next sign-in.' },
        ...(u.role === 'MANAGER' ? [{ name: 'permissions', label: 'Permissions', type: 'checks', full: true, options: PERMS.map(([value, label]) => ({ value, label })) }, { name: 'propertyIds', label: 'Assigned properties', type: 'checks', full: true, options: propOptions() }] : [])],
      onSubmit: async (v) => { await api.patch(`/users/${u.id}`, v); toast('Saved.', 'success'); await load(); } }); });
  await load();
}
main();
