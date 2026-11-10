import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal, confirmDialog } from '../crud-table.js';
import { qs, escapeHtml, formatDate, statusBadge, opts, toast } from '../utils.js';
import { lookups } from './_common.js';

let rows = []; let props = []; let cats = [];
const KINDS = [['NOTICE', 'General notice'], ['URGENT', 'Urgent'], ['PAYMENT', 'Payment / rent'], ['MAINTENANCE', 'Maintenance / works'], ['EVENT', 'Event / meeting']];

function form() {
  openFormModal({ title: 'Post an announcement', wide: true,
    intro: '<strong>Everyone</strong> announcements appear on the tenant dashboard for all visitors. <strong>House category</strong> or <strong>Property</strong> announcements only appear for the matching tenants once they enter their tracking code.',
    fields: [
      { name: 'audience', label: 'Who is it for?', type: 'select', noBlank: true, default: 'ALL', options: [{ value: 'ALL', label: 'Everyone (general announcement)' }, { value: 'CATEGORY', label: 'Tenants of one house category' }, { value: 'PROPERTY', label: 'Tenants of one property' }] },
      { name: 'kind', label: 'Type', type: 'select', noBlank: true, options: KINDS.map(([value, label]) => ({ value, label })) },
      { name: 'categoryId', label: 'House category (if targeted)', type: 'select', options: opts(cats, 'id', 'name') },
      { name: 'propertyId', label: 'Property (if targeted)', type: 'select', options: opts(props.filter((p) => p.kind !== 'LAND'), 'id', 'name') },
      { name: 'title', label: 'Title', required: true, full: true }, { name: 'body', label: 'Message', type: 'textarea', rows: 6, required: true, full: true },
      { name: 'expiresAt', label: 'Hide after (optional)', type: 'date' },
      { name: 'pinned', label: 'Pin', type: 'checkbox', checkLabel: 'Pin to the top' },
      { name: 'notifyTenants', label: 'Notify', type: 'checkbox', checkLabel: 'Also add to each tenant’s notifications' },
    ],
    submitLabel: 'Publish', onSubmit: async (v) => { await api.post('/announcements', v); toast('Announcement published.', 'success'); await load(); } });
}

async function load() {
  rows = await api.get('/announcements');
  renderTable(qs('#tableMount'), rows, [
    { label: 'Announcement', render: (a) => `<strong>${a.pinned ? ' ' : ''}${escapeHtml(a.title)}</strong><div class="text-muted" style="font-size:.8rem;max-width:380px">${escapeHtml(a.body.slice(0, 120))}${a.body.length > 120 ? '…' : ''}</div>` },
    { label: 'Audience', render: (a) => (a.audience === 'ALL' ? 'Everyone' : a.audience === 'CATEGORY' ? `Category: ${escapeHtml(a.category_name)}` : `Property: ${escapeHtml(a.property_name)}`) },
    { label: 'Reaches', render: (a) => `${a.recipients} tenant(s)` }, { label: 'Type', render: (a) => statusBadge(a.kind) },
    { label: 'Posted', render: (a) => `${formatDate(a.created_at)}<div class="text-muted" style="font-size:.76rem">${escapeHtml(a.posted_by_name || '')}</div>` }, { label: 'Status', render: (a) => statusBadge(a.status) },
    { label: '', render: (a) => `<button class="btn btn-sm btn-outline" data-toggle="${a.id}">${a.status === 'ACTIVE' ? 'Archive' : 'Restore'}</button>` },
  ], { emptyMessage: 'Nothing posted yet.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'announcements', title: 'Announcements', subtitle: 'Post notices to every tenant, or only to one house category or property.' });
  [props, cats] = await Promise.all([lookups.properties(), lookups.unitCategories()]);
  qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ New announcement</button> <a class="btn btn-outline" href="/tenant-portal.html" target="_blank" rel="noopener">View tenant dashboard</a>';
  qs('#addBtn').addEventListener('click', form);
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  qs('#tableMount').addEventListener('click', async (e) => { const b = e.target.closest('[data-toggle]'); if (!b) return; const a = rows.find((x) => x.id === b.dataset.toggle);
    if (await confirmDialog(`${a.status === 'ACTIVE' ? 'Archive' : 'Restore'} “${a.title}”?`)) { await api.patch(`/announcements/${a.id}/status`, { status: a.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' }); await load(); } });
  await load();
}
main();
