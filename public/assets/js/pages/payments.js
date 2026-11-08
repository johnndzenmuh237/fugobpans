import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, opts, debounce, METHOD_LABEL } from '../utils.js';
import { lookups, selectHtml } from './_common.js';

const state = { propertyId: '', status: 'SUCCESSFUL', type: '', from: '', to: '', q: '' };
let table;
async function load() {
  const rows = await api.get(`/payments${api.qs(state)}`);
  const cols = [
    { label: 'Date', render: (p) => formatDate(p.paid_at || p.created_at) },
    { label: 'Receipt', render: (p) => (p.receipt_number ? `<a class="mono" href="/admin/receipt.html?id=${p.id}">${escapeHtml(p.receipt_number)}</a>` : '—') },
    { label: 'Tenant', render: (p) => `<a href="/admin/tenant-profile.html?id=${p.tenant_id}">${escapeHtml(p.tenant_name)}</a>` },
    { label: 'Property / unit', render: (p) => `${escapeHtml(p.property_name)} · ${escapeHtml(p.house_no)}/${escapeHtml(p.unit_no)}` },
    { label: 'Type', render: (p) => escapeHtml(p.type) }, { label: 'Amount', render: (p) => `<strong>${formatCurrency(p.amount)}</strong>` }, { label: 'Months', render: (p) => p.months_covered ?? '—' },
    { label: 'Method', render: (p) => escapeHtml(METHOD_LABEL[p.method] || p.method) }, { label: 'Status', render: (p) => statusBadge(p.status) },
  ];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { pageSize: 20, emptyMessage: 'No payments match.' });
  qs('#total').textContent = `${rows.length} payments · ${formatCurrency(rows.filter((r) => r.status === 'SUCCESSFUL').reduce((s, r) => s + r.amount, 0))} confirmed`;
}
async function main() {
  await initPortalLayout({ activeKey: 'payments', perms: ['payments', 'finance'], title: 'Payments', subtitle: 'Every rent, deposit and other payment with its receipt.' });
  const props = await lookups.properties();
  qs('#pageRoot').innerHTML = `<div class="filters-bar">${selectHtml('fProp', 'Property', opts(props, 'id', 'name'))}
    <div><label style="font-size:.72rem;text-transform:uppercase;color:var(--slate-500);font-weight:700;display:block;margin-bottom:4px">Status</label><select id="fStatus"><option value="SUCCESSFUL">Confirmed</option><option value="PENDING">Pending</option><option value="FAILED">Rejected</option><option value="">All</option></select></div>
    ${selectHtml('fType', 'Type', [['RENT', 'Rent'], ['DEPOSIT', 'Deposit'], ['OTHER', 'Other']].map(([value, label]) => ({ value, label })))}
    <div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">FROM</label><input type="date" id="fFrom"/></div><div><label style="font-size:.72rem;font-weight:700;color:var(--slate-500);display:block;margin-bottom:4px">TO</label><input type="date" id="fTo"/></div>
    <div class="search-input-wrap" style="align-self:end"><input id="fQ" type="search" placeholder="Receipt, txn ID, tenant…"/></div><button class="btn btn-outline btn-sm" id="csvBtn" style="align-self:end">Export CSV</button></div>
    <div class="text-muted" id="total" style="margin-bottom:10px"></div><div id="tableMount"></div>`;
  const bind = (id, key) => qs(id).addEventListener('change', (e) => { state[key] = e.target.value; load(); });
  bind('#fProp', 'propertyId'); bind('#fStatus', 'status'); bind('#fType', 'type'); bind('#fFrom', 'from'); bind('#fTo', 'to');
  qs('#fQ').addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }));
  qs('#csvBtn').addEventListener('click', () => downloadFile(api.url(`/analytics/reports/collection${api.qs({ propertyId: state.propertyId, from: state.from, to: state.to, format: 'csv' })}`), 'rent-collection.csv'));
  await load();
}
main();
