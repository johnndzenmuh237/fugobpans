import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatDateTime, statusBadge } from '../utils.js';

const INTEREST = { RENT: 'Wants to rent', BUY: 'Wants to buy', VISIT: 'Visit request', GENERAL: 'General' };
let rows = [];
async function load() {
  const status = qs('#fStatus').value;
  rows = await api.get(`/inquiries${api.qs({ status })}`);
  renderTable(qs('#tableMount'), rows, [
    { label: 'Received', render: (r) => formatDateTime(r.created_at) },
    { label: 'Name', render: (r) => `<strong>${escapeHtml(r.name)}</strong><div><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a>${r.email ? ` · ${escapeHtml(r.email)}` : ''}</div>` },
    { label: 'Interest', render: (r) => escapeHtml(INTEREST[r.interest]) }, { label: 'Property', render: (r) => escapeHtml(r.property_name || 'General') },
    { label: 'Message', render: (r) => `<span style="max-width:280px;display:inline-block">${escapeHtml(r.message || '—')}</span>${r.staff_note ? `<div class="text-muted" style="font-size:.78rem">Note: ${escapeHtml(r.staff_note)}</div>` : ''}` },
    { label: 'Status', render: (r) => statusBadge(r.status) }, { label: '', render: (r) => `<button class="btn btn-sm btn-outline" data-upd="${r.id}">Update</button>` },
  ], { emptyMessage: 'No enquiries yet. They arrive from the public website.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'inquiries', title: 'Enquiries', subtitle: 'People who asked about renting, buying or visiting a property on the public website.' });
  qs('#pageRoot').innerHTML = '<div class="filters-bar"><select id="fStatus"><option value="">All</option><option value="NEW">New</option><option value="CONTACTED">Contacted</option><option value="CLOSED">Closed</option></select></div><div id="tableMount"></div>';
  qs('#fStatus').addEventListener('change', load);
  qs('#tableMount').addEventListener('click', (e) => { const b = e.target.closest('[data-upd]'); if (!b) return; const r = rows.find((x) => x.id === b.dataset.upd);
    openFormModal({ title: `Enquiry from ${r.name}`, initial: { status: r.status, staffNote: r.staff_note }, fields: [{ name: 'status', label: 'Status', type: 'select', noBlank: true, options: [{ value: 'NEW', label: 'New' }, { value: 'CONTACTED', label: 'Contacted' }, { value: 'CLOSED', label: 'Closed' }] }, { name: 'staffNote', label: 'Internal note', type: 'textarea', full: true }], onSubmit: async (v) => { await api.patch(`/inquiries/${r.id}`, v); await load(); } }); });
  await load();
}
main();
