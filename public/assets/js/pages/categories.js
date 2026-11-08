import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, statusBadge } from '../utils.js';

let isAdmin = false;
async function load() {
  const rows = await api.get('/categories?all=true');
  const draw = (mount, list, extraCol) => renderTable(qs(mount), list, [
    { label: 'Category', render: (c) => `<strong>${escapeHtml(c.name)}</strong>${c.description ? `<div class="text-muted" style="font-size:.78rem">${escapeHtml(c.description)}</div>` : ''}` },
    extraCol, { label: 'Status', render: (c) => statusBadge(c.status) },
    { label: '', render: (c) => (isAdmin ? `<button class="btn btn-sm btn-ghost" data-edit="${c.id}">Edit</button><button class="btn btn-sm btn-ghost" data-toggle="${c.id}">${c.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>` : '') },
  ], { pageSize: 30, emptyMessage: 'None yet.' });
  draw('#unitMount', rows.filter((c) => c.applies_to === 'UNIT'), { label: 'Units', render: (c) => c.unit_count });
  draw('#propMount', rows.filter((c) => c.applies_to === 'PROPERTY'), { label: 'Properties', render: (c) => c.property_count });
  qs('#pageRoot').onclick = async (e) => {
    const ed = e.target.closest('[data-edit]'); const tg = e.target.closest('[data-toggle]');
    if (tg) { const c = rows.find((x) => x.id === tg.dataset.toggle); await api.patch(`/categories/${c.id}`, { status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); await load(); }
    if (ed) { const c = rows.find((x) => x.id === ed.dataset.edit); openFormModal({ title: `Edit ${c.name}`, initial: { name: c.name, description: c.description, displayOrder: c.display_order }, fields: [{ name: 'name', label: 'Name', required: true }, { name: 'displayOrder', label: 'Display order', type: 'number' }, { name: 'description', label: 'Description', type: 'textarea', full: true }], onSubmit: async (v) => { await api.patch(`/categories/${c.id}`, { name: v.name, description: v.description, displayOrder: Number(v.displayOrder) || 0 }); await load(); } }); }
  };
}
async function main() {
  const profile = await initPortalLayout({ activeKey: 'categories', title: 'Categories', subtitle: 'House categories (1 Room, Studio, Apartment…) and property categories (Estate, Building plot…).' });
  isAdmin = profile.role === 'ADMIN';
  if (isAdmin) {
    qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ New category</button>';
    qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'New category', fields: [
      { name: 'appliesTo', label: 'Applies to', type: 'select', noBlank: true, options: [{ value: 'UNIT', label: 'Houses / units (rental category)' }, { value: 'PROPERTY', label: 'Properties & lands' }] },
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Studio, Duplex, Farm land' }, { name: 'displayOrder', label: 'Display order', type: 'number' }, { name: 'description', label: 'Description', type: 'textarea', full: true }],
      onSubmit: async (v) => { await api.post('/categories', { ...v, displayOrder: Number(v.displayOrder) || 0 }); await load(); } }));
  }
  qs('#pageRoot').innerHTML = '<h2 style="margin-top:0">House / unit categories</h2><div id="unitMount"></div><h2 style="margin-top:30px">Property & land categories</h2><div id="propMount"></div>';
  await load();
}
main();
