import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal, confirmDialog } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, toast } from '../utils.js';

let profile; let rows = []; let table;
const state = { filter: 'EXPIRING', days: 60 };
async function load() {
  rows = await api.get(`/contracts${api.qs(state)}`);
  const cols = [
    { label: 'Tenant', render: (c) => `<a href="/admin/tenant-profile.html?id=${c.tenant_id}"><strong>${escapeHtml(c.tenant_name)}</strong></a><div class="text-muted mono" style="font-size:.72rem">${escapeHtml(c.contract_no)}</div>` },
    { label: 'Unit', render: (c) => `${escapeHtml(c.property_name)}<div class="text-muted" style="font-size:.78rem">House ${escapeHtml(c.house_no)} · Unit ${escapeHtml(c.unit_no)}</div>` },
    { label: 'Period', render: (c) => `${formatDate(c.start_date)} → ${formatDate(c.end_date)}` }, { label: 'Rent', render: (c) => formatCurrency(c.monthly_rent) },
    { label: 'Expires', render: (c) => (c.effective_status === 'ACTIVE' || c.effective_status === 'EXPIRED' ? (c.days_left < 0 ? `<span style="color:var(--danger-600)">${-c.days_left} days ago</span>` : `in ${c.days_left} days`) : '—') },
    { label: 'Terms', render: (c) => (c.accepted_version ? `<span class="badge badge-success">v${c.accepted_version} accepted</span>` : '<span class="badge badge-neutral">Not accepted</span>') },
    { label: 'Status', render: (c) => statusBadge(c.effective_status) },
    { label: '', render: (c) => (['ACTIVE', 'EXPIRED'].includes(c.effective_status) && c.tenant_status !== 'MOVED_OUT' ? `<button class="btn btn-sm btn-primary" data-renew="${c.id}">Renew</button> <button class="btn btn-sm btn-outline" data-remind="${c.id}">Remind</button>` : '') },
  ];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { emptyMessage: 'No contracts in this view.' });
}
async function main() {
  profile = await initPortalLayout({ activeKey: 'contracts', title: 'Contracts', subtitle: 'Track expiry, renew, and see who has accepted the terms.' });
  qs('#pageRoot').innerHTML = `<div class="chip-row" id="chips">${[['EXPIRING', 'Expiring soon'], ['EXPIRED', 'Expired (still living in)'], ['ACTIVE', 'Active'], ['ENDED', 'Ended'], ['ALL', 'All']].map(([v, l]) => `<button class="chip ${v === state.filter ? 'is-active' : ''}" data-f="${v}">${l}</button>`).join('')}
    <select id="fDays" style="width:auto"><option value="30">within 30 days</option><option value="60" selected>within 60 days</option><option value="90">within 90 days</option></select></div><div id="tableMount"></div>`;
  qs('#chips').addEventListener('click', (e) => { const c = e.target.closest('[data-f]'); if (!c) return; state.filter = c.dataset.f; qs('#chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c)); load(); });
  qs('#fDays').addEventListener('change', (e) => { state.days = Number(e.target.value); load(); });
  qs('#tableMount').addEventListener('click', async (e) => {
    const rn = e.target.closest('[data-renew]'); const rm = e.target.closest('[data-remind]');
    if (rn && profile.permissions.includes('contracts')) openFormModal({ title: 'Renew contract', intro: 'A new contract starts the day after this one ends. Rent stays the same.', fields: [{ name: 'months', label: 'Renewal length (months)', type: 'number', default: 12, min: 1, max: 120, required: true }, { name: 'noticePeriodDays', label: 'Notice period (days)', type: 'number', default: 30 }], submitLabel: 'Renew', onSubmit: async (v) => { await api.post(`/contracts/${rn.dataset.renew}/renew`, { months: Number(v.months), noticePeriodDays: Number(v.noticePeriodDays) || undefined }); toast('Contract renewed.', 'success'); await load(); } });
    if (rm && (await confirmDialog('Send the tenant a contract-expiry reminder?', { confirmLabel: 'Send' }))) { await api.post(`/contracts/${rm.dataset.remind}/remind`, {}); toast('Reminder sent to the tenant portal.', 'success'); }
  });
  await load();
}
main();
